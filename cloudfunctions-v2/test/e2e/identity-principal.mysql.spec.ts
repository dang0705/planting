import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket
} from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlPlatformIdentityBindingRepository,
  type PlatformIdentitySqlExecutor,
  type PlatformIdentitySqlRow
} from '../../src/identity/repository/mysql-platform-identity-binding-repository.js'
import {
  createMysqlUserPrincipalRepository,
  type UserPrincipalSqlRow
} from '../../src/identity/repository/mysql-user-principal-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const databaseName = 'qinghuazhi_v2_identity_principal'
const containerName = `qhz-v2-identity-principal-${String(process.pid)}`
const rawBearer = 'raw-bearer-identity-real-mysql-001'
const platformSubjectHash = 'a'.repeat(Number('64'))
const subjectHashKeyVersion = 'identity-hmac.2026-09-20.1'
const issuedAtMs = Date.parse('2026-09-20T03:00:00.000Z')
const expiresAtMs = Date.parse('2026-09-21T03:00:00.000Z')
const nowMs = Date.parse('2026-09-20T04:00:00.000Z')
let pool: Pool

/** 真实 MySQL 连接承载的身份写事务。 */
type MysqlIdentityTransaction = TransactionExecutionContext & {
  /** 当前事务独占连接。 */
  readonly connection: PoolConnection
}

/** 仅供本文件核验真实 Repository 实际执行到的 SQL 边界。 */
type IdentitySqlTrace = {
  /** 查询或写入种类，不包含 SQL 参数或身份材料。 */
  readonly kind: 'query' | 'write'
  /** Repository 实际交给 MySQL 的参数化 SQL。 */
  readonly sql: string
}

/** 执行一次性 MySQL 容器命令并保留可诊断错误。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input,
    maxBuffer: Number('10485760')
  })
  if (result.status !== Number('0')) {
    throw new Error(`Docker command failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/** 有界轮询 MySQL 就绪，不把 Docker HEALTHCHECK 当成唯一事实。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < Number('60'); attempt += Number('1')) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        containerName,
        'mysql',
        '--no-defaults',
        '-uroot',
        '--batch',
        '--skip-column-names',
        '-e',
        'SELECT @@port;'
      ],
      { encoding: 'utf8' }
    )
    if (result.status === Number('0') && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, Number('250')))
  }
  throw new Error('MySQL 容器未在限定时间内就绪')
}

/** 读取 Docker 随机发布到本机的端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', containerName, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析 MySQL 容器映射端口')
  }
  return port
}

/** 创建只记录安全摘要参数的真实 MySQL Repository。 */
function createRepository() {
  return createMysqlUserPrincipalRepository({
    executeQuery: async (sql, parameters) => {
      const safeParameters = parameters.map(parameter => {
        if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
          return parameter
        }
        throw new Error('identity Repository 产生了不受支持的 SQL 参数')
      })
      const [rows] = await pool.execute<RowDataPacket[]>(sql, safeParameters)
      return rows as unknown as readonly UserPrincipalSqlRow[]
    }
  })
}

/** 创建真实 MySQL 事务驱动，确保失败时回滚并释放连接。 */
function createTransactionDriver(): DatabaseTransactionDriver<MysqlIdentityTransaction> {
  return {
    beginTransaction: async () => {
      const connection = await pool.getConnection()
      await connection.beginTransaction()
      return { transactionContext: true, connection }
    },
    commitTransaction: async transaction => {
      try {
        await transaction.connection.commit()
      } finally {
        transaction.connection.release()
      }
    },
    rollbackTransaction: async transaction => {
      try {
        await transaction.connection.rollback()
      } finally {
        transaction.connection.release()
      }
    },
    recordRollbackFailure: () => undefined
  }
}

/** 把事务连接适配为平台身份绑定 Repository 的参数化 SQL 端口。 */
function createBindingExecutor(
  trace?: IdentitySqlTrace[]
): PlatformIdentitySqlExecutor<MysqlIdentityTransaction> {
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('平台身份绑定 Repository 产生了不受支持的 SQL 参数')
    })
  return {
    executeQuery: async (transaction, sql, parameters) => {
      trace?.push({ kind: 'query', sql })
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly PlatformIdentitySqlRow[]
    },
    executeWrite: async (transaction, sql, parameters) => {
      trace?.push({ kind: 'write', sql })
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows }
    }
  }
}

