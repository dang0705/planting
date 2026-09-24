import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/** 本测试专用数据库容器，不与其他 MySQL 用例共享状态。 */
const CONTAINER_NAME = `qhz-v2-knowledge-release-${process.pid}`
/** 本测试专用数据库名称。 */
const DATABASE_NAME = 'qinghuazhi_v2_knowledge_release'
/** 数据库启动探测最多执行的次数。 */
const MYSQL_READY_ATTEMPTS = 60
/** 两次数据库探测之间的等待时间，单位为毫秒。 */
const MYSQL_READY_POLL_MS = 250
/** 进程成功退出码。 */
const EXIT_SUCCESS = 0
/** SHA-256 十六进制摘要长度。 */
const SHA256_HEX_LENGTH = 64
/** 循环计数递增步长。 */
const LOOP_STEP = 1
/** 发布测试制品的确定性 SHA-256 占位值；只用于验证数据库不可变性。 */
const ARTIFACT_HASH = 'a'.repeat(SHA256_HEX_LENGTH)
/** 发布明细的确定性 SHA-256 占位值；不冒充真实内容摘要。 */
const ITEM_HASH = 'b'.repeat(SHA256_HEX_LENGTH)

/** 在独立 MySQL 8.4 容器内执行命令。 */
function runDocker(args: readonly string[], input?: string): SpawnSyncReturns<string> {
  return spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
}

/** 执行必须成功的 SQL，并返回原始查询结果。 */
function runMysql(sql: string): string {
  const result = runDocker(
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
    sql
  )
  if (result.status !== EXIT_SUCCESS) {
    throw new Error(result.stderr || result.stdout || '真实 MySQL 执行失败')
  }
  return result.stdout.trim()
}

/** 断言拒绝来自数据库本身，而不是测试替身或应用层条件。 */
function expectMysqlRejection(sql: string): void {
  const result = runDocker(
    ['exec', '-i', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', DATABASE_NAME],
    sql
  )
  expect(result.status, result.stderr).not.toBe(EXIT_SUCCESS)
  expect(result.stderr).toMatch(/ERROR \d+/u)
}

/** 等待数据库真正接受查询；容器处于 running 不等于服务已就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = 0; attempt < MYSQL_READY_ATTEMPTS; attempt += LOOP_STEP) {
    const result = runDocker([
      'exec',
      CONTAINER_NAME,
      'mysql',
      '--no-defaults',
      '-uroot',
      '--batch',
      '--skip-column-names',
      '-e',
      'SELECT @@port;'
    ])
    if (result.status === EXIT_SUCCESS && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, MYSQL_READY_POLL_MS))
  }
  throw new Error('隔离 MySQL 容器未在规定时间内就绪')
}

/**
 * Expected 来源：P2 CMS 票据“不可变 release”、植物分类合同的发布制品不可变要求。
 * 层次：unit_real_data；经过正式 DDL 与真实 MySQL 8.4。
 * 不覆盖应用层发布事务、CMS 审核鉴权、制品哈希算法、CloudBase 或真实 HTTP。
 */
describe('植物知识发布制品写入后不可变', () => {
  beforeAll(async () => {
    const started = runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      CONTAINER_NAME,
      '--tmpfs',
      '/var/lib/mysql',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      'mysql:8.4'
    ])
    if (started.status !== EXIT_SUCCESS) {
      throw new Error(started.stderr || started.stdout)
    }
    await waitForMysql()
    const created = runDocker([
      'exec',
      CONTAINER_NAME,
      'mysql',
      '--no-defaults',
      '-uroot',
      '-e',
      `CREATE DATABASE ${DATABASE_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    ])
    if (created.status !== EXIT_SUCCESS) {
      throw new Error(created.stderr || created.stdout)
    }
    for (const fileName of ['001_identity.sql', '002_plant_knowledge.sql']) {
      runMysql(
        fs.readFileSync(path.join(findProjectRoot(), 'docs/backend-v2/schema', fileName), 'utf8')
      )
    }
    runMysql(`
      INSERT INTO plant_knowledge_releases
        (_openid, release_ref, release_kind, schema_version, artifact_ref,
         artifact_hash, record_count, released_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'release_1', 'encyclopedia', 'knowledge-release/v1',
              'assets/release_1.json', '${ARTIFACT_HASH}', 1, 1000, 1000, 1000);
      INSERT INTO plant_knowledge_releases
        (_openid, release_ref, release_kind, schema_version, artifact_ref,
         artifact_hash, record_count, released_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'release_2', 'encyclopedia', 'knowledge-release/v1',
              'assets/release_2.json', '${ITEM_HASH}', 0, 1100, 1100, 1100);
      INSERT INTO plant_knowledge_release_items
        (_openid, release_internal_id, subject_kind, subject_ref,
         evidence_manifest_sha256, decision_ref, admission_status,
         release_item_sha256, created_at_ms, updated_at_ms)
      VALUES ('', 1, 'encyclopedia', 'revision_1', '${ITEM_HASH}', 'review_1',
              'ACTIVE', '${ITEM_HASH}', 1000, 1000);
    `)
    runMysql(
      fs.readFileSync(
        path.join(
          findProjectRoot(),
          'docs/backend-v2/schema/014_plant_knowledge_release_immutability.sql'
        ),
        'utf8'
      )
    )
  })

  afterAll(() => {
    runDocker(['rm', '--force', CONTAINER_NAME])
  })

  test('拒绝原地替换发布制品引用或摘要，原记录保持不变', () => {
    expectMysqlRejection(
      "UPDATE plant_knowledge_releases SET artifact_ref = 'assets/other.json' WHERE release_ref = 'release_1';"
    )
    expectMysqlRejection(
      `UPDATE plant_knowledge_releases SET artifact_hash = '${ITEM_HASH}' WHERE release_ref = 'release_1';`
    )
    expect(
      runMysql("SELECT artifact_ref FROM plant_knowledge_releases WHERE release_ref = 'release_1';")
    ).toBe('assets/release_1.json')
  })

  test('拒绝改写或删除发布明细，原对象仍可读回', () => {
    expectMysqlRejection(
      "UPDATE plant_knowledge_release_items SET subject_ref = 'revision_2' WHERE subject_ref = 'revision_1';"
    )
    expectMysqlRejection(
      "DELETE FROM plant_knowledge_release_items WHERE subject_ref = 'revision_1';"
    )
    expect(
      runMysql(
        'SELECT subject_ref FROM plant_knowledge_release_items WHERE release_internal_id = 1;'
      )
    ).toBe('revision_1')
  })

  test('拒绝删除已发布制品，同时允许活动指针独立切换版本', () => {
    // release_2 没有明细或活动指针；删除失败只能来自发布不可变约束。
    expectMysqlRejection("DELETE FROM plant_knowledge_releases WHERE release_ref = 'release_2';")
    expect(
      runMysql("SELECT release_ref FROM plant_knowledge_releases WHERE release_ref = 'release_2';")
    ).toBe('release_2')
    runMysql(`
      INSERT INTO active_plant_knowledge_releases
        (_openid, release_kind, release_internal_id, active_release_version,
         active_artifact_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'encyclopedia', 1, 'v1', '${ARTIFACT_HASH}', 1, 1000, 1000, 1000);
      UPDATE active_plant_knowledge_releases
      SET version = 2, activated_at_ms = 2000, updated_at_ms = 2000
      WHERE release_kind = 'encyclopedia' AND version = 1;
    `)
    expect(
      runMysql(
        "SELECT version FROM active_plant_knowledge_releases WHERE release_kind = 'encyclopedia';"
      )
    ).toBe('2')
  })
})
