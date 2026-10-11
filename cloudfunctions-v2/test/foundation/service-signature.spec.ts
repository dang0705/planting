import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import type {
  Mysql2QueryConnection,
  SqlParameter
} from '../../src/foundation/database/mysql2-connection-source.js'
import {
  SERVICE_SCOPE_ALLOWLIST,
  ServiceNonceStoreUnavailableError,
  ServiceSignatureRejectedError,
  claimServiceNonce,
  verifyServiceSignature,
  type ServiceSigningKey
} from '../../src/foundation/http/service-signature.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：
 * - `docs/backend-v2/contracts/principal-and-capability.md` §1：cloudbase_agent 服务主体只拥有
 *   六个 scope；`identity.trial-anchor.read` 只授予 subscription；每次签名只能声明一个精确 scope，
 *   且必须属于该服务白名单并等于路由登记的 requiredScope。
 * - `docs/backend-v2/contracts/http-api.md` §5：HMAC-SHA-256，九段规范明文以 `\n` 连接
 *   （合同版本、服务名、key_id、十进制 UTC 秒、nonce、大写方法、规范化路径、原始正文 SHA-256、唯一 scope），
 *   base64url 签名；时钟窗口取 V2_SERVICE_SIGNATURE_*；`(service_name, nonce_hash)` 原子占用，
 *   任何失败统一 PRINCIPAL_INVALID。
 *
 * 测试层次：unit_fake。真实经过：签名校验纯逻辑与 nonce 占用 SQL 组装；
 * 替换边界：密钥解析器（内存密钥）、MySQL 连接（记录 SQL 的内存假连接）。
 * 未覆盖：真实 MySQL 唯一约束（由 test/e2e/identity-trial-anchor.mysql.spec.ts 覆盖）、CloudBase 部署。
 */

const agentKeyId = 'agent-test-k1'
const subscriptionKeyId = 'subscription-test-k1'
const agentSecret = Buffer.from('isolated-agent-signature-test-secret', 'utf8')
const subscriptionSecret = Buffer.from('isolated-subscription-signature-test-secret', 'utf8')
const nowMs = Date.UTC(2026, 9, 11, 8, 0, 0)
const clockSkewSeconds = 300
const nonceTtlSeconds = 600
const millisecondsPerSecond = 1000

/** 测试用密钥登记：每个 key_id 只绑定一个服务主体。 */
const signingKeys: Record<string, ServiceSigningKey> = {
  [agentKeyId]: { serviceName: 'cloudbase_agent', key: agentSecret },
  [subscriptionKeyId]: { serviceName: 'subscription', key: subscriptionSecret }
}

/** 测试签名请求的可变部分；未给出的字段使用合法默认值。 */
type SignOptions = {
  readonly serviceName?: string
  readonly keyId?: string
  readonly secret?: Buffer
  readonly timestampSeconds?: number
  readonly nonce?: string
  readonly method?: string
  readonly target?: string
  readonly body?: string
  readonly signedBody?: string
  readonly scope?: string
}

/** 按 http-api/v1 §5 独立构造签名请求头，不调用被测模块的任何函数。 */
function signedRawHeaders(options: SignOptions = {}): string[] {
  const serviceName = options.serviceName ?? 'cloudbase_agent'
  const keyId = options.keyId ?? agentKeyId
  const secret = options.secret ?? agentSecret
  const timestamp = String(options.timestampSeconds ?? Math.floor(nowMs / millisecondsPerSecond))
  const nonce = options.nonce ?? 'agent-nonce-00000001'
  const bodyHash = createHash('sha256')
    .update(options.signedBody ?? options.body ?? '')
    .digest('hex')
  const scope = options.scope ?? 'subscription.ai-quota.reserve'
  const canonical = [
    'http-api/v1',
    serviceName,
    keyId,
    timestamp,
    nonce,
    options.method ?? 'POST',
    options.target ?? '/api/v2/internal/subscription/ai-quota/reservations',
    bodyHash,
    scope
  ].join('\n')
  return [
    'X-QHZ-Key-Id',
    keyId,
    'X-QHZ-Timestamp',
    timestamp,
    'X-QHZ-Nonce',
    nonce,
    'X-QHZ-Body-Sha256',
    bodyHash,
    'X-QHZ-Scope',
    scope,
    'X-QHZ-Signature',
    createHmac('sha256', secret).update(canonical).digest('base64url')
  ]
}

/** 验签依赖：内存密钥解析与固定时钟。 */
const dependencies = {
  resolveServiceSigningKey: async (keyId: string) => signingKeys[keyId] ?? null,
  now: () => nowMs,
  clockSkewSeconds
}

/** 以默认合法的小青预占请求调用被测验签函数。 */
async function verify(
  rawHeaders: string[],
  overrides: { body?: string; requiredScope?: string; method?: string; target?: string } = {}
) {
  return verifyServiceSignature(
    {
      method: overrides.method ?? 'POST',
      canonicalTarget: overrides.target ?? '/api/v2/internal/subscription/ai-quota/reservations',
      rawHeaders,
      rawBody: Buffer.from(overrides.body ?? '', 'utf8')
    },
    (overrides.requiredScope ?? 'subscription.ai-quota.reserve') as never,
    dependencies
  )
}

