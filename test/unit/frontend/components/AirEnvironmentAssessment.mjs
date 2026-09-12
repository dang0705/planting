import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const componentSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/AirEnvironmentAssessment.vue'),
  'utf8'
)

// AirEnvironmentAssessment 是业务层唯一对外调用的完整空气环境组件。
assert.match(
  componentSource,
  /import ButtonStepTrack from '@\/components\/common\/ButtonStepTrack\.vue'/
)
assert.match(componentSource, /<ButtonStepTrack/)
assert.match(
  componentSource,
  /import AirEnvironmentSinglePagePrototype from '@\/components\/AirEnvironmentSinglePagePrototype\.vue'/
)
assert.match(componentSource, /layoutMode: \{ type: String, default: 'single-page' \}/)
assert.match(componentSource, /v-if="isSinglePage"/)
assert.match(componentSource, /<AirEnvironmentSinglePagePrototype/)
assert.match(componentSource, /<template #footer>/)
assert.match(componentSource, /:step-count="STEP_COUNT"/)
assert.match(componentSource, /:footer-position="footerPosition"/)
assert.match(componentSource, /:fill="!isContentHeight"/)
assert.match(componentSource, /heightMode: \{ type: String, default: 'content' \}/)
assert.match(componentSource, /:id="`\$\{idPrefix\}-swiper`"/)
assert.match(
  componentSource,
  /:class="isContentHeight \? '' : 'h-full'"\s+:style="stepPanelStyle"/g
)
assert.match(componentSource, /panelHeight: \{ type: Number, default: 560 \}/)
assert.match(componentSource, /AIR_EXCHANGE_STEP = 0/)
assert.match(componentSource, /LOCAL_AIRFLOW_STEP = 1/)
assert.match(
  componentSource,
  /import AirExchangeAssessment from '@\/components\/AirExchangeAssessment\.vue'/
)
assert.match(componentSource, /<AirExchangeAssessment/)
assert.match(componentSource, /室内外空气交换/)
assert.match(componentSource, /`\$\{idPrefix\}-exchange-step`/)
assert.match(componentSource, /`\$\{idPrefix\}-local-airflow-step`/)
assert.match(componentSource, /pb-\[112px\]/)
assert.match(componentSource, /植物周围是否开阔/)
assert.match(
  componentSource,
  /import AirEnvironmentOptionCard from '@\/components\/AirEnvironmentOptionCard\.vue'/
)
assert.match(componentSource, /<AirEnvironmentOptionCard/)
assert.match(componentSource, /:is-unknown="option\.key === 'unknown'"/)
assert.match(componentSource, /:show-selection-indicator="false"/)
assert.match(
  componentSource,
  /import DeviceAirflowAssessment from '@\/components\/DeviceAirflowAssessment\.vue'/
)
assert.match(componentSource, /<DeviceAirflowAssessment/)
assert.match(componentSource, /<view class="mt-6">\s*<DeviceAirflowAssessment/)
assert.doesNotMatch(componentSource, /<DeviceAirflowAssessment\s+class="mt-6"/)
assert.match(componentSource, /:id-prefix="idPrefix"/)
assert.match(componentSource, /@change="handleDeviceAirflowChange"/)
assert.match(componentSource, /rounded-xl border border-\[rgba\(45,122,79,0\.15\)\] bg-white p-5/)
assert.match(componentSource, /grid grid-cols-2 gap-2/)
assert.match(componentSource, /orientation="vertical"/)
assert.match(
  componentSource,
  /:description-lines="\['enclosed', 'unknown'\]\.includes\(option\.key\) \? 2 : 1"/
)
assert.match(componentSource, /:id="`\$\{idPrefix\}-insight`"/)
assert.match(componentSource, /持续直吹易失水。叶缘焦枯多与此相关/)
assert.match(componentSource, /DEFAULT_WINDOW_DIRECTION_COUNT = 'one'/)
assert.match(componentSource, /DEFAULT_WINDOW_OPEN_FREQUENCY = 'daily'/)
assert.match(
  componentSource,
  /const source = \['window', 'fresh_air'\]\.includes\(input\.airExchange\.source\)/
)
assert.match(componentSource, /source === 'fresh_air' \? 'circulating' : 'none'/)
assert.match(componentSource, /source === 'fresh_air'/)
assert.match(componentSource, /sourceModes\.fresh_air \|\|= 'circulating'/)
assert.match(componentSource, /returnedFromDefaultFreshAir/)
assert.match(
  componentSource,
  /const currentDirectSources = Array\.isArray\(deviceAirflow\?\.directSources\)/
)

// 室外换气是上游输入，室内设备风来源依赖上游的新风选择。
assert.match(componentSource, /:model-value="environment\.airExchange"/)
assert.match(componentSource, /@change="handleAirExchangeChange"/)
assert.match(componentSource, /function reconcileDeviceAirflowForExchange\(/)
assert.match(componentSource, /previousAirExchange/)

// 内部导航只改变空气组件的两个步骤；需要时由父流程注入返回和完成动作。
assert.match(componentSource, /:id="`\$\{idPrefix\}-next-step`"/)
assert.match(componentSource, /:id="`\$\{idPrefix\}-previous-step`"/)
assert.match(componentSource, /completionLabel/)
assert.match(componentSource, /resolvedCompletionId/)
assert.match(componentSource, /emit\('complete', environment\.value\)/)
assert.match(componentSource, /emit\('back'\)/)
assert.match(componentSource, /function nextStep\(\)/)
assert.match(componentSource, /function previousStep\(\)/)
assert.match(componentSource, /defineExpose\(\{/)

console.log('AirEnvironmentAssessment component contract tests passed')
