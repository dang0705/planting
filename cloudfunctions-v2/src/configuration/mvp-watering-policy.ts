import Ajv from 'ajv'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../foundation/json/canonical-json-sha256.js'
import { createConfigurationSnapshot } from './index.js'
import type { ConfigurationSnapshot } from './types.js'

/** 有序数值区间；物理含义由所在字段说明。 */
export interface MvpPolicyRange {
  /** 区间下端（含），物理单位由所在字段说明。 */
  readonly min: number
  /** 区间上端，不小于下端。 */
  readonly max: number
}

/** 单一基质材料的体积含水物性（0～1 体积比）。 */
export interface MvpPolicySubstrate {
  /** 浇透并自由排水后的容器持水量。 */
  readonly containerCapacity: MvpPolicyRange
  /** 植物易利用水；上限不得超过持水量下限。 */
  readonly availableWater: MvpPolicyRange
}

/** V1 九类材料代码；发布正文必须逐一给出物性。 */
const substrateCodes = ['general', 'coco', 'ceramsite', 'peat', 'perlite', 'bark', 'sphagnum', 'gritty', 'coarse_sand'] as const
/** 四个浇水分组；与 resolveMvpMoistureGroup 的分组键一致。 */
const depletionGroups = ['keep_moist', 'surface_dry', 'dry_wet', 'full_dry'] as const
/** 正文字段（参与摘要）；元数据字段不参与摘要。 */
const payloadKeys = ['contractVersion', 'scopeCode', 'confidence', 'sourceRef', 'referencePpfd', 'referenceVpdKpa',
  'lightHalfSaturationPpfd', 'vpdSensitivity', 'transpirationShare', 'validPpfd', 'validVpdKpa', 'indoorVpdFallbackKpa',
  'cultivationRetention', 'soilEvidenceTtlHours', 'remainingFraction', 'depletion', 'substrates', 'headspaceCm', 'leachingFraction',
  'luxPerPpfd', 'luxAnchorMinGhiWm2', 'luxUncertainty', 'luxAnchorMaxAgeDays'] as const

/**
 * `care-watering-mvp/v1` 发布正文与元数据。数值全部来自不可变发布，源码不提供默认值。
 * 取值依据见 models/care/mvp-watering-policy-release.v1.md。
 */
export interface MvpWateringPolicyRelease {
  /** 合同版本号，固定为 care-watering-mvp/v1。 */
  readonly contractVersion: 'care-watering-mvp/v1'
  /** 策略范围代码，固定标识 MVP 浇水策略。 */
  readonly scopeCode: 'care_mvp_watering'
  /** 整体置信度；MVP 固定为低。 */
  readonly confidence: 'low'
  /** 数值依据引用（内部，不对外返回）。 */
  readonly sourceRef: string
  /** 参考条件下的白天平均 PPFD（μmol/(m²·s)）。 */
  readonly referencePpfd: number
  /** 参考空气 VPD（kPa）。 */
  readonly referenceVpdKpa: number
  /** 光响应半饱和 PPFD。 */
  readonly lightHalfSaturationPpfd: number
  /** VPD 对数敏感度（Oren 1999）。 */
  readonly vpdSensitivity: number
  /** 参考条件下蒸腾占整盆失水的份额。 */
  readonly transpirationShare: number
  /** 模型允许的 PPFD 范围，超出视为缺段。 */
  readonly validPpfd: MvpPolicyRange
  /** 模型允许的 VPD 范围，超出视为缺段。 */
  readonly validVpdKpa: MvpPolicyRange
  /** 无室内实测时使用的室内 VPD 估算区间。 */
  readonly indoorVpdFallbackKpa: MvpPolicyRange
  /** 盆器/基质相对参考的保水不确定带。 */
  readonly cultivationRetention: MvpPolicyRange
  /** 盆土证据有效小时数。 */
  readonly soilEvidenceTtlHours: number
  /** 各盆土状态在观察时刻剩余基线比例。 */
  readonly remainingFraction: {
    /** 湿土状态在观察时刻剩余的基线比例。 */
    readonly wet: MvpPolicyRange
    /** 微湿状态在观察时刻剩余的基线比例。 */
    readonly moist: MvpPolicyRange
    /** 只确认表土干时的剩余基线比例。 */
    readonly surfaceDryOnly: MvpPolicyRange
  }
  /** 各浇水分组浇水前已消耗易利用水比例。 */
  readonly depletion: Readonly<Record<typeof depletionGroups[number], MvpPolicyRange>>
  /** 九类基质材料的体积含水物性。 */
  readonly substrates: Readonly<Record<typeof substrateCodes[number], MvpPolicySubstrate>>
  /** 盆口留空高度（cm）。 */
  readonly headspaceCm: MvpPolicyRange
  /** 浇水后从盆底排出的水量比例。 */
  readonly leachingFraction: MvpPolicyRange
  /** 日光下多少 lux 对应 1 μmol/(m²·s) PPFD 的区间（合同 2a 节）。 */
  readonly luxPerPpfd: MvpPolicyRange
  /** 锚点可用的测量时段最低室外 GHI（W/m²）。 */
  readonly luxAnchorMinGhiWm2: number
  /** 各 Lux 来源的相对读数误差（0～1）。 */
  readonly luxUncertainty: {
    /** 照度计读数的相对误差。 */
    readonly meter: number
    /** 摄像头估算读数的相对误差。 */
    readonly camera_estimate: number
  }
  /** Lux 读数可继续使用的最长天数。 */
  readonly luxAnchorMaxAgeDays: number
  /** 不可变发布版本。 */
  readonly releaseVersion: string
  /** 正文规范 JSON 的 SHA-256。 */
  readonly contentSha256: string
  /** 只有 active 可用于请求。 */
  readonly releaseStatus: 'draft' | 'verified' | 'active' | 'retired'
  /** UTC 生效时刻。 */
  readonly effectiveAt: string
  /** 可选 UTC 失效时刻。 */
  readonly expiresAt?: string
}

