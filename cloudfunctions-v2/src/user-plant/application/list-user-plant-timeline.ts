import type { UserPrincipalDto } from '../../contracts/types.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { runDatabaseTransaction, type DatabaseTransactionDriver } from '../../foundation/database/transaction-runner.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import { encodeTimelineCursor, type TimelineCursor } from '../domain/timeline.js'
import { listOwnedTimeline } from '../repository/mysql-user-plant-timeline-repository.js'

/** 时间线列表用例输入。 */
export interface ListUserPlantTimelineInput {
  /** 已验真登录主体。 */ readonly principal: UserPrincipalDto
  /** 路径中的用户植物公开引用。 */ readonly userPlantRef: string
  /** 本页条数（1～50）。 */ readonly limit: number
  /** 上一页最后一项位置。 */ readonly after: TimelineCursor | null
}

/** 时间线只读用例：植物不可见 404；多读一行判断是否有下一页。 */
export function createListUserPlantTimelineApplicationService(dependencies: {
  /** 只读事务驱动。 */ readonly driver: DatabaseTransactionDriver<MysqlTransactionContext<Mysql2QueryConnection>>
}): (input: ListUserPlantTimelineInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return input => runDatabaseTransaction(dependencies.driver, async transaction => {
    const rows = await listOwnedTimeline(transaction, { userRef: input.principal.user_id, userPlantRef: input.userPlantRef, fetchLimit: input.limit + 1, after: input.after })
    if (rows === null) { return { status: 404, body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } } } }
    const page = rows.slice(0, input.limit)
    const last = page.at(-1)
    const items = page.map(row => ({ timelineItemRef: row.timelineItemRef, itemType: row.itemType, occurredAt: new Date(row.occurredAtMs).toISOString(), summary: row.summary }))
    const nextCursor = rows.length > input.limit && last !== undefined ? encodeTimelineCursor({ occurredAtMs: last.occurredAtMs, timelineItemRef: last.timelineItemRef }) : null
    return { status: 200, body: { data: { items, nextCursor } } }
  })
}
