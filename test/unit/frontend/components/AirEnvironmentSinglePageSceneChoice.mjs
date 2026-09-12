import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/components/AirEnvironmentSinglePageSceneChoice.vue'),
  'utf8'
)

assert.match(source, /:id="id"/)
assert.match(source, /AirflowScene/)
assert.match(source, /DeviceAirflowScene/)
assert.match(source, /Array\.isArray\(deviceSources\)/)
assert.match(source, /deviceSources: \{ type: Array, default: null \}/)
assert.match(source, /isUnknown: \{ type: Boolean, default: false \}/)
assert.match(source, /v-if="isUnknown"[\s\S]*text-3xl font-semibold leading-none text-\[#74907e\]/)
assert.match(source, /v-if="!isUnknown && description"/)
assert.match(source, /:class="isUnknown \? 'text-center' : ''"/)
assert.match(source, /flex flex-col overflow-hidden/)
assert.match(source, /aspect-\[2\/1\] shrink-0/)
assert.match(source, /sceneWidthClass: \{ type: String, default: 'w-3\/4' \}/)
assert.match(source, /sceneAspectRatio: \{ type: \[Number, String\], default: 2 \}/)
assert.match(source, /:style="\{ aspectRatio: sceneAspectRatio \}"/)
assert.match(source, /py-2/)
assert.match(source, /min-h-\[72px\] w-full/)
assert.doesNotMatch(source, /h-\[120px\]/)
assert.doesNotMatch(source, /h-12 w-full/)
assert.match(source, /line-clamp-1/)
assert.match(source, /line-clamp-2/)
assert.match(source, /@click="handleSelect"/)
assert.match(source, /emit\('select'\)/)
assert.match(source, /disabled \? 'pointer-events-none opacity-50'/)
assert.doesNotMatch(source, /bg-\[rgba\(241,248,244,0\.55\)\]/)

process.stdout.write('AirEnvironmentSinglePageSceneChoice component contract tests passed\n')
