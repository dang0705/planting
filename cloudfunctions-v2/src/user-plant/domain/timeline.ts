import { createHash } from 'node:crypto'

/**
 * 用户植物时间线规则（docs/backend-v2/contracts/user-plant-timeline.md）。
 * 时间线是“投影视图”：像前端把多个接口的结果合并成一个按时间排序的动态流，只读、不能当作事实写入口。
 */

/** 硬规则 `user-plant.timeline.page_size`：缺省 20、上限 50；与配置目录一致性由测试锁定。 */
export const USER_PLANT_TIMELINE_PAGE_SIZE = Object.freeze({ default: 20, max: 50 })

/** 第一期收录的时间线类型。 */
export type TimelineItemType = 'care_watering' | 'care_plan_completed' | 'plant_archived' | 'plant_restored'

/** 时间线来源域（存于 source_domain）。 */
export type TimelineSourceDomain = 'care' | 'user-plant'

/** 游标位置：上一页最后一项的发生时间与时间线项引用。 */
export interface TimelineCursor {
  /** 上一页最后一项的业务发生 UTC 毫秒。 */ readonly occurredAtMs: number
  /** 上一页最后一项的时间线项公开引用（同刻次级排序键）。 */ readonly timelineItemRef: string
}

const timelineRefPattern = /^tli_[a-f0-9]{40}$/u
const sha40 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 40)

/** 时间线项引用：由来源确定性生成，派发与回填使用同一规则（合同 §5）。 */
export function timelineItemRefFor(sourceDomain: TimelineSourceDomain, sourceRef: string): string {
  return `tli_${sha40(`${sourceDomain}:${sourceRef}`)}`
}

/** 归档/恢复的来源引用：同一植物同一新版本唯一（合同 §5）。 */
export function lifecycleSourceRefFor(userPlantRef: string, newVersion: number): string {
  return `ulc_${sha40(`${userPlantRef}:${String(newVersion)}`)}`
}

/** 解析 limit：省略为 20；只接受无前导零的 1～50 十进制整数，其他返回 null。 */
export function resolveTimelineLimit(raw: string | null): number | null {
  if (raw === null) { return USER_PLANT_TIMELINE_PAGE_SIZE.default }
  if (!/^[1-9][0-9]*$/u.test(raw)) { return null }
  const limit = Number(raw)
  return limit <= USER_PLANT_TIMELINE_PAGE_SIZE.max ? limit : null
}

/** 把位置编码为不透明 base64url 游标。 */
export function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify([cursor.occurredAtMs, cursor.timelineItemRef]), 'utf8').toString('base64url')
}

/** 严格解码游标；格式错误或被篡改返回 null。 */
export function decodeTimelineCursor(raw: string): TimelineCursor | null {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown
    if (Array.isArray(value) && value.length === 2 && Number.isSafeInteger(value[0]) && (value[0] as number) >= 0
      && typeof value[1] === 'string' && timelineRefPattern.test(value[1])) {
      const cursor = { occurredAtMs: value[0] as number, timelineItemRef: value[1] }
      return encodeTimelineCursor(cursor) === raw ? cursor : null
    }
  } catch { /* 非 JSON 游标落到 null */ }
  return null
}
