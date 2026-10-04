import Ajv, { type JSONSchemaType } from 'ajv'
import { calculateCanonicalJsonSha256 } from '../foundation/json/canonical-json-sha256.js'
import { createConfigurationSnapshot } from './index.js'
import type { ConfigurationSnapshot } from './types.js'
import type { TransmissionEvidence } from '../care/application/replay-indoor-natural-light.js'

/** MVP玻璃策略载荷；数值来自版本发布，代码不提供候选默认。 */
export interface MvpGlassPolicyRelease {
  /** 当前MVP玻璃分类策略的字段合同版本。 */
  contractVersion: 'mvp-glass-policy/v1'
  /** 玻璃近似策略的独立范围。 */
  scopeCode: 'care_mvp_glass'
  /** 普通透明玻璃宽带损失代理，不宣称真实PAR测量。 */
  approximation: 'clear_glass_broadband_proxy'
  /** 单层近似有效透射率，零至一。 */
  singleTransmission: number
  /** 双层近似有效透射率，零至一。 */
  doubleTransmission: number
  /** 数值依据与适用范围的来源引用。 */
  sourceRef: string
  /** 不可变发布版本。 */
  releaseVersion: string
  /** 规范键排序正文的SHA-256，与策略发布表一致。 */
  contentSha256: string
  /** 只有活动版本可用于请求解析。 */
  releaseStatus: 'draft' | 'verified' | 'active' | 'retired'
  /** 明确UTC的生效时刻。 */
  effectiveAt: string
  /** 可选明确UTC失效时刻；不接受null。 */
  expiresAt?: string
}

/** 固定一次请求的玻璃参数及版本，不读取活动指针或自动声明生产准入。 */
export interface MvpGlassPolicySnapshot extends Readonly<MvpGlassPolicyRelease> {
  /** 调用方明确指定的合法UTC捕获时刻。 */
  readonly capturedAt: string
  /** 通用不可变配置引用，复用既有配置快照设施。 */
  readonly configurationSnapshot: Readonly<ConfigurationSnapshot>
}

/** 失败结果仅返回稳定分类，不披露输入策略正文。 */
export type MvpGlassPolicyResolution =
  | {
      /** 当前策略结构、摘要与生效时间全部通过校验。 */
      status: 'available'
      /** 本次请求锁定的只读玻璃策略及配置引用。 */
      snapshot: Readonly<MvpGlassPolicySnapshot>
    }
  | {
      /** 没有活动版本、记录非法或策略尚未生效的稳定分类。 */
      status: 'unavailable' | 'invalid' | 'not_effective'
    }

/** 用户只确认玻璃层数；null表示尚未确认，不代表默认单层。 */
export type MvpGlassLayer = 'single' | 'double' | null

/** 日期必须含UTC标记，另以往返校验拒绝非法日历日期。 */
const utcPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'
/** 严格类型化发布Schema；数值仅约束物理区间，不内置运营参数。 */
export const mvpGlassPolicySchema: JSONSchemaType<MvpGlassPolicyRelease> = {
  type: 'object', additionalProperties: false,
  required: ['contractVersion', 'scopeCode', 'approximation', 'singleTransmission', 'doubleTransmission', 'sourceRef', 'releaseVersion', 'contentSha256', 'releaseStatus', 'effectiveAt'],
  properties: {
    contractVersion: { type: 'string', const: 'mvp-glass-policy/v1' },
    scopeCode: { type: 'string', const: 'care_mvp_glass' },
    approximation: { type: 'string', const: 'clear_glass_broadband_proxy' },
    singleTransmission: { type: 'number', minimum: 0, maximum: 1 },
    doubleTransmission: { type: 'number', minimum: 0, maximum: 1 },
    sourceRef: { type: 'string', pattern: '\\S' },
    releaseVersion: { type: 'string', pattern: '\\S' },
    contentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    releaseStatus: { type: 'string', enum: ['draft', 'verified', 'active', 'retired'] },
    effectiveAt: { type: 'string', pattern: utcPattern },
    expiresAt: { type: 'string', pattern: utcPattern, nullable: true },
  },
}
/** 编译一次校验器，不为每次调用新建解析实例。 */
const validate = new Ajv({ strict: true, allErrors: true, strictNumbers: true }).compile(mvpGlassPolicySchema)

/** 仅对载荷字段计算规范JSON摘要；键排序复用既有策略发布规范。 */
export function calculateMvpGlassPolicySha256(policy: Pick<MvpGlassPolicyRelease, 'contractVersion' | 'scopeCode' | 'approximation' | 'singleTransmission' | 'doubleTransmission' | 'sourceRef'>): string {
  return calculateCanonicalJsonSha256({
    contractVersion: policy.contractVersion, scopeCode: policy.scopeCode,
    approximation: policy.approximation, singleTransmission: policy.singleTransmission,
    doubleTransmission: policy.doubleTransmission, sourceRef: policy.sourceRef,
  })
}

/** UTC日期往返校验；拒绝Date.parse将2月30日等自动修正。 */
function parseUtc(value: unknown): number | null {
  if (typeof value !== 'string' || !new RegExp(utcPattern).test(value)) {return null}
  const time = Date.parse(value)
  if (!Number.isFinite(time)) {return null}
  const canonical = new Date(time).toISOString()
  return (value.includes('.') ? canonical : canonical.replace('.000Z', 'Z')) === value ? time : null
}

/** 解析显式发布记录；不查询数据库、不发布参数、不回退源码常量。 */
export function resolveMvpGlassPolicy(release: unknown, capturedAt: string): MvpGlassPolicyResolution {
  const now = parseUtc(capturedAt)
  if (now === null) {return { status: 'invalid' }}
  if (release === null || release === undefined) {return { status: 'unavailable' }}
  if (!validate(release)) {return { status: 'invalid' }}
  const effective = parseUtc(release.effectiveAt)
  const expires = release.expiresAt === undefined ? undefined : parseUtc(release.expiresAt)
  if (effective === null || expires === null || (expires !== undefined && expires <= effective) || calculateMvpGlassPolicySha256(release) !== release.contentSha256) {return { status: 'invalid' }}
  if (release.releaseStatus !== 'active' || (expires !== undefined && now >= expires)) {return { status: 'unavailable' }}
  if (now < effective) {return { status: 'not_effective' }}
  const configurationSnapshot = createConfigurationSnapshot({
    policyReleases: [{ scopeCode: release.scopeCode, releaseVersion: release.releaseVersion, sha256: release.contentSha256 }],
    providerReleases: [], capturedAt,
  })
  return { status: 'available', snapshot: Object.freeze({ ...release, capturedAt, configurationSnapshot }) }
}

/** 将用户层数转为既有双通道损失输入；未知保留缺值，专业接口无需改变。 */
export function selectMvpGlassTransmission(snapshot: Readonly<MvpGlassPolicySnapshot>, layer: MvpGlassLayer): TransmissionEvidence {
  if (layer !== null && layer !== 'single' && layer !== 'double') {throw new TypeError('玻璃层数必须为单层、双层或未确认')}
  const value = layer === null ? null : layer === 'single' ? snapshot.singleTransmission : snapshot.doubleTransmission
  const range = value === null ? null : Object.freeze({ lower: value, upper: value })
  return Object.freeze({ sourceRef: `${snapshot.sourceRef}#${snapshot.releaseVersion}:${snapshot.contentSha256}`, direct: range, diffuse: range })
}
