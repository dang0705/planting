import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const CONTAINER_NAME = `qhz-v2-encyclopedia-revision-${process.pid}`
const DATABASE_NAME = 'qinghuazhi_v2_encyclopedia_revision'
/** SHA-256 十六进制摘要的固定长度。 */
const SHA256_HEX_LENGTH = 64
/** 子进程成功退出码。 */
const EXIT_SUCCESS = 0
/** 最多等待数据库就绪的探测次数。 */
const MYSQL_READY_ATTEMPTS = 60
/** 相邻两次数据库就绪探测的间隔毫秒数。 */
const MYSQL_READY_POLL_MS = 250
/** 循环计数器递增步长。 */
const LOOP_STEP = 1
const CONTENT_HASH = 'a'.repeat(SHA256_HEX_LENGTH)
const CHANGED_HASH = 'b'.repeat(SHA256_HEX_LENGTH)

/** 在独立临时 MySQL 8.4 容器中执行命令；测试结束后移除容器。 */
function runDocker(args: readonly string[], input?: string): SpawnSyncReturns<string> {
  return spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
}

/** 执行预期成功的真实 SQL；不将应用层判断冒充数据库约束。 */
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

/** 只接受数据库本身拒绝的证据；成功退出表示硬约束缺失。 */
function expectMysqlRejection(sql: string): void {
  const result = runDocker(
    ['exec', '-i', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', DATABASE_NAME],
    sql
  )
  expect(result.status, result.stderr).not.toBe(EXIT_SUCCESS)
  expect(result.stderr).toMatch(/ERROR \d+/u)
}

/** 容器进入 running 后仍需等待 MySQL 实际接受查询。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = EXIT_SUCCESS; attempt < MYSQL_READY_ATTEMPTS; attempt += LOOP_STEP) {
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
 * Expected 来源：CMS 展示百科补全 Worker「草稿修订与审核的内容边界」及
 * 既有 cms_review_items.draft_revision_internal_id 外键。
 * 层次：unit_real_data；经过真实 MySQL 8.4 与正式 DDL。
 * 不覆盖 CloudBase、CMS 管理员真实性、摘要算法、发布事务或 HTTP。
 */
describe('植物百科修订的审核前后不可改稿边界', () => {
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
    for (const fileName of [
      '001_identity.sql',
      '002_plant_knowledge.sql',
      '012_plant_encyclopedia_revision_immutability.sql',
      '013_plant_encyclopedia_review_binding.sql'
    ]) {
      runMysql(
        fs.readFileSync(path.join(findProjectRoot(), 'docs/backend-v2/schema', fileName), 'utf8')
      )
    }
    runMysql(`
      INSERT INTO plant_taxa
        (_openid, public_taxon_ref, authority_source, authority_taxon_id,
         accepted_scientific_name, taxon_rank, nomenclatural_status,
         source_version, retrieved_at_ms, evidence_hash, review_status, created_at_ms, updated_at_ms)
      VALUES ('', 'taxon_1', 'WFO', 'wfo_1', 'Epipremnum aureum', 'species', 'accepted',
              'v1', 1000, '${CONTENT_HASH}', 'ACTIVE', 1000, 1000);
      INSERT INTO plant_identities
        (_openid, public_identity_ref, primary_taxon_internal_id, display_name_zh,
         identity_kind, review_status, created_at_ms, updated_at_ms)
      VALUES ('', 'identity_1', 1, '绿萝', 'taxon', 'ACTIVE', 1000, 1000);
      INSERT INTO plant_encyclopedia_revisions
        (_openid, revision_ref, plant_identity_internal_id, structure_version,
         display_content_json, source_kind, content_hash, status, created_at_ms, updated_at_ms)
      VALUES ('', 'revision_1', 1, 'plant-encyclopedia-display/v1',
              '{"introduction":"展示介绍","appearance":"绿色叶片","distribution":"热带地区","qa":[{"question":"叶形如何？","answer":"心形。"}]}',
              'qwen_draft', '${CONTENT_HASH}', 'draft', 1000, 1000);
      INSERT INTO cms_review_items
        (_openid, review_item_ref, subject_type, subject_ref, draft_revision_internal_id,
         status, created_at_ms, updated_at_ms)
      VALUES ('', 'review_1', 'encyclopedia', 'revision_1', 1, 'review_pending', 1000, 1000);
    `)
  })

  afterAll(() => {
    runDocker(['rm', '--force', CONTAINER_NAME])
  })

  test('审核项绑定后拒绝原地改写展示内容，即使摘要同时变化', () => {
    expectMysqlRejection(`
      UPDATE plant_encyclopedia_revisions
      SET display_content_json = JSON_SET(display_content_json, '$.introduction', '审核后改稿'),
          content_hash = '${CHANGED_HASH}', updated_at_ms = 2000
      WHERE revision_ref = 'revision_1';
    `)
    expect(
      runMysql(
        "SELECT JSON_UNQUOTE(JSON_EXTRACT(display_content_json, '$.introduction')) FROM plant_encyclopedia_revisions WHERE revision_ref = 'revision_1';"
      )
    ).toBe('展示介绍')
  })

  test('拒绝只改摘要或来源，避免同一修订引用指向不同内容凭据', () => {
    expectMysqlRejection(
      `UPDATE plant_encyclopedia_revisions SET content_hash = '${CHANGED_HASH}' WHERE revision_ref = 'revision_1';`
    )
    expectMysqlRejection(
      "UPDATE plant_encyclopedia_revisions SET source_kind = 'cms' WHERE revision_ref = 'revision_1';"
    )
  })

  test('允许仅推进修订审核状态，不改动内容或其归属', () => {
    runMysql(
      "UPDATE plant_encyclopedia_revisions SET status = 'review_pending', updated_at_ms = 2000 WHERE revision_ref = 'revision_1';"
    )
    expect(
      runMysql("SELECT status FROM plant_encyclopedia_revisions WHERE revision_ref = 'revision_1';")
    ).toBe('review_pending')
  })

  test('审核项必须同时绑定同一条百科修订的内部键和公开引用', () => {
    expectMysqlRejection(`
      INSERT INTO cms_review_items
        (_openid, review_item_ref, subject_type, subject_ref, draft_revision_internal_id,
         status, created_at_ms, updated_at_ms)
      VALUES ('', 'review_mismatch', 'encyclopedia', 'revision_other', 1,
              'review_pending', 1000, 1000);
    `)
    expectMysqlRejection(`
      UPDATE cms_review_items SET subject_ref = 'revision_other'
      WHERE review_item_ref = 'review_1';
    `)
    expectMysqlRejection(`
      INSERT INTO cms_review_items
        (_openid, review_item_ref, subject_type, subject_ref, status,
         created_at_ms, updated_at_ms)
      VALUES ('', 'review_without_revision', 'encyclopedia', 'revision_1',
              'review_pending', 1000, 1000);
    `)
    expect(
      runMysql("SELECT subject_ref FROM cms_review_items WHERE review_item_ref = 'review_1';")
    ).toBe('revision_1')
  })

  test('相同修订引用可以建立另一条独立审核项', () => {
    runMysql(`
      INSERT INTO cms_review_items
        (_openid, review_item_ref, subject_type, subject_ref, draft_revision_internal_id,
         status, created_at_ms, updated_at_ms)
      VALUES ('', 'review_2', 'encyclopedia', 'revision_1', 1,
              'review_pending', 2000, 2000);
    `)
    expect(
      runMysql("SELECT subject_ref FROM cms_review_items WHERE review_item_ref = 'review_2';")
    ).toBe('revision_1')
  })

  test('修改正文产生新修订后，旧审核项不能整体改绑到新修订', () => {
    runMysql(`
      INSERT INTO plant_encyclopedia_revisions
        (_openid, revision_ref, plant_identity_internal_id, structure_version,
         display_content_json, source_kind, content_hash, status, created_at_ms, updated_at_ms)
      VALUES ('', 'revision_2', 1, 'plant-encyclopedia-display/v1',
              '{"introduction":"新修订","appearance":"绿色叶片","distribution":"热带地区","qa":[{"question":"叶形如何？","answer":"心形。"}]}',
              'qwen_draft', '${CHANGED_HASH}', 'draft', 2000, 2000);
    `)
    expectMysqlRejection(`
      UPDATE cms_review_items
      SET draft_revision_internal_id = 2, subject_ref = 'revision_2'
      WHERE review_item_ref = 'review_1';
    `)
    expect(
      runMysql(
        "SELECT CONCAT(draft_revision_internal_id, ':', subject_ref) FROM cms_review_items WHERE review_item_ref = 'review_1';"
      )
    ).toBe('1:revision_1')
  })
})
