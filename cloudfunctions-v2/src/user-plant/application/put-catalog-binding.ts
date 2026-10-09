import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { publicErrorSnapshot, runIdempotentWrite, type IdempotentWriteDependencies } from '../../foundation/idempotency/run-idempotent-write.js'
import { appendCatalogBinding, lockOwnedUserPlant } from '../repository/mysql-catalog-binding-repository.js'

/** 品种绑定用例输入；目录存在性已在事务前由 plant-knowledge 只读确认。 */
export interface PutCatalogBindingInput {
  /** 已验真主体的统一用户公开标识。 */
  readonly userRef: string
  /** 路径中的用户植物公开引用。 */
  readonly userPlantRef: string
  /** 请求的 Tropicals 目录引用。 */
  readonly catalogTaxonRef: string
  /** 事务前查询结果：目录中是否存在该引用。 */
  readonly catalogExists: boolean
  /** 服务端高熵绑定引用（cbd_）。 */
  readonly bindingRef: string
  /** 服务端当前 UTC 毫秒（绑定生效时刻）。 */
  readonly nowMs: number
  /** 共享 HTTP 幂等占位输入。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/**
 * long-term-care/v1 §1：同一事务 幂等占位 → 锁本人植物（404/归档 409）→ 目录不存在 404 NOT_FOUND → 只追加绑定 → 幂等完成。
 * 归属先于目录判断，避免借目录错误探测他人植物。
 */
export function createPutCatalogBindingApplicationService(
  dependencies: IdempotentWriteDependencies<MysqlTransactionContext<Mysql2QueryConnection>>
): (input: PutCatalogBindingInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return input => runIdempotentWrite(dependencies, input.idempotency, input.nowMs, async transaction => {
    const plant = await lockOwnedUserPlant(transaction, input.userRef, input.userPlantRef)
    if (plant === null) { return publicErrorSnapshot(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在') }
    if (plant.lifecycle === 'archived') { return publicErrorSnapshot(409, 'USER_PLANT_ARCHIVED', '植物已归档，只能查看') }
    if (!input.catalogExists) { return publicErrorSnapshot(404, 'NOT_FOUND', '目录中没有该品种') }
    await appendCatalogBinding(transaction, { plant, bindingRef: input.bindingRef, catalogTaxonRef: input.catalogTaxonRef, boundAtMs: input.nowMs })
    return { status: 200, body: { data: { catalogTaxonRef: input.catalogTaxonRef, boundAt: new Date(input.nowMs).toISOString() } } }
  })
}
