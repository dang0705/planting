import Ajv2020 from 'ajv/dist/2020.js'
import patchSchema from '../../../models/user-plant/profile-patch.v2.schema.json'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import type { MeasuredPotProfile } from './measured-pot-profile.js'

/**
 * 环境档案分组（user-plant-environment-profile/v1）。机器事实源为 `profile-patch.v2.schema.json`，本文件只复用其分组定义，
 * 不另写一份规则。类比：像表单里的几个“可折叠分区”，每个分区要么整体填写、要么整体清空（null）。
 */

/** 基质可选材料，与浇水建议现有枚举一致。 */
export type SubstrateMaterial = 'general' | 'coco' | 'ceramsite' | 'peat' | 'perlite' | 'bark' | 'sphagnum' | 'gritty' | 'coarse_sand'
/** 基质组分。 */
export interface SubstrateProfile {
  /** 基质组分列表，1～9 项且不重复。 */ readonly materials: readonly SubstrateMaterial[]
  /** 主要材料（体积过半）；必须属于 materials，未知为 null。 */ readonly primaryMaterial: SubstrateMaterial | null
}
/** 城市级位置；不含经纬度。 */
export interface LocationProfile {
  /** weather 城市目录中的城市代码（小写字母数字下划线连字符）。 */ readonly cityRef: string
  /** 摆放类型：室内、封闭阳台、开放阳台或户外。 */ readonly placement: 'indoor' | 'balcony_enclosed' | 'balcony_open' | 'outdoor'
}
/** 光照：只收主窗朝向（2026-10-10 用户纠偏；城市在位置分组，植物位置 Lux 由浇水建议请求实测）。 */
export interface LightingProfile {
  /** 植物主要采光窗的朝向（8 方位），none 表示无窗。 */ readonly windowFacing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'none'
}
/** 通风与空气环境。 */
export interface VentilationProfile {
  /** 房间空气交换频率：常闭、偶尔开窗、经常通风。 */ readonly airExchange: 'closed' | 'occasional' | 'frequent'
  /** 植物附近的局部风源：无、风扇、空调、暖气或自然穿堂风。 */ readonly localAirflow: 'none' | 'fan' | 'ac' | 'heater' | 'natural_draft'
  /** 风源是否直接吹到植物；未知为 null。 */ readonly directBlowing: boolean | null
}

/** 植物位置最近一次 Lux 实测（2026-10-10 用户追加 Lux 存档）；有效期由读取方按浇水策略 luxAnchorMaxAgeDays 判定，不在此存。 */
export interface PlantLightProfile {
  /** 植物位置照度（Lux，非负）。 */ readonly lux: number
  /** 测量时间（带 Z 的 UTC；读回统一为带毫秒格式）。 */ readonly measuredAt: string
  /** 来源：meter 照度计；camera_estimate 相机估算。 */ readonly source: 'meter' | 'camera_estimate'
}

/** 环境分组的键与值类型映射。 */
export interface EnvironmentGroups {
  /** 基质组分分组（材料列表与主要材料）。 */ readonly substrate: SubstrateProfile
  /** 城市级位置分组。 */ readonly location: LocationProfile
  /** 光照分组（朝向、玻璃、距离、遮挡）。 */ readonly lighting: LightingProfile
  /** 通风分组（空气交换、局部风源、直吹）。 */ readonly ventilation: VentilationProfile
  /** 植物位置最近一次 Lux 实测分组。 */ readonly plantLight: PlantLightProfile
}
/** 环境分组键。 */
export type EnvironmentGroupKey = keyof EnvironmentGroups
/** 固定顺序的分组键；存于档案 JSON 的两组与存于养护环境表的三组。 */
export const ENVIRONMENT_GROUP_KEYS = ['substrate', 'location', 'lighting', 'ventilation', 'plantLight'] as const satisfies readonly EnvironmentGroupKey[]
/** 存于 `user_plant_profiles.pot_profile_json` 的分组（2026-10-10 删除 potShape 后只剩基质）。 */
export const PROFILE_JSON_GROUP_KEYS = ['substrate'] as const satisfies readonly EnvironmentGroupKey[]
/** 存于 `user_plant_care_contexts` JSON 列的三个分组。 */
export const CARE_CONTEXT_JSON_GROUP_KEYS = ['location', 'lighting', 'ventilation'] as const satisfies readonly EnvironmentGroupKey[]
/** 存于 `user_plant_care_contexts` 的全部分组：三个 JSON 分组 + 迁移 030 三列承载的 plantLight。 */
export const CARE_CONTEXT_GROUP_KEYS = [...CARE_CONTEXT_JSON_GROUP_KEYS, 'plantLight'] as const satisfies readonly EnvironmentGroupKey[]
/**
 * 盆型/基质在 `pot_profile_json` 中的存储键。刻意不用 `substrate` 等裸名：旧档案 JSON 可能已有同名历史键（只保留、不公开），
 * 用带 Profile 后缀的新键避免把历史值误当成新合同字段。
 */
export const PROFILE_JSON_STORAGE_KEY = { substrate: 'substrateProfile' } as const