describe('cloudbase_agent 服务主体 scope 白名单', () => {
  test('白名单与 principal-and-capability 合同第 1 节逐项一致且不含试用锚点', () => {
    const contract = fs.readFileSync(
      path.join(findProjectRoot(), 'docs/backend-v2/contracts/principal-and-capability.md'),
      'utf8'
    )
    const agentLine =
      contract.split('\n').find(line => line.includes("service: 'cloudbase_agent'")) ?? ''
    const scopeSegment = (agentLine.split('scopes: Array<')[1] ?? '').split('>')[0] ?? ''
    const contractScopes = [...scopeSegment.matchAll(/'([^']+)'/gu)].map(match => match[1])
    expect(contractScopes).toHaveLength(6)
    expect([...SERVICE_SCOPE_ALLOWLIST.cloudbase_agent].sort()).toEqual([...contractScopes].sort())
    expect(SERVICE_SCOPE_ALLOWLIST.cloudbase_agent).not.toContain('identity.trial-anchor.read')
    expect(SERVICE_SCOPE_ALLOWLIST.subscription).toEqual(['identity.trial-anchor.read'])
  })
})

describe('内部服务签名校验（POST 正文摘要）', () => {
  test('正常路径：小青签名的预占请求解析为 cloudbase_agent 服务主体', async () => {
    const body = '{"productActionId":"act_00000001"}'
    const verified = await verify(signedRawHeaders({ body }), { body })
    expect(verified).toEqual({
      serviceName: 'cloudbase_agent',
      keyId: agentKeyId,
      scope: 'subscription.ai-quota.reserve',
      bodySha256: createHash('sha256').update(body).digest('hex'),
      nonceHash: createHash('sha256').update('agent-nonce-00000001').digest('hex'),
      requestTimestampMs: Math.floor(nowMs / millisecondsPerSecond) * millisecondsPerSecond,
      verifiedAtMs: nowMs
    })
  })

  test('正常路径：小青 GET 用户植物上下文使用空正文摘要', async () => {
    const target = '/api/v2/internal/user-plants/up_00000001abcd/agent-context'
    const verified = await verify(
      signedRawHeaders({ method: 'GET', target, scope: 'user-plant.agent-context.read' }),
      { method: 'GET', target, requiredScope: 'user-plant.agent-context.read' }
    )
    expect(verified.serviceName).toBe('cloudbase_agent')
    expect(verified.scope).toBe('user-plant.agent-context.read')
  })

  test('错误 scope：小青即使正确签名 identity.trial-anchor.read 也被拒绝', async () => {
    const target = '/api/v2/internal/identity/users/usr_00000001/trial-anchor'
    await expect(
      verify(signedRawHeaders({ method: 'GET', target, scope: 'identity.trial-anchor.read' }), {
        method: 'GET',
        target,
        requiredScope: 'identity.trial-anchor.read'
      })
    ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
  })

  test('错误 scope：签名 scope 与路由 requiredScope 不等时拒绝', async () => {
    await expect(
      verify(signedRawHeaders({ scope: 'subscription.ai-quota.settle' }))
    ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
  })

  test('错误 scope：多个 scope、通配 scope 一律拒绝', async () => {
    for (const scope of [
      'subscription.ai-quota.reserve subscription.ai-quota.settle',
      'ALL_SCOPES'
    ]) {
      await expect(
        verify(signedRawHeaders({ scope }), { requiredScope: scope })
      ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    }
  })

  test('subscription 服务主体仍可签名 identity.trial-anchor.read', async () => {
    const target = '/api/v2/internal/identity/users/usr_00000001/trial-anchor'
    const verified = await verify(
      signedRawHeaders({
        serviceName: 'subscription',
        keyId: subscriptionKeyId,
        secret: subscriptionSecret,
        method: 'GET',
        target,
        scope: 'identity.trial-anchor.read'
      }),
      { method: 'GET', target, requiredScope: 'identity.trial-anchor.read' }
    )
    expect(verified.serviceName).toBe('subscription')
  })

  test('签名错误：正文被篡改、签名被改、密钥不属于该服务时拒绝', async () => {
    const body = '{"productActionId":"act_00000001"}'
    await expect(
      verify(signedRawHeaders({ body }), { body: '{"productActionId":"act_99999999"}' })
    ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    const tampered = signedRawHeaders()
    tampered[11] = createHmac('sha256', Buffer.from('other-secret')).update('x').digest('base64url')
    await expect(verify(tampered)).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    await expect(
      verify(signedRawHeaders({ serviceName: 'subscription', keyId: agentKeyId }))
    ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    await expect(verify(signedRawHeaders({ keyId: 'unknown-key' }))).rejects.toBeInstanceOf(
      ServiceSignatureRejectedError
    )
  })

  test('签名错误：方法或路径与签名不一致时拒绝', async () => {
    await expect(verify(signedRawHeaders(), { method: 'GET' })).rejects.toBeInstanceOf(
      ServiceSignatureRejectedError
    )
    await expect(
      verify(signedRawHeaders(), {
        target: '/api/v2/internal/subscription/ai-quota/reservations/x/releases'
      })
    ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
  })

  test('时钟偏差：超出 V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS 窗口拒绝，边界值通过', async () => {
    const nowSeconds = Math.floor(nowMs / millisecondsPerSecond)
    await expect(
      verify(signedRawHeaders({ timestampSeconds: nowSeconds - clockSkewSeconds - 1 }))
    ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    await expect(
      verify(signedRawHeaders({ timestampSeconds: nowSeconds + clockSkewSeconds + 1 }))
    ).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    await expect(
      verify(signedRawHeaders({ timestampSeconds: nowSeconds - clockSkewSeconds }))
    ).resolves.toMatchObject({
      serviceName: 'cloudbase_agent'
    })
  })

  test('非法输入：缺失、重复（大小写变体）或格式非法的签名头拒绝', async () => {
    const missing = signedRawHeaders().slice(0, 10)
    await expect(verify(missing)).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    const duplicated = [...signedRawHeaders(), 'x-qhz-nonce', 'agent-nonce-00000002']
    await expect(verify(duplicated)).rejects.toBeInstanceOf(ServiceSignatureRejectedError)
    await expect(verify(signedRawHeaders({ nonce: 'short' }))).rejects.toBeInstanceOf(
      ServiceSignatureRejectedError
    )
  })

  test('脱敏：拒绝错误不携带密钥、签名或 nonce 原文', async () => {
    const headers = signedRawHeaders({ scope: 'subscription.ai-quota.settle' })
    const failure = await verify(headers).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ServiceSignatureRejectedError)
    const text = `${String(failure)} ${JSON.stringify(failure)}`
    expect(text).not.toContain(headers[11])
    expect(text).not.toContain('agent-nonce-00000001')
    expect(text).not.toContain(agentSecret.toString('utf8'))
  })
})

/** 记录 nonce 占用 SQL 的内存假连接。 */
function fakeNonceSource(failure?: unknown) {
  const executed: Array<{ sql: string; parameters: readonly SqlParameter[] }> = []
  const lifecycle = { released: 0, destroyed: 0 }
  const connection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => {
      lifecycle.released += 1
    },
    destroy: () => {
      lifecycle.destroyed += 1
    },
    query: async () => [],
    execute: async (sql: string, parameters: readonly SqlParameter[]) => {
      executed.push({ sql, parameters })
      if (failure !== undefined) {
        throw failure
      }
      return { affectedRows: 1, insertId: 0 }
    }
  } satisfies Mysql2QueryConnection
  return { source: { getConnection: async () => connection }, executed, lifecycle }
}

describe('nonce 防重放占用', () => {
  const verified = {
    serviceName: 'cloudbase_agent' as const,
    keyId: agentKeyId,
    scope: 'subscription.ai-quota.reserve' as const,
    bodySha256: createHash('sha256').update('{}').digest('hex'),
    nonceHash: createHash('sha256').update('agent-nonce-00000001').digest('hex'),
    requestTimestampMs: nowMs,
    verifiedAtMs: nowMs
  }

  test('首次占用写入服务名、scope、正文摘要与至少 nonce 保留期的到期时刻', async () => {
    const fake = fakeNonceSource()
    await claimServiceNonce(fake.source, verified, nonceTtlSeconds)
    expect(fake.executed).toHaveLength(1)
    expect(fake.executed[0]?.sql).toContain('INSERT INTO service_replay_nonces')
    const parameters = fake.executed[0]?.parameters ?? []
    expect(parameters).toContain('cloudbase_agent')
    expect(parameters).toContain('subscription.ai-quota.reserve')
    expect(parameters).toContain(verified.bodySha256)
    expect(parameters).toContain(verified.nonceHash)
    expect(parameters).toContain(nowMs + nonceTtlSeconds * millisecondsPerSecond)
    expect(parameters).not.toContain('agent-nonce-00000001')
    expect(fake.lifecycle.released).toBe(1)
  })

  test('重放：唯一约束冲突按签名无效拒绝并销毁连接', async () => {
    const fake = fakeNonceSource({ code: 'ER_DUP_ENTRY' })
    await expect(claimServiceNonce(fake.source, verified, nonceTtlSeconds)).rejects.toBeInstanceOf(
      ServiceSignatureRejectedError
    )
    expect(fake.lifecycle.destroyed).toBe(1)
  })

  test('失败恢复：nonce 存储不可用时失败关闭为服务不可用', async () => {
    const fake = fakeNonceSource(new Error('connection lost'))
    await expect(claimServiceNonce(fake.source, verified, nonceTtlSeconds)).rejects.toBeInstanceOf(
      ServiceNonceStoreUnavailableError
    )
    expect(fake.lifecycle.destroyed).toBe(1)
  })
})
