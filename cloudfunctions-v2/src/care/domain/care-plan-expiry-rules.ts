/**
 * 检查计划过期规则（long-term-care-contract.md §12）。
 *
 * 通俗说明：用户确认的「检查盆土」计划，到点后超过 72 小时仍未完成或跳过，就视为过期。
 * 72 小时与盆土证据最长有效期 `soilEvidenceMaxHours` 对齐——过了这个时长，这次检查已失去意义，应重新获取建议。
 */

const hour = 3_600_000

/**
 * 计划过期宽限小时数（配置目录 `care.plans.expiry_grace_hours`，owner=care）。
 * 主代理 2026-10-09 裁定为不可配置硬规则：由本常量 + 目录一致性测试 + 合同 §12 共同保证，不走策略发布，运行时不读取目录。
 */
export const CARE_PLAN_EXPIRY_GRACE_HOURS = 72

/**
 * 过期扫描运行参数（配置目录 `care.plans.expiry_scan`，主代理 2026-10-09 裁定为不可配置硬规则）。
 * - `cron`：CloudBase 7 段 cron（秒 分 时 日 月 星期 年），每小时整点一次；部署时触发器必须与此一致。
 * - `intervalHours`：扫描间隔小时数，仅用于说明最长滞后。
 * - `batchSize`：单批（单个短事务）最多改写的计划行数。
 * - `runBudgetFractionOfFunctionTimeout`：单次运行时长上限占函数超时的比例。
 */
export const CARE_PLAN_EXPIRY_SCAN = Object.freeze({
  cron: '0 0 * * * * *',
  intervalHours: 1,
  batchSize: 500,
  runBudgetFractionOfFunctionTimeout: 0.5
})

/** 截止时刻：计划时刻早于它（严格小于）即已过期；= 现在 − 72 小时。 */
export function resolveCarePlanExpiryCutoffMs(nowMs: number): number {
  return nowMs - CARE_PLAN_EXPIRY_GRACE_HOURS * hour
}

/** 单个计划过期判定输入。 */
export interface CarePlanExpiryCheckInput {
  /** 计划当前存储状态；只有 planned 可过期。 */
  readonly status: string
  /** 计划检查时刻 UTC 毫秒。 */
  readonly scheduledAtMs: number
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** §12.1：status=planned 且 当前时刻 > 计划时刻 + 72 小时（严格大于）。 */
export function isCarePlanExpired(input: CarePlanExpiryCheckInput): boolean {
  return input.status === 'planned' && input.scheduledAtMs < resolveCarePlanExpiryCutoffMs(input.nowMs)
}

/** 单次运行时长上限输入。 */
export interface ExpiryRunDeadlineInput {
  /** 本次运行开始 UTC 毫秒。 */
  readonly startedAtMs: number
  /** 函数超时毫秒（来自运行时上下文）；取不到为 null。 */
  readonly functionTimeoutMs: number | null
}

/** §12.5：时长上限 = 开始时刻 + ⌊函数超时 × 0.5⌋；超时不是正整数时返回 null（不猜默认值）。 */
export function resolveExpiryRunDeadlineMs(input: ExpiryRunDeadlineInput): number | null {
  const timeout = input.functionTimeoutMs
  if (timeout === null || !Number.isSafeInteger(timeout) || timeout <= 0) { return null }
  return input.startedAtMs + Math.floor(timeout * CARE_PLAN_EXPIRY_SCAN.runBudgetFractionOfFunctionTimeout)
}
