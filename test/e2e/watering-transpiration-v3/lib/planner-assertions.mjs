'use strict'

/**
 * Planner 响应字段断言 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 断言 /user-plants/watering-planner 响应保留现有浇水规划字段
 *   - 断言 v3 蒸腾审计字段存在（精确字段名）
 *   - shadow 模式下 intervalFactor=1.0、shadow=true
 *   - active 模式下 intervalFactor 在 [0.8, 1.2]
 *   - 蒸腾不改变 amountRangeMl，不绕过 WET/DRY Gate
 *
 * 不复制业务公式；只做字段存在性与值域断言。
 */

import { recordAssertion } from './reporter.mjs'

const VALID_WATERING_CONTEXTS = ['BASELINE', 'WET', 'DRY']

const EXPECTED_EXISTING_FIELDS = [
  'planId',
  'nextWaterDate',
  'nextWaterWindow',
  'nextWaterReason',
  'wateringContext',
  'action',
  'amountRangeMl',
  'confidenceLevel',
  'reasonCodes'
]

const TRANSPRATION_AUDIT_FIELDS = [
  'transpirationIntervalFactor',
  'transpirationShadow',
  'transpirationComputedFactor',
  'transpirationCandidateNextWaterDate',
  'transpirationCandidateNextWaterWindow'
]

/**
 * 断言 planner 响应字段。
 *
 * @param {object} report - 报告对象
 * @param {object} plannerRequest - 捕获的 planner 请求
 * @param {string} mode - shadow | active
 * @returns {Promise<boolean>} 响应是否通过基本结构断言
 */
export async function assertPlannerResponse(report, plannerRequest, mode) {
  const response = plannerRequest.response
  const responseData = response?.data
  const responseOk =
    response?.statusCode === 200 && responseData && typeof responseData === 'object'

  recordAssertion(
    report,
    'planner 响应 statusCode=200 且 data 为对象',
    responseOk,
    `statusCode=${response?.statusCode}, dataType=${typeof responseData}`
  )
  if (!responseOk) return false

  const data = responseData.data || responseData
  if (!data || typeof data !== 'object') {
    recordAssertion(report, 'planner 响应包含 data 对象', false, `data=${JSON.stringify(data)}`)
    return false
  }

  // 断言响应保留现有浇水规划字段
  for (const field of EXPECTED_EXISTING_FIELDS) {
    recordAssertion(
      report,
      `响应保留现有字段 ${field}`,
      field in data,
      field in data ? 'present' : 'missing'
    )
  }

  // 断言 v3 蒸腾审计字段存在（精确字段名）
  for (const field of TRANSPRATION_AUDIT_FIELDS) {
    recordAssertion(
      report,
      `响应包含 v3 蒸腾字段 ${field}`,
      field in data,
      field in data ? `value=${JSON.stringify(data[field])}` : 'missing'
    )
  }

  // shadow 模式下生效系数必须为 1.0
  if (mode === 'shadow') {
    const factorIsOne = data.transpirationIntervalFactor === 1.0
    recordAssertion(
      report,
      'shadow 模式下 transpirationIntervalFactor === 1.0',
      factorIsOne,
      `actual=${data.transpirationIntervalFactor}`
    )
    const shadowFlag = data.transpirationShadow === true
    recordAssertion(
      report,
      'shadow 模式下 transpirationShadow === true',
      shadowFlag,
      `actual=${data.transpirationShadow}`
    )
  }

  // active 模式下允许蒸腾系数影响 BASELINE 间隔
  if (mode === 'active') {
    const factorInRange =
      typeof data.transpirationIntervalFactor === 'number' &&
      data.transpirationIntervalFactor >= 0.8 &&
      data.transpirationIntervalFactor <= 1.2
    recordAssertion(
      report,
      'active 模式下 transpirationIntervalFactor 在 [0.8, 1.2] 范围内',
      factorInRange,
      `actual=${data.transpirationIntervalFactor}`
    )
  }

  // 蒸腾不得改变 amountRangeMl（字段存在性断言，不重算公式）
  recordAssertion(
    report,
    '响应包含 amountRangeMl（蒸腾不改变单次毫升数）',
    'amountRangeMl' in data,
    `value=${JSON.stringify(data.amountRangeMl)}`
  )

  // 蒸腾不得绕过 WET/DRY Gate
  const contextValid = VALID_WATERING_CONTEXTS.includes(data.wateringContext)
  recordAssertion(
    report,
    'wateringContext 为 BASELINE/WET/DRY 之一（蒸腾不绕过 Gate）',
    contextValid,
    `actual=${data.wateringContext}`
  )
  if (data.wateringContext === 'WET') {
    recordAssertion(
      report,
      'WET 状态下 nextWaterDate 为 null（蒸腾不绕过湿润保护）',
      data.nextWaterDate === null,
      `actual=${JSON.stringify(data.nextWaterDate)}`
    )
  }

  return true
}
