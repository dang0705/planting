import { createHash } from 'node:crypto'

import type { EventRef, RewardEventType, UserPlantRef, UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'

const zero = Number('0')
const one = Number('1')
const two = Number('2')
const sha256HexLength = Number('64')
const sha256Format = new RegExp(`^[a-f0-9]{${String(sha256HexLength)}}$`, 'u')

/** 奖励事件 inbox 持久化错误的稳定内部类型。 */
export type RewardInboxPersistenceErrorType =
  | 'INTERNAL_DATA_INVALID'
  | 'PRINCIPAL_INVALID'
  | 'IDEMPOTENCY_CONFLICT'
  | 'COMMIT_RESULT_UNKNOWN'
  | 'WRITE_CONFLICT'

/** 奖励事件 inbox 错误只允许由应用层映射为脱敏公开错误。 */
export class RewardInboxPersistenceError extends Error {
  /** 稳定内部错误类型。 */
  readonly type: RewardInboxPersistenceErrorType

  constructor(type: RewardInboxPersistenceErrorType, message: string) {
    super(message)
    this.name = '奖励事件收件持久化错误'
    this.type = type
  }
}

/** 收件唯一键查询允许读回的最小数据库行。 */
export type RewardInboxSqlRow = {
  /** inbox BIGINT 内部主键的十进制文本。 */
  readonly inbox_internal_id: string
  /** 全局高熵事件引用。 */
  readonly event_id: string
  /** 已登记的版本化事件类型。 */
  readonly event_type: RewardEventType
  /** 事件合同版本的十进制文本。 */
  readonly event_version: string
  /** 事件生产业务域。 */
  readonly producer_domain: 'user-plant' | 'care' | 'diagnosis' | 'plant-knowledge'
  /** 统一用户公开引用，通过 users 表关联读回。 */
  readonly user_ref: string
  /** 可选用户植物公开引用。 */
  readonly user_plant_ref: string | null
  /** 产生事实的聚合公开引用。 */
  readonly aggregate_ref: string
  /** 业务发生实例的去重引用。 */
  readonly occurrence_ref: string
  /** subscription 裁决的奖励业务唯一键。 */
  readonly business_unique_key: string
  /** 规范化事件载荷 SHA-256。 */
  readonly payload_hash: string
  /** 生产域形成事实时使用的策略版本。 */
  readonly producer_policy_version: string
  /** subscription 首次接收时锁定的奖励策略版本。 */
  readonly reward_policy_version: string
  /** subscription 首次接收时锁定的奖励策略内容 SHA-256。 */
  readonly reward_policy_content_sha256: string
  /** 业务事实发生时间的 UTC 毫秒文本。 */
  readonly occurred_at_ms: string
  /** inbox 当前处理状态。 */
  readonly status: 'received' | 'applied' | 'rejected'
  /** 已应用积分账本或奖励结果公开引用。 */
  readonly result_ref: string | null
  /** 被拒绝时的脱敏原因代码。 */
  readonly rejection_code: string | null
}

/** 锁定活跃统一用户时读取的最小内部行。 */
export type RewardInboxPrincipalSqlRow = {
  /** users BIGINT 内部主键的十进制文本，只能在当前事务内使用。 */
  readonly user_internal_id: string
}

/** 参数化 SQL 写入结果。 */
export type RewardInboxSqlWriteResult = {
  /**
   * SQL 实际影响行数。执行端必须关闭 MySQL CLIENT_FOUND_ROWS：首次 INSERT 为 1，
   * 唯一键重放且无字段变化为 0；不得把“命中既有行”伪装成首次写入。
   */
  readonly affectedRows: number
}

/** 奖励事件 inbox 使用的参数化 SQL 端口。 */
export type RewardInboxSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务中锁定奖励事件所属的活跃统一用户。 */
  readonly executePrincipalQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly RewardInboxPrincipalSqlRow[]>
  /** 在调用方事务中执行受控查询。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly RewardInboxSqlRow[]>
  /** 在调用方事务中执行受控写入。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<RewardInboxSqlWriteResult>
}

/** 首次接收前已经完成服务签名、事件 Schema 和奖励策略解析的内部输入。 */
export type ReserveRewardInboxInput = {
  /** 全局高熵事件引用；同一事件重试必须保持不变。 */
  readonly eventId: EventRef
  /** 已登记的版本化事件类型。 */
  readonly eventType: RewardEventType
  /** 当前奖励事件合同版本，固定为 1。 */
  readonly eventVersion: 1
  /** 与事件类型一致的生产业务域。 */
  readonly producerDomain: 'user-plant' | 'care' | 'diagnosis' | 'plant-knowledge'
  /** 已由身份域解析的统一用户公开引用。 */
  readonly userRef: UserRef
  /** 植物范围事件的用户植物公开引用。 */
  readonly userPlantRef?: UserPlantRef
  /** 产生事实的聚合公开引用。 */
  readonly aggregateRef: string
  /** 业务发生实例的去重引用。 */
  readonly occurrenceRef: string
  /** subscription 根据事件事实和策略生成的业务唯一键。 */
  readonly businessUniqueKey: string
  /** 已规范化、只包含奖励资格事实的 JSON 对象文本。 */
  readonly payloadJson: string
  /** payloadJson 的小写 SHA-256。 */
  readonly payloadHash: string
  /** 生产域形成事实时使用的策略版本。 */
  readonly producerPolicyVersion: string
  /** subscription 按发生时间锁定的奖励策略版本。 */
  readonly rewardPolicyVersion: string
  /** 锁定奖励策略规范化内容的 SHA-256。 */
  readonly rewardPolicyContentSha256: string
  /** 业务事实发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** subscription 收到事件的服务端可信时间，UTC 毫秒。 */
  readonly receivedAtMs: number
}

/** 首次成功预留 inbox 的结果。 */
export type ReservedRewardInboxResult = {
  /** 固定为首次预留成功。 */
  readonly kind: 'reserved'
  /** inbox BIGINT 内部主键文本，只能留在 subscription 内部。 */
  readonly inboxInternalId: string
}

/** 同一 eventId、相同内容重放的既有结果。 */
export type ReplayedRewardInboxResult = {
  /** 固定为同事件安全重放。 */
  readonly kind: 'replayed'
  /** 既有奖励事件收件的处理状态。 */
  readonly status: 'received' | 'applied' | 'rejected'
  /** 已应用结果引用；非 applied 时为空。 */
  readonly resultRef: string | null
  /** 拒绝原因；非 rejected 时为空。 */
  readonly rejectionCode: string | null
}

/** 不同 eventId 命中相同业务事实时的去重确认。 */
export type DuplicateRewardBusinessResult = {
  /** 固定为业务事实已存在，调用方不得再次入账。 */
  readonly kind: 'duplicate_business'
  /** 既有业务事实处理状态。 */
  readonly status: 'received' | 'applied' | 'rejected'
  /** 已应用结果引用；非 applied 时为空。 */
  readonly resultRef: string | null
}

/** inbox 预留的封闭结果。 */
export type ReserveRewardInboxResult =
  | ReservedRewardInboxResult
  | ReplayedRewardInboxResult
  | DuplicateRewardBusinessResult

/** 奖励事件 inbox Repository 端口。 */
export type MysqlRewardInboxRepository<TTransaction extends TransactionExecutionContext> = {
  /** 原子预留新事件，或安全返回同事件/同业务事实的既有状态。 */
  readonly reserve: (
    transaction: TTransaction,
    input: ReserveRewardInboxInput
  ) => Promise<ReserveRewardInboxResult>
  /** 在同一事务内把首次收件原子推进为已应用，并保存公开结果引用。 */
  readonly markApplied: (
    transaction: TTransaction,
    inboxInternalId: string,
    resultRef: string,
    appliedAtMs: number
  ) => Promise<void>
}

const eventProducerDomainMap = {
  'user_plant.profile_completed.v1': 'user-plant',
  'care.soil_check_completed.v1': 'care',
  'care.fertilizing_check_completed.v1': 'care',
  'diagnosis.fixed_package_completed.v1': 'diagnosis',
  'knowledge.contribution_released.v1': 'plant-knowledge'
} as const satisfies Record<RewardEventType, ReserveRewardInboxInput['producerDomain']>

/** 解析并校验安全整数文本。 */
function parseSafeIntegerText(value: string, label: string, allowZero: boolean): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', `${label}格式不合法`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? zero : one)) {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', `${label}超出安全范围`)
  }
  return parsed
}

