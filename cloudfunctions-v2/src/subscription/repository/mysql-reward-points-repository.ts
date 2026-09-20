import type { UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  ApplyRewardPointsInput,
  LockedRewardPointsState,
  MysqlRewardPointsRepository,
  RewardPointsAccountSqlRow,
  RewardPointsSqlExecutor
} from './reward-points-repository-types.js'
import { RewardPointsPersistenceError } from './reward-points-repository-types.js'

const zero = Number('0')
const one = Number('1')
const allowedSourceTypes = new Set([
  'FIRST_PROFILE',
  'DUE_SOIL_CHECK',
  'DUE_FERTILIZER_CHECK',
  'FIXED_DIAGNOSIS'
])

/** 将 MySQL 十进制文本解析为安全非负整数。 */
function parseNonNegativeInteger(value: string, label: string, positive: boolean): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', `${label}格式不合法`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < (positive ? one : zero)) {
    throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', `${label}超出安全范围`)
  }
  return parsed
}

/** 校验 BIGINT 内部主键文本但不转为可能丢精度的 JavaScript number。 */
function verifyInternalIdText(value: string, label: string): string {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', `${label}格式不合法`)
  }
  return value
}

/** 校验单次写入必须且只能影响一行。 */
function assertSingleWrite(affectedRows: number, message: string): void {
  if (affectedRows !== one) {
    throw new RewardPointsPersistenceError('WRITE_CONFLICT', message)
  }
}

/** 校验账户联合锁读回并映射为领域快照。 */
function mapAccountRow(
  row: RewardPointsAccountSqlRow
): Omit<LockedRewardPointsState, 'previouslyGrantedLevelCodes'> {
  if (row.user_status !== 'active' || !/^L[0-9]+$/u.test(row.level_code)) {
    throw new RewardPointsPersistenceError('PRINCIPAL_INVALID', '奖励积分所属用户已经失效')
  }
  const aiReservedAmount = parseNonNegativeInteger(row.ai_reserved_amount, 'AI预占额度', false)
  const aiConsumedAmount = parseNonNegativeInteger(row.ai_consumed_amount, 'AI已消费额度', false)
  if (!Number.isSafeInteger(aiReservedAmount + aiConsumedAmount)) {
    throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', 'AI额度账户数值溢出')
  }
  return {
    userInternalId: verifyInternalIdText(row.user_internal_id, '统一用户内部主键'),
    pointAccountInternalId: verifyInternalIdText(row.point_account_internal_id, '积分账户内部主键'),
    pointAccountVersion: parseNonNegativeInteger(row.point_account_version, '积分账户版本', true),
    availablePoints: parseNonNegativeInteger(row.available_points, '可用积分', false),
    lifetimeNetEarned: parseNonNegativeInteger(row.lifetime_net_earned, '累计积分', false),
    currentLevelCode: row.level_code,
    aiAccountInternalId: verifyInternalIdText(row.ai_account_internal_id, 'AI账户内部主键'),
    aiAccountVersion: parseNonNegativeInteger(row.ai_account_version, 'AI账户版本', true),
    aiAvailableAmount: parseNonNegativeInteger(row.ai_available_amount, 'AI可用额度', false)
  }
}

