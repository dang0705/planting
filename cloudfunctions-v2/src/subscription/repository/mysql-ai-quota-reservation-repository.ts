import type { UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  AiQuotaReservationSqlExecutor,
  ApplyAllocatedReservationInput,
  ExistingAiQuotaReservation,
  LockedAiQuotaAccount,
  LockedAiQuotaGrantCandidate,
  MysqlAiQuotaReservationRepository,
  ReadEligibleAiQuotaGrantsInput,
  ReadExistingAiQuotaReservationInput
} from './ai-quota-reservation-repository-types.js'
import { AiQuotaReservationPersistenceError } from './ai-quota-reservation-repository-types.js'
import { applyAiQuotaAllocation } from './mysql-ai-quota-reservation-writer.js'
import {
  assertSingleWrite,
  isSafeNonNegativeInteger,
  knownCapabilities,
  mapExistingReservation,
  mapGrantRow,
  readSingleAccountRow,
  verifyApplyInput,
  verifyExistingReservationInput,
  verifyInternalPrimaryKey
} from './ai-quota-reservation-repository-validation.js'

const zero = Number('0')
const one = Number('1')
const userPublicRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u

/** 创建只访问统一用户、额度批次、预占、分摊、账本和账户投影的 Repository。 */
export function createMysqlAiQuotaReservationRepository<
  TTransaction extends TransactionExecutionContext
