import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  applyVerifiedClickUpSnapshot,
  mergeClickUpTaskStatuses,
  validateClickUpTaskSnapshot
} from './clickup-status-sync.mjs'
import { markTicketHeartbeatMissing, selectClickUpKeeperHeartbeat } from './sync-heartbeats.mjs'

const EXPECTED_TICKET_COUNT = 28
const trackerDirectory = path.dirname(fileURLToPath(import.meta.url))
const keeperFilePath = path.join(trackerDirectory, 'heartbeats', 'clickup-status-keeper.json')
const keeperHeartbeat = JSON.parse(fs.readFileSync(keeperFilePath, 'utf8'))
const moduleStatus = JSON.parse(
  fs.readFileSync(path.join(trackerDirectory, 'module-status.json'), 'utf8')
)
const knownTicketIds = new Set(
  moduleStatus.modules.flatMap(module => module.tickets.map(ticket => ticket.id))
)
const existingStatuses = moduleStatus.clickUpTaskStatuses
const completeTicketDetails = Object.fromEntries(
  moduleStatus.modules.flatMap(module => module.tickets.map(ticket => [
    ticket.id,
    { title: ticket.title, url: ticket.url }
  ]))
)

test('prefers the current keeper agent over the legacy agent, independent of heartbeat file name', () => {
  const currentHeartbeat = { ...keeperHeartbeat, agent: 'clickup_status_keeper_gpt6' }
  const legacyHeartbeat = { ...keeperHeartbeat, agent: 'clickup_status_keeper_luna' }

  assert.equal(path.basename(keeperFilePath), 'clickup-status-keeper.json')
  assert.equal(selectClickUpKeeperHeartbeat([legacyHeartbeat, currentHeartbeat]), currentHeartbeat)
})

test('falls back to a legacy keeper heartbeat when no current keeper heartbeat exists', () => {
  assert.equal(selectClickUpKeeperHeartbeat([keeperHeartbeat]), keeperHeartbeat)
})

test('keeps all 28 real ClickUp status mappings when selecting the current agent from the legacy-named file', () => {
  assert.equal(knownTicketIds.size, EXPECTED_TICKET_COUNT)
  assert.deepEqual(Object.keys(existingStatuses).sort(), [...knownTicketIds].sort())

  const currentHeartbeat = { ...keeperHeartbeat, agent: 'clickup_status_keeper_gpt6' }
  const selectedHeartbeat = selectClickUpKeeperHeartbeat([keeperHeartbeat, currentHeartbeat])
  const mergedStatuses = mergeClickUpTaskStatuses(
    existingStatuses,
    selectedHeartbeat,
    knownTicketIds
  )

  assert.equal(selectedHeartbeat, currentHeartbeat)
  assert.deepEqual(mergedStatuses, existingStatuses)
  assert.equal(Object.keys(mergedStatuses).length, EXPECTED_TICKET_COUNT)
})

test('does not overwrite known mappings or add unknown tickets from invalid/unread heartbeat entries', () => {
  const [knownTicketId] = [...knownTicketIds]
  const selectedHeartbeat = selectClickUpKeeperHeartbeat([
    {
      agent: 'clickup_status_keeper_gpt6',
      ticketStatuses: {
        [knownTicketId]: 'not-a-clickup-status',
        'not-a-registered-ticket': 'done'
      }
    }
  ])
  const mergedStatuses = mergeClickUpTaskStatuses(
    existingStatuses,
    selectedHeartbeat,
    knownTicketIds
  )

  assert.deepEqual(mergedStatuses, existingStatuses)
  assert.equal(Object.keys(mergedStatuses).length, EXPECTED_TICKET_COUNT)
})

test('rejects partial, extra and invalid ClickUp readbacks before advancing freshness', () => {
  const complete = Object.fromEntries([...knownTicketIds].map(id => [id, 'backlog']))
  assert.deepEqual(validateClickUpTaskSnapshot(complete, knownTicketIds), { valid: true })

  const [knownTicketId] = knownTicketIds
  const partial = { ...complete }
  delete partial[knownTicketId]
  assert.equal(validateClickUpTaskSnapshot(partial, knownTicketIds).valid, false)
  assert.equal(
    validateClickUpTaskSnapshot({ ...complete, unknown_ticket: 'done' }, knownTicketIds).valid,
    false
  )
  assert.equal(
    validateClickUpTaskSnapshot({ ...complete, [knownTicketId]: 'CLICKUP_BLOCKED' }, knownTicketIds).valid,
    false
  )
})

