import Ajv from 'ajv'

import displaySchema from '../../../../docs/backend-v2/contracts/schemas/plant-encyclopedia-display.v1.schema.json'

/** 展示型植物百科中的单条简短问答，不承载养护、诊断或安全事实。 */
export interface EncyclopediaDisplayQuestion {
  /** 面向用户的展示型问题；不得用来提交养护或治疗规则。 */
  readonly question: string
  /** 与问题对应的简短展示回答；发布前仍需人工核实文本语义。 */
  readonly answer: string
}

/** CMS 可审核的展示型植物百科正文；分类身份和内部知识不在此结构中。 */
export interface EncyclopediaDisplayContent {
  /** 简短的植物展示介绍，不是分类学权威结论。 */
  readonly introduction: string
  /** 可观察到的外观概览，不替代植物识别证据。 */
  readonly appearance: string
  /** 面向用户的分布概览，不作为园艺适用范围依据。 */
  readonly distribution: string
  /** 一至三条简短展示问答；数量与字段由已冻结 Schema 校验。 */
  readonly qa: readonly EncyclopediaDisplayQuestion[]
}

/** 草稿通过结构校验后返回的受限内容，仅可进入人工审核流程。 */
export interface ValidEncyclopediaDisplayDraft {
  /** 结构校验通过，不代表文本内容、来源或 CMS 人工审核已通过。 */
  readonly ok: true
  /** 从已校验输入复制的独立内容，避免模型或 CMS 原始对象后续改写。 */
  readonly content: EncyclopediaDisplayContent
}

/** 草稿因未知版本或结构越界被拒绝时的稳定内部结果。 */
export interface InvalidEncyclopediaDisplayDraft {
  /** 未通过结构准入，调用方不得创建 CMS 草稿或发布。 */
  readonly ok: false
  /** 区分版本不受支持与内容结构不合规，不返回原始模型文本或校验细节。 */
  readonly code: 'UNKNOWN_STRUCTURE_VERSION' | 'INVALID_DISPLAY_CONTENT'
}

/** 一次草稿结构准入的确定性结果；不包含 CMS 或模型 Provider 副作用。 */
export type EncyclopediaDisplayDraftValidation =
  | ValidEncyclopediaDisplayDraft
  | InvalidEncyclopediaDisplayDraft

const ajv = new Ajv({ allErrors: true, strict: true })
const validateDisplayContent = ajv.compile<EncyclopediaDisplayContent>(displaySchema)

/**
 * 按仓库唯一展示型 Schema 检查模型或人工草稿的版本与结构。
 * 额外字段、缺失字段、空文本、超长问答和数组中的非法条目均被拒绝；
 * 文本的事实准确性、来源许可及禁区语义仍必须由后续人工审核独立完成。
 */
export function validateEncyclopediaDisplayDraft(
  structureVersion: string,
  content: unknown
): EncyclopediaDisplayDraftValidation {
  if (structureVersion !== displaySchema.$id) {
    return { ok: false, code: 'UNKNOWN_STRUCTURE_VERSION' }
  }
  if (!validateDisplayContent(content)) {
    return { ok: false, code: 'INVALID_DISPLAY_CONTENT' }
  }
  return { ok: true, content: structuredClone(content) }
}
