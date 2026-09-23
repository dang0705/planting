import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const CONTAINER_NAME = `qhz-v2-diagnosis-knowledge-` + String(process.pid)
const DATABASE_NAME = 'qinghuazhi_v2_diagnosis_knowledge'
const SHA256_HEX_LENGTH = Number('64')
const EXIT_SUCCESS = Number('0')
const NEXT_ATTEMPT = Number('1')
const MYSQL_READY_ATTEMPTS = Number('60')
const MYSQL_READY_INTERVAL_MS = Number('250')
const DOCKER_MAX_BUFFER_BYTES = Number('10485760')
const HASH_A = 'a'.repeat(SHA256_HEX_LENGTH)
const HASH_B = 'b'.repeat(SHA256_HEX_LENGTH)
const HASH_C = 'c'.repeat(SHA256_HEX_LENGTH)
const HASH_D = 'd'.repeat(SHA256_HEX_LENGTH)
const HASH_E = 'e'.repeat(SHA256_HEX_LENGTH)
const HASH_F = 'f'.repeat(SHA256_HEX_LENGTH)

/** 运行隔离容器中的真实 MySQL，保留失败信息供约束读回审计。 */
function runDocker(args: readonly string[], input?: string): SpawnSyncReturns<string> {
  return spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: DOCKER_MAX_BUFFER_BYTES })
}

