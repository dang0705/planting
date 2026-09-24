/** ClickUp Phase 列表允许的状态；页面不得展示代理臆造的其他状态。 */
const CLICKUP_STATUSES = new Set([
  'backlog',
  'ready for codex',
  'codex running',
  'human required',
  'blocked',
  'review needed',
  'done',
])

/**
 * 完整回读校验：不能把局部或包含未知任务的结果标成全量同步成功。
 * 本函数只验证状态快照结构，不声称它来自 ClickUp；来源仍由同步代理回读负责。
 */
export function validateClickUpTaskSnapshot(ticketStatuses, knownTicketIds) {
  if (!ticketStatuses || typeof ticketStatuses !== 'object' || Array.isArray(ticketStatuses)) {
    return { valid: false, reason: '缺少任务状态映射' }
  }
  if (!(knownTicketIds instanceof Set) || knownTicketIds.size === 0) {
    return { valid: false, reason: '本地任务清单为空' }
  }
  const remoteIds = Object.keys(ticketStatuses)
  if (remoteIds.length !== knownTicketIds.size) {
    return { valid: false, reason: 'ClickUp 与本地任务数量不一致' }
  }
  for (const ticketId of remoteIds) {
    if (!knownTicketIds.has(ticketId)) {
      return { valid: false, reason: `出现未登记任务：${ticketId}` }
    }
    if (!CLICKUP_STATUSES.has(ticketStatuses[ticketId])) {
      return { valid: false, reason: `任务状态非法：${ticketId}` }
    }
  }
  return { valid: true }
}

/** 每次完整回读同时核验任务名称和受信 ClickUp 链接，防止页面继续展示旧任务元数据。 */
function validateClickUpTicketDetails(ticketDetails, knownTicketIds) {
  if (!ticketDetails || typeof ticketDetails !== 'object' || Array.isArray(ticketDetails)) {
    return { valid: false, reason: '缺少任务名称与链接映射' }
  }
  const detailIds = Object.keys(ticketDetails)
  if (detailIds.length !== knownTicketIds.size) {
    return { valid: false, reason: '任务名称与链接数量不一致' }
  }
  for (const ticketId of detailIds) {
    if (!knownTicketIds.has(ticketId)) {
      return { valid: false, reason: `任务名称与链接包含未登记任务：${ticketId}` }
    }
    const detail = ticketDetails[ticketId]
    if (!detail || typeof detail.title !== 'string' || detail.title.trim() === '') {
      return { valid: false, reason: `任务名称缺失：${ticketId}` }
    }
    try {
      const url = new URL(detail.url)
      if (url.protocol !== 'https:' || url.hostname !== 'app.clickup.com' ||
          !url.pathname.split('/').includes(ticketId)) {
        return { valid: false, reason: `任务链接无效：${ticketId}` }
      }
    } catch {
      return { valid: false, reason: `任务链接无效：${ticketId}` }
    }
  }
  return { valid: true }
}

/** 仅在完整、合法且时间可解析的回读到达后推进远端确认时间。 */
export function applyVerifiedClickUpSnapshot(currentStatus, keeperHeartbeat, knownTicketIds) {
  const result = { ...currentStatus }
  if (!keeperHeartbeat?.checkedAt) return result

  const checkedAtMs = Date.parse(keeperHeartbeat.checkedAt)
  const lastSyncedAtMs = Date.parse(currentStatus.clickUpLastSyncedAt ?? '')
  if (!Number.isFinite(checkedAtMs)) {
    result.clickUpSyncError = 'ClickUp 回读时间无效'
    return result
  }
  if (Number.isFinite(lastSyncedAtMs) && checkedAtMs <= lastSyncedAtMs) return result

  const validation = validateClickUpTaskSnapshot(keeperHeartbeat.ticketStatuses, knownTicketIds)
  if (!validation.valid) {
    result.clickUpSyncError = validation.reason
    return result
  }
  const detailValidation = validateClickUpTicketDetails(keeperHeartbeat.ticketDetails, knownTicketIds)
  if (!detailValidation.valid) {
    result.clickUpSyncError = detailValidation.reason
    return result
  }

  result.clickUpTaskStatuses = { ...keeperHeartbeat.ticketStatuses }
  if (Array.isArray(currentStatus.modules)) {
    result.modules = currentStatus.modules.map(module => ({
      ...module,
      tickets: (module.tickets ?? []).map(ticket => ({
        ...ticket,
        title: keeperHeartbeat.ticketDetails[ticket.id].title,
        url: keeperHeartbeat.ticketDetails[ticket.id].url
      }))
    }))
  }
  result.clickUpLastSyncedAt = keeperHeartbeat.checkedAt
  delete result.clickUpSyncError
  return result
}

/**
 * 合并专职 ClickUp 代理回读的完整状态快照。
 *
 * 只有已登记 ticket、合法状态才允许覆盖；未知 ticket 和非法状态被拒绝。
 * 未出现在本轮快照里的既有 ticket 保持原值，以免一次局部读取把其他状态清空。
 */
export function mergeClickUpTaskStatuses(currentStatuses = {}, keeperHeartbeat = {}, knownTicketIds = new Set()) {
  const result = {}
  for (const [ticketId, value] of Object.entries(currentStatuses ?? {})) {
    if (knownTicketIds.has(ticketId) && CLICKUP_STATUSES.has(value)) result[ticketId] = value
  }

  for (const [ticketId, value] of Object.entries(keeperHeartbeat?.ticketStatuses ?? {})) {
    if (!knownTicketIds.has(ticketId) || !CLICKUP_STATUSES.has(value)) continue
    result[ticketId] = value
  }

  return result
}
