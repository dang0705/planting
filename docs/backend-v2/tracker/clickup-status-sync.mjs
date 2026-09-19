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
