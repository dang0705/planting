import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/* oxlint-disable no-console -- source contract emits a concise result. */

// data_mode=unit_fake; test_kind=source_contract。真实分包栈和微信端回退仍需 Automator 验证。
const repoRoot = process.cwd()
const layoutSource = fs.readFileSync(path.join(repoRoot, 'src/Layout.vue'), 'utf8')
const questionPackageSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/question-package.vue'),
  'utf8'
)

assert.match(
  questionPackageSource,
  /:back-mode="historyRecordId \? 'stack' : 'auto'"/u,
  '历史详情必须明确要求 Header 只回退当前页面栈'
)
assert.match(
  layoutSource,
  /backMode: \{ type: String, default: 'auto' \}/u,
  'Layout must expose an explicit back mode'
)
assert.match(
  layoutSource,
  /if \(props\.backMode === 'stack'\) \{[\s\S]*?navigateBackOrHome\(\{ fallbackToHome: false \}\)/u,
  'stack back mode must not fall through to home'
)

console.log('question package history navigation contract passed')
