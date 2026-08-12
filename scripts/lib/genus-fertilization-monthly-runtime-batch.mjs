import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const plantKnowledgeModulePath =
  require.resolve('../../cloudfunctions/layer/utils/plant-knowledge.js')
const {
  calculateFertilizationCheck,
  evaluateMonthlyRule
} = require('../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')

function loadPlantKnowledgeForBatch() {
  const originalLoad = Module._load
  delete require.cache[plantKnowledgeModulePath]
  Module._load = function loadWithCloudbaseStub(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return { models: { $runSQL: async () => ({ data: { executeResultList: [] } }) } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require('../../cloudfunctions/layer/utils/plant-knowledge.js')
  } finally {
    Module._load = originalLoad
    delete require.cache[plantKnowledgeModulePath]
  }
}

function referenceDateForMonth(month) {
  return `2026-${String(month).padStart(2, '0')}-15`
}

function sourceNamesForCell(entry, cell) {
  const sourceById = new Map(
    (entry.sourceRefs || []).map(source => [source.id, String(source.name || '').trim()])
  )
  return Array.from(
    new Set((cell?.sourceRefIds || []).map(id => sourceById.get(id)).filter(Boolean))
  )
}

function assertPublicMonthlyShape(genus, mapped) {
  assert.equal(mapped.available, true, `${genus}: audited table must be publicly available`)
  assert.equal(mapped.rows.length, 12, `${genus}: public table must keep all 12 months`)
  assert.ok(mapped.sourceNames.length > 0, `${genus}: public table must retain source names`)
  assert.doesNotMatch(
    JSON.stringify(mapped),
    /https?:\/\/|evidenceRef|sourceRefIds/u,
    `${genus}: public payload must not leak audit-only fields`
  )
}

export function validateGenusFertilizationMonthlyRuntimeBatch({ audit, genera }) {
  const plantKnowledge = loadPlantKnowledgeForBatch()
  const result = {
    publicTables: 0,
    hiddenTables: 0,
    evaluatedCells: 0,
    reminderEligibleCells: 0,
    nonReminderCells: 0,
    mixedUnitIntervals: 0
  }

  for (const genus of genera) {
    const entry = audit.overrides?.[genus] || audit.defaultCoverage
    const mapped = plantKnowledge.mapFertilizationMonthly(entry)
    if (entry.reviewStatus !== 'audited') {
      assert.equal(mapped.available, false, `${genus}: non-audited table must stay hidden`)
      result.hiddenTables += 1
      continue
    }

    assertPublicMonthlyShape(genus, mapped)
    result.publicTables += 1
    for (const rawRow of entry.rows) {
      const publicRow = mapped.rows.find(row => row.month === rawRow.month)
      assert.ok(publicRow, `${genus}/${rawRow.month}: public month is missing`)
      for (const fertilizerType of ['liquid', 'slowRelease']) {
        const rawCell = rawRow[fertilizerType]
        const publicCell = publicRow[fertilizerType]
        if (!rawCell) {
          assert.equal(
            publicCell,
            null,
            `${genus}/${rawRow.month}/${fertilizerType}: blank cell changed`
          )
          continue
        }

        assert.ok(publicCell, `${genus}/${rawRow.month}/${fertilizerType}: public cell is missing`)
        assert.equal(
          publicCell.displayText,
          rawCell.displayText,
          `${genus}/${rawRow.month}/${fertilizerType}: display text changed`
        )
        assert.deepEqual(
          publicCell.sourceNames,
          sourceNamesForCell(entry, rawCell),
          `${genus}/${rawRow.month}/${fertilizerType}: source names changed`
        )

        const evaluation = evaluateMonthlyRule(mapped, fertilizerType, rawRow.month)
        result.evaluatedCells += 1
        assert.equal(
          evaluation.kind,
          rawCell.schedule.kind,
          `${genus}/${rawRow.month}/${fertilizerType}: reminder rule kind drifted`
        )
        if (evaluation.kind !== 'interval') {
          assert.equal(
            evaluation.available,
            false,
            `${genus}/${rawRow.month}/${fertilizerType}: non-interval rule must not create a reminder`
          )
          result.nonReminderCells += 1
          continue
        }

        assert.equal(
          evaluation.available,
          true,
          `${genus}/${rawRow.month}/${fertilizerType}: interval rule must be reminder eligible`
        )
        const calculation = calculateFertilizationCheck({
          schedule: evaluation.schedule,
          lastAppliedDate: null,
          lastDateSource: 'estimated',
          referenceDate: referenceDateForMonth(rawRow.month)
        })
        assert.equal(
          calculation.valid,
          true,
          `${genus}/${rawRow.month}/${fertilizerType}: interval cannot calculate a first check date`
        )
        assert.ok(
          calculation.nextCheckDate >= referenceDateForMonth(rawRow.month),
          `${genus}/${rawRow.month}/${fertilizerType}: first check date must not be in the past`
        )
        assert.equal(
          calculation.lastAppliedDate,
          null,
          `${genus}/${rawRow.month}/${fertilizerType}: first reminder must not fabricate history`
        )
        if (evaluation.schedule.interval.min.unit !== evaluation.schedule.interval.max.unit) {
          result.mixedUnitIntervals += 1
        }
        result.reminderEligibleCells += 1
      }
    }
  }

  return result
}
