/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'cloudfunctions/layer/utils/plant-knowledge.js'),
  'utf8'
)

assert.match(source, /\(\?:可信度\|置信度\)/)
assert.doesNotMatch(source, /可信度\s*\$\{normalizedPercent\}/)
assert.match(source, /summary: normalizeReliabilitySummary\(row\.ai_summary \|\| ''\)/)

console.log('plant knowledge public summary source contract passed data_mode=unit_fake')