/** 在两个独立事务都读到缺失的同一主体后再放行，稳定重现唯一键竞争窗口。 */
function createContendedBindingExecutor(): PlatformIdentitySqlExecutor<MysqlIdentityTransaction> {
  const baseExecutor = createBindingExecutor()
  let missingSubjectReads = Number('0')
  let releaseContenders: (() => void) | undefined
  const bothTransactionsReadMissingSubject = new Promise<void>(resolve => {
    releaseContenders = resolve
  })

  return {
    executeQuery: async (transaction, sql, parameters) => {
      const rows = await baseExecutor.executeQuery(transaction, sql, parameters)
      const isSubjectLookup = sql.includes('`platform_subject_hash` = ?')
      if (isSubjectLookup && rows.length === Number('0')) {
        missingSubjectReads += Number('1')
        if (missingSubjectReads === Number('2')) {
          releaseContenders?.()
        }
        await bothTransactionsReadMissingSubject
      }
      return rows
    },
    executeWrite: baseExecutor.executeWrite
  }
}

/**
 * Expected 来源：`principal-capability/v1` 与 identity 空库 DDL。
 * 测试层次：L3 / `unit_real_data`；经过真实 MySQL 8.4、真实三表 JOIN、SHA-256 和领域裁决。
 * 替换边界：仅以本地一次性 MySQL 替代 CloudBase MySQL；平台 Provider 仍使用已验证摘要制品。
 * 明确未覆盖：真实微信/抖音/小红书/手机号凭证、HMAC 密钥托管、HTTP 和 CloudBase 网络。
 */