/** profile-patch/v2 Schema 中本文件读取的最小形状。 */
type SchemaDocument = {
  /** 请求顶层字段定义，按字段名索引。 */
  properties: Record<string, {
    /** 分组字段的两个分支：第 0 个为 null（清除），第 1 个为对象。 */
    oneOf?: readonly unknown[]
  }>
}
const ajv = new Ajv2020({ strict: true, allErrors: true })
/** 从 v2 请求 Schema 取每个分组的“对象分支”，用于读回时校验库内值（库内不允许出现非法分组）。 */
const groupValidators = Object.fromEntries(ENVIRONMENT_GROUP_KEYS.map(key => {
  const branch = (patchSchema as unknown as SchemaDocument).properties[key]!.oneOf![1]
  return [key, ajv.compile(branch as object)]
})) as Record<EnvironmentGroupKey, ReturnType<typeof ajv.compile>>

/** 带 Z 的 UTC 文本往返校验并统一为带毫秒 ISO；非法（如 2 月 30 日）返回 null。 */
export function normalizeUtc(value: string): string | null {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) { return null }
  const canonical = new Date(time).toISOString()
  return (value.includes('.') ? canonical : canonical.replace('.000Z', 'Z')) === value ? canonical : null
}

/** 分组的跨字段规则：主要基质必须属于组分（JSON Schema 无法表达）。 */
export function assertEnvironmentGroupRules(key: EnvironmentGroupKey, value: unknown): void {
  if (key === 'plantLight' && value !== null && normalizeUtc((value as PlantLightProfile).measuredAt) === null) {
    throw new TypeError('Lux 测量时间不是合法 UTC 时间')
  }
  if (key === 'substrate' && value !== null) {
    const substrate = value as SubstrateProfile
    if (substrate.primaryMaterial !== null && !substrate.materials.includes(substrate.primaryMaterial)) {
      throw new TypeError('主要基质必须属于基质组分')
    }
  }
}

/** 校验并冻结库内读回的一个分组；损坏数据抛错（失败关闭），JSON null 表示未设置返回 undefined。 */
export function lockStoredEnvironmentGroup<TKey extends EnvironmentGroupKey>(key: TKey, stored: unknown): Readonly<EnvironmentGroups[TKey]> | undefined {
  let parsed: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored
  if (parsed === null || parsed === undefined) { return undefined }
  // 2026-10-10 纠偏：旧光照记录可能带已删除的玻璃/距离/遮挡键；不做 DDL，读取时只保留仍公开的 windowFacing。
  if (key === 'lighting' && typeof parsed === 'object' && !Array.isArray(parsed)) {
    parsed = { windowFacing: (parsed as Record<string, unknown>).windowFacing }
  }
  const value: unknown = JSON.parse(serializeCanonicalJson(parsed as CanonicalJsonValue))
  if (!groupValidators[key](value)) { throw new TypeError(`环境档案分组 ${key} 存储不合法`) }
  assertEnvironmentGroupRules(key, value)
  return Object.freeze(value as EnvironmentGroups[TKey])
}

/**
 * 合同 §3.1：盆器视为完整需已存实测盆器，排水状态非空，且三项尺寸至少一项非空。
 * 只看已保存事实，不推测、不补造。
 */
export function hasCompleteMeasuredPot(pot: Readonly<MeasuredPotProfile> | undefined): boolean {
  if (pot === undefined) { return false }
  return pot.drainageAvailable !== null && [pot.potTopDiameterCm, pot.potBottomDiameterCm, pot.potHeightCm].some(size => size !== null)
}

/** plantLight 存储三列（迁移 030）；三列同空表示未测。 */
export interface PlantLightColumns {
  /** 照度列（DOUBLE）。 */ readonly lux: number | null
  /** 测量时间 UTC 毫秒列。 */ readonly measuredAtMs: number | null
  /** 照度来源列（meter 或 camera_estimate）。 */ readonly source: string | null
}

/** 分组值 → 三列；未设置/清除为三个 null。 */
export function plantLightToColumns(value: PlantLightProfile | null | undefined): PlantLightColumns {
  if (value === null || value === undefined) { return { lux: null, measuredAtMs: null, source: null } }
  const iso = normalizeUtc(value.measuredAt)
  if (iso === null) { throw new TypeError('Lux 测量时间不是合法 UTC 时间') }
  return { lux: value.lux, measuredAtMs: Date.parse(iso), source: value.source }
}

/** 读回三列 → 冻结分组；三列全空返回 undefined；部分为空或取值非法属于数据损坏（失败关闭）。 */
export function plantLightFromColumns(lux: unknown, measuredAtMs: unknown, source: unknown): Readonly<PlantLightProfile> | undefined {
  if ((lux === null || lux === undefined) && (measuredAtMs === null || measuredAtMs === undefined) && (source === null || source === undefined)) { return undefined }
  const luxValue = typeof lux === 'string' ? Number(lux) : lux
  const timeValue = typeof measuredAtMs === 'string' && /^(0|[1-9][0-9]*)$/u.test(measuredAtMs) ? Number(measuredAtMs) : measuredAtMs
  if (typeof luxValue !== 'number' || !Number.isFinite(luxValue) || luxValue < 0 || typeof timeValue !== 'number' || !Number.isSafeInteger(timeValue)
    || (source !== 'meter' && source !== 'camera_estimate')) { throw new TypeError('植物位置 Lux 存储不合法') }
  return Object.freeze({ lux: luxValue, measuredAt: new Date(timeValue).toISOString(), source })
}
