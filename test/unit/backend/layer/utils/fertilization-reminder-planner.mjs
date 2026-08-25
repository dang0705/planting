import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const planner = require('../../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')

const interval = (minValue, minUnit, maxValue = minValue, maxUnit = minUnit) => ({
  schemaVersion: 1,
  kind: 'interval',
  interval: {
    min: { value: minValue, unit: minUnit },
    max: { value: maxValue, unit: maxUnit }
  }
})

assert.equal(
  planner._test.addMonthsClamped(planner.parseDate('2026-01-31'), 1) &&
    planner.formatDate(planner._test.addMonthsClamped(planner.parseDate('2026-01-31'), 1)),
  '2026-02-28'
)

const mixedWeeksMonths = planner.calculateFertilizationCheck({
  schedule: interval(2, 'week', 1, 'month'),
  lastAppliedDate: '2026-01-31',
  lastDateSource: 'recorded',
  referenceDate: '2026-02-01'
})
assert.equal(mixedWeeksMonths.earliestDate, '2026-02-14')
assert.equal(mixedWeeksMonths.latestDate, '2026-02-28')
assert.equal(mixedWeeksMonths.nextCheckDate, '2026-02-21')

const monthAndWeeks = planner.calculateFertilizationCheck({
  schedule: interval(1, 'month', 8, 'week'),
  lastAppliedDate: '2026-01-31',
  lastDateSource: 'recorded',
  referenceDate: '2026-02-01'
})
assert.equal(monthAndWeeks.earliestDate, '2026-02-28')
assert.equal(monthAndWeeks.latestDate, '2026-03-28')
assert.equal(monthAndWeeks.nextCheckDate, '2026-03-14')

const unknownDate = planner.calculateFertilizationCheck({
  schedule: interval(2, 'week', 4, 'week'),
  lastDateSource: 'estimated',
  referenceDate: '2026-08-11'
})
assert.equal(unknownDate.lastAppliedDate, null)
assert.equal(unknownDate.lastDateSource, 'estimated')
assert.equal(unknownDate.normalCheckDate, '2026-09-01')
assert.equal(unknownDate.earliestDate, '2026-08-25')
assert.equal(unknownDate.nextCheckDate, '2026-08-25')

const due = planner.calculateFertilizationCheck({
  schedule: interval(1, 'week'),
  lastAppliedDate: '2026-08-01',
  lastDateSource: 'recorded',
  referenceDate: '2026-08-11'
})
assert.equal(due.dueNow, true)
assert.equal(due.nextCheckDate, '2026-08-11')
assert.equal(due.normalCheckDate, '2026-08-08')

const userAsserted = planner.calculateFertilizationCheck({
  schedule: interval(2, 'week', 3, 'week'),
  lastAppliedDate: '2026-08-01',
  lastDateSource: 'user_asserted',
  referenceDate: '2026-08-11'
})
assert.equal(userAsserted.lastDateSource, 'user_asserted')
assert.equal(userAsserted.lastAppliedDate, '2026-08-01')
assert.equal(userAsserted.nextCheckDate, '2026-08-19')

const guard = planner.resolveDiagnosisFertilizationGuard({
  diagnosisId: 'diagnosis-1',
  referenceDate: '2026-08-17',
  response: {
    outcomeType: 'problematic',
    finalResult: { problemId: 'problem_overwatering_root_pressure' }
  }
})
assert.deepEqual(guard, {
  schemaVersion: 1,
  status: 'deferred',
  reasonCode: 'root_stress',
  source: 'diagnosis',
  sourceDiagnosisId: 'diagnosis-1',
  createdDate: '2026-08-17',
  expiresAt: '2026-08-24'
})
assert.equal(planner.isFertilizationGuardActive(guard, '2026-08-23'), true)
assert.equal(planner.isFertilizationGuardActive(guard, '2026-08-24'), false)

