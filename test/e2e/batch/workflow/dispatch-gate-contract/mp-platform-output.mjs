import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateMpPlatformOutput } from '../../../../../scripts/dev/validate-mp-platform-output.mjs'

// data_mode=unit_fake; test_kind=source_contract。真实 DevTools 导入与抖音账号权限仍需在平台工具/真机验收。
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-mp-platform-output-'))
const outputDir = path.join(root, 'mp-toutiao')
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(
  path.join(outputDir, 'project.config.json'),
  JSON.stringify({ appid: 'tt79ef0f52e78e857401' })
)
fs.writeFileSync(path.join(outputDir, 'app.json'), JSON.stringify({ pages: [] }))

assert.deepEqual(validateMpPlatformOutput({ platform: 'mp-toutiao', outputDir }), {
  platform: 'mp-toutiao',
  outputDir,
  appId: 'tt79ef0f52e78e857401'
})

fs.writeFileSync(
  path.join(outputDir, 'project.config.json'),
  JSON.stringify({ appid: 'testAppId' })
)
assert.throws(
  () => validateMpPlatformOutput({ platform: 'mp-toutiao', outputDir }),
  /小程序产物 AppID 不匹配/u
)

fs.rmSync(root, { recursive: true, force: true })
console.log('mp platform output validation contract tests passed')
