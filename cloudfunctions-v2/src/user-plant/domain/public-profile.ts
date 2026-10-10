import type { UserPlantProfileDto } from '../../contracts/types.js'
import { lockMeasuredPotProfile } from './measured-pot-profile.js'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { CARE_CONTEXT_JSON_GROUP_KEYS, lockStoredEnvironmentGroup, plantLightFromColumns, PROFILE_JSON_GROUP_KEYS, PROFILE_JSON_STORAGE_KEY } from './environment-profile.js'

/** 同用户/同植物联合SQL关联后的档案行；内部字段仅用于核验，绝不返回。 */
export interface PublicProfileRow {
  /** 左关联未命中时为空；命中时仅作完整性校验。 */ readonly profile_internal_id: string | null
  /** 数据库昵称，未命中时为空；有档案时必须为严格字符串。 */ readonly profile_nickname: string | null
  /** 原存储JSON，允许未采集时为空；只能选择已冻结公开字段。 */ readonly profile_pot_json: unknown
  /** 技术兼容列，未命中时空，命中时必须为空字符串。 */ readonly profile_openid: string | null
  /** 养护环境行内部主键（左关联未命中为 null；旧查询未选该列时为 undefined，按未命中处理）。 */ readonly context_internal_id?: string | null
  /** 养护环境行的位置 JSON；JSON null 表示未设置。 */ readonly context_location_json?: unknown
  /** 养护环境行的光照 JSON；JSON null 表示未设置。 */ readonly context_light_json?: unknown
  /** 养护环境行的通风 JSON；JSON null 表示未设置。 */ readonly context_ventilation_json?: unknown
  /** 植物位置最近一次 Lux（迁移 030）；未测为 null。 */ readonly context_plant_light_lux?: unknown
  /** 该次 Lux 测量时间 UTC 毫秒文本；未测为 null。 */ readonly context_plant_light_measured_at_ms?: unknown
  /** 该次 Lux 来源；未测为 null。 */ readonly context_plant_light_source?: unknown
}

const contextColumn = { location: 'context_location_json', lighting: 'context_light_json', ventilation: 'context_ventilation_json' } as const

/** 显式选择公开字段并冻结副本；损坏档案不能伪装成不存在或缺测量。 */
export function projectPublicProfile(row: PublicProfileRow): Readonly<UserPlantProfileDto> | undefined {
  const hasContext = row.context_internal_id !== null && row.context_internal_id !== undefined
  if (hasContext && (typeof row.context_internal_id !== 'string' || !/^[1-9][0-9]*$/u.test(row.context_internal_id))) { throw new TypeError('养护环境关联无效') }
  const environment: Record<string, unknown> = {}
  if (hasContext) {
    for (const key of CARE_CONTEXT_JSON_GROUP_KEYS) {
      const group = lockStoredEnvironmentGroup(key, row[contextColumn[key]])
      if (group !== undefined) { environment[key] = group }
    }
    const plantLight = plantLightFromColumns(row.context_plant_light_lux, row.context_plant_light_measured_at_ms, row.context_plant_light_source)
    if (plantLight !== undefined) { environment.plantLight = plantLight }
  }
  if (row.profile_internal_id === null) {
    if (row.profile_nickname !== null || row.profile_pot_json !== null || row.profile_openid !== null) { throw new TypeError('档案关联不完整') }
    return Object.keys(environment).length === 0 ? undefined : Object.freeze({ nickname: '', ...environment }) as Readonly<UserPlantProfileDto>
  }
  if (typeof row.profile_internal_id !== 'string' || !/^[1-9][0-9]*$/u.test(row.profile_internal_id)
    || row.profile_openid !== '' || typeof row.profile_nickname !== 'string' || [...row.profile_nickname].length > 80) { throw new TypeError('档案昵称或技术字段无效') }
  const parsed: unknown = row.profile_pot_json === null ? {} : typeof row.profile_pot_json === 'string' ? JSON.parse(row.profile_pot_json) : row.profile_pot_json
  const value = JSON.parse(serializeCanonicalJson(parsed as CanonicalJsonValue)) as Record<string, unknown>
  if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new TypeError('档案盆器存储不是JSON对象') }
  const profileGroups: Record<string, unknown> = {}
  for (const key of PROFILE_JSON_GROUP_KEYS) {
    const storageKey = PROFILE_JSON_STORAGE_KEY[key]
    const group = storageKey in value ? lockStoredEnvironmentGroup(key, value[storageKey]) : undefined
    if (group !== undefined) { profileGroups[key] = group }
  }
  return Object.freeze({ nickname: row.profile_nickname, ...('measuredPot' in value ? { measuredPot: lockMeasuredPotProfile(value.measuredPot) } : {}),
    ...profileGroups, ...environment }) as Readonly<UserPlantProfileDto>
}
