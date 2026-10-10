import type { UserPrincipalDto } from '../../contracts/types.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import {
  encodeUserPlantListCursor,
  type ListableUserPlantLifecycle,
  type UserPlantListCursor
} from '../domain/user-plant-list-query.js'
import type { MysqlUserPlantListRepository } from '../repository/mysql-user-plant-list-repository.js'

/** 列表用例输入：主体来自会话，其余均已由路由按合同严格解析。 */
export type ListUserPlantsApplicationInput = {
  /** 已验真的统一登录主体；只使用其中的 user_id 做归属过滤。 */
  readonly principal: UserPrincipalDto
  /** 要列出的生命周期（缺省 active + archived）。 */
  readonly lifecycles: readonly ListableUserPlantLifecycle[]
  /** 本页条数（1～50，缺省 20）。 */
  readonly limit: number
  /** 上一页最后一项位置；第一页为 null。 */
  readonly after: UserPlantListCursor | null
}

/** 列表用例依赖。 */
export type ListUserPlantsApplicationDependencies<TTransaction extends TransactionExecutionContext> = {
  /** 提供单次只读事务（一页内数据来自同一快照）。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 列表 SQL 唯一入口。 */
  readonly repository: MysqlUserPlantListRepository<TTransaction>
}

/**
 * 创建用户植物列表用例：多读一行判断是否有下一页（像前端“加载更多”时偷看后面还有没有），
 * 只把本页最后一项的位置编码为游标。没有植物时返回空列表，不是 404。
 */
export function createListUserPlantsApplicationService<TTransaction extends TransactionExecutionContext>(
  dependencies: ListUserPlantsApplicationDependencies<TTransaction>
): (input: ListUserPlantsApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return input => runDatabaseTransaction(dependencies.driver, async transaction => {
    const rows = await dependencies.repository.listOwnedUserPlants(transaction, {
      userRef: input.principal.user_id, lifecycles: input.lifecycles, fetchLimit: input.limit + 1, after: input.after
    })
    const items = rows.slice(0, input.limit)
    const last = items.at(-1)
    const nextCursor = rows.length > input.limit && last !== undefined
      ? encodeUserPlantListCursor({ createdAtMs: Date.parse(last.createdAt), userPlantRef: last.user_plant_id })
      : null
    return { status: 200, body: { data: { items, nextCursor } } }
  })
}
