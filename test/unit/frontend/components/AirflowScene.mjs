import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
const EXPECTED_SINGLE_FLOW_ANIMATIONS = 1
const EXPECTED_DOUBLE_FLOW_ANIMATIONS = 2
const EXPECTED_FAN_BLADES = 3

const componentSource = read('src/components/AirflowScene.vue')
const singleScene = read('src/assets/airflow/scene-window-single.svg')
const singleBaseScene = read('src/assets/airflow/scene-window-single-base.svg')
const doubleScene = read('src/assets/airflow/scene-window-double.svg')
const doubleBaseScene = read('src/assets/airflow/scene-window-double-base.svg')
const singleFlowScene = read('src/assets/airflow/scene-window-single-flow.svg')
const doubleFlowScene = read('src/assets/airflow/scene-window-double-flow.svg')
const windowClosedScene = read('src/assets/airflow/scene-window-closed.svg')
const freshAirScene = read('src/assets/airflow/scene-fresh-air.svg')
const freshAirFlowScene = read('src/assets/airflow/scene-fresh-air-flow.svg')
const closedScene = read('src/assets/airflow/scene-closed.svg')

const q5Assets = [
  'scene-q5-canopy-open-base.svg',
  'scene-q5-canopy-partial-base.svg',
  'scene-q5-canopy-enclosed-base.svg',
  'scene-q5-canopy-unknown-base.svg',
  'scene-q5-device-base.svg',
  'scene-q5-canopy-open-flow.svg',
  'scene-q5-canopy-partial-flow.svg',
  'scene-q5-device-circulating-flow.svg',
  'scene-q5-device-circulating-plant.svg',
  'scene-q5-device-direct-flow.svg',
  'scene-q5-device-unknown-flow.svg',
  'scene-q5-canopy-plant.svg',
  'scene-q5-canopy-unknown-plant.svg',
  'scene-q5-device-plant.svg',
  'scene-q5-device-direct-plant.svg',
  'scene-q5-fan-none-base.svg',
  'scene-q5-fan-none-blades.svg',
  'scene-q5-fan-circulating-base.svg',
  'scene-q5-fan-circulating-blades.svg',
  'scene-q5-fan-direct-base.svg',
  'scene-q5-fan-direct-blades.svg',
  'scene-q5-fan-unknown-base.svg',
  'scene-q5-fan-unknown-blades.svg'
]

for (const asset of q5Assets) {
  const source = read(`src/assets/airflow/${asset}`)
  assert.match(source, /viewBox="0 0 104 72"/)
  assert.match(source, /width="104" height="72"/)
}

for (const profile of [
  'canopy-open',
  'canopy-partial',
  'canopy-enclosed',
  'canopy-unknown',
  'device-none',
  'device-circulating',
  'device-direct',
  'device-unknown'
]) {
  assert.match(componentSource, new RegExp(`'${profile}': \\{`))
}

