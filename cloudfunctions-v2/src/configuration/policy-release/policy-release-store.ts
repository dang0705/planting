import { createHash, randomBytes } from 'node:crypto'

import type { LoadedPolicyRelease } from './release-document.js'

/**
 * 策略发布仓储（configuration-and-providers.md §5「发布、回滚和审计」）：CLI 唯一的 SQL 入口。
 * 通俗说明：像远程配置平台的后台——publish 只「上传一个新版本」，activate 才「切换线上指针」，rollback「指回上一版」，每次切换都写审计行。
 * 并发保护：切换指针用条件更新 `WHERE version = 期望版本号 AND active_release_version = 期望发布版本`，两个人同时切换时后到者影响 0 行而失败，
 * 类似前端乐观锁（带 If-Match 的 PUT）。
 */

/** 数据库连接端口：query 直接返回结果行（SELECT）或写入结果（DML）。 */
export interface PolicyReleaseConnection {
  /** 执行参数化 SQL。 */
  readonly query: (sql: string, parameters?: readonly unknown[]) => Promise<unknown>
  /** 开启数据库事务（只在 --apply 写库时调用）。 */
  readonly beginTransaction: () => Promise<void>
  /** 提交数据库事务，指针切换与审计行一起生效。 */
  readonly commit: () => Promise<void>
  /** 回滚数据库事务，期望不符或冲突时撤销全部写入。 */
  readonly rollback: () => Promise<void>
}

/** 切换操作的审计主体（只保存脱敏摘要）。 */
export interface PolicyReleaseActor {
  /** 操作者标识原文；入库前做 SHA-256，不保存原文。 */
  readonly actorRef: string
  /** 版本化原因代码，例如 `raise_page_size`。 */
  readonly reasonCode: string
  /** 脱敏证据引用，例如 ClickUp 票号或证据文件路径。 */
  readonly evidenceRef: string
}

/** 仓储操作结果。 */
export interface PolicyReleaseOutcome {
  /** applied：已写库；dry_run：只校验未写；unchanged：已是目标状态；conflict：期望不符或并发覆盖；not_found：目标不存在。 */
  readonly status: 'applied' | 'dry_run' | 'unchanged' | 'conflict' | 'not_found'
  /** 稳定原因代码（不含正文或凭证）。 */
  readonly reason: string
  /** 结果相关的版本信息，供 CLI 输出。 */
  readonly detail: Readonly<Record<string, unknown>>
}

/** 作用域查询输入。 */
export interface PolicyScope {
  /** 业务域代码（business_policy_releases.domain_code）。 */
  readonly domainCode: string
  /** 策略代码（business_policy_releases.policy_code）。 */
  readonly policyCode: string
}

/** 指针切换输入。 */
export interface ActivateInput extends PolicyScope {
  /** 要切换到的目标发布版本号。 */
  readonly releaseVersion: string
  /** 期望的当前活动版本；首次激活传 null。 */
  readonly expectedCurrentVersion: string | null
  /** 写入审计行的操作者摘要、原因与证据。 */
  readonly actor: PolicyReleaseActor
  /** 操作 UTC 毫秒。 */
  readonly nowMs: number
  /** 是否真正写库；false 为 dry-run。 */
  readonly apply: boolean
}

/** 回滚输入。 */
export interface RollbackInput extends PolicyScope {
  /** 期望的当前活动版本（必须与库中一致）。 */
  readonly expectedCurrentVersion: string
  /** 写入审计行的操作者摘要、原因与证据。 */
  readonly actor: PolicyReleaseActor
  /** 操作 UTC 毫秒。 */
  readonly nowMs: number
  /** 是否真正写库；false 为 dry-run 只读校验。 */
  readonly apply: boolean
}

type Row = Record<string, unknown>
const asRows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const affected = (value: unknown): number => (value !== null && typeof value === 'object' && typeof (value as { affectedRows?: unknown }).affectedRows === 'number' ? (value as { affectedRows: number }).affectedRows : 0)
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const newRef = (prefix: string) => `${prefix}_${randomBytes(18).toString('base64url')}`
const scopeCode = (scope: PolicyScope) => `${scope.domainCode}/${scope.policyCode}`

/** 读取活动指针（可加行锁）。 */
async function readPointer(connection: PolicyReleaseConnection, scope: PolicyScope, lock: boolean): Promise<Row | null> {
  const rows = asRows(await connection.query(`SELECT id, release_internal_id, active_release_version, version FROM active_business_policy_releases
     WHERE domain_code = ? AND policy_code = ?${lock ? ' FOR UPDATE' : ''}`, [scope.domainCode, scope.policyCode]))
  return rows[0] ?? null
}

