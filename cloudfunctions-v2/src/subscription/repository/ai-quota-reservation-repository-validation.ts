import type { UserGenerativeCapability } from '../../contracts/types.js'
import type {
  AiQuotaReservationAccountSqlRow,
  AiQuotaReservationExistingSqlRow,
  AiQuotaReservationGrantSqlRow,
  AiQuotaReservationSqlRow,
  AiQuotaReservationSqlWriteResult,
  ApplyAllocatedReservationInput,
  ExistingAiQuotaReservation,
  LockedAiQuotaGrantCandidate,
  ReadExistingAiQuotaReservationInput
} from './ai-quota-reservation-repository-types.js'
import { AiQuotaReservationPersistenceError } from './ai-quota-reservation-repository-types.js'

const zero = Number('0')
const one = Number('1')
const sha256HexLength = Number('64')
const positiveIntegerTextFormat = /^[1-9][0-9]*$/u
const nonNegativeIntegerTextFormat = /^(?:0|[1-9][0-9]*)$/u

/** 额度预占允许消费的全部生成式能力。 */
export const knownCapabilities = new Set<UserGenerativeCapability>([
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
])

/** 数据库 BIGINT 内部键保持十进制文本，禁止转换为可能丢精度的 number。 */
export function verifyInternalPrimaryKey(value: string): void {
  if (!positiveIntegerTextFormat.test(value)) {
    throw new AiQuotaReservationPersistenceError(
      'INTERNAL_DATA_INVALID',
      '额度预占内部归属数据不合法'
    )
  }
}

/** 将安全范围内的非负十进制文本转换为 JavaScript 整数。 */
function resolveSafeNonNegativeInteger(value: string, message: string): number {
  if (!nonNegativeIntegerTextFormat.test(value)) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < zero) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  return parsed
}

/** 时间与额度必须是 JavaScript 可安全表达的非负整数。 */
export function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= zero
}

/** 判断字符串是否为小写 SHA-256 十六进制摘要。 */
function isSha256(value: string): boolean {
  return new RegExp(`^[a-f0-9]{${sha256HexLength}}$`, 'u').test(value)
}

/** 验证 MySQL JSON 能力集合，并拒绝重复、乱序或未知值。 */
function resolveCapabilityScope(
  value: string | readonly unknown[]
): readonly UserGenerativeCapability[] {
  let parsed: unknown
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    throw new AiQuotaReservationPersistenceError(
      'INTERNAL_DATA_INVALID',
      '额度能力范围不是合法 JSON'
    )
  }
  if (!Array.isArray(parsed) || parsed.length === zero) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度能力范围不合法')
  }
  const result: UserGenerativeCapability[] = []
  for (const rawCapability of parsed) {
    if (
      typeof rawCapability !== 'string' ||
      !knownCapabilities.has(rawCapability as UserGenerativeCapability)
    ) {
      throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度能力范围不合法')
    }
    const capability = rawCapability as UserGenerativeCapability
    const previousCapability = result.at(-one)
    if (previousCapability !== undefined && previousCapability >= capability) {
      throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度能力范围不稳定')
    }
    result.push(capability)
  }
  return result
}

/** 要求账户锁查询恰好返回一行，并校验账户投影的安全整数。 */
export function readSingleAccountRow(
  rows: readonly AiQuotaReservationSqlRow[]
): AiQuotaReservationAccountSqlRow & {
  /** 已校验的账户版本。 */
  readonly resolvedVersion: number
  /** 已校验的账户可用额度。 */
  readonly resolvedAvailableAmount: number
  /** 已校验的账户预占额度。 */
  readonly resolvedReservedAmount: number
} {
  const row = rows[zero]
  if (rows.length !== one || row?.kind !== 'account') {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度账户锁定结果不完整')
  }
  verifyInternalPrimaryKey(row.account_internal_id)
  verifyInternalPrimaryKey(row.user_internal_id)
  const resolvedAvailableAmount = resolveSafeNonNegativeInteger(
    row.available_amount,
    '额度账户可用值不合法'
  )
  const resolvedReservedAmount = resolveSafeNonNegativeInteger(
    row.reserved_amount,
    '额度账户预占值不合法'
  )
  const resolvedVersion = resolveSafeNonNegativeInteger(row.account_version, '额度账户版本不合法')
  if (resolvedVersion < one) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度账户版本不合法')
  }
  return { ...row, resolvedVersion, resolvedAvailableAmount, resolvedReservedAmount }
}

/** 将额度数据库行恢复为纯领域候选并执行防损坏校验。 */
export function mapGrantRow(
  row: AiQuotaReservationGrantSqlRow,
  capability: UserGenerativeCapability,
  occurredAtMs: number
): LockedAiQuotaGrantCandidate {
  verifyInternalPrimaryKey(row.grant_internal_id)
  const grantedAmount = resolveSafeNonNegativeInteger(row.granted_amount, '额度批次发放值不合法')
  const availableAmount = resolveSafeNonNegativeInteger(
    row.available_amount,
    '额度批次可用值不合法'
  )
  const reservedAmount = resolveSafeNonNegativeInteger(row.reserved_amount, '额度批次预占值不合法')
  const consumedAmount = resolveSafeNonNegativeInteger(row.consumed_amount, '额度批次结算值不合法')
  const grantVersion = resolveSafeNonNegativeInteger(row.grant_version, '额度批次版本不合法')
  const grantedAtMs = resolveSafeNonNegativeInteger(row.granted_at_ms, '额度批次生效时间不合法')
  const expiresAtMs = resolveSafeNonNegativeInteger(row.expires_at_ms, '额度批次失效时间不合法')
  const capabilityScope = resolveCapabilityScope(row.capability_scope_json)
  if (
    !/^aqg_[A-Za-z0-9_-]{8,}$/u.test(row.grant_ref) ||
    (row.grant_status !== 'active' && row.grant_status !== 'partially_used') ||
    grantedAmount !== availableAmount + reservedAmount + consumedAmount ||
    availableAmount <= zero ||
    grantVersion < one ||
    grantedAtMs > occurredAtMs ||
    occurredAtMs >= expiresAtMs ||
    !capabilityScope.includes(capability)
  ) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度批次锁定结果不合法')
  }
  return {
    grantInternalId: row.grant_internal_id,
    grantRef: row.grant_ref,
    grantVersion,
    availableAmount,
    grantedAtMs,
    expiresAtMs,
    capabilityScope
  }
}

