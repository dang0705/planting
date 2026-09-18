/* oxlint-disable no-unused-vars */
import {
  formatPromptCacheSummary,
  formatPromptTokenCost,
  resolveFullPromptText,
  resolvePromptTokens
} from './prompt-token.js'
import { formatDetailLines } from './basic-format.js'
import {
  formatRawSymptoms,
  getVisualCandidateLabels,
  getVisualRawRecords
} from './record-format.js'

export function formatOutcomeLabel(outcomeType = '') {
  if (outcomeType === 'problematic') {
    return '有问题'
  }
  if (outcomeType === 'non_problematic') {
    return '未见明确问题'
  }
  if (outcomeType === 'uncertain') {
    return '不确定'
  }
  return '未知'
}

export function formatRouteText(routePrimaryAction = '') {
  const key = String(routePrimaryAction || '').trim()
  if (!key || key === 'standard_flow') {
    return '标准流程'
  }
  const routeLabelMap = {
    overwatering_root_pressure_route: '根部状态评估',
    overwatering_root_pressure: '根部状态评估',
    watering_root_pressure_route: '浇水评估',
    watering_route: '浇水评估',
    yellowing_route: '黄叶评估',
    yellowing_airflow_leaf_spot_route: '黄叶与叶斑联合排查',
    leaf_spot_problem_route: '叶斑排查',
    fertilization_route: '施肥评估',
    fertilizer_route: '施肥评估'
  }
  return routeLabelMap[key] || key
}

export function formatSourceLabel(sourceType = '') {
  if (sourceType === 'batch') {
    return '脚本批跑'
  }
  if (sourceType === 'manual') {
    return '真人手动'
  }
  if (sourceType === 'session') {
    return '未归一历史'
  }
  return '未知来源'
}

export function formatSourceEvidenceLabel(sourceEvidence = '') {
  if (sourceEvidence === 'platform_tagged') {
    return '真人小程序诊断（平台标记）'
  }
  if (sourceEvidence === 'openid_inferred_manual') {
    return '真人小程序诊断（openid 推断）'
  }
  if (sourceEvidence === 'web_tagged') {
    return 'Web / H5 调试诊断'
  }
  if (sourceEvidence === 'openid_inferred_session') {
    return '真人小程序诊断（历史推断）'
  }
  return '未归一来源'
}

export function formatFeedbackBinary(value, positiveLabel, negativeLabel) {
  if (value === null || value === undefined) {
    return '未填写'
  }
  return Number(value) ? positiveLabel : negativeLabel
}

export function formatFeedbackVerdict(feedbackSummary = null) {
  const latestFeedback = feedbackSummary?.latestFeedback || null
  if (!latestFeedback) {
    return '暂无回访数据'
  }
  const helpfulText = formatFeedbackBinary(latestFeedback.isHelpful, '有帮助', '无帮助')
  const accurateText = formatFeedbackBinary(latestFeedback.isAccurate, '较准确', '不准确')
  return `${helpfulText} / ${accurateText}`
}

export function formatFeedbackNote(feedbackSummary = null, fallback = '无备注') {
  const note = String(feedbackSummary?.latestFeedback?.note || '').trim()
  return note || fallback
}

export function formatDecisionGovernance(detail = null) {
  const stopState = detail?.coreProcess?.decision?.stopState || null
  const outputEligibility = detail?.coreProcess?.decision?.outputEligibility || null
  const stopReasonType = String(stopState?.stopReasonType || '').trim()
  const conclusionStatus = String(outputEligibility?.conclusionStatus || '').trim()
  const judgment = String(outputEligibility?.judgment || '').trim()
  return [stopReasonType, conclusionStatus, judgment].filter(Boolean).join(' / ') || 'n/a'
}

export function getActionAdviceGovernance(detail = null) {
  const governance = detail?.actionAdviceGovernance || null
  return governance && typeof governance === 'object' ? governance : null
}

export function getGovernedAdvice(detail = null) {
  const advice = getActionAdviceGovernance(detail)?.governedAdvice || null
  return advice && typeof advice === 'object' ? advice : null
}

export function getRawStoredAdvice(detail = null) {
  const advice = getActionAdviceGovernance(detail)?.rawStoredAdvice || null
  return advice && typeof advice === 'object' ? advice : null
}

export function formatAdviceItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item =>
      typeof item === 'string'
        ? String(item || '').trim()
        : String(item?.text || item?.title || item?.label || '').trim()
    )
    .filter(Boolean)
}

