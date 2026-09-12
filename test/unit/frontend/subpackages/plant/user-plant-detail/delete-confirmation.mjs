import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'),
  'utf8'
)

assert.match(source, /id="user-plant-detail-delete-button"/)
assert.match(source, /@click="confirmDelete"/)
assert.match(source, /uni\.showModal\(\{/)
assert.match(source, /确认删除/)
assert.match(source, /永久删除这株植物及其养护、提醒和诊断记录/u)
assert.match(source, /手机日历的提醒不会自动删除，请手动移除/u)
assert.match(source, /if \(res\.confirm\) \{[\s\S]*plantStore\.deleteUserPlant/u)
assert.match(source, /result\.message \|\| '已删除'/)
assert.match(source, /icon: result\.cleanupPending \? 'none' : 'success'/)

console.log('user plant delete confirmation source contract tests passed')
