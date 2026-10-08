/** Open-Meteo 预报端点（官方文档 https://open-meteo.com/en/docs）。 */
const forecastEndpoint = 'https://api.open-meteo.com/v1/forecast'
/** 只请求太阳辐射三个变量；普通天气由和风提供。 */
const hourlyVariables = 'shortwave_radiation,direct_normal_irradiance,diffuse_radiation'

/** 适配器依赖；fetch 与时钟由调用方注入，便于替换边界。 */
export interface OpenMeteoClientDependencies {
  /** 原生 fetch 或等价实现，必须支持 AbortSignal。 */
  readonly fetch: typeof globalThis.fetch
  /** 服务端可信 UTC 毫秒时钟，用作捕获时刻。 */
  readonly now: () => number
  /** 配置目录 open_meteo 档案的总时限（毫秒）。 */
  readonly totalDeadlineMs: number
}

/** 查询参数；坐标为地理纬度、经度（度），天数为整数。 */
export interface OpenMeteoRadiationQuery {
  /** 纬度，-90～90 度。 */
  readonly latitude: number
  /** 经度，-180～180 度。 */
  readonly longitude: number
  /** 回补过去天数，官方允许 0～92。 */
  readonly pastDays: number
  /** 预报天数，官方允许 0～16。 */
  readonly forecastDays: number
}

/** 调用结果；失败只给稳定类别，不携带错误原文。 */
export type OpenMeteoRadiationResult = {
  /** 已取得 JSON 对象响应。 */
  readonly status: 'ok'
  /** 原始响应，交给 normalizeOpenMeteoRadiation 处理。 */
  readonly raw: Record<string, unknown>
  /** 本地捕获 UTC 毫秒。 */
  readonly fetchedAtMs: number
} | {
  /** 本次没有可用数据，对应时段按缺段处理。 */
  readonly status: 'unavailable'
  /** 稳定失败类别，用于观测，不对用户展示。 */
  readonly reason: 'timeout' | 'http_error' | 'network' | 'invalid_body'
}

/** 整数且在闭区间内。 */
const integerWithin = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max
/** 有限且在闭区间内。 */
const finiteWithin = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max

/**
 * 获取植物位置的太阳辐射逐时预报（配置目录 open_meteo：免费接口、只调用 1 次、不重试）。
 * 失败不抛出，返回 unavailable；非法查询在发请求前拒绝。
 */
export async function fetchOpenMeteoRadiation(dependencies: OpenMeteoClientDependencies, query: OpenMeteoRadiationQuery): Promise<OpenMeteoRadiationResult> {
  if (!finiteWithin(query.latitude, -90, 90) || !finiteWithin(query.longitude, -180, 180)
    || !integerWithin(query.pastDays, 0, 92) || !integerWithin(query.forecastDays, 0, 16)) {
    throw new TypeError('Open-Meteo 查询参数非法')
  }
  const url = new URL(forecastEndpoint)
  url.search = new URLSearchParams({
    latitude: String(query.latitude), longitude: String(query.longitude), hourly: hourlyVariables,
    timeformat: 'unixtime', timezone: 'auto', past_days: String(query.pastDays), forecast_days: String(query.forecastDays),
  }).toString()
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, dependencies.totalDeadlineMs)
  try {
    const response = await dependencies.fetch(url.toString(), { method: 'GET', signal: controller.signal })
    if (!response.ok) { return { status: 'unavailable', reason: 'http_error' } }
    let body: unknown
    try { body = JSON.parse(await response.text()) } catch { return { status: 'unavailable', reason: timedOut ? 'timeout' : 'invalid_body' } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { return { status: 'unavailable', reason: 'invalid_body' } }
    return { status: 'ok', raw: body as Record<string, unknown>, fetchedAtMs: dependencies.now() }
  } catch {
    return { status: 'unavailable', reason: timedOut ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}