/** 校验一次奖励持久化输入与领域计划的整数守恒。 */
function verifyApplyInput(input: ApplyRewardPointsInput): void {
  const nextAvailable = input.currentAvailablePoints + input.pointsAmount
  const nextLifetime = input.currentLifetimeNetEarned + input.pointsAmount
  const uniqueLevels = new Set(input.levelRewards.map(reward => reward.levelCode))
  if (
    !/^[1-9][0-9]*$/u.test(input.userInternalId) ||
    !/^[1-9][0-9]*$/u.test(input.pointAccountInternalId) ||
    !/^[1-9][0-9]*$/u.test(input.aiAccountInternalId) ||
    !Number.isSafeInteger(input.pointAccountVersion) ||
    input.pointAccountVersion < one ||
    !Number.isSafeInteger(input.aiAccountVersion) ||
    input.aiAccountVersion < one ||
    !/^cpl_[A-Za-z0-9_-]{8,}$/u.test(input.pointLedgerRef) ||
    !allowedSourceTypes.has(input.sourceType) ||
    !/^[A-Za-z0-9._:-]{8,128}$/u.test(input.sourceRef) ||
    !/^[A-Za-z0-9._:-]{8,191}$/u.test(input.businessUniqueKey) ||
    !Number.isSafeInteger(input.pointsAmount) ||
    input.pointsAmount <= zero ||
    !Number.isSafeInteger(input.currentAvailablePoints) ||
    input.currentAvailablePoints < zero ||
    !Number.isSafeInteger(input.currentLifetimeNetEarned) ||
    input.currentLifetimeNetEarned < zero ||
    !Number.isSafeInteger(input.nextAvailablePoints) ||
    input.nextAvailablePoints < zero ||
    !Number.isSafeInteger(input.nextLifetimeNetEarned) ||
    input.nextLifetimeNetEarned < zero ||
    !Number.isSafeInteger(nextAvailable) ||
    !Number.isSafeInteger(nextLifetime) ||
    nextAvailable !== input.nextAvailablePoints ||
    nextLifetime !== input.nextLifetimeNetEarned ||
    !/^L[0-9]+$/u.test(input.nextLevelCode) ||
    !/^[A-Za-z0-9._/-]{1,64}$/u.test(input.policyVersion) ||
    !Number.isSafeInteger(input.occurredAtMs) ||
    input.occurredAtMs < zero ||
    uniqueLevels.size !== input.levelRewards.length ||
    input.levelRewards.some(
      reward =>
        !/^L[1-9][0-9]*$/u.test(reward.levelCode) ||
        !Number.isSafeInteger(reward.amount) ||
        reward.amount <= zero ||
        !/^clg_[A-Za-z0-9_-]{8,}$/u.test(reward.levelGrantRef) ||
        !/^aqg_[A-Za-z0-9_-]{8,}$/u.test(reward.aiGrantRef) ||
        !/^aql_[A-Za-z0-9_-]{8,}$/u.test(reward.aiLedgerRef) ||
        !Number.isSafeInteger(reward.expiresAtMs) ||
        reward.expiresAtMs <= input.occurredAtMs
    )
  ) {
    throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', '奖励积分持久化输入不合法')
  }
}