const noFallback = planner.buildFertilizationDecision({
  referenceDate: '2026-08-11',
  fertilizerType: 'liquid',
  plantContext: {
    userPlantId: 7,
    fertilizationHistoryStatus: 'empty',
    fertilizationMonthly: {
      available: true,
      rows: [
        {
          month: 8,
          liquid: {
            displayText: '暂停施肥',
            sourceNames: ['RHS'],
            schedule: { schemaVersion: 1, kind: 'pause' }
          },
          slowRelease: {
            displayText: '每3个月1次',
            sourceNames: ['RHS'],
            schedule: interval(3, 'month')
          }
        }
      ]
    }
  }
})
assert.equal(noFallback.status, 'monthly_pause')
assert.equal(noFallback.reasons.includes('monthly_pause'), true)

assert.equal(planner.normalizeIntervalSchedule({ schemaVersion: 1, kind: 'pause' }), null)
const assertedHistoryDecision = planner.buildFertilizationDecision({
  referenceDate: '2026-08-11',
  fertilizerType: 'liquid',
  plantContext: {
    userPlantId: 7,
    fertilizationHistoryStatus: 'available',
    fertilizationHistory: [
      { date: '2026-08-01', fertilizerType: 'liquid', source: 'user_asserted' }
    ],
    fertilizationMonthly: {
      available: true,
      rows: [
        {
          month: 8,
          liquid: {
            displayText: '每2–3周1次',
            sourceNames: ['RHS'],
            schedule: interval(2, 'week', 3, 'week')
          }
        }
      ]
    }
  }
})
assert.equal(assertedHistoryDecision.calculation.lastDateSource, 'user_asserted')
assert.equal(assertedHistoryDecision.status, 'monthly_not_due')

assert.equal(
  planner.evaluateMonthlyRule(
    {
      rows: [
        {
          month: 8,
          liquid: { displayText: '暂停施肥', schedule: { schemaVersion: 1, kind: 'pause' } }
        }
      ]
    },
    'liquid',
    8
  ).kind,
  'pause'
)
const mismatchedPauseMonthly = {
  rows: [
    {
      month: 8,
      liquid: {
        displayText: '暂停施肥',
        sourceNames: ['RHS'],
        schedule: interval(2, 'week')
      },
      slowRelease: {
        displayText: '暂停追加',
        sourceNames: ['RHS'],
        schedule: interval(3, 'month')
      }
    }
  ]
}
assert.equal(planner.evaluateMonthlyRule(mismatchedPauseMonthly, 'liquid', 8).kind, 'pause')
assert.equal(planner.evaluateMonthlyRule(mismatchedPauseMonthly, 'slowRelease', 8).kind, 'pause')
assert.equal(planner.getMonthlyFertilizerOptions(mismatchedPauseMonthly, 8).length, 0)
assert.equal(
  planner.evaluateMonthlyRule(
    {
      rows: [
        {
          month: 8,
          liquid: {
            displayText: '开花后施用',
            schedule: { schemaVersion: 1, kind: 'event', eventCode: 'post_bloom' }
          }
        }
      ]
    },
    'liquid',
    8
  ).kind,
  'event'
)

const conditionalSchedule = {
  schemaVersion: 1,
  kind: 'interval',
  interval: {
    min: { value: 1, unit: 'month' },
    max: { value: 2, unit: 'month' }
  },
  conditionCodes: ['new_leaves_or_shoots']
}
assert.equal(planner.evaluateScheduleConditions(conditionalSchedule).status, 'missing')
assert.equal(
  planner.evaluateScheduleConditions(conditionalSchedule, { new_leaves_or_shoots: false }).status,
  'unmet'
)
assert.equal(
  planner.evaluateScheduleConditions(conditionalSchedule, { new_leaves_or_shoots: true }).valid,
  true
)
assert.equal(
  planner.evaluateScheduleConditions({ ...conditionalSchedule, conditionCodes: ['not_registered'] })
    .status,
  'unknown'
)

const containerSchedule = { ...conditionalSchedule, conditionCodes: ['container_context'] }
const containerEvaluation = planner.evaluateScheduleConditions(containerSchedule)
assert.equal(containerEvaluation.valid, true)
assert.deepEqual(containerEvaluation.requirements, [])
assert.deepEqual(containerEvaluation.autoSatisfiedCodes, ['container_context'])
assert.equal(planner._test.conditionPrompts.active_growth, '最近有长新叶或新芽吗？')

console.log('fertilization-reminder-planner tests passed')
