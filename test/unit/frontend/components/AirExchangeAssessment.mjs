import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const componentSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/AirExchangeAssessment.vue'),
  'utf8'
)
const selectableCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/SelectableCard.vue'),
  'utf8'
)

assert.match(componentSource, /modelValue:\s*\{\s*type:\s*Object/)
assert.match(componentSource, /idPrefix:\s*\{\s*type:\s*String,\s*default:\s*'airflow'/)
assert.match(componentSource, /disabled:\s*\{\s*type:\s*Boolean,\s*default:\s*false/)
assert.match(componentSource, /defineEmits\(\['update:modelValue',\s*'change'\]\)/)
assert.match(componentSource, /emit\('update:modelValue',\s*nextValue\)/)
assert.match(componentSource, /emit\('change',\s*nextValue\)/)
assert.doesNotMatch(componentSource, /resolveAirExchangeEvidence/)
assert.match(componentSource, /from '@\/utils\/air-exchange-evidence\.js'/)
assert.match(componentSource, /:id="`\$\{idPrefix\}-assessment`"/)

// 只保留一个图例槽位；换气状态通过频率和新风开关改变该图例。
assert.match(componentSource, /:id="`\$\{idPrefix\}-source-window`"/)
assert.strictEqual((componentSource.match(/<SelectableCard/g) || []).length, 1)
assert.doesNotMatch(componentSource, /source-fresh_air|source-unknown|不确定|平时较少换气/)
assert.match(componentSource, /:scene="windowScene"/)
assert.match(
  componentSource,
  /const windowScene = computed\(\(\) =>[\s\S]*'fresh-air'[\s\S]*'window-closed'[\s\S]*'window-two'[\s\S]*'window-one'/
)
assert.match(componentSource, /:id="`\$\{idPrefix\}-fresh-air-switch`"/)
assert.match(componentSource, /@change="toggleFreshAir"/)
assert.match(componentSource, /:checked="false"/)
assert.match(componentSource, /:checked="true"/)

// 方向只有一个 / 两个及以上，几乎不开并入频率。
assert.match(componentSource, /windowDirectionOptions/)
assert.match(componentSource, /windowFrequencyOptions/)
assert.match(componentSource, /几乎不开/)
assert.doesNotMatch(componentSource, /key === 'closed'|windowDirectionCount === 'closed'/)
assert.match(
  componentSource,
  /source: 'fresh_air', windowDirectionCount: null, windowOpenFrequency: null/
)
assert.match(componentSource, /source: 'window', \.\.\.lastWindowSelection\.value/)
assert.match(componentSource, /植物所处房间\/客厅在几个方向上有窗/)

assert.match(componentSource, /import AirflowScene from '@\/components\/AirflowScene\.vue'/)
assert.match(componentSource, /thumbnail\s*\n\s*:thumbnail-aspect-ratio="2"/)
assert.match(selectableCardSource, /bg-white/)
assert.match(selectableCardSource, /border-brand bg-\[#e8f5e9\]/)

const utilSource = fs.readFileSync(
  path.join(repoRoot, 'src/utils/air-exchange-evidence.js'),
  'utf8'
)
assert.match(utilSource, /key:\s*'one'/)
assert.match(utilSource, /key:\s*'two_or_more'/)
assert.doesNotMatch(utilSource, /key:\s*'closed'/)
assert.match(utilSource, /key:\s*'almost_never'/)

console.log('AirExchangeAssessment component contract tests passed')
