import type { UserGenerativeCapability } from '../../contracts/types.js'
import type {
  AiQuotaReservationCommitUnknownReadOnlyRepository,
  AiQuotaReservationCommitUnknownRecord,
  AiQuotaSettlementCommitUnknownReadOnlyRepository,
  AiQuotaSettlementCommitUnknownRecord
} from '../application/ai-quota-commit-unknown-reconciliation.js'
import { AiQuotaReservationPersistenceError } from './ai-quota-reservation-repository-types.js'
import { AiQuotaSettlementPersistenceError } from './ai-quota-settlement-repository-types.js'

/** 新连接读回预占幂等结果时允许出现的最小 SQL 行。 */
export type AiQuotaReservationCommitUnknownSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'reservation_commit_unknown'
  /** 高熵额度预占公开引用。 */
  readonly reservation_ref: string
  /** 首次规范化命令的 SHA-256。 */
  readonly request_hash: string
  /** 当前额度预占生命周期状态。 */
  readonly status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 首次锁定额度的正整数文本。 */
  readonly estimated_amount: string
  /** 首次预占的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 首次锁定的不可变成本策略版本。 */
  readonly cost_policy_version: string
  /** 预占租约失效时间的非负整数文本。 */
  readonly expires_at_ms: string
}

/** 新连接读回结算终态时允许出现的最小 SQL 行。 */
export type AiQuotaSettlementCommitUnknownSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'settlement_commit_unknown'
  /** 高熵额度预占公开引用。 */
  readonly reservation_ref: string
  /** 当前额度预占生命周期状态。 */
  readonly status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 首次锁定额度的正整数文本。 */
  readonly estimated_amount: string
  /** 已结算额度文本；仍预占或待对账时为空。 */
  readonly settled_amount: string | null
  /** 供应商实际成本微元文本；仍预占时为空。 */
  readonly actual_cost_micros: string | null
  /** 脱敏供应商用量证据；仍预占时为空。 */
  readonly usage_evidence_ref: string | null
  /** 平台承担成本微元的非负整数文本。 */
  readonly platform_absorbed_cost_micros: string
}

/** 提交结果未知只读查询可以返回的受控 SQL 行。 */
export type AiQuotaCommitUnknownSqlRow =
  | AiQuotaReservationCommitUnknownSqlRow
  | AiQuotaSettlementCommitUnknownSqlRow

/** 必须由连接池重新获取连接的无事务参数化 SQL 执行端口。 */
export type AiQuotaCommitUnknownReadOnlySqlExecutor = {
  /** 在新连接上执行无锁 SELECT；禁止传入旧事务或提供写方法。 */
  readonly executeQuery: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly AiQuotaCommitUnknownSqlRow[]>
}

const zero = Number('0')
const one = Number('1')
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const reservationRefFormat = /^aqr_[A-Za-z0-9_-]{8,}$/u
const sha256Format = /^[a-f0-9]{64}$/u
const capabilityValues = new Set<UserGenerativeCapability>([
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
])

/** 将数据库整数文本解析为 JavaScript 可安全表达的非负整数。 */
function parseNonNegativeInteger(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= zero ? parsed : null
}

/** 从只读查询中提取唯一行；重复行代表归属或唯一约束已经损坏。 */
function readSingleRow(
  rows: readonly AiQuotaCommitUnknownSqlRow[]
): AiQuotaCommitUnknownSqlRow | null {
  if (rows.length === zero) {
    return null
  }
  return rows.length === one ? rows[zero]! : null
}

/** 校验统一用户公开引用和普通非空业务键。 */
function isValidReadScope(userRef: string, ...businessKeys: readonly string[]): boolean {
  return (
    userRefFormat.test(userRef) &&
    businessKeys.every(value => value.length > zero && value.length <= Number('128'))
  )
}

/** 将唯一预占行映射为提交未知只读快照。 */
function mapReservationRow(
  row: AiQuotaReservationCommitUnknownSqlRow
): AiQuotaReservationCommitUnknownRecord | null {
  const estimatedAmount = parseNonNegativeInteger(row.estimated_amount)
  const expiresAtMs = parseNonNegativeInteger(row.expires_at_ms)
  if (
    !reservationRefFormat.test(row.reservation_ref) ||
    !sha256Format.test(row.request_hash) ||
    estimatedAmount === null ||
    estimatedAmount <= zero ||
    expiresAtMs === null ||
    !capabilityValues.has(row.capability) ||
    row.cost_policy_version.length === zero
  ) {
    return null
  }
  return {
    requestHash: row.request_hash,
    reservationRef: row.reservation_ref,
    status: row.status,
    estimatedAmount,
    capability: row.capability,
    costPolicyVersion: row.cost_policy_version,
    expiresAtMs
  }
}

