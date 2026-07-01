'use strict'

/**
 * 盆型几何计算模块 —— 浇水提醒算法 v2.1。
 *
 * 从盆器尺寸（盆口/盆底直径、盆高、排水孔、材质、基质）推导几何因子，
 * 用于水合负载衰减速率、排水风险和水量建议的量化基础。
 *
 * 纯函数，无 DB、无外部 IO。
 */

const PI = Math.PI

/**
 * 排水孔枚举
 */
const DRAINAGE_HOLE = Object.freeze({
  TRUE: 'true',
  FALSE: 'false',
  UNKNOWN: 'unknown'
})

/**
 * 盆器材质枚举
 */
const POT_MATERIAL = Object.freeze({
  PLASTIC: 'plastic',
  CERAMIC: 'ceramic',
  TERRACOTTA: 'terracotta',
  GLAZED: 'glazed',
  UNKNOWN: 'unknown'
})

/**
 * 基质类型枚举
 */
const SUBSTRATE_TYPE = Object.freeze({
  GENERAL: 'general',
  PEAT: 'peat',
  COCO: 'coco',
  BARK: 'bark',
  SPHAGNUM: 'sphagnum',
  GRITTY: 'gritty',
  PERLITE: 'perlite',
  CERAMSITE: 'ceramsite',
  COARSE_SAND: 'coarse_sand',
  UNKNOWN: 'unknown'
})

/**
 * 材质对蒸发的影响因子（越高蒸发越快）
 */
const MATERIAL_EVAPORATION_FACTOR = Object.freeze({
  plastic: 0.85,
  ceramic: 1.0,
  terracotta: 1.35,
  glazed: 0.75,
  unknown: 1.0
})

/**
 * 基质对保水的影响因子（越高保水越强）
 */
const SUBSTRATE_RETENTION_FACTOR = Object.freeze({
  general: 1.0,
  peat: 1.3,
  coco: 1.2,
  bark: 0.7,
  sphagnum: 1.4,
  gritty: 0.5,
  perlite: 0.4,
  ceramsite: 0.5,
  coarse_sand: 0.4,
  unknown: 1.0
})

/**
 * 从原始输入解析数值，容错 null/空串/非数字。
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

/**
 * 归一化排水孔字段为枚举值。
 */
function normalizeDrainageHole(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === '有' || raw === 'true') {
    return DRAINAGE_HOLE.TRUE
  }
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === '无' || raw === 'false') {
    return DRAINAGE_HOLE.FALSE
  }
  return DRAINAGE_HOLE.UNKNOWN
}

/**
 * 归一化盆器材质。
 */
function normalizePotMaterial(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (Object.values(POT_MATERIAL).includes(raw)) {
    return raw
  }
  return POT_MATERIAL.UNKNOWN
}

/**
 * 归一化基质类型。
 */
function normalizeSubstrateType(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (Object.values(SUBSTRATE_TYPE).includes(raw)) {
    return raw
  }
  return SUBSTRATE_TYPE.UNKNOWN
}

/**
 * 解析基质保水因子，支持单值枚举或 JSON 数组字符串（多选+比例）。
 * JSON 数组元素形如 { material, ratio }（ratio 为百分数）；按 ratio 加权平均各 material 因子。
 * 非法 JSON / 空 / 权重和为 0 → 1.0 基线。
 */
function resolveSubstrateRetentionFactor(substrateType) {
  const raw = String(substrateType ?? '').trim()
  if (raw.startsWith('[')) {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return 1.0
    }
    if (!Array.isArray(parsed) || !parsed.length) {
      return 1.0
    }
    let weightSum = 0
    let factorSum = 0
    for (const item of parsed) {
      const material = normalizeSubstrateType(item?.material)
      const ratio = Number(item?.ratio)
      if (!Number.isFinite(ratio) || ratio <= 0) {
        continue
      }
      const factor = SUBSTRATE_RETENTION_FACTOR[material] ?? 1.0
      weightSum += ratio
      factorSum += factor * ratio
    }
    return weightSum > 0 ? factorSum / weightSum : 1.0
  }
  const single = normalizeSubstrateType(raw)
  return SUBSTRATE_RETENTION_FACTOR[single] ?? 1.0
}