/** 读取某个发布版本。 */
async function readRelease(connection: PolicyReleaseConnection, scope: PolicyScope, releaseVersion: string): Promise<Row | null> {
  const rows = asRows(await connection.query(`SELECT id, release_version, content_sha256, status FROM business_policy_releases
     WHERE domain_code = ? AND policy_code = ? AND release_version = ?`, [scope.domainCode, scope.policyCode, releaseVersion]))
  return rows[0] ?? null
}

/** publish：插入一条 verified 不可变版本；同版本同摘要视为已发布（幂等），同版本异摘要或摘要被其他版本占用为冲突。不触碰活动指针。 */
export async function publishPolicyRelease(connection: PolicyReleaseConnection, loaded: Extract<LoadedPolicyRelease, { ok: true }>,
  options: { readonly nowMs: number; readonly apply: boolean }): Promise<PolicyReleaseOutcome> {
  const { document } = loaded
  const detail = { domainCode: document.domainCode, policyCode: document.policyCode, releaseVersion: document.releaseVersion, contentSha256: loaded.contentSha256 }
  const existing = await readRelease(connection, document, document.releaseVersion)
  if (existing !== null) {
    return existing.content_sha256 === loaded.contentSha256
      ? { status: 'unchanged', reason: 'ALREADY_PUBLISHED', detail }
      : { status: 'conflict', reason: 'RELEASE_VERSION_TAKEN_WITH_DIFFERENT_CONTENT', detail }
  }
  const sameContent = asRows(await connection.query('SELECT release_version FROM business_policy_releases WHERE content_sha256 = ?', [loaded.contentSha256]))
  if (sameContent.length > 0) { return { status: 'conflict', reason: 'CONTENT_ALREADY_PUBLISHED_UNDER_OTHER_VERSION', detail } }
  if (!options.apply) { return { status: 'dry_run', reason: 'WOULD_PUBLISH', detail } }
  await connection.query(`INSERT INTO business_policy_releases (_openid, release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status,
     effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
     VALUES ('', ?, ?, ?, ?, ?, ?, CAST(? AS JSON), 'verified', ?, ?, ?, ?, ?)`, [newRef('bpr'), document.domainCode, document.policyCode, document.schemaVersion,
    document.releaseVersion, loaded.contentSha256, JSON.stringify(loaded.policy), loaded.effectiveAtMs, loaded.expiresAtMs, options.nowMs, options.nowMs, options.nowMs])
  return { status: 'applied', reason: 'PUBLISHED', detail }
}

