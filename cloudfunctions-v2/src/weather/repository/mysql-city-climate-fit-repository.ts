import {
  toTropicalsCoverImage,
  type TropicalsCoverImage
} from '../../plant-knowledge/domain/tropicals-cover-image.js'

/** 参数化只读 SQL 执行边界；连接生命周期由调用方管理。 */
export type WeatherSqlExecutor = {
  /** 用参数化查询返回结果行，不得拼接城市代码或植物 ID。 */
  readonly query: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<readonly Record<string, unknown>[]>
}

/** ClimateFitPolicy 固定版本；与灌库缓存一致。 */
export const CITY_CLIMATE_FIT_POLICY_VERSION = 'v0-city-outdoor'

/** 城市气候剖面公开 DTO。 */
export type CityClimateProfile = {
  /** 城市公开代码，与 city_climate_profiles.city_code 一致。 */
  readonly cityCode: string
  /** 城市中文展示名，面向用户列表与详情。 */
  readonly displayName: string
  /** 城市纬度（度），用于气候源坐标核对。 */
  readonly lat: number
  /** 城市经度（度），用于气候源坐标核对。 */
  readonly lon: number
  /** IANA 时区标识，解释日界与本地日期窗口。 */
  readonly timezone: string
  /** 气候数据来源标识，例如开放气象数据集名称。 */
  readonly source: string
  /** 气候统计覆盖的起止日期窗口（YYYY-MM-DD）。 */
  readonly window: {
    /** 统计窗口起始日，本地日历 YYYY-MM-DD。 */
    readonly start: string
    /** 统计窗口结束日，本地日历 YYYY-MM-DD。 */
    readonly end: string
  }
  /** 窗口内有效观测天数；缺失时为 null。 */
  readonly dayCount: number | null
  /** 生成该剖面所用的气候适配策略版本。 */
  readonly policyVersion: string
  /** 月度气候汇总 JSON，结构由灌库脚本冻结。 */
  readonly monthly: unknown
  /** 日统计摘要 JSON，结构由灌库脚本冻结。 */
  readonly dailyStats: unknown
}

/** 植物×城市适配缓存公开 DTO。 */
export type CityClimateFit = {
  /** 城市公开代码，与适配缓存主键一致。 */
  readonly cityCode: string
  /** 植物公开标识：百科分类引用 taxon_id（与 plant-knowledge catalogTaxonRef 同一命名空间）。 */
  readonly plantId: string
  /** 计算该缓存所用的气候适配策略版本。 */
  readonly policyVersion: string
  /** 综合适配分；缺失或未计算时为 null。 */
  readonly overall: number | null
  /** 温度维度匹配分；缺失时为 null。 */
  readonly temperatureMatch: number | null
  /** 湿度维度匹配分；缺失时为 null。 */
  readonly humidityMatch: number | null
  /** 光照维度匹配分；缺失时为 null。 */
  readonly lightMatch: number | null
  /** 主要瓶颈维度标识；无瓶颈时为 null。 */
  readonly primaryBottleneck: string | null
  /** 风险标记列表，来自 risk_flags_json 反序列化。 */
  readonly riskFlags: readonly unknown[]
}

/** 推荐条目：适配分 + 百科展示字段。 */
export type CityClimateRecommendationItem = CityClimateFit & {
  /** 百科中文名；联表缺失时为 null。 */
  readonly name: string | null
  /** 百科学名；联表缺失时为 null。 */
  readonly scientificName: string | null
  /** 封面图（完整地址 + 来源）；无封面或引用不可公开时为 null。规则见 plant-encyclopedia-read/v2。 */
  readonly coverImage: TropicalsCoverImage | null
  /** 养护难度枚举展示值；联表缺失时为 null。 */
  readonly careDifficulty: string | null
}

const profileColumns = `city_code, display_name, lat, lon, timezone, source, window_start, window_end,
 day_count, policy_version, monthly_json, daily_stats_json`

