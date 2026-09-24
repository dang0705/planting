import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  capProgressByStatus,
  isHeartbeatFresh,
  summarizeModulesProgress,
  summarizeTicketProgress,
} from '../../../docs/backend-v2/tracker/progress.mjs'
import { mergeClickUpTaskStatuses } from '../../../docs/backend-v2/tracker/clickup-status-sync.mjs'

// Expected 来源：用户明确要求未开始任务统一按 0%，并计入模块及总体完成度。
// 测试层次：unit_fake；仅验证纯进度算法，不覆盖页面渲染、文件同步或 ClickUp 状态。
const moduleSummary = summarizeTicketProgress([
  { progress: 100 },
  { progress: null },
  { progress: undefined },
  { progress: 0 },
])
assert.deepEqual(moduleSummary, { progress: 25, reported: 2, total: 4 })

// 总体按全部 ticket 直接平均，不能先平均模块再平均，否则模块任务量不同会造成失真。
const overallSummary = summarizeModulesProgress([
  { tickets: [{ progress: 100 }] },
  { tickets: [{ progress: 50 }, { progress: null }, { progress: null }] },
])
assert.deepEqual(overallSummary, { progress: 38, reported: 2, total: 4 })

assert.deepEqual(summarizeTicketProgress([]), { progress: 0, reported: 0, total: 0 })
assert.deepEqual(summarizeModulesProgress([]), { progress: 0, reported: 0, total: 0 })

// 只有已完成任务才能显示 100%。审查中和执行中的任务必须保留可见的未完成空间，
// 防止旧心跳的 100% 让本地页面与 ClickUp 状态互相矛盾。
assert.equal(capProgressByStatus('done', 100), 100)
assert.equal(capProgressByStatus('review_needed', 100), 95)
assert.equal(capProgressByStatus('review needed', 98), 95)
assert.equal(capProgressByStatus('in_progress', 100), 94)
assert.equal(capProgressByStatus('blocked', 100), 94)
assert.equal(capProgressByStatus('human required', 100), 94)
assert.equal(capProgressByStatus('unknown', 100), 99)

// 已完成任务是终态，不应因为负责人无需继续发送心跳而被误标为“心跳超时”。
// 只有仍在执行、审查、阻断或等待人工的任务才受 35 分钟新鲜度约束。
const nowMs = Date.parse('2026-09-20T00:00:00+08:00')
assert.equal(isHeartbeatFresh('done', '2026-09-19T20:00:00+08:00', nowMs), true)
assert.equal(isHeartbeatFresh('in_progress', '2026-09-19T23:50:00+08:00', nowMs), true)
assert.equal(isHeartbeatFresh('in_progress', '2026-09-19T22:00:00+08:00', nowMs), false)
assert.equal(isHeartbeatFresh('review_needed', '非法时间', nowMs), false)

// 专职 ClickUp 代理的完整回读快照是页面 ClickUp 状态的唯一新事实源。
// 不在新快照中的旧任务保持原值，非法状态和未知 ticket 不得污染页面。
assert.deepEqual(
  mergeClickUpTaskStatuses(
    { task_a: 'backlog', task_b: 'codex running' },
    {
      ticketStatuses: { task_a: 'done', task_b: 'review needed', unknown_task: 'done', task_c: 'INVALID' },
    },
    new Set(['task_a', 'task_b', 'task_c']),
  ),
  { task_a: 'done', task_b: 'review needed' },
)

// 页面必须为每个独立 ClickUp ticket 渲染可访问的进度条，而不只显示文字百分比。
const trackerHtml = fs.readFileSync('docs/backend-v2/tracker/index.html', 'utf8')
assert.match(trackerHtml, /class="ticket-progress-bar"/)
assert.match(trackerHtml, /aria-label="本地任务进度：\$\{escapeHtml\(ticket\.title\)\}"/)

process.stdout.write('backend-v2 tracker progress: passed\n')
