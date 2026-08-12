import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/components/common/ButtonStepTrack.vue'),
  'utf8'
)

assert.match(source, /footerPosition === 'fixed' \? 'overflow-visible' : 'overflow-hidden'/)
assert.match(source, /footerPosition === 'fixed'[\s\S]*?'fixed bottom-0 left-0 right-0 z-\[100\]'/)
assert.match(source, /footerPosition: \{ type: String, default: 'absolute' \}/)
assert.match(source, /rootClass: \{ type: \[String, Array, Object\], default: '' \}/)
assert.match(source, /fill: \{ type: Boolean, default: true \}/)

console.log('ButtonStepTrack footer-position contract tests passed')
