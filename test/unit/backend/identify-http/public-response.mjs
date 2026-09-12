/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'cloudfunctions/identify-http/app.js'),
  'utf8'
)

assert.match(source, /matchedPlant: simplifiedMatchedPlant/)
assert.match(source, /candidates: simplifiedCandidates/)
assert.doesNotMatch(source, /raw:\s*processed\.data/)

console.log('identify public response source contract passed data_mode=unit_fake')
