/* data_mode=unit_fake; test_kind=source_contract */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/http-functions/diagnose/retake.js'),
  'utf8'
)

assert.match(source, /const error = new Error\(envelope\?\.message \|\| fallbackMessage\)/)
assert.match(source, /error\.businessCode = String\(envelope\?\.businessCode \|\| ''\)\.trim\(\)/)
assert.doesNotMatch(source, /businessCode.*`（\$\{envelope\.businessCode\}）`/s)

console.log('diagnosis retake public error tests passed data_mode=unit_fake')