describe('统一用户 Principal 真实 MySQL 解析', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '-e',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      '-P',
      'mysql:8.4'
    ])
    await waitForMysql()
    const identityDdl = fs.readFileSync(
      path.join(projectRoot, 'docs/backend-v2/schema/001_identity.sql'),
      'utf8'
    )
    runDocker([
      'exec',
      containerName,
      'mysql',
      '--no-defaults',
      '-uroot',
      '-e',
      `CREATE DATABASE \`${databaseName}\`;`
    ])
    runDocker(
      ['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot', databaseName],
      identityDdl
    )
    pool = createPool({
      host: '127.0.0.1',
      port: resolvePublishedPort(),
      user: 'root',
      database: databaseName,
      connectionLimit: Number('2'),
      supportBigNumbers: true,
      bigNumberStrings: true
    })
    const sessionRefHash = createHash('sha256').update(rawBearer).digest('hex')
    await pool.execute(
      `INSERT INTO users
       (public_user_id, status, session_version, created_at_ms, updated_at_ms)
       VALUES ('usr_identity_mysql_001', 'active', 3, ?, ?)`,
      [issuedAtMs - Number('1000'), issuedAtMs - Number('1000')]
    )
    await pool.execute(
      `INSERT INTO platform_identities
       (user_internal_id, platform, platform_subject_hash, subject_hash_key_version,
        platform_subject_ciphertext, app_scope, binding_status, bound_at_ms,
        created_at_ms, updated_at_ms)
       SELECT id, 'wechat', ?, ?, NULL, 'wx-app-qhz', 'active', ?, ?, ?
       FROM users WHERE public_user_id = 'usr_identity_mysql_001'`,
      [platformSubjectHash, subjectHashKeyVersion, issuedAtMs, issuedAtMs, issuedAtMs]
    )
    await pool.execute(
      `INSERT INTO user_sessions
       (session_ref_hash, user_internal_id, platform_identity_internal_id,
        session_version, authenticated_via, status, issued_at_ms, expires_at_ms,
        created_at_ms, updated_at_ms)
       SELECT ?, u.id, p.id, 3, 'wechat', 'active', ?, ?, ?, ?
       FROM users AS u JOIN platform_identities AS p ON p.user_internal_id = u.id
       WHERE u.public_user_id = 'usr_identity_mysql_001'`,
      [sessionRefHash, issuedAtMs, expiresAtMs, issuedAtMs, issuedAtMs]
    )
    await pool.execute(
      `INSERT INTO users
       (public_user_id, status, session_version, created_at_ms, updated_at_ms)
       VALUES ('usr_identity_binding_mysql', 'active', 1, ?, ?)`,
      [issuedAtMs - Number('1000'), issuedAtMs - Number('1000')]
    )
    await pool.execute(
      `INSERT INTO users
       (public_user_id, status, session_version, created_at_ms, updated_at_ms)
       VALUES ('usr_identity_race_002', 'active', 1, ?, ?)`,
      [issuedAtMs - Number('1000'), issuedAtMs - Number('1000')]
    )
    for (const [platform, hash] of [
      ['wechat', 'c'.repeat(Number('64'))],
      ['phone', 'd'.repeat(Number('64'))]
    ] as const) {
      await pool.execute(
        `INSERT INTO platform_identities
         (user_internal_id, platform, platform_subject_hash, subject_hash_key_version,
          platform_subject_ciphertext, app_scope, binding_status, bound_at_ms,
          created_at_ms, updated_at_ms)
         SELECT id, ?, ?, ?, NULL, 'qhz-main', 'active', ?, ?, ?
         FROM users WHERE public_user_id = 'usr_identity_binding_mysql'`,
        [platform, hash, subjectHashKeyVersion, issuedAtMs, issuedAtMs, issuedAtMs]
      )
    }
    await pool.execute(
      `INSERT INTO user_sessions
       (session_ref_hash, user_internal_id, platform_identity_internal_id,
        session_version, authenticated_via, status, issued_at_ms, expires_at_ms,
        created_at_ms, updated_at_ms)
       SELECT ?, u.id, p.id, 1, 'wechat', 'active', ?, ?, ?, ?
       FROM users AS u JOIN platform_identities AS p ON p.user_internal_id = u.id
       WHERE u.public_user_id = 'usr_identity_binding_mysql' AND p.platform = 'wechat'`,
      ['e'.repeat(Number('64')), issuedAtMs, expiresAtMs, issuedAtMs, issuedAtMs]
    )
  }, Number('30000'))

  afterAll(async () => {
    await pool?.end()
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  test('摘要命中三表归属后返回脱敏 Principal，撤销后同一 Bearer 被拒绝', async () => {
    const resolvePrincipal = createResolveUserPrincipalUseCase({ repository: createRepository() })
    const command = {
      verifiedIdentity: {
        platform: 'wechat' as const,
        appScope: 'wx-app-qhz',
        hashCandidates: [{ platformSubjectHash, subjectHashKeyVersion }]
      },
      bearerToken: rawBearer,
      nowMs
    }

    await expect(resolvePrincipal(command)).resolves.toEqual({
      principalType: 'user',
      user_id: 'usr_identity_mysql_001',
      sessionVersion: 3,
      authenticatedVia: 'wechat',
      issuedAt: '2026-09-20T03:00:00.000Z',
      expiresAt: '2026-09-21T03:00:00.000Z'
    })
    await pool.execute(
      `UPDATE user_sessions
       SET status = 'revoked', revoked_at_ms = ?, updated_at_ms = ?
       WHERE session_ref_hash = ?`,
      [nowMs, nowMs, createHash('sha256').update(rawBearer).digest('hex')]
    )
    await expect(resolvePrincipal(command)).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
  })

  test('错误 Bearer 摘要不命中且原始令牌从未落库', async () => {
    const resolvePrincipal = createResolveUserPrincipalUseCase({ repository: createRepository() })
    await expect(
      resolvePrincipal({
        verifiedIdentity: {
          platform: 'wechat',
          appScope: 'wx-app-qhz',
          hashCandidates: [{ platformSubjectHash, subjectHashKeyVersion }]
        },
        bearerToken: 'different-raw-bearer-identity-real-mysql',
        nowMs
      })
    ).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS raw_count FROM user_sessions WHERE session_ref_hash = ?`,
      [rawBearer]
    )
    expect(Number(rows[Number('0')]?.raw_count)).toBe(Number('0'))
  })

  test('真实事务创建第三个平台绑定并在解绑时递增版本、撤销全部会话', async () => {
    const trace: IdentitySqlTrace[] = []
    const repository = createMysqlPlatformIdentityBindingRepository(createBindingExecutor(trace))
    const driver = createTransactionDriver()
    await expect(
      runDatabaseTransaction(driver, transaction =>
        repository.bindOrRestore(transaction, {
          userRef: 'usr_identity_binding_mysql' as UserRef,
          platform: 'xiaohongshu',
          appScope: 'qhz-main',
          platformSubjectHash: 'f'.repeat(Number('64')),
          subjectHashKeyVersion,
          platformSubjectCiphertext: null,
          occurredAtMs: nowMs
        })
      )
    ).resolves.toMatchObject({ kind: 'created', platform: 'xiaohongshu' })
    expect(
      trace.some(
        call =>
          call.kind === 'query' &&
          call.sql.includes('`platform_subject_hash` = ?') &&
          !call.sql.includes('FOR UPDATE')
      )
    ).toBe(true)
    await expect(
      runDatabaseTransaction(driver, transaction =>
        repository.revoke(transaction, {
          userRef: 'usr_identity_binding_mysql' as UserRef,
          platform: 'wechat',
          appScope: 'qhz-main',
          occurredAtMs: nowMs
        })
      )
    ).resolves.toEqual({
      platform: 'wechat',
      appScope: 'qhz-main',
      nextSessionVersion: 2
    })
    expect(
      trace.some(
        call =>
          call.kind === 'query' &&
          call.sql.includes('WHERE `user_internal_id` = ?') &&
          call.sql.includes('ORDER BY `id` FOR UPDATE')
      )
    ).toBe(true)
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT session_version FROM users
         WHERE public_user_id = 'usr_identity_binding_mysql') AS session_version,
        (SELECT binding_status FROM platform_identities AS p JOIN users AS u
           ON u.id = p.user_internal_id
         WHERE u.public_user_id = 'usr_identity_binding_mysql'
           AND p.platform = 'wechat' AND p.app_scope = 'qhz-main') AS wechat_status,
        (SELECT s.status FROM user_sessions AS s JOIN users AS u ON u.id = s.user_internal_id
         WHERE u.public_user_id = 'usr_identity_binding_mysql') AS session_status,
        (SELECT COUNT(*) FROM platform_identities AS p JOIN users AS u
           ON u.id = p.user_internal_id
         WHERE u.public_user_id = 'usr_identity_binding_mysql'
           AND p.binding_status = 'active') AS active_bindings
    `)
    expect(rows).toEqual([
      {
        session_version: 2,
        wechat_status: 'revoked',
        session_status: 'revoked',
        active_bindings: '2'
      }
    ])
  })

  test('已有主体重放前仍按主键锁定绑定行', async () => {
    const trace: IdentitySqlTrace[] = []
    const repository = createMysqlPlatformIdentityBindingRepository(createBindingExecutor(trace))

    await expect(
      runDatabaseTransaction(createTransactionDriver(), transaction =>
        repository.bindOrRestore(transaction, {
          userRef: 'usr_identity_mysql_001' as UserRef,
          platform: 'wechat',
          appScope: 'wx-app-qhz',
          platformSubjectHash,
          subjectHashKeyVersion,
          platformSubjectCiphertext: null,
          occurredAtMs: nowMs
        })
      )
    ).resolves.toMatchObject({ kind: 'replayed' })

    expect(
      trace.some(
        call =>
          call.kind === 'query' &&
          call.sql.includes('FROM `platform_identities`') &&
          call.sql.includes('WHERE `id` = ? FOR UPDATE')
      )
    ).toBe(true)
  })

  test('真实事务拒绝删除最后一个 active 登录入口且不改变版本', async () => {
    const repository = createMysqlPlatformIdentityBindingRepository(createBindingExecutor())
    await expect(
      runDatabaseTransaction(createTransactionDriver(), transaction =>
        repository.revoke(transaction, {
          userRef: 'usr_identity_mysql_001' as UserRef,
          platform: 'wechat',
          appScope: 'wx-app-qhz',
          occurredAtMs: nowMs
        })
      )
    ).rejects.toMatchObject({ type: 'IDENTITY_LAST_BINDING_REQUIRED' })
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT session_version FROM users WHERE public_user_id = 'usr_identity_mysql_001'`
    )
    expect(rows).toEqual([{ session_version: 3 }])
  })

  /**
   * Expected 来源：P2 统一身份 Principal 票据与 `principal-capability/v1` 的主体唯一归属和 409 冲突合同。
   * 测试层次：L3 / `unit_real_data`；经过真实 Repository、双 MySQL 事务、唯一索引和读回。
   * 替换边界：只使用本地 MySQL 8.4 代替 CloudBase MySQL；Provider 已验证摘要作为测试制品。
   * 明确未覆盖：真实平台凭证、HTTP 公开错误封套、CloudBase 网络与部署。
   */
  test('不同用户并发绑定同一平台主体时只允许一个归属并把竞争者明确拒绝', async () => {
    const repository = createMysqlPlatformIdentityBindingRepository(
      createContendedBindingExecutor()
    )
    const driver = createTransactionDriver()
    const contestedSubjectHash = '8'.repeat(Number('64'))
    const contestedAppScope = 'identity-race-app'
    const bind = (userRef: UserRef, occurredAtMs: number) =>
      runDatabaseTransaction(driver, transaction =>
        repository.bindOrRestore(transaction, {
          userRef,
          platform: 'xiaohongshu',
          appScope: contestedAppScope,
          platformSubjectHash: contestedSubjectHash,
          subjectHashKeyVersion,
          platformSubjectCiphertext: null,
          occurredAtMs
        })
      )

    const outcomes = await Promise.allSettled([
      bind('usr_identity_binding_mysql' as UserRef, nowMs),
      bind('usr_identity_race_002' as UserRef, nowMs + Number('1'))
    ])
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS binding_count,
              COUNT(DISTINCT user_internal_id) AS owner_count
       FROM platform_identities
       WHERE platform = 'xiaohongshu' AND app_scope = ?
         AND platform_subject_hash = ? AND binding_status = 'active'`,
      [contestedAppScope, contestedSubjectHash]
    )
    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled')
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected')

    expect(fulfilled).toHaveLength(Number('1'))
    expect(fulfilled[Number('0')]).toMatchObject({
      status: 'fulfilled',
      value: { kind: 'created', platform: 'xiaohongshu', appScope: contestedAppScope }
    })
    expect(rejected).toHaveLength(Number('1'))
    expect(rejected[Number('0')]).toMatchObject({
      status: 'rejected',
      reason: { type: 'IDENTITY_BINDING_CONFLICT' }
    })
    expect(rows).toEqual([{ binding_count: '1', owner_count: '1' }])
  })
})
