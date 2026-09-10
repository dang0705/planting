import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')

assert.doesNotMatch(
  source,
  /qaRemoteReadCaptureToken|isQaRemoteReadCaptureReady|__plantingQaRemoteReadCaptureToken/u,
  '性能采样不得向首页植入会阻断业务初始化的令牌门禁'
)
assert.match(source, /onMounted\(async \(\) => \{[\s\S]*?await userStore\.ensureLogin\(\)/)
assert.match(source, /qaPerformanceRefresh && userStore\.isAuthenticated/)

console.log(
  'remote read performance isolation source contract passed data_mode=unit_fake test_kind=source_contract'
)
