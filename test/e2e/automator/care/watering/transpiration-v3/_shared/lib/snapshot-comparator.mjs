'use strict'

/**
 * Shadow/Active 跨运行 snapshot 对比 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - shadow 运行保存 comparator snapshot（完整请求 canonical SHA-256 + planner 响应关键字段）
 *   - active 运行加载相容的 shadow snapshot，跨两次 LAN 运行形成可比较证据
 *   - active 必须验证：同一植物、相同完整输入签名 hash、amountRangeMl 深度相等、
 *     active intervalFactor 等于 shadow computedFactor、BASELINE 日期对齐、WET/DRY 保护不绕过
 *
 * 关键修复（P0-4）：
 *   - 对脱敏后的完整 planner 业务请求体生成 canonical JSON + SHA-256 输入签名
 *   - 对象 key 排序，数组保持业务顺序
 *   - areSnapshotsCompatible 比较完整 hash，不再只比较 plantId/date/url
 *
 * 不复制业务公式；只做字段提取与深度比较。不保存敏感值。
 */

import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

const SNAPSHOT_FILENAME = 'shadow-snapshot.json'

/**
 * 对脱敏后的值生成 canonical JSON（对象 key 递归排序，数组保持业务顺序）。
 */
export function canonicalize(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']'
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}'
  }
  return JSON.stringify(String(value))
}

/**
 * 对脱敏后的完整 planner 请求体生成 SHA-256 输入签名。
 *
 * 签名覆盖：
 *   - urlPath（去掉 query string）
 *   - method
 *   - 请求 data 的完整 canonical JSON（已脱敏，含 plantId/referenceDate/wateringEvents/weatherDays/forecastDays）
 *
 * @param {object} plannerRequest - 捕获的 planner 请求（已脱敏）
 * @returns {{hash: string, canonical: string, urlPath: string, plantId: any, referenceDate: any}}
 */
export function buildCanonicalHash(plannerRequest) {
  const urlPath = String(plannerRequest.url || '').split('?')[0]
  const method = String(plannerRequest.method || 'GET').toUpperCase()
  const reqData = plannerRequest.data ?? null
  const canonical = canonicalize({
    urlPath,
    method,
    data: reqData
  })
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')
  return {
    hash,
    canonical,
    urlPath,
    method,
    plantId: reqData?.plantId ?? null,
    referenceDate: reqData?.referenceDate ?? null,
    wateringEventsCount: Array.isArray(reqData?.wateringEvents) ? reqData.wateringEvents.length : 0,
    weatherDaysCount: Array.isArray(reqData?.weatherDays) ? reqData.weatherDays.length : 0,
    forecastDaysCount: Array.isArray(reqData?.forecastDays) ? reqData.forecastDays.length : 0
  }
}

/**
 * 从 planner 请求/响应构建稳定输入签名摘要（用于报告展示，不含敏感值）。
 * 完整比较使用 buildCanonicalHash 返回的 hash。
 */
export function buildInputSignature(plannerRequest) {
  const sig = buildCanonicalHash(plannerRequest)
  return {
    hash: sig.hash,
    urlPath: sig.urlPath,
    method: sig.method,
    plantId: sig.plantId,
    referenceDate: sig.referenceDate,
    wateringEventsCount: sig.wateringEventsCount,
    weatherDaysCount: sig.weatherDaysCount,
    forecastDaysCount: sig.forecastDaysCount
  }
}

/**
 * 从 planner 响应构建比较 snapshot。
 */
export function buildResponseSnapshot(plannerRequest) {
  const data = plannerRequest?.response?.data?.data || plannerRequest?.response?.data
  if (!data || typeof data !== 'object') return null
  const sig = buildCanonicalHash(plannerRequest)
  return {
    plantId: plannerRequest.data?.plantId ?? null,
    inputHash: sig.hash,
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
 * 检查两个 snapshot 是否相容（完整输入签名 hash 相同）。
 *
 * 关键修复（P0-4）：比较完整 canonical SHA-256 hash，不再只比较 plantId/date/url。
 * 天气或浇水事件变化时会被判为不兼容。
 */
export function areSnapshotsCompatible(shadowSnapshot, activeSnapshot) {
  if (!shadowSnapshot || !activeSnapshot) return false
  // 完整输入签名 hash 必须一致
  if (shadowSnapshot.inputHash !== activeSnapshot.inputHash) return false
  // plantId 也必须一致（双重保险）
  if (shadowSnapshot.plantId !== activeSnapshot.plantId) return false
  return true
}

/**
 * 深度比较两个值是否相等。
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
 */
export function compareShadowVsActive(shadowSnapshot, activeSnapshot) {
  const assertions = []

  // 1. 完整输入签名 hash 相同（同一植物 + 相同可比输入）
  assertions.push({
    name: 'active 与 shadow 完整输入签名 hash 相同（同一植物和相同可比输入）',
    passed: areSnapshotsCompatible(shadowSnapshot, activeSnapshot),
    detail: `shadow.hash=${shadowSnapshot?.inputHash?.slice(0, 16)}..., active.hash=${activeSnapshot?.inputHash?.slice(0, 16)}...`
  })

  // 2. amountRangeMl 深度相等
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
  if (typeof computed === 'number' && Math.abs(computed - 1.0) > 0.001 && candidate !== null) {
    return true
  }
  return false
}
