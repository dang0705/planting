import type { RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  createIdentityWechatLoginMysqlFixture,
  type IdentityLoginReadback,
  type IdentityWechatLoginMysqlFixture
} from './support/identity-wechat-login-mysql-fixture.js'

/** Bearer 摘要读回只含 Identity 会话持久化验证所需字段。 */
type SessionReadbackRow = RowDataPacket & {
  /** 用户会话持久化的 Bearer SHA-256。 */
  readonly session_ref_hash: string
  /** 会话锁定的策略发布版本。 */
  readonly session_policy_release_version: string
  /** 会话锁定的请求策略快照 SHA-256。 */
  readonly session_policy_snapshot_sha256: string
  /** 会话有效截止 UTC 毫秒。 */
  readonly expires_at_ms: string
}

const mysqlSetupTimeoutMs = Number('120000')
const firstArrayIndex = Number('0')
const singleRow = Number('1')
const initialOwnerCount = Number('1')
const twoSessionCount = Number('2')

let fixture!: IdentityWechatLoginMysqlFixture

/** 当前登录合同的 HTTP→Identity→MySQL→用户植物 GET 纵向 Expected。 */
describe('微信登录与统一用户会话 MySQL HTTP 纵向切片', () => {
  beforeAll(async () => {
    fixture = await createIdentityWechatLoginMysqlFixture()
  }, mysqlSetupTimeoutMs)

  afterAll(async () => {
    await fixture?.dispose()
  })

  /**
   * Expected 来源：identity-session-issuance.md §2/§4、state-machines.md §1、身份会话策略与 001 DDL。
   * 层次：L3 `unit_real_data`。真实路径：Node HTTP → Identity HTTP → 一次性 fake 微信 Provider →
   * Identity 应用/参数化 Repository → 隔离 MySQL 8.4；再由首次响应 Bearer 调用现有 user-plant GET。
   * 仅替换微信网络 Provider 与业务策略发布读取；不替换身份 Repository、事务、会话解析或用户植物 GET。
   * 不覆盖：真实微信 code2Session、CloudBase 网关/MySQL/VPC、部署、前端登录态和完整试用能力快照。
   */
  test('迁移后的 user_sessions 持久化策略版本与请求快照摘要', async () => {
    const [columns] = await fixture.databasePool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions'
         AND COLUMN_NAME IN (?, ?)
       ORDER BY COLUMN_NAME`,
      ['session_policy_release_version', 'session_policy_snapshot_sha256']
    )
    expect(columns.map(row => row.column_name)).toEqual([
      'session_policy_release_version',
      'session_policy_snapshot_sha256'
    ])
  })

  test('首次登录仅披露 Bearer 与过期时间，并可用该 Bearer 读取本人植物', async () => {
    const response = await fixture.login(fixture.firstCode)
    expect(response.status).toBe(Number('200'))
    const body = (await response.json()) as IdentityLoginReadback
    expect(Object.keys(body)).toEqual(['data'])
    expect(Object.keys(body.data ?? {}).sort()).toEqual(['accessToken', 'expiresAt'])

    const accessToken = body.data?.accessToken
    expect(accessToken).toEqual(expect.any(String))
    expect(accessToken).not.toBe('')
    expect(body.data?.expiresAt).toBe(
      new Date(
        fixture.nowMs + fixture.grantedSessionTtlHours * fixture.millisecondsPerHour
      ).toISOString()
    )

    const bearerHash = fixture.hashBearer(accessToken ?? '')
    const [sessions] = await fixture.databasePool.query<SessionReadbackRow[]>(
      `SELECT session_ref_hash, session_policy_release_version,
              session_policy_snapshot_sha256, CAST(expires_at_ms AS CHAR) AS expires_at_ms
       FROM user_sessions WHERE session_ref_hash = ?`,
      [bearerHash]
    )
    expect(sessions).toHaveLength(singleRow)
    expect(sessions[firstArrayIndex]?.session_ref_hash).toBe(bearerHash)
    expect(sessions[firstArrayIndex]?.session_policy_release_version).toBe(
      'identity-session-test/v1'
    )
    expect(sessions[firstArrayIndex]?.session_policy_snapshot_sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(Number(sessions[firstArrayIndex]?.expires_at_ms)).toBe(
      fixture.nowMs + fixture.grantedSessionTtlHours * fixture.millisecondsPerHour
    )
    expect(await fixture.identityCounts()).toEqual({
      users: initialOwnerCount,
      bindings: initialOwnerCount,
      sessions: initialOwnerCount
    })

    const [owners] = await fixture.databasePool.query<RowDataPacket[]>(
      'SELECT CAST(user_internal_id AS CHAR) AS user_internal_id FROM user_sessions WHERE session_ref_hash = ?',
      [bearerHash]
    )
    const ownerInternalId = String(owners[firstArrayIndex]?.user_internal_id)
    await fixture.databasePool.execute(
      `INSERT INTO user_plants
         (_openid, public_user_plant_id, user_internal_id, lifecycle_status,
          current_identity_status, confirmed_identity_internal_id, version,
          created_at_ms, updated_at_ms)
       VALUES ('', ?, ?, 'active', 'unidentified', NULL, 1, ?, ?)`,
      [fixture.ownerPlantRef, ownerInternalId, fixture.nowMs, fixture.nowMs]
    )

    const plantResponse = await fetch(
      `${fixture.userPlantBaseUrl}/api/v2/user-plants/${fixture.ownerPlantRef}`,
      { headers: { authorization: `Bearer ${accessToken ?? ''}` } }
    )
    expect(plantResponse.status).toBe(Number('200'))
    expect(await plantResponse.json()).toMatchObject({
      data: { user_plant_id: fixture.ownerPlantRef }
    })
  })

  test('同一已消费 code 拒绝重用，新 code 复用统一用户与绑定并签发新会话', async () => {
    const firstCounts = await fixture.identityCounts()
    const replayResponse = await fixture.login(fixture.firstCode)
    expect(replayResponse.status).toBe(Number('401'))
    expect(await replayResponse.json()).toMatchObject({ error: { type: 'PRINCIPAL_INVALID' } })
    expect(await fixture.identityCounts()).toEqual(firstCounts)

    const nextResponse = await fixture.login(fixture.nextCode)
    expect(nextResponse.status).toBe(Number('200'))
    const nextBody = (await nextResponse.json()) as IdentityLoginReadback
    expect(Object.keys(nextBody.data ?? {}).sort()).toEqual(['accessToken', 'expiresAt'])
    expect(nextBody.data?.accessToken).not.toBe('')
    expect(await fixture.identityCounts()).toEqual({
      users: initialOwnerCount,
      bindings: initialOwnerCount,
      sessions: twoSessionCount
    })
  })

  test('两个首次登录并发争用同一平台主体时只创建一个用户和绑定', async () => {
    const before = await fixture.identityCounts()
    const [firstResponse, secondResponse] = await Promise.all([
      fixture.login(fixture.concurrentCodeA),
      fixture.login(fixture.concurrentCodeB)
    ])
    expect([firstResponse.status, secondResponse.status]).toEqual([Number('200'), Number('200')])
    const firstBody = (await firstResponse.json()) as IdentityLoginReadback
    const secondBody = (await secondResponse.json()) as IdentityLoginReadback
    expect(firstBody.data?.accessToken).toEqual(expect.any(String))
    expect(secondBody.data?.accessToken).toEqual(expect.any(String))
    expect(firstBody.data?.accessToken).not.toBe(secondBody.data?.accessToken)

    const after = await fixture.identityCounts()
    expect(after.users - before.users).toBe(Number('1'))
    expect(after.bindings - before.bindings).toBe(Number('1'))
    expect(after.sessions - before.sessions).toBe(twoSessionCount)
  })

  test('无效 code 和伪造 x-wx-openid 不创建身份或会话', async () => {
    const before = await fixture.identityCounts()
    const callsBefore = fixture.providerCallCount()
    const response = await fixture.login(fixture.invalidCode, {
      'x-wx-openid': 'forged-client-subject'
    })
    expect(response.status).toBe(Number('401'))
    expect(await response.json()).toMatchObject({ error: { type: 'PRINCIPAL_INVALID' } })
    expect(fixture.providerCallCount()).toBe(callsBefore + Number('1'))
    expect(await fixture.identityCounts()).toEqual(before)
  })

  // Expected 来源：identity-session-issuance.md 多平台请求（用户 2026-10-09 冻结）。
  test('微信携带游客令牌 → 400，不调用 Provider、不写身份数据', async () => {
    const before = await fixture.identityCounts()
    const callsBefore = fixture.providerCallCount()
    const response = await fetch(`${fixture.identityBaseUrl}/api/v2/identity/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'wechat', code: fixture.subjectCode, guestToken: 'A'.repeat(43) })
    })
    expect(response.status).toBe(Number('400'))
    expect(await response.json()).toMatchObject({ error: { type: 'VALIDATION_FAILED' } })
    expect(fixture.providerCallCount()).toBe(callsBefore)
    expect(await fixture.identityCounts()).toEqual(before)
  })

  test('未配置 Provider 的平台（小红书）→ 503，不签发 Bearer、不写身份数据', async () => {
    const before = await fixture.identityCounts()
    const response = await fetch(`${fixture.identityBaseUrl}/api/v2/identity/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'xiaohongshu', code: 'xhs-one-time-code' })
    })
    expect(response.status).toBe(Number('503'))
    expect(await response.json()).toMatchObject({ error: { type: 'SERVICE_UNAVAILABLE' } })
    expect(await fixture.identityCounts()).toEqual(before)
  })

  test('没有有效策略时不调用 Provider、不签发 Bearer、不写身份数据', async () => {
    const before = await fixture.identityCounts()
    const callsBefore = fixture.providerCallCount()
    fixture.setActivePolicySnapshot(null)
    try {
      const response = await fixture.login(fixture.subjectCode)
      expect(response.status).toBe(Number('503'))
      expect(await response.json()).toMatchObject({ error: { type: 'SERVICE_UNAVAILABLE' } })
      expect(fixture.providerCallCount()).toBe(callsBefore)
      expect(await fixture.identityCounts()).toEqual(before)
    } finally {
      fixture.setActivePolicySnapshot(fixture.createActivePolicySnapshot())
    }
  })

  test('会话插入中途失败时回滚用户和平台绑定且不返回 Bearer', async () => {
    const before = await fixture.identityCounts()
    const triggerName = `fail_identity_session_insert_${String(process.pid)}`
    fixture.runRootSql(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON user_sessions
       FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test-only identity session failure';`,
      fixture.schemaDatabaseName
    )
    try {
      const response = await fixture.login(fixture.rollbackCode)
      expect(response.status).toBe(Number('503'))
      expect(await response.json()).toMatchObject({ error: { type: 'SERVICE_UNAVAILABLE' } })
      expect(await fixture.identityCounts()).toEqual(before)
    } finally {
      fixture.runRootSql(`DROP TRIGGER IF EXISTS ${triggerName};`, fixture.schemaDatabaseName)
    }
  })

  test('COMMIT 已成功但确认丢失时返回 503 且不自动重试；新 code 可安全重新登录', async () => {
    const before = await fixture.identityCounts()
    const uncertainCommit = fixture.createCommitAcknowledgementLossSource(fixture.connectionSource)
    const server = fixture.createIdentityServer({
      connectionSource: uncertainCommit.connectionSource,
      verifyPlatformCode: (_platform, code) => fixture.createOneTimeWechatCodeVerifier()(code),
      resolveSessionPolicy: async () => fixture.getActivePolicySnapshot(),
      now: () => fixture.nowMs,
      writeAudit: () => undefined,
      recordRollbackFailure: () => undefined
    })
    const baseUrl = await fixture.listen(server)
    try {
      const response = await fetch(`${baseUrl}/api/v2/identity/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: 'wechat', code: fixture.unknownCommitCode })
      })
      expect(response.status).toBe(Number('503'))
      const body = await response.json()
      expect(body).toMatchObject({ error: { type: 'SERVICE_UNAVAILABLE' } })
      expect(body).not.toHaveProperty('data')
      expect(uncertainCommit.connectionAcquisitions()).toBe(Number('1'))
      expect(await fixture.identityCounts()).toEqual({
        users: before.users + Number('1'),
        bindings: before.bindings + Number('1'),
        sessions: before.sessions + Number('1')
      })

      const retryResponse = await fixture.login(fixture.afterUnknownCommitCode)
      expect(retryResponse.status).toBe(Number('200'))
      const retryBody = (await retryResponse.json()) as IdentityLoginReadback
      expect(retryBody.data?.accessToken).toEqual(expect.any(String))
      const afterRetry = await fixture.identityCounts()
      expect(afterRetry.users - before.users).toBe(Number('1'))
      expect(afterRetry.bindings - before.bindings).toBe(Number('1'))
      expect(afterRetry.sessions - before.sessions).toBe(twoSessionCount)
    } finally {
      await fixture.closeServer(server)
    }
  })
})
