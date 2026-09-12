/**
 * data_mode=unit_fake
 * test_kind=source_contract
 *
 * 独立诊断分包页需要拥有自己的内容区横向内边距；DiagnoseFlow 仍需支持弹窗复用，
 * 因此 padding 由页面显式打开，组件默认关闭以避免与 BottomSheet 的 padding 叠加。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const flowPage = fs.readFileSync(path.join(root, 'src/subpackages/diagnosis/flow.vue'), 'utf8')
const diagnoseFlow = fs.readFileSync(
  path.join(root, 'src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue'),
  'utf8'
)

assert.match(
  flowPage,
  /<DiagnoseFlow[\s\S]*:content-padding="true"/u,
  '独立诊断分包页必须显式启用内容区横向 padding'
)
assert.match(
  diagnoseFlow,
  /id="diagnose-flow-content"[\s\S]*:class="\{\s*'px-4': contentPadding\s*\}"/u,
  'DiagnoseFlow 内容区必须按 contentPadding 条件启用 px-4'
)
assert.match(
  diagnoseFlow,
  /contentPadding:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/u,
  'DiagnoseFlow 默认不能启用 padding，避免弹窗复用时叠加'
)
