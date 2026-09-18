import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/FertilizationMonthlySheet.vue'),
  'utf8'
)
assert.match(source, /const requestSequence = \+\+reminderLoadSequence/)
assert.match(source, /createAsyncActionGuard/)
assert.match(source, /createPreviewAction\.run\(/)
assert.match(source, /requestSequence !== reminderLoadSequence/)
assert.match(source, /if \(!preview\.value \|\| loading\.value\)/)
assert.match(source, /if \(!reminder\.value \|\| loading\.value\)/)
assert.match(
  source,
  /if \(!calendarDeleteAcknowledged\.value \|\| !reminder\.value \|\| loading\.value\)/
)
assert.match(source, /手机日历已添加，但应用内还没保存成功/)

console.log(
  'fertilization reminder resilience contracts passed data_mode=unit_fake test_kind=source_contract'
)
