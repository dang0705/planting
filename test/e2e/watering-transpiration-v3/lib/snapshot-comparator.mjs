'use strict'

/**
 * Shadow/Active 跨运行 snapshot 对比 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - shadow 运行保存 comparator snapshot（稳定输入签名 + planner 响应关键字段）
 *   - active 运行加载相容的 shadow snapshot，跨两次 LAN 运行形成可比较证据
 *   - active 必须验证：同一植物、相同可比输入、amountRangeMl 深度相等、
 *     active intervalFactor 等于 shadow computedFactor、BASELINE 日期对齐、WET/DRY 保护不绕过
 *
 * 不复制业务公式；只做字段提取与深度比较。
 */

import path from 'node:path'
import fs from 'node:fs'

const SNAPSHOT_FILENAME = 'shadow-snapshot.json'

/**
 * 从 planner 请求/响应构建稳定输入签名（用于跨运行匹配同一植物和可比输入）。
 *
 * 签名包含：
 *   - 请求 URL（去掉 query string，保留路径）
 *   - 请求 data 的稳定字段（plantId、referenceDate、weatherDays 长度）
 *   - 响应的 wateringContext、amountRangeMl
 */
export function buildInputSignature(plannerRequest) {
  const url = String(plannerRequest.url || '').split('?')[0]
  const reqData = plannerRequest.data || {}
  return {
    urlPath: url,
    plantId: reqData.plantId ?? null,
    referenceDate: reqData.referenceDate ?? null,
    wateringEventsCount: Array.isArray(reqData.wateringEvents) ? reqData.wateringEvents.length : 0,
    weatherDaysCount: Array.isArray(reqData.weatherDays) ? reqData.weatherDays.length : 0,
    forecastDaysCount: Array.isArray(reqData.forecastDays) ? reqData.forecastDays.length : 0
  }
}

/**
 * 从 planner 响应构建比较 snapshot。
 */
export function buildResponseSnapshot(plannerRequest) {
  const data = plannerRequest?.response?.data?.data || plannerRequest?.response?.data
  if (!data || typeof data !== 'object') return null
  return {
    plantId: plannerRequest.data?.plantId ?? null,
    signature: buildInputSignature(plannerRequest),
    wateringContext: data.wateringContext ?? null,
    amountRangeMl: data.amountRangeMl ?? null,
    nextWaterDate: data.nextWaterDate ?? null,
    nextWaterWindow: data.nextWaterWindow ?? null,
    transpirationIntervalFactor: data.transpirationIntervalFactor ?? null,
    transpirationShadow: data.transpirationShadow ?? null,
    transpirationComputedFactor: data.transpirationComputedFactor ?? null,
    transpirationCandidateNextWaterDate: data.transpirationCandidateNextWaterDate ?? null,
    transpirationCandidateNextWaterWindow: data.transpirationCandidateNextWaterWindow ?? null
  }
}

/**
 * 保存 shadow snapshot 到 artifact 目录。
 *
 * @param {string} artifactDir
 * @param {object} snapshot - buildResponseSnapshot 返回值
 * @returns {string} snapshot 文件绝对路径
 */
export function saveShadowSnapshot(artifactDir, snapshot) {
  const filepath = path.resolve(artifactDir, SNAPSHOT_FILENAME)
  const payload = {
    type: 'shadow-baseline',
    savedAt: new Date().toISOString(),
    snapshot
  }
  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf8')
  return filepath
}

/**
 * 加载 shadow snapshot。
 *
 * @param {string} artifactDir
 * @returns {object|null} { type, savedAt, snapshot } 或 null（不存在时）
 */
