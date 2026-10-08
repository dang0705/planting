import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import { lockTemporaryCareOwner, lockTemporaryCareResult, validateCareReference, validateCareTime,
  type LockedTemporaryCareResult, type TemporaryCareOwner, type TemporaryCareResultRecord } from '../domain/temporary-care-result-record.js'

/** 内部读回结果；未授权或已过期均不泄露记录是否曾存在。 */
export type TemporaryCareReadResult = {
  /** 所有正文摘要、版本和时间已核对。 */ readonly status: 'found'
  /** 仅供受控回放，不是公开 DTO。 */ readonly record: LockedTemporaryCareResult
} | {
  /** 损坏记录与缺失分开，不能悄悄以重算结果覆盖。 */ readonly status: 'not_found' | 'invalid_record'
}

/** 所有 SQL 由本仓储持有，不提供更新或删除结果的方法。 */
export interface MysqlTemporaryCareResultRepository {
  /** 调用方事务内追加，唯一引用冲突明确失败。 */
  readonly append: (tx: MysqlTransactionContext<Mysql2QueryConnection>, input: TemporaryCareResultRecord) => Promise<'created' | 'not_found'>
  /** 原样读回；不会调用当前算法或选择新的发布。 */
  readonly read: (owner: TemporaryCareOwner, sessionRef: string, resultRef: string, nowMs: number) => Promise<TemporaryCareReadResult>
}

/** 从严格归属分支选择固定SQL；不把任何输入拼入SQL文本。 */
function ownership(owner: TemporaryCareOwner) {
  if (owner.kind === 'authenticated') {
    return {
      joins: `JOIN authenticated_ephemeral_plant_cases e ON e.id=s.authenticated_ephemeral_case_internal_id
        AND s.guest_plant_case_internal_id IS NULL AND e._openid=''
        JOIN users u ON u.id=e.user_internal_id AND u.status='active' AND u._openid=''`,
      where: 'BINARY u.public_user_id=BINARY ? AND BINARY e.ephemeral_plant_case_ref=BINARY ?',
      params: [owner.userRef, owner.caseRef], limit: 'LEAST(s.expires_at_ms,e.expires_at_ms)',
    }
  }
  return {
    joins: `JOIN guest_plant_cases e ON e.id=s.guest_plant_case_internal_id
      AND s.authenticated_ephemeral_case_internal_id IS NULL AND e._openid=''
      JOIN guest_sessions g ON g.id=e.guest_session_internal_id AND g._openid=''`,
    where: 'BINARY g.guest_session_ref=BINARY ? AND BINARY e.guest_plant_case_ref=BINARY ?',
    params: [owner.guestSessionRef, owner.caseRef], limit: 'LEAST(s.expires_at_ms,e.expires_at_ms,g.expires_at_ms)',
  }
}

/** mysql2安全整数解码，禁止null或空字符串被转换为零。 */
function milliseconds(value: unknown): number {
  const result = typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value) ? Number(value) : value
  validateCareTime(result)
  return result
}

/** 读回正文先重新锁定，再验证全部摘要和外层版本。 */
function decode(row: Record<string, unknown>, owner: TemporaryCareOwner, sessionRef: string, resultRef: string): TemporaryCareReadResult {
  try {
    const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as CanonicalJsonObject
    const record = lockTemporaryCareResult({ owner, sessionRef, resultRef,
      environmentContractVersion: row.environment_contract_version as string,
      inputManifest: parse(row.input_manifest_json), algorithmReleaseManifest: parse(row.algorithm_release_manifest_json),
      derivations: parse(row.derivations_json), result: parse(row.result_json),
      generatedAtMs: milliseconds(row.generated_at_ms), expiresAtMs: milliseconds(row.expires_at_ms) })
    if (record.hashes.inputManifest !== row.input_manifest_sha256
      || record.hashes.algorithmReleaseManifest !== row.algorithm_release_manifest_sha256
      || record.hashes.derivations !== row.derivations_sha256 || record.hashes.result !== row.result_sha256
      || record.result.contractVersion !== row.contract_version || record.result.detailsSchemaVersion !== row.details_schema_version
      || milliseconds(row.created_at_ms) !== record.generatedAtMs || milliseconds(row.updated_at_ms) !== record.generatedAtMs) {
      return { status: 'invalid_record' }
    }
    return { status: 'found', record }
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof RangeError) { return { status: 'invalid_record' } }
    throw error
  }
}

