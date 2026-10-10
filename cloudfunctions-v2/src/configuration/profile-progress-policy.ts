import Ajv from 'ajv'
import schema from '../../models/user-plant/profile-progress-policy.v1.schema.json'

/**
 * 长期植物档案完整度计分规则（user-plant-profile-progress/v1，类型化策略发布 user-plant/profile_progress）。
 * 类比：像一份“进度条配置表”——每一项填了加几分、没填时给用户看什么提示；数值全部来自不可变发布正文，源码不提供默认值。
 * 合同：docs/backend-v2/contracts/user-plant-profile-completeness.md §1、§6。
 */

/** 计分项代码（固定 7 项，顺序即同权重时的展示顺序）。 */
export const PROFILE_PROGRESS_ITEM_CODES = ['catalog_binding', 'measured_pot', 'substrate', 'location', 'plant_light', 'ventilation', 'lighting'] as const
/** 计分项代码类型。 */
export type ProfileProgressItemCode = (typeof PROFILE_PROGRESS_ITEM_CODES)[number]
/** 前端“去完善”跳转目标：档案分组名或品种绑定入口。 */
export type ProfileEditTarget = 'catalogBinding' | 'measuredPot' | 'substrate' | 'location' | 'plantLight' | 'ventilation' | 'lighting'
/** 展示档位代码。 */
export type ProfileProgressLevel = 'starter' | 'good' | 'great' | 'complete'

/** 一个计分项的规则。 */
export interface ProfileProgressItemRule {
  /** 计分项代码，每项在正文中恰好出现一次。 */ readonly code: ProfileProgressItemCode
  /** 完成该项获得的分数（正整数，全部合计 100）。 */ readonly weight: number
  /** 缺失时前端跳转的编辑入口。 */ readonly editTarget: ProfileEditTarget
  /** 缺失时给用户看的影响说明（中文，随版本固定）。 */ readonly reason: string
  /** 补上后的好处说明（中文，随版本固定）。 */ readonly benefit: string
}
/** 一个展示档位的下限。 */
export interface ProfileProgressLevelRule {
  /** 档位代码（starter/good/great/complete 之一）。 */ readonly level: ProfileProgressLevel
  /** 进入该档位的最低百分比（含）。 */ readonly minPercent: number
}
/** 已校验、冻结的完整度规则正文。 */
export interface ProfileProgressPolicy {
  /** 正文合同版本，固定 user-plant-profile-progress/v1。 */ readonly contractVersion: 'user-plant-profile-progress/v1'
  /** 7 个计分项，按正文顺序。 */ readonly items: readonly Readonly<ProfileProgressItemRule>[]
  /** 4 个档位，minPercent 严格递增、首档 0、末档 100。 */ readonly levels: readonly Readonly<ProfileProgressLevelRule>[]
}

/** 编译一次的正文 Schema（结构与枚举）；合计、唯一性与档位顺序由下方代码复核。 */
const validate = new Ajv({ strict: true, allErrors: true }).compile<ProfileProgressPolicy>(schema)
/** 档位固定顺序。 */
const levelOrder: readonly ProfileProgressLevel[] = ['starter', 'good', 'great', 'complete']
/** 权重合计必须等于的满分。 */
const fullScore = 100

/**
 * 校验并冻结规则正文；任何不合法（结构、重复项、合计不为 100、档位顺序或首末值不对）返回 null，由调用方按“规则不可用”处理。
 * 不接受元数据字段混入正文（Schema 禁止额外字段）。
 */
export function resolveProfileProgressPolicy(document: unknown): Readonly<ProfileProgressPolicy> | null {
  if (!validate(document)) { return null }
  const codes = new Set(document.items.map(item => item.code))
  const total = document.items.reduce((sum, item) => sum + item.weight, 0)
  if (codes.size !== PROFILE_PROGRESS_ITEM_CODES.length || total !== fullScore) { return null }
  const levelsInOrder = document.levels.every((level, index) => level.level === levelOrder[index]
    && (index === 0 || level.minPercent > document.levels[index - 1]!.minPercent))
  if (!levelsInOrder || document.levels[0]!.minPercent !== 0 || document.levels.at(-1)!.minPercent !== fullScore) { return null }
  return Object.freeze({
    contractVersion: document.contractVersion,
    items: Object.freeze(document.items.map(item => Object.freeze({ ...item }))),
    levels: Object.freeze(document.levels.map(level => Object.freeze({ ...level })))
  })
}
