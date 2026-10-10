import { normalizeOpenMeteoRadiation, type NormalizedOutdoorRadiation } from '../light/normalize-open-meteo-radiation.js'
import { fetchOpenMeteoRadiation, type OpenMeteoClientDependencies, type OpenMeteoRadiationQuery } from './open-meteo-radiation-client.js'

/** 结构化告警日志最小接口（pino 兼容）；只接收事件对象与中文消息。 */
export interface ProviderWarnLogger {
  /** 记录一条告警；对象只含事件名、Provider 名与稳定原因码，不含用户数据。 */
  warn(event: ProviderUnavailableWarnEvent, message: string): void
}

/** Provider 不可用告警事件：只含事件名、Provider 名与稳定原因码。 */
export interface ProviderUnavailableWarnEvent {
  /** 事件名，固定为 Provider 不可用。 */
  readonly event: 'provider_unavailable'
  /** 出问题的第三方 Provider，当前只有 Open-Meteo。 */
  readonly provider: 'open_meteo'
  /** 稳定的失败原因码，不含用户数据与原始响应。 */
  readonly reason: string
}

/** 组装依赖：真实 fetch、时钟、总时限与日志。 */
export interface OpenMeteoRadiationFetcherDependencies extends OpenMeteoClientDependencies {
  /** 失败时写结构化告警。 */
  readonly logger: ProviderWarnLogger
}

/**
 * care 入口使用的辐射获取适配器：请求 Open-Meteo → 标准化为逐时段区间。
 * 失败（网络、超时、HTTP、响应非法、标准化失败）返回 null 并记一条只含原因码的 warn，调用方按缺段处理。
 */
export function createOpenMeteoRadiationFetcher(dependencies: OpenMeteoRadiationFetcherDependencies): (query: OpenMeteoRadiationQuery) => Promise<NormalizedOutdoorRadiation | null> {
  return async query => {
    const fetched = await fetchOpenMeteoRadiation(dependencies, query)
    if (fetched.status !== 'ok') {
      dependencies.logger.warn({ event: 'provider_unavailable', provider: 'open_meteo', reason: fetched.reason }, 'Open-Meteo 不可用')
      return null
    }
    try {
      return normalizeOpenMeteoRadiation(fetched.raw, { series: 'hourly', sourceRef: 'open_meteo_forecast_v1', fetchedAtMs: fetched.fetchedAtMs })
    } catch {
      dependencies.logger.warn({ event: 'provider_unavailable', provider: 'open_meteo', reason: 'normalize_failed' }, 'Open-Meteo 响应不可用')
      return null
    }
  }
}
