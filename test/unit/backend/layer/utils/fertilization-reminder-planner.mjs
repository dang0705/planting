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
assert.equal(unknownDate.nextCheckDate, '2026-08-22')

const due = planner.calculateFertilizationCheck({
  schedule: interval(1, 'week'),
  lastAppliedDate: '2026-08-01',
  lastDateSource: 'recorded',
  referenceDate: '2026-08-11'
})
assert.equal(due.dueNow, true)
assert.equal(due.nextCheckDate, '2026-08-11')
assert.equal(due.normalCheckDate, '2026-08-08')

assert.equal(planner.normalizeIntervalSchedule({ schemaVersion: 1, kind: 'pause' }), null)
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

console.log('fertilization-reminder-planner tests passed')
