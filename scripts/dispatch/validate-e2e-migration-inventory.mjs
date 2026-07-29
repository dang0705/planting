#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const inventoryPath = 'scripts/dispatch/e2e-migration-inventory.json'
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
const errors = []
const warnings = []

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function headBlob(path) {
  return execFileSync('git', ['show', `HEAD:${path}`])
}

function need(condition, message) {
  if (!condition) {
    errors.push(message)
  }
}

const currentHead = git(['rev-parse', 'HEAD'])
need(
  currentHead === inventory.source.head,
  `inventory head mismatch: expected ${inventory.source.head}, got ${currentHead}`
)

const headAssets = git(['ls-tree', '-r', '--name-only', 'HEAD', 'test/e2e'])
  .split('\n')
  .filter(Boolean)
  .sort()
need(
  headAssets.length === inventory.source.tracked_head_count,
  `tracked head count mismatch: expected ${inventory.source.tracked_head_count}, got ${headAssets.length}`
)

const moveBySource = new Map(inventory.explicit_moves.map(item => [item.source, item]))
const seenDestinations = new Set()
let mapped = 0

for (const source of headAssets) {
  const move = moveBySource.get(source)
  const destination = move?.destination ?? source
  const intentional = inventory.intentional_non_e2e_destinations.find(
    item => item.source === source
  )
  if (intentional) {
    need(
      fs.existsSync(intentional.destination),
      `intentional destination missing: ${intentional.destination}`
    )
    mapped += 1
    continue
  }
  need(fs.existsSync(destination), `mapped destination missing for ${source}: ${destination}`)
  if (fs.existsSync(destination)) {
    seenDestinations.add(destination)
    if (move && move.modified_after_move !== true) {
      const before = sha256(headBlob(source))
      const after = sha256(fs.readFileSync(destination))
      need(before === after, `pure move content changed for ${source} -> ${destination}`)
    }
  }
  if (!move) {
    need(
      source.startsWith('test/e2e/batch/') || source.startsWith('test/e2e/automator/'),
      `unmoved HEAD E2E asset is outside executable roots: ${source}`
    )
  }
  mapped += 1
}

for (const move of inventory.explicit_moves) {
  need(
    headAssets.includes(move.source),
    `explicit move source is not a HEAD E2E asset: ${move.source}`
  )
  need(
    !move.destination.startsWith('test/e2e/batch/watering/'),
    `watering automator destination still under batch: ${move.destination}`
  )
}

const topEntries = fs
  .readdirSync('test/e2e', { withFileTypes: true })
  .filter(item => !item.name.startsWith('.'))
  .map(item => item.name)
  .sort()
need(
  JSON.stringify(topEntries) === JSON.stringify(['automator', 'batch'].sort()),
  `test/e2e must contain batch and automator only; got ${topEntries.join(', ')}`
)

const report = {
  status: errors.length ? 'failed' : 'passed',
  gate: 'e2e_migration_inventory',
  inventory_path: inventoryPath,
  head: currentHead,
  mapped_head_assets: mapped,
  explicit_moves: inventory.explicit_moves.length,
  unique_destinations_checked: seenDestinations.size,
  warnings,
  errors
}

console.log(JSON.stringify(report, null, 2))
process.exit(errors.length ? 1 : 0)
