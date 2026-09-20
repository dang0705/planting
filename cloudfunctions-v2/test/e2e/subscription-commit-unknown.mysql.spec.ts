import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import {
  createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository,
  createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository,
  type AiQuotaCommitUnknownSqlRow,
  type AiQuotaCommitUnknownReadOnlySqlExecutor
} from '../../src/subscription/repository/mysql-ai-quota-commit-unknown-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const PROJECT_ROOT = findProjectRoot()
const MYSQL_IMAGE = 'mysql:8.4'
const DATABASE_NAME = 'qinghuazhi_v2_subscription_reconcile'
const CONTAINER_NAME = `qhz-v2-reconcile-${String(process.pid)}`
const MYSQL_READY_ATTEMPTS = Number('60')
const MYSQL_READY_INTERVAL_MS = Number('250')
const nowMs = Number('1758376800000')

let writerPool: Pool | undefined
let readerPool: Pool | undefined
let writerConnectionId: number

/** 执行 Docker CLI；失败时保留原始输出并中止真实数据库测试。 */
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

/** 有界等待 MySQL 容器开始接受真实查询。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < MYSQL_READY_ATTEMPTS; attempt += Number('1')) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        CONTAINER_NAME,
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
    await new Promise(resolve => setTimeout(resolve, MYSQL_READY_INTERVAL_MS))
  }
  throw new Error('MySQL container did not become ready within the bounded wait')
}

/** 创建隔离数据库并应用额度表依赖的真实 v2 DDL。 */
function applySchema(): void {
  runDocker([
    'exec',
    CONTAINER_NAME,
    'mysql',
    '--no-defaults',
    '-uroot',
    '-e',
    `CREATE DATABASE \`${DATABASE_NAME}\`;`
  ])
  for (const fileName of ['001_identity.sql', '007_configuration.sql', '005_subscription.sql']) {
    const sql = fs.readFileSync(path.join(PROJECT_ROOT, 'docs/backend-v2/schema', fileName), 'utf8')
    runDocker(
      ['exec', '-i', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', DATABASE_NAME],
      sql
    )
  }
}

/** 读取 Docker 随机映射的本机 MySQL 端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', CONTAINER_NAME, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析 MySQL 容器映射端口')
  }
  return port
}

/** 将只读连接池适配为不接收旧事务、也不暴露写方法的 SQL 端口。 */
function createReadOnlyExecutor(pool: Pool): AiQuotaCommitUnknownReadOnlySqlExecutor {
  return {
    executeQuery: async (sql, parameters) => {
      const safeParameters = parameters.map(parameter => {
        if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
          return parameter
        }
        throw new Error('只读 Repository 产生了不受支持的 SQL 参数')
      })
      const [rows] = await pool.execute<RowDataPacket[]>(sql, safeParameters)
      return rows as unknown as readonly AiQuotaCommitUnknownSqlRow[]
    }
  }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的提交结果未知失败关闭合同。
 * 测试层次：L3 / `unit_real_data`；执行真实 MySQL 8.4、真实 DDL 和仅 SELECT 新连接。
 * 替换边界：仅以本地一次性 MySQL 替代 CloudBase MySQL。
 * 明确未覆盖：真实网络中断时机、CloudBase 连接池、HTTP 和 Provider。
 */
describe('AI 额度提交未知的新连接只读对账', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      CONTAINER_NAME,
      '--tmpfs',
      '/var/lib/mysql',
      '--publish',
      '127.0.0.1::3306',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      MYSQL_IMAGE
    ])
    await waitForMysql()
    applySchema()
    const port = resolvePublishedPort()
    writerPool = createPool({
      host: '127.0.0.1',
      port,
      user: 'root',
      database: DATABASE_NAME,
      connectionLimit: Number('1')
    })
    const [connectionRows] = await writerPool.query<RowDataPacket[]>('SELECT CONNECTION_ID() AS id')
    writerConnectionId = Number(connectionRows[Number('0')]?.id)
    await writerPool.execute(`
      INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
      VALUES ('', 'usr_subscription_reconcile', 'active', 1, 1000, 1000)
    `)
    await writerPool.execute(
      `
        INSERT INTO ai_quota_reservations
          (_openid, reservation_ref, user_internal_id, product_action_id,
           cost_policy_version, capability, estimated_amount, settled_amount,
           actual_cost_micros, usage_evidence_ref, platform_absorbed_cost_micros,
           idempotency_key, request_hash, status, expires_at_ms, version,
           created_at_ms, updated_at_ms)
        SELECT '', ?, id, ?, 'ai-cost/2026-09-20.1', 'USER_AGENT_TEXT',
               8, NULL, NULL, NULL, 0, ?, ?, 'reserved', ?, 1, ?, ?
        FROM users WHERE public_user_id = 'usr_subscription_reconcile'
      `,
      [
        'aqr_commit_reserved',
        'action_commit_reserved',
        'idem_commit_reserved',
        'a'.repeat(Number('64')),
        nowMs + Number('60000'),
        nowMs,
        nowMs
      ]
    )
    await writerPool.execute(
      `
        INSERT INTO ai_quota_reservations
          (_openid, reservation_ref, user_internal_id, product_action_id,
           cost_policy_version, capability, estimated_amount, settled_amount,
           actual_cost_micros, usage_evidence_ref, platform_absorbed_cost_micros,
           idempotency_key, request_hash, status, expires_at_ms, version,
           created_at_ms, updated_at_ms)
        SELECT '', ?, id, ?, 'ai-cost/2026-09-20.1', 'USER_AGENT_TEXT',
               8, 6, 4800, 'usage_bailian_commit_001', 0, ?, ?, 'settled', ?, 2, ?, ?
        FROM users WHERE public_user_id = 'usr_subscription_reconcile'
      `,
      [
        'aqr_commit_settled',
        'action_commit_settled',
        'idem_commit_settled',
        'b'.repeat(Number('64')),
        nowMs + Number('60000'),
        nowMs,
        nowMs
      ]
    )
    await writerPool.execute(`CREATE USER 'qhz_readonly'@'%' IDENTIFIED BY 'local-test-only'`)
    await writerPool.execute(
      `GRANT SELECT ON \`${DATABASE_NAME}\`.* TO 'qhz_readonly'@'%'`
    )
    await writerPool.end()
    writerPool = undefined
    readerPool = createPool({
      host: '127.0.0.1',
      port,
      user: 'qhz_readonly',
      password: 'local-test-only',
      database: DATABASE_NAME,
      connectionLimit: Number('1')
    })
  })

  afterAll(async () => {
    await readerPool?.end()
    await writerPool?.end()
    spawnSync('docker', ['rm', '--force', CONTAINER_NAME], { encoding: 'utf8' })
  })

  test('关闭写连接后仅用新只读连接按用户归属证明预占和结算终态', async () => {
    if (readerPool === undefined) {
      throw new Error('只读连接池未初始化')
    }
    const [readerConnectionRows] = await readerPool.query<RowDataPacket[]>(
      'SELECT CONNECTION_ID() AS id'
    )
    expect(Number(readerConnectionRows[Number('0')]?.id)).not.toBe(writerConnectionId)
    await expect(
      readerPool.execute('INSERT INTO users (_openid) VALUES (?)', ['forbidden'])
    ).rejects.toThrow()

    const executor = createReadOnlyExecutor(readerPool)
    const reservationRepository =
      createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository(executor)
    const settlementRepository = createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository(
      executor
    )
    const owner = 'usr_subscription_reconcile' as UserRef

    await expect(
      reservationRepository.read({
        userRef: owner,
        productActionId: 'action_commit_reserved',
        idempotencyKey: 'idem_commit_reserved'
      })
    ).resolves.toMatchObject({
      reservationRef: 'aqr_commit_reserved',
      requestHash: 'a'.repeat(Number('64')),
      status: 'reserved',
      estimatedAmount: 8
    })
    await expect(
      settlementRepository.read({ userRef: owner, reservationRef: 'aqr_commit_settled' })
    ).resolves.toEqual({
      reservationRef: 'aqr_commit_settled',
      status: 'settled',
      estimatedAmount: 8,
      settledAmount: 6,
      actualCostMicros: 4800,
      usageEvidenceRef: 'usage_bailian_commit_001',
      platformAbsorbedCostMicros: 0
    })
    await expect(
      settlementRepository.read({
        userRef: 'usr_other_owner' as UserRef,
        reservationRef: 'aqr_commit_settled'
      })
    ).resolves.toBeNull()
  })
})
