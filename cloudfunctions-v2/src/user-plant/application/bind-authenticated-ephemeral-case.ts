import { DatabaseCommitResultUnknownError, runDatabaseTransaction, type DatabaseTransactionDriver, type TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type { PrincipalDto } from '../../contracts/types.js'
import { lockAuthenticatedEphemeralExistingBindingInput, type AuthenticatedEphemeralExistingBindingInput, type AuthenticatedEphemeralBindingResult } from '../repository/mysql-authenticated-ephemeral-binding-repository.js'

/** 主体来自identity，命令不允许自报统一用户归属。 */
export interface AuthenticatedEphemeralBindingApplicationInput {
  /** 已验真的平台无关主体；本用例只接受user分支。 */ readonly principal: PrincipalDto
  /** 目标和服务端命令元数据；不能包含userRef或请求摘要。 */ readonly command: Omit<AuthenticatedEphemeralExistingBindingInput, 'userRef'>
}
/** 应用内部结果；HTTP映射仍须严格公开合同准入。 */
export type AuthenticatedEphemeralBindingApplicationResult = AuthenticatedEphemeralBindingResult | {
  /** 主体不是有效且未过期的统一用户，拒绝所有事务操作。 */ readonly status: 'principal_invalid'
}
/** 同一事务绑定及未知提交核对的窄端口。 */
export interface AuthenticatedEphemeralBindingApplicationDependencies<T extends TransactionExecutionContext> {
  /** 当前绑定事务的唯一生命周期驱动。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 已验收的三表原子绑定与原结果重放。 */ readonly repository: {
    /** 不自行提交的现有目标绑定。 */ bindExisting(tx: T, command: AuthenticatedEphemeralExistingBindingInput): Promise<AuthenticatedEphemeralBindingResult>
  }
  /** 新连接精确读回收据，没有任何写方法。 */ readonly commitUnknownReadOnlyRepository: {
    /** 没有完整收据返回null，不能猜未提交。 */ readCompleted(command: AuthenticatedEphemeralExistingBindingInput): Promise<AuthenticatedEphemeralBindingResult | null>
  }
}
/** 表示存储已报告不可用，要求事务回滚而不能提交半成品。 */
class BindingStorageUnavailableError extends Error {}
/** 结果白名单与精确目标核验；静态类型不能替代受限字段检查。 */
function validateResult(value: AuthenticatedEphemeralBindingResult, command: AuthenticatedEphemeralExistingBindingInput): AuthenticatedEphemeralBindingResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('绑定结果形状不合法') }
  if (value.status === 'bound') {
    if (Object.keys(value).length !== 4 || Object.keys(value).some(k => !['status', 'promotionRef', 'userPlantRef', 'boundAtMs'].includes(k))
      || typeof value.promotionRef !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(value.promotionRef)
      || value.userPlantRef !== command.targetUserPlantRef || !Number.isSafeInteger(value.boundAtMs) || value.boundAtMs < 0
      || value.boundAtMs > command.occurredAtMs || !Number.isFinite(new Date(value.boundAtMs).getTime())) { throw new Error('绑定成功收据不匹配') }
    return Object.freeze({ ...value })
  }
  if (Object.keys(value).length !== 1 || !['not_found', 'expired', 'already_bound', 'idempotency_conflict', 'unavailable'].includes(value.status)) { throw new Error('绑定拒绝收据不合法') }
  return Object.freeze({ ...value })
}
/** 只编排事务与原成功结果核对，不决定TTL、不创建目标、不改诊断或养护结果。 */
export function createAuthenticatedEphemeralBindingApplicationService<T extends TransactionExecutionContext>(dependencies: AuthenticatedEphemeralBindingApplicationDependencies<T>) {
  return async (input: AuthenticatedEphemeralBindingApplicationInput): Promise<AuthenticatedEphemeralBindingApplicationResult> => {
    if (!input?.principal || input.principal.principalType !== 'user' || typeof input.principal.user_id !== 'string'
      || !/^[A-Za-z0-9_-]{1,64}$/u.test(input.principal.user_id)) { return { status: 'principal_invalid' } }
    const expires = Date.parse(input.principal.expiresAt), issued = Date.parse(input.principal.issuedAt)
    if (!Number.isFinite(expires) || !Number.isFinite(issued) || expires <= issued
      || !Number.isSafeInteger(input.command?.occurredAtMs) || issued > input.command.occurredAtMs || expires <= input.command.occurredAtMs) { return { status: 'principal_invalid' } }
    if (Object.hasOwn(input.command, 'userRef')) { throw new TypeError('绑定命令不能自报用户归属') }
    const command = lockAuthenticatedEphemeralExistingBindingInput({ ...input.command, userRef: input.principal.user_id })
    try {
      return await runDatabaseTransaction(dependencies.driver, async tx => {
        const result = validateResult(await dependencies.repository.bindExisting(tx, command), command)
        if (result.status === 'unavailable') { throw new BindingStorageUnavailableError('绑定存储不可用') }
        return result
      })
    } catch (cause: unknown) {
      if (cause instanceof BindingStorageUnavailableError) { return { status: 'unavailable' } }
      if (!(cause instanceof DatabaseCommitResultUnknownError)) { throw cause }
      try {
        const readback = await dependencies.commitUnknownReadOnlyRepository.readCompleted(command)
        if (readback === null) { return { status: 'unavailable' } }
        const result = validateResult(readback, command)
        return result.status === 'bound' || result.status === 'idempotency_conflict' ? result : { status: 'unavailable' }
      } catch { return { status: 'unavailable' } }
    }
  }
}
