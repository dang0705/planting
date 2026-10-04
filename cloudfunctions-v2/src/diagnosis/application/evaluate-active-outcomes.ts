import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import {
  matchOutcomeEvidence,
  type OutcomeEvidenceMatch,
  type OutcomeEvidenceRules
} from '../domain/match-outcome-evidence.js'
import {
  createReadActiveDiagnosisKnowledge,
  type ActiveDiagnosisKnowledgeDependencies
} from './read-active-diagnosis-knowledge.js'

/** 单一结论的证据检查；满足条件不意味着植物适用、确诊或行动安全。 */
export interface EvaluatedOutcomeEvidence {
  /** 已锁定原包中的稳定结论代码，不由模型自由生成。 */
  readonly outcomeCode: string
  /** 只含规则代码与精确证据引用，不复制原始私有正文。 */
  readonly match: OutcomeEvidenceMatch
}

/** 内部计算结果，不能作为公开诊断 DTO 或完成标记。 */
export type ActiveOutcomeEvaluation =
  | {
      /** 知识不可用，不补旧算法或自由模型结果。 */
      readonly status: 'unavailable'
    }
  | {
      /** 本次原包所有结论的证据条件已计算，未作最终选择。 */
      readonly status: 'evidence_evaluated'
      /** 唯一原发布引用，后续归约必须消费同版。 */
      readonly releaseRef: string
      /** 完整知识包摘要，不能混作候选或结果摘要。 */
      readonly packageSha256: string
      /** 原活动指针版本，保留计算时版本证据。 */
      readonly pointerVersion: number
      /** 保留原包顺序、缺证据及冲突，不按支持数量排序。 */
      readonly outcomes: readonly EvaluatedOutcomeEvidence[]
    }

/** 递归冻结复制的计算输出，不把调用方可变数组交给后续归约。 */
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) {
      freeze(item)
    }
    Object.freeze(value)
  }
}

/**
 * 运行活动知识读取后执行整包证据检查。输入观察须由上游受控归一接纳，
 * 本应用只复核结构；归属、时效、植物适用性及最终行动仍须相应用例核验。
 * 不调用模型、不写结果或事实；短事务在数值/规则计算开始前已经结束。
 */
export function createEvaluateActiveDiagnosisOutcomes<T extends TransactionExecutionContext>(
  deps: ActiveDiagnosisKnowledgeDependencies<T>
) {
  const readKnowledge = createReadActiveDiagnosisKnowledge(deps)
  return async (knowledgeQuery: unknown, findings: unknown): Promise<ActiveOutcomeEvaluation> => {
    const lockedFindings: unknown = JSON.parse(
      serializeCanonicalJson(findings as CanonicalJsonValue)
    )
    // 复用唯一观察合同验证；即使知识不存在，也不把非法观察悄悄补为空数组。
    matchOutcomeEvidence({ required: [], supporting: [], opposing: [] }, lockedFindings)
    freeze(lockedFindings)
    const knowledge = await readKnowledge(knowledgeQuery)
    if (knowledge.status !== 'knowledge_ready') {
      return { status: 'unavailable' }
    }
    const outcomes = knowledge.release.package.candidate.outcomes as unknown as readonly {
      readonly outcomeCode: string
      readonly evidenceRules: OutcomeEvidenceRules
    }[]
    const result: ActiveOutcomeEvaluation = {
      status: 'evidence_evaluated',
      releaseRef: knowledge.release.package.releaseRef,
      packageSha256: knowledge.release.packageSha256,
      pointerVersion: knowledge.pointerVersion,
      outcomes: outcomes.map(outcome => ({
        outcomeCode: outcome.outcomeCode,
        match: matchOutcomeEvidence(outcome.evidenceRules, lockedFindings)
      }))
    }
    freeze(result)
    return result
  }
}
