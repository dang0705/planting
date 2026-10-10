import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { runDatabaseTransaction, type DatabaseTransactionDriver } from '../../foundation/database/transaction-runner.js'
import { upsertTimelineProjection } from '../repository/mysql-user-plant-timeline-repository.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 由 care 发件箱派发来的时间线事件（只含已校验的公开字段）。 */
export interface CareTimelineEvent {
  /** 时间线事件类型（浇水事实或计划完成）。 */ readonly eventType: 'care.watering_fact_recorded.v1' | 'care.plan_completed.v1'
  /** 所属统一用户公开引用。 */ readonly userRef: string
  /** 所属用户植物公开引用。 */ readonly userPlantRef: string
  /** 事件载荷（脱敏）。 */ readonly payload: Record<string, unknown>
  /** 业务发生 UTC 毫秒。 */ readonly occurredAtMs: number
}

const factRefPattern = /^cft_[A-Za-z0-9_-]{8,60}$/u
const planRefPattern = /^cpl_[A-Za-z0-9_-]{8,60}$/u

/** 把事件转为投影内容；载荷不合法抛错（派发按失败重试，最终进死信）。 */
function toProjection(event: CareTimelineEvent) {
  if (event.eventType === 'care.watering_fact_recorded.v1') {
    const factRef = event.payload.factRef, amountMl = event.payload.amountMl
    if (typeof factRef !== 'string' || !factRefPattern.test(factRef) || !(amountMl === null || (Number.isSafeInteger(amountMl) && (amountMl as number) >= 0))) {
      throw new TypeError('浇水事件载荷不合法')
    }
    return { sourceRef: factRef, itemType: 'care_watering' as const, summary: { itemType: 'care_watering', amountMl: amountMl as number | null } }
  }
  const planRef = event.payload.planRef
  if (typeof planRef !== 'string' || !planRefPattern.test(planRef)) { throw new TypeError('计划完成事件载荷不合法') }
  return { sourceRef: planRef, itemType: 'care_plan_completed' as const, summary: { itemType: 'care_plan_completed', outcome: 'done' } }
}

/**
 * user-plant 时间线消费端（user-plant-timeline.md §5）：在独立短事务内幂等写投影。
 * 至少一次投递 + 唯一约束 = 重复投递只落一行；植物不存在视为投递失败（重试后进入死信供人工核对）。
 */
export function createProjectCareTimelineEvent(dependencies: {
  /** 事务驱动。 */ readonly driver: DatabaseTransactionDriver<Transaction>
  /** 服务端 UTC 毫秒时钟。 */ readonly now: () => number
}): (event: CareTimelineEvent) => Promise<void> {
  return async event => {
    const projection = toProjection(event)
    const written = await runDatabaseTransaction(dependencies.driver, transaction => upsertTimelineProjection(transaction, {
      userRef: event.userRef, userPlantRef: event.userPlantRef, sourceDomain: 'care', ...projection, occurredAtMs: event.occurredAtMs, nowMs: dependencies.now()
    }))
    if (!written) { throw new Error('时间线投影目标植物不存在') }
  }
}