/**
 * 计算截锥体体积（cm³ = ml）。
 *
 * V = (π * h / 3) * (R² + R*r + r²)
 *
 * 其中 R 为盆口半径，r 为盆底半径，h 为盆高。
 * 当上下口径相同时退化为圆柱体 V = π * r² * h。
 *
 * @param {number} topRadiusCm - 盆口半径 cm
 * @param {number} bottomRadiusCm - 盆底半径 cm
 * @param {number} heightCm - 盆高 cm
 * @returns {number} 体积 ml
 */
function truncatedConeVolumeMl(topRadiusCm, bottomRadiusCm, heightCm) {
  return (PI * heightCm / 3) * (topRadiusCm ** 2 + topRadiusCm * bottomRadiusCm + bottomRadiusCm ** 2)
}

/**
 * 圆面积 cm²。
 */
function circleAreaCm2(radiusCm) {
  return PI * radiusCm ** 2
}

/**
 * 从盆型档案计算全部几何因子。
 *
 * @param {object} potProfile - 盆型档案
 * @param {number} [potProfile.potTopDiameterCm] - 盆口直径 cm
 * @param {number} [potProfile.potBottomDiameterCm] - 盆底直径 cm
 * @param {number} [potProfile.potHeightCm] - 盆高 cm
 * @param {string} [potProfile.hasDrainageHole] - 排水孔 'true'/'false'/'unknown'
 * @param {string} [potProfile.potMaterial] - 盆器材质
 * @param {string} [potProfile.substrateType] - 基质类型
 * @returns {object} 几何因子集合
 */