/** 校验首次收件输入，防止绕过事件 Schema 或策略解析器构造数据库事实。 */
function verifyReserveInput(input: ReserveRewardInboxInput): void {
  let payload: unknown
  try {
    payload = JSON.parse(input.payloadJson)
  } catch {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件载荷不是合法JSON')
  }
  const payloadDigest = createHash('sha256').update(input.payloadJson).digest('hex')
  const plantRequired = input.eventType !== 'knowledge.contribution_released.v1'
  if (
    !/^evt_[A-Za-z0-9_-]{8,}$/u.test(input.eventId) ||
    input.eventVersion !== one ||
    eventProducerDomainMap[input.eventType] !== input.producerDomain ||
    !/^usr_[A-Za-z0-9_-]{8,}$/u.test(input.userRef) ||
    (plantRequired && !/^upl_[A-Za-z0-9_-]{8,}$/u.test(input.userPlantRef ?? '')) ||
    (!plantRequired && input.userPlantRef !== undefined) ||
    !/^[A-Za-z0-9._:-]{8,128}$/u.test(input.aggregateRef) ||
    !/^[A-Za-z0-9._:-]{8,128}$/u.test(input.occurrenceRef) ||
    !/^[A-Za-z0-9._:-]{8,191}$/u.test(input.businessUniqueKey) ||
    payload === null ||
    Array.isArray(payload) ||
    typeof payload !== 'object' ||
    !sha256Format.test(input.payloadHash) ||
    payloadDigest !== input.payloadHash ||
    !/^[A-Za-z0-9._/-]{1,64}$/u.test(input.producerPolicyVersion) ||
    !/^[A-Za-z0-9._/-]{1,64}$/u.test(input.rewardPolicyVersion) ||
    !sha256Format.test(input.rewardPolicyContentSha256) ||
    !Number.isSafeInteger(input.occurredAtMs) ||
    input.occurredAtMs < zero ||
    !Number.isSafeInteger(input.receivedAtMs) ||
    input.receivedAtMs < zero
  ) {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件收件输入不合法')
  }
}

