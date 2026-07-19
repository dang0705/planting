import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveProjectRoot } from '../../../scripts/dev/run-with-cloudbase-env.mjs'

const repoRoot = path.resolve(new URL('../../..', import.meta.url).pathname)

// 1. 从脚本自身位置（scripts/dev/...）解析必须命中仓库根。
const scriptUrl = pathToFileURL(
  path.join(repoRoot, 'scripts/dev/run-with-cloudbase-env.mjs')
).href
assert.equal(resolveProjectRoot(scriptUrl), repoRoot, '从 scripts/dev 应解析到仓库根')

// 2. 从更深的 test/unit/backend 文件解析也必须命中仓库根。
const testUrl = pathToFileURL(
  path.join(repoRoot, 'test/unit/backend/run-with-cloudbase-env-project-root.mjs')
).href
assert.equal(resolveProjectRoot(testUrl), repoRoot, '从 test/unit/backend 应解析到仓库根')

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
