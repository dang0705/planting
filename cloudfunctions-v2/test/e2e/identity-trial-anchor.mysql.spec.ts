import type { RowDataPacket } from 'mysql2/promise'
import { createHash, createHmac } from 'node:crypto'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import { createMysqlUserTrialAnchorReader } from '../../src/identity/repository/mysql-user-trial-anchor-reader.js'
import {
  createIdentityWechatLoginMysqlFixture,
  type IdentityLoginReadback,
  type IdentityWechatLoginMysqlFixture
} from './support/identity-wechat-login-mysql-fixture.js'

/** 只读取测试登录实际创建的统一用户公开引用，不把数据库内部主键传给业务域。 */
type UserReferenceRow = RowDataPacket & {
  /** 登录产生的统一用户公开引用。 */
  readonly public_user_id: string
}

let fixture: IdentityWechatLoginMysqlFixture
const setupTimeoutMs = Number('120000')
const okStatus = Number('200')
const singleUserCount = Number('1')
const firstRowIndex = Number('0')
const internalScope = 'identity.trial-anchor.read'
const internalKeyId = 'subscription-test-k1'
const internalSecret = Buffer.from('isolated-trial-anchor-test-secret', 'utf8')
const emptyBodySha256 = createHash('sha256').update('').digest('hex')
let internalServer: Server | undefined

/** 按 http-api/v1 §5 独立构造测试请求签名，不使用被测入口的签名函数。 */
function signedHeaders(
  userRef: string,
  nonce: string,
  signedScope = internalScope
): Record<string, string> {
  const timestamp = String(Math.floor(fixture.nowMs / Number('1000')))
  const pathname = `/api/v2/internal/identity/users/${userRef}/trial-anchor`
  const canonical = [
    'http-api/v1',
    'subscription',
    internalKeyId,
    timestamp,
    nonce,
    'GET',
    pathname,
    emptyBodySha256,
    signedScope
  ].join('\n')
  return {
    'X-QHZ-Key-Id': internalKeyId,
    'X-QHZ-Timestamp': timestamp,
    'X-QHZ-Nonce': nonce,
    'X-QHZ-Body-Sha256': emptyBodySha256,
    'X-QHZ-Scope': signedScope,
    'X-QHZ-Signature': createHmac('sha256', internalSecret).update(canonical).digest('base64url')
  }
}

/**
 * Expected 来源：identity-trial-anchor/v1 §4、principal-and-capability/v1 §3。
 * 层次：L3 / unit_real_data。真实路径：一次性微信凭证替身 → Identity HTTP →
 * Identity MySQL 登录事务 → 内部 HTTP 服务验签与 nonce 占用 → Identity 只读
 * Repository → 独立 MySQL 读回。仅替换微信网络 Provider、签名密钥解析和已发布
 * 会话策略读取；不覆盖 subscription 策略读取、用户植物创建、CloudBase 部署。
 */
describe('统一用户试用起算锚点真实 MySQL 读回', () => {
  beforeAll(async () => {
    fixture = await createIdentityWechatLoginMysqlFixture()
  }, setupTimeoutMs)

  afterAll(async () => {
    await fixture?.closeServer(internalServer)
    await fixture?.dispose()
  })

  test('首次登录后按统一用户引用读取账户状态与原始创建时刻', async () => {
    const login = await fixture.login(fixture.firstCode)
    expect(login.status).toBe(okStatus)
    const loginBody = (await login.json()) as IdentityLoginReadback
    expect(loginBody.data?.accessToken).toEqual(expect.any(String))

    const [rows] = await fixture.databasePool.query<UserReferenceRow[]>(
      'SELECT public_user_id FROM users'
    )
    expect(rows).toHaveLength(singleUserCount)
    const userRef = rows[firstRowIndex]?.public_user_id as UserRef

    const readAnchor = createMysqlUserTrialAnchorReader(fixture.connectionSource)
    expect(await readAnchor(userRef)).toEqual({
      userRef,
      status: 'active',
      createdAtMs: fixture.nowMs
    })
    expect(await readAnchor('usr_unknown_00000001' as UserRef)).toBeNull()

    // identity-trial-anchor/v1 §2、§5：已登记的内部路由必须先拒绝无签名调用。
    // 若误把内部端点当作公开路由或尚未挂载路由，本断言分别会得到 200 或 404。
    const unsignedResponse = await fetch(
      `${fixture.identityBaseUrl}/api/v2/internal/identity/users/${userRef}/trial-anchor`
    )
    expect(unsignedResponse.status).toBe(Number('401'))
    expect(await unsignedResponse.json()).toEqual({
      error: { type: 'PRINCIPAL_INVALID', message: expect.any(String) }
    })

    internalServer = fixture.createIdentityServer({
      connectionSource: fixture.connectionSource,
      verifyWechatCode: fixture.createOneTimeWechatCodeVerifier(),
      resolveSessionPolicy: async () => fixture.getActivePolicySnapshot(),
      resolveServiceSigningKey: async keyId =>
        keyId === internalKeyId ? { serviceName: 'subscription', key: internalSecret } : null,
      now: () => fixture.nowMs,
      writeAudit: () => undefined,
      recordRollbackFailure: () => undefined
    })
    const internalBaseUrl = await fixture.listen(internalServer)
    const anchorUrl = `${internalBaseUrl}/api/v2/internal/identity/users/${userRef}/trial-anchor`
    const headers = signedHeaders(userRef, 'trial-anchor-nonce-0001')
    const signedResponse = await fetch(anchorUrl, { headers })
    expect(signedResponse.status).toBe(okStatus)
    expect(await signedResponse.json()).toEqual({
      data: { userRef, status: 'active', createdAtMs: fixture.nowMs }
    })

    const replayResponse = await fetch(anchorUrl, { headers })
    expect(replayResponse.status).toBe(Number('401'))
    expect(await replayResponse.json()).toEqual({
      error: { type: 'PRINCIPAL_INVALID', message: expect.any(String) }
    })

    const wrongScopeResponse = await fetch(anchorUrl, {
      headers: signedHeaders(userRef, 'trial-anchor-nonce-0002', 'identity.resolve')
    })
    expect(wrongScopeResponse.status).toBe(Number('401'))
    expect(await wrongScopeResponse.json()).toEqual({
      error: { type: 'PRINCIPAL_INVALID', message: expect.any(String) }
    })

    const unknownRef = 'usr_unknown_00000001'
    const missingResponse = await fetch(
      `${internalBaseUrl}/api/v2/internal/identity/users/${unknownRef}/trial-anchor`,
      { headers: signedHeaders(unknownRef, 'trial-anchor-nonce-0003') }
    )
    expect(missingResponse.status).toBe(Number('404'))
    expect(await missingResponse.json()).toEqual({
      error: { type: 'NOT_FOUND', message: expect.any(String) }
    })

    const forbiddenQueryResponse = await fetch(`${anchorUrl}?include=quota`, {
      headers: signedHeaders(userRef, 'trial-anchor-nonce-0004')
    })
    expect(forbiddenQueryResponse.status).toBe(Number('400'))
    expect(await forbiddenQueryResponse.json()).toEqual({
      error: { type: 'VALIDATION_FAILED', message: expect.any(String) }
    })
  })
})
