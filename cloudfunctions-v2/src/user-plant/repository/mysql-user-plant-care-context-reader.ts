import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { lockStoredEnvironmentGroup, plantLightFromColumns } from '../domain/environment-profile.js'
import { deriveProfileReadiness, type ProfileReadiness } from '../domain/profile-progress.js'

/** 实测盆器证据（与档案 measuredPot 同键）；任一项未知为 null。 */
export interface UserPlantMeasuredPot {
  /** 是否确认尺寸来自实际种植内盆。 */
  readonly actualInnerPotConfirmed: boolean | null
  /** 内盆排水孔及通道是否有效。 */
  readonly drainageAvailable: boolean | null
  /** 内盆开口内直径，厘米。 */
  readonly potTopDiameterCm: number | null
  /** 内盆底部内直径，厘米。 */
  readonly potBottomDiameterCm: number | null
  /** 内盆容器内深，厘米。 */
  readonly potHeightCm: number | null
}

/** user-plant → care 只读归属上下文（long-term-care/v1 §0 T7）；不含任何可公开的内部主键。 */
export interface UserPlantCareContext {
  /** 生命周期：只有 active 与 archived 可见；删除中/已删除视为不存在。 */
  readonly lifecycle: 'active' | 'archived'
  /** 植物创建 UTC 毫秒，浇水补记下限之一。 */
  readonly createdAtMs: number
  /** 用户植物版本号，事务内复核未变。 */
  readonly plantVersion: number
  /** 档案版本号；无档案为 null，事务内复核未变。 */
  readonly profileVersion: number | null
  /** 用户起的昵称；空白或无档案为 null。 */
  readonly nickname: string | null
  /** 档案中的实测盆器；空对象或无档案为 null。 */
  readonly measuredPot: UserPlantMeasuredPot | null
  /** 最新一条品种绑定的目录引用；无绑定为 null。 */
  readonly catalogTaxonRef: string | null
  /** 最新一条品种绑定公开引用；无绑定为 null，事务内复核未变。 */
  readonly bindingRef: string | null
  /** 环境档案位置的城市代码（user-plant-environment-profile/v1）；未设置为 null。care 据此取城市中心坐标。 */
  readonly cityRef: string | null
  /** 档案中植物位置最近一次 Lux（迁移 030）；未测为 null。是否仍有效由 care 按浇水策略 luxAnchorMaxAgeDays 判定。 */
  readonly plantLight: UserPlantStoredLight | null
  /** 与档案完整度同一判定的就绪标记（user-plant-profile-completeness/v1 §4）。 */
  readonly profileReadiness: ProfileReadiness
}

/** 档案中的 Lux 读数（care 命令同形：测量时间为 UTC 毫秒）。 */
export interface UserPlantStoredLight {
  /** 植物位置照度（Lux，非负）。 */ readonly lux: number
  /** 测量时间 UTC 毫秒。 */ readonly measuredAtMs: number
  /** 来源：照度计或相机估算。 */ readonly source: 'meter' | 'camera_estimate'
}

/** 读取输入：已验真主体的公开用户标识与路径中的用户植物引用。 */
export interface UserPlantCareContextQuery {
  /** identity 解析出的统一用户公开标识。 */
  readonly userRef: string
  /** 路径中的用户植物公开引用。 */
  readonly userPlantRef: string
}

const potKeys = ['actualInnerPotConfirmed', 'drainageAvailable', 'potTopDiameterCm', 'potBottomDiameterCm', 'potHeightCm'] as const

/** 只读一次：植物、档案与最新绑定在同一条 SQL 中读出，避免拼凑不同时刻的事实。 */
const readSql = `SELECT p.lifecycle_status, CAST(p.created_at_ms AS CHAR) AS created_at_ms, p.version AS plant_version,
    f.version AS profile_version, f.nickname, f.pot_profile_json, c.location_json,
    c.plant_light_lux, CAST(c.plant_light_measured_at_ms AS CHAR) AS plant_light_measured_at_ms, c.plant_light_source,
    (SELECT b.catalog_taxon_ref FROM user_plant_catalog_bindings b WHERE b.user_internal_id = p.user_internal_id AND b.user_plant_internal_id = p.id
      ORDER BY b.bound_at_ms DESC, b.id DESC LIMIT 1) AS catalog_taxon_ref,
    (SELECT b.binding_ref FROM user_plant_catalog_bindings b WHERE b.user_internal_id = p.user_internal_id AND b.user_plant_internal_id = p.id
      ORDER BY b.bound_at_ms DESC, b.id DESC LIMIT 1) AS binding_ref
  FROM user_plants p
  JOIN users u ON u.id = p.user_internal_id AND u.status = 'active'
  LEFT JOIN user_plant_profiles f ON f.user_plant_internal_id = p.id AND f.user_internal_id = p.user_internal_id
  LEFT JOIN user_plant_care_contexts c ON c.user_plant_internal_id = p.id AND c.user_internal_id = p.user_internal_id AND c._openid = ''
  WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ? AND p.lifecycle_status IN ('active', 'archived')`

