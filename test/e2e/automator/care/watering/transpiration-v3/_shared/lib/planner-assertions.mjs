'use strict'

/**
 * Planner 响应字段断言 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 断言 /user-plants/watering-planner 响应保留现有浇水规划字段
 *   - 断言 v3 蒸腾审计字段存在（精确字段名）
 *   - 从真实响应推断后端实际运行模式（不信任脚本 --watering-transpiration-mode）
 *   - shadow 期望: transpirationShadow===true 且 intervalFactor===1.0
 *   - active 期望: transpirationShadow===false 且 intervalFactor===computedFactor（允许中性 1.0）
 *   - 若实际模式与期望模式不符，调用方应归类为 BLOCKED_ENV（LAN worker 未按对应环境变量启动），而非 FAIL_PRODUCT
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
 * @param {string} expectedMode - 期望的后端模式 shadow | active（由 CLI/env 指定，但实际模式以响应为准）
 * @returns {Promise<{structureOk: boolean, modeMismatch: boolean, actualMode: string}>}
 */
export async function assertPlannerResponse(report, plannerRequest, expectedMode) {
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
  if (!responseOk) return { structureOk: false, modeMismatch: false, actualMode: 'unknown' }

  const data = responseData.data || responseData
  if (!data || typeof data !== 'object') {
    recordAssertion(report, 'planner 响应包含 data 对象', false, `data=${JSON.stringify(data)}`)
    return { structureOk: false, modeMismatch: false, actualMode: 'unknown' }
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

  // 从真实响应推断后端实际运行模式（不信任脚本 --watering-transpiration-mode）
  const actualShadowFlag = data.transpirationShadow === true
  const actualIntervalFactor = data.transpirationIntervalFactor
  const actualComputedFactor = data.transpirationComputedFactor

  let actualMode = 'unknown'
  if (actualShadowFlag && actualIntervalFactor === 1.0) {
    actualMode = 'shadow'
  } else if (data.transpirationShadow === false) {
    actualMode = 'active'
  }

  recordAssertion(
    report,
    `真实响应模式检测: transpirationShadow=${actualShadowFlag}, intervalFactor=${actualIntervalFactor}, computedFactor=${actualComputedFactor} → 实际模式=${actualMode}`,
    true,
    `expectedMode=${expectedMode}, actualMode=${actualMode}`
  )

  // shadow 期望: transpirationShadow===true 且 intervalFactor===1.0
  if (expectedMode === 'shadow') {
    const shadowFlagOk = actualShadowFlag === true
    recordAssertion(
      report,
      'shadow 期望: transpirationShadow === true',
      shadowFlagOk,
      `actual=${data.transpirationShadow}`
    )
    const factorOk = actualIntervalFactor === 1.0
    recordAssertion(
      report,
      'shadow 期望: transpirationIntervalFactor === 1.0',
      factorOk,
      `actual=${actualIntervalFactor}`
    )
  }

  // active 期望: transpirationShadow===false 且 intervalFactor===computedFactor（允许中性 1.0）
  if (expectedMode === 'active') {
    const activeFlagOk = data.transpirationShadow === false
    recordAssertion(
      report,
      'active 期望: transpirationShadow === false',
      activeFlagOk,
      `actual=${data.transpirationShadow}`
    )
    const factorMatchesComputed =
      typeof actualIntervalFactor === 'number' &&
      typeof actualComputedFactor === 'number' &&
      Math.abs(actualIntervalFactor - actualComputedFactor) < 0.001
    recordAssertion(
      report,
      'active 期望: transpirationIntervalFactor === transpirationComputedFactor（允许中性 1.0）',
      factorMatchesComputed,
      `intervalFactor=${actualIntervalFactor}, computedFactor=${actualComputedFactor}`
    )
    const factorInRange =
      typeof actualIntervalFactor === 'number' &&
      actualIntervalFactor >= 0.8 &&
      actualIntervalFactor <= 1.2
    recordAssertion(
      report,
      'active 期望: transpirationIntervalFactor 在 [0.8, 1.2] 范围内',
      factorInRange,
      `actual=${actualIntervalFactor}`
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

  const modeMismatch = actualMode !== 'unknown' && actualMode !== expectedMode
  return { structureOk: true, modeMismatch, actualMode }
}
