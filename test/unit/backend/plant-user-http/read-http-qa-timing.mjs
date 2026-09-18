import assert from 'node:assert/strict'
import fs from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。
// QA 打点只服务于 CloudBase 耗时拆解，不能替代真实 wx.request 性能验收。
const source = fs.readFileSync('cloudfunctions/plant-user-http/read-http.js', 'utf8')

assert.match(
  source,
  /function readQaPerformanceProbeId\(headers = \{\}\)[\s\S]*x-qa-performance-probe-id/u,
  '列表读取必须只接受格式受限的 QA 探针 ID'
)
assert.match(
  source,
  /console\.log\('qa-performance-timing', JSON\.stringify\(\{ probeId, marks \}\)\)/u,
  '列表读取必须将 QA 打点交给 CloudBase 日志关联'
)
assert.match(
  source,
  /qa-performance-probe[\s\S]*plant-user-http\/user-plants/u,
  '轻量列表读取必须为 QA 探针写出可关联的非敏感日志标记'
)
assert.match(
  source,
  /timing\?\.mark\('identity-ready', \{ source: identity\.source \|\| '' \}\)/u,
  '打点只能记录身份来源，不得记录身份值'
)
assert.match(
  source,
  /timing\?\.mark\('list-sql-ready', \{ row_count: rows\.length \}\)/u,
  '打点必须记录列表 SQL 的完成阶段和非敏感行数'
)
assert.match(
  source,
  /finally \{\s*timing\?\.flush\(\)\s*\}/u,
  '无论列表读取成功或失败，带探针请求都必须写出完整耗时轨迹'
)

console.log(
  'plant user read QA timing contract passed data_mode=unit_fake test_kind=source_contract'
)
