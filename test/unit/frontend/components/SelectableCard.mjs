import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const componentSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/SelectableCard.vue'),
  'utf8'
)

assert.match(componentSource, /:id="id"/)
assert.match(componentSource, /@click="handleSelect"/)
assert.match(componentSource, /defineEmits\(\['select'\]\)/)
assert.match(componentSource, /selected\s*\?\s*'border-brand bg-\[#e8f5e9\]'/)
assert.match(componentSource, /'border-\[rgba\(45,122,79,0\.15\)\] bg-white'/)
assert.match(componentSource, /disabled\s*\? 'pointer-events-none opacity-60'/)
assert.doesNotMatch(componentSource, /AirflowScene|h-\[108px\]|scene|title|description/)
assert.match(componentSource, /if \(props\.disabled\) \{/)

console.log('SelectableCard component contract tests passed')
