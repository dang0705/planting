import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const PROJECT_ROOT = findProjectRoot()
const MYSQL_IMAGE = 'mysql:8.4'
const DATABASE_NAME = 'qinghuazhi_v2_user_plant_concurrency'
const CONTAINER_NAME = `qhz-v2-user-plant-${String(process.pid)}`
const MYSQL_READY_ATTEMPTS = Number('60')
const MYSQL_READY_INTERVAL_MS = Number('250')
const SECOND_CONNECTION_DELAY_MS = Number('200')

/** 执行 Docker CLI 并在失败时保留标准输出和错误输出，禁止静默假绿。 */
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

/** 等待指定毫秒数，只用于协调两个真实 MySQL 客户端的起始顺序。 */
function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/** 等待 MySQL 服务端真正接受连接，容器运行状态本身不等于数据库就绪。 */
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

/** 使用独立 mysql 客户端连接执行 SQL，并返回无表头批量输出。 */
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

/** 启动一条独立 mysql 客户端连接，用于真实并发事务。 */
function startMysql(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
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
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', code => {
      if (code === Number('0')) {
        resolve(stdout.trim())
        return
      }
      const logs = spawnSync('docker', ['logs', '--tail', '80', CONTAINER_NAME], {
        encoding: 'utf8'
      })
      reject(
        new Error(
          `Concurrent mysql client failed: ${stderr || stdout}\nMySQL container logs:\n${logs.stderr || logs.stdout}`
        )
      )
    })
    child.stdin.end(sql)
  })
}

/** 将 v2 依赖顺序内的真实 DDL 应用到一次性空库。 */
function applySchema(): void {
  runDocker(['exec', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', '-e', `CREATE DATABASE \`${DATABASE_NAME}\`;`])
  const schemaFiles = [
    '001_identity.sql',
    '002_plant_knowledge.sql',
    '003_user_plant.sql',
    '008_foundation.sql'
  ]
  for (const fileName of schemaFiles) {
    const sql = fs.readFileSync(path.join(PROJECT_ROOT, 'docs/backend-v2/schema', fileName), 'utf8')
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
 * Expected 来源：`user-plant/v1`、`http-api/v1` 和 P2 用户植物创建同事务合同。
 * 测试层次：L3 / `unit_real_data`；使用两个真实 MySQL 8.4 客户端和真实 v2 DDL，不经过 HTTP。
 * 明确未覆盖：CloudBase MySQL、真实网络断线分类、云函数运行时和 API 网关。
 */
describe('用户植物创建的真实 MySQL 并发与只读对账', () => {
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
      VALUES ('', 'usr_concurrency_001', 'active', 1, 1000, 1000);
    `)
  })

  afterAll(() => {
    spawnSync('docker', ['rm', '--force', CONTAINER_NAME], { encoding: 'utf8' })
  })

  test('两个连接按统一用户行串行化，active 上限为一时最终只创建一株', async () => {
    const firstTransaction = startMysql(`
      SET SESSION innodb_lock_wait_timeout = 10;
      START TRANSACTION;
      SELECT id FROM users WHERE public_user_id = 'usr_concurrency_001' AND status = 'active' FOR UPDATE;
      SELECT SLEEP(1.5);
      INSERT INTO user_plants
        (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status,
         confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
      SELECT '', 'upl_concurrency_a', id, 'active', 'unidentified', NULL, 1, 2000, 2000
      FROM users WHERE public_user_id = 'usr_concurrency_001';
      COMMIT;
    `)

    await wait(SECOND_CONNECTION_DELAY_MS)
    const secondTransaction = startMysql(`
      SET SESSION innodb_lock_wait_timeout = 10;
      START TRANSACTION;
      SELECT id FROM users WHERE public_user_id = 'usr_concurrency_001' AND status = 'active' FOR UPDATE;
      SELECT COUNT(*) FROM user_plants
      WHERE user_internal_id = (SELECT id FROM users WHERE public_user_id = 'usr_concurrency_001')
        AND lifecycle_status = 'active';
      INSERT INTO user_plants
        (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status,
         confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
      SELECT '', 'upl_concurrency_b', id, 'active', 'unidentified', NULL, 1, 2001, 2001
      FROM users
      WHERE public_user_id = 'usr_concurrency_001'
        AND (SELECT COUNT(*) FROM user_plants
             WHERE user_internal_id = users.id AND lifecycle_status = 'active') < 1;
      SELECT ROW_COUNT();
      COMMIT;
    `)

    const results = await Promise.allSettled([firstTransaction, secondTransaction])
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (failures.length > Number('0')) {
      throw new AggregateError(
        failures.map(result => result.reason),
        '真实并发 MySQL 客户端存在失败'
      )
    }
    const firstOutput = (results[Number('0')] as PromiseFulfilledResult<string>).value
    const secondOutput = (results[Number('1')] as PromiseFulfilledResult<string>).value
    expect(firstOutput.split('\n')).toContain('0')
    expect(secondOutput.split('\n').slice(-2)).toEqual(['1', '0'])
    expect(runMysql(`
      SELECT COUNT(*) FROM user_plants
      WHERE user_internal_id = (SELECT id FROM users WHERE public_user_id = 'usr_concurrency_001')
        AND lifecycle_status = 'active';
    `)).toBe('1')
  })

  test('新连接只读查询只能在 completed 且摘要一致时取得公开结果', () => {
    const hash = 'a'.repeat(Number('64'))
    const keyHash = 'b'.repeat(Number('64'))
    const requestHash = 'c'.repeat(Number('64'))
    const responseJson = '{"data":{"user_plant_id":"upl_concurrency_a"}}'
    const responseHash = '94c221931e93eb3342a21e621c67f55a911b246424ca90625664079653195cb6'
    runMysql(`
      INSERT INTO http_idempotency_records
        (_openid, principal_type, principal_scope_hash, http_method, normalized_path, operation_id,
         idempotency_key_hash, request_hash, state, response_status, response_json, response_hash,
         stable_error_type, expires_at_ms, completed_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'user', '${hash}', 'POST', '/api/v2/user-plants', 'createUserPlant',
              '${keyHash}', '${requestHash}', 'completed', 200, '${responseJson}', '${responseHash}',
              NULL, 999999, 3000, 2000, 3000);
    `)

    const output = runMysql(`
      SELECT request_hash, state, response_status, JSON_UNQUOTE(JSON_EXTRACT(response_json, '$.data.user_plant_id'))
      FROM http_idempotency_records
      WHERE principal_type = 'user'
        AND principal_scope_hash = '${hash}'
        AND http_method = 'POST'
        AND normalized_path = '/api/v2/user-plants'
        AND operation_id = 'createUserPlant'
        AND idempotency_key_hash = '${keyHash}';
    `)
    expect(output.split('\t')).toEqual([requestHash, 'completed', '200', 'upl_concurrency_a'])
  })
})