/** 合同「策略版本固定读取 v0-city-outdoor」：唯一键允许同城并存多策略行，读取必须按策略过滤。 */
const listProfilesSql = `SELECT ${profileColumns}
FROM city_climate_profiles
WHERE BINARY policy_version = BINARY ?
ORDER BY city_code`

const getProfileSql = `SELECT ${profileColumns}
FROM city_climate_profiles
WHERE BINARY city_code = BINARY ?
  AND BINARY policy_version = BINARY ?
LIMIT 2`

/**
 * 适配缓存按内部 encyclopedia_id 存储；对外 plantId 为百科分类引用 taxon_id（合同 v2）。
 * 以 `e.taxon_id = ?` 命中唯一索引，精确（区分大小写与尾随空白）比较在映射后由代码完成，
 * 避免 BINARY 包裹列导致索引失效、扫描 15 万行百科表。内部 id 不进入 SELECT 列。
 */
const getFitSql = `SELECT f.city_code, e.taxon_id, f.policy_version, f.overall, f.temperature_match,
 f.humidity_match, f.light_match, f.primary_bottleneck, f.risk_flags_json
FROM plant_city_climate_fit_cache AS f
JOIN tropicals_species_encyclopedia_ref AS e ON e.id = f.encyclopedia_id
WHERE BINARY f.city_code = BINARY ?
  AND e.taxon_id = ?
  AND BINARY f.policy_version = BINARY ?
LIMIT 2`

/** 推荐：内连接百科取 taxon_id；无百科行的缓存无法给出公开 plantId，不进入结果。同分按 taxon_id 升序。 */
const listRecommendationsSql = `SELECT f.city_code, e.taxon_id, f.policy_version, f.overall,
 f.temperature_match, f.humidity_match, f.light_match, f.primary_bottleneck, f.risk_flags_json,
 e.name, e.scientific_name, e.cover_image_ref, e.cover_source_json, e.care_difficulty
FROM plant_city_climate_fit_cache AS f
JOIN tropicals_species_encyclopedia_ref AS e ON e.id = f.encyclopedia_id
WHERE BINARY f.city_code = BINARY ?
  AND BINARY f.policy_version = BINARY ?
ORDER BY f.overall DESC, e.taxon_id ASC
LIMIT ?`

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function asRequiredNumber(value: unknown, field: string): number {
  const number = asNumber(value)
  if (number === null) {
    throw new Error(`城市气候字段损坏: ${field}`)
  }
  return number
}

function asRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`城市气候字段损坏: ${field}`)
  }
  return value
}

/** DATE 列在未开 dateStrings 时会被 mysql2 收成 Date；合同要 YYYY-MM-DD 字符串。 */
function asRequiredDateString(value: unknown, field: string): string {
  if (typeof value === 'string' && value) {
    return value.length >= 10 ? value.slice(0, 10) : value
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    // mysql2 默认把 DATE 收成「本地零点」Date；用本地年月日，避免 UTC 偏一天。
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  throw new Error(`城市气候字段损坏: ${field}`)
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error('城市气候可选字符串字段损坏')
  }
  return value
}

/** 解析剖面 JSON 列；合同规定行损坏返回 500，因此非法 JSON 直接抛错，不静默降级为 null。 */
function parseJsonField(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'object') {
    return value
  }
  if (typeof value !== 'string') {
    throw new Error('城市气候 JSON 字段损坏')
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error('城市气候 JSON 字段损坏')
  }
}

/** 合同唯一窄例外：risk_flags_json 非法 JSON 或非数组时视为空列表。 */
function parseRiskFlags(value: unknown): readonly unknown[] {
  let parsed: unknown
  try {
    parsed = parseJsonField(value)
  } catch {
    return []
  }
  return Array.isArray(parsed) ? parsed : []
}

