import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const modulePath = require.resolve('../../../../../cloudfunctions/layer/utils/plant-knowledge.js')
const auditPath = new URL('../../../../../SQL-cvs/genus_fertilizing_monthly_audit_v1.json', import.meta.url)

function loadPlantKnowledge() {
  const originalLoad = Module._load
  delete require.cache[modulePath]
  Module._load = function patchedCloudbaseLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return { models: { $runSQL: async () => ({ data: { executeResultList: [] } }) } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require('../../../../../cloudfunctions/layer/utils/plant-knowledge.js')
  } finally {
    Module._load = originalLoad
    delete require.cache[modulePath]
  }
}

const plantKnowledge = loadPlantKnowledge()
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
const pausePattern = /该月不安排这类肥料的提醒/u
const entries = Object.entries(audit.overrides || {})
let displayedCount = 0
let pauseGuidanceCount = 0
let noPauseGuidanceCount = 0

for (const [genus, entry] of entries) {
  if (entry.reviewStatus === 'audited') {
    assert.equal(entry.ruleSchemaVersion || audit.ruleSchemaVersion, 1)
    for (const row of entry.rows || []) {
      for (const fertilizerType of ['liquid', 'slowRelease']) {
        if (row[fertilizerType]?.displayText) {
          assert.equal(
            row[fertilizerType].schedule?.schemaVersion,
            1,
            `${genus}/${row.month}/${fertilizerType}: normalized schedule is required`
          )
        }
      }
    }
  }
  const mapped = plantKnowledge.mapFertilizationMonthly(entry)
  if (!mapped.available) {
    continue
  }

  displayedCount += 1
  for (const row of mapped.rows) {
    for (const fertilizerType of ['liquid', 'slowRelease']) {
      if (row[fertilizerType]) {
        assert.equal(
          row[fertilizerType].schedule?.schemaVersion,
          1,
          `${genus}/${row.month}/${fertilizerType}: public schedule must be mapped`
        )
      }
    }
  }
  const hasPauseRule = (entry.rows || []).some(row =>
    [row.liquid?.schedule, row.slowRelease?.schedule].some(
      schedule => schedule?.kind === 'pause'
    )
  )
  const hasPauseGuidance = pausePattern.test(mapped.scopeGuidance)

  assert.equal(
    hasPauseGuidance,
    hasPauseRule,
    `${genus}: scope guidance pause wording must match the displayed monthly rules`
  )
  if (hasPauseGuidance) {
    pauseGuidanceCount += 1
  } else {
    noPauseGuidanceCount += 1
  }
}

assert.ok(displayedCount > 100, `expected more than 100 displayed audited genera, got ${displayedCount}`)
assert.ok(pauseGuidanceCount > 0, 'expected at least one displayed genus with pause guidance')
assert.ok(noPauseGuidanceCount > 0, 'expected at least one displayed genus without pause guidance')

const monstera = plantKnowledge.mapFertilizationMonthly(audit.overrides.Monstera)
const epipremnum = plantKnowledge.mapFertilizationMonthly(audit.overrides.Epipremnum)
assert.match(monstera.scopeGuidance, pausePattern)
assert.doesNotMatch(epipremnum.scopeGuidance, pausePattern)

console.log(
  JSON.stringify({
    status: 'passed',
    totalEntries: entries.length,
    displayedCount,
    pauseGuidanceCount,
    noPauseGuidanceCount
  })
)
