import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const sourcePath = path.join(process.cwd(), 'src/App.vue')
const source = fs.readFileSync(sourcePath, 'utf8')

// data_mode=unit_fake, test_kind=source_contract：只验证云初始化合同；
// 真实 DevTools 控制台和 CloudBase 运行时仍必须由 Automator live 验证。
assert.doesNotMatch(source, /wx\.cloud\.init\(/u)
assert.match(source, /云能力按需初始化/u)

console.log('mini program cloud init contract tests passed')
