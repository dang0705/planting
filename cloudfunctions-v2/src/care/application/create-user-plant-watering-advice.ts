import type { CareLongTermRules } from '../../configuration/business-policies/index.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import {
  IdempotentWriteRetryLaterError,
  publicErrorSnapshot,
  runIdempotentWrite,
  type IdempotentWriteDependencies
} from '../../foundation/idempotency/run-idempotent-write.js'
import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import { lockOwnedUserPlant, readLatestBindingRef } from '../../user-plant/repository/mysql-catalog-binding-repository.js'
import { isConfirmableWateringResult, resolveProposalValidUntil } from '../domain/long-term-care-rules.js'
import { insertCapabilityResult, readLatestWateringFactRef } from '../repository/mysql-long-term-care-repository.js'
import type { BuiltWateringAdvice } from './build-watering-advice.js'

/** 当次环境合同版本（与临时养护结果一致）。 */
const environmentContractVersion = 'care-environment-foundation/v2'

/** 事务前读取的上下文指纹；事务内任何一项变化 → 503 同键重试（T6）。 */
export interface UserPlantAdviceContextFingerprint {
  /** 档案版本；无档案为 null。 */
  readonly profileVersion: number | null
  /** 最新品种绑定引用；无为 null。 */
  readonly bindingRef: string | null
  /** 最近浇水事实引用；无为 null。 */
  readonly latestWateringFactRef: string | null
}

/** 长期浇水建议用例输入。 */
export interface CreateUserPlantWateringAdviceInput {
  /** 统一用户公开标识（已验真登录主体）。 */
  readonly userRef: string
  /** 正文 target 中的用户植物公开引用。 */
  readonly userPlantRef: string
  /** 事务前上下文指纹。 */
  readonly fingerprint: UserPlantAdviceContextFingerprint
  /** 事务外组装好的公开结果与留存正文。 */
  readonly built: BuiltWateringAdvice
  /** 服务端高熵结果引用（cres_）。 */
  readonly resultRef: string
  /** 可确认时使用的服务端高熵建议引用（cpr_）。 */
  readonly proposalRef: string
  /** 计算时刻 UTC 毫秒（等于结果 generatedAt）。 */
  readonly nowMs: number
  /** 共享 HTTP 幂等占位输入。 */
  readonly idempotency: HttpIdempotencyReservationInput
  /** 请求内锁定的长期养护规则策略快照（建议有效小时数）。 */
  readonly rules: Readonly<Pick<CareLongTermRules, 'openWindowProposalValidHours'>>
}

/**
 * long-term-care/v1 §2：同一事务 幂等占位 → 锁本人植物（404/归档 409）→ 复核指纹 → 可确认时写建议 → 追加结果 → 幂等完成。
 * 不写事实与计划。
 */
export function createUserPlantWateringAdviceApplicationService(
  dependencies: IdempotentWriteDependencies<MysqlTransactionContext<Mysql2QueryConnection>>
): (input: CreateUserPlantWateringAdviceInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return input => runIdempotentWrite(dependencies, input.idempotency, input.nowMs, async transaction => {
    const plant = await lockOwnedUserPlant(transaction, input.userRef, input.userPlantRef)
    if (plant === null) { return publicErrorSnapshot(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在') }
    if (plant.lifecycle === 'archived') { return publicErrorSnapshot(409, 'USER_PLANT_ARCHIVED', '植物已归档，只能查看') }
    if (plant.profileVersion !== input.fingerprint.profileVersion
      || await readLatestBindingRef(transaction, plant) !== input.fingerprint.bindingRef
      || await readLatestWateringFactRef(transaction, plant) !== input.fingerprint.latestWateringFactRef) {
      throw new IdempotentWriteRetryLaterError('档案、品种绑定或浇水事实在读取后发生变化')
    }
    const result = input.built.result
    const confirmable = isConfirmableWateringResult(result)
    const validUntil = result.validUntil === null ? null : Date.parse(result.validUntil)
    await insertCapabilityResult(transaction, plant, {
      resultRef: input.resultRef, environmentContractVersion,
      inputManifest: input.built.inputManifest, algorithmReleaseManifest: input.built.algorithmReleaseManifest, derivations: input.built.derivations,
      result: result as unknown as CanonicalJsonObject, generatedAtMs: input.nowMs,
      validUntilMs: validUntil !== null && validUntil > input.nowMs ? validUntil : null,
      proposal: confirmable
        ? { proposalRef: input.proposalRef, validUntilMs: resolveProposalValidUntil(result, input.rules), idempotencyKeyHash: input.idempotency.idempotencyKeyHash }
        : null
    })
    return { status: 200, body: { data: { resultRef: input.resultRef, proposalRef: confirmable ? input.proposalRef : null, result } } }
  })
}
