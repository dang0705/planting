import type { ProfileProgressItemCode, ProfileProgressPolicy } from '../../configuration/profile-progress-policy.js'
import type { UserPlantProfileDto } from '../../contracts/types.js'
import type { ProfileCompletenessDto } from '../../contracts/user-plant-profile-completeness-contract.js'
import { hasCompleteMeasuredPot } from './environment-profile.js'
import type { MeasuredPotProfile } from './measured-pot-profile.js'

/**
 * 档案完整度判定（user-plant-profile-completeness/v1 §1～§4）。
 * “某项是否完成”是事实判断（写在这里，不可配置）；“完成一项值几分、提示文案”是规则（来自发布正文）。
 * 类比：判断表单每个字段填没填是组件内逻辑，进度条每段多长由配置决定。
 */

/** 计算完整度所需的服务端事实。 */
export interface ProfileProgressFacts {
  /** 是否存在 Tropicals 品种绑定（与身份确认不同）。 */ readonly catalogBound: boolean
  /** 已保存档案的公开投影；没有档案为 undefined。 */ readonly profile: Readonly<UserPlantProfileDto> | undefined
}
/** 一次计算的输入：事实 + 同一请求锁定的规则快照。 */
export interface EvaluateProfileProgressInput {
  /** 服务端已保存的档案事实。 */ readonly facts: ProfileProgressFacts
  /** 已校验的计分规则。 */ readonly policy: Readonly<ProfileProgressPolicy>
  /** Lux 有效天数（复用浇水策略 luxAnchorMaxAgeDays，不新造参数）。 */ readonly plantLightMaxAgeDays: number
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
}
/** 养护摘要使用的两项就绪标记。 */
export interface ProfileReadiness {
  /** 实测盆器至少一项尺寸 + 排水状态非空。 */ readonly hasMeasuredPot: boolean
  /** 是否已存在 Tropicals 品种绑定。 */ readonly hasCatalogBinding: boolean
}

/** 就绪判定输入：品种绑定事实与实测盆器（care 只读上下文同口径）。 */
export interface ProfileReadinessInput {
  /** 是否存在品种绑定。 */ readonly catalogBound: boolean
  /** 已保存的实测盆器；没有为 undefined。 */ readonly measuredPot: Readonly<MeasuredPotProfile> | undefined
}

const millisecondsPerDay = 86_400_000

/** Lux 读数在有效期内：测量时刻不晚于现在，且距今不超过有效天数（恰好等于仍有效）。 */
function isPlantLightFresh(measuredAt: string, nowMs: number, maxAgeDays: number): boolean {
  const measuredAtMs = Date.parse(measuredAt)
  return Number.isFinite(measuredAtMs) && measuredAtMs <= nowMs && nowMs - measuredAtMs <= maxAgeDays * millisecondsPerDay
}

/** 单项是否已完成；只看已保存事实，不推测。 */
function isItemDone(code: ProfileProgressItemCode, facts: ProfileProgressFacts, nowMs: number, maxAgeDays: number): boolean {
  const profile = facts.profile
  switch (code) {
    case 'catalog_binding': return facts.catalogBound
    case 'measured_pot': return hasCompleteMeasuredPot(profile?.measuredPot)
    case 'substrate': return profile?.substrate !== undefined
    case 'location': return profile?.location !== undefined
    case 'plant_light': return profile?.plantLight !== undefined && isPlantLightFresh(profile.plantLight.measuredAt, nowMs, maxAgeDays)
    case 'ventilation': return profile?.ventilation !== undefined
    case 'lighting': return profile?.lighting !== undefined
  }
}

/** 计算公开完整度；按权重降序、同权重按正文顺序排列，下一步推荐为最高权重缺失项。 */
export function evaluateProfileProgress(input: EvaluateProfileProgressInput): ProfileCompletenessDto {
  if (!Number.isFinite(input.plantLightMaxAgeDays) || input.plantLightMaxAgeDays <= 0 || !Number.isSafeInteger(input.nowMs)) {
    throw new TypeError('完整度计算输入不合法')
  }
  const ordered = input.policy.items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => right.item.weight - left.item.weight || left.index - right.index)
    .map(entry => entry.item)
  const done = ordered.filter(item => isItemDone(item.code, input.facts, input.nowMs, input.plantLightMaxAgeDays))
  const missing = ordered.filter(item => !done.includes(item))
  const percent = done.reduce((sum, item) => sum + item.weight, 0)
  const level = [...input.policy.levels].reverse().find(rule => rule.minPercent <= percent)!.level
  return {
    percent, level,
    doneItems: done.map(item => item.code),
    missingItems: missing.map(item => ({ code: item.code, weight: item.weight, reason: item.reason, benefit: item.benefit, editTarget: item.editTarget })),
    nextRecommended: missing[0]?.code ?? null
  }
}

/** 养护摘要 profileReadiness：与完整度同一判定（§4），不依赖规则发布。 */
export function deriveProfileReadiness(input: ProfileReadinessInput): ProfileReadiness {
  return { hasMeasuredPot: hasCompleteMeasuredPot(input.measuredPot), hasCatalogBinding: input.catalogBound }
}
