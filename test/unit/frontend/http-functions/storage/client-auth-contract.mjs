import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(path.join(repoRoot, 'src/http-functions/storage/client.js'), 'utf8')

assert.match(
  source,
  /requestHttp(?:File|Function)\(['"]storage-http\/storage\/diagnose-images['"],[\s\S]*?requirePlatformSession:\s*true/u,
  '诊断图片上传必须显式要求持久平台会话'
)
assert.match(
  source,
  /requestHttpFunction\(['"]storage-http\/storage\/diagnose-images['"],[\s\S]*?method:\s*['"]DELETE['"],[\s\S]*?requirePlatformSession:\s*true/u,
  '诊断图片删除必须显式要求持久平台会话'
)