/** 执行应当成功的 SQL；任何错误都必须直接使测试失败。 */
function runMysql(sql: string): string {
  const result = runDocker(
    ['exec', '-i', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', '--batch', '--skip-column-names', DATABASE_NAME],
    sql,
  )
  if (result.status !== EXIT_SUCCESS) {
    throw new Error(result.stderr || result.stdout || '真实 MySQL 执行失败')
  }
  return result.stdout.trim()
}

/** 执行应由数据库约束拒绝的 SQL，不把应用层检查冒充外键证明。 */
function expectMysqlRejection(sql: string): void {
  const result = runDocker(['exec', '-i', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', DATABASE_NAME], sql)
  expect(result.status, result.stderr).not.toBe(EXIT_SUCCESS)
  expect(result.stderr).toMatch(/ERROR \d+/u)
}

/** 等待数据库真正接受查询；容器 running 不等于 MySQL 就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = EXIT_SUCCESS; attempt < MYSQL_READY_ATTEMPTS; attempt += NEXT_ATTEMPT) {
    const result = runDocker([
      'exec', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', '--batch',
      '--skip-column-names', '-e', 'SELECT @@port;',
    ])
    if (result.status === EXIT_SUCCESS && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, MYSQL_READY_INTERVAL_MS))
  }
  throw new Error('隔离 MySQL 容器未在规定时间内就绪')
}

/**
 * Expected 来源：诊断知识持久化合同中的审核原样内容、同包审核和活动指针规则。
 * 层次：unit_real_data / L3；真实 MySQL 8.4、真实 009 DDL，未连接 CMS、HTTP 或 CloudBase。
 */
describe('诊断知识审核和发布的真实 MySQL 约束', () => {
  beforeAll(async () => {
    const started = runDocker([
      'run', '--detach', '--rm', '--name', CONTAINER_NAME, '--tmpfs', '/var/lib/mysql',
      '--env', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4',
    ])
    if (started.status !== EXIT_SUCCESS) {
      throw new Error(started.stderr || started.stdout)
    }
    await waitForMysql()

    const created = runDocker([
      'exec', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', '-e',
      'CREATE DATABASE ' + DATABASE_NAME + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
    ])
    if (created.status !== EXIT_SUCCESS) {
      throw new Error(created.stderr || created.stdout)
    }

    const migration = fs.readFileSync(
      path.join(findProjectRoot(), 'docs/backend-v2/schema/009_diagnosis_knowledge.sql'), 'utf8',
    )
    runMysql(migration)
    const revocationMigration = fs.readFileSync(
      path.join(findProjectRoot(), 'docs/backend-v2/schema/010_diagnosis_review_revocations.sql'), 'utf8',
    )
    runMysql(revocationMigration)
    runMysql(`
      INSERT INTO diagnosis_knowledge_candidates
        (_openid, candidate_ref, bundle_code, revision_no, schema_version, content_sha256,
         candidate_json, candidate_state, created_at_ms)
      VALUES
        ('', 'candidate_a', 'yellow_leaf', 1, 'diagnosis-knowledge/v1', '${HASH_A}', '{}', 'reviewed', 1000),
        ('', 'candidate_b', 'yellow_leaf', 2, 'diagnosis-knowledge/v1', '${HASH_B}', '{}', 'reviewed', 1001),
        ('', 'candidate_c', 'yellow_leaf', 3, 'diagnosis-knowledge/v1', '${HASH_C}', '{}', 'reviewed', 1002);
      INSERT INTO diagnosis_review_attestations
        (_openid, review_ref, reviewer_ref_hash, candidate_internal_id, content_sha256,
         decision, protocol_version, decided_at_ms)
      VALUES
        ('', 'review_a_approved', '${HASH_A}', 1, '${HASH_A}', 'approved', 'cms-review/v1', 1100),
        ('', 'review_b_rejected', '${HASH_B}', 2, '${HASH_B}', 'rejected', 'cms-review/v1', 1101),
        ('', 'review_c_approved', '${HASH_C}', 3, '${HASH_C}', 'approved', 'cms-review/v1', 1102);
    `)
  })

  afterAll(() => {
    runDocker(['rm', '--force', CONTAINER_NAME])
  })

  test('审核凭据不能绑定另一个候选的内容摘要', () => {
    expectMysqlRejection(`
      INSERT INTO diagnosis_review_attestations
        (_openid, review_ref, reviewer_ref_hash, candidate_internal_id, content_sha256,
         decision, protocol_version, decided_at_ms)
      VALUES ('', 'wrong_hash', '${HASH_A}', 1, '${HASH_B}', 'approved', 'cms-review/v1', 1200);
    `)
  })

  test('发布不能借用另一个候选的审核凭据', () => {
    expectMysqlRejection(`
      INSERT INTO diagnosis_knowledge_releases
        (_openid, release_ref, bundle_code, version, candidate_internal_id,
         candidate_content_sha256, review_attestation_internal_id,
         schema_version, package_json, package_sha256, release_state, published_at_ms)
      VALUES
        ('', 'release_wrong_review', 'yellow_leaf', 1, 2, '${HASH_B}', 1,
         'diagnosis-knowledge/v1', '{}', '${HASH_C}', 'published', 1300);
    `)
  })

  test('驳回的审核凭据不能成为发布依据', () => {
    expectMysqlRejection(`
      INSERT INTO diagnosis_knowledge_releases
        (_openid, release_ref, bundle_code, version, candidate_internal_id,
         candidate_content_sha256, review_attestation_internal_id,
         schema_version, package_json, package_sha256, release_state, published_at_ms)
      VALUES
        ('', 'release_rejected', 'yellow_leaf', 2, 2, '${HASH_B}', 2,
         'diagnosis-knowledge/v1', '{}', '${HASH_D}', 'published', 1301);
    `)
  })

  test('发布包范围必须与候选范围一致，且活动指针同范围唯一', () => {
    expectMysqlRejection(`
      INSERT INTO diagnosis_knowledge_releases
        (_openid, release_ref, bundle_code, version, candidate_internal_id,
         candidate_content_sha256, review_attestation_internal_id,
         schema_version, package_json, package_sha256, release_state, published_at_ms)
      VALUES
        ('', 'release_wrong_bundle', 'wilt', 1, 1, '${HASH_A}', 1,
         'diagnosis-knowledge/v1', '{}', '${HASH_E}', 'published', 1302);
    `)

    runMysql(`
      INSERT INTO diagnosis_knowledge_releases
        (_openid, release_ref, bundle_code, version, candidate_internal_id,
         candidate_content_sha256, review_attestation_internal_id,
         schema_version, package_json, package_sha256, release_state, published_at_ms)
      VALUES
        ('', 'release_valid', 'yellow_leaf', 3, 1, '${HASH_A}', 1,
         'diagnosis-knowledge/v1', '{}', '${HASH_F}', 'published', 1303);
    `)
    const releaseId = runMysql("SELECT id FROM diagnosis_knowledge_releases WHERE release_ref = 'release_valid';")
    runMysql(`
      INSERT INTO active_diagnosis_knowledge_releases
        (_openid, bundle_code, release_internal_id, version, activated_at_ms)
      VALUES ('', 'yellow_leaf', ${releaseId}, 1, 1400);
    `)
    expect(runMysql("SELECT release_ref FROM diagnosis_knowledge_releases WHERE release_ref = 'release_valid';")).toBe('release_valid')
    expectMysqlRejection(`
      INSERT INTO active_diagnosis_knowledge_releases
        (_openid, bundle_code, release_internal_id, version, activated_at_ms)
      VALUES ('', 'yellow_leaf', ${releaseId}, 1, 1401);
    `)
  })

  test('撤销只接受批准凭据且不改写原审核记录', () => {
    expectMysqlRejection(`
      INSERT INTO diagnosis_review_revocations
        (_openid, revocation_ref, target_review_internal_id, target_decision,
         request_sha256, revoked_by_ref_hash, reason_zh, revoked_at_ms)
      VALUES ('', 'revoke_empty_reason', 1, 'approved', '${HASH_E}', '${HASH_D}', '  ', 1499);
    `)
    expect(runMysql('SELECT COUNT(*) FROM diagnosis_review_revocations;')).toBe('0')
    runMysql(`
      INSERT INTO diagnosis_review_revocations
        (_openid, revocation_ref, target_review_internal_id, target_decision,
         request_sha256, revoked_by_ref_hash, reason_zh, revoked_at_ms)
      VALUES ('', 'revoke_approved_a', 1, 'approved', '${HASH_C}', '${HASH_D}', '来源主张失效。', 1500);
    `)
    expect(runMysql("SELECT decision FROM diagnosis_review_attestations WHERE review_ref = 'review_a_approved';")).toBe('approved')
    expect(runMysql("SELECT reason_zh FROM diagnosis_review_revocations WHERE revocation_ref = 'revoke_approved_a';")).toBe('来源主张失效。')

    expectMysqlRejection(`
      INSERT INTO diagnosis_review_revocations
        (_openid, revocation_ref, target_review_internal_id, target_decision,
         request_sha256, revoked_by_ref_hash, reason_zh, revoked_at_ms)
      VALUES ('', 'revoke_rejected_b', 2, 'approved', '${HASH_E}', '${HASH_D}', '不能撤销驳回。', 1501);
    `)
    expectMysqlRejection(`
      INSERT INTO diagnosis_review_revocations
        (_openid, revocation_ref, target_review_internal_id, target_decision,
         request_sha256, revoked_by_ref_hash, reason_zh, revoked_at_ms)
      VALUES ('', 'revoke_approved_a_again', 1, 'approved', '${HASH_F}', '${HASH_D}', '重复撤销。', 1502);
    `)
    expectMysqlRejection(`
      INSERT INTO diagnosis_review_revocations
        (_openid, revocation_ref, target_review_internal_id, target_decision,
         request_sha256, revoked_by_ref_hash, reason_zh, revoked_at_ms)
      VALUES ('', 'revoke_approved_a', 3, 'approved', '${HASH_E}', '${HASH_D}', '同引用异参。', 1503);
    `)
    expect(runMysql('SELECT COUNT(*) FROM diagnosis_review_revocations;')).toBe('1')
  })
})
