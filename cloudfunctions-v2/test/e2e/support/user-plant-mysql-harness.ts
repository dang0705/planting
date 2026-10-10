import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { createMysql2ConnectionSource } from '../../../src/foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../../src/foundation/http/request-chain.js'
import { createMysqlCapabilitySnapshotReader } from '../../../src/subscription/repository/mysql-capability-snapshot-reader.js'
import { createUserPlantServer, type UserPlantServerDependencies } from '../../../src/user-plant/http/server.js'
import { calculateCanonicalJsonSha256 } from '../../../src/foundation/json/canonical-json-sha256.js'
import { createMysqlPublishedHttpWritePolicyReader, createMysqlPublishedProfileWritePolicyReader } from '../../../src/user-plant/repository/mysql-published-profile-write-policy-reader.js'
import { findProjectRoot } from '../../support/project-root.js'

/**
 * user-plant 真实库测试夹具（unit_real_data）：本机 Docker MySQL 8.4 + schema manifest 全量 DDL + 真实 user-plant HTTP 服务。
 * 只连本机隔离容器，不连接 CloudBase、不写云端库。两个登录用户（owner/stranger）各有一个有效会话与一份有效能力快照。
 */

/** 容器与服务句柄。 */
export interface UserPlantMysqlHarness {
  /** 在测试库执行 SQL 并返回 batch 文本输出（制表符分隔）。 */
  readonly sql: (text: string) => string
  /** 发起 HTTP 请求；body 为字符串时自动带 JSON 媒体类型。 */
  readonly call: (method: string, pathName: string, options?: { bearer?: string | undefined; key?: string; body?: string }) => Promise<{ status: number; text: string; json: HarnessJson }>
  /** 请求结果审计事件（脱敏）。 */
  readonly audits: RequestChainAuditEvent[]
  /** 停止服务并删除容器。 */
  readonly stop: () => Promise<void>
  /** 测试库连接来源（供同库的其他函数服务或事件函数用例复用）。 */
  readonly source: ReturnType<typeof createMysql2ConnectionSource>
}

/** 公开响应的宽松解析形状。 */
export type HarnessJson = { data?: Record<string, unknown>; error?: { type: string; message: string } }

/** 夹具常量：两个用户、会话 Bearer 与“当前时间”。 */
export const harnessUsers = {
  ownerRef: 'usr_harness_owner_0001',
  strangerRef: 'usr_harness_stranger_01',
  ownerBearer: 'fixture-harness-owner-bearer-0001',
  strangerBearer: 'fixture-harness-stranger-bearer-01'
} as const
const hour = 3_600_000
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}