/** 创建只访问积分、等级奖励与对应 AI 额度表的 MySQL Repository。 */
export function createMysqlRewardPointsRepository<TTransaction extends TransactionExecutionContext>(
  executor: RewardPointsSqlExecutor<TTransaction>
): MysqlRewardPointsRepository<TTransaction> {
  const lockState = async (
    transaction: TTransaction,
    userRef: UserRef
  ): Promise<LockedRewardPointsState> => {
    if (!/^usr_[A-Za-z0-9_-]{8,}$/u.test(userRef)) {
      throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', '统一用户公开引用不合法')
    }
    const accountRows = await executor.executeQuery(
      transaction,
      `SELECT 'account' AS \`kind\`, CAST(\`u\`.\`id\` AS CHAR) AS \`user_internal_id\`,
              \`u\`.\`status\` AS \`user_status\`,
              CAST(\`p\`.\`id\` AS CHAR) AS \`point_account_internal_id\`,
              CAST(\`p\`.\`available_points\` AS CHAR) AS \`available_points\`,
              CAST(\`p\`.\`lifetime_net_earned\` AS CHAR) AS \`lifetime_net_earned\`,
              \`p\`.\`level_code\`, CAST(\`p\`.\`version\` AS CHAR) AS \`point_account_version\`,
              CAST(\`a\`.\`id\` AS CHAR) AS \`ai_account_internal_id\`,
              CAST(\`a\`.\`available_amount\` AS CHAR) AS \`ai_available_amount\`,
              CAST(\`a\`.\`reserved_amount\` AS CHAR) AS \`ai_reserved_amount\`,
              CAST(\`a\`.\`consumed_amount\` AS CHAR) AS \`ai_consumed_amount\`,
              CAST(\`a\`.\`version\` AS CHAR) AS \`ai_account_version\`
       FROM \`users\` AS \`u\`
       JOIN \`care_point_accounts\` AS \`p\` ON \`p\`.\`user_internal_id\` = \`u\`.\`id\`
       JOIN \`ai_quota_accounts\` AS \`a\` ON \`a\`.\`user_internal_id\` = \`u\`.\`id\`
       WHERE \`u\`.\`public_user_id\` = ?
       FOR UPDATE`,
      [userRef]
    )
    const accountRow = accountRows[zero]
    if (accountRows.length !== one || accountRow?.kind !== 'account') {
      throw new RewardPointsPersistenceError('PRINCIPAL_INVALID', '奖励积分账户不存在或不可用')
    }
    const account = mapAccountRow(accountRow)
    const levelRows = await executor.executeQuery(
      transaction,
      `SELECT 'level' AS \`kind\`, \`level_code\`
       FROM \`care_level_grants\`
       WHERE \`user_internal_id\` = ?
       ORDER BY \`level_code\`
       FOR UPDATE`,
      [account.userInternalId]
    )
    const levels: string[] = []
    for (const row of levelRows) {
      if (
        row.kind !== 'level' ||
        !/^L[1-9][0-9]*$/u.test(row.level_code) ||
        levels.includes(row.level_code)
      ) {
        throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', '已发等级奖励记录损坏')
      }
      levels.push(row.level_code)
    }
    return { ...account, previouslyGrantedLevelCodes: levels }
  }

  const apply = async (transaction: TTransaction, input: ApplyRewardPointsInput): Promise<void> => {
    verifyApplyInput(input)
    assertSingleWrite(
      (
        await executor.executeWrite(
          transaction,
          `INSERT INTO \`care_point_ledger\`
           (\`_openid\`, \`ledger_ref\`, \`user_internal_id\`, \`entry_type\`, \`amount\`,
            \`source_type\`, \`source_ref\`, \`business_unique_key\`, \`original_ledger_internal_id\`,
            \`policy_version\`, \`occurred_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
           VALUES ('', ?, ?, 'grant', ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
          [
            input.pointLedgerRef,
            input.userInternalId,
            input.pointsAmount,
            input.sourceType,
            input.sourceRef,
            input.businessUniqueKey,
            input.policyVersion,
            input.occurredAtMs,
            input.occurredAtMs,
            input.occurredAtMs
          ]
        )
      ).affectedRows,
      '积分账本写入冲突'
    )
    assertSingleWrite(
      (
        await executor.executeWrite(
          transaction,
          `UPDATE \`care_point_accounts\`
           SET \`available_points\` = ?, \`lifetime_net_earned\` = ?, \`level_code\` = ?,
               \`version\` = \`version\` + 1,
               \`last_ledger_internal_id\` = (SELECT \`id\` FROM \`care_point_ledger\` WHERE \`ledger_ref\` = ?),
               \`updated_at_ms\` = ?
           WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`version\` = ?
             AND \`available_points\` = ? AND \`lifetime_net_earned\` = ?`,
          [
            input.nextAvailablePoints,
            input.nextLifetimeNetEarned,
            input.nextLevelCode,
            input.pointLedgerRef,
            input.occurredAtMs,
            input.pointAccountInternalId,
            input.userInternalId,
            input.pointAccountVersion,
            input.currentAvailablePoints,
            input.currentLifetimeNetEarned
          ]
        )
      ).affectedRows,
      '积分账户投影更新冲突'
    )

    let totalAiReward = zero
    let lastAiLedgerRef: string | undefined
    for (const reward of input.levelRewards) {
      totalAiReward += reward.amount
      if (!Number.isSafeInteger(totalAiReward)) {
        throw new RewardPointsPersistenceError('INTERNAL_DATA_INVALID', '等级AI奖励总额溢出')
      }
      lastAiLedgerRef = reward.aiLedgerRef
      assertSingleWrite(
        (
          await executor.executeWrite(
            transaction,
            `INSERT INTO \`ai_quota_grants\`
             (\`_openid\`, \`grant_ref\`, \`user_internal_id\`, \`source_type\`, \`source_ref\`,
              \`granted_amount\`, \`available_amount\`, \`reserved_amount\`, \`consumed_amount\`,
              \`capability_scope_json\`, \`policy_version\`, \`status\`, \`granted_at_ms\`,
              \`expires_at_ms\`, \`version\`, \`created_at_ms\`, \`updated_at_ms\`)
             VALUES ('', ?, ?, 'CARE_LEVEL', ?, ?, ?, 0, 0,
                     JSON_ARRAY('USER_AGENT_TEXT', 'USER_DIAGNOSIS_TEXT', 'USER_DIAGNOSIS_VISUAL'),
                     ?, 'active', ?, ?, 1, ?, ?)`,
            [
              reward.aiGrantRef,
              input.userInternalId,
              `care-level:${reward.levelCode}`,
              reward.amount,
              reward.amount,
              input.policyVersion,
              input.occurredAtMs,
              reward.expiresAtMs,
              input.occurredAtMs,
              input.occurredAtMs
            ]
          )
        ).affectedRows,
        '等级AI额度批次写入冲突'
      )
      assertSingleWrite(
        (
          await executor.executeWrite(
            transaction,
            `INSERT INTO \`ai_quota_ledger\`
             (\`_openid\`, \`ledger_ref\`, \`user_internal_id\`, \`grant_internal_id\`,
              \`reservation_internal_id\`, \`entry_type\`, \`amount\`, \`operation_unique_key\`,
              \`original_ledger_internal_id\`, \`occurred_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
             SELECT '', ?, ?, \`id\`, NULL, 'grant', ?, ?, NULL, ?, ?, ?
             FROM \`ai_quota_grants\` WHERE \`grant_ref\` = ? AND \`user_internal_id\` = ?`,
            [
              reward.aiLedgerRef,
              input.userInternalId,
              reward.amount,
              `grant:${reward.aiGrantRef}`,
              input.occurredAtMs,
              input.occurredAtMs,
              input.occurredAtMs,
              reward.aiGrantRef,
              input.userInternalId
            ]
          )
        ).affectedRows,
        '等级AI额度账本写入冲突'
      )
      assertSingleWrite(
        (
          await executor.executeWrite(
            transaction,
            `INSERT INTO \`care_level_grants\`
             (\`_openid\`, \`grant_ref\`, \`user_internal_id\`, \`level_code\`,
              \`qualifying_ledger_internal_id\`, \`ai_quota_grant_internal_id\`,
              \`granted_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
             SELECT '', ?, ?, ?, \`p\`.\`id\`, \`a\`.\`id\`, ?, ?, ?
             FROM \`care_point_ledger\` AS \`p\`
             JOIN \`ai_quota_grants\` AS \`a\` ON \`a\`.\`grant_ref\` = ?
             WHERE \`p\`.\`ledger_ref\` = ?`,
            [
              reward.levelGrantRef,
              input.userInternalId,
              reward.levelCode,
              input.occurredAtMs,
              input.occurredAtMs,
              input.occurredAtMs,
              reward.aiGrantRef,
              input.pointLedgerRef
            ]
          )
        ).affectedRows,
        '等级终身一次奖励记录写入冲突'
      )
    }
    if (lastAiLedgerRef !== undefined) {
      assertSingleWrite(
        (
          await executor.executeWrite(
            transaction,
            `UPDATE \`ai_quota_accounts\`
             SET \`available_amount\` = \`available_amount\` + ?,
                 \`version\` = \`version\` + 1,
                 \`last_ledger_internal_id\` = (SELECT \`id\` FROM \`ai_quota_ledger\` WHERE \`ledger_ref\` = ?),
                 \`updated_at_ms\` = ?
             WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`version\` = ?`,
            [
              totalAiReward,
              lastAiLedgerRef,
              input.occurredAtMs,
              input.aiAccountInternalId,
              input.userInternalId,
              input.aiAccountVersion
            ]
          )
        ).affectedRows,
        'AI额度账户投影更新冲突'
      )
    }
  }

  return { lockState, apply }
}

export type * from './reward-points-repository-types.js'
export { RewardPointsPersistenceError } from './reward-points-repository-types.js'
