/**
 * 写入时顺带派发（long-term-care-contract.md §13，用户 2026-10-10 裁决）。
 * 类比：像前端提交表单后“顺手刷新一下列表”——能在 1.5 秒内刷新就刷新，刷不出来也不影响“提交成功”的提示，剩下的交给后台定时补齐。
 * 本模块只负责“最多等多久”和“出错不外泄”：派发本身复用发件箱派发用例（同一领取/投递/结算与租约）。
 */

/** 一次同请求派发的结论（只用于日志与测试，不进入 HTTP 响应）。 */
export type InlineCareDispatchOutcome = 'skipped' | 'completed' | 'timed_out' | 'failed'

/** 同请求派发依赖。 */
export interface InlineCareEventDispatcherDependencies {
  /** 最长等待毫秒（运行参数 care.outbox_dispatch.inline_budget_ms，默认 1500）。 */
  readonly budgetMs: number
  /** 只派发给定事件的派发端口（复用发件箱派发用例）。 */
  readonly dispatch: (eventIds: readonly string[]) => Promise<unknown>
}

/**
 * 组装同请求派发：没有新事件不派发；在上限内完成返回 completed；超过上限立即返回 timed_out（派发在后台继续，租约到期前由它自己结算，
 * 否则交给补扫接管）；任何错误吞掉返回 failed。永不抛出，调用方据此保证 HTTP 响应状态与正文不变。
 */
export function createInlineCareEventDispatcher(dependencies: InlineCareEventDispatcherDependencies) {
  if (!Number.isFinite(dependencies.budgetMs) || dependencies.budgetMs <= 0) { throw new TypeError('同请求派发等待上限不合法') }
  return async (eventIds: readonly string[]): Promise<InlineCareDispatchOutcome> => {
    if (eventIds.length === 0) { return 'skipped' }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<InlineCareDispatchOutcome>(resolve => { timer = setTimeout(() => resolve('timed_out'), dependencies.budgetMs) })
    const work = (async (): Promise<InlineCareDispatchOutcome> => {
      try { await dependencies.dispatch(eventIds); return 'completed' } catch { return 'failed' }
    })()
    try { return await Promise.race([work, timeout]) } finally { clearTimeout(timer) }
  }
}