/** 校验读回行的状态字段组合和内部值。 */
function verifyStoredRow(row: RewardInboxSqlRow): void {
  parseSafeIntegerText(row.inbox_internal_id, '奖励收件内部主键', false)
  parseSafeIntegerText(row.event_version, '奖励事件版本', false)
  parseSafeIntegerText(row.occurred_at_ms, '奖励事件发生时间', true)
  const validTerminal =
    (row.status === 'received' && row.result_ref === null && row.rejection_code === null) ||
    (row.status === 'applied' &&
      /^(?:cpl|aqg)_[A-Za-z0-9_-]{8,}$/u.test(row.result_ref ?? '') &&
      row.rejection_code === null) ||
    (row.status === 'rejected' && row.result_ref === null && row.rejection_code !== null)
  if (!validTerminal) {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件收件状态损坏')
  }
}

/** 判断已有 eventId 是否与本次输入完全一致。 */
function isSameEvent(row: RewardInboxSqlRow, input: ReserveRewardInboxInput): boolean {
  return (
    row.event_id === input.eventId &&
    row.event_type === input.eventType &&
    row.event_version === String(input.eventVersion) &&
    row.producer_domain === input.producerDomain &&
    row.user_ref === input.userRef &&
    row.user_plant_ref === (input.userPlantRef ?? null) &&
    row.aggregate_ref === input.aggregateRef &&
    row.occurrence_ref === input.occurrenceRef &&
    row.business_unique_key === input.businessUniqueKey &&
    row.payload_hash === input.payloadHash &&
    row.producer_policy_version === input.producerPolicyVersion &&
    row.reward_policy_version === input.rewardPolicyVersion &&
    row.reward_policy_content_sha256 === input.rewardPolicyContentSha256 &&
    row.occurred_at_ms === String(input.occurredAtMs)
  )
}

