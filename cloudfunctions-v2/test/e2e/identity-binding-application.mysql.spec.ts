import { spawnSync } from 'node:child_process'
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

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import {
  createBindPlatformIdentityService,
  createRevokePlatformIdentityService
} from '../../src/identity/application/manage-platform-identity-binding.js'
import {
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencySqlExecutor,
  type HttpIdempotencySqlRow
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import type {
  DatabaseTransactionDriver,
  TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlPlatformIdentityBindingRepository,
  type PlatformIdentitySqlExecutor,
  type PlatformIdentitySqlRow
} from '../../src/identity/repository/mysql-platform-identity-binding-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const databaseName = 'qinghuazhi_v2_identity_binding_app'
const containerName = `qhz-v2-identity-binding-app-${String(process.pid)}`
const currentTime = Date.parse('2026-09-21T01:00:00.000Z')
const userRef = 'usr_identity_binding_app_mysql' as UserRef
let pool: Pool

/** 真实 MySQL 独占连接承载的 identity 应用事务。 */
type MysqlIdentityApplicationTransaction = TransactionExecutionContext & {
  /** 当前事务独占连接。 */
  readonly connection: PoolConnection
}

/** 执行一次 Docker 命令并保留完整诊断输出。 */
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

/** 有界轮询真实 MySQL 查询，避免依赖容器 HEALTHCHECK。 */
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

/** 读取 Docker 随机映射端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', containerName, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析 MySQL 容器映射端口')
  }
  return port
}

/** 只允许 MySQL 驱动接受的安全标量参数。 */
function resolveParameters(parameters: readonly unknown[]): (string | number | null)[] {
  return parameters.map(parameter => {
    if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
      return parameter
    }
    throw new Error('identity 应用产生了不受支持的 SQL 参数')
  })
}

/** 创建释放连接职责明确的真实事务驱动。 */
function createTransactionDriver(): DatabaseTransactionDriver<MysqlIdentityApplicationTransaction> {
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

/** 创建共享幂等表的事务内参数化 SQL 适配器。 */
function createIdempotencyExecutor(): HttpIdempotencySqlExecutor<MysqlIdentityApplicationTransaction> {
  return {
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows }
    },
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly HttpIdempotencySqlRow[]
    }
  }
}

/** 创建 identity 平台绑定表的事务内参数化 SQL 适配器。 */
function createBindingExecutor(): PlatformIdentitySqlExecutor<MysqlIdentityApplicationTransaction> {
  return {
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows }
    },
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly PlatformIdentitySqlRow[]
    }
  }
}

/** 创建已验证的当前登录用户 Principal。 */
function createPrincipal(): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userRef,
    sessionVersion: Number('1'),
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-21T00:00:00.000Z',
    expiresAt: '2026-09-22T00:00:00.000Z'
  }
}

/** 创建真实事务、幂等与绑定 Repository 依赖。 */
function createDependencies() {
  return {
    driver: createTransactionDriver(),
    idempotencyRepository: createMysqlHttpIdempotencyRepository(createIdempotencyExecutor()),
    bindingRepository: createMysqlPlatformIdentityBindingRepository(createBindingExecutor()),
    commitUnknownReadOnlyRepository: createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({
      executeQuery: async (sql, parameters) => {
        const [rows] = await pool.execute<RowDataPacket[]>(sql, resolveParameters(parameters))
        return rows as unknown as readonly HttpIdempotencySqlRow[]
      }
    })
  }
}

/**
 * Expected 来源：`principal-capability/v1`、`state-machines/v1`、001/008 DDL。
 * 测试层次：L3 / `unit_real_data`；真实经过 MySQL 8.4、事务、两类 Repository 与幂等读回。
 * 替换边界：本地一次性 MySQL 替代 CloudBase；Provider 输入使用已验证摘要制品。
 * 明确未覆盖：真实平台凭证、CloudBase 网络、HTTP、日志和真实 COMMIT 断网。
 */
