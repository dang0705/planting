import type { CareCalendarDto } from '../../contracts/types.js'
import type { WateringCapabilityResult } from '../application/project-watering-replay-result.js'

const hour = 3_600_000
const day = 24 * hour

/** 浇水事实最长补记天数（配置目录 `care.facts.watering_backfill_max_days`，用户 2026-10-09 裁决 U3）。 */
export const WATERING_BACKFILL_MAX_DAYS = 7
/** 检查窗口无最晚端时检查计划最多推迟天数（`care.plans.check_max_postpone_days`，用户裁决 U5）。 */
export const CHECK_MAX_POSTPONE_DAYS = 7
/** 检查窗口无最晚端时建议有效小时数（`care.watering.open_window_proposal_valid_hours`，用户裁决 U7）。 */
export const OPEN_WINDOW_PROPOSAL_VALID_HOURS = 24
/** 计划列表分页（硬规则 `care.plans.page_size`，主代理裁决 T5）。 */
export const CARE_PLAN_PAGE_SIZE = Object.freeze({ default: 20, max: 50 })
/** 日历条目时长（long-term-care/v1 §9）。 */
const calendarDurationMs = 30 * 60_000
/** 日历固定提示（不含个人信息与内部引用）。 */
const calendarNotes = '用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。'
/** 可被用户确认为计划/事实的浇水行动。 */
const confirmableActions = new Set(['water_allowed', 'check_later', 'check_now', 'priority_check'])

/** 浇水时刻校验输入。 */
export interface WateringOccurredAtInput {
  /** 用户声明的实际浇水 UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 服务端可信当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 用户植物创建 UTC 毫秒。 */
  readonly plantCreatedAtMs: number
}

/** U3：浇水时刻不得晚于现在、不得早于 7 天前、不得早于植物创建。 */
export function validateWateringOccurredAt(input: WateringOccurredAtInput): boolean {
  const { occurredAtMs, nowMs, plantCreatedAtMs } = input
  return Number.isSafeInteger(occurredAtMs) && occurredAtMs <= nowMs
    && occurredAtMs >= nowMs - WATERING_BACKFILL_MAX_DAYS * day && occurredAtMs >= plantCreatedAtMs
}

/** 结果是否产生可确认建议：就绪且行动属于可确认集合。 */
export function isConfirmableWateringResult(result: Pick<WateringCapabilityResult, 'status' | 'details'>): boolean {
  return result.status === 'ready' && confirmableActions.has(result.details.action)
}

/** U7：建议有效截止 = 检查窗口最晚端；无最晚端或最晚端不晚于生成时刻（裁决 Q1）→ 生成时刻 + 24 小时。 */
export function resolveProposalValidUntil(result: Pick<WateringCapabilityResult, 'generatedAt' | 'details'>): number {
  const generatedAtMs = Date.parse(result.generatedAt)
  const latest = result.details.checkWindow?.latestAt ?? null
  const latestMs = latest === null ? null : Date.parse(latest)
  return latestMs !== null && latestMs > generatedAtMs ? latestMs : generatedAtMs + OPEN_WINDOW_PROPOSAL_VALID_HOURS * hour
}

/** 检查计划时刻输入（UTC 毫秒）。 */
export interface CheckScheduleInput {
  /** 用户自选时刻；未选为 null。 */
  readonly requestedMs: number | null
  /** 检查窗口最早端；无为 null。 */
  readonly earliestMs: number | null
  /** 检查窗口最晚端；无为 null。 */
  readonly latestMs: number | null
  /** 服务端可信当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 建议生成 UTC 毫秒；最晚端不晚于它时视为无最晚端（与 Q1 一致）。 */
  readonly generatedAtMs: number
}

/**
 * U5：缺省 = max(最早端, 现在)（裁决 Q5）；自选须在 [max(最早端, 现在), 上界]。
 * 上界 = 最晚端；无最晚端或最晚端不晚于建议生成时刻 → 最早端（无则现在）+ 7 天。非法返回 null。
 */
export function resolveCheckScheduledAt(input: CheckScheduleInput): number | null {
  const anchor = input.earliestMs ?? input.nowMs
  const lower = Math.max(anchor, input.nowMs)
  const latest = input.latestMs !== null && input.latestMs > input.generatedAtMs ? input.latestMs : null
  const upper = latest ?? anchor + CHECK_MAX_POSTPONE_DAYS * day
  if (input.requestedMs === null) { return lower }
  return input.requestedMs >= lower && input.requestedMs <= upper ? input.requestedMs : null
}

/** 日历字段输入。 */
export interface CareCalendarInput {
  /** 计划 UTC 毫秒。 */
  readonly scheduledAtMs: number
  /** 植物昵称或品种中文名；都没有为 null。 */
  readonly displayName: string | null
}

/** U9：计划的「加入手机日历」字段；标题「检查{名称}盆土」，无名称用「植物」。 */
export function buildCareCalendar(input: CareCalendarInput): CareCalendarDto {
  const name = input.displayName?.trim() ? input.displayName.trim() : '植物'
  return {
    title: `检查${name}盆土`,
    startAt: new Date(input.scheduledAtMs).toISOString(),
    endAt: new Date(input.scheduledAtMs + calendarDurationMs).toISOString(),
    notes: calendarNotes
  }
}

/** T5：分页大小；缺省 20，1～50 整数，其他非法返回 null。 */
export function resolvePlanPageLimit(raw: string | undefined): number | null {
  if (raw === undefined) { return CARE_PLAN_PAGE_SIZE.default }
  if (!/^[1-9][0-9]*$/u.test(raw)) { return null }
  const limit = Number(raw)
  return limit <= CARE_PLAN_PAGE_SIZE.max ? limit : null
}
