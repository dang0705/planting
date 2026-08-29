import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/subpackages/diagnosis/result.vue', 'utf8')
const helperSource = source.slice(
  source.indexOf('function normalizeOutcomeDisplayLabel'),
  source.indexOf('async function loadRemoteResult')
)
const { buildOutcomeDisplayItems } = new Function(
  `${helperSource}\nreturn { buildOutcomeDisplayItems }`
)()

assert.match(source, /v-if="viewModel\.outcomeItems\.length > 1"/)
assert.doesNotMatch(source, /当前阶段|viewModel\.stage/)
assert.match(source, /diagnosis-result-page-retry/)
assert.match(source, /暂时无法加载诊断记录，请检查网络后重试。/)
assert.doesNotMatch(
  source.slice(source.indexOf('if (!routeId.value)'), source.indexOf('const resolvedPlantName')),
  /\}\) \|\| list\[0\]/,
  '带有结果 id 时，远端读取失败不能回退展示另一条诊断记录'
)

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