describe('平台身份绑定应用真实 MySQL 事务', () => {
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
    runDocker([
      'exec',
      containerName,
      'mysql',
      '--no-defaults',
      '-uroot',
      '-e',
      `CREATE DATABASE \`${databaseName}\`;`
    ])
    for (const ddlFile of ['001_identity.sql', '008_foundation.sql']) {
      runDocker(
        ['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot', databaseName],
        fs.readFileSync(path.join(projectRoot, 'docs/backend-v2/schema', ddlFile), 'utf8')
      )
    }
    pool = createPool({
      host: '127.0.0.1',
      port: resolvePublishedPort(),
      user: 'root',
      database: databaseName,
      connectionLimit: Number('3'),
      supportBigNumbers: true,
      bigNumberStrings: true
    })
    await pool.execute(
      `INSERT INTO users
       (public_user_id, status, session_version, created_at_ms, updated_at_ms)
       VALUES (?, 'active', 1, ?, ?)`,
      [userRef, currentTime, currentTime]
    )
    for (const [platform, hash] of [
      ['wechat', 'a'.repeat(Number('64'))],
      ['phone', 'b'.repeat(Number('64'))]
    ] as const) {
      await pool.execute(
        `INSERT INTO platform_identities
         (user_internal_id, platform, platform_subject_hash, subject_hash_key_version,
          app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
         SELECT id, ?, ?, 'identity-hmac.seed', 'qhz-main', 'active', ?, ?, ?
         FROM users WHERE public_user_id = ?`,
        [platform, hash, currentTime, currentTime, currentTime, userRef]
      )
    }
    await pool.execute(
      `INSERT INTO user_sessions
       (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version,
        authenticated_via, status, issued_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
       SELECT ?, u.id, p.id, 1, 'wechat', 'active', ?, ?, ?, ?
       FROM users AS u JOIN platform_identities AS p ON p.user_internal_id = u.id
       WHERE u.public_user_id = ? AND p.platform = 'wechat'`,
      [
        'c'.repeat(Number('64')),
        currentTime,
        currentTime + Number('86400000'),
        currentTime,
        currentTime,
        userRef
      ]
    )
  }, Number('30000'))

  afterAll(async () => {
    await pool?.end()
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  test('绑定与同键重放只产生一条平台身份和一个 completed 幂等结果', async () => {
    const service = createBindPlatformIdentityService(createDependencies())
    const input = {
      principal: createPrincipal(),
      verifiedIdentity: {
        platform: 'douyin' as const,
        appScope: 'qhz-main',
        hashCandidates: [
          {
            platformSubjectHash: 'd'.repeat(Number('64')),
            subjectHashKeyVersion: 'identity-hmac.current'
          }
        ]
      },
      platformSubjectCiphertext: null,
      occurredAtMs: currentTime + Number('1000'),
      idempotency: {
        principalType: 'user' as const,
        principalScopeHash: 'e'.repeat(Number('64')),
        httpMethod: 'POST',
        normalizedPath: '/api/v2/identity/bindings',
        operationId: 'createIdentityBinding',
        idempotencyKeyHash: 'f'.repeat(Number('64')),
        requestHash: '1'.repeat(Number('64')),
        expiresAtMs: currentTime + Number('604800000'),
        createdAtMs: currentTime + Number('1000')
      }
    }

    const first = await service(input)
    await expect(service(input)).resolves.toEqual(first)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM platform_identities WHERE platform = 'douyin') AS binding_count,
         (SELECT COUNT(*) FROM http_idempotency_records
          WHERE operation_id = 'createIdentityBinding' AND state = 'completed') AS completed_count`
    )
    expect(Number(rows[Number('0')]?.binding_count)).toBe(Number('1'))
    expect(Number(rows[Number('0')]?.completed_count)).toBe(Number('1'))
  })

  test('解绑、会话撤销、版本递增和 completed 幂等结果处于同一真实事务', async () => {
    const service = createRevokePlatformIdentityService(createDependencies())
    const input = {
      principal: createPrincipal(),
      platform: 'phone' as const,
      appScope: 'qhz-main',
      occurredAtMs: currentTime + Number('2000'),
      idempotency: {
        principalType: 'user' as const,
        principalScopeHash: 'e'.repeat(Number('64')),
        httpMethod: 'DELETE',
        normalizedPath: '/api/v2/identity/bindings/phone',
        operationId: 'deleteIdentityBinding',
        idempotencyKeyHash: '2'.repeat(Number('64')),
        requestHash: '3'.repeat(Number('64')),
        expiresAtMs: currentTime + Number('604800000'),
        createdAtMs: currentTime + Number('2000')
      }
    }

    const first = await service(input)
    await expect(service(input)).resolves.toEqual(first)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.session_version, p.binding_status, s.status AS session_status,
              (SELECT COUNT(*) FROM http_idempotency_records
               WHERE operation_id = 'deleteIdentityBinding' AND state = 'completed') AS completed_count
       FROM users AS u
       JOIN platform_identities AS p ON p.user_internal_id = u.id AND p.platform = 'phone'
       JOIN user_sessions AS s ON s.user_internal_id = u.id
       WHERE u.public_user_id = ?`,
      [userRef]
    )
    expect(Number(rows[Number('0')]?.session_version)).toBe(Number('2'))
    expect(rows[Number('0')]?.binding_status).toBe('revoked')
    expect(rows[Number('0')]?.session_status).toBe('revoked')
    expect(Number(rows[Number('0')]?.completed_count)).toBe(Number('1'))
  })
})
