import type { JSONSchemaType } from 'ajv'

/** 时间线项摘要：按类型区分的脱敏字段（user-plant-timeline/v1 §3）。 */
export type TimelineSummaryDto =
  | {
    /** 摘要类型：浇水事实（care_watering）。 */ itemType: 'care_watering'
    /** 浇水量毫升；未知为 null。 */ amountMl: number | null
  }
  | {
    /** 摘要类型：检查计划完成（care_plan_completed）。 */ itemType: 'care_plan_completed'
    /** 固定 done（跳过的计划不进时间线）。 */ outcome: 'done'
  }
  | {
    /** 摘要类型：植物归档或恢复。 */ itemType: 'plant_archived' | 'plant_restored'
  }

/** 一条时间线项。 */
export type TimelineItemDto = {
  /** 时间线项公开引用 tli_…。 */ timelineItemRef: string
  /** 时间线项类型（四种之一）。 */ itemType: 'care_watering' | 'care_plan_completed' | 'plant_archived' | 'plant_restored'
  /** 业务实际发生时间（UTC）。 */ occurredAt: string
  /** 按类型区分的脱敏展示摘要。 */ summary: TimelineSummaryDto
}

/** 时间线响应。 */
export type TimelineResponseDto = {
  /** 本页时间线项，最多 50 条。 */ items: TimelineItemDto[]
  /** 下一页游标；最后一页为 null。 */ nextCursor: string | null
}

const isoUtcPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'
/** 单个类型的严格项 Schema：外层 itemType 与摘要 itemType 必须一致，不允许任何额外字段。 */
const itemOf = (itemType: string, summaryProperties: Record<string, unknown>, summaryRequired: string[]) => ({
  type: 'object', additionalProperties: false, required: ['timelineItemRef', 'itemType', 'occurredAt', 'summary'],
  properties: {
    timelineItemRef: { type: 'string', pattern: '^tli_[a-f0-9]{40}$' },
    itemType: { type: 'string', const: itemType },
    occurredAt: { type: 'string', pattern: isoUtcPattern },
    summary: { type: 'object', additionalProperties: false, required: ['itemType', ...summaryRequired], properties: { itemType: { type: 'string', const: itemType }, ...summaryProperties } }
  }
})

/** 时间线响应 Schema。 */
export const timelineResponseSchema = {
  type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
  properties: {
    items: { type: 'array', maxItems: 50, items: { oneOf: [
      itemOf('care_watering', { amountMl: { type: 'integer', minimum: 0, nullable: true } }, ['amountMl']),
      itemOf('care_plan_completed', { outcome: { type: 'string', const: 'done' } }, ['outcome']),
      itemOf('plant_archived', {}, []),
      itemOf('plant_restored', {}, [])
    ] } },
    nextCursor: { type: 'string', nullable: true, minLength: 1, maxLength: 200 }
  }
} as unknown as JSONSchemaType<TimelineResponseDto>
