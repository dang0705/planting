import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

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
    f.version AS profile_version, f.nickname, f.pot_profile_json,
    (SELECT b.catalog_taxon_ref FROM user_plant_catalog_bindings b WHERE b.user_internal_id = p.user_internal_id AND b.user_plant_internal_id = p.id
      ORDER BY b.bound_at_ms DESC, b.id DESC LIMIT 1) AS catalog_taxon_ref,
    (SELECT b.binding_ref FROM user_plant_catalog_bindings b WHERE b.user_internal_id = p.user_internal_id AND b.user_plant_internal_id = p.id
      ORDER BY b.bound_at_ms DESC, b.id DESC LIMIT 1) AS binding_ref
  FROM user_plants p
  JOIN users u ON u.id = p.user_internal_id AND u.status = 'active'
  LEFT JOIN user_plant_profiles f ON f.user_plant_internal_id = p.id AND f.user_internal_id = p.user_internal_id
  WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ? AND p.lifecycle_status IN ('active', 'archived')`

/** 库内 JSON 驱动可返回字符串或对象；只认五键齐全的实测盆器。 */
export function parseMeasuredPot(value: unknown): UserPlantMeasuredPot | null {
  let parsed = value
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { return null } }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return null }
  const record = parsed as Record<string, unknown>
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
  return { lifecycle, createdAtMs: created, plantVersion: version(row.plant_version),
    profileVersion: row.profile_version === null || row.profile_version === undefined ? null : version(row.profile_version),
    nickname, measuredPot: parseMeasuredPot(row.pot_profile_json), catalogTaxonRef: taxon,
    bindingRef: typeof row.binding_ref === 'string' ? row.binding_ref : null }
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