>(
  executor: AiQuotaReservationSqlExecutor<TTransaction>
): MysqlAiQuotaReservationRepository<TTransaction> {
  const lockAccount = async (
    transaction: TTransaction,
    userRef: UserRef
  ): Promise<LockedAiQuotaAccount> => {
    if (!userPublicRefFormat.test(userRef)) {
      throw new AiQuotaReservationPersistenceError(
        'INTERNAL_DATA_INVALID',
        '统一用户公开引用不合法'
      )
    }
    const accountRow = readSingleAccountRow(
      await executor.executeQuery(
        transaction,
        `SELECT 'account' AS \`kind\`, CAST(\`a\`.\`id\` AS CHAR) AS \`account_internal_id\`,
                CAST(\`u\`.\`id\` AS CHAR) AS \`user_internal_id\`, \`u\`.\`status\` AS \`user_status\`,
                CAST(\`a\`.\`available_amount\` AS CHAR) AS \`available_amount\`,
                CAST(\`a\`.\`reserved_amount\` AS CHAR) AS \`reserved_amount\`,
                CAST(\`a\`.\`version\` AS CHAR) AS \`account_version\`
         FROM \`ai_quota_accounts\` AS \`a\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`a\`.\`user_internal_id\`
         WHERE \`u\`.\`public_user_id\` = ?
         FOR UPDATE`,
        [userRef]
      )
    )
    if (accountRow.user_status !== 'active') {
      throw new AiQuotaReservationPersistenceError('PRINCIPAL_INVALID', '登录主体已经失效')
    }
    return {
      accountInternalId: accountRow.account_internal_id,
      accountVersion: accountRow.resolvedVersion,
      userInternalId: accountRow.user_internal_id,
      availableAmount: accountRow.resolvedAvailableAmount,
      reservedAmount: accountRow.resolvedReservedAmount
    }
  }

  const readExistingReservation = async (
    transaction: TTransaction,
    input: ReadExistingAiQuotaReservationInput
  ): Promise<ExistingAiQuotaReservation | null> => {
    verifyExistingReservationInput(input)
    const rows = await executor.executeQuery(
      transaction,
      `SELECT 'reservation' AS \`kind\`, \`reservation_ref\`, \`request_hash\`, \`status\`,
              CAST(\`estimated_amount\` AS CHAR) AS \`estimated_amount\`, \`capability\`,
              \`cost_policy_version\`, CAST(\`expires_at_ms\` AS CHAR) AS \`expires_at_ms\`
       FROM \`ai_quota_reservations\`
       WHERE \`user_internal_id\` = ? AND \`product_action_id\` = ? AND \`idempotency_key\` = ?
       FOR UPDATE`,
      [input.userInternalId, input.productActionId, input.idempotencyKey]
    )
    if (rows.length === zero) {
      return null
    }
    const row = rows[zero]
    if (rows.length !== one || row?.kind !== 'reservation') {
      throw new AiQuotaReservationPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度预占幂等读回不完整'
      )
    }
    return mapExistingReservation(row, input.requestHash)
  }

  const readEligibleGrants = async (
    transaction: TTransaction,
    input: ReadEligibleAiQuotaGrantsInput
  ): Promise<readonly LockedAiQuotaGrantCandidate[]> => {
    verifyInternalPrimaryKey(input.userInternalId)
    if (!knownCapabilities.has(input.capability) || !isSafeNonNegativeInteger(input.occurredAtMs)) {
      throw new AiQuotaReservationPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度批次查询条件不合法'
      )
    }
    const grantRows = await executor.executeQuery(
      transaction,
      `SELECT 'grant' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`grant_internal_id\`, \`grant_ref\`,
              CAST(\`granted_amount\` AS CHAR) AS \`granted_amount\`,
              CAST(\`available_amount\` AS CHAR) AS \`available_amount\`,
              CAST(\`reserved_amount\` AS CHAR) AS \`reserved_amount\`,
              CAST(\`consumed_amount\` AS CHAR) AS \`consumed_amount\`,
              \`status\` AS \`grant_status\`, CAST(\`version\` AS CHAR) AS \`grant_version\`,
              CAST(\`granted_at_ms\` AS CHAR) AS \`granted_at_ms\`,
              CAST(\`expires_at_ms\` AS CHAR) AS \`expires_at_ms\`, \`capability_scope_json\`
       FROM \`ai_quota_grants\`
       WHERE \`user_internal_id\` = ?
         AND \`status\` IN ('active', 'partially_used')
         AND \`available_amount\` > 0
         AND \`granted_at_ms\` <= ?
         AND ? < \`expires_at_ms\`
         AND JSON_CONTAINS(\`capability_scope_json\`, JSON_QUOTE(?), '$')
       ORDER BY \`expires_at_ms\`, \`granted_at_ms\`, \`grant_ref\`
       FOR UPDATE`,
      [input.userInternalId, input.occurredAtMs, input.occurredAtMs, input.capability]
    )
    const grants: LockedAiQuotaGrantCandidate[] = []
    const seenGrantRefs = new Set<string>()
    for (const row of grantRows) {
      if (row.kind !== 'grant') {
        throw new AiQuotaReservationPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度批次查询返回未知行'
        )
      }
      const grant = mapGrantRow(row, input.capability, input.occurredAtMs)
      if (seenGrantRefs.has(grant.grantRef)) {
        throw new AiQuotaReservationPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度批次查询返回重复记录'
        )
      }
      seenGrantRefs.add(grant.grantRef)
      grants.push(grant)
    }
    return grants
  }

  const applyAllocatedReservation = async (
    transaction: TTransaction,
    input: ApplyAllocatedReservationInput
  ): Promise<void> => {
    verifyApplyInput(input)
    const lastAllocation = input.allocations.at(-one)
    if (lastAllocation === undefined) {
      throw new AiQuotaReservationPersistenceError('INTERNAL_DATA_INVALID', '额度预占分摊不能为空')
    }
    assertSingleWrite(
      await executor.executeWrite(
        transaction,
        `INSERT INTO \`ai_quota_reservations\`
         (\`reservation_ref\`, \`user_internal_id\`, \`product_action_id\`, \`cost_policy_version\`,
          \`capability\`, \`estimated_amount\`, \`settled_amount\`, \`actual_cost_micros\`,
          \`usage_evidence_ref\`, \`platform_absorbed_cost_micros\`, \`idempotency_key\`,
          \`request_hash\`, \`status\`, \`expires_at_ms\`, \`version\`, \`created_at_ms\`, \`updated_at_ms\`)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?, 'reserved', ?, 1, ?, ?)`,
        [
          input.reservationRef,
          input.userInternalId,
          input.productActionId,
          input.costPolicyVersion,
          input.capability,
          input.estimatedAmount,
          input.idempotencyKey,
          input.requestHash,
          input.expiresAtMs,
          input.occurredAtMs,
          input.occurredAtMs
        ]
      ),
      '额度预占记录写入冲突'
    )

    for (const allocation of input.allocations) {
      await applyAiQuotaAllocation(executor, transaction, input, allocation)
    }

    assertSingleWrite(
      await executor.executeWrite(
        transaction,
        `UPDATE \`ai_quota_accounts\`
         SET \`available_amount\` = \`available_amount\` - ?,
             \`reserved_amount\` = \`reserved_amount\` + ?,
             \`version\` = \`version\` + 1,
             \`last_ledger_internal_id\` = (SELECT \`id\` FROM \`ai_quota_ledger\` WHERE \`ledger_ref\` = ?),
             \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`version\` = ?
           AND \`available_amount\` >= ?`,
        [
          input.estimatedAmount,
          input.estimatedAmount,
          lastAllocation.ledgerRef,
          input.occurredAtMs,
          input.accountInternalId,
          input.userInternalId,
          input.accountVersion,
          input.estimatedAmount
        ]
      ),
      '额度账户投影更新冲突'
    )
  }

  return { lockAccount, readExistingReservation, readEligibleGrants, applyAllocatedReservation }
}

export type * from './ai-quota-reservation-repository-types.js'
export { AiQuotaReservationPersistenceError } from './ai-quota-reservation-repository-types.js'