assert.match(componentSource, /const Q5_SCENE_WIDTH = 104/)
assert.match(componentSource, /const Q5_SCENE_HEIGHT = 72/)
assert.match(componentSource, /airflow-fan-base-layer/)
assert.match(componentSource, /airflow-fan-blade-layer/)
assert.match(componentSource, /thumbnailAspectRatio: \{ type: Number, default: null \}/)
assert.match(componentSource, /const FAN_CENTER_BY_PROFILE = Object\.freeze\(/)
assert.match(componentSource, /aspectFill crops the rendered SVG/)
assert.match(componentSource, /:style="\{ transformOrigin: fanTransformOrigin \}"/)
assert.match(componentSource, /transform-origin: 19\.2308% 36\.1111%/)
assert.match(componentSource, /transform-origin: 17\.3077% 41\.6667%/)
assert.match(
  componentSource,
  /airflow-fan-blade-layer--none[\s\S]*airflow-fan-spin 6s linear infinite/
)
assert.match(
  componentSource,
  /airflow-fan-blade-layer--circulating[\s\S]*airflow-fan-spin 0\.8s linear infinite/
)
assert.match(
  componentSource,
  /airflow-fan-blade-layer--direct[\s\S]*airflow-fan-spin 0\.45s linear infinite/
)
assert.match(
  componentSource,
  /airflow-fan-blade-layer--unknown[\s\S]*airflow-fan-spin 2\.4s linear infinite/
)
assert.match(componentSource, /@keyframes airflow-plant-gentle/)
assert.match(componentSource, /rotate\(-2\.5deg\)/)
assert.match(componentSource, /rotate\(-7deg\)/)
assert.match(componentSource, /airflow-breath-layer--canopy-partial/)
assert.match(componentSource, /airflow-question-badge--device-unknown/)
assert.doesNotMatch(componentSource, /scene-fan\.svg/)
assert.doesNotMatch(componentSource, /scene-device-flow\.svg/)
assert.doesNotMatch(componentSource, /SMALL_SCENE_WIDTH = 151\.029/)
assert.doesNotMatch(componentSource, /AIRFLOW_MOTION_FRAMES|setInterval|clearInterval|scenePhase/)

// Existing window / fresh-air scenes retain their established 340x107 contract.
assert.match(
  singleScene,
  /M52\.1248 43\.0464H169\.936C185\.795 43\.0464 185\.795 61\.1712 169\.936 61\.1712H56\.656/
)
assert.match(singleScene, /stroke-dasharray="6\.8 6\.8"/)
assert.doesNotMatch(singleBaseScene, /stroke-dasharray=/)
assert.doesNotMatch(doubleBaseScene, /stroke-dasharray=/)
assert.match(
  windowClosedScene,
  /width="340\.123" height="107\.691" viewBox="0 0 340\.123 107\.691"/
)
assert.match(singleFlowScene, /stroke-dashoffset="0"/)
assert.equal(singleFlowScene.match(/<animate/g)?.length, EXPECTED_SINGLE_FLOW_ANIMATIONS)
assert.equal(doubleFlowScene.match(/<animate/g)?.length, EXPECTED_DOUBLE_FLOW_ANIMATIONS)
assert.match(freshAirScene, /width="340\.123" height="107\.691" viewBox="0 0 340\.123 107\.691"/)
assert.match(freshAirFlowScene, /stroke-dasharray="8 8"/)
assert.match(freshAirFlowScene, /id="return-airflow"/)
assert.doesNotMatch(freshAirFlowScene, /attributeName="opacity"/)

for (const exchangeScene of [
  singleScene,
  singleBaseScene,
  doubleScene,
  doubleBaseScene,
  windowClosedScene,
  freshAirScene,
  closedScene
]) {
  assert.doesNotMatch(
    exchangeScene,
    /<rect width="[^\"]+" height="[^\"]+" rx="16" fill="#F1F8F4"\/>/
  )
}

for (const sceneWithEmbeddedPlant of [
  singleScene,
  singleBaseScene,
  doubleScene,
  doubleBaseScene,
  windowClosedScene,
  freshAirScene
]) {
  assert.match(
    sceneWithEmbeddedPlant,
    /<g transform="translate\(170\.0615,92\.5\) scale\(1\.7\) translate\(-170\.0615,-92\.5\)">/
  )
}

// 窗户缩略图仍使用 aspectFill；左右窗扇需收拢到 2:1 可视区域内，不能依赖改变图例比例。
for (const sceneWithInsetWindowSashes of [
  singleScene,
  singleBaseScene,
  doubleScene,
  doubleBaseScene,
  windowClosedScene,
  freshAirScene
]) {
  assert.match(sceneWithInsetWindowSashes, /translate\((?:87\.69|87\.69),20\.41/)
  assert.match(sceneWithInsetWindowSashes, /translate\((?:234\.27|234\.2700),/)
}
assert.match(singleScene, /translate\(66\.05,6\.10\)/)
assert.match(singleBaseScene, /translate\(242\.9000,20\.3904\)/)
assert.match(doubleScene, /points="252\.428 70\.2826 273\.286 84\.2484/)
assert.match(doubleBaseScene, /points="252\.428 70\.2826 273\.286 84\.2484/)

// Q5 fan geometry: only the blade layer rotates around the Figma motor center.
const noneBlades = read('src/assets/airflow/scene-q5-fan-none-blades.svg')
const circulatingBlades = read('src/assets/airflow/scene-q5-fan-circulating-blades.svg')
const circulatingPlant = read('src/assets/airflow/scene-q5-device-circulating-plant.svg')
const directBlades = read('src/assets/airflow/scene-q5-fan-direct-blades.svg')
const enclosedBase = read('src/assets/airflow/scene-q5-canopy-enclosed-base.svg')
assert.match(noneBlades, /M20,26 Q26\.8,21\.2 21\.6,19\.2 Z/)
assert.match(circulatingBlades, /M9\.2908 8\.08347C14\.6798 4\.27948 15\.3138 1\.585 11\.1928 0/)
assert.match(circulatingPlant, /translate\(84,34\)/)
assert.match(directBlades, /M9\.2908 8\.08347C14\.6798 4\.27948 15\.3138 1\.585 11\.1928 0/)
assert.equal((noneBlades.match(/<path/g) || []).length, EXPECTED_FAN_BLADES)
assert.equal((circulatingBlades.match(/<path/g) || []).length, EXPECTED_FAN_BLADES)
assert.equal((directBlades.match(/<path/g) || []).length, EXPECTED_FAN_BLADES)
assert.match(enclosedBase, /<rect x="16" y="8" width="72" height="12"/)

for (const flowAsset of [
  'scene-q5-canopy-open-flow.svg',
  'scene-q5-canopy-partial-flow.svg',
  'scene-q5-device-circulating-flow.svg',
  'scene-q5-device-direct-flow.svg',
  'scene-q5-device-unknown-flow.svg'
]) {
  const source = read(`src/assets/airflow/${flowAsset}`)
  assert.match(source, /<animate attributeName="stroke-dashoffset"/)
}
const circulatingFlow = read('src/assets/airflow/scene-q5-device-circulating-flow.svg')
assert.equal((circulatingFlow.match(/<path/g) || []).length, 1)
assert.equal((circulatingFlow.match(/<animate/g) || []).length, 1)

process.stdout.write('AirflowScene exact Q5 geometry and motion contract tests passed\n')