function computePotGeometry(potProfile = {}) {
  const topDiameterCm = toNumber(potProfile.potTopDiameterCm ?? potProfile.pot_top_diameter_cm)
  const bottomDiameterCm = toNumber(potProfile.potBottomDiameterCm ?? potProfile.pot_bottom_diameter_cm)
  const hasDrainageHole = normalizeDrainageHole(
    potProfile.hasDrainageHole ?? potProfile.has_drainage_hole
  )
  const potMaterial = normalizePotMaterial(potProfile.potMaterial ?? potProfile.pot_material)
  const substrateType = normalizeSubstrateType(potProfile.substrateType ?? potProfile.substrate_type)

  // 若仅提供一个直径，视为上下口径相同
  const resolvedTopDiameter = topDiameterCm ?? bottomDiameterCm
  const resolvedBottomDiameter = bottomDiameterCm ?? topDiameterCm

  // 缺少直径时无法计算几何
  if (resolvedTopDiameter === undefined || resolvedBottomDiameter === undefined) {
    return buildEmptyGeometry(hasDrainageHole, potMaterial, substrateType)
  }

  const topRadiusCm = resolvedTopDiameter / 2
  const bottomRadiusCm = resolvedBottomDiameter / 2
  const averageDiameterCm = (resolvedTopDiameter + resolvedBottomDiameter) / 2

  // 盆高缺失时按 averageDiameterCm * 0.85 估算，并降低置信度
  let potHeightCm = toNumber(potProfile.potHeightCm ?? potProfile.pot_height_cm)
  let heightEstimated = false
  if (potHeightCm === undefined) {
    potHeightCm = Math.round(averageDiameterCm * 0.85 * 100) / 100
    heightEstimated = true
  }

  const topSurfaceAreaCm2 = circleAreaCm2(topRadiusCm)
  const bottomSurfaceAreaCm2 = circleAreaCm2(bottomRadiusCm)
  const potVolumeMl = truncatedConeVolumeMl(topRadiusCm, bottomRadiusCm, potHeightCm)

  // 有效深度：体积 / 平均截面积
  const averageSurfaceAreaCm2 = (topSurfaceAreaCm2 + bottomSurfaceAreaCm2) / 2
  const effectiveDepthCm = averageSurfaceAreaCm2 > 0 ? potVolumeMl / averageSurfaceAreaCm2 : potHeightCm

  // 表面蒸发面积与体积比（越高蒸发越快）
  const surfaceToVolumeRatio = potVolumeMl > 0 ? topSurfaceAreaCm2 / potVolumeMl : 0

  // 锥度比（>1 表示上宽下窄）
  const taperRatio = resolvedBottomDiameter > 0 ? resolvedTopDiameter / resolvedBottomDiameter : 1

  // 材质蒸发因子
  const materialEvaporationFactor = MATERIAL_EVAPORATION_FACTOR[potMaterial] ?? 1.0

  // 基质保水因子（支持单值或 JSON 数组多选按比例加权）
  const substrateRetentionFactor = resolveSubstrateRetentionFactor(
    potProfile.substrateType ?? potProfile.substrate_type
  )

  // 表面蒸发因子：S/V 比越高、材质蒸发越强 → 蒸发贡献越大
  const surfaceEvaporationFactor = Math.min(2.0, surfaceToVolumeRatio * 10 * materialEvaporationFactor)

  // 深度保水因子：盆越深、基质保水越强 → 深层保水越好
  const depthRetentionFactor = Math.min(2.0, (effectiveDepthCm / 10) * substrateRetentionFactor)

  // 盆型几何干透因子：蒸发/保水比，越高干透越快
  const potGeometryDryDownFactor = Math.max(0.3, Math.min(3.0, surfaceEvaporationFactor / depthRetentionFactor))

  // 排水风险因子：无排水孔 + 窄底 → 风险高
  let drainageRiskFactor = 0.2
  if (hasDrainageHole === DRAINAGE_HOLE.FALSE) {
    drainageRiskFactor = 0.8
    if (taperRatio > 1.3) {
      drainageRiskFactor += 0.3 * Math.min(1, (taperRatio - 1.3) / 0.7)
    }
  } else if (hasDrainageHole === DRAINAGE_HOLE.UNKNOWN) {
    drainageRiskFactor = 0.5
  }
  drainageRiskFactor = Math.min(1.5, drainageRiskFactor)

  // 体积置信度
  let volumeConfidence = 'high'
  if (heightEstimated) {
    volumeConfidence = 'low'
  } else if (topDiameterCm === undefined || bottomDiameterCm === undefined) {
    volumeConfidence = 'low'
  } else if (hasDrainageHole === DRAINAGE_HOLE.UNKNOWN) {
    volumeConfidence = 'normal'
  }

  return {
    potTopDiameterCm: resolvedTopDiameter,
    potBottomDiameterCm: resolvedBottomDiameter,
    potHeightCm,
    heightEstimated,
    hasDrainageHole,
    potMaterial,
    substrateType,
    substrateRetentionFactor: Math.round(substrateRetentionFactor * 100) / 100,
    potVolumeMl: Math.round(potVolumeMl),
    topSurfaceAreaCm2: Math.round(topSurfaceAreaCm2 * 100) / 100,
    bottomSurfaceAreaCm2: Math.round(bottomSurfaceAreaCm2 * 100) / 100,
    effectiveDepthCm: Math.round(effectiveDepthCm * 100) / 100,
    surfaceToVolumeRatio: Math.round(surfaceToVolumeRatio * 1000) / 1000,
    taperRatio: Math.round(taperRatio * 100) / 100,
    surfaceEvaporationFactor: Math.round(surfaceEvaporationFactor * 100) / 100,
    depthRetentionFactor: Math.round(depthRetentionFactor * 100) / 100,
    potGeometryDryDownFactor: Math.round(potGeometryDryDownFactor * 100) / 100,
    drainageRiskFactor: Math.round(drainageRiskFactor * 100) / 100,
    volumeConfidence
  }
}

function buildEmptyGeometry(hasDrainageHole, potMaterial, substrateType) {
  return {
    potTopDiameterCm: undefined,
    potBottomDiameterCm: undefined,
    potHeightCm: undefined,
    heightEstimated: false,
    hasDrainageHole,
    potMaterial,
    substrateType,
    substrateRetentionFactor: SUBSTRATE_RETENTION_FACTOR[substrateType] ?? 1.0,
    potVolumeMl: 0,
    topSurfaceAreaCm2: 0,
    bottomSurfaceAreaCm2: 0,
    effectiveDepthCm: 0,
    surfaceToVolumeRatio: 0,
    taperRatio: 1,
    surfaceEvaporationFactor: 1.0,
    depthRetentionFactor: 1.0,
    potGeometryDryDownFactor: 1.0,
    // 无盆型信息时按有排水孔基线处理，避免虚假放大湿压
    drainageRiskFactor: 0.2,
    volumeConfidence: 'low'
  }
}

module.exports = {
  computePotGeometry,
  normalizeDrainageHole,
  normalizePotMaterial,
  normalizeSubstrateType,
  resolveSubstrateRetentionFactor,
  DRAINAGE_HOLE,
  POT_MATERIAL,
  SUBSTRATE_TYPE
}
