import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const PROJECT_ROOT = findProjectRoot()
const MYSQL_IMAGE = 'mysql:8.4'
const DATABASE_NAME = 'qinghuazhi_v2_subscription_allocation'
const CONTAINER_NAME = `qhz-v2-subscription-${String(process.pid)}`
const MYSQL_READY_ATTEMPTS = Number('60')
const MYSQL_READY_INTERVAL_MS = Number('250')

/** 执行 Docker CLI；任何非零退出都保留原始输出并使测试失败。 */
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

/** 等待指定毫秒数，仅用于有界轮询 MySQL 就绪状态。 */
function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/** 以真实查询确认 MySQL 已接受业务连接，避免把容器运行误判为数据库就绪。 */
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
    await wait(MYSQL_READY_INTERVAL_MS)
  }
  throw new Error('MySQL container did not become ready within the bounded wait')
}

/** 在一次性数据库中执行 SQL，并返回无表头批量输出。 */
function runMysql(sql: string): string {
  return runDocker([
    'exec',
    '-i',
    CONTAINER_NAME,
    'mysql',
    '--no-defaults',
    '-uroot',
    '--batch',
    '--skip-column-names',
    DATABASE_NAME
  ], sql)
}

/** 执行预期失败的 SQL，返回真实 MySQL 错误文本供约束断言。 */
function runMysqlExpectingFailure(sql: string): string {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER_NAME,
      'mysql',
      '--no-defaults',
      '-uroot',
      '--batch',
      '--skip-column-names',
      DATABASE_NAME
    ],
    { encoding: 'utf8', input: sql }
  )
  expect(result.status).not.toBe(Number('0'))
  return `${result.stderr}\n${result.stdout}`
}

/** 按最小依赖顺序应用身份、配置治理和订阅真实 DDL。 */
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
    const sql = fs.readFileSync(
      path.join(PROJECT_ROOT, 'docs/backend-v2/schema', fileName),
      'utf8'
    )
    runDocker([
      'exec',
      '-i',
      CONTAINER_NAME,
      'mysql',
      '--no-defaults',
      '-uroot',
      DATABASE_NAME
    ], sql)
  }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的额度守恒合同与 v2 数据字典。
 * 测试层次：L3 / `unit_real_data`；使用真实 MySQL 8.4 和真实 v2 DDL，不经过 HTTP。
 * 替换边界：仅以本地一次性 MySQL 替换 CloudBase MySQL 运行环境。
 * 明确未覆盖：额度预占应用服务、并发锁顺序、Provider 调用、CloudBase 网络与 HTTP 合同。
 */
describe('AI 额度预占分摊的真实 MySQL 守恒约束', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      CONTAINER_NAME,
      '--tmpfs',
      '/var/lib/mysql',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      MYSQL_IMAGE
    ])
    await waitForMysql()
    applySchema()
    runMysql(`
      INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
      VALUES ('', 'usr_subscription_001', 'active', 1, 1000, 1000);

      INSERT INTO ai_quota_grants
        (_openid, grant_ref, user_internal_id, source_type, source_ref,
         granted_amount, available_amount, reserved_amount, consumed_amount,
         capability_scope_json, policy_version, status,
         granted_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
      SELECT '', 'aqg_subscription_001', id, 'TRIAL', 'trial_subscription_001',
             100, 90, 10, 0, JSON_ARRAY('XIAOQING_TEXT'), 'quota-policy-v1', 'partially_used',
             1000, 86401000, 1, 1000, 1000
      FROM users WHERE public_user_id = 'usr_subscription_001';

      INSERT INTO ai_quota_reservations
        (_openid, reservation_ref, user_internal_id, product_action_id,
         cost_policy_version, capability, estimated_amount, settled_amount,
         actual_cost_micros, usage_evidence_ref, platform_absorbed_cost_micros,
         idempotency_key, request_hash, status, expires_at_ms, version,
         created_at_ms, updated_at_ms)
      SELECT '', 'aqr_subscription_001', id, 'action_subscription_001',
             'cost-policy-v1', 'XIAOQING_TEXT', 10, NULL,
             NULL, NULL, 0,
             'idem_subscription_001', REPEAT('a', 64), 'reserved', 61000, 1,
             1000, 1000
      FROM users WHERE public_user_id = 'usr_subscription_001';
    `)
  })

  afterAll(() => {
    spawnSync('docker', ['rm', '--force', CONTAINER_NAME], { encoding: 'utf8' })
  })

  test('初始预占把全部额度记为 remaining，尚未结算或释放', () => {
    runMysql(`
      INSERT INTO ai_quota_reservation_allocations
        (_openid, reservation_internal_id, grant_internal_id,
         reserved_amount, remaining_amount, settled_amount, released_amount,
         created_at_ms, updated_at_ms)
      SELECT '', reservation.id, grant_batch.id,
             10, 10, 0, 0, 1000, 1000
      FROM ai_quota_reservations AS reservation
      JOIN ai_quota_grants AS grant_batch
        ON grant_batch.grant_ref = 'aqg_subscription_001'
      WHERE reservation.reservation_ref = 'aqr_subscription_001';
    `)

    expect(runMysql(`
      SELECT reserved_amount, remaining_amount, settled_amount, released_amount
      FROM ai_quota_reservation_allocations;
    `)).toBe('10\t10\t0\t0')
  })

  test('数据库拒绝任何破坏预占总量守恒的状态转移', () => {
    const error = runMysqlExpectingFailure(`
      UPDATE ai_quota_reservation_allocations
      SET remaining_amount = 5, settled_amount = 3, released_amount = 1, updated_at_ms = 2000;
    `)

    expect(error).toMatch(/ck_ai_allocation_conservation|check constraint/i)
    expect(runMysql(`
      SELECT reserved_amount, remaining_amount, settled_amount, released_amount
      FROM ai_quota_reservation_allocations;
    `)).toBe('10\t10\t0\t0')
  })

  test('合法终态可把预占额度完整分为结算与释放两部分', () => {
    runMysql(`
      UPDATE ai_quota_reservation_allocations
      SET remaining_amount = 0, settled_amount = 7, released_amount = 3, updated_at_ms = 3000;
    `)

    expect(runMysql(`
      SELECT reserved_amount, remaining_amount, settled_amount, released_amount
      FROM ai_quota_reservation_allocations;
    `)).toBe('10\t0\t7\t3')
  })
})