/** 复用已有临时结果表；身份验真在上游，实际案例/会话归属在每次SQL中复核。 */
export function createMysqlTemporaryCareResultRepository(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): MysqlTemporaryCareResultRepository {
  return {
    append: async (tx, input) => {
      // 先锁正文，再等待数据库；不能让外部修改影响当前请求的写入。
      const record = lockTemporaryCareResult(input), binding = ownership(record.owner)
      if (tx.transactionContext !== true || !tx.connection) { throw new TypeError('临时养护结果需要显式事务') }
      const owned = await tx.connection.query(`SELECT CAST(s.id AS CHAR) AS session_id,
        CAST(s.guest_plant_case_internal_id AS CHAR) AS guest_id,
        CAST(s.authenticated_ephemeral_case_internal_id AS CHAR) AS authenticated_id
        FROM temporary_care_sessions s ${binding.joins}
        WHERE ${binding.where} AND BINARY s.session_ref=BINARY ? AND s._openid=''
          AND s.status='active' AND s.capability_type='watering'
          AND s.created_at_ms<=? AND ?<=${binding.limit} FOR UPDATE`,
      [...binding.params, record.sessionRef, record.generatedAtMs, record.expiresAtMs])
      if (owned.length === 0) { return 'not_found' }
      if (owned.length !== 1) { throw new Error('临时养护归属记录不唯一') }
      const row = owned[0]!
      const written = await tx.connection.execute(`INSERT INTO temporary_care_results
        (result_ref,temporary_care_session_internal_id,guest_plant_case_internal_id,authenticated_ephemeral_case_internal_id,
         contract_version,details_schema_version,environment_contract_version,
         input_manifest_json,input_manifest_sha256,algorithm_release_manifest_json,algorithm_release_manifest_sha256,
         derivations_json,derivations_sha256,result_json,result_sha256,generated_at_ms,expires_at_ms,created_at_ms,updated_at_ms)
        VALUES(?,?,?,?,?,?,?,CAST(? AS JSON),?,CAST(? AS JSON),?,CAST(? AS JSON),?,CAST(? AS JSON),?,?,?,?,?)`,
      [record.resultRef, row.session_id as string, row.guest_id as string | null, row.authenticated_id as string | null,
        record.result.contractVersion as string, record.result.detailsSchemaVersion as string, record.environmentContractVersion,
        serializeCanonicalJson(record.inputManifest), record.hashes.inputManifest,
        serializeCanonicalJson(record.algorithmReleaseManifest), record.hashes.algorithmReleaseManifest,
        serializeCanonicalJson(record.derivations), record.hashes.derivations,
        serializeCanonicalJson(record.result), record.hashes.result,
        record.generatedAtMs, record.expiresAtMs, record.generatedAtMs, record.generatedAtMs])
      if (written.affectedRows !== 1) { throw new Error('临时养护结果未成功保存') }
      return 'created'
    },
    read: async (inputOwner, sessionRef, resultRef, nowMs) => {
      const owner = lockTemporaryCareOwner(inputOwner), binding = ownership(owner)
      validateCareReference(sessionRef); validateCareReference(resultRef); validateCareTime(nowMs)
      const rows = await withReadConnection(source, c => c.query(`SELECT r.contract_version,r.details_schema_version,
        r.environment_contract_version,r.input_manifest_json,r.input_manifest_sha256,
        r.algorithm_release_manifest_json,r.algorithm_release_manifest_sha256,r.derivations_json,r.derivations_sha256,
        r.result_json,r.result_sha256,r.generated_at_ms,r.expires_at_ms,r.created_at_ms,r.updated_at_ms
        FROM temporary_care_results r JOIN temporary_care_sessions s ON s.id=r.temporary_care_session_internal_id
          AND (s.guest_plant_case_internal_id <=> r.guest_plant_case_internal_id)
          AND (s.authenticated_ephemeral_case_internal_id <=> r.authenticated_ephemeral_case_internal_id)
        ${binding.joins} WHERE ${binding.where} AND BINARY s.session_ref=BINARY ? AND BINARY r.result_ref=BINARY ?
          AND s._openid='' AND r._openid='' AND s.capability_type='watering' AND s.status IN ('active','completed')
          AND r.generated_at_ms>=s.created_at_ms AND r.generated_at_ms<=?
          AND r.expires_at_ms>? AND r.expires_at_ms<=${binding.limit}`, [...binding.params, sessionRef, resultRef, nowMs, nowMs]))
      if (rows.length === 0) { return { status: 'not_found' } }
      if (rows.length !== 1) { return { status: 'invalid_record' } }
      return decode(rows[0]!, owner, sessionRef, resultRef)
    },
  }
}
