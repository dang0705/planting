import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
const componentSource = read('src/components/DeviceAirflowScene.vue')

// One composite canvas owns one plant; selected devices only add source layers.
assert.match(componentSource, /:src="plantScene"/)
assert.match(componentSource, /v-if="fanRelation"/)
assert.match(componentSource, /v-if="airConditionerRelation"/)
assert.match(componentSource, /v-if="freshAirRelation"/)
assert.match(componentSource, /scene-q5-fresh-air-circulating-flow\.svg/)
assert.match(componentSource, /fan-circulating-blades\.svg/)
assert.match(componentSource, /fan-direct-blades\.svg/)
assert.match(componentSource, /scene-q5-air-conditioner-plant\.svg/)
assert.match(componentSource, /hasDirectSource/)
assert.match(componentSource, /device-airflow-plant--direct/)
assert.match(componentSource, /device-airflow-plant--circulating/)
assert.match(componentSource, /device-airflow-fan-spin 0\.8s linear infinite/)
assert.match(componentSource, /device-airflow-fan-blades--direct[\s\S]*animation-duration: 0\.45s/)
assert.match(componentSource, /transform-origin: 13\.8% 60\.5%/)
assert.match(componentSource, /scene-q5-fresh-air-source\.svg/)
assert.match(componentSource, /mode="scaleToFill"/)
assert.match(componentSource, /freshAirFlowScene[\s\S]*mode="scaleToFill"/)
assert.match(componentSource, /scene-q5-fresh-air-direct-flow\.svg/)
assert.match(componentSource, /scene-q5-device-fan-circulating-flow\.svg/)
assert.doesNotMatch(componentSource, /transform: scale\(0\.5\)/)
assert.match(
  componentSource,
  /device-airflow-flow--fresh-air[\s\S]*animation-name: device-airflow-flow-pulse[\s\S]*animation-duration: 2\.4s/
)
assert.match(
  componentSource,
  /@keyframes device-airflow-flow-pulse[\s\S]*translateX\(-2px\) scale\(0\.98\)[\s\S]*translateX\(2px\) scale\(1\)/
)
assert.match(componentSource, /sourceRelation\('fan'\)/)
assert.match(componentSource, /sourceRelation\('air_conditioner'\)/)
assert.match(componentSource, /sourceRelation\('fresh_air'\)/)
assert.doesNotMatch(componentSource, /AirflowScene|AirConditionerScene|v-for="source in/)

for (const asset of [
  'scene-q5-air-conditioner-base.svg',
  'scene-q5-air-conditioner-plant.svg',
  'scene-q5-air-conditioner-circulating-flow.svg',
  'scene-q5-air-conditioner-direct-flow.svg',
  'scene-q5-fresh-air-source.svg',
  'scene-q5-fresh-air-circulating-flow.svg',
  'scene-q5-device-fan-circulating-flow.svg',
  'scene-q5-fresh-air-direct-flow.svg'
]) {
  const source = read(`src/assets/airflow/${asset}`)
  assert.match(source, /width="104" height="72" viewBox="0 0 104 72"/)
}

const freshAirSource = read('src/assets/airflow/scene-q5-fresh-air-source.svg')
assert.match(freshAirSource, /translate\(41\.5,8\)/)
assert.match(freshAirSource, /width="21" height="5\.1"/)
assert.match(freshAirSource, /x="3" y="1\.8" width="12\.9" height="1\.5"/)
assert.match(freshAirSource, /cx="18" cy="2\.55" r="0\.6"/)
assert.match(
  read('src/assets/airflow/scene-q5-air-conditioner-base.svg'),
  /translate\(70\.8,9\.51\)/
)
assert.match(
  read('src/assets/airflow/scene-q5-air-conditioner-base.svg'),
  /translate\(104,23\) scale\(0\.82\)/
)
assert.match(
  read('src/assets/airflow/scene-q5-air-conditioner-direct-flow.svg'),
  /translate\(53\.89,23\.24\)/
)
assert.match(
  read('src/assets/airflow/scene-q5-air-conditioner-direct-flow.svg'),
  /translate\(104,23\) scale\(0\.82\)/
)
assert.match(read('src/assets/airflow/scene-q5-air-conditioner-circulating-flow.svg'), /M71,23/)
assert.match(
  read('src/assets/airflow/scene-q5-air-conditioner-circulating-flow.svg'),
  /translate\(104,23\) scale\(0\.82\)/
)
assert.match(
  read('src/assets/airflow/scene-q5-device-fan-circulating-flow.svg'),
  /translate\(25\.37,24\)/
)
assert.match(
  read('src/assets/airflow/scene-q5-device-fan-circulating-flow.svg'),
  /translate\(15\.2,66\) scale\(0\.82\)/
)

const circulatingFlow = read('src/assets/airflow/scene-q5-air-conditioner-circulating-flow.svg')
const directFlow = read('src/assets/airflow/scene-q5-air-conditioner-direct-flow.svg')
assert.match(circulatingFlow, /stroke="#104E64"/)
assert.match(circulatingFlow, /stroke="#D32F2F"/)
assert.match(directFlow, /stroke="#104E64"/)
assert.match(directFlow, /stroke="#D32F2F"/)
assert.notEqual(circulatingFlow, directFlow)
assert.match(
  read('src/assets/airflow/scene-q5-device-direct-flow.svg'),
  /M24,40 C31,40 39,40 50,40/
)

const freshCirculatingFlow = read('src/assets/airflow/scene-fresh-air-flow.svg')
assert.match(freshCirculatingFlow, /id="left-airflow"/)
assert.match(freshCirculatingFlow, /M170 22/)
assert.match(freshCirculatingFlow, /id="return-airflow"/)
assert.match(freshCirculatingFlow, /id="center-airflow"/)

const freshDeviceCirculatingFlow = read(
  'src/assets/airflow/scene-q5-fresh-air-circulating-flow.svg'
)
assert.match(freshDeviceCirculatingFlow, /id="left-airflow"/)
assert.match(freshDeviceCirculatingFlow, /id="return-airflow"/)
assert.match(freshDeviceCirculatingFlow, /stroke-width="1\.4"/)
assert.match(freshDeviceCirculatingFlow, /stroke-width="1\.2"/)
assert.match(freshDeviceCirculatingFlow, /left-airflow[\s\S]*M45,14\.7[\s\S]*4,56\.2/)
assert.match(freshDeviceCirculatingFlow, /right-airflow[\s\S]*M59,14\.7[\s\S]*100,56\.8/)
assert.doesNotMatch(freshDeviceCirculatingFlow, /id="center-airflow"/)
assert.match(freshDeviceCirculatingFlow, /return-airflow[\s\S]*M100,56\.8[\s\S]*60\.5,23\.4/)
assert.match(freshDeviceCirculatingFlow, /dur="2\.4s"/)
assert.match(freshDeviceCirculatingFlow, /dur="3\.1s"/)
assert.match(freshDeviceCirculatingFlow, /dur="3\.2s"/)

process.stdout.write('DeviceAirflowScene single-plant composite contract tests passed\n')
