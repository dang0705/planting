/** 官方类型以ESM声明，但运行时提供CommonJS入口；只改变加载接线，不改变计算。 */
type SunCalcModule = typeof import('suncalc', { with: { 'resolution-mode': 'import' } })
/** 运行时使用已验证的require导出，类型仍来自锁定包的官方声明。 */
const { getPosition } = require('suncalc') as SunCalcModule

/** 明确地点与绝对时刻，不依赖天气强度或默认城市。 */
export interface SunCalcDirectionInput {
  /** UTC 安全整数毫秒；须能表示有效 Date。 */
  readonly atMs: number
  /** 北纬为正，单位度，范围 [-90,90]。 */
  readonly latitudeDeg: number
  /** 东经为正，单位度，范围 [-180,180]。 */
  readonly longitudeDeg: number
}

/** 版本明确的太阳视方向；不伪装成实测或未折射几何方向。 */
export interface SunCalcDirectionResult extends SunCalcDirectionInput {
  /** 精确依赖版本；不等于已发布 Care 算法版本。 */
  readonly method: 'suncalc@2.1.0'
  /** 确定性天文模型估算，不是现场测量。 */
  readonly evidenceKind: 'model_estimate'
  /** 视高度定义，必须与未来完整时段算法一致。 */
  readonly elevationDefinition: 'apparent_refraction_corrected'
  /** 北起顺时针度，不能重复应用旧版转换。 */
  readonly azimuthDefinition: 'north_clockwise_degrees'
  /** SunCalc 折射校正太阳高度，单位度；夜间允许负值。 */
  readonly apparentElevationDeg: number
  /** 北起顺时针方位角，单位度，范围 [0,360)。 */
  readonly azimuthDeg: number
}

/**
 * 本地 SunCalc 太阳方向派生，无网络、持久化或建议副作用。
 * 不使用 NOAA 专属中间字段、变化率或误差承诺。
 */
export function deriveSunCalcDirection(input: SunCalcDirectionInput): SunCalcDirectionResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('缺少太阳方向计算输入')
  }
  if (!Number.isSafeInteger(input.atMs)) {
    throw new RangeError('太阳计算时刻非法')
  }
  const date = new Date(input.atMs)
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('太阳计算时刻不可表示')
  }
  if (!Number.isFinite(input.latitudeDeg) || input.latitudeDeg < -90 || input.latitudeDeg > 90
    || !Number.isFinite(input.longitudeDeg) || input.longitudeDeg < -180 || input.longitudeDeg > 180) {
    throw new RangeError('太阳计算地点非法')
  }
  const position = getPosition(date, input.latitudeDeg, input.longitudeDeg)
  if (!Number.isFinite(position.altitude) || !Number.isFinite(position.azimuth)
    || position.azimuth < 0 || position.azimuth >= 360) {
    throw new RangeError('太阳模型返回无效方向')
  }
  return {
    atMs: input.atMs,
    latitudeDeg: input.latitudeDeg,
    longitudeDeg: input.longitudeDeg,
    method: 'suncalc@2.1.0',
    evidenceKind: 'model_estimate',
    elevationDefinition: 'apparent_refraction_corrected',
    azimuthDefinition: 'north_clockwise_degrees',
    apparentElevationDeg: position.altitude,
    azimuthDeg: position.azimuth
  }
}
