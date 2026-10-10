/**
 * 检查计划过期规则（long-term-care-contract.md §12）。
 *
 * 通俗说明：用户确认的「检查盆土」计划，到点后超过宽限小时数（策略 v1 = 72 小时）仍未完成或跳过，就视为过期。
 * 宽限小时数自用户 2026-10-10 裁定起来自策略发布 care/long_term_rules（`planExpiryGraceHours`），调用方显式传入，本文件不写死。
 */

import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'

const hour = 3_600_000

/**
 * 过期扫描运行参数的代码默认值（配置目录 `care.plans.expiry_scan`）。
 * - `cron`：CloudBase 7 段 cron（秒 分 时 日 月 星期 年），每小时整点一次；部署时触发器必须与此一致。
 * - `intervalHours`：扫描间隔小时数，仅用于说明最长滞后。
 * - `batchSize`：单批（单个短事务）最多改写的计划行数。
 * - `runBudgetFractionOfFunctionTimeout`：单次运行时长上限占函数超时的比例。
 * 取值在代码层注册表定义；batchSize 与时长占比为运维参数，生效值由入口经 environment.ts 读取（可被环境变量覆盖）。
 */
export const CARE_PLAN_EXPIRY_SCAN = RUNTIME_PARAMETERS.care.planExpiryScan.value

/** 截止时刻：计划时刻早于它（严格小于）即已过期；= 现在 − 宽限小时（来自策略快照）。 */
export function resolveCarePlanExpiryCutoffMs(nowMs: number, graceHours: number): number {
  return nowMs - graceHours * hour
}

/** 单个计划过期判定输入。 */
export interface CarePlanExpiryCheckInput {
  /** 计划当前存储状态；只有 planned 可过期。 */
  readonly status: string
  /** 计划检查时刻 UTC 毫秒。 */
  readonly scheduledAtMs: number
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 宽限小时数（策略 care/long_term_rules 的 planExpiryGraceHours）。 */
  readonly graceHours: number
}

/** §12.1：status=planned 且 当前时刻 > 计划时刻 + 宽限小时（严格大于）。 */
export function isCarePlanExpired(input: CarePlanExpiryCheckInput): boolean {
  return input.status === 'planned' && input.scheduledAtMs < resolveCarePlanExpiryCutoffMs(input.nowMs, input.graceHours)
}

/** 单次运行时长上限输入。 */
export interface ExpiryRunDeadlineInput {
  /** 本次运行开始 UTC 毫秒。 */
  readonly startedAtMs: number
  /** 函数超时毫秒（来自运行时上下文）；取不到为 null。 */
  readonly functionTimeoutMs: number | null
  /** 单次运行时长占函数超时的比例（环境变量层，默认 0.5）。 */
  readonly runBudgetFraction: number
}

/** §12.5：时长上限 = 开始时刻 + ⌊函数超时 × 比例⌋；超时不是正整数时返回 null（不猜默认值）。 */
export function resolveExpiryRunDeadlineMs(input: ExpiryRunDeadlineInput): number | null {
  const timeout = input.functionTimeoutMs
  if (timeout === null || !Number.isSafeInteger(timeout) || timeout <= 0) { return null }
  return input.startedAtMs + Math.floor(timeout * input.runBudgetFraction)
}
