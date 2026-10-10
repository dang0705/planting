import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { publicErrorSnapshot, runIdempotentWrite, type IdempotentWriteDependencies } from '../../foundation/idempotency/run-idempotent-write.js'
import { canTransitionUserPlantLifecycle } from '../domain/transition-user-plant-lifecycle.js'
import { lockOwnedUserPlant } from '../repository/mysql-catalog-binding-repository.js'
import { markUserPlantDeleting } from '../repository/mysql-user-plant-deletion-repository.js'

/** 删除用例输入；主体与幂等摘要由 HTTP 适配层从可信来源生成。 */
export interface DeleteUserPlantInput {
  /** 已验真主体的统一用户公开引用。 */
  readonly userRef: string
  /** 路径中的用户植物公开引用。 */
  readonly userPlantRef: string
  /** 调用方最后读到的版本。 */
  readonly expectedVersion: number
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 共享 HTTP 幂等占位输入（DELETE + 规范化路径 + deleteUserPlant）。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/**
 * 删除用户植物用例（标记删除）。同一事务：幂等占位 → 按 user_id + 公开引用锁植物 → 版本比对 → 条件写 deleting → 幂等完成。
 * 不存在/他人/已在删除中统一 404；版本不符 409；首个确定结果写入幂等表，同键重放原样返回（即使植物已不可见）。
 * 类比：像前端乐观更新带 `If-Match` 版本号，别人先改过就拒绝，避免“后写覆盖”。
 */
export function createDeleteUserPlantApplicationService(
  dependencies: IdempotentWriteDependencies<MysqlTransactionContext<Mysql2QueryConnection>>
): (input: DeleteUserPlantInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return input => runIdempotentWrite(dependencies, input.idempotency, input.nowMs, async transaction => {
    const plant = await lockOwnedUserPlant(transaction, input.userRef, input.userPlantRef)
    if (plant === null) { return publicErrorSnapshot(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在') }
    if (plant.plantVersion !== input.expectedVersion) { return publicErrorSnapshot(409, 'USER_PLANT_VERSION_CONFLICT', '用户植物版本已变化，请重新读取') }
    if (!canTransitionUserPlantLifecycle(plant.lifecycle, 'deleting')) { throw new Error('用户植物生命周期不允许删除') }
    await markUserPlantDeleting(transaction, { plant, expectedVersion: input.expectedVersion, deletedAtMs: input.nowMs })
    return {
      status: 200,
      body: { data: { user_plant_id: input.userPlantRef, lifecycle: 'deleting', version: input.expectedVersion + 1, updatedAt: new Date(input.nowMs).toISOString() } }
    }
  })
}
