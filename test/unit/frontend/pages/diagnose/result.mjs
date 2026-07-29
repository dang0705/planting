import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/pages/diagnose/result.vue', 'utf8')
const helperSource = source.slice(
  source.indexOf('function normalizeOutcomeDisplayLabel'),
  source.indexOf('async function loadRemoteResult')
)
const { buildOutcomeDisplayItems } = new Function(
  `${helperSource}\nreturn { buildOutcomeDisplayItems }`
)()

assert.match(source, /v-if="viewModel\.outcomeItems\.length > 1"/)

assert.deepEqual(
  buildOutcomeDisplayItems({
    visibleOutcomes: [{ outcomeKey: 'thrips', displayNameCn: '可能是蓟马' }]
  }),
  [{ key: 'thrips', label: '可能是蓟马' }]
)

assert.deepEqual(
  buildOutcomeDisplayItems({
    visibleOutcomes: [
      { outcomeKey: 'thrips', displayNameCn: '可能是蓟马' },
      { outcomeKey: 'spider_mite', displayNameCn: '可能是红蜘蛛' }
    ]
  }),
  [
    { key: 'thrips', label: '可能是蓟马' },
    { key: 'spider_mite', label: '可能是红蜘蛛' }
  ]
)

console.log('diagnosis result display tests passed')
