import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'
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
        platformSubjectHash,
        subjectHashKeyVersion
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
          platformSubjectHash,
          subjectHashKeyVersion
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
})
