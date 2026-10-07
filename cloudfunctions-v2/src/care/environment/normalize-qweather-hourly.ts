import { createHash } from 'node:crypto'

/** 和风制品取得方式；文档示例不得冒充实时API验收。 */
export type QweatherEvidenceSource = 'provider_response' | 'provider_documentation_fixture'

/** 由受控调用边界传入的真实请求上下文；本函数不读取凭证或请求网络。 */
export interface QweatherHourlyContext {
  /** 当前已核验的旧版城市逐小时接口；不混入新v1或网格接口。 */
  readonly endpoint: '/v7/weather/24h'
  /** 必须明确为公制，不能从温度值猜测单位。 */
  readonly unit: 'm'
  /** 实际请求LocationID或经度、纬度查询值，不等于植物位置。 */
  readonly requestLocation: string
  /** 实际取得制品的带时区时间，与Provider更新时间分别保存。 */
  readonly capturedAt: string
  /** 制品来自真实响应还是官方文档示例，后者不能作为实时接口验收。 */
  readonly sourceKind: QweatherEvidenceSource
}

/** 预报时刻上的温湿度证据；缺失仍保留该时刻，禁止补造小时均值。 */
export interface QweatherClimateSample {
  /** 标准UTC时刻，供后续同时间范围配对。 */
  readonly forecastTime: string
  /** 原始带时区时间，供回放核验。 */
  readonly providerForecastTime: string
  /** 公制摄氏温度；有效零度保留，缺失或非法字段明确为null。 */
  readonly temperatureC: number | null
  /** 相对湿度百分数，范围0至100；不与新版接口的比例数值混用。 */
  readonly relativeHumidityPercent: number | null
  /** 缺失或非法字段；该样本不能直接用于需要完整温湿度的计算。 */
  readonly unavailableFields: readonly ('temperature' | 'humidity')[]
}

/** 内部标准化结果，不具有新鲜度、室内实测或正式模型准入含义。 */
export interface QweatherHourlyEvidence {
  /** 标准化制品所属的和风天气来源，不授予Provider策略发布资格。 */
  readonly provider: 'qweather'
  /** 本次固定的v7城市24小时接口，不表示新版接口已经验收。 */
  readonly endpoint: '/v7/weather/24h'
  /** 温湿度始终属于室外查询地点，不能改名为室内或植物区实测。 */
  readonly spatialScope: 'outdoor'
  /** 本制品是预报证据，不是对应时刻已经发生的气候观测事实。 */
  readonly evidenceKind: 'forecast'
  /** 官方未明确瞬时／区间平均语义；下游不得自行推定为小时平均。 */
  readonly aggregation: 'unspecified'
  /** 保留真实响应与文档示例的区别，禁止由数学可用性提升来源资格。 */
  readonly sourceKind: QweatherEvidenceSource
  /** 原始JSON文本的SHA-256摘要，用于识别和回放制品，不输出原文。 */
  readonly sourceSha256: string
  /** 实际查询的LocationID或经纬度来源，不反向推断用户植物位置。 */
  readonly requestLocation: string
  /** 取得制品时刻的标准UTC表达，不等于Provider更新或预报生效时刻。 */
  readonly capturedAt: string
  /** 和风系统更新时间，不是气象模型原始发布时间。 */
  readonly providerUpdatedAt: string
  /** 按预报时刻严格递增的温湿度样本，缺字段保留且不补造连续覆盖。 */
  readonly samples: readonly QweatherClimateSample[]
}

/** 官方v7字段为数字字符串；拒绝空值、布尔、十六进制和科学计数法等未约定格式。 */
function decimal(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())) {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** 验证时间自身日历与偏移，不能让Date自动修复不存在的日期。 */
function utc(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RangeError('天气证据时间必须为带时区字符串')
  }
  const parts =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})$/.exec(
      value
    )
  const time = Date.parse(value)
  if (
    !parts ||
    !Number.isFinite(time) ||
    Number(parts[2]) > 23 ||
    Number(parts[3]) > 59 ||
    (parts[4] !== undefined && Number(parts[4]) > 59)
  ) {
    throw new RangeError('天气证据时间或时区无效')
  }
  const day = new Date(parts[1] + 'T00:00:00Z')
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== parts[1]) {
    throw new RangeError('天气证据日期不存在')
  }
  return new Date(time).toISOString()
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 地点只保存查询来源，不反向推断植物位置；拒绝把URL或凭证串写入地点字段。 */
function location(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new RangeError('缺少明确天气查询地点')
  }
  if (/^[A-Za-z0-9]+$/.test(value)) {
    return value
  }
  const parts = value.split(',')
  if (parts.length !== 2) {
    throw new RangeError('天气地点必须是LocationID或经纬度查询值')
  }
  const lon = decimal(parts[0]),
    lat = decimal(parts[1])
  if (lon === null || lat === null || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    throw new RangeError('天气查询经纬度无效')
  }
  return value
}

/**
 * 只标准化现有v7公制逐小时制品。运行策略尚未发布时也可独立验证字段转换，
 * 但本函数不签发Provider配置、新鲜度或室内估算资格，不生成时间积分。
 */
export function normalizeQweatherV7Hourly(
  rawJson: string,
  context: QweatherHourlyContext
): QweatherHourlyEvidence {
  if (
    !context ||
    context.endpoint !== '/v7/weather/24h' ||
    context.unit !== 'm' ||
    !['provider_response', 'provider_documentation_fixture'].includes(context.sourceKind)
  ) {
    throw new RangeError('天气接口、单位或制品来源未明确')
  }
  const requestLocation = location(context.requestLocation)
  const capturedAt = utc(context.capturedAt)
  let payload: unknown
  try {
    payload = JSON.parse(rawJson)
  } catch {
    throw new RangeError('天气制品不是有效JSON')
  }
  if (
    !record(payload) ||
    payload.code !== '200' ||
    !Array.isArray(payload.hourly) ||
    payload.hourly.length === 0
  ) {
    throw new RangeError('天气制品不是有效的v7成功时序')
  }
  const providerUpdatedAt = utc(payload.updateTime)
  let previous = -Infinity
  const samples: QweatherClimateSample[] = []
  for (const row of payload.hourly) {
    if (!record(row)) {
      throw new RangeError('天气时序项无效')
    }
    const forecastTime = utc(row.fxTime),
      time = Date.parse(forecastTime)
    if (time <= previous) {
      throw new RangeError('天气时序存在重复或倒序时刻')
    }
    previous = time
    const t = decimal(row.temp),
      rh = decimal(row.humidity)
    // 绝对零度与百分湿度的定义域是单位硬边界，不是可调气候阈值。
    const temperatureC = t !== null && t >= -273.15 ? t : null
    const relativeHumidityPercent = rh !== null && rh >= 0 && rh <= 100 ? rh : null
    const unavailableFields: ('temperature' | 'humidity')[] = []
    if (temperatureC === null) {
      unavailableFields.push('temperature')
    }
    if (relativeHumidityPercent === null) {
      unavailableFields.push('humidity')
    }
    samples.push({
      forecastTime,
      providerForecastTime: row.fxTime as string,
      temperatureC,
      relativeHumidityPercent,
      unavailableFields
    })
  }
  return {
    provider: 'qweather',
    endpoint: '/v7/weather/24h',
    spatialScope: 'outdoor',
    evidenceKind: 'forecast',
    aggregation: 'unspecified',
    sourceKind: context.sourceKind,
    sourceSha256: createHash('sha256').update(rawJson).digest('hex'),
    requestLocation,
    capturedAt,
    providerUpdatedAt,
    samples
  }
}
