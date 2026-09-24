import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { mergeClickUpTaskStatuses } from './clickup-status-sync.mjs'
import { selectClickUpKeeperHeartbeat } from './sync-heartbeats.mjs'

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
