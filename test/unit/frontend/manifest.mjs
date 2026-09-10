import assert from 'node:assert/strict'
import fs from 'node:fs'

const manifestSource = fs.readFileSync('src/manifest.json', 'utf8')
const MATCH_GROUP_INDEX = 1
const toutiaoBlock = manifestSource.match(
  /"mp-toutiao"\s*:\s*\{([\s\S]*?)\n\s*\},\n\s*"mp-xhs"/u
)?.[MATCH_GROUP_INDEX]

assert.ok(toutiaoBlock, '抖音平台配置必须存在')
assert.match(
  toutiaoBlock,
  /"permission"\s*:\s*\{[\s\S]*?"scope\.userLocation"[\s\S]*?"desc"\s*:\s*"用于获取您的位置信息以提供天气服务"/
)
assert.match(toutiaoBlock, /"requiredPrivateInfos"\s*:\s*\[\s*"scope\.userLocation"\s*\]/)
