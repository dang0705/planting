import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const CONTAINER_NAME = `qhz-v2-knowledge-pointer-${process.pid}`
const DATABASE_NAME = 'qinghuazhi_v2_knowledge_pointer'
const ARTIFACT_HASH = 'a'.repeat(64)
const PAYLOAD_HASH = 'b'.repeat(64)

/** 在隔离容器里执行真实 MySQL 命令，保留原始退出码和错误信息。 */
function runDocker(args: readonly string[], input?: string): SpawnSyncReturns<string> {
  return spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
}

/** 运行必须成功的 SQL，失败时直接暴露数据库错误。 */
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
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || '真实 MySQL 执行失败')
  }
  return result.stdout.trim()
}

/** 仅把真实数据库拒绝视为硬约束证据，不以应用层预检查替代。 */
function expectMysqlRejection(sql: string): void {
  const result = runDocker(
    ['exec', '-i', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', DATABASE_NAME],
    sql
  )
  expect(result.status, result.stderr).not.toBe(0)
  expect(result.stderr).toMatch(/ERROR \d+/u)
}

/** 等待 MySQL 真正接受查询；容器处于 running 不代表数据库已就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
    if (result.status === 0 && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('隔离 MySQL 容器未在规定时间内就绪')
}

/**
 * Expected 来源：plant-taxonomy/v1「展示百科、身份和内部知识分别发布」及
 * Master Plan 的不可变发布与单一 active 指针规则。
 * 层次：unit_real_data；真实 MySQL 8.4 和真实 001/002 DDL，
 * 不经过 CloudBase、CMS 审核、HTTP 或发布应用服务。
 */
describe('植物知识发布指针的同类约束', () => {
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
    if (started.status !== 0) {
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
    if (created.status !== 0) {
      throw new Error(created.stderr || created.stdout)
    }
    for (const fileName of ['001_identity.sql', '002_plant_knowledge.sql']) {
      const migration = fs.readFileSync(
        path.join(findProjectRoot(), 'docs/backend-v2/schema', fileName),
        'utf8'
      )
      runMysql(migration)
    }
    runMysql(`
      INSERT INTO plant_knowledge_releases
        (_openid, release_ref, release_kind, schema_version, artifact_ref, artifact_hash,
         record_count, released_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'taxonomy_1', 'taxonomy', 'taxonomy/v1', 'artifact_1', '${ARTIFACT_HASH}',
              1, 1000, 1000, 1000);
      INSERT INTO content_releases
        (_openid, release_ref, content_kind, content_key, schema_version, payload_json,
         payload_hash, released_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'question_1', 'question_package', 'yellow_leaf', 'question/v1', '{}',
              '${PAYLOAD_HASH}', 1000, 1000, 1000);
    `)
  })

  afterAll(() => {
    runDocker(['rm', '--force', CONTAINER_NAME])
  })

  test('允许同类植物知识发布指针', () => {
    runMysql(`
      INSERT INTO active_plant_knowledge_releases
        (_openid, release_kind, release_internal_id, active_release_version,
         active_artifact_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'taxonomy', 1, 'taxonomy/v1', '${ARTIFACT_HASH}', 1, 1000, 1000, 1000);
    `)
    expect(
      runMysql(
        'SELECT release_kind FROM active_plant_knowledge_releases WHERE release_internal_id = 1'
      )
    ).toBe('taxonomy')
  })

  test('拒绝把 taxonomy 发布冒充 identity 活动版本', () => {
    expectMysqlRejection(`
      INSERT INTO active_plant_knowledge_releases
        (_openid, release_kind, release_internal_id, active_release_version,
         active_artifact_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'identity', 1, 'identity/v1', '${ARTIFACT_HASH}', 1, 1000, 1000, 1000);
    `)
  })

  test('拒绝把错误制品摘要作为活动植物知识版本', () => {
    expectMysqlRejection(`
      UPDATE active_plant_knowledge_releases
      SET active_artifact_sha256 = '${PAYLOAD_HASH}'
      WHERE release_kind = 'taxonomy';
    `)
  })

  test('允许同类同键的通用内容发布指针', () => {
    runMysql(`
      INSERT INTO active_content_releases
        (_openid, content_kind, content_key, content_release_internal_id,
         activated_by_ref, activated_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'question_package', 'yellow_leaf', 1, 'reviewer_1', 1000, 1000, 1000);
    `)
    expect(
      runMysql(
        'SELECT content_key FROM active_content_releases WHERE content_release_internal_id = 1'
      )
    ).toBe('yellow_leaf')
  })

  test('拒绝把题包发布冒充浇水规则活动版本', () => {
    expectMysqlRejection(`
      INSERT INTO active_content_releases
        (_openid, content_kind, content_key, content_release_internal_id,
         activated_by_ref, activated_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', 'care_rule', 'yellow_leaf', 1, 'reviewer_1', 1000, 1000, 1000);
    `)
  })

  test('拒绝把另一个业务键的题包发布冒充当前题包', () => {
    expectMysqlRejection(`
      UPDATE active_content_releases
      SET content_key = 'wilt'
      WHERE content_kind = 'question_package' AND content_key = 'yellow_leaf';
    `)
  })
})
