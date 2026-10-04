import Ajv2020 from 'ajv/dist/2020.js'
import { serializeCanonicalJson, type CanonicalJsonObject, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { calculateCandidateContentSha256 } from '../domain/candidate-content-digest.js'
import { validateCandidateReferenceClosure, type CandidateReferenceContent, type VerifiedReferenceDependencies } from '../domain/validate-candidate-reference-closure.js'
import type { KnowledgeReferenceIssue, PublishedSymptomMode, VerifiedClaimRevision } from '../domain/validate-knowledge-references.js'

/** 受控应用接线提供已冻结Schema；不能从HTTP请求或CMS候选正文取得Schema。 */
export interface DiagnosisCandidateSchemas {
  /** 完整候选v1的原始JSON Schema制品。 */
  readonly candidate: object
  /** 包含依赖及候选关系的v1索引Schema，用于检查读回结构。 */
  readonly dependencies: object
}

/** 一次审核准备需要核验的题包及来源主张精确修订，不接受“最新版本”。 */
export interface CandidateDependencyRequest {
  /** 候选明确声明的症状入口与题包发布引用。 */
  readonly symptomModeRefs: readonly PublishedSymptomMode[]
  /** 按精确三元组去重的来源主张，不合并不同修订。 */
  readonly claimRevisions: readonly VerifiedClaimRevision[]
}

/** 真实实现必须独立核验发布状态、来源许可与适用性；不是客户端自报已验证。 */
export interface CandidateDependencyReader {
  /** 每次准备只读取一次相应依赖；读取失败交给受控上层处理。 */
  read(request: CandidateDependencyRequest): Promise<VerifiedReferenceDependencies>
}

/** 内部审核准备结果，不是公开问诊结果或知识发布凭证。 */
export type CandidatePreparation =
  | {
      /** 完整结构及引用已闭合，仍须人工审核、植物适用性与条件语义准入。 */
      readonly status: 'prepared_for_review'
      /** 在异步读取依赖之前锁定的完整内容；包含所有候选字段。 */
      readonly candidate: CanonicalJsonObject
      /** 同一完整内容的规范化SHA-256，不是关系子集的摘要。 */
      readonly contentSha256: string
    }
  | {
      /** 输入或依赖结构非法，拒绝准备。 */
      readonly status: 'invalid_candidate' | 'invalid_dependencies'
    }
  | {
      /** 精确引用未闭合；内部问题路径不可原样进入公开响应。 */
      readonly status: 'invalid_references'
      /** 复用诊断域引用校验器的内部审计分类。 */
      readonly issues: readonly KnowledgeReferenceIssue[]
    }

/** 对已经规范化的纯JSON树递归冻结，不改写正文或数组顺序。 */
function freezeJson(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {freezeJson(child)}
    Object.freeze(value)
  }
}

/**
 * 创建完整候选审核准备用例，编译一次受控Schema而非每次请求重新解析合同。
 * 本用例仅组织已有结构、引用与摘要规则，不配置经验阈值、不调用模型或写数据库。
 * 没有受控来源读取实现和人工审核时，不得将此返回值当作真实知识发布验收。
 */
export function createDiagnosisCandidatePreparation(
  schemas: DiagnosisCandidateSchemas,
  reader: CandidateDependencyReader,
): (input: unknown) => Promise<CandidatePreparation> {
  const ajv = new Ajv2020({ strict: true, allErrors: true })
  const validateCandidate = ajv.compile(schemas.candidate)
  const validateIndex = ajv.compile(schemas.dependencies)
  return async input => {
    let candidate: CanonicalJsonObject
    try {
      // 先拒绝非JSON树；不能由JSON.stringify静默把Date、undefined等改成其他内容。
      candidate = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue)) as CanonicalJsonObject
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {return { status: 'invalid_candidate' }}
      throw error
    }
    if (!validateCandidate(candidate)) {return { status: 'invalid_candidate' }}
    freezeJson(candidate)
    const references = candidate as unknown as CandidateReferenceContent
    const distinctClaims = new Map<string, VerifiedClaimRevision>()
    for (const link of references.claimLinks) {
      const claim = { sourceCode: link.sourceCode, claimCode: link.claimCode, revisionNo: link.revisionNo }
      distinctClaims.set(JSON.stringify([claim.sourceCode, claim.claimCode, claim.revisionNo]), claim)
    }
    const request = { symptomModeRefs: references.symptomModeRefs, claimRevisions: [...distinctClaims.values()] }
    freezeJson(request as unknown as CanonicalJsonValue)
    const dependencies = await reader.read(request)
    const index = {
      ...dependencies,
      causes: references.causes.map(({ causeCode, parentCauseCode }) => ({ causeCode, parentCauseCode })),
      outcomes: references.outcomes.map(({ outcomeCode, causeCode, symptomModeRefs, differentialOutcomeCodes }) =>
        ({ outcomeCode, causeCode, symptomModeRefs, differentialOutcomeCodes })),
      actions: references.actions.map(({ actionCode, riskLevel }) => ({ actionCode, riskLevel })),
      mappings: references.mappings.map(({ mappingCode, outcomeCode, actionCode }) => ({ mappingCode, outcomeCode, actionCode })),
      claimLinks: references.claimLinks,
    }
    if (!validateIndex(index)) {return { status: 'invalid_dependencies' }}
    const issues = validateCandidateReferenceClosure(references, dependencies)
    if (issues.length > 0) {return { status: 'invalid_references', issues }}
    return { status: 'prepared_for_review', candidate, contentSha256: calculateCandidateContentSha256(candidate) }
  }
}
