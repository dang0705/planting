import type { UserPlantRef } from '../../contracts/types.js'

/**
 * 用户植物列表查询规则（`user-plant.md`「列表公开接口」）。
 * 好比前端“无限滚动”：每页取固定条数，游标记住“上一页最后一项在哪”，下一页从它后面接着取。
 */

/** 硬规则 `user-plant.list.page_size`：缺省 20 条、最多 50 条；与配置目录一致性由测试锁定，不做运营配置。 */
export const USER_PLANT_LIST_PAGE_SIZE = Object.freeze({ default: 20, max: 50 })

/** 列表可见的生命周期；deleting/deleted 永远不可见。 */
export type ListableUserPlantLifecycle = 'active' | 'archived'

/** 缺省筛选：正常与已归档都返回（用户 2026-10-10 裁决）。 */
export const DEFAULT_LISTABLE_LIFECYCLES: readonly ListableUserPlantLifecycle[] = Object.freeze(['active', 'archived'])

/** 游标解码后的位置：上一页最后一项的创建时间与公开引用（排序键），不含内部主键或 user_id。 */
export type UserPlantListCursor = {
  /** 上一页最后一项的创建 UTC 毫秒。 */
  readonly createdAtMs: number
  /** 上一页最后一项的公开引用；同一毫秒内的次级排序键。 */
  readonly userPlantRef: UserPlantRef
}

const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
const positiveDecimal = /^[1-9][0-9]*$/u

/** 解析 lifecycle 查询参数：省略为两者，只接受 active / archived，其他返回 null（调用方转 400）。 */
export function resolveListLifecycles(raw: string | null): readonly ListableUserPlantLifecycle[] | null {
  if (raw === null) { return DEFAULT_LISTABLE_LIFECYCLES }
  return raw === 'active' || raw === 'archived' ? [raw] : null
}

/** 解析 limit：省略为 20；只接受无前导零的 1～50 十进制整数，其他返回 null。 */
export function resolveUserPlantListLimit(raw: string | null): number | null {
  if (raw === null) { return USER_PLANT_LIST_PAGE_SIZE.default }
  if (!positiveDecimal.test(raw)) { return null }
  const limit = Number(raw)
  return limit <= USER_PLANT_LIST_PAGE_SIZE.max ? limit : null
}

/** 把位置编码为不透明 base64url 游标。 */
export function encodeUserPlantListCursor(cursor: UserPlantListCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAtMs, cursor.userPlantRef]), 'utf8').toString('base64url')
}

/** 严格解码游标；格式错误或被篡改（重新编码不一致）返回 null。 */
export function decodeUserPlantListCursor(raw: string): UserPlantListCursor | null {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown
    if (Array.isArray(value) && value.length === 2 && Number.isSafeInteger(value[0]) && (value[0] as number) >= 0
      && typeof value[1] === 'string' && userPlantRefPattern.test(value[1])) {
      const cursor = { createdAtMs: value[0] as number, userPlantRef: value[1] as UserPlantRef }
      return encodeUserPlantListCursor(cursor) === raw ? cursor : null
    }
  } catch { /* 非 JSON 游标落到 null */ }
  return null
}
