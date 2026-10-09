import { randomBytes, createHash } from 'node:crypto'

import type { UserCapabilitySnapshotDto } from '../../contracts/types.js'
import { runDatabaseTransaction, type DatabaseTransactionDriver, type TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type { GuestClaimCommandRegistrationInput, GuestClaimCommandRegistrationResult } from '../repository/mysql-guest-claim-command-registration-repository.js'
import type { GuestClaimCompletedReceiptInput, GuestClaimCompletedReceiptResult } from '../repository/mysql-guest-claim-completed-receipt-reader.js'
import type { GuestClaimCompletionResult } from '../repository/mysql-guest-claim-completion-core.js'
import type { GuestClaimLeaseInput, GuestClaimLeaseResult } from '../repository/mysql-guest-claim-lease-repository.js'
import type { GuestClaimCompletionApplicationInput } from './complete-guest-claim.js'

/** 完整认领用例输入：登记六项可信输入；新建目标另带服务端候选植物与请求级能力快照。 */
export type ClaimGuestPlantCaseApplicationInput = GuestClaimCommandRegistrationInput & ({
  /** 已有目标没有额外字段。 */
  readonly newUserPlantRef?: never
} | {
  /** 新建目标时服务端生成的高熵候选植物引用。 */
  readonly newUserPlantRef: string
  /** subscription 提供的请求级能力快照；null 表示缺失而非默认额度。 */
  readonly capabilitySnapshot: UserCapabilitySnapshotDto | null
})

/** 完整用例内部结果：既有完成结果，或租约被他人持有时的处理中。 */
export type ClaimGuestPlantCaseApplicationResult = GuestClaimCompletionResult | {
  /** 同一命令正被另一请求处理（租约未过期），客户端须用同一幂等键稍后重试。 */
  readonly status: 'processing'
}

/** 完整用例依赖；全部为本域已有端口，事务生命周期由本用例持有。 */
export interface ClaimGuestPlantCaseApplicationDependencies<T extends TransactionExecutionContext> {
  /** 服务端可信时钟。 */
  readonly nowMs: () => number
  /** 唯一事务驱动，持有登记与租约阶段事务的生命周期。 */
  readonly driver: DatabaseTransactionDriver<T>
  /** 生成本次请求的租约持有者摘要；缺省为 32 字节随机数的 SHA-256。 */
  readonly createLeaseOwnerHash?: () => string
  /** 新连接只读的原成功收据读取器。 */
  readonly completedReceiptReader: {
    /** 只有完整成功关系返回 completed；不存在返回 null。 */
    readCompleted(input: GuestClaimCompletedReceiptInput): Promise<GuestClaimCompletedReceiptResult>
  }
  /** 已验收的 requested 登记仓储。 */
  readonly registrationRepository: {
    /** 在调用方事务内登记或回读原命令。 */
    register(tx: T, input: GuestClaimCommandRegistrationInput): Promise<GuestClaimCommandRegistrationResult>
  }
  /** 处理租约仓储（硬规则 30 秒）。 */
  readonly leaseRepository: {
    /** 在调用方事务内取得或接管租约。 */
    acquire(tx: T, input: GuestClaimLeaseInput): Promise<GuestClaimLeaseResult>
  }
  /** 已验收的完成应用（自持事务、收据优先、提交未知只读核对）。 */
  readonly completeClaim: (input: GuestClaimCompletionApplicationInput) => Promise<GuestClaimCompletionResult>
}

/** 登记或租约阶段存储不可用：回滚并返回 unavailable。 */
class ClaimStageUnavailableError extends Error {}

/** 默认持有者摘要：高熵随机原文只在内存中，落库的是 SHA-256。 */
function defaultLeaseOwnerHash(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex')
}

/**
 * 游客认领完整编排（guest-session-claim/v1 状态机 requested→processing→completed）：
 * 原收据优先 → 事务一：登记（或回读原命令）+ 取得处理租约并提交 → 已验收完成应用（事务二，含提交未知核对）。
 * 租约被他人持有返回 processing；命令已完成只读核对原收据；命令失败返回 not_claimable。
 */
export function createClaimGuestPlantCaseApplicationService<T extends TransactionExecutionContext>(d: ClaimGuestPlantCaseApplicationDependencies<T>) {
  const createLeaseOwnerHash = d.createLeaseOwnerHash ?? defaultLeaseOwnerHash
  return async (input: ClaimGuestPlantCaseApplicationInput): Promise<ClaimGuestPlantCaseApplicationResult> => {
    const receiptQuery = (): GuestClaimCompletedReceiptInput => ({
      principal: input.principal, guestSessionRef: input.proof.guestSessionRef, guestPlantCaseRef: input.guestPlantCaseRef,
      target: input.target, idempotencyKeyHash: input.idempotencyKeyHash, nowMs: d.nowMs()
    })
    const readReceipt = async (): Promise<GuestClaimCompletedReceiptResult> => {
      try { return await d.completedReceiptReader.readCompleted(receiptQuery()) } catch { return { status: 'unavailable' } }
    }
    const prior = await readReceipt()
    if (prior !== null && (prior.status === 'completed' || prior.status === 'idempotency_conflict')) { return prior }

    const leaseOwnerHash = createLeaseOwnerHash()
    const registration = { principal: input.principal, proof: input.proof, guestPlantCaseRef: input.guestPlantCaseRef, target: input.target, claimRef: input.claimRef, idempotencyKeyHash: input.idempotencyKeyHash }
    let stage: { registered: Extract<GuestClaimCommandRegistrationResult, { status: 'registered' }>; lease: GuestClaimLeaseResult } | Exclude<GuestClaimCommandRegistrationResult, { status: 'registered' }>
    try {
      stage = await runDatabaseTransaction(d.driver, async tx => {
        const registered = await d.registrationRepository.register(tx, registration)
        if (registered.status !== 'registered') { return registered }
        const lease = await d.leaseRepository.acquire(tx, {
          userRef: input.principal.user_id, guestSessionRef: input.proof.guestSessionRef, guestPlantCaseRef: input.guestPlantCaseRef,
          idempotencyKeyHash: input.idempotencyKeyHash, claimRef: registered.claimRef, leaseOwnerHash, nowMs: input.proof.nowMs
        })
        if (lease.status === 'not_found' || lease.status === 'unavailable') { throw new ClaimStageUnavailableError('认领租约阶段不可用') }
        return { registered, lease }
      })
    } catch {
      // 登记/租约阶段没有认领成功写入可核对；租约不可用（ClaimStageUnavailableError，已回滚）、SQL 故障或提交未知
      // 都返回不可用，客户端用同一幂等键重试；已提交的租约最迟 30 秒后可被接管。
      return { status: 'unavailable' }
    }
    if (!('lease' in stage)) { return stage }
    const { registered, lease } = stage
    if (lease.status === 'held') { return { status: 'processing' } }
    if (lease.status === 'failed') { return { status: 'not_claimable' } }
    if (lease.status === 'completed') {
      const receipt = await readReceipt()
      return receipt === null ? { status: 'unavailable' } : receipt
    }
    if (lease.status !== 'acquired') { return { status: 'unavailable' } }
    const completion = { ...registration, claimRef: registered.claimRef, leaseOwnerHash }
    return d.completeClaim(input.target.type === 'new_user_plant'
      ? { ...completion, target: { type: 'new_user_plant' }, newUserPlantRef: (input as { newUserPlantRef: string }).newUserPlantRef, capabilitySnapshot: (input as { capabilitySnapshot: UserCapabilitySnapshotDto | null }).capabilitySnapshot }
      : { ...completion, target: input.target })
  }
}