/** 请求级只读快照。 */
export interface MvpWateringPolicySnapshot extends MvpWateringPolicyRelease {
  /** 调用方指定的 UTC 捕获时刻。 */
  readonly capturedAt: string
  /** 通用不可变配置快照引用。 */
  readonly configurationSnapshot: Readonly<ConfigurationSnapshot>
}

/** 解析结果：失败只返回稳定分类，不披露正文。 */
export type MvpWateringPolicyResolution =
  | {
    /** 解析成功：策略可用。 */
    readonly status: 'available'
    /** 请求级只读策略快照。 */
    readonly snapshot: Readonly<MvpWateringPolicySnapshot>
  }
  | {
    /** 解析未成功：不可用、无效或尚未生效。 */
    readonly status: 'unavailable' | 'invalid' | 'not_effective'
  }

/** UTC 时间格式；另做往返校验。 */
const utcPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'
/** 非负区间 Schema。 */
const range = { type: 'object', additionalProperties: false, required: ['min', 'max'],
  properties: { min: { type: 'number', minimum: 0 }, max: { type: 'number', minimum: 0 } } } as const
/** 0～1 区间 Schema。 */
const fraction = { type: 'object', additionalProperties: false, required: ['min', 'max'],
  properties: { min: { type: 'number', minimum: 0, maximum: 1 }, max: { type: 'number', minimum: 0, maximum: 1 } } } as const
/** 严格发布 Schema；多余字段一律拒绝。 */
const schema = {
  type: 'object', additionalProperties: false,
  required: [...payloadKeys, 'releaseVersion', 'contentSha256', 'releaseStatus', 'effectiveAt'],
  properties: {
    contractVersion: { const: 'care-watering-mvp/v1' }, scopeCode: { const: 'care_mvp_watering' }, confidence: { const: 'low' },
    sourceRef: { type: 'string', pattern: '\\S' },
    referencePpfd: { type: 'number', exclusiveMinimum: 0 }, referenceVpdKpa: { type: 'number', exclusiveMinimum: 0 },
    lightHalfSaturationPpfd: { type: 'number', exclusiveMinimum: 0 }, vpdSensitivity: { type: 'number', exclusiveMinimum: 0 },
    transpirationShare: { type: 'number', minimum: 0, maximum: 1 },
    validPpfd: range, validVpdKpa: range, indoorVpdFallbackKpa: range, cultivationRetention: range,
    soilEvidenceTtlHours: { type: 'number', exclusiveMinimum: 0 },
    remainingFraction: { type: 'object', additionalProperties: false, required: ['wet', 'moist', 'surfaceDryOnly'],
      properties: { wet: fraction, moist: fraction, surfaceDryOnly: fraction } },
    depletion: { type: 'object', additionalProperties: false, required: [...depletionGroups],
      properties: Object.fromEntries(depletionGroups.map(group => [group, fraction])) },
    substrates: { type: 'object', additionalProperties: false, required: [...substrateCodes],
      properties: Object.fromEntries(substrateCodes.map(code => [code, { type: 'object', additionalProperties: false,
        required: ['containerCapacity', 'availableWater'], properties: { containerCapacity: fraction, availableWater: fraction } }])) },
    headspaceCm: range, leachingFraction: fraction,
    luxPerPpfd: range, luxAnchorMinGhiWm2: { type: 'number', exclusiveMinimum: 0 },
    luxUncertainty: { type: 'object', additionalProperties: false, required: ['meter', 'camera_estimate'],
      properties: { meter: { type: 'number', minimum: 0, exclusiveMaximum: 1 }, camera_estimate: { type: 'number', minimum: 0, exclusiveMaximum: 1 } } },
    luxAnchorMaxAgeDays: { type: 'number', exclusiveMinimum: 0 },
    releaseVersion: { type: 'string', pattern: '\\S' }, contentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    releaseStatus: { enum: ['draft', 'verified', 'active', 'retired'] },
    effectiveAt: { type: 'string', pattern: utcPattern }, expiresAt: { type: 'string', pattern: utcPattern },
  },
}
/** 编译一次的校验器。 */
const validate = new Ajv({ strict: true, allErrors: true, strictNumbers: true }).compile<MvpWateringPolicyRelease>(schema)

