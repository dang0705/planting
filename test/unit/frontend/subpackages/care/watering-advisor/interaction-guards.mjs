import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/care/watering-advisor/watering-advisor.vue'),
  'utf8'
)
assert.match(source, /const confirmWateredAction = createAsyncActionGuard\(\)/)
assert.match(source, /return confirmWateredAction\.run\(/)
assert.match(source, /const handleFinishAdvisor = createLeadingThrottle\(finishAdvisor, 500\)/)
assert.match(source, /@click="handleFinishAdvisor"/)
assert.doesNotMatch(source, /createLeadingThrottle\(handleScrollLower/)

console.log(
  'watering advisor interaction guard contracts passed data_mode=unit_fake test_kind=source_contract'
)
