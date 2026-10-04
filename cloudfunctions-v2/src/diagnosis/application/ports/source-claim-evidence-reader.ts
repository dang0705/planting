import type { CanonicalJsonValue } from '../../../foundation/json/canonical-json-sha256.js'

/** 待核验的精确来源主张引用；拥有此引用不表示已经审核通过。 */
export interface SourceClaimReference {
  /** 稳定来源代码，不是内部数据库主键。 */
  readonly sourceCode: string
  /** 同来源中的稳定主张代码。 */
  readonly claimCode: string
  /** SQL无符号整数修订号；零是否可发布由审核规则决定。 */
  readonly revisionNo: number
}

/** 供受控编辑和审核读取的原始证据，不是公开诊断DTO。 */
export interface SourceClaimEvidence {
  /** 原资料机构或作者的中文说明。 */
  readonly organizationZh: string
  /** 资料的中文标题。 */
  readonly titleZh: string
  /** 原资料定位链接；未经过公开链接白名单准入，不可直接对外展示。 */
  readonly locatorUrl: string
  /** 已登记资料类型，不私设认可类型列表。 */
  readonly sourceType: string
  /** 许可范围原始登记，需审核解析，不能仅凭非空判为合法许可。 */
  readonly licenseScope: string
  /** 来源生命周期；撤回和待核验同样需要供审核读回。 */
  readonly sourceState: 'pending' | 'verified' | 'withdrawn'
  /** 来源核验UTC毫秒，未核验可为null；不猜补时间。 */
  readonly sourceVerifiedAtMs: number | null
  /** 原文支持主张的章节、段落或其他定位。 */
  readonly sourceLocator: string
  /** 受审中文主张原文，只供受控内部用例消费。 */
  readonly claimZh: string
  /** 原始植物与场景适用性JSON；解析语义须由审核合同负责。 */
  readonly applicability: CanonicalJsonValue
  /** 来源主张的支持、反驳、限制或安全角色。 */
  readonly claimRole: 'support' | 'oppose' | 'limit' | 'safety'
  /** 已登记的证据制品摘要；本读取不验证制品文件是否存在。 */
  readonly evidenceSha256: string
  /** 此精确主张修订的人工核验UTC毫秒。 */
  readonly claimVerifiedAtMs: number
}

/** 每个去重后精确引用都有独立结果，不使用其他修订或模糊代码兜底。 */
export type SourceClaimEvidenceResolution =
  | {
      /** 找到可读取记录，不等于具备发布资格。 */
      readonly status: 'found'
      /** 此结果锁定的精确来源和主张修订。 */
      readonly reference: SourceClaimReference
      /** 供后续审核的不可变证据。 */
      readonly evidence: Readonly<SourceClaimEvidence>
    }
  | {
      /** 记录缺失或结构损坏，均不可作为已验证来源使用。 */
      readonly status: 'not_found' | 'invalid_record'
      /** 发生缺口的精确引用，不返回内部主键。 */
      readonly reference: SourceClaimReference
    }

/** 专用证据读取端口；特意与“已验证依赖”端口分开，避免状态字段冒充准入。 */
export interface SourceClaimEvidenceReader {
  /** 一次读取锁定全部精确引用，去重保持首出现顺序，不写表。 */
  read(references: readonly SourceClaimReference[]): Promise<readonly SourceClaimEvidenceResolution[]>
}
