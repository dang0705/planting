import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'
import { createMysqlPublishedFirstUsePolicyReader } from '../../src/subscription/repository/mysql-published-first-use-policy-reader.js'
import { createMysqlPublishedProfileWritePolicyReader } from '../../src/user-plant/repository/mysql-published-profile-write-policy-reader.js'
import { findProjectRoot } from '../support/project-root.js'

const containerName = `qhz-v2-first-use-policies-${process.pid}`
const databaseName = 'qinghuazhi_v2_first_use_policies'
const registeredAtMs = Date.parse('2026-09-27T08:00:00.000Z')
const nowMs = Date.parse('2026-09-27T12:00:00.000Z')
const oneDayMs = 86_400_000

/** 隔离容器命令失败时保留错误，不触碰本机或 CloudBase 现有数据库。 */
function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input })
  if (result.status !== 0) {
    throw new Error(`隔离 MySQL 未就绪：${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/** 仅在测试容器内执行建库和已冻结的 v2 策略表 DDL。 */
function mysql(sql: string, database?: string): string {
  return docker(
    [
      'exec',
      '-i',
      containerName,
      'mysql',
      '--no-defaults',
      '-uroot',
      ...(database ? [database] : [])
    ],
    sql
  )
}

/** 等待 Docker 分配的 MySQL 服务可查询。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      'docker',
      ['exec', containerName, 'mysql', '--no-defaults', '-uroot', '-N', '-e', 'SELECT 1'],
      { encoding: 'utf8' }
    )
    if (probe.status === 0 && probe.stdout.trim() === '1') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('隔离 MySQL 启动超时')
}

type PolicyFixture = {
  /** 类型化策略代码，不接受任意键值。 */
  readonly code: 'trial_eligibility' | 'user_plant_limit'
  /** 不可变发布引用。 */
  readonly releaseRef: string
  /** 不可变发布版本。 */
  readonly version: string
  /** 已发布状态；注册历史可引用 retired 版本。 */
  readonly status: 'active' | 'retired'
  /** 注册时或当前时刻的生效边界。 */
  readonly effectiveAtMs: number
  /** 经类型化 Schema 校验的最小策略正文。 */
  readonly document:
    | { readonly durationHours: number }
    | {
        readonly appliesToTiers: readonly ['free', 'trial']
        readonly activeUserPlantLimit: number
      }
  /** 是否设置活动指针；历史版本不应有活动指针。 */
  readonly active: boolean
  /** 可故意破坏摘要，以证明不可信发布失败关闭。 */
  readonly corruptHash?: boolean
}

/** 用参数化 SQL 写入本地已发布策略夹具，避免拼接正文。 */
async function publishPolicy(
  source: ReturnType<typeof createMysql2ConnectionSource>,
  fixture: PolicyFixture
): Promise<void> {
  const contentSha256 = fixture.corruptHash
    ? '0'.repeat(64)
    : calculateCanonicalJsonSha256(fixture.document)
  const connection = await source.getConnection()
  try {
    await connection.execute(
      `INSERT INTO business_policy_releases
         (_openid, release_ref, domain_code, policy_code, schema_version, release_version,
          content_sha256, policy_json, status, effective_at_ms, expires_at_ms,
          verified_at_ms, created_at_ms, updated_at_ms)
       VALUES ('', ?, 'subscription', ?, ?, ?, ?, CAST(? AS JSON), ?, ?, NULL, ?, ?, ?)`,
      [
        fixture.releaseRef,
        fixture.code,
        fixture.code === 'trial_eligibility'
          ? 'subscription-trial-eligibility/v1'
          : 'subscription-user-plant-limit/v1',
        fixture.version,
        contentSha256,
        JSON.stringify(fixture.document),
        fixture.status,
        fixture.effectiveAtMs,
        fixture.effectiveAtMs,
        fixture.effectiveAtMs,
        fixture.effectiveAtMs
      ]
    )
    if (fixture.active) {
      await connection.execute(
        `INSERT INTO active_business_policy_releases
           (_openid, domain_code, policy_code, release_internal_id, active_release_version,
            active_content_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
         SELECT '', domain_code, policy_code, id, release_version, content_sha256, 1, ?, ?, ?
         FROM business_policy_releases WHERE release_ref = ?`,
        [fixture.effectiveAtMs, fixture.effectiveAtMs, fixture.effectiveAtMs, fixture.releaseRef]
      )
    }
  } finally {
    connection.release()
  }
}

/**
 * Expected：冻结的 principal-and-capability §3 要求注册时历史试用策略与当前植物上限
 * 分开读取；配置目录锁定 24 小时与免费 1 株。L3/unit_real_data 经过真实 MySQL
 * 发布表、活动指针和读取器；替换的只有发布操作本身，未验证 CloudBase 网络或入口接线。
 */
describe('首次使用能力策略的真实 MySQL 读取', () => {
  let source: ReturnType<typeof createMysql2ConnectionSource>

  beforeAll(async () => {
    docker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--tmpfs',
      '/var/lib/mysql',
      '--publish',
      '127.0.0.1::3306',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      'mysql:8.4'
    ])
    await waitForMysql()
    mysql(`CREATE DATABASE \`${databaseName}\`;`)
    const ddl = fs.readFileSync(
      path.join(findProjectRoot(), 'docs/backend-v2/schema/007_configuration.sql'),
      'utf8'
    )
    mysql(ddl, databaseName)
    const portOutput = docker(['port', containerName, '3306/tcp'])
    const port = Number(portOutput.split(':').at(-1))
    if (!Number.isSafeInteger(port) || port <= 0) {
      throw new Error(`隔离 MySQL 端口无效：${portOutput}`)
    }
    source = createMysql2ConnectionSource({
      host: '127.0.0.1',
      port,
      database: databaseName,
      user: 'root',
      password: ''
    })
    let hostReady = false
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const probe = await source.getConnection()
        probe.release()
        hostReady = true
        break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250))
      }
    }
    if (!hostReady) {
      throw new Error(`隔离 MySQL 端口 ${port} 未在限定时间内对本机就绪`)
    }
  }, 30_000)

  afterAll(() => {
    spawnSync('docker', ['stop', containerName], { encoding: 'utf8' })
  })

  beforeEach(async () => {
    const connection = await source.getConnection()
    try {
      await connection.execute('DELETE FROM active_business_policy_releases', [])
      await connection.execute('DELETE FROM business_policy_releases', [])
    } finally {
      connection.release()
    }
  })

  test('注册时读取当时已发布试用版本，当前读取活动植物上限', async () => {
    await publishPolicy(source, {
      code: 'trial_eligibility',
      releaseRef: 'bpr_trial_older_0001',
      version: 'trial/2026-09-26',
      status: 'retired',
      effectiveAtMs: registeredAtMs - oneDayMs,
      document: { durationHours: 24 },
      active: false
    })
    await publishPolicy(source, {
      code: 'trial_eligibility',
      releaseRef: 'bpr_trial_newer_0001',
      version: 'trial/2026-09-27',
      status: 'active',
      effectiveAtMs: registeredAtMs + 60_000,
      document: { durationHours: 48 },
      active: true
    })
    await publishPolicy(source, {
      code: 'user_plant_limit',
      releaseRef: 'bpr_plant_limit_0001',
      version: 'plant-limit/2026-09-27',
      status: 'active',
      effectiveAtMs: registeredAtMs - oneDayMs,
      document: { appliesToTiers: ['free', 'trial'], activeUserPlantLimit: 1 },
      active: true
    })

    const reader = createMysqlPublishedFirstUsePolicyReader(source, () => nowMs)
    expect(await reader.readTrialEligibilityPolicy(registeredAtMs)).toMatchObject({
      sourceRef: 'bpr_trial_older_0001',
      releaseVersion: 'trial/2026-09-26',
      durationHours: 24,
      status: 'retired'
    })
    expect(await reader.readUserPlantLimitPolicy('trial')).toMatchObject({
      sourceRef: 'bpr_plant_limit_0001',
      releaseVersion: 'plant-limit/2026-09-27',
      appliesToTiers: ['free', 'trial'],
      activeUserPlantLimit: 1
    })
  })

  test('未发布策略和摘要损坏均不返回可用策略', async () => {
    const reader = createMysqlPublishedFirstUsePolicyReader(source, () => nowMs)
    expect(await reader.readTrialEligibilityPolicy(registeredAtMs - 2 * oneDayMs)).toBeNull()
    await publishPolicy(source, {
      code: 'user_plant_limit',
      releaseRef: 'bpr_plant_limit_good_0001',
      version: 'plant-limit/2026-09-27',
      status: 'active',
      effectiveAtMs: registeredAtMs - oneDayMs,
      document: { appliesToTiers: ['free', 'trial'], activeUserPlantLimit: 1 },
      active: true
    })
    await publishPolicy(source, {
      code: 'user_plant_limit',
      releaseRef: 'bpr_plant_limit_bad_0001',
      version: 'plant-limit/2026-09-28',
      status: 'active',
      effectiveAtMs: registeredAtMs,
      document: { appliesToTiers: ['free', 'trial'], activeUserPlantLimit: 1 },
      active: false,
      corruptHash: true
    })
    const connection = await source.getConnection()
    try {
      await connection.execute(
        `UPDATE active_business_policy_releases AS active_policy
         JOIN business_policy_releases AS release_row
           ON release_row.release_ref = 'bpr_plant_limit_bad_0001'
         SET active_policy.release_internal_id = release_row.id,
             active_policy.active_release_version = release_row.release_version,
             active_policy.active_content_sha256 = release_row.content_sha256
         WHERE active_policy.domain_code = 'subscription'
           AND active_policy.policy_code = 'user_plant_limit'`,
        []
      )
    } finally {
      connection.release()
    }
    expect(await reader.readUserPlantLimitPolicy('free')).toBeNull()
  })

  /** Expected来源：本轮冻结的两份活动发布正文；真实MySQL/指针/摘要准入，不验证CloudBase或正式策略发布。 */
  const profilePolicy = {
    profileVersion: 'user-plant-profile/v1',
    requiredFields: [
      'identityStatus',
      'pot',
      'location',
      'lightingEnvironment',
      'ventilationEnvironment'
    ],
    acceptedIdentityStates: ['unidentified', 'candidate_pending', 'confirmed'],
    rewardOncePerUser: true
  }
  const httpPolicy = { jsonBodyLimitBytes: 1048576, idempotencyRetentionHours: 168 }

  /** 仅测试发布夹具的参数化SQL入口，绝不写本机或CloudBase已有数据库。 */
  async function publishProfileWritePolicies(includeHttp = true): Promise<void> {
    const connection = await source.getConnection()
    try {
      for (const fixture of [
        {
          domain: 'user-plant',
          code: 'profile_minimum_completeness',
          schema: 'user-plant-profile/v1',
          ref: 'bpr_profile_read_0001',
          version: 'profile/2026-09-27',
          body: profilePolicy
        },
        ...(includeHttp
          ? [
              {
                domain: 'http',
                code: 'request_write',
                schema: 'http-request-write-policy/v1',
                ref: 'bpr_http_write_0001',
                version: 'http-write/2026-09-27',
                body: httpPolicy
              }
            ]
          : [])
      ]) {
        await connection.execute(
          `INSERT INTO business_policy_releases
          (_openid, release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
          VALUES ('',?,?,?,?,?,?,CAST(? AS JSON),'active',?,NULL,?,?,?)`,
          [
            fixture.ref,
            fixture.domain,
            fixture.code,
            fixture.schema,
            fixture.version,
            calculateCanonicalJsonSha256(fixture.body),
            JSON.stringify(fixture.body),
            registeredAtMs,
            registeredAtMs,
            registeredAtMs,
            registeredAtMs
          ]
        )
        await connection.execute(
          `INSERT INTO active_business_policy_releases
          (_openid,domain_code,policy_code,release_internal_id,active_release_version,active_content_sha256,version,activated_at_ms,created_at_ms,updated_at_ms)
          SELECT '',domain_code,policy_code,id,release_version,content_sha256,1,?,?,? FROM business_policy_releases WHERE release_ref=?`,
          [registeredAtMs, registeredAtMs, registeredAtMs, fixture.ref]
        )
      }
    } finally {
      connection.release()
    }
  }

  /** 风险夹具修改只发生在读取之前；被测读取器收到只读追踪端口，任何写语句立即失败。 */
  async function changePolicy(
    sql: string,
    parameters: readonly (string | number | null)[]
  ): Promise<void> {
    const connection = await source.getConnection()
    try {
      await connection.execute(sql, parameters)
    } finally {
      connection.release()
    }
  }

  /** 同一次读取只准一次SELECT，以免两份活动发布来自不一致的多次查询；审计持久化操作零次。 */
  async function readProfileWriteSnapshot(capturedAtMs = nowMs) {
    const queries: string[] = [],
      writes: string[] = []
    const guardedSource: typeof source = {
      getConnection: async () => {
        const connection = await source.getConnection()
        return {
          ...connection,
          query: async (sql, parameters) => {
            queries.push(sql)
            if (!/^\s*SELECT\b/iu.test(sql)) {
              writes.push(sql)
              throw new Error('策略读取禁止修改发布和指针')
            }
            return connection.query(sql, parameters)
          },
          execute: async sql => {
            writes.push(sql)
            throw new Error('策略读取禁止修改发布和指针')
          }
        }
      }
    }
    const result =
      await createMysqlPublishedProfileWritePolicyReader(guardedSource).read(capturedAtMs)
    expect(writes).toEqual([])
    expect(queries).toHaveLength(1)
    return result
  }

  test('档案写策略一次读取两份完整有效活动发布，返回实际正文及来源摘要', async () => {
    await publishProfileWritePolicies()
    const result = await readProfileWriteSnapshot()
    expect(result).toMatchObject({
      maxBodyBytes: 1048576,
      profileVersion: 'user-plant-profile/v1',
      idempotencyRetentionMs: 604800000,
      profilePolicy
    })
    expect(result?.releases).toHaveLength(2)
    expect(result?.releases).toEqual(
      expect.arrayContaining([
        {
          releaseRef: 'bpr_profile_read_0001',
          releaseVersion: 'profile/2026-09-27',
          contentSha256: calculateCanonicalJsonSha256(profilePolicy)
        },
        {
          releaseRef: 'bpr_http_write_0001',
          releaseVersion: 'http-write/2026-09-27',
          contentSha256: calculateCanonicalJsonSha256(httpPolicy)
        }
      ])
    )
  })
  test('缺失HTTP活动发布不得提供局部档案写策略', async () => {
    await publishProfileWritePolicies(false)
    expect(await readProfileWriteSnapshot()).toBeNull()
  })
  test('档案正文摘要损坏即使活动指针摘要同步也拒绝', async () => {
    await publishProfileWritePolicies()
    await changePolicy(
      "UPDATE business_policy_releases SET content_sha256=REPEAT('a',64) WHERE policy_code='profile_minimum_completeness'",
      []
    )
    await changePolicy(
      "UPDATE active_business_policy_releases SET active_content_sha256=REPEAT('a',64) WHERE policy_code='profile_minimum_completeness'",
      []
    )
    expect(await readProfileWriteSnapshot()).toBeNull()
  })
  test('活动指针版本与实际发布不一致时拒绝且不自动修复', async () => {
    await publishProfileWritePolicies()
    await changePolicy(
      "UPDATE active_business_policy_releases SET active_release_version='profile/forged' WHERE policy_code='profile_minimum_completeness'",
      []
    )
    expect(await readProfileWriteSnapshot()).toBeNull()
  })
  test('未来验真时间不构成当前可用发布', async () => {
    await publishProfileWritePolicies()
    await changePolicy(
      "UPDATE business_policy_releases SET verified_at_ms=? WHERE policy_code='request_write'",
      [nowMs + 1]
    )
    expect(await readProfileWriteSnapshot()).toBeNull()
  })
  test('截止时间是严格上界，前一毫秒有效，精确截止拒绝', async () => {
    await publishProfileWritePolicies()
    await changePolicy(
      "UPDATE business_policy_releases SET expires_at_ms=? WHERE policy_code='profile_minimum_completeness'",
      [nowMs]
    )
    expect(await readProfileWriteSnapshot(nowMs - 1)).not.toBeNull()
    expect(await readProfileWriteSnapshot(nowMs)).toBeNull()
  })
})