test('incomplete readback preserves the last verified time and statuses', () => {
  const [knownTicketId] = knownTicketIds
  const next = applyVerifiedClickUpSnapshot(
    { clickUpTaskStatuses: existingStatuses, clickUpLastSyncedAt: '2026-09-24T00:00:00Z' },
    { checkedAt: '2026-09-24T01:00:00Z', ticketStatuses: { [knownTicketId]: 'done' } },
    knownTicketIds
  )
  assert.deepEqual(next.clickUpTaskStatuses, existingStatuses)
  assert.equal(next.clickUpLastSyncedAt, '2026-09-24T00:00:00Z')
  assert.match(next.clickUpSyncError, /数量不一致/u)
})

test('complete readback replaces the full status map and advances freshness once', () => {
  const complete = Object.fromEntries([...knownTicketIds].map(id => [id, 'ready for codex']))
  const next = applyVerifiedClickUpSnapshot(
    { clickUpTaskStatuses: existingStatuses, clickUpLastSyncedAt: '2026-09-24T00:00:00Z' },
    { checkedAt: '2026-09-24T01:00:00Z', ticketStatuses: complete,
      ticketDetails: completeTicketDetails },
    knownTicketIds
  )
  assert.deepEqual(next.clickUpTaskStatuses, complete)
  assert.equal(next.clickUpLastSyncedAt, '2026-09-24T01:00:00Z')
  assert.equal(next.clickUpSyncError, undefined)
})

test('new remote readback requires all titles and task links before freshness advances', () => {
  const complete = Object.fromEntries([...knownTicketIds].map(id => [id, 'backlog']))
  const snapshot = { ...moduleStatus, clickUpLastSyncedAt: '2026-09-24T00:00:00Z' }
  const missingDetails = applyVerifiedClickUpSnapshot(snapshot, {
    checkedAt: '2026-09-24T01:00:00Z', ticketStatuses: complete
  }, knownTicketIds)
  assert.equal(missingDetails.clickUpLastSyncedAt, snapshot.clickUpLastSyncedAt)
  assert.match(missingDetails.clickUpSyncError, /任务名称与链接/u)

  const [firstId] = knownTicketIds
  const renamed = applyVerifiedClickUpSnapshot(snapshot, {
    checkedAt: '2026-09-24T01:00:00Z', ticketStatuses: complete,
    ticketDetails: {
      ...completeTicketDetails,
      [firstId]: { title: '远端已核实的新名称', url: `https://app.clickup.com/t/${firstId}` }
    }
  }, knownTicketIds)
  assert.equal(renamed.clickUpLastSyncedAt, '2026-09-24T01:00:00Z')
  const renamedTicket = renamed.modules.flatMap(module => module.tickets).find(ticket => ticket.id === firstId)
  assert.equal(renamedTicket.title, '远端已核实的新名称')
})

test('H5 labels local progress and does not disguise missing remote status as Backlog', () => {
  const html = fs.readFileSync(path.join(trackerDirectory, 'index.html'), 'utf8')
  assert.match(html, /本地任务进度/u)
  assert.match(html, /未核实/u)
  assert.doesNotMatch(html, /clickUpTaskStatuses\?\.\[ticket\.id\] \|\| 'Backlog'/u)
})

test('missing owner heartbeat preserves historical progress but marks the value as stale', () => {
  const ticket = {
    id: 'ticket-fixture',
    agent: 'former_agent',
    progress: 43,
    status: '执行中',
    lastUpdatedAt: '2026-09-24T00:00:00Z'
  }
  const marked = markTicketHeartbeatMissing(ticket)
  assert.equal(marked.progress, 43)
  assert.equal(marked.agent, 'former_agent')
  assert.equal(marked.heartbeatState, 'missing')
  assert.match(marked.status, /心跳缺失/u)
  assert.equal(marked.lastUpdatedAt, '2026-09-24T00:00:00Z')
})

test('H5 distinguishes an old per-ticket estimate from a current owner report', () => {
  const html = fs.readFileSync(path.join(trackerDirectory, 'index.html'), 'utf8')
  assert.match(html, /历史值；心跳缺失/u)
})
