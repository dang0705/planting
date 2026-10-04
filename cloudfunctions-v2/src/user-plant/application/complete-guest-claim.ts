import { DatabaseCommitResultUnknownError, runDatabaseTransaction, type DatabaseTransactionDriver, type TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { lockGuestClaimCompletionInput, type GuestClaimCompletionResult, type GuestClaimNewPlantCompletionInput } from '../repository/mysql-guest-claim-completion-core.js'
import type { GuestClaimExistingCompletionInput } from '../repository/mysql-guest-claim-existing-completion-repository.js'
import type { GuestClaimCompletedReceiptInput, GuestClaimCompletedReceiptResult } from '../repository/mysql-guest-claim-completed-receipt-reader.js'

/** 两种显式目标的可信完成上下文；不接受未登记的租约期限。 */
export type GuestClaimCompletionApplicationInput = GuestClaimExistingCompletionInput | GuestClaimNewPlantCompletionInput
/** 应用只编排本领域已有事务与读取端口，不访问底层SQL。 */
export interface GuestClaimCompletionApplicationDependencies<T extends TransactionExecutionContext> {
  /** 受控服务端时钟，每次只读核对独立捕获，不接受客户端时间。 */
  readonly nowMs: () => number
  /** 唯一事务驱动，提交未知时不能再写入或盲目回滚。 */
  readonly driver: DatabaseTransactionDriver<T>
  /** 已有目标的已验证原子完成端口，不消费容量策略。 */
  readonly existingRepository: {
    /** 使用应用创建的同一事务，不自行提交。 */
    complete(tx: T, input: GuestClaimExistingCompletionInput): Promise<GuestClaimCompletionResult>
  }
  /** 新建目标的已验证创建与认领同事务端口。 */
  readonly newPlantRepository: {
    /** 在同一事务核验能力/容量、创建植物和认领事实。 */
    complete(tx: T, input: GuestClaimNewPlantCompletionInput): Promise<GuestClaimCompletionResult>
  }
  /** 使用独立新连接核对原成功事实，不能提供写方法。 */
  readonly completedReceiptReader: {
    /** 只有完整成功关系可返回completed；不存在返回null。 */
    readCompleted(input: GuestClaimCompletedReceiptInput): Promise<GuestClaimCompletedReceiptResult>
  }
}
/** 存储不可用必须回滚，不能把含半写入的事务提交。 */
class GuestClaimStorageUnavailableError extends Error {}
/** 原有命名空间与数据库引用容量硬规则，不作宽松转换。 */
function ref(value: unknown, prefix: string): value is string { return typeof value === 'string' && value.length <= 64 && new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,}$`, 'u').test(value) }
/** 严格投影端口结果，区分原收据与本次完成，拒绝附带受限字段。 */
function checked(value: GuestClaimCompletionResult, input: GuestClaimCompletionApplicationInput, fresh: boolean, atMs: number): GuestClaimCompletionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('认领结果形状不合法') }
  if (value.status === 'completed') {
    const keys = ['status', 'claimRef', 'userPlantRef', 'guestPlantCaseRef', 'proofVersion', 'claimedAtMs']
    if (Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k))
      || !ref(value.claimRef, 'gcl') || !ref(value.userPlantRef, 'upl') || value.guestPlantCaseRef !== input.guestPlantCaseRef
      || !Number.isInteger(value.proofVersion) || value.proofVersion < 1 || value.proofVersion > 4294967295
      || !Number.isSafeInteger(value.claimedAtMs) || value.claimedAtMs < 0 || !Number.isFinite(new Date(value.claimedAtMs).getTime()) || value.claimedAtMs > atMs
      || (input.target.type === 'existing_user_plant' && value.userPlantRef !== input.target.user_plant_id)
      || (fresh && (value.claimRef !== input.claimRef || value.claimedAtMs !== input.proof.nowMs || ('newUserPlantRef' in input && value.userPlantRef !== input.newUserPlantRef)))) { throw new Error('认领成功结果不匹配') }
  } else {
    const allowed = fresh ? ['not_claimable', 'expired', 'principal_invalid', 'unavailable', 'idempotency_conflict', ...(input.target.type === 'new_user_plant' ? ['capability_denied', 'capability_snapshot_expired'] : [])] : ['unavailable', 'idempotency_conflict']
    if (Object.keys(value).length !== 1 || !allowed.includes(value.status)) { throw new Error('认领拒绝结果不合法') }
  }
  return Object.freeze({ ...value })
}
/** 已持有租约的事务编排；原结果优先，提交未知仅核对，绝无创建重试。 */
export function createGuestClaimCompletionApplicationService<T extends TransactionExecutionContext>(d: GuestClaimCompletionApplicationDependencies<T>) {
  return async (raw: GuestClaimCompletionApplicationInput): Promise<GuestClaimCompletionResult> => {
    const mode = raw?.target?.type === 'new_user_plant' ? 'new_user_plant' : 'existing_user_plant'
    const input = lockGuestClaimCompletionInput(raw, mode) as GuestClaimCompletionApplicationInput
    const read = async (): Promise<GuestClaimCompletionResult | null> => {
      try {
        const atMs = d.nowMs()
        if (!Number.isSafeInteger(atMs) || !Number.isFinite(new Date(atMs).getTime()) || atMs < input.proof.nowMs || Date.parse(input.principal.issuedAt) > atMs || Date.parse(input.principal.expiresAt) <= atMs) { return { status: 'unavailable' } }
        const query: GuestClaimCompletedReceiptInput = Object.freeze({ principal: input.principal, guestSessionRef: input.proof.guestSessionRef, guestPlantCaseRef: input.guestPlantCaseRef, target: input.target, idempotencyKeyHash: input.idempotencyKeyHash, nowMs: atMs })
        const receipt = await d.completedReceiptReader.readCompleted(query)
        return receipt === null ? null : checked(receipt, input, false, atMs)
      } catch { return { status: 'unavailable' } }
    }
    const prior = await read()
    if (prior !== null) { return prior }
    try {
      const final = await runDatabaseTransaction(d.driver, async tx => {
        const completed = 'newUserPlantRef' in input ? await d.newPlantRepository.complete(tx, input) : await d.existingRepository.complete(tx, input)
        const result = checked(completed, input, true, input.proof.nowMs)
        if (result.status === 'unavailable') { throw new GuestClaimStorageUnavailableError('认领存储不可用') }
        return result
      })
      return final.status === 'not_claimable' ? (await read()) ?? final : final
    } catch (cause) {
      if (cause instanceof GuestClaimStorageUnavailableError) { return { status: 'unavailable' } }
      if (!(cause instanceof DatabaseCommitResultUnknownError)) { throw cause }
      const receipt = await read()
      return receipt?.status === 'completed' || receipt?.status === 'idempotency_conflict' ? receipt : { status: 'unavailable' }
    }
  }
}
