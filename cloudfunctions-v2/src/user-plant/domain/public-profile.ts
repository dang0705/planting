import type { UserPlantProfileDto } from '../../contracts/types.js'
import { lockMeasuredPotProfile } from './measured-pot-profile.js'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'

/** 同用户/同植物联合SQL关联后的档案行；内部字段仅用于核验，绝不返回。 */
export interface PublicProfileRow {
  /** 左关联未命中时为空；命中时仅作完整性校验。 */ readonly profile_internal_id: string | null
  /** 数据库昵称，未命中时为空；有档案时必须为严格字符串。 */ readonly profile_nickname: string | null
  /** 原存储JSON，允许未采集时为空；只能选择已冻结公开字段。 */ readonly profile_pot_json: unknown
  /** 技术兼容列，未命中时空，命中时必须为空字符串。 */ readonly profile_openid: string | null
}
/** 显式选择公开字段并冻结副本；损坏档案不能伪装成不存在或缺测量。 */
export function projectPublicProfile(row: PublicProfileRow): Readonly<UserPlantProfileDto> | undefined {
  if (row.profile_internal_id === null) {
    if (row.profile_nickname !== null || row.profile_pot_json !== null || row.profile_openid !== null) { throw new TypeError('档案关联不完整') }
    return undefined
  }
  if (typeof row.profile_internal_id !== 'string' || !/^[1-9][0-9]*$/u.test(row.profile_internal_id)
    || row.profile_openid !== '' || typeof row.profile_nickname !== 'string' || [...row.profile_nickname].length > 80) { throw new TypeError('档案昵称或技术字段无效') }
  const parsed: unknown = row.profile_pot_json === null ? {} : typeof row.profile_pot_json === 'string' ? JSON.parse(row.profile_pot_json) : row.profile_pot_json
  const value = JSON.parse(serializeCanonicalJson(parsed as CanonicalJsonValue)) as Record<string, unknown>
  if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new TypeError('档案盆器存储不是JSON对象') }
  return Object.freeze({ nickname: row.profile_nickname, ...('measuredPot' in value ? { measuredPot: lockMeasuredPotProfile(value.measuredPot) } : {}) })
}