/** 判断相同奖励业务键是否仍描述同一条不可变业务事实。 */
function isSameRewardBusinessFact(row: RewardInboxSqlRow, input: ReserveRewardInboxInput): boolean {
  return (
    row.event_type === input.eventType &&
    row.event_version === String(input.eventVersion) &&
    row.producer_domain === input.producerDomain &&
    row.user_ref === input.userRef &&
    row.user_plant_ref === (input.userPlantRef ?? null) &&
    row.aggregate_ref === input.aggregateRef &&
    row.occurrence_ref === input.occurrenceRef &&
    row.business_unique_key === input.businessUniqueKey &&
    row.payload_hash === input.payloadHash &&
    row.producer_policy_version === input.producerPolicyVersion &&
    row.occurred_at_ms === String(input.occurredAtMs)
  )
}

/** 把已锁定的既有行分类为同事件重放或同业务事实重复。 */
function resolveExistingRow(
  row: RewardInboxSqlRow,
  input: ReserveRewardInboxInput
): ReplayedRewardInboxResult | DuplicateRewardBusinessResult {
  verifyStoredRow(row)
  if (row.event_id === input.eventId) {
    if (!isSameEvent(row, input)) {
      throw new RewardInboxPersistenceError('IDEMPOTENCY_CONFLICT', '奖励事件内容或策略发生冲突')
    }
    return {
      kind: 'replayed',
      status: row.status,
      resultRef: row.result_ref,
      rejectionCode: row.rejection_code
    }
  }
  if (row.business_unique_key !== input.businessUniqueKey) {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件唯一键读回不一致')
  }
  if (row.user_ref !== input.userRef) {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励业务唯一键归属冲突')
  }
  if (!isSameRewardBusinessFact(row, input)) {
    throw new RewardInboxPersistenceError(
      'IDEMPOTENCY_CONFLICT',
      '奖励业务唯一键对应的事件事实发生冲突'
    )
  }
  return {
    kind: 'duplicate_business',
    status: row.status,
    resultRef: row.result_ref
  }
}

const selectInboxForUpdateSql = `SELECT CAST(\`i\`.\`id\` AS CHAR) AS \`inbox_internal_id\`, \`i\`.\`event_id\`,
       \`i\`.\`event_type\`, CAST(\`i\`.\`event_version\` AS CHAR) AS \`event_version\`,
       \`i\`.\`producer_domain\`, \`u\`.\`public_user_id\` AS \`user_ref\`,
       \`i\`.\`user_plant_ref\`, \`i\`.\`aggregate_ref\`, \`i\`.\`occurrence_ref\`,
       \`i\`.\`business_unique_key\`, \`i\`.\`payload_hash\`,
       \`i\`.\`producer_policy_version\`, \`i\`.\`reward_policy_version\`,
       \`i\`.\`reward_policy_content_sha256\`,
       CAST(\`i\`.\`occurred_at_ms\` AS CHAR) AS \`occurred_at_ms\`,
       \`i\`.\`status\`, \`i\`.\`result_ref\`, \`i\`.\`rejection_code\`
FROM \`subscription_reward_inbox\` AS \`i\`
JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`i\`.\`user_internal_id\`
WHERE \`i\`.\`event_id\` = ? OR \`i\`.\`business_unique_key\` = ?
FOR UPDATE`

