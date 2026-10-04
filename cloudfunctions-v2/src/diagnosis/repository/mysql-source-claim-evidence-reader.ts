import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import type { SourceClaimEvidence, SourceClaimEvidenceReader, SourceClaimReference } from '../application/ports/source-claim-evidence-reader.js'

/** 与SQL VARCHAR长度一致，以Unicode码点计数，不将代理对算成两个字符。 */
function text(value: unknown, maxCharacters?: number): value is string {
  return typeof value === 'string' && /\S/u.test(value)
    && (maxCharacters === undefined || [...value].length <= maxCharacters)
}

/** 非负BIGINT只接受能无损表示的UTC毫秒；空值由字段的可空性另行处理。 */
function instant(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return undefined }
  const number = Number(value)
  return Number.isSafeInteger(number) && number <= 8_640_000_000_000_000 ? number : undefined
}

/** 精确三元组键，不把主张代码、来源或不同修订混合。 */
function key(reference: SourceClaimReference): string {
  return JSON.stringify([reference.sourceCode, reference.claimCode, reference.revisionNo])
}

/** 纯JSON快照在返回前递归冻结，不将Date或类实例压成空对象。 */
function frozenJson(input: unknown): CanonicalJsonValue {
  const value = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue)) as CanonicalJsonValue
  function freeze(node: CanonicalJsonValue): void {
    if (node !== null && typeof node === 'object') {
      for (const child of Object.values(node)) { freeze(child) }
      Object.freeze(node)
    }
  }
  freeze(value)
  return value
}

/** 检查数据库字段完整性；许可与适用性保持原始证据，不在此做发布裁决。 */
function evidence(row: Readonly<Record<string, unknown>>): Readonly<SourceClaimEvidence> | null {
  const sourceTime = row.source_verified_at_ms === null ? null : instant(row.source_verified_at_ms)
  const claimTime = instant(row.claim_verified_at_ms)
  if (row.source_openid !== '' || row.claim_openid !== ''
    || !text(row.organization_zh, 191) || !text(row.title_zh, 255) || !text(row.locator_url, 1024)
    || !text(row.source_type, 32) || !text(row.license_scope, 32)
    || !text(row.source_locator, 1024) || !text(row.claim_zh)
    || !['pending', 'verified', 'withdrawn'].includes(String(row.source_state))
    || !['support', 'oppose', 'limit', 'safety'].includes(String(row.claim_role))
    || typeof row.evidence_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.evidence_sha256)
    || sourceTime === undefined || claimTime === undefined) { return null }
  let applicability: CanonicalJsonValue
  try {
    applicability = frozenJson(typeof row.applicability_json === 'string'
      ? JSON.parse(row.applicability_json) as unknown : row.applicability_json)
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError) { return null }
    throw error
  }
  return Object.freeze({
    organizationZh: row.organization_zh, titleZh: row.title_zh, locatorUrl: row.locator_url,
    sourceType: row.source_type, licenseScope: row.license_scope,
    sourceState: row.source_state as SourceClaimEvidence['sourceState'], sourceVerifiedAtMs: sourceTime,
    sourceLocator: row.source_locator, claimZh: row.claim_zh, applicability,
    claimRole: row.claim_role as SourceClaimEvidence['claimRole'], evidenceSha256: row.evidence_sha256,
    claimVerifiedAtMs: claimTime,
  })
}

/**
 * 单语句读取009中来源与精确主张修订，保留许可、适用性和生命周期供审核。
 * SQL使用绑定参数和二进制精确代码比较；一条语句避免分次读取拼成不同观察时刻。
 * 不返回内部主键，不写表，不检查制品文件，也不产生VerifiedClaimRevision准入结果。
 */
export function createMysqlSourceClaimEvidenceReader(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
): SourceClaimEvidenceReader {
  return {
    read: async references => {
      if (!Array.isArray(references)) { throw new TypeError('来源请求必须是精确引用数组') }
      const unique = new Map<string, SourceClaimReference>()
      for (const reference of references) {
        if (!reference || !text(reference.sourceCode, 96) || !text(reference.claimCode, 96)
          || !Number.isInteger(reference.revisionNo) || reference.revisionNo < 0 || reference.revisionNo > 4_294_967_295) {
          throw new TypeError('来源代码、主张代码及无符号修订号必须合法')
        }
        const copy = Object.freeze({ sourceCode: reference.sourceCode, claimCode: reference.claimCode, revisionNo: reference.revisionNo })
        unique.set(key(copy), copy)
      }
      const requested = [...unique.values()]
      if (requested.length === 0) { return [] }
      const conditions = requested.map(() => '(BINARY s.source_code = BINARY ? AND BINARY c.claim_code = BINARY ? AND c.revision_no = ?)')
      const parameters = requested.flatMap(r => [r.sourceCode, r.claimCode, r.revisionNo])
      return withReadConnection(source, async connection => {
        const rows = await connection.query(`SELECT s.source_code, s.organization_zh, s.title_zh,
          s.locator_url, s.source_type, s.license_scope, s.source_state,
          s._openid AS source_openid, c._openid AS claim_openid,
          CAST(s.verified_at_ms AS CHAR) AS source_verified_at_ms,
          c.claim_code, c.revision_no, c.source_locator, c.claim_zh, c.applicability_json,
          c.claim_role, c.evidence_sha256, CAST(c.verified_at_ms AS CHAR) AS claim_verified_at_ms
          FROM diagnosis_source_claim_revisions AS c
          JOIN diagnosis_sources AS s ON s.id = c.source_internal_id
          WHERE ${conditions.join(' OR ')}`, parameters)
        const indexed = new Map<string, Readonly<Record<string, unknown>>[]>()
        for (const row of rows) {
          const rowKey = key({ sourceCode: row.source_code as string, claimCode: row.claim_code as string, revisionNo: row.revision_no as number })
          if (!unique.has(rowKey)) { throw new Error('来源查询返回未请求的精确修订，拒绝混用') }
          const entries = indexed.get(rowKey) ?? []
          entries.push(row)
          indexed.set(rowKey, entries)
        }
        return requested.map(reference => {
          const found = indexed.get(key(reference)) ?? []
          if (found.length === 0) { return { reference, status: 'not_found' as const } }
          const parsed = found.length === 1 ? evidence(found[0]!) : null
          return parsed === null ? { reference, status: 'invalid_record' as const }
            : { reference, status: 'found' as const, evidence: parsed }
        })
      })
    },
  }
}
