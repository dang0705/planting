import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  _test
} = require('../../../../cloudfunctions/plant-user-http/watering-soil-evidence-service.js')

const isoAnalyzedAt = '2026-09-15T16:09:31.546Z'
const databaseAnalyzedAtWithoutTimezone = '2026-09-16T00:09:31'

assert.equal(
  _test.resolveEvidenceAnalyzedAt({
    analyzedAt: databaseAnalyzedAtWithoutTimezone,
    analysis: { analyzedAt: isoAnalyzedAt }
  }),
  isoAnalyzedAt,
  '必须优先使用模型记录中的带时区分析时间，不能被数据库无时区时间覆盖'
)

assert.equal(
  _test.resolveEvidenceAnalyzedAt({
    analyzedAt: databaseAnalyzedAtWithoutTimezone,
    analysis: {}
  }),
  databaseAnalyzedAtWithoutTimezone,
  '旧证据缺少标准时间时才允许回退数据库时间'
)

const publicWet = _test.toPublicSoilEvidence(
  { source: 'temporary', outcome: 'wet_hold' },
  { soilCheck: { message: '本次先不浇水。' } }
)
assert.equal(publicWet.resultText, '模型判断土表潮湿。')
assert.equal(publicWet.actionText, '强烈不建议立即浇水；如需设置日历提醒，保存前会再次确认。')

const publicMoist = _test.toPublicSoilEvidence(
  { source: 'temporary', outcome: 'moist_visible', surfaceState: 'moist' },
  { soilCheck: { message: '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。' } }
)
assert.equal(publicMoist.surfaceMoist, true)
assert.equal(publicMoist.wetHold, false)
assert.equal(publicMoist.resultText, '模型判断土表有湿度，表层尚可但盆内可能较湿。')

const publicDry = _test.toPublicSoilEvidence(
  { source: 'temporary', outcome: 'dry_trusted' },
  { soilCheck: { message: '无关提示' } }
)
assert.equal(publicDry.resultText, '模型判断土表明显干燥。')
assert.equal(publicDry.actionText, '建议尽快浇水。')

console.log('watering soil evidence timestamp tests passed')
