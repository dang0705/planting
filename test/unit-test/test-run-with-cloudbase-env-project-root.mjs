import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveProjectRoot } from '../../test/e2e/terminal-e2e/run-with-cloudbase-env.mjs'

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname)

// 1. 从脚本自身位置（test/e2e/terminal-e2e/...）解析必须命中仓库根。
const scriptUrl = pathToFileURL(
  path.join(repoRoot, 'test/e2e/terminal-e2e/run-with-cloudbase-env.mjs')
).href
assert.equal(resolveProjectRoot(scriptUrl), repoRoot, '从 test/e2e/terminal-e2e 应解析到仓库根')

// 2. 从更深的 test/unit-test 文件解析也必须命中仓库根。
const testUrl = pathToFileURL(
  path.join(repoRoot, 'test/unit-test/test-run-with-cloudbase-env-project-root.mjs')
).href
assert.equal(resolveProjectRoot(testUrl), repoRoot, '从 test/unit-test 应解析到仓库根')

// 3. 从仓库根目录中的脚本解析也应命中仓库根。
const rootScriptUrl = pathToFileURL(path.join(repoRoot, 'package.json')).href
assert.equal(
  resolveProjectRoot(rootScriptUrl),
  repoRoot,
  '从仓库根 package.json 同级也应命中仓库根'
)

// 4. 文件系统根 / 之外应抛出明确中文错误。
assert.throws(
  () => resolveProjectRoot(pathToFileURL('/tmp/non-existent-anchor.mjs').href),
  /未能定位仓库根目录/
)

console.log('test-run-with-cloudbase-env-project-root OK')