export function formatGovernedAdviceSource(source = '') {
  if (source === 'audited_explanation') {
    return '已审核解释表'
  }
  if (source === 'problem_fallback') {
    return '问题主表 fallback'
  }
  if (source === 'governance_fallback') {
    return '治理保守'
  }
  return source || '无正式建议'
}

export function formatAdviceDisplayRecommendation(value = '') {
  if (value === 'show_governed_advice_only') {
    return '只展示 governed advice；raw 仅作审计'
  }
  if (value === 'not_applicable') {
    return '当前结果类型不适用'
  }
  return value || '未声明'
}

export function formatRawAdvicePolicy(value = '') {
  if (value === 'do_not_show_as_governed_advice') {
    return '仅审计原文，不作为正式建议展示'
  }
  return value || '仅审计原文'
}

export function resolveCompareTitle(column = {}) {
  const detail = column?.detail || null
  const row = column?.row || null
  return String(
    detail?.displayName || detail?.finalResult?.displayName || row?.displayName || '诊断记录'
  ).trim()
}

export function resolveFirstVisualRawRecord(detail = null) {
  return getVisualRawRecords(detail)[0] || null
}

export function resolveFirstParsedVisualResult(detail = null) {
  const record = resolveFirstVisualRawRecord(detail)
  return (
    record?.modelParsedResult ||
    record?.rawStructuredOutput?.parsed_result ||
    record?.rawStructuredOutput?.parsedResult ||
    {}
  )
}

export function formatDetailPromptStats(detail = null) {
  const record = resolveFirstVisualRawRecord(detail)
  const audit = record?.llmPromptAudit || detail?.hunyuanPromptAudit || null
  const tokens = resolvePromptTokens(audit)
  const promptLength = Number(
    audit?.promptLength || record?.llmPromptLength || resolveFullPromptText(record).length || 0
  )
  const candidatePoolTextLength = Number(
    audit?.promptDebugMeta?.candidatePoolTextLength ||
      audit?.promptDebugMeta?.candidate_pool_text_length ||
      0
  )
  return [
    `promptLength ${Number.isFinite(promptLength) ? promptLength : 0}`,
    candidatePoolTextLength ? `pool ${candidatePoolTextLength}` : '',
    `tokens ${tokens.prompt}/${tokens.completion}/${tokens.total}`,
    `cache ${formatPromptCacheSummary(audit)}`,
    `cost ${formatPromptTokenCost(record || audit)}`
  ]
    .filter(Boolean)
    .join(' / ')
}

export function formatOutOfPoolCandidates(detail = null) {
  const candidates = Array.isArray(
    resolveFirstParsedVisualResult(detail)?.out_of_pool_symptom_candidates
  )
    ? resolveFirstParsedVisualResult(detail).out_of_pool_symptom_candidates
    : []
  const labels = candidates.map(item => {
    const name = String(
      item?.raw_visual_name_cn ||
        item?.rawVisualNameCn ||
        item?.raw_visual_name_en ||
        item?.rawVisualNameEn ||
        ''
    ).trim()
    const hint = String(item?.closest_symptom_key_hint || item?.closestSymptomKeyHint || '').trim()
    return [name || hint, hint ? `(${hint})` : ''].filter(Boolean).join(' ')
  })
  return formatDetailLines(labels, '无')
}

export function formatVisualRouteHints(detail = null) {
  const visualSummary = detail?.coreProcess?.visual?.visualAggregateSummary || null
  const aggregateHints = Array.isArray(visualSummary?.aggregateRouteHints)
    ? visualSummary.aggregateRouteHints
    : Array.isArray(visualSummary?.aggregate_route_hints)
      ? visualSummary.aggregate_route_hints
      : []
  const rawHints = Array.isArray(resolveFirstParsedVisualResult(detail)?.route_hints)
    ? resolveFirstParsedVisualResult(detail).route_hints
    : []
  const labels = [...aggregateHints, ...rawHints].map(item =>
    [item?.type, item?.reason]
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join(':')
  )
  return formatDetailLines(labels, '无')
}

export function formatQuestionCountSummary(detail = null) {
  const summary =
    detail?.questionCountSummary || detail?.coreProcess?.questions?.questionCountSummary || {}
  return `总 ${Number(summary?.totalItems || 0)} / 已问 ${Number(summary?.askedItems || 0)} / 已答 ${Number(summary?.answeredItems || 0)} / active ${Number(summary?.activeItems || 0)}`
}

export function isPlainRecord(value = null) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
