import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const componentSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/AirEnvironmentOptionCard.vue'),
  'utf8'
)

assert.match(componentSource, /import AirflowScene from '@\/components\/AirflowScene\.vue'/)
assert.match(componentSource, /:id="id"/)
assert.match(componentSource, /@click="handleSelect"/)
assert.match(componentSource, /selected \? 'border-brand bg-\[#e8f5e9\]'/)
assert.match(componentSource, /h-\[61px\] w-\[88px\]/)
assert.match(componentSource, /<AirflowScene/)
assert.match(componentSource, /:motion-profile="motionProfile"/)
assert.match(componentSource, /isUnknown: \{ type: Boolean, default: false \}/)
assert.match(
  componentSource,
  /v-if="isUnknown"[\s\S]*text-3xl font-semibold leading-none text-\[#74907e\]/
)
assert.match(componentSource, /v-if="!isUnknown && description"/)
assert.match(componentSource, /isUnknown \? 'text-center' : ''/)
assert.match(componentSource, /motionProfile: \{ type: String, default: '' \}/)
assert.match(componentSource, /showSelectionIndicator: \{ type: Boolean, default: true \}/)
assert.match(componentSource, /v-if="showSelectionIndicator"/)
assert.match(componentSource, /aspect-\[2\/1\]/)
assert.match(componentSource, /class="aspect-\[2\/1\] w-3\/4 shrink-0 overflow-hidden rounded-xl"/)
assert.match(componentSource, /box-border min-h-\[54px\] w-full overflow-hidden p-2/)
assert.match(componentSource, /box-border min-h-\[71px\] w-full overflow-hidden p-2/)
assert.match(componentSource, /line-clamp-1/)
assert.match(
  componentSource,
  /compact \|\| descriptionLines > 1 \? 'line-clamp-2' : 'line-clamp-1'/
)
assert.match(componentSource, /descriptionLines: \{ type: Number, default: 1 \}/)
assert.doesNotMatch(componentSource, /bg-\[#f1f8f4\]/)
assert.match(componentSource, /v-if="selected"/)
assert.match(componentSource, /if \(!props\.disabled\)/)

console.log('AirEnvironmentOptionCard component contract tests passed')