/** 将唯一结算行映射为提交未知只读终态快照并校验状态字段组合。 */
function mapSettlementRow(
  row: AiQuotaSettlementCommitUnknownSqlRow
): AiQuotaSettlementCommitUnknownRecord | null {
  const estimatedAmount = parseNonNegativeInteger(row.estimated_amount)
  const settledAmount =
    row.settled_amount === null ? null : parseNonNegativeInteger(row.settled_amount)
  const actualCostMicros =
    row.actual_cost_micros === null ? null : parseNonNegativeInteger(row.actual_cost_micros)
  const platformAbsorbedCostMicros = parseNonNegativeInteger(
    row.platform_absorbed_cost_micros
  )
  if (
    !reservationRefFormat.test(row.reservation_ref) ||
    estimatedAmount === null ||
    estimatedAmount <= zero ||
    platformAbsorbedCostMicros === null ||
    settledAmount === undefined ||
    actualCostMicros === undefined
  ) {
    return null
  }
  const hasEvidence =
    actualCostMicros !== null &&
    row.usage_evidence_ref !== null &&
    row.usage_evidence_ref.length > zero
  const validShape =
    (row.status === 'reserved' &&
      settledAmount === null &&
      actualCostMicros === null &&
      row.usage_evidence_ref === null &&
      platformAbsorbedCostMicros === zero) ||
    (row.status === 'settled' &&
      settledAmount !== null &&
      settledAmount > zero &&
      settledAmount <= estimatedAmount &&
      hasEvidence &&
      platformAbsorbedCostMicros === zero) ||
    (row.status === 'released' &&
      settledAmount === zero &&
      hasEvidence &&
      platformAbsorbedCostMicros === zero) ||
    (row.status === 'pending_reconciliation' &&
      settledAmount === null &&
      hasEvidence &&
      platformAbsorbedCostMicros > zero)
  if (!validShape) {
    return null
  }
  return {
    reservationRef: row.reservation_ref,
    status: row.status,
    estimatedAmount,
    settledAmount,
    actualCostMicros,
    usageEvidenceRef: row.usage_evidence_ref,
    platformAbsorbedCostMicros
  }
}

/** 创建预占提交结果未知的新连接只读 Repository。 */
export function createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository(
  executor: AiQuotaCommitUnknownReadOnlySqlExecutor
): AiQuotaReservationCommitUnknownReadOnlyRepository {
  return {
    read: async input => {
      if (!isValidReadScope(input.userRef, input.productActionId, input.idempotencyKey)) {
        throw new AiQuotaReservationPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度预占提交未知查询条件不合法'
        )
      }
      const rows = await executor.executeQuery(
        `SELECT 'reservation_commit_unknown' AS \`kind\`, \`r\`.\`reservation_ref\`,
                \`r\`.\`request_hash\`, \`r\`.\`status\`,
                CAST(\`r\`.\`estimated_amount\` AS CHAR) AS \`estimated_amount\`,
                \`r\`.\`capability\`, \`r\`.\`cost_policy_version\`,
                CAST(\`r\`.\`expires_at_ms\` AS CHAR) AS \`expires_at_ms\`
         FROM \`ai_quota_reservations\` AS \`r\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`r\`.\`user_internal_id\`
         WHERE \`u\`.\`public_user_id\` = ? AND \`r\`.\`product_action_id\` = ?
           AND \`r\`.\`idempotency_key\` = ?`,
        [input.userRef, input.productActionId, input.idempotencyKey]
      )
      const row = readSingleRow(rows)
      if (rows.length > one || (row !== null && row.kind !== 'reservation_commit_unknown')) {
        throw new AiQuotaReservationPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度预占提交未知读回不完整'
        )
      }
      if (row === null) {
        return null
      }
      const mapped = mapReservationRow(row)
      if (mapped === null) {
        throw new AiQuotaReservationPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度预占提交未知读回数据不合法'
        )
      }
      return mapped
    }
  }
}

/** 创建结算提交结果未知的新连接只读 Repository。 */
export function createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository(
  executor: AiQuotaCommitUnknownReadOnlySqlExecutor
): AiQuotaSettlementCommitUnknownReadOnlyRepository {
  return {
    read: async input => {
      if (!isValidReadScope(input.userRef, input.reservationRef)) {
        throw new AiQuotaSettlementPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度结算提交未知查询条件不合法'
        )
      }
      const rows = await executor.executeQuery(
        `SELECT 'settlement_commit_unknown' AS \`kind\`, \`r\`.\`reservation_ref\`,
                \`r\`.\`status\`, CAST(\`r\`.\`estimated_amount\` AS CHAR) AS \`estimated_amount\`,
                CAST(\`r\`.\`settled_amount\` AS CHAR) AS \`settled_amount\`,
                CAST(\`r\`.\`actual_cost_micros\` AS CHAR) AS \`actual_cost_micros\`,
                \`r\`.\`usage_evidence_ref\`,
                CAST(\`r\`.\`platform_absorbed_cost_micros\` AS CHAR)
                  AS \`platform_absorbed_cost_micros\`
         FROM \`ai_quota_reservations\` AS \`r\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`r\`.\`user_internal_id\`
         WHERE \`u\`.\`public_user_id\` = ? AND \`r\`.\`reservation_ref\` = ?`,
        [input.userRef, input.reservationRef]
      )
      const row = readSingleRow(rows)
      if (rows.length > one || (row !== null && row.kind !== 'settlement_commit_unknown')) {
        throw new AiQuotaSettlementPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度结算提交未知读回不完整'
        )
      }
      if (row === null) {
        return null
      }
      const mapped = mapSettlementRow(row)
      if (mapped === null) {
        throw new AiQuotaSettlementPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度结算提交未知读回数据不合法'
        )
      }
      return mapped
    }
  }
}