/** 启动容器、建库、写入用户/会话/能力快照，并启动 user-plant 服务。 */
export async function startUserPlantMysqlHarness(options: {
  /** 容器名唯一后缀。 */
  readonly name: string
  /** 服务端“当前时间”UTC 毫秒。 */
  readonly now: number
  /** owner 的 active 植物上限。 */
  readonly ownerActiveLimit?: number
  /** 覆盖或追加的服务依赖（例如档案写入策略读取）。 */
  readonly serverOverrides?: Partial<UserPlantServerDependencies>
}): Promise<UserPlantMysqlHarness> {
  const container = `qhz-up-${options.name}-${process.pid}`
  const database = 'qhz_user_plant_harness'
  const sql = (text: string, db: string | null = database) => docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)
  docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
  let ready = false
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) { throw new Error('隔离 MySQL 未就绪') }
  const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
  sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, null)
  for (const entry of manifest.files) { sql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')) }
  const issued = options.now - 2 * hour
  const { ownerRef, strangerRef, ownerBearer, strangerBearer } = harnessUsers
  sql(`INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES
      (1, '${ownerRef}', 'active', 1, ${issued}, ${issued}), (2, '${strangerRef}', 'active', 1, ${issued}, ${issued});
    INSERT INTO platform_identities (user_internal_id, platform, platform_subject_hash, subject_hash_key_version, platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms) VALUES
      (1, 'wechat', '${'e'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued}),
      (2, 'wechat', '${'d'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued});
    INSERT INTO user_sessions (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version, authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
      SELECT IF(p.user_internal_id = 1, '${sha(ownerBearer)}', '${sha(strangerBearer)}'), p.user_internal_id, p.id, 1, 'wechat', 'active', ${issued}, ${options.now + 24 * hour}, NULL, ${issued}, ${issued}, 'identity-session-test/v1', '${'a'.repeat(64)}' FROM platform_identities p;
    INSERT INTO business_policy_releases (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
      VALUES ('bpr_test_capability_0001', 'subscription', 'capability_catalog', 'test/v1', 'test-capability/v1', '${'a'.repeat(64)}', '{}', 'active', ${issued}, NULL, ${issued}, ${issued}, ${issued});
    INSERT INTO capability_snapshots (snapshot_ref, subject_type, user_internal_id, tier, allowed_capabilities_json, rewarded_ai_scopes_json, active_user_plant_limit, capability_policy_release_internal_id,
      capability_policy_domain_code, capability_policy_code, capability_policy_release_ref, capability_policy_release_version, capability_policy_content_sha256, snapshot_sha256, generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
      SELECT CONCAT('cps_test_harness_', u.id, '0000'), 'user', u.id, 'member', '["USER_PLANT_CREATE"]', '[]', ${options.ownerActiveLimit ?? 5}, r.id, r.domain_code, r.policy_code, r.release_ref, r.release_version, r.content_sha256,
        '${'b'.repeat(64)}', ${options.now - 1000}, ${options.now + 600_000}, ${options.now - 1000}, ${options.now - 1000} FROM business_policy_releases r JOIN users u;`)
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  const source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  const audits: RequestChainAuditEvent[] = []
  const server: Server = createUserPlantServer({
    connectionSource: source,
    now: () => options.now,
    resolveCapabilitySnapshot: createMysqlCapabilitySnapshotReader(source, () => options.now),
    writeAudit: event => { audits.push(event) },
    recordRollbackFailure: () => undefined,
    // 真实发布策略读取：未写入策略夹具时返回 null，PATCH 按合同失败关闭为 503。
    readProfileWriteSnapshot: () => createMysqlPublishedProfileWritePolicyReader(source).read(options.now),
    readBindingHttpSnapshot: () => createMysqlPublishedHttpWritePolicyReader(source).read(options.now),
    ...options.serverOverrides
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    source,
    sql: text => sql(text),
    audits,
    call: async (method, pathName, callOptions = {}) => {
      const headers: Record<string, string> = { authorization: `Bearer ${callOptions.bearer ?? ownerBearer}` }
      if (callOptions.body !== undefined) { headers['content-type'] = 'application/json' }
      if (callOptions.key !== undefined) { headers['idempotency-key'] = callOptions.key }
      const response = await fetch(`${baseUrl}${pathName}`, callOptions.body === undefined ? { method, headers } : { method, headers, body: callOptions.body })
      const text = await response.text()
      return { status: response.status, text, json: JSON.parse(text) as HarnessJson }
    },
    stop: async () => {
      await new Promise(resolve => server.close(resolve))
      spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
    }
  }
}

/** 写入一株用户植物夹具。 */
export function plantInsertSql(ref: string, userInternalId: number, lifecycle: string, createdAtMs: number): string {
  return `INSERT INTO user_plants (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
    VALUES ('', '${ref}', ${userInternalId}, '${lifecycle}', 'unidentified', NULL, 1, ${createdAtMs}, ${createdAtMs});`
}

/**
 * 写入可确认的规范身份夹具：一个已发布分类 + 若干身份；published=false 的身份表级 ACTIVE 但不在发布明细中（不可确认）。
 * 与 plant-knowledge 公开准入（active 发布指针 + 逐项 ACTIVE 明细）同一判定。
 */
export function publishedIdentitiesSql(identities: ReadonlyArray<{ ref: string; published: boolean }>): string {
  const items = identities.filter(identity => identity.published)
  return `INSERT INTO plant_taxa (_openid, public_taxon_ref, authority_source, authority_taxon_id, accepted_scientific_name, taxon_rank, nomenclatural_status, source_version, retrieved_at_ms, evidence_hash, review_status, created_at_ms, updated_at_ms)
      VALUES ('', 'tax_harness_monstera01', 'POWO', 'fixture-harness-001', 'Monstera deliciosa', 'species', 'accepted', 'fixture-v1', 1000, '${'d'.repeat(64)}', 'ACTIVE', 1000, 1000);
    ${identities.map(identity => `INSERT INTO plant_identities (_openid, public_identity_ref, primary_taxon_internal_id, display_name_zh, identity_kind, review_status, active_release_internal_id, created_at_ms, updated_at_ms)
      SELECT '', '${identity.ref}', t.id, '龟背竹', 'taxon', 'ACTIVE', NULL, 1000, 1000 FROM plant_taxa t WHERE t.public_taxon_ref = 'tax_harness_monstera01';`).join('\n')}
    INSERT INTO plant_knowledge_releases (_openid, release_ref, release_kind, schema_version, artifact_ref, artifact_hash, record_count, released_at_ms, created_at_ms, updated_at_ms) VALUES
      ('', 'pkr_harness_taxonomy01', 'taxonomy', 'taxonomy/v1', 'fixture://taxonomy', '${'1'.repeat(64)}', 1, 1000, 1000, 1000),
      ('', 'pkr_harness_identity01', 'identity', 'identity/v1', 'fixture://identity', '${'2'.repeat(64)}', ${items.length}, 1000, 1000, 1000);
    INSERT INTO plant_knowledge_release_items (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256, decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
      SELECT '', r.id, 'taxon', 'tax_harness_monstera01', '${'d'.repeat(64)}', 'review_taxon_harness', 'ACTIVE', '${'3'.repeat(64)}', 1000, 1000 FROM plant_knowledge_releases r WHERE r.release_ref = 'pkr_harness_taxonomy01';
    ${items.map((identity, index) => `INSERT INTO plant_knowledge_release_items (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256, decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
      SELECT '', r.id, 'identity', '${identity.ref}', '${'d'.repeat(64)}', 'review_identity_harness', 'ACTIVE', '${String(index + 4).repeat(64)}', 1000, 1000 FROM plant_knowledge_releases r WHERE r.release_ref = 'pkr_harness_identity01';`).join('\n')}
    INSERT INTO active_plant_knowledge_releases (_openid, release_kind, release_internal_id, active_release_version, active_artifact_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
      SELECT '', r.release_kind, r.id, r.schema_version, r.artifact_hash, 1, 1000, 1000, 1000 FROM plant_knowledge_releases r;`
}

/** 已冻结的档案完整度与 HTTP 写入策略正文（与配置目录 confirmed 值一致）；夹具发布，不代表线上发布证明。 */
const profilePolicyBody = {
  profileVersion: 'user-plant-profile/v1',
  requiredFields: ['identityStatus', 'pot', 'location', 'lightingEnvironment', 'ventilationEnvironment'],
  acceptedIdentityStates: ['unidentified', 'candidate_pending', 'confirmed'],
  rewardOncePerUser: true
}
const httpPolicyBody = { jsonBodyLimitBytes: 1048576, idempotencyRetentionHours: 168 }

/** 发布档案完整度与 HTTP 写入两份活动策略（真实指针 + 摘要），供 PATCH 读取。 */
export function profileWritePoliciesSql(issuedAtMs: number): string {
  return [
    { ref: 'bpr_harness_profile01', domain: 'user-plant', code: 'profile_minimum_completeness', schema: 'user-plant-profile/v1', version: 'profile/2026-10-10', body: profilePolicyBody },
    { ref: 'bpr_harness_httpwrite1', domain: 'http', code: 'request_write', schema: 'http-request-write-policy/v1', version: 'http-write/2026-10-10', body: httpPolicyBody }
  ].map(fixture => `INSERT INTO business_policy_releases (_openid, release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
      VALUES ('', '${fixture.ref}', '${fixture.domain}', '${fixture.code}', '${fixture.schema}', '${fixture.version}', '${calculateCanonicalJsonSha256(fixture.body)}', '${JSON.stringify(fixture.body)}', 'active', ${issuedAtMs}, NULL, ${issuedAtMs}, ${issuedAtMs}, ${issuedAtMs});
    INSERT INTO active_business_policy_releases (_openid, domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
      SELECT '', r.domain_code, r.policy_code, r.id, r.release_version, r.content_sha256, 1, ${issuedAtMs}, ${issuedAtMs}, ${issuedAtMs} FROM business_policy_releases r WHERE r.release_ref = '${fixture.ref}';`).join('\n')
}

/**
 * weather 城市目录夹具：`city_climate_profiles` 已在云端灌库但 v2 schema manifest 尚无 DDL，
 * 这里按 weather Repository 读取列建一张最小副本表（字段形状来自 weather-city-climate-fit/v2 合同），不代表正式 DDL。
 */
export function cityProfilesSql(cities: ReadonlyArray<{ code: string; lat: number; lon: number }>): string {
  return `CREATE TABLE IF NOT EXISTS city_climate_profiles (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, city_code VARCHAR(64) NOT NULL, display_name VARCHAR(64) NOT NULL,
      lat DOUBLE NOT NULL, lon DOUBLE NOT NULL, timezone VARCHAR(64) NOT NULL, source VARCHAR(64) NOT NULL, window_start DATE NOT NULL, window_end DATE NOT NULL,
      day_count INT NULL, policy_version VARCHAR(32) NOT NULL, monthly_json JSON NULL, daily_stats_json JSON NULL, UNIQUE KEY uq_city_policy (city_code, policy_version));
    ${cities.map(city => `INSERT INTO city_climate_profiles (city_code, display_name, lat, lon, timezone, source, window_start, window_end, day_count, policy_version, monthly_json, daily_stats_json)
      VALUES ('${city.code}', '${city.code}', ${city.lat}, ${city.lon}, 'Asia/Shanghai', 'fixture', '2016-01-01', '2025-12-31', 3653, 'v0-city-outdoor', '[]', '{}');`).join('\n')}`
}
