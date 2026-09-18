// data_mode=unit_fake; test_kind=source_contract. The runtime console is covered by Automator live QA.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/http-functions/diagnose/watering-soil.js'),
  'utf8'
)

assert.match(source, /import\.meta\.env\.DEV === true \|\| import\.meta\.env\.VITE_APP_ENV === 'development'/u)
assert.match(source, /'x-planting-debug-audit': 'soil_visual_v1'/u)
assert.match(source, /\[浇水盆土视觉\]\[模型\]/u)
assert.match(source, /\[浇水盆土视觉\]\[模型调用prompt\]/u)
assert.match(source, /\[浇水盆土视觉\]\[token 用量\]/u)
assert.match(source, /\[浇水盆土视觉\]\[模型原始返回\]/u)
assert.match(source, /\[浇水盆土视觉\]\[解析结果\]/u)
assert.match(source, /\[浇水盆土视觉\]\[最终结果\]/u)
assert.match(source, /audit\.tokenUsage \|\| null/u)
assert.doesNotMatch(source, /subpackages\/diagnosis\/http-functions/u)
assert.match(source, /const result = response\.data \|\| null\s+logSoilVisualDebug\(result\)/u)

console.log('watering soil visual frontend debug source-contract passed')
