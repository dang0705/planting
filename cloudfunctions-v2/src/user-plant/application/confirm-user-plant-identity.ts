import type { UserPlantRef, UserRef } from '../../contracts/types.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { publicErrorSnapshot, runIdempotentWrite, type IdempotentWriteDependencies } from '../../foundation/idempotency/run-idempotent-write.js'
import { lockOwnedUserPlant } from '../repository/mysql-catalog-binding-repository.js'
import { readCurrentConfirmedIdentityRef, writeIdentityConfirmation } from '../repository/mysql-user-plant-identity-repository.js'
import type { GetUserPlantRepository } from './get-user-plant.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 身份确认用例输入；主体、确认引用与幂等摘要均由服务端生成。 */
export interface ConfirmUserPlantIdentityInput {
  /** 已验真主体的统一用户公开引用。 */
  readonly userRef: string
  /** 路径中的用户植物公开引用。 */
  readonly userPlantRef: string
  /** 调用方最后读到的版本。 */
  readonly expectedVersion: number
  /** 目标规范身份公开引用。 */
  readonly plantIdentityRef: string
  /** 事务前 plant-knowledge 公开准入判定：该身份当前是否已发布且未隔离。 */
  readonly identityPublished: boolean
  /** 服务端生成的高熵确认引用 idc_…（历史来源引用），不公开。 */
  readonly confirmationRef: string
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 共享 HTTP 幂等占位输入。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 用例依赖：共享幂等事务端口 + 单株公开投影读回。 */
export interface ConfirmUserPlantIdentityDependencies extends IdempotentWriteDependencies<Transaction> {
  /** 同事务读回单株公开投影，保证响应与 GET 一致。 */
  readonly userPlantRepository: GetUserPlantRepository<Transaction>
}

const notPublished = () => publicErrorSnapshot(404, 'NOT_FOUND', '植物身份不存在或未发布')

/**
 * 身份确认用例（user-plant-identity-confirmation/v1 §3）。顺序：归属（404）→ 归档（409）→ 版本（409）→ 身份可用（404）
 * → 同一身份视为无变化（200、不涨版本）→ 否则写历史与投影（版本 +1）→ 同事务公开读回。
 * 归属判定排在身份判定之前，避免借“身份不存在”探测他人植物。
 */
export function createConfirmUserPlantIdentityApplicationService(
  dependencies: ConfirmUserPlantIdentityDependencies
): (input: ConfirmUserPlantIdentityInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return input => runIdempotentWrite(dependencies, input.idempotency, input.nowMs, async transaction => {
    const plant = await lockOwnedUserPlant(transaction, input.userRef, input.userPlantRef)
    if (plant === null) { return publicErrorSnapshot(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在') }
    if (plant.lifecycle === 'archived') { return publicErrorSnapshot(409, 'USER_PLANT_ARCHIVED', '植物已归档，只能查看') }
    if (plant.plantVersion !== input.expectedVersion) { return publicErrorSnapshot(409, 'USER_PLANT_VERSION_CONFLICT', '用户植物版本已变化，请重新读取') }
    if (!input.identityPublished) { return notPublished() }
    const current = await readCurrentConfirmedIdentityRef(transaction, plant)
    if (current !== input.plantIdentityRef) {
      const written = await writeIdentityConfirmation(transaction, {
        plant, plantIdentityRef: input.plantIdentityRef, confirmationRef: input.confirmationRef, expectedVersion: input.expectedVersion, nowMs: input.nowMs
      })
      if (!written) { return notPublished() }
    }
    const data = await dependencies.userPlantRepository.getOwnedUserPlant(transaction, input.userRef as UserRef, input.userPlantRef as UserPlantRef)
    return { status: 200, body: { data } }
  })
}