/** 创建只访问 subscription 奖励 inbox 的 MySQL Repository。 */
export function createMysqlRewardInboxRepository<TTransaction extends TransactionExecutionContext>(
  executor: RewardInboxSqlExecutor<TTransaction>
): MysqlRewardInboxRepository<TTransaction> {
  const reserve = async (
    transaction: TTransaction,
    input: ReserveRewardInboxInput
  ): Promise<ReserveRewardInboxResult> => {
    verifyReserveInput(input)
    const principalRows = await executor.executePrincipalQuery(
      transaction,
      `SELECT CAST(\`id\` AS CHAR) AS \`user_internal_id\`
       FROM \`users\`
       WHERE \`public_user_id\` = ? AND \`status\` = 'active'
       FOR UPDATE`,
      [input.userRef]
    )
    const principalRow = principalRows[zero]
    if (principalRows.length !== one || principalRow === undefined) {
      throw new RewardInboxPersistenceError('PRINCIPAL_INVALID', '奖励事件主体不存在或已失效')
    }
    parseSafeIntegerText(principalRow.user_internal_id, '统一用户内部主键', false)
    const existingRows = await executor.executeQuery(transaction, selectInboxForUpdateSql, [
      input.eventId,
      input.businessUniqueKey
    ])
    if (existingRows.length > one) {
      throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件唯一键指向多条记录')
    }
    const existingRow = existingRows[zero]
    if (existingRow !== undefined) {
      return resolveExistingRow(existingRow, input)
    }
    const insertResult = await executor.executeWrite(
      transaction,
      `INSERT INTO \`subscription_reward_inbox\`
        (\`_openid\`, \`event_id\`, \`event_type\`, \`event_version\`, \`producer_domain\`,
         \`user_internal_id\`, \`user_plant_ref\`, \`aggregate_ref\`, \`occurrence_ref\`,
         \`business_unique_key\`, \`payload_hash\`, \`payload_json\`, \`producer_policy_version\`,
         \`reward_policy_version\`, \`reward_policy_content_sha256\`, \`status\`, \`result_ref\`,
         \`rejection_code\`, \`occurred_at_ms\`, \`received_at_ms\`, \`applied_at_ms\`,
         \`created_at_ms\`, \`updated_at_ms\`)
       VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?,
               'received', NULL, NULL, ?, ?, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE
         \`id\` = LAST_INSERT_ID(\`subscription_reward_inbox\`.\`id\`)`,
      [
        input.eventId,
        input.eventType,
        input.eventVersion,
        input.producerDomain,
        principalRow.user_internal_id,
        input.userPlantRef ?? null,
        input.aggregateRef,
        input.occurrenceRef,
        input.businessUniqueKey,
        input.payloadHash,
        input.payloadJson,
        input.producerPolicyVersion,
        input.rewardPolicyVersion,
        input.rewardPolicyContentSha256,
        input.occurredAtMs,
        input.receivedAtMs,
        input.receivedAtMs,
        input.receivedAtMs
      ]
    )
    if (
      insertResult.affectedRows !== zero &&
      insertResult.affectedRows !== one &&
      insertResult.affectedRows !== two
    ) {
      throw new RewardInboxPersistenceError('WRITE_CONFLICT', '奖励事件收件写入结果异常')
    }
    const rows = await executor.executeQuery(transaction, selectInboxForUpdateSql, [
      input.eventId,
      input.businessUniqueKey
    ])
    const row = rows[zero]
    if (rows.length !== one || row === undefined) {
      throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件收件读回不完整')
    }
    if (row.event_id === input.eventId) {
      if (!isSameEvent(row, input)) {
        throw new RewardInboxPersistenceError('IDEMPOTENCY_CONFLICT', '奖励事件内容或策略发生冲突')
      }
      verifyStoredRow(row)
      if (row.status !== 'received') {
        throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '新奖励事件初态不合法')
      }
      return { kind: 'reserved', inboxInternalId: row.inbox_internal_id }
    }
    return resolveExistingRow(row, input)
  }

  const markApplied = async (
    transaction: TTransaction,
    inboxInternalId: string,
    resultRef: string,
    appliedAtMs: number
  ): Promise<void> => {
    if (
      !/^[1-9][0-9]*$/u.test(inboxInternalId) ||
      !/^(?:cpl|aqg)_[A-Za-z0-9_-]{8,}$/u.test(resultRef) ||
      !Number.isSafeInteger(appliedAtMs) ||
      appliedAtMs < zero
    ) {
      throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件应用结果不合法')
    }
    const result = await executor.executeWrite(
      transaction,
      `UPDATE \`subscription_reward_inbox\`
       SET \`status\` = 'applied', \`result_ref\` = ?, \`applied_at_ms\` = ?, \`updated_at_ms\` = ?
       WHERE \`id\` = ? AND \`status\` = 'received'
         AND \`result_ref\` IS NULL AND \`rejection_code\` IS NULL AND \`applied_at_ms\` IS NULL`,
      [resultRef, appliedAtMs, appliedAtMs, inboxInternalId]
    )
    if (result.affectedRows !== one) {
      throw new RewardInboxPersistenceError('WRITE_CONFLICT', '奖励事件应用状态更新冲突')
    }
  }

  return { reserve, markApplied }
}
