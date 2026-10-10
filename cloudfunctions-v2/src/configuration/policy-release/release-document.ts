import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { findBusinessPolicyDefinition } from '../business-policies/index.js'

/**
 * 策略发布文档（business-policy-release-document/v1）：CLI 的输入文件格式。
 * 通俗说明：一份「要发布的远程配置版本」清单——写明发到哪个策略、正文版本、发布版本号、生效时间与正文本身。
 * 正文可内嵌（`policy`）或引用仓库内文件（`policyFile`，相对仓库根）；二者必须恰好出现一个。
 */
export interface PolicyReleaseDocument {
  /** 文档格式版本，固定 `business-policy-release-document/v1`。 */
  readonly releaseDocumentVersion: 'business-policy-release-document/v1'
  /** 业务域代码（例如 care、user-plant）。 */
  readonly domainCode: string
  /** 策略代码（例如 long_term_rules），必须已在策略类型清单登记。 */
  readonly policyCode: string
  /** 正文 Schema 版本（必须被该策略类型接受）。 */
  readonly schemaVersion: string
  /** 不可变发布版本号，同一策略内唯一，例如 `care-long-term-rules/v1.0.0`。 */
  readonly releaseVersion: string
  /** 生效 UTC 时刻（ISO 8601，秒或毫秒精度，以 Z 结尾）。 */
  readonly effectiveAt: string
  /** 可选失效 UTC 时刻；省略表示长期有效。 */
  readonly expiresAt?: string
  /** 中文变更说明（只进 CLI 输出，不入库）。 */
  readonly changeNote?: string
}

/** 文档加载结果：成功时给出已校验正文与规范摘要。 */
export type LoadedPolicyRelease =
  | {
    /** 校验成功标记，固定为 true。 */ readonly ok: true
    /** 已解析的文档元数据。 */ readonly document: PolicyReleaseDocument
    /** 已通过策略类型校验的正文（原样 JSON，入库内容）。 */ readonly policy: unknown
    /** 正文规范 JSON 的 SHA-256（content_sha256）。 */ readonly contentSha256: string
    /** 生效 UTC 毫秒。 */ readonly effectiveAtMs: number
    /** 失效 UTC 毫秒；无为 null。 */ readonly expiresAtMs: number | null
  }
  | {
    /** 校验失败标记，固定为 false。 */ readonly ok: false
    /** 稳定失败原因代码（不含正文）。 */ readonly reason: string
  }

const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const codePattern = /^[a-z][a-z0-9_-]{0,79}$/u
const versionPattern = /^[A-Za-z0-9._/-]{1,64}$/u
const allowedKeys = new Set(['releaseDocumentVersion', 'domainCode', 'policyCode', 'schemaVersion', 'releaseVersion', 'effectiveAt', 'expiresAt', 'changeNote', 'policy', 'policyFile'])

/** UTC 往返校验；非法返回 null。 */
function parseUtc(value: unknown): number | null {
  if (typeof value !== 'string' || !utcPattern.test(value)) { return null }
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

/**
 * 加载并校验发布文档：元数据格式 → 策略类型已登记 → 正文版本被接受 → 正文通过类型校验（含代码硬边界）→ 计算规范摘要。
 * `readRepoFile` 只用于读取 `policyFile`（相对仓库根）；路径含 `..` 或绝对路径一律拒绝。
 */
export function loadPolicyReleaseDocument(raw: unknown, readRepoFile: (relativePath: string) => string): LoadedPolicyRelease {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) { return { ok: false, reason: 'DOCUMENT_NOT_OBJECT' } }
  const input = raw as Record<string, unknown>
  if (Object.keys(input).some(key => !allowedKeys.has(key))) { return { ok: false, reason: 'DOCUMENT_UNKNOWN_FIELD' } }
  if (input.releaseDocumentVersion !== 'business-policy-release-document/v1') { return { ok: false, reason: 'DOCUMENT_VERSION_INVALID' } }
  const { domainCode, policyCode, schemaVersion, releaseVersion } = input
  if (typeof domainCode !== 'string' || !codePattern.test(domainCode) || typeof policyCode !== 'string' || !codePattern.test(policyCode)
    || typeof schemaVersion !== 'string' || !versionPattern.test(schemaVersion) || typeof releaseVersion !== 'string' || !versionPattern.test(releaseVersion)) {
    return { ok: false, reason: 'DOCUMENT_METADATA_INVALID' }
  }
  const effectiveAtMs = parseUtc(input.effectiveAt)
  const expiresAtMs = input.expiresAt === undefined ? null : parseUtc(input.expiresAt)
  if (effectiveAtMs === null || (input.expiresAt !== undefined && (expiresAtMs === null || expiresAtMs <= effectiveAtMs))) { return { ok: false, reason: 'DOCUMENT_TIME_INVALID' } }
  if ((input.policy === undefined) === (input.policyFile === undefined)) { return { ok: false, reason: 'DOCUMENT_POLICY_SOURCE_INVALID' } }
  let policy: unknown = input.policy
  if (input.policyFile !== undefined) {
    const file = input.policyFile
    if (typeof file !== 'string' || file.startsWith('/') || file.split('/').includes('..') || !file.endsWith('.json')) { return { ok: false, reason: 'DOCUMENT_POLICY_FILE_INVALID' } }
    try { policy = JSON.parse(readRepoFile(file)) as unknown } catch { return { ok: false, reason: 'DOCUMENT_POLICY_FILE_UNREADABLE' } }
  }
  const definition = findBusinessPolicyDefinition(domainCode, policyCode)
  if (definition === null) { return { ok: false, reason: 'POLICY_TYPE_NOT_REGISTERED' } }
  if (!definition.schemaVersions.includes(schemaVersion)) { return { ok: false, reason: 'SCHEMA_VERSION_NOT_ACCEPTED' } }
  if (definition.resolve(policy, schemaVersion) === null) { return { ok: false, reason: 'POLICY_BODY_INVALID' } }
  const document: PolicyReleaseDocument = {
    releaseDocumentVersion: 'business-policy-release-document/v1', domainCode, policyCode, schemaVersion, releaseVersion,
    effectiveAt: input.effectiveAt as string,
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt as string }),
    ...(typeof input.changeNote === 'string' ? { changeNote: input.changeNote } : {}),
  }
  return { ok: true, document, policy, contentSha256: calculateCanonicalJsonSha256(policy as CanonicalJsonValue), effectiveAtMs, expiresAtMs }
}