export function loadShadowSnapshot(artifactDir) {
  const filepath = path.resolve(artifactDir, SNAPSHOT_FILENAME)
  if (!fs.existsSync(filepath)) return null
  try {
    const raw = fs.readFileSync(filepath, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

/**
 * 检查两个 snapshot 是否相容（同一植物、相同可比输入签名）。
 */
export function areSnapshotsCompatible(shadowSnapshot, activeSnapshot) {
  if (!shadowSnapshot || !activeSnapshot) return false
  const sigS = shadowSnapshot.signature
  const sigA = activeSnapshot.signature
  if (!sigS || !sigA) return false
  // plantId 必须一致
  if (sigS.plantId !== sigA.plantId) return false
  // referenceDate 必须一致
  if (sigS.referenceDate !== sigA.referenceDate) return false
  // URL 路径必须一致
  if (sigS.urlPath !== sigA.urlPath) return false
  return true
}

/**
 * 深度比较两个值是否相等（处理数组、对象、原始值）。
 */
export function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every(k => deepEqual(a[k], b[k]))
  }
  return false
}

/**
 * 对比 active snapshot 与 shadow baseline，返回断言结果列表。
 *
 * @param {object} shadowSnapshot - buildResponseSnapshot 返回值
 * @param {object} activeSnapshot - buildResponseSnapshot 返回值
 * @returns {Array<{name, passed, detail}>} 断言列表
 */
export function compareShadowVsActive(shadowSnapshot, activeSnapshot) {
  const assertions = []

  // 1. 同一植物和相同可比输入
  assertions.push({
    name: 'active 与 shadow 使用同一植物和相同可比输入签名',
    passed: areSnapshotsCompatible(shadowSnapshot, activeSnapshot),
    detail: `shadow.plantId=${shadowSnapshot?.plantId}, active.plantId=${activeSnapshot?.plantId}`
  })

  // 2. amountRangeMl 深度相等（蒸腾不改变单次毫升数）
  const amountEqual = deepEqual(shadowSnapshot.amountRangeMl, activeSnapshot.amountRangeMl)
  assertions.push({
    name: 'active amountRangeMl 与 shadow 深度相等（蒸腾不改变毫升数）',
    passed: amountEqual,
    detail: `shadow=${JSON.stringify(shadowSnapshot.amountRangeMl)}, active=${JSON.stringify(
      activeSnapshot.amountRangeMl
    )}`
  })

  // 3. active transpirationIntervalFactor 等于 shadow transpirationComputedFactor
  const activeFactor = activeSnapshot.transpirationIntervalFactor
  const shadowComputed = shadowSnapshot.transpirationComputedFactor
  const factorMatches =
    typeof activeFactor === 'number' &&
    typeof shadowComputed === 'number' &&
    Math.abs(activeFactor - shadowComputed) < 0.001
  assertions.push({
    name: 'active transpirationIntervalFactor 等于 shadow transpirationComputedFactor',
    passed: factorMatches,
    detail: `active.intervalFactor=${activeFactor}, shadow.computedFactor=${shadowComputed}`
  })

  // 4. BASELINE 且 computedFactor 有实际修正时，active 日期/窗口与 shadow candidate 对齐
  if (
    shadowSnapshot.wateringContext === 'BASELINE' &&
    shadowSnapshot.transpirationComputedFactor !== null &&
    Math.abs(shadowSnapshot.transpirationComputedFactor - 1.0) > 0.001
  ) {
    // 有实际修正：active nextWaterDate 应等于 shadow candidateNextWaterDate
    const dateAligned =
      activeSnapshot.nextWaterDate === shadowSnapshot.transpirationCandidateNextWaterDate
    assertions.push({
      name: 'BASELINE + computedFactor!=1.0 时 active nextWaterDate 对齐 shadow candidate',
      passed: dateAligned,
      detail: `active.nextWaterDate=${activeSnapshot.nextWaterDate}, shadow.candidateNextWaterDate=${shadowSnapshot.transpirationCandidateNextWaterDate}`
    })
    const windowAligned =
      activeSnapshot.nextWaterWindow === shadowSnapshot.transpirationCandidateNextWaterWindow
    assertions.push({
      name: 'BASELINE + computedFactor!=1.0 时 active nextWaterWindow 对齐 shadow candidate',
      passed: windowAligned,
      detail: `active.nextWaterWindow=${activeSnapshot.nextWaterWindow}, shadow.candidateNextWaterWindow=${shadowSnapshot.transpirationCandidateNextWaterWindow}`
    })
  } else if (shadowSnapshot.wateringContext === 'BASELINE') {
    // computedFactor=1.0：无实际修正，active 日期应等于 shadow 日期
    const dateSame = activeSnapshot.nextWaterDate === shadowSnapshot.nextWaterDate
    assertions.push({
      name: 'BASELINE + computedFactor=1.0 时 active nextWaterDate 等于 shadow',
      passed: dateSame,
      detail: `active=${activeSnapshot.nextWaterDate}, shadow=${shadowSnapshot.nextWaterDate}`
    })
  }

  // 5. WET/DRY 时 context 和保护结果不因蒸腾被绕过
  if (shadowSnapshot.wateringContext === 'WET') {
    const wetPreserved = activeSnapshot.wateringContext === 'WET'
    const dateNull = activeSnapshot.nextWaterDate === null
    assertions.push({
      name: 'WET 时 active context 仍为 WET 且 nextWaterDate=null（不绕过湿润保护）',
      passed: wetPreserved && dateNull,
      detail: `active.context=${activeSnapshot.wateringContext}, active.nextWaterDate=${activeSnapshot.nextWaterDate}`
    })
  }
  if (shadowSnapshot.wateringContext === 'DRY') {
    const dryPreserved = activeSnapshot.wateringContext === 'DRY'
    assertions.push({
      name: 'DRY 时 active context 仍为 DRY（不绕过干旱保护）',
      passed: dryPreserved,
      detail: `active.context=${activeSnapshot.wateringContext}`
    })
  }

  return assertions
}

/**
 * 判断 snapshot 是否具备可验证的蒸腾候选证据。
 * computedFactor=1.0 且无 candidate 时不作为 v3 生效证据 PASS。
 */
export function hasVerifiableTranspirationEvidence(snapshot) {
  if (!snapshot) return false
  const computed = snapshot.transpirationComputedFactor
  const candidate = snapshot.transpirationCandidateNextWaterDate
  // 有实际修正：computedFactor != 1.0 且有 candidate
  if (typeof computed === 'number' && Math.abs(computed - 1.0) > 0.001 && candidate !== null) {
    return true
  }
  return false
}
