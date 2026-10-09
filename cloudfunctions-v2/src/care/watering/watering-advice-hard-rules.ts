/** 一天的毫秒数；单位换算，不是业务配置。 */
const millisecondsPerDay = 86_400_000

/**
 * Open-Meteo 辐射请求回看与预报天数上限。
 * 配置目录硬规则 `care.lighting.open_meteo_request_window_days`（外部接口能力边界，不可运营配置）。
 */
export const OPEN_METEO_REQUEST_WINDOW_DAYS = Object.freeze({ maxPastDays: 92, maxForecastDays: 16 })

/**
 * MVP 浇水模型使用的 Tropicals 名义基线版本。
 * 配置目录硬规则 `care.watering.baseline_policy_version`：更换版本必须同时发布新的 care_mvp_watering 策略并重新标定。
 */
export const WATERING_BASELINE_POLICY_VERSION = 'v1'

/** Open-Meteo 查询窗口计算输入。 */
export interface OpenMeteoRequestWindowInput {
  /** 服务端可信当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 盆土观察、上次浇水、Lux 读数等证据时刻（UTC 毫秒）；缺失为 null。 */
  readonly evidenceTimesMs: readonly (number | null)[]
}

/** Open-Meteo 查询窗口。 */
export interface OpenMeteoRequestWindow {
  /** 回看天数：最早证据到当前的天数向上取整，截断到上限；无证据为 0。 */
  readonly pastDays: number
  /** 预报天数：取接口上限以尽量闭合检查窗口。 */
  readonly forecastDays: number
}

/** 裁决 5：回看起点为最早证据，截断到 92 天；预报恒取 16 天。 */
export function resolveOpenMeteoRequestWindow(input: OpenMeteoRequestWindowInput): OpenMeteoRequestWindow {
  const times = input.evidenceTimesMs.filter((value): value is number => value !== null)
  const earliest = times.length === 0 ? input.nowMs : Math.min(...times)
  const elapsedDays = Math.max(0, Math.ceil((input.nowMs - earliest) / millisecondsPerDay))
  return { pastDays: Math.min(OPEN_METEO_REQUEST_WINDOW_DAYS.maxPastDays, elapsedDays), forecastDays: OPEN_METEO_REQUEST_WINDOW_DAYS.maxForecastDays }
}
