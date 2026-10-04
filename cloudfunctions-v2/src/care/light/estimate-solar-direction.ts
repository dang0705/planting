/** 地点与UTC时刻；不接受机器默认时区或隐式地点。 */
export interface SolarDirectionInput {
  /** 安全整数UTC毫秒时刻。 */
  readonly atMs: number
  /** 北纬为正，度，范围[-90,90]。 */
  readonly latitudeDeg: number
  /** 东经为正，度，范围[-180,180]。 */
  readonly longitudeDeg: number
}

/** NOAA通用公式的离线近似结果；不承诺现场精度。 */
export interface SolarDirectionEstimate {
  /** 原计算时刻，用于严格同刻窗面投影。 */
  readonly atMs: number
  /** 固定数学方法标签，不等于生产release。 */
  readonly method: 'noaa_general_solar_position'
  /** 模型估算，不是现场观测。 */
  readonly evidenceKind: 'model_estimate'
  /** 时间方程，分钟；区分钟表时与太阳时。 */
  readonly equationOfTimeMinutes: number
  /** 赤纬，弧度，来自年内角近似。 */
  readonly declinationRad: number
  /** 当前地点真太阳时，规范到[0,1440)分钟。 */
  readonly trueSolarTimeMinutes: number
  /** 太阳时角，度，正午为0。 */
  readonly hourAngleDeg: number
  /** 几何太阳高度，度，未加入折射或太阳盘半径。 */
  readonly elevationDeg: number
  /** 真北起顺时针方位，度；天顶/天底未定义时为null。 */
  readonly azimuthDeg: number | null
}

/** NOAA通用公式；UTC时间项避免重复应用地点时区偏移。 */
export function estimateSolarDirection(input: SolarDirectionInput): SolarDirectionEstimate {
  if (!Number.isSafeInteger(input.atMs)) { throw new Error('太阳计算时刻非法') }
  const date = new Date(input.atMs)
  if (!Number.isFinite(date.getTime())) { throw new Error('太阳计算时刻非法') }
  if (!Number.isFinite(input.latitudeDeg) || input.latitudeDeg < -90 || input.latitudeDeg > 90
    || !Number.isFinite(input.longitudeDeg) || input.longitudeDeg < -180 || input.longitudeDeg > 180) {
    throw new Error('太阳计算位置非法')
  }
  const year = date.getUTCFullYear()
  const daysInYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365
  const yearStart = new Date(input.atMs)
  // 使用现有Date保留公历年，避免Date.UTC对0至99年的隐式1900年偏移。
  yearStart.setUTCMonth(0, 1)
  yearStart.setUTCHours(0, 0, 0, 0)
  if (!Number.isFinite(yearStart.getTime())) { throw new Error('太阳计算时刻的年初不可表示') }
  const elapsedDays = (input.atMs - yearStart.getTime()) / 86_400_000
  const gamma = 2 * Math.PI / daysInYear * (elapsedDays - 0.5)
  // NOAA固定公式系数，不是可调的养护倍率或运行参数。
  const equationOfTimeMinutes = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))
  const declinationRad = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)
  const clockMinutes = date.getUTCHours() * 60 + date.getUTCMinutes()
    + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60_000
  const unwrappedSolarTime = clockMinutes + equationOfTimeMinutes + 4 * input.longitudeDeg
  const trueSolarTimeMinutes = ((unwrappedSolarTime % 1440) + 1440) % 1440
  const hourAngleDeg = trueSolarTimeMinutes / 4 - 180
  const radiansPerDegree = Math.PI / 180
  const latitude = input.latitudeDeg * radiansPerDegree
  const hourAngle = hourAngleDeg * radiansPerDegree
  // 东、北、上分量保留上午/下午象限，不能仅用acos求方位。
  const east = -Math.cos(declinationRad) * Math.sin(hourAngle)
  const north = Math.cos(latitude) * Math.sin(declinationRad)
    - Math.sin(latitude) * Math.cos(declinationRad) * Math.cos(hourAngle)
  const up = Math.sin(latitude) * Math.sin(declinationRad)
    + Math.cos(latitude) * Math.cos(declinationRad) * Math.cos(hourAngle)
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, up))) / radiansPerDegree
  const azimuthDeg = Math.abs(up) >= 1 ? null : ((Math.atan2(east, north) / radiansPerDegree) + 360) % 360
  return { atMs: input.atMs, method: 'noaa_general_solar_position', evidenceKind: 'model_estimate',
    equationOfTimeMinutes, declinationRad, trueSolarTimeMinutes, hourAngleDeg, elevationDeg, azimuthDeg }
}