/**
 * 库内 JSON 驱动可返回字符串或对象；只认档案 JSON 中 `measuredPot` 键下五键齐全的实测盆器
 * （与 user-plant 写入路径 measured-profile-persistence-contract 一致；此前误读 JSON 根，导致经 PATCH 保存的盆器对 care 不可见）。
 */
export function parseMeasuredPot(value: unknown): UserPlantMeasuredPot | null {
  let parsed = value
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { return null } }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return null }
  const container = (parsed as Record<string, unknown>).measuredPot
  if (!container || typeof container !== 'object' || Array.isArray(container)) { return null }
  const record = container as Record<string, unknown>
  if (!potKeys.every(key => key in record)) { return null }
  const flag = (key: string) => typeof record[key] === 'boolean' ? record[key] as boolean : null
  const size = (key: string) => typeof record[key] === 'number' && (record[key] as number) > 0 ? record[key] as number : null
  return { actualInnerPotConfirmed: flag('actualInnerPotConfirmed'), drainageAvailable: flag('drainageAvailable'),
    potTopDiameterCm: size('potTopDiameterCm'), potBottomDiameterCm: size('potBottomDiameterCm'), potHeightCm: size('potHeightCm') }
}

/** 版本列转安全正整数；不合法抛内部错误。 */
function version(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) { throw new Error('用户植物版本读回不合法') }
  return number
}

/** 把一行映射为上下文；字段不合法属于数据损坏。 */
function toContext(row: Record<string, unknown>): UserPlantCareContext {
  const lifecycle = row.lifecycle_status
  const created = Number(row.created_at_ms)
  if ((lifecycle !== 'active' && lifecycle !== 'archived') || !Number.isSafeInteger(created)) { throw new Error('用户植物上下文读回不合法') }
  const nickname = typeof row.nickname === 'string' && row.nickname.trim().length > 0 ? row.nickname.trim() : null
  const taxon = typeof row.catalog_taxon_ref === 'string' ? row.catalog_taxon_ref : null
  const measuredPot = parseMeasuredPot(row.pot_profile_json)
  const light = plantLightFromColumns(row.plant_light_lux ?? null, row.plant_light_measured_at_ms ?? null, row.plant_light_source ?? null)
  return { lifecycle, createdAtMs: created, plantVersion: version(row.plant_version),
    profileVersion: row.profile_version === null || row.profile_version === undefined ? null : version(row.profile_version),
    nickname, measuredPot, catalogTaxonRef: taxon,
    bindingRef: typeof row.binding_ref === 'string' ? row.binding_ref : null,
    cityRef: lockStoredEnvironmentGroup('location', row.location_json ?? null)?.cityRef ?? null,
    plantLight: light === undefined ? null : { lux: light.lux, measuredAtMs: Date.parse(light.measuredAt), source: light.source },
    profileReadiness: deriveProfileReadiness({ catalogBound: taxon !== null, measuredPot: measuredPot ?? undefined }) }
}

/** user-plant 只读归属端口：不是本人或已删除返回 null（调用方映射 404，不泄露存在性）。 */
export function createMysqlUserPlantCareContextReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): {
  /** 新只读连接上读取一次上下文。 */
  readonly read: (query: UserPlantCareContextQuery) => Promise<UserPlantCareContext | null>
} {
  return {
    read: query => withReadConnection(source, async connection => {
      const rows = await connection.query(readSql, [query.userRef, query.userPlantRef])
      if (rows.length === 0) { return null }
      if (rows.length !== 1) { throw new Error('用户植物上下文不唯一') }
      return toContext(rows[0]!)
    })
  }
}
