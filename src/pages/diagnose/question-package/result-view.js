import { computed } from 'vue'

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : []).map(item => String(item || '').trim()).filter(Boolean)
    )
  )
}

function formatOutcomeDisplayLabel(outcome = null) {
  if (typeof outcome === 'string') {
    return outcome
      .replace(/根区压力/g, '根部状态不佳')
      .replace(/根部压力/g, '根部状态不佳')
      .replace(/压力/g, '受影响')
      .trim()
  }
  if (!outcome || typeof outcome !== 'object') {
    return ''
  }
  return String(
    outcome.displayNameCn ||
      outcome.displayName ||
      outcome.title ||
      outcome.problemName ||
      outcome.problemKey ||
      outcome.outcomeKey ||
      ''
  )
    .trim()
    .replace(/根区压力/g, '根部状态不佳')
    .replace(/根部压力/g, '根部状态不佳')
    .replace(/压力/g, '受影响')
    .trim()
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

function buildOutcomeAdviceGroups({
  outcomeSources = [],
  getOutcomeItems,
  fallbackItems = [],
  fallbackLabel = '通用建议'
} = {}) {
  const sourceGroups = buildUniqueOutcomesForAdvice(outcomeSources)
    .map((outcome, index) => ({
      key: normalizeOutcomeDisplayKey(outcome, index),
      outcomeLabel: formatOutcomeDisplayLabel(outcome),
      items: uniqueStrings(getOutcomeItems ? getOutcomeItems(outcome) : [])
    }))
    .filter(group => group.outcomeLabel && group.items.length)
  if (sourceGroups.length || !fallbackItems.length) {
    return sourceGroups
  }
  return [{ key: '__fallback__', outcomeLabel: fallbackLabel, items: uniqueStrings(fallbackItems) }]
}

function buildOutcomeActionAdviceItems(outcome = {}) {
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
  return uniqueStrings([
    ...normalizeTextList(outcome?.avoidAdviceItems),
    ...normalizeTextList(outcome?.avoidActions),
    ...normalizeTextList(outcome?.retakeOrEscalate),
    ...normalizeTextList([outcome?.avoid]),
    ...normalizeTextList([outcome?.reassurance]),
    ...normalizeTextList([outcome?.preventionAdvice])
  ])
}

export function useQuestionPackageResultView({ result, payload, routeOptions }) {
  const hasCompletedDiagnosis = computed(
    () => Boolean(result.value) && !result.value.hasActiveQuestions
  )
  const finalOutcome = computed(() => result.value?.finalResult || {})
  const visibleOutcomeSource = computed(() =>
    Array.isArray(result.value?.visibleOutcomes) && result.value.visibleOutcomes.length
      ? result.value.visibleOutcomes
      : Array.isArray(result.value?.finalResult?.visibleOutcomes)
        ? result.value.finalResult.visibleOutcomes
        : []
  )
  const leadingVisibleOutcome = computed(() => visibleOutcomeSource.value[0] || null)
  const outcomeTypeValue = computed(() =>
    String(
      leadingVisibleOutcome.value?.outcomeType ||
        result.value?.outcomeType ||
        finalOutcome.value?.outcomeType ||
        ''
    ).trim()
  )
  const visibleOutcomeDisplays = computed(() =>
    uniqueStrings(visibleOutcomeSource.value.map(formatOutcomeDisplayLabel))
  )
  const hasRouteConvergenceDetails = computed(() => Boolean(visibleOutcomeDisplays.value.length))
  const allOutcomeDisplays = computed(() => visibleOutcomeDisplays.value)
  const outcomeDisplayTitle = computed(() =>
    String(
      formatOutcomeDisplayLabel(leadingVisibleOutcome.value) ||
        formatOutcomeDisplayLabel(finalOutcome.value) ||
        formatOutcomeDisplayLabel(result.value?.mainIssueText) ||
        formatOutcomeDisplayLabel(result.value?.summaryCard?.title) ||
        '诊断已完成'
    ).trim()
  )
  const outcomeSummaryText = computed(() =>
    String(
      formatOutcomeDisplayLabel(leadingVisibleOutcome.value?.summaryCn) ||
        formatOutcomeDisplayLabel(leadingVisibleOutcome.value?.summary) ||
      formatOutcomeDisplayLabel(finalOutcome.value?.summaryCn) ||
        formatOutcomeDisplayLabel(finalOutcome.value?.summary) ||
        formatOutcomeDisplayLabel(result.value?.summaryText) ||
        formatOutcomeDisplayLabel(result.value?.summaryCard?.subtitle) ||
        '系统已根据视觉证据和补充问诊整理出当前结论。'
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
  const isProblematicOutcome = computed(() =>
    ['problematic', 'problem'].includes(outcomeTypeValue.value)
  )
  const isNonProblemOrUncertainOutcome = computed(() =>
    ['non_problematic', 'uncertain', 'out_of_pool_no_mapping'].includes(outcomeTypeValue.value)
  )
  const showNonProblemOutcomeResultCard = computed(
    () => !isProblematicOutcome.value && isNonProblemOrUncertainOutcome.value
  )
  const nonProblemOutcomeSummaryText = computed(() =>
    String(
      outcomeSummaryText.value || outcomeTypeText.value || '当前尚未见到明确问题，建议继续观察。'
    ).trim()
  )
  const confidenceLevelText = computed(() => {
    const level = String(
      result.value?.confidenceLevel || finalOutcome.value?.confidenceLevel || ''
    ).trim()
    return { high: '较高', normal: '一般', medium: '一般', low: '较低' }[level] || level || '一般'
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
        const key = String(
          item?.symptomKey || item?.evidenceKey || item?.key || item?.id || `item_${index}`
        ).trim()
        const label = String(
          item?.symptomCn ||
            item?.label ||
            item?.displayName ||
            item?.evidenceKey ||
            item?.symptomKey ||
            ''
        ).trim()
        if (!key || !label || seen.has(key)) {
          return null
        }
        seen.add(key)
        return { key, label }
      })
      .filter(Boolean)
  })
  const actionAdviceTexts = computed(() => {
    const actionAdvice = result.value?.actionAdvice || {}
    const explanation = result.value?.explanation || result.value?.resultExplanation || {}
    const nextSteps = Array.isArray(result.value?.nextSteps)
      ? result.value.nextSteps.map(item => String(item?.text || '').trim()).filter(Boolean)
      : []
    const structuredAdvice = [
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
    const structuredAdvice = [
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
      fallbackItems: actionAdviceTexts.value,
      fallbackLabel: '建议行动清单'
    })
  )
  const avoidAdviceGroups = computed(() =>
    buildOutcomeAdviceGroups({
      outcomeSources: outcomeAdviceSources.value,
      getOutcomeItems: buildOutcomeAvoidAdviceItems,
      fallbackItems: avoidAdviceTexts.value,
      fallbackLabel: '通用建议'
    })
  )
  const runtimeEnv = import.meta.env || {}
  const routeDebugEnabled =
    runtimeEnv.VITE_APP_ENV === 'development' ||
    (Boolean(runtimeEnv.DEV) && runtimeEnv.VITE_APP_ENV !== 'production')
  const blockedActionExplanations = computed(() =>
    (Array.isArray(result.value?.blockedActionExplanations)
      ? result.value.blockedActionExplanations
      : []
    )
      .map((item, index) => ({
        key: String(item?.actionKey || item?.actionText || `blocked_${index}`).trim(),
        actionText: String(item?.actionText || '').trim(),
        explanation: String(item?.explanation || '').trim()
      }))
      .filter(item => item.actionText || item.explanation)
  )
  const highRiskWarningText = computed(() => String(result.value?.highRiskWarning || '').trim())
  const observationPeriodText = computed(() => String(result.value?.observationPeriod || '').trim())
  const routeDebugDecision = computed(
    () => result.value?.routeDecision || result.value?.__runtimeRouteDecision || null
  )
  const showRouteDebugPanel = computed(() => routeDebugEnabled && Boolean(routeDebugDecision.value))
  const routeDebugSummaryText = computed(() =>
    String(
      routeDebugDecision.value?.decisionCause?.decisionCauseText ||
        result.value?.routeDecisionCause?.decisionCauseText ||
        ''
    ).trim()
  )
  const routeDebugModeText = computed(() => String(routeDebugDecision.value?.mode || '').trim())
  const routeDebugVisibleOutcomeText = computed(() =>
    normalizeArrayText(routeDebugDecision.value?.visibleOutcomeKeys).join(' / ')
  )
  const routeDebugNextQuestionText = computed(() =>
    normalizeArrayText(routeDebugDecision.value?.nextQuestionKeys).join(' / ')
  )
  const routeDebugGroupText = computed(() =>
    normalizeArrayText(routeDebugDecision.value?.activeRouteGroupKeys).join(' / ')
  )
  const routeDebugFallbackPolicy = computed(() =>
    String(routeDebugDecision.value?.fallbackPolicy || '').trim()
  )
  const sessionLabel = computed(() =>
    String(
      result.value?.diagnosisSessionId ||
        payload.value?.diagnosisSessionId ||
        routeOptions.value?.sessionId ||
        '未提供 sessionId'
    ).trim()
  )
  const roundLabel = computed(() =>
    String(
      result.value?.roundId ||
        payload.value?.roundId ||
        routeOptions.value?.roundId ||
        '未提供 roundId'
    ).trim()
  )

  return {
    hasCompletedDiagnosis,
    hasRouteConvergenceDetails,
    outcomeDisplayTitle,
    outcomeSummaryText,
    outcomeTypeText,
    isProblematicOutcome,
    showNonProblemOutcomeResultCard,
    nonProblemOutcomeSummaryText,
    confidenceLevelText,
    allOutcomeDisplays,
    observedItems,
    actionAdviceGroups,
    avoidAdviceGroups,
    blockedActionExplanations,
    highRiskWarningText,
    observationPeriodText,
    showRouteDebugPanel,
    routeDebugSummaryText,
    routeDebugModeText,
    routeDebugVisibleOutcomeText,
    routeDebugNextQuestionText,
    routeDebugGroupText,
    routeDebugFallbackPolicy,
    sessionLabel,
    roundLabel
  }
}
