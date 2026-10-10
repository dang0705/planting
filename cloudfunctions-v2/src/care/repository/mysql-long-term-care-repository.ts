import type { CareCalendarDto } from '../../contracts/types.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256, serializeCanonicalJson, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import type { LockedOwnedUserPlant } from '../../user-plant/repository/mysql-catalog-binding-repository.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 计划留存正文：日历字段在确认时锁定，完成后补记事实引用（long-term-care/v1 §9）。 */
export interface CarePlanPayload {
  /** 确认时生成的「加入手机日历」字段。 */
  readonly calendar: CareCalendarDto
  /** 完成计划时写入的浇水事实引用；未完成或无浇水为 null。 */
  readonly completedFactRef: string | null
}

/** 浇水事实写入输入。 */
export interface WateringFactInput {
  /** 服务端高熵事实引用（cft_）。 */
  readonly factRef: string
  /** 用户声明的实际浇水 UTC 毫秒（已按 U3 校验）。 */
  readonly occurredAtMs: number
  /** 浇水量毫升；未知为 null。 */
  readonly amountMl: number | null
  /** 服务端生成的来源命令引用（满足唯一约束）。 */
  readonly sourceCommandRef: string
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** 长期浇水建议写入输入：结果只追加，可确认时同时写建议。 */
export interface CapabilityResultInput {
  /** 服务端高熵结果引用（cres_）。 */
  readonly resultRef: string
  /** 当次环境合同版本。 */
  readonly environmentContractVersion: string
  /** 锁定输入清单（含档案、最近事实与品种绑定）。 */
  readonly inputManifest: CanonicalJsonObject
  /** 本次结果所用算法的发布清单（版本与摘要），便于回放与审计。 */
  readonly algorithmReleaseManifest: CanonicalJsonObject
  /** 受控派生摘要，只含脱敏后的中间结论，不含原始输入。 */
  readonly derivations: CanonicalJsonObject
  /** 已脱敏的公开结果。 */
  readonly result: CanonicalJsonObject
  /** 结果生成 UTC 毫秒。 */
  readonly generatedAtMs: number
  /** 结果有效截止 UTC 毫秒；未确定为 null。 */
  readonly validUntilMs: number | null
  /** 可确认时的建议；否则为 null。 */
  readonly proposal: {
    /** 服务端高熵建议引用（cpr_）。 */
    readonly proposalRef: string
    /** 建议有效截止 UTC 毫秒（U7）。 */
    readonly validUntilMs: number
    /** SHA-256(Idempotency-Key)，满足既有唯一键（T2/§10）。 */
    readonly idempotencyKeyHash: string
  } | null
}

/** 事务内加锁读到的建议。 */
export interface LockedCareProposal {
  /** 建议内部主键十进制文本（不公开）。 */
  readonly internalId: string
  /** 建议当前的存储状态，用于确认前的状态校验。 */
  readonly status: string
  /** 有效截止 UTC 毫秒；未确定为 null。 */
  readonly validUntilMs: number | null
  /** 建议生成时锁定的公开结果正文。 */
  readonly result: Record<string, any>
}

/** 事务内加锁读到的计划。 */
export interface LockedCarePlan {
  /** 计划内部主键十进制文本（不公开）。 */
  readonly internalId: string
  /** 计划当前的存储状态，用于完成或取消前的状态校验。 */
  readonly status: string
  /** 乐观并发版本号。 */
  readonly version: number
  /** 计划检查时刻 UTC 毫秒（完成时实时过期判定，§12.3）。 */
  readonly scheduledAtMs: number
  /** 计划留存正文，含完成时需要回放的日历与来源字段。 */
  readonly payload: CarePlanPayload
}

/** 盆土观察写入输入（计划完成时，§7）。 */
export interface SoilObservationInput {
  /** 服务端高熵观察引用。 */
  readonly observationRef: string
  /** 来源计划公开引用（作为 source_ref）。 */
  readonly planRef: string
  /** 用户报告的盆土状态。 */
  readonly state: string
  /** 盆土观察范围，限定该观察适用的盆栽或区域。 */
  readonly scope: string
  /** 观察 UTC 毫秒（服务端时钟）。 */
  readonly observedAtMs: number
}

/** 显式事务守卫。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('长期养护写入需要显式事务') }
  return transaction.connection
}

/** 库内 JSON 驱动可返回字符串或对象。 */
export function jsonColumn(value: unknown): Record<string, any> {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { throw new Error('JSON 列读回不合法') }
  return parsed as Record<string, any>
}

/** 可空 BIGINT 列转安全整数。 */
export function nullableMs(value: unknown): number | null {
  if (value === null || value === undefined) { return null }
  const number = Number(value)
  if (!Number.isSafeInteger(number)) { throw new Error('时间列读回不合法') }
  return number
}

/** 写入影响行数必须为 1。 */
async function writeOne(connection: Mysql2QueryConnection, sql: string, parameters: readonly (string | number | null)[], message: string) {
  const written = await connection.execute(sql, parameters)
  if (written.affectedRows !== 1) { throw new Error(message) }
  return written
}

/** 追加一条浇水事实（不可修改，027）。 */
export async function insertWateringFact(transaction: Transaction, plant: LockedOwnedUserPlant, input: WateringFactInput): Promise<void> {
  await writeOne(connectionOf(transaction),
    `INSERT INTO care_facts (fact_ref, user_internal_id, user_plant_internal_id, fact_type, occurred_at_ms, fact_payload_json, source_command_ref, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, 'watering', ?, CAST(? AS JSON), ?, ?, ?)`,
    [input.factRef, plant.userInternalId, plant.plantInternalId, input.occurredAtMs, JSON.stringify({ amountMl: input.amountMl }), input.sourceCommandRef, input.nowMs, input.nowMs],
    '浇水事实写入未确定')
}

/** 事务内最近一条浇水事实引用（与事务前读取对照，T6）；无为 null。 */
export async function readLatestWateringFactRef(transaction: Transaction, plant: LockedOwnedUserPlant): Promise<string | null> {
  const rows = await connectionOf(transaction).query(
    `SELECT fact_ref FROM care_facts WHERE user_internal_id = ? AND user_plant_internal_id = ? AND fact_type = 'watering'
      ORDER BY occurred_at_ms DESC, id DESC LIMIT 1`, [plant.userInternalId, plant.plantInternalId])
  return rows.length === 0 ? null : String(rows[0]!.fact_ref)
}

/** 先写建议（可选）再追加结果并链接；读回结果摘要核对写入一致。 */
export async function insertCapabilityResult(transaction: Transaction, plant: LockedOwnedUserPlant, input: CapabilityResultInput): Promise<void> {
  const connection = connectionOf(transaction)
  const result = input.result as Record<string, any>
  let proposalInternalId: number | null = null
  if (input.proposal !== null) {
    const written = await writeOne(connection,
      `INSERT INTO care_proposals (proposal_ref, user_internal_id, user_plant_internal_id, capability_type, contract_version, details_schema_version,
          result_json, status, valid_until_ms, idempotency_key, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, 'watering', ?, ?, CAST(? AS JSON), 'proposed', ?, ?, ?, ?)`,
      [input.proposal.proposalRef, plant.userInternalId, plant.plantInternalId, String(result.contractVersion), String(result.detailsSchemaVersion),
        serializeCanonicalJson(input.result), input.proposal.validUntilMs, input.proposal.idempotencyKeyHash, input.generatedAtMs, input.generatedAtMs],
      '养护建议写入未确定')
    proposalInternalId = written.insertId
  }
  const hashes = [input.inputManifest, input.algorithmReleaseManifest, input.derivations, input.result].map(calculateCanonicalJsonSha256)
  await writeOne(connection,
    `INSERT INTO care_capability_results (result_ref, user_internal_id, user_plant_internal_id, proposal_internal_id, capability_type, contract_version,
        details_schema_version, environment_contract_version, input_manifest_json, input_manifest_sha256, algorithm_release_manifest_json,
        algorithm_release_manifest_sha256, derivations_json, derivations_sha256, result_json, result_sha256, generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, 'watering', ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), ?, CAST(? AS JSON), ?, CAST(? AS JSON), ?, ?, ?, ?, ?)`,
    [input.resultRef, plant.userInternalId, plant.plantInternalId, proposalInternalId, String(result.contractVersion), String(result.detailsSchemaVersion),
      input.environmentContractVersion, serializeCanonicalJson(input.inputManifest), hashes[0]!, serializeCanonicalJson(input.algorithmReleaseManifest), hashes[1]!,
      serializeCanonicalJson(input.derivations), hashes[2]!, serializeCanonicalJson(input.result), hashes[3]!,
      input.generatedAtMs, input.validUntilMs, input.generatedAtMs, input.generatedAtMs],
    '长期养护结果写入未确定')
  const readBack = await connection.query(`SELECT result_sha256 FROM care_capability_results WHERE BINARY result_ref = BINARY ?`, [input.resultRef])
  if (readBack.length !== 1 || readBack[0]!.result_sha256 !== hashes[3]) { throw new Error('长期养护结果读回与写入不一致') }
}

/** 按归属 FOR UPDATE 锁建议；不属于该植物返回 null。 */
export async function lockCareProposal(transaction: Transaction, plant: LockedOwnedUserPlant, proposalRef: string): Promise<LockedCareProposal | null> {
  const rows = await connectionOf(transaction).query(
    `SELECT CAST(id AS CHAR) AS id, status, CAST(valid_until_ms AS CHAR) AS valid_until_ms, result_json FROM care_proposals
      WHERE BINARY proposal_ref = BINARY ? AND user_internal_id = ? AND user_plant_internal_id = ? AND capability_type = 'watering' FOR UPDATE`,
    [proposalRef, plant.userInternalId, plant.plantInternalId])
  if (rows.length === 0) { return null }
  return { internalId: String(rows[0]!.id), status: String(rows[0]!.status), validUntilMs: nullableMs(rows[0]!.valid_until_ms), result: jsonColumn(rows[0]!.result_json) }
}

/** 条件写一次：proposed → confirmed/dismissed。 */
export async function settleCareProposal(transaction: Transaction, proposal: LockedCareProposal, status: 'confirmed' | 'dismissed', nowMs: number): Promise<void> {
  await writeOne(connectionOf(transaction), `UPDATE care_proposals SET status = ?, updated_at_ms = ? WHERE id = ? AND status = 'proposed'`,
    [status, nowMs, proposal.internalId], '养护建议状态写入未确定')
}

/** 写入检查计划（一个建议至多一个计划，唯一键兜底）。 */
export async function insertCarePlan(transaction: Transaction, plant: LockedOwnedUserPlant, input: {
  /** 服务端高熵计划引用（cpl_）。 */ readonly planRef: string
  /** 来源建议。 */ readonly proposal: LockedCareProposal
  /** 计划 UTC 毫秒。 */ readonly scheduledAtMs: number
  /** 计划留存正文。 */ readonly payload: CarePlanPayload
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
}): Promise<void> {
  await writeOne(connectionOf(transaction),
    `INSERT INTO care_plans (plan_ref, user_internal_id, user_plant_internal_id, proposal_internal_id, plan_type, scheduled_at_ms, status, plan_payload_json, version, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, 'check_soil', ?, 'planned', CAST(? AS JSON), 1, ?, ?)`,
    [input.planRef, plant.userInternalId, plant.plantInternalId, input.proposal.internalId, input.scheduledAtMs,
      JSON.stringify(input.payload), input.nowMs, input.nowMs], '养护计划写入未确定')
}

/** 按归属 FOR UPDATE 锁计划；不属于该植物返回 null。 */
export async function lockCarePlan(transaction: Transaction, plant: LockedOwnedUserPlant, planRef: string): Promise<LockedCarePlan | null> {
  const rows = await connectionOf(transaction).query(
    `SELECT CAST(id AS CHAR) AS id, status, version, CAST(scheduled_at_ms AS CHAR) AS scheduled_at_ms, plan_payload_json FROM care_plans
      WHERE BINARY plan_ref = BINARY ? AND user_internal_id = ? AND user_plant_internal_id = ? FOR UPDATE`,
    [planRef, plant.userInternalId, plant.plantInternalId])
  if (rows.length === 0) { return null }
  const payload = jsonColumn(rows[0]!.plan_payload_json)
  const scheduledAtMs = Number(rows[0]!.scheduled_at_ms)
  if (!Number.isSafeInteger(scheduledAtMs)) { throw new Error('养护计划时刻读回不合法') }
  return { internalId: String(rows[0]!.id), status: String(rows[0]!.status), version: Number(rows[0]!.version), scheduledAtMs,
    payload: { calendar: payload.calendar as CareCalendarDto, completedFactRef: typeof payload.completedFactRef === 'string' ? payload.completedFactRef : null } }
}

/** 按版本条件写计划终态，version + 1。 */
export async function finishCarePlan(transaction: Transaction, plan: LockedCarePlan, status: 'completed' | 'cancelled', payload: CarePlanPayload, nowMs: number): Promise<void> {
  await writeOne(connectionOf(transaction),
    `UPDATE care_plans SET status = ?, plan_payload_json = CAST(? AS JSON), version = version + 1, updated_at_ms = ? WHERE id = ? AND version = ? AND status = 'planned'`,
    [status, JSON.stringify(payload), nowMs, plan.internalId, plan.version], '养护计划状态写入未确定')
}

/** 追加一条用户报告的盆土观察（soil_surface、user_context，§7）。 */
export async function insertSoilObservation(transaction: Transaction, plant: LockedOwnedUserPlant, input: SoilObservationInput): Promise<void> {
  const value = { state: input.state, scope: input.scope }
  await writeOne(connectionOf(transaction),
    `INSERT INTO care_environment_observations (observation_ref, user_internal_id, user_plant_internal_id, factor_type, source_scope, source_kind, source_ref,
        contract_version, normalized_value_json, unit_code, confidence_band, evidence_sha256, observed_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, 'soil_surface', 'pot', 'user_context', ?, 'long-term-care/v1', CAST(? AS JSON), 'category', 'low', ?, ?, NULL, ?, ?)`,
    [input.observationRef, plant.userInternalId, plant.plantInternalId, input.planRef, JSON.stringify(value),
      calculateCanonicalJsonSha256({ ...value, observedAtMs: input.observedAtMs }), input.observedAtMs, input.observedAtMs, input.observedAtMs],
    '盆土观察写入未确定')
}
