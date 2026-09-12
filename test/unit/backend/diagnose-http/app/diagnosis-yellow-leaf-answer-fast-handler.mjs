/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  _test: { hasSubmittedEnvironmentCareInput, buildVisibleOutcome }
} = require('../../../../../cloudfunctions/diagnose-http/app/diagnosis-yellow-leaf-answer-fast-handler.js')

assert.equal(
  buildVisibleOutcome(
    { outcomeKey: 'iron_deficiency', actionProfileKey: 'action_nutrient_support_basic' },
    { todayActions: ['先核对补肥情况'], avoidActions: ['不要一次性重肥猛补'] }
  ).actionProfileKey,
  'action_nutrient_support_basic',
  '快路径问答响应必须保留建议归并主键'
)

assert.equal(
  hasSubmittedEnvironmentCareInput({
    environmentWeatherWindow: { historicalDays: [{}], forecastDays: [{}] }
  }),
  false,
  '仅天气预取不能触发完整环境计算'
)
assert.equal(
  hasSubmittedEnvironmentCareInput({ careBehaviorTimeline: { dailyRecords: [{}] } }),
  true,
  '用户提交的养护时间线必须保留完整环境计算'
)
assert.equal(
  hasSubmittedEnvironmentCareInput({ userLightContext: { naturalLightType: 'direct' } }),
  true,
  '用户提交的光照上下文必须保留完整环境计算'
)
assert.equal(
  hasSubmittedEnvironmentCareInput({
    airEnvironmentByQuestionId: { q_air: { airExchange: { source: 'window' } } }
  }),
  true,
  '用户提交的空气环境侧栏必须保留完整环境计算'
)

console.log('yellow leaf answer environment runtime gate: passed')