function mapProfile(row: Record<string, unknown>): CityClimateProfile {
  return {
    cityCode: asRequiredString(row.city_code, 'city_code'),
    displayName: asRequiredString(row.display_name, 'display_name'),
    lat: asRequiredNumber(row.lat, 'lat'),
    lon: asRequiredNumber(row.lon, 'lon'),
    timezone: asRequiredString(row.timezone, 'timezone'),
    source: asRequiredString(row.source, 'source'),
    window: {
      start: asRequiredDateString(row.window_start, 'window_start'),
      end: asRequiredDateString(row.window_end, 'window_end')
    },
    dayCount: asNumber(row.day_count),
    policyVersion: asRequiredString(row.policy_version, 'policy_version'),
    monthly: parseJsonField(row.monthly_json),
    dailyStats: parseJsonField(row.daily_stats_json)
  }
}

function mapFit(row: Record<string, unknown>): CityClimateFit {
  return {
    cityCode: asRequiredString(row.city_code, 'city_code'),
    plantId: asRequiredString(row.taxon_id, 'taxon_id'),
    policyVersion: asRequiredString(row.policy_version, 'policy_version'),
    overall: asNumber(row.overall),
    temperatureMatch: asNumber(row.temperature_match),
    humidityMatch: asNumber(row.humidity_match),
    lightMatch: asNumber(row.light_match),
    primaryBottleneck: asOptionalString(row.primary_bottleneck),
    riskFlags: parseRiskFlags(row.risk_flags_json)
  }
}

function mapRecommendation(row: Record<string, unknown>): CityClimateRecommendationItem {
  return {
    ...mapFit(row),
    name: asOptionalString(row.name),
    scientificName: asOptionalString(row.scientific_name),
    coverImage: toTropicalsCoverImage({
      taxonId: row.taxon_id,
      coverImageRef: row.cover_image_ref,
      coverSourceJson: row.cover_source_json
    }),
    careDifficulty: asOptionalString(row.care_difficulty)
  }
}

function assertUnique(rows: readonly Record<string, unknown>[], label: string): void {
  if (rows.length > 1) {
    throw new Error(`${label} 不唯一`)
  }
}

/** 城市气候适配只读 Repository；SQL 参数化，不拼接用户输入。 */
export function createMysqlCityClimateFitRepository(executor: WeatherSqlExecutor): {
  readonly listProfiles: () => Promise<readonly CityClimateProfile[]>
  readonly getProfile: (cityCode: string) => Promise<CityClimateProfile | null>
  readonly getFit: (cityCode: string, plantId: string) => Promise<CityClimateFit | null>
  readonly listRecommendations: (
    cityCode: string,
    top: number
  ) => Promise<readonly CityClimateRecommendationItem[]>
} {
  return {
    async listProfiles() {
      const rows = await executor.query(listProfilesSql, [CITY_CLIMATE_FIT_POLICY_VERSION])
      return rows.map(mapProfile)
    },
    async getProfile(cityCode) {
      const rows = await executor.query(getProfileSql, [cityCode, CITY_CLIMATE_FIT_POLICY_VERSION])
      assertUnique(rows, '城市气候剖面')
      return rows[0] ? mapProfile(rows[0]) : null
    },
    async getFit(cityCode, plantId) {
      const rows = await executor.query(getFitSql, [
        cityCode,
        plantId,
        CITY_CLIMATE_FIT_POLICY_VERSION
      ])
      assertUnique(rows, '城市气候适配缓存')
      const fit = rows[0] ? mapFit(rows[0]) : null
      // 排序规则可能忽略大小写或尾随空白；合同要求按原值精确匹配。
      return fit && fit.plantId === plantId ? fit : null
    },
    async listRecommendations(cityCode, top) {
      const rows = await executor.query(listRecommendationsSql, [
        cityCode,
        CITY_CLIMATE_FIT_POLICY_VERSION,
        top
      ])
      return rows.map(mapRecommendation)
    }
  }
}