/** UTC 往返校验；拒绝被自动修正的非法日期。 */
function parseUtc(value: unknown): number | null {
  if (typeof value !== 'string' || !new RegExp(utcPattern).test(value)) { return null }
  const time = Date.parse(value)
  if (!Number.isFinite(time)) { return null }
  const canonical = new Date(time).toISOString()
  return (value.includes('.') ? canonical : canonical.replace('.000Z', 'Z')) === value ? time : null
}

/** 区间有序且（可选）包含某点。 */
const ordered = (value: MvpPolicyRange) => value.max >= value.min
const contains = (outer: MvpPolicyRange, point: number) => point >= outer.min && point <= outer.max

/** Schema 之外的物理与一致性约束。 */
function semanticallyValid(release: MvpWateringPolicyRelease): boolean {
  const ranges = [release.validPpfd, release.validVpdKpa, release.indoorVpdFallbackKpa, release.cultivationRetention,
    release.headspaceCm, release.leachingFraction, release.luxPerPpfd, ...Object.values(release.remainingFraction), ...Object.values(release.depletion)]
  if (release.luxPerPpfd.min <= 0) { return false }
  if (!ranges.every(ordered) || release.cultivationRetention.min <= 0 || release.leachingFraction.max >= 1) { return false }
  if (!contains(release.validPpfd, release.referencePpfd) || !contains(release.validVpdKpa, release.referenceVpdKpa)) { return false }
  if (release.indoorVpdFallbackKpa.min < release.validVpdKpa.min || release.indoorVpdFallbackKpa.max > release.validVpdKpa.max) { return false }
  return Object.values(release.substrates).every(item => ordered(item.containerCapacity) && ordered(item.availableWater)
    && item.availableWater.max <= item.containerCapacity.min)
}

/** 冻结深层对象，保证请求内只读。 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) { deepFreeze(item) }
    Object.freeze(value)
  }
  return value
}

/** 解析显式发布记录；不查询数据库、不回退源码常量。 */
export function resolveMvpWateringPolicy(release: unknown, capturedAt: string): MvpWateringPolicyResolution {
  const now = parseUtc(capturedAt)
  if (now === null) { return { status: 'invalid' } }
  if (release === null || release === undefined) { return { status: 'unavailable' } }
  if (!validate(release)) { return { status: 'invalid' } }
  const effective = parseUtc(release.effectiveAt)
  const expires = release.expiresAt === undefined ? undefined : parseUtc(release.expiresAt)
  const payload = Object.fromEntries(payloadKeys.map(key => [key, release[key]])) as CanonicalJsonObject
  if (effective === null || expires === null || (expires !== undefined && expires <= effective)
    || calculateCanonicalJsonSha256(payload) !== release.contentSha256 || !semanticallyValid(release)) { return { status: 'invalid' } }
  if (release.releaseStatus !== 'active' || (expires !== undefined && now >= expires)) { return { status: 'unavailable' } }
  if (now < effective) { return { status: 'not_effective' } }
  const configurationSnapshot = createConfigurationSnapshot({
    policyReleases: [{ scopeCode: release.scopeCode, releaseVersion: release.releaseVersion, sha256: release.contentSha256 }],
    providerReleases: [], capturedAt,
  })
  return { status: 'available', snapshot: deepFreeze({ ...structuredClone(release), capturedAt, configurationSnapshot }) }
}
