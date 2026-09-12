import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/components/DeviceAirflowAssessment.vue'),
  'utf8'
)

assert.match(source, /哪些设备的风会到达植物？/)
assert.match(source, /有设备风/)
assert.match(source, /分别判断每种设备/)
assert.match(source, /分别判断每种设备（可多选）/)
assert.match(source, /不到植物/)
assert.match(source, /不直吹/)
assert.match(source, /直吹/)
assert.doesNotMatch(source, /key: 'none', label: '不到植物'/)
assert.match(source, /sourceModes\[source\] === relation/)
assert.match(source, /device-mode-has-airflow/)
assert.match(source, /device-sources/)
assert.match(source, /device-source-\$\{source\.key\}-\$\{relation\.key\}/)
assert.match(source, /flex flex-wrap gap-1/)
assert.match(source, /whitespace-normal/)
assert.match(source, /function selectDevicePresence\(presence\)/)
assert.match(source, /function selectSourceMode\(source, relation\)/)
assert.match(source, /props\.airExchange\?\.source === 'fresh_air'/)
assert.match(source, /device-mode-unknown[\s\S]*?devicePresenceDisabled\('unknown'\)/)
assert.match(source, /\['circulating', 'direct'\]\.includes\(airflow\.value\.mode\)/)
assert.match(source, /:show-selection-indicator="false"/)
assert.match(source, /grid grid-cols-2 gap-2/)
assert.match(source, /orientation="vertical"/)
assert.match(source, /:description-lines="2"/)
assert.doesNotMatch(source, /<AirflowScene/)
assert.doesNotMatch(source, /import AirflowScene/)
assert.match(source, /key: 'air_conditioner', label: '空调'/)
assert.doesNotMatch(source, /空调 \/ 暖气/)
assert.doesNotMatch(source, /source\.scene|source\.motionProfile/)
assert.doesNotMatch(source, /deviceAirflowCardExpanded/)
assert.doesNotMatch(source, /deviceAirflowCardVisible/)
assert.doesNotMatch(source, /v-if="!deviceAirflowCardVisible"/)

console.log('DeviceAirflowAssessment parent-child contract tests passed')
