/**
 * 将任意进度值归一化到 0～100。
 * 未开始、未上报或非法值统一按 0 处理，确保它们进入完成度分母。
 */
export function normalizeProgress(value) {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, parsed))
}

/** 判断任务是否曾明确上报数值进度，仅用于展示上报覆盖率。 */
export function hasReportedProgress(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
}

/**
 * 按任务状态限制可展示进度，确保 100% 只表示已经验收完成。
 *
 * - `done`：保留负责人上报值，允许达到 100%。
 * - `review_needed`：最高 95%，明确仍等待独立验收或用户决策。
 * - 执行中、人工处理或阻断：最高 94%，避免与“审查中”混淆。
 * - 未识别的非完成状态：最高 99%，以保守方式禁止伪装成完成。
 */
export function capProgressByStatus(status, progress) {
  const normalizedStatus = String(status ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
  const normalizedProgress = normalizeProgress(progress)

  if (normalizedStatus === 'done') return normalizedProgress
  if (normalizedStatus === 'review_needed') return Math.min(95, normalizedProgress)
  if (
    normalizedStatus === 'in_progress'
    || normalizedStatus === 'codex_running'
    || normalizedStatus === 'blocked'
    || normalizedStatus === 'human_required'
  ) {
    return Math.min(94, normalizedProgress)
  }
  return Math.min(99, normalizedProgress)
}

/**
 * 判断负责人心跳是否仍可用于展示当前执行状态。
 * `done` 是已经验收的终态，不需要负责人永久续租；其他状态必须持续上报。
 */
export function isHeartbeatFresh(status, updatedAt, nowMs = Date.now(), staleAfterMs = 35 * 60 * 1000) {
  const normalizedStatus = String(status ?? '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalizedStatus === 'done') return true

  const updatedAtMs = Date.parse(String(updatedAt ?? ''))
  return Number.isFinite(updatedAtMs) && nowMs - updatedAtMs <= staleAfterMs
}

/**
 * 模块完成度按模块内全部任务求平均；未开始任务按 0% 计入。
 * reported 只描述数据上报覆盖率，不影响完成度分母。
 */
export function summarizeTicketProgress(tickets = []) {
  const safeTickets = Array.isArray(tickets) ? tickets : []
  const total = safeTickets.length
  const reported = safeTickets.filter((ticket) => hasReportedProgress(ticket?.progress)).length
  const progress = total === 0
    ? 0
    : Math.round(
        (safeTickets.reduce((sum, ticket) => sum + normalizeProgress(ticket?.progress), 0) / total) * 10,
      ) / 10

  return { progress, reported, total }
}

/**
 * 总体完成度直接按所有模块的全部任务求平均，避免先平均模块后再次平均造成权重失真。
 */
export function summarizeModulesProgress(modules = []) {
  const tickets = (Array.isArray(modules) ? modules : [])
    .flatMap((module) => (Array.isArray(module?.tickets) ? module.tickets : []))
  return summarizeTicketProgress(tickets)
}
