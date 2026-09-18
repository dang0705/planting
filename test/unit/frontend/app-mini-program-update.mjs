/* oxlint-disable no-console -- source contract test reports its result. */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const app = read('src/App.vue')
const layout = read('src/Layout.vue')

// data_mode=unit_fake; test_kind=source_contract.
// Expected 来源：用户需求与微信 UpdateManager 启动监听合同；真实运行时仍需 Automator/live 验收。
assert.match(app, /#ifdef MP-WEIXIN[\s\S]*startMiniProgramUpdateCheck/u)
assert.match(app, /onLaunch\(\(\) =>[\s\S]*startMiniProgramUpdateCheck\(\)/u)
assert.match(layout, /MiniProgramUpdateGate/u)
assert.match(layout, /miniProgramUpdateState\.phase/u)
assert.match(layout, /@retry="retryMiniProgramUpdate"/u)

console.log(
  'mini program update app wiring contract tests passed data_mode=unit_fake test_kind=source_contract'
)