/** 验证幂等预占查询作用域，禁止把原始凭证或无界字符串带入 SQL。 */
export function verifyExistingReservationInput(input: ReadExistingAiQuotaReservationInput): void {
  verifyInternalPrimaryKey(input.userInternalId)
  if (
    !/^[A-Za-z0-9._:-]{1,100}$/u.test(input.productActionId) ||
    !/^[\u0020-\u007E]{8,128}$/u.test(input.idempotencyKey) ||
    !isSha256(input.requestHash)
  ) {
    throw new AiQuotaReservationPersistenceError(
      'INTERNAL_DATA_INVALID',
      '额度预占幂等作用域不合法'
    )
  }
}

/** 将已有预占行恢复为可重放摘要，并核验首次请求摘要。 */
export function mapExistingReservation(
  row: AiQuotaReservationExistingSqlRow,
  requestHash: string
): ExistingAiQuotaReservation {
  if (!isSha256(row.request_hash)) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度预占请求摘要损坏')
  }
  if (row.request_hash !== requestHash) {
    throw new AiQuotaReservationPersistenceError('IDEMPOTENCY_CONFLICT', '额度预占幂等键冲突')
  }
  const estimatedAmount = resolveSafeNonNegativeInteger(row.estimated_amount, '额度预占金额不合法')
  const expiresAtMs = resolveSafeNonNegativeInteger(row.expires_at_ms, '额度预占失效时间不合法')
  if (
    !/^aqr_[A-Za-z0-9_-]{8,}$/u.test(row.reservation_ref) ||
    estimatedAmount <= zero ||
    !knownCapabilities.has(row.capability) ||
    !/^[A-Za-z0-9._/-]{1,64}$/u.test(row.cost_policy_version)
  ) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度预占读回数据不合法')
  }
  return {
    reservationRef: row.reservation_ref,
    status: row.status,
    estimatedAmount,
    capability: row.capability,
    costPolicyVersion: row.cost_policy_version,
    expiresAtMs
  }
}

/** 任一写入必须恰好影响一行，否则由调用方回滚整个事务。 */
export function assertSingleWrite(result: AiQuotaReservationSqlWriteResult, message: string): void {
  if (result.affectedRows !== one) {
    throw new AiQuotaReservationPersistenceError('WRITE_CONFLICT', message)
  }
}

/** 验证完整分摊输入，防止越过纯领域计划直接制造半分摊。 */
export function verifyApplyInput(input: ApplyAllocatedReservationInput): void {
  verifyInternalPrimaryKey(input.userInternalId)
  verifyInternalPrimaryKey(input.accountInternalId)
  if (
    !/^aqr_[A-Za-z0-9_-]{8,}$/u.test(input.reservationRef) ||
    !/^[A-Za-z0-9._:-]{1,100}$/u.test(input.productActionId) ||
    !/^[A-Za-z0-9._/-]{1,64}$/u.test(input.costPolicyVersion) ||
    !knownCapabilities.has(input.capability) ||
    !Number.isSafeInteger(input.accountVersion) ||
    input.accountVersion < one ||
    !Number.isSafeInteger(input.estimatedAmount) ||
    input.estimatedAmount <= zero ||
    !/^[\u0020-\u007E]{8,128}$/u.test(input.idempotencyKey) ||
    !isSha256(input.requestHash) ||
    !isSafeNonNegativeInteger(input.occurredAtMs) ||
    !isSafeNonNegativeInteger(input.expiresAtMs) ||
    input.expiresAtMs <= input.occurredAtMs ||
    input.allocations.length === zero
  ) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度预占写入数据不合法')
  }

  const seenGrants = new Set<string>()
  const seenLedgers = new Set<string>()
  let total = zero
  for (const allocation of input.allocations) {
    verifyInternalPrimaryKey(allocation.grantInternalId)
    if (
      !/^aqg_[A-Za-z0-9_-]{8,}$/u.test(allocation.grantRef) ||
      !/^aql_[A-Za-z0-9_-]{8,}$/u.test(allocation.ledgerRef) ||
      !Number.isSafeInteger(allocation.reservedAmount) ||
      allocation.reservedAmount <= zero ||
      !Number.isSafeInteger(allocation.grantVersion) ||
      allocation.grantVersion < one ||
      seenGrants.has(allocation.grantRef) ||
      seenLedgers.has(allocation.ledgerRef)
    ) {
      throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度预占分摊不合法')
    }
    seenGrants.add(allocation.grantRef)
    seenLedgers.add(allocation.ledgerRef)
    total += allocation.reservedAmount
    if (!Number.isSafeInteger(total)) {
      throw new AiQuotaReservationPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度预占分摊总额不合法'
      )
    }
  }
  if (total !== input.estimatedAmount) {
    throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度预占分摊不守恒')
  }
}
