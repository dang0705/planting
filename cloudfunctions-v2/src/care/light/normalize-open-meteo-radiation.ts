import Ajv from 'ajv'

/** 单次离线解析上下文；数据请求与运行策略由外部已准入 Adapter 负责。 */
export interface RadiationNormalizationContext {
  /** 明确选择一个序列，不自动混合或改用另一分辨率。 */
  readonly series: 'hourly' | 'minutely_15'
  /** 非空的受控来源引用，用于制品回放追溯。 */
  readonly sourceRef: string
  /** 原响应获取的安全整数 UTC 毫秒时刻。 */
  readonly fetchedAtMs: number
}

/** 已按外部合同归一化的一条辐射平均区间。 */
export interface OutdoorRadiationInterval {
  /** 标签之前的区间开始 UTC 毫秒，左闭。 */
  readonly intervalStartMs: number
  /** Provider 标签转换后的结束 UTC 毫秒，右开。 */
  readonly intervalEndMs: number
  /** 明确为前一时段平均值，不能与瞬时太阳方向直接相乘。 */
  readonly semantics: 'interval_mean'
  /** 户外水平面总辐射，瓦每平方米；null 表示缺值。 */
  readonly ghiWattsPerM2: number | null
  /** 太阳法向直射辐射，瓦每平方米；null 表示缺值。 */
  readonly dniWattsPerM2: number | null
  /** 户外水平面散射辐射，瓦每平方米；null 表示缺值。 */
  readonly dhiWattsPerM2: number | null
}

/** 保留来源与覆盖时段的单序列离线结果，不宣称现场观测或全天覆盖。 */
export interface NormalizedOutdoorRadiation {
  /** 与请求一致的来源引用，不生成 Provider 请求或发布指针。 */
  readonly sourceRef: string
  /** 原响应实际获取的 UTC 毫秒时刻。 */
  readonly fetchedAtMs: number
  /** Provider 返回且可解析的地点时区，用于后续当地日期边界。 */
  readonly timezone: string
  /** 来源地点偏移秒数，仅作为元数据，不能加到 Unix 时间上。 */
  readonly utcOffsetSeconds: number
  /** 所选样本的时段长度，不代表模型空间精度或实测精度。 */
  readonly resolutionMs: number
  /** 当前序列出处，禁止与另一序列重复计权。 */
  readonly series: 'hourly' | 'minutely_15'
  /** 只声明模型估算或预报，不把过去区间包装为实测。 */
  readonly evidenceKind: 'model_estimate_or_forecast'
  /** 排序去重的实际样本，缺标签不延长或补零。 */
  readonly intervals: readonly OutdoorRadiationInterval[]
}

/** 通过 AJV 后的原始单序列数组，字段名保持 Provider 合同。 */
interface RadiationArrays {
  /** 官方 unixtime 格式的标签 UTC 秒。 */
  readonly time: readonly number[]
  /** 与时间等长的 GHI 原始数组。 */
  readonly shortwave_radiation: readonly (number | null)[]
  /** 与时间等长的 DNI 原始数组。 */
  readonly direct_normal_irradiance: readonly (number | null)[]
  /** 与时间等长的 DHI 原始数组。 */
  readonly diffuse_radiation: readonly (number | null)[]
}

/** 校验后只消费所需外部字段；额外 Provider 字段不进入计算。 */
interface RadiationResponse {
  /** 来源地点 IANA 时区，不读取主机默认时区。 */
  readonly timezone: string
  /** 来源地点整数秒偏移，保留而不二次应用。 */
  readonly utc_offset_seconds: number
  /** 显式选择小时序列时存在的已验证数组。 */
  readonly hourly?: RadiationArrays
  /** 显式选择15分钟序列时存在的已验证数组。 */
  readonly minutely_15?: RadiationArrays
}

/** 毫秒与秒的单位定义。 */
const millisecondsPerSecond = 1_000
/** 官方两类区间长度，不是应用轮询或缓存参数。 */
const resolutionMs = { hourly: 3_600_000, minutely_15: 900_000 } as const
/** 只消费三个有明确参考平面的辐射字段。 */
const radiationFields = [
  'shortwave_radiation',
  'direct_normal_irradiance',
  'diffuse_radiation'
] as const

