import { computed } from 'vue'
import { buildSharedOutcomeAdviceGroups } from '../utils/outcome-advice-groups.js'

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : []).map(item => String(item || '').trim()).filter(Boolean)
    )
  )
}

function formatOutcomeDisplayLabel(outcome = null) {
  if (typeof outcome === 'string') {
    return sanitizeOutcomeDisplayLabel(outcome)
  }
  if (!outcome || typeof outcome !== 'object') {
    return ''
  }
  return (
    [outcome.displayNameCn, outcome.displayName, outcome.title, outcome.problemName]
      .map(sanitizeOutcomeDisplayLabel)
      .find(Boolean) || ''
  )
}

function sanitizeOutcomeDisplayLabel(value = '') {
  const label = String(value || '')
    .trim()
    .replace(/根区压力/g, '根部状态不佳')
    .replace(/根部压力/g, '根部状态不佳')
    .replace(/压力/g, '受影响')
    .trim()
  return isMachineDisplayText(label) ? '' : label
}

function isMachineDisplayText(value = '') {
  const text = String(value || '').trim()
  return (
    !text ||
    /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i.test(text) ||
    /^(?:id|key|code|status|token|secret|openid|unionid)(?:[:：_-]|$)/i.test(text)
  )
}

function normalizeArrayText(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function normalizeTextList(values = []) {
  return (Array.isArray(values) ? values : [values])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function isMachineVisualEvidenceLabel(value = '', key = '') {
  const normalizedValue = String(value || '').trim()
  const normalizedKey = String(key || '')
    .trim()
    .toLowerCase()
  if (!normalizedValue) {
    return true
  }
  const lowerValue = normalizedValue.toLowerCase()
  if (normalizedKey && lowerValue === normalizedKey) {
    return true
  }
  return /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i.test(normalizedValue)
}

export function normalizeDisplayEvidenceItem(item = {}, index = 0, source = 'item') {
  const key = String(
    item?.symptomKey ||
      item?.symptom_key ||
      item?.evidenceKey ||
      item?.evidence_key ||
      item?.key ||
      item?.id ||
      `${source}_${index}`
  ).trim()
  const label = String(
    item?.displayNameCn ||
      item?.display_name_cn ||
      item?.symptomCn ||
      item?.symptom_cn ||
      item?.label ||
      item?.displayName ||
      item?.evidenceLabel ||
      item?.evidence_label ||
      ''
  ).trim()
  if (!key || !label || isMachineVisualEvidenceLabel(label, key)) {
    return null
  }
  return {
    key,
    label,
    supportImageCount: Number(item?.supportImageCount || item?.support_image_count || 0)
  }
}

function normalizeOutcomeDisplayKey(outcome = {}, index = 0) {
  return String(
    outcome?.outcomeKey ||
      outcome?.problemKey ||
      outcome?.problemId ||
      outcome?.displayNameCn ||
      outcome?.displayName ||
      outcome?.title ||
      `outcome_${index}`
  ).trim()
}

function buildUniqueOutcomesForAdvice(outcomes = []) {
  const seen = new Set()
  return (Array.isArray(outcomes) ? outcomes : [])
    .map((outcome, index) => ({ outcome, index }))
    .filter(item => item.outcome && typeof item.outcome === 'object')
    .filter(item => {
      const key = normalizeOutcomeDisplayKey(item.outcome, item.index)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .map(item => item.outcome)
}

export function buildOutcomeAdviceGroups({
  outcomeSources = [],
  getOutcomeItems,
  fallbackItems = [],
  fallbackLabel = '通用建议',
  section = 'action',
  getOutcomeActionItems,
  getOutcomeAvoidItems,
  sharedSymptomLabels = []
} = {}) {
  const sourceOutcomes = buildUniqueOutcomesForAdvice(outcomeSources)
  const grouped = buildSharedOutcomeAdviceGroups({
    outcomeSources: sourceOutcomes,
    getOutcomeKey: normalizeOutcomeDisplayKey,
    getOutcomeLabel: formatOutcomeDisplayLabel,
    getActionItems: getOutcomeActionItems || (section === 'action' ? getOutcomeItems : undefined),
    getAvoidItems: getOutcomeAvoidItems || (section === 'avoid' ? getOutcomeItems : undefined),
    sharedSymptomLabels,
    fallbackActionItems: section === 'action' ? fallbackItems : [],
    fallbackAvoidItems: section === 'avoid' ? fallbackItems : [],
    fallbackLabel
  })
  return section === 'avoid' ? grouped.avoidGroups : grouped.actionGroups
}

function buildOutcomeActionAdviceItems(outcome = {}) {
  const structuredItems = Array.isArray(outcome?.actionItems)
    ? outcome.actionItems
        .filter(item => item?.stage !== 'avoid')
        .map(item => item?.text || item?.textCn || item?.text_cn || '')
    : []
  if (structuredItems.length) {
    return uniqueStrings(structuredItems)
  }
  return uniqueStrings([
    ...normalizeTextList(outcome?.actionAdviceItems),
    ...normalizeTextList(outcome?.todayActions),
    ...normalizeTextList(outcome?.threeDayActions),
    ...normalizeTextList(outcome?.sevenDayObserve),
    ...normalizeTextList([outcome?.firstAid]),
    ...normalizeTextList([outcome?.recommendation]),
    ...normalizeTextList([outcome?.actionAdvice])
  ])
}

function buildOutcomeAvoidAdviceItems(outcome = {}) {
  const structuredItems = Array.isArray(outcome?.avoidActionItems)
    ? outcome.avoidActionItems.map(item => item?.text || item?.textCn || item?.text_cn || '')
    : []
  if (structuredItems.length) {
    return uniqueStrings([...structuredItems, ...normalizeTextList(outcome?.retakeOrEscalate)])
  }
  return uniqueStrings([
    ...normalizeTextList(outcome?.avoidAdviceItems),
    ...normalizeTextList(outcome?.avoidActions),
    ...normalizeTextList(outcome?.retakeOrEscalate),
    ...normalizeTextList([outcome?.avoid]),
    ...normalizeTextList([outcome?.reassurance]),
    ...normalizeTextList([outcome?.preventionAdvice])
  ])
}

export function useQuestionPackageResultView({ result, payload }) {
  const finalOutcome = computed(() => result.value?.finalResult || {})
  const outcomeTypeValue = computed(() =>
    String(result.value?.outcomeType || finalOutcome.value?.outcomeType || '').trim()
  )
  const visibleOutcomeSource = computed(() =>
    Array.isArray(result.value?.visibleOutcomes) && result.value.visibleOutcomes.length
      ? result.value.visibleOutcomes
      : Array.isArray(result.value?.finalResult?.visibleOutcomes)
        ? result.value.finalResult.visibleOutcomes
        : []
  )
  const visibleOutcomeDisplays = computed(() =>
    uniqueStrings(visibleOutcomeSource.value.map(formatOutcomeDisplayLabel))
  )
  const allOutcomeDisplays = computed(() => visibleOutcomeDisplays.value)
  const outcomeDisplayTitle = computed(() =>
    String(
      formatOutcomeDisplayLabel(finalOutcome.value) ||
        formatOutcomeDisplayLabel(result.value?.mainIssueText) ||
        formatOutcomeDisplayLabel(result.value?.summaryCard?.title) ||
        '诊断已完成'
    ).trim()
  )
  const outcomeSummaryText = computed(() =>
    String(
      formatOutcomeDisplayLabel(finalOutcome.value?.summaryCn) ||
        formatOutcomeDisplayLabel(finalOutcome.value?.summary) ||
        formatOutcomeDisplayLabel(result.value?.summaryText) ||
        formatOutcomeDisplayLabel(result.value?.summaryCard?.subtitle) ||
        '已根据照片和你的补充信息整理出当前结论。'
    ).trim()
  )
  const outcomeTypeText = computed(() => {
    const labels = {
      problematic: '有问题',
      problem: '可能存在问题',
      non_problematic: '未见明确问题',
      uncertain: '仍需谨慎观察',
      out_of_pool_no_mapping: '诊断范围外的可见异常'
    }
    return labels[outcomeTypeValue.value] || outcomeTypeValue.value || '已生成结论'
  })
  const observedItems = computed(() => {
    const source = [
      ...(Array.isArray(payload.value?.observedSymptoms) ? payload.value.observedSymptoms : []),
      ...(Array.isArray(payload.value?.observedEvidenceSet)
        ? payload.value.observedEvidenceSet
        : []),
      ...(Array.isArray(result.value?.observedSymptoms) ? result.value.observedSymptoms : []),
      ...(Array.isArray(result.value?.observedEvidenceSet) ? result.value.observedEvidenceSet : [])
    ]
    const seen = new Set()
    return source
      .map((item, index) => {
        const normalized = normalizeDisplayEvidenceItem(item, index)
        if (!normalized || seen.has(normalized.key)) {
          return null
        }
        seen.add(normalized.key)
        return normalized
      })
      .filter(Boolean)
  })
  const actionAdviceTexts = computed(() => {
    const actionAdvice = result.value?.actionAdvice || {}
    const explanation = result.value?.explanation || result.value?.resultExplanation || {}
    const nextSteps = Array.isArray(result.value?.nextSteps)
      ? result.value.nextSteps.map(item => String(item?.text || '').trim()).filter(Boolean)
      : []
    const structuredActionItems = Array.isArray(actionAdvice?.actionItems)
      ? actionAdvice.actionItems
          .filter(item => item?.stage !== 'avoid')
          .map(item => String(item?.text || item?.textCn || item?.text_cn || '').trim())
          .filter(Boolean)
      : []
    const structuredAdvice = [
      ...structuredActionItems,
      ...normalizeArrayText(actionAdvice?.todayActions),
      ...normalizeArrayText(actionAdvice?.threeDayActions),
      ...normalizeArrayText(actionAdvice?.sevenDayObserve),
      ...nextSteps
    ]
    const treatmentText = String(result.value?.treatmentText || explanation?.firstAid || '').trim()
    return uniqueStrings([
      ...structuredAdvice,
      ...(!structuredAdvice.length && treatmentText ? [treatmentText] : [])
    ])
  })
  const avoidAdviceTexts = computed(() => {
    const actionAdvice = result.value?.actionAdvice || {}
    const explanation = result.value?.explanation || result.value?.resultExplanation || {}
    const whatToAvoid = Array.isArray(result.value?.whatToAvoid)
      ? result.value.whatToAvoid.map(item => String(item || '').trim()).filter(Boolean)
      : []
    const structuredAvoidItems = Array.isArray(actionAdvice?.avoidActionItems)
      ? actionAdvice.avoidActionItems
          .map(item => String(item?.text || item?.textCn || item?.text_cn || '').trim())
          .filter(Boolean)
      : Array.isArray(actionAdvice?.actionItems)
        ? actionAdvice.actionItems
            .filter(item => item?.stage === 'avoid')
            .map(item => String(item?.text || item?.textCn || item?.text_cn || '').trim())
            .filter(Boolean)
        : []
    const structuredAdvice = [
      ...structuredAvoidItems,
      ...normalizeArrayText(actionAdvice?.avoidActions),
      ...(actionAdvice?.conflictDetected ? normalizeArrayText(actionAdvice?.retakeOrEscalate) : []),
      ...whatToAvoid
    ]
    const preventionText = String(result.value?.preventionText || explanation?.avoid || '').trim()
    return uniqueStrings([
      ...structuredAdvice,
      ...(!structuredAdvice.length && preventionText ? [preventionText] : [])
    ])
  })
  const outcomeAdviceSources = computed(() =>
    buildUniqueOutcomesForAdvice(visibleOutcomeSource.value)
  )
  const actionAdviceGroups = computed(() =>
    buildOutcomeAdviceGroups({
      outcomeSources: outcomeAdviceSources.value,
      getOutcomeItems: buildOutcomeActionAdviceItems,
      section: 'action',
      getOutcomeActionItems: buildOutcomeActionAdviceItems,
      getOutcomeAvoidItems: buildOutcomeAvoidAdviceItems,
      sharedSymptomLabels: observedItems.value,
      fallbackItems: actionAdviceTexts.value,
      fallbackLabel: '通用建议'
    })
  )
  const avoidAdviceGroups = computed(() =>
    buildOutcomeAdviceGroups({
      outcomeSources: outcomeAdviceSources.value,
      getOutcomeItems: buildOutcomeAvoidAdviceItems,
      section: 'avoid',
      getOutcomeActionItems: buildOutcomeActionAdviceItems,
      getOutcomeAvoidItems: buildOutcomeAvoidAdviceItems,
      sharedSymptomLabels: observedItems.value,
      fallbackItems: avoidAdviceTexts.value,
      fallbackLabel: '通用建议'
    })
  )
  return {
    outcomeDisplayTitle,
    outcomeSummaryText,
    outcomeTypeText,
    allOutcomeDisplays,
    observedItems,
    actionAdviceTexts,
    actionAdviceGroups,
    avoidAdviceTexts,
    avoidAdviceGroups
  }
}