/** 在事务内把指针从 current 切到 target，并更新新旧发布状态、写审计行；条件更新影响 0 行即并发冲突。 */
async function switchPointer(connection: PolicyReleaseConnection, scope: PolicyScope, target: Row, current: Row | null,
  action: 'activate' | 'rollback', actor: PolicyReleaseActor, nowMs: number): Promise<boolean> {
  if (current === null) {
    try {
      await connection.query(`INSERT INTO active_business_policy_releases (_openid, domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256,
         version, activated_at_ms, created_at_ms, updated_at_ms) VALUES ('', ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [scope.domainCode, scope.policyCode, target.id, target.release_version, target.content_sha256, nowMs, nowMs, nowMs])
    } catch { return false }
  } else {
    const updated = await connection.query(`UPDATE active_business_policy_releases SET release_internal_id = ?, active_release_version = ?, active_content_sha256 = ?,
       version = version + 1, activated_at_ms = ?, updated_at_ms = ? WHERE domain_code = ? AND policy_code = ? AND version = ? AND active_release_version = ?`,
    [target.id, target.release_version, target.content_sha256, nowMs, nowMs, scope.domainCode, scope.policyCode, current.version, current.active_release_version])
    if (affected(updated) !== 1) { return false }
    await connection.query(`UPDATE business_policy_releases SET status = 'retired', updated_at_ms = ? WHERE id = ? AND status = 'active'`, [nowMs, current.release_internal_id])
  }
  await connection.query(`UPDATE business_policy_releases SET status = 'active', updated_at_ms = ? WHERE id = ?`, [nowMs, target.id])
  await connection.query(`INSERT INTO configuration_release_audit_records (_openid, audit_ref, configuration_kind, configuration_scope_code, action, from_release_version, to_release_version,
     actor_type, actor_ref_hash, reason_code, evidence_ref, occurred_at_ms, created_at_ms, updated_at_ms)
     VALUES ('', ?, 'business_policy', ?, ?, ?, ?, 'reviewer', ?, ?, ?, ?, ?, ?)`,
  [newRef('cfa'), scopeCode(scope), action, current === null ? null : current.active_release_version, target.release_version,
    sha256(actor.actorRef), actor.reasonCode, actor.evidenceRef, nowMs, nowMs, nowMs])
  return true
}

/** 校验期望版本与当前指针是否一致。 */
const matchesExpectation = (current: Row | null, expected: string | null) => (current === null ? expected === null : current.active_release_version === expected)

/** activate：期望匹配才切换；dry-run 只读校验。 */
export async function activatePolicyRelease(connection: PolicyReleaseConnection, input: ActivateInput): Promise<PolicyReleaseOutcome> {
  const detail = { domainCode: input.domainCode, policyCode: input.policyCode, releaseVersion: input.releaseVersion, expectedCurrentVersion: input.expectedCurrentVersion }
  const target = await readRelease(connection, input, input.releaseVersion)
  if (target === null || !['verified', 'retired', 'active'].includes(String(target.status))) { return { status: 'not_found', reason: 'RELEASE_NOT_FOUND_OR_NOT_VERIFIED', detail } }
  if (!input.apply) {
    const current = await readPointer(connection, input, false)
    if (!matchesExpectation(current, input.expectedCurrentVersion)) { return { status: 'conflict', reason: 'CURRENT_VERSION_MISMATCH', detail: { ...detail, actualCurrentVersion: current?.active_release_version ?? null } } }
    return { status: 'dry_run', reason: 'WOULD_ACTIVATE', detail }
  }
  await connection.beginTransaction()
  try {
    const current = await readPointer(connection, input, true)
    if (!matchesExpectation(current, input.expectedCurrentVersion)) {
      await connection.rollback()
      return { status: 'conflict', reason: 'CURRENT_VERSION_MISMATCH', detail: { ...detail, actualCurrentVersion: current?.active_release_version ?? null } }
    }
    if (current !== null && current.active_release_version === input.releaseVersion) { await connection.rollback(); return { status: 'unchanged', reason: 'ALREADY_ACTIVE', detail } }
    if (!(await switchPointer(connection, input, target, current, 'activate', input.actor, input.nowMs))) {
      await connection.rollback()
      return { status: 'conflict', reason: 'CONCURRENT_SWITCH', detail }
    }
    await connection.commit()
    return { status: 'applied', reason: 'ACTIVATED', detail }
  } catch (error: unknown) {
    await connection.rollback().catch(() => undefined)
    throw error
  }
}

/** 上一版：最近一次把指针切到当前版本的 activate 审计行里的 from 版本；没有则无上一版。 */
async function readPreviousVersion(connection: PolicyReleaseConnection, scope: PolicyScope, currentVersion: string): Promise<string | null> {
  const rows = asRows(await connection.query(`SELECT from_release_version FROM configuration_release_audit_records
     WHERE configuration_kind = 'business_policy' AND configuration_scope_code = ? AND action = 'activate' AND to_release_version = ?
     ORDER BY id DESC LIMIT 1`, [scopeCode(scope), currentVersion]))
  const previous = rows[0]?.from_release_version
  return typeof previous === 'string' ? previous : null
}

/** rollback：期望当前版本匹配后，把指针指回上一版并写 rollback 审计。 */
export async function rollbackPolicyRelease(connection: PolicyReleaseConnection, input: RollbackInput): Promise<PolicyReleaseOutcome> {
  const detail: Record<string, unknown> = { domainCode: input.domainCode, policyCode: input.policyCode, expectedCurrentVersion: input.expectedCurrentVersion }
  const current = await readPointer(connection, input, false)
  if (current === null || current.active_release_version !== input.expectedCurrentVersion) {
    return { status: 'conflict', reason: 'CURRENT_VERSION_MISMATCH', detail: { ...detail, actualCurrentVersion: current?.active_release_version ?? null } }
  }
  const previous = await readPreviousVersion(connection, input, input.expectedCurrentVersion)
  if (previous === null) { return { status: 'not_found', reason: 'NO_PREVIOUS_VERSION', detail } }
  const target = await readRelease(connection, input, previous)
  if (target === null) { return { status: 'not_found', reason: 'PREVIOUS_RELEASE_MISSING', detail } }
  detail.rollbackToVersion = previous
  if (!input.apply) { return { status: 'dry_run', reason: 'WOULD_ROLLBACK', detail } }
  await connection.beginTransaction()
  try {
    const locked = await readPointer(connection, input, true)
    if (locked === null || locked.active_release_version !== input.expectedCurrentVersion
      || !(await switchPointer(connection, input, target, locked, 'rollback', input.actor, input.nowMs))) {
      await connection.rollback()
      return { status: 'conflict', reason: 'CONCURRENT_SWITCH', detail }
    }
    await connection.commit()
    return { status: 'applied', reason: 'ROLLED_BACK', detail }
  } catch (error: unknown) {
    await connection.rollback().catch(() => undefined)
    throw error
  }
}

/** list：历史版本（按创建顺序）与当前指针。 */
export async function listPolicyReleases(connection: PolicyReleaseConnection, scope: PolicyScope) {
  const releases = asRows(await connection.query(`SELECT release_version, schema_version, content_sha256, status, CAST(effective_at_ms AS CHAR) AS effective_at_ms
     FROM business_policy_releases WHERE domain_code = ? AND policy_code = ? ORDER BY id`, [scope.domainCode, scope.policyCode]))
  const pointer = await readPointer(connection, scope, false)
  return {
    activeReleaseVersion: pointer?.active_release_version ?? null,
    releases: releases.map(row => ({ releaseVersion: row.release_version, schemaVersion: row.schema_version, contentSha256: row.content_sha256, status: row.status,
      effectiveAt: new Date(Number(row.effective_at_ms)).toISOString() })),
  }
}

/** SQL 字符串字面量转义（单引号加倍、反斜杠转义）；只用于生成种子文件。 */
const literal = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`

/**
 * 渲染 v1 种子 SQL（只写文件、不执行）：每个策略插入 active 发布、活动指针与一条 activate 审计；引用由正文摘要派生，可重复生成逐字一致。
 * 适用于空库初始化；已有活动发布的环境必须改用 CLI 的 publish + activate（带期望版本）。
 */
export function renderPolicySeedSql(documents: readonly Extract<LoadedPolicyRelease, { ok: true }>[], options: { readonly issuedAtMs: number }): string {
  const lines = [
    '-- 业务策略 v1 种子（用户 2026-10-10 裁定：业务参数迁入策略发布，取值等于迁移前代码值）。',
    '-- 由 cloudfunctions-v2/src/configuration/policy-release 渲染（CLI：render-seed-sql）；只写文件、不在任何环境自动执行。',
    '-- 只适用于空库初始化；已有活动发布的环境（如 http/request_write v1）必须用 CLI publish + activate --expect-current 升级。',
    '-- 依赖 007_configuration.sql。',
    'SET NAMES utf8mb4;',
  ]
  for (const loaded of documents) {
    const { document } = loaded
    const releaseRef = `bpr_seed_${loaded.contentSha256.slice(0, 24)}`
    const auditRef = `cfa_seed_${loaded.contentSha256.slice(0, 24)}`
    const scope = `${document.domainCode}/${document.policyCode}`
    lines.push('', `-- ${scope} ${document.releaseVersion}`)
    lines.push(`INSERT INTO business_policy_releases (_openid, release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms) VALUES ('', ${literal(releaseRef)}, ${literal(document.domainCode)}, ${literal(document.policyCode)}, ${literal(document.schemaVersion)}, ${literal(document.releaseVersion)}, ${literal(loaded.contentSha256)}, CAST(${literal(JSON.stringify(loaded.policy))} AS JSON), 'active', ${loaded.effectiveAtMs}, ${loaded.expiresAtMs ?? 'NULL'}, ${options.issuedAtMs}, ${options.issuedAtMs}, ${options.issuedAtMs});`)
    lines.push(`INSERT INTO active_business_policy_releases (_openid, domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256, version, activated_at_ms, created_at_ms, updated_at_ms) SELECT '', r.domain_code, r.policy_code, r.id, r.release_version, r.content_sha256, 1, ${options.issuedAtMs}, ${options.issuedAtMs}, ${options.issuedAtMs} FROM business_policy_releases AS r WHERE r.release_ref = ${literal(releaseRef)};`)
    lines.push(`INSERT INTO configuration_release_audit_records (_openid, audit_ref, configuration_kind, configuration_scope_code, action, from_release_version, to_release_version, actor_type, actor_ref_hash, reason_code, evidence_ref, occurred_at_ms, created_at_ms, updated_at_ms) VALUES ('', ${literal(auditRef)}, 'business_policy', ${literal(scope)}, 'activate', NULL, ${literal(document.releaseVersion)}, 'service', ${literal(sha256('seed:2026-10-10'))}, 'v1_seed', 'docs/backend-v2/schema/seeds/business_policy_releases.2026-10-10.sql', ${options.issuedAtMs}, ${options.issuedAtMs}, ${options.issuedAtMs});`)
  }
  return `${lines.join('\n')}\n`
}
