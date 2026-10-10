import type { ProfileEditTarget, ProfileProgressItemCode, ProfileProgressLevel } from '../configuration/profile-progress-policy.js'
import { PROFILE_PROGRESS_ITEM_CODES } from '../configuration/profile-progress-policy.js'

/** 一个未完成计分项的公开说明（user-plant-profile-completeness/v1 §3）。 */
export type ProfileMissingItemDto = {
  /** 未完成的计分项代码（七项之一）。 */ code: ProfileProgressItemCode
  /** 补上该项可得的分数。 */ weight: number
  /** 缺了会怎样（规则正文固定文案）。 */ reason: string
  /** 补上有什么好处（规则正文固定文案）。 */ benefit: string
  /** 前端“去完善”跳转目标。 */ editTarget: ProfileEditTarget
}

/** 单株读取与档案保存响应中的完整度（读时现算，不落库）。 */
export type ProfileCompletenessDto = {
  /** 已完成项权重之和，0～100 整数。 */ percent: number
  /** 前端展示用的完整度档位。 */ level: ProfileProgressLevel
  /** 已完成项，按权重降序。 */ doneItems: ProfileProgressItemCode[]
  /** 未完成项，按权重降序。 */ missingItems: ProfileMissingItemDto[]
  /** 下一步最推荐补的项；全部完成为 null。 */ nextRecommended: ProfileProgressItemCode | null
}

const editTargets: readonly ProfileEditTarget[] = ['catalogBinding', 'measuredPot', 'substrate', 'location', 'plantLight', 'ventilation', 'lighting']

/** 完整度公开 Schema：只允许合同字段，不允许规则版本、有效期等内部信息。 */
export const profileCompletenessSchema = {
  type: 'object', additionalProperties: false, nullable: true, not: { type: 'null' },
  required: ['percent', 'level', 'doneItems', 'missingItems', 'nextRecommended'],
  properties: {
    percent: { type: 'integer', minimum: 0, maximum: 100 },
    level: { type: 'string', enum: ['starter', 'good', 'great', 'complete'] },
    doneItems: { type: 'array', maxItems: 7, items: { type: 'string', enum: [...PROFILE_PROGRESS_ITEM_CODES] } },
    missingItems: { type: 'array', maxItems: 7, items: {
      type: 'object', additionalProperties: false, required: ['code', 'weight', 'reason', 'benefit', 'editTarget'],
      properties: {
        code: { type: 'string', enum: [...PROFILE_PROGRESS_ITEM_CODES] },
        weight: { type: 'integer', minimum: 1, maximum: 100 },
        reason: { type: 'string', minLength: 1, maxLength: 120 },
        benefit: { type: 'string', minLength: 1, maxLength: 120 },
        editTarget: { type: 'string', enum: [...editTargets] }
      }
    } },
    nextRecommended: { type: 'string', nullable: true, enum: [...PROFILE_PROGRESS_ITEM_CODES, null] }
  }
}

/** 列表项完整度百分比 Schema（只带数字）。 */
export const completenessPercentSchema = { type: 'integer', minimum: 0, maximum: 100, nullable: true, not: { type: 'null' } }
