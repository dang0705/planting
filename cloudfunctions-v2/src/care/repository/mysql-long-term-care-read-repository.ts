import type { CareCalendarDto } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { jsonColumn, nullableMs } from './mysql-long-term-care-repository.js'

/** 读取范围：已验真主体与路径中的用户植物公开引用（归属由 SQL 连接条件保证）。 */
export interface OwnedPlantScope {
  /** 统一用户公开标识。 */
  readonly userRef: string
  /** 用户植物公开引用。 */
  readonly userPlantRef: string
}

/** 最近一条浇水事实。 */
export interface WateringFactRow {
  /** 事实公开引用（cft_）。 */
  readonly factRef: string
  /** 实际浇水 UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 浇水量毫升；未知为 null。 */
  readonly amountMl: number | null
}

/** 计划读模型（公开投影的来源）。 */
export interface CarePlanRow {
  /** 计划公开引用（cpl_）。 */
  readonly planRef: string
  /** 计划 UTC 毫秒。 */
  readonly scheduledAtMs: number
  /** 计划的存储状态（已计划、已完成、已取消、已过期）。 */
  readonly status: 'planned' | 'completed' | 'cancelled' | 'expired'
  /** 来源建议公开引用（cpr_）。 */
  readonly sourceProposalRef: string
  /** 完成时写入的事实引用；无为 null。 */
  readonly completedFactRef: string | null
  /** 确认时锁定的日历字段。 */
  readonly calendar: CareCalendarDto
}

/** 最新长期浇水结果及其建议。 */
export interface LatestAdviceRow {
  /** 结果公开引用（cres_）。 */
  readonly resultRef: string
  /** 结果正文（公开结果）。 */
  readonly result: Record<string, any>
  /** 链接的建议；无可确认行动时为 null。 */
  readonly proposal: {
    /** 建议公开引用（cpr_）。 */
    readonly proposalRef: string
    /** 建议的存储状态（原样返回存储值，不对外暴露内部枚举含义）。 */
    readonly status: string
    /** 有效截止 UTC 毫秒；未确定为 null。 */
    readonly validUntilMs: number | null
  } | null
}

/** 分页游标位置：按 (scheduled_at_ms, plan_ref) 升序之后。 */
export interface PlanCursor {
  /** 上一页最后一项计划时刻。 */
  readonly scheduledAtMs: number
  /** 上一页最后一项计划引用。 */
  readonly planRef: string
}

/** 本人植物连接条件（固定 SQL 片段，参数绑定）。 */
const ownedPlantJoin = `JOIN user_plants p ON p.user_internal_id = x.user_internal_id AND p.id = x.user_plant_internal_id
  JOIN users u ON u.id = p.user_internal_id AND u.status = 'active'
  WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ? AND p.lifecycle_status IN ('active', 'archived')`

/** 行 → 计划读模型。 */
function toPlan(row: Record<string, unknown>): CarePlanRow {
  const payload = jsonColumn(row.plan_payload_json)
  return { planRef: String(row.plan_ref), scheduledAtMs: nullableMs(row.scheduled_at_ms)!, status: row.status as CarePlanRow['status'],
    sourceProposalRef: String(row.proposal_ref), completedFactRef: typeof payload.completedFactRef === 'string' ? payload.completedFactRef : null,
    calendar: payload.calendar as CareCalendarDto }
}

/** 长期养护只读仓储：每次读取使用新的只读连接，不开业务事务。 */
export function createMysqlLongTermCareReadRepository(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  const read = <T>(work: (connection: Mysql2QueryConnection) => Promise<T>) => withReadConnection(source, work)
  return {
    /** 最近一条浇水事实（按实际浇水时刻）。 */
    latestWateringFact: (scope: OwnedPlantScope): Promise<WateringFactRow | null> => read(async connection => {
      const rows = await connection.query(`SELECT x.fact_ref, CAST(x.occurred_at_ms AS CHAR) AS occurred_at_ms, x.fact_payload_json FROM care_facts x ${ownedPlantJoin}
        AND x.fact_type = 'watering' ORDER BY x.occurred_at_ms DESC, x.id DESC LIMIT 1`, [scope.userRef, scope.userPlantRef])
      if (rows.length === 0) { return null }
      const payload = jsonColumn(rows[0]!.fact_payload_json)
      return { factRef: String(rows[0]!.fact_ref), occurredAtMs: nullableMs(rows[0]!.occurred_at_ms)!, amountMl: typeof payload.amountMl === 'number' ? payload.amountMl : null }
    }),
    /** 按状态分页列计划（scheduled_at_ms、plan_ref 升序），多取一条判断是否有下一页。 */
    listPlans: (scope: OwnedPlantScope, status: string, limit: number, after: PlanCursor | null): Promise<CarePlanRow[]> => read(async connection => {
      const cursorSql = after === null ? '' : 'AND (x.scheduled_at_ms > ? OR (x.scheduled_at_ms = ? AND BINARY x.plan_ref > BINARY ?))'
      const rows = await connection.query(`SELECT x.plan_ref, CAST(x.scheduled_at_ms AS CHAR) AS scheduled_at_ms, x.status, x.plan_payload_json, c.proposal_ref
        FROM care_plans x JOIN care_proposals c ON c.id = x.proposal_internal_id ${ownedPlantJoin} AND x.status = ? ${cursorSql}
        ORDER BY x.scheduled_at_ms ASC, BINARY x.plan_ref ASC LIMIT ${limit + 1}`,
      [scope.userRef, scope.userPlantRef, status, ...(after === null ? [] : [after.scheduledAtMs, after.scheduledAtMs, after.planRef])])
      return rows.map(toPlan)
    }),
    /** 最新一条长期浇水结果及其链接建议。 */
    latestAdvice: (scope: OwnedPlantScope): Promise<LatestAdviceRow | null> => read(async connection => {
      const rows = await connection.query(`SELECT x.result_ref, x.result_json, c.proposal_ref, c.status AS proposal_status, CAST(c.valid_until_ms AS CHAR) AS proposal_valid_until_ms
        FROM care_capability_results x LEFT JOIN care_proposals c ON c.id = x.proposal_internal_id ${ownedPlantJoin}
        AND x.capability_type = 'watering' ORDER BY x.generated_at_ms DESC, x.id DESC LIMIT 1`, [scope.userRef, scope.userPlantRef])
      if (rows.length === 0) { return null }
      const row = rows[0]!
      return { resultRef: String(row.result_ref), result: jsonColumn(row.result_json),
        proposal: typeof row.proposal_ref === 'string'
          ? { proposalRef: row.proposal_ref, status: String(row.proposal_status), validUntilMs: nullableMs(row.proposal_valid_until_ms) } : null }
    })
  }
}