/** 固定两类序列的 AJV 输入 Schema，禁止数值字符串和单位混淆。 */
function responseSchema(series: RadiationNormalizationContext['series']): object {
  const unitFields = Object.fromEntries(radiationFields.map(field => [field, { const: 'W/m²' }]))
  const dataFields = Object.fromEntries(
    radiationFields.map(field => [
      field,
      {
        type: 'array',
        // 负值不在 Schema 层拒绝：按单值缺值处理（radiation-interval-contract.md 修订 2026-10-10）。
        items: { anyOf: [{ type: 'number' }, { type: 'null' }] }
      }
    ])
  )
  return {
    type: 'object',
    required: ['timezone', 'utc_offset_seconds', series, `${series}_units`],
    additionalProperties: true,
    properties: {
      timezone: { type: 'string', minLength: 1 },
      utc_offset_seconds: { type: 'integer' },
      [`${series}_units`]: {
        type: 'object',
        required: ['time', ...radiationFields],
        additionalProperties: true,
        properties: { time: { const: 'unixtime' }, ...unitFields }
      },
      [series]: {
        type: 'object',
        required: ['time', ...radiationFields],
        additionalProperties: true,
        properties: { time: { type: 'array', items: { type: 'integer' } }, ...dataFields }
      }
    }
  }
}

/**
 * 单个辐射值：负数是 Provider 分量拆分的数值伪差，物理上不可用，记为缺值 null；不钳制为 0，以免冒充有效零。
 * 明确 null 保持缺值；非负有限数原样保留。
 */
const nonNegativeOrMissing = (value: number | null): number | null => (value === null || value < 0 ? null : value)

/** 两类固定外部响应校验器，不进行类型强制转换或填默认值。 */
const ajv = new Ajv({ allErrors: true, strict: true, strictNumbers: true })
/** Schema 只准入结构；等长、冲突与时间安全性由后续语义检查拒绝。 */
const validators = {
  hourly: ajv.compile<RadiationResponse>(responseSchema('hourly')),
  minutely_15: ajv.compile<RadiationResponse>(responseSchema('minutely_15'))
}

/**
 * 解析已取得的公开天气制品，保留前一时段均值、UTC 时刻与缺失，不访问网络。
 * 本用例不选择缓存策略、不推断太阳位置、不写入事实或正式养护结果。
 */
export function normalizeOpenMeteoRadiation(
  response: unknown,
  context: RadiationNormalizationContext
): NormalizedOutdoorRadiation {
  if (
    !context ||
    !['hourly', 'minutely_15'].includes(context.series) ||
    !Number.isSafeInteger(context.fetchedAtMs) ||
    typeof context.sourceRef !== 'string' ||
    context.sourceRef.trim().length === 0
  ) {
    throw new RangeError('辐射来源上下文非法')
  }
  const validate = validators[context.series]
  if (!validate(response)) {
    throw new RangeError('辐射响应结构、时间格式或单位非法')
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: response.timezone })
  } catch {
    throw new RangeError('辐射地点时区非法')
  }
  const data = response[context.series]
  if (!data || !radiationFields.every(field => data[field].length === data.time.length)) {
    throw new RangeError('辐射序列长度不一致')
  }
  const durationMs = resolutionMs[context.series]
  const unique = new Map<number, OutdoorRadiationInterval>()
  for (const [index, unixSeconds] of data.time.entries()) {
    const intervalEndMs = unixSeconds * millisecondsPerSecond
    const intervalStartMs = intervalEndMs - durationMs
    if (
      !Number.isSafeInteger(unixSeconds) ||
      !Number.isSafeInteger(intervalEndMs) ||
      !Number.isSafeInteger(intervalStartMs)
    ) {
      throw new RangeError('辐射区间时间不可安全表示')
    }
    const interval: OutdoorRadiationInterval = {
      intervalStartMs,
      intervalEndMs,
      semantics: 'interval_mean',
      ghiWattsPerM2: nonNegativeOrMissing(data.shortwave_radiation[index]!),
      dniWattsPerM2: nonNegativeOrMissing(data.direct_normal_irradiance[index]!),
      dhiWattsPerM2: nonNegativeOrMissing(data.diffuse_radiation[index]!)
    }
    const existing = unique.get(intervalEndMs)
    if (existing && JSON.stringify(existing) !== JSON.stringify(interval)) {
      throw new RangeError('同一辐射时段存在冲突')
    }
    unique.set(intervalEndMs, interval)
  }
  const intervals = [...unique.values()].sort(
    (left, right) => left.intervalEndMs - right.intervalEndMs
  )
  for (let index = 1; index < intervals.length; index++) {
    if (intervals[index]!.intervalStartMs < intervals[index - 1]!.intervalEndMs) {
      throw new RangeError('辐射区间重叠')
    }
  }
  return {
    sourceRef: context.sourceRef,
    fetchedAtMs: context.fetchedAtMs,
    timezone: response.timezone,
    utcOffsetSeconds: response.utc_offset_seconds,
    resolutionMs: durationMs,
    series: context.series,
    evidenceKind: 'model_estimate_or_forecast',
    intervals
  }
}
