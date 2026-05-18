'use strict'

const { routeSelection: outcomeSelectionConfig } = require('../constants/scoring')

function roundValue(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits))
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function uniqList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function buildActionAdviceSteps(actionAdvice = null) {
  if (!actionAdvice || typeof actionAdvice !== 'object') {return []}
  if (actionAdvice.conflictDetected) {
    return uniqList(
      Array.isArray(actionAdvice.retakeOrEscalate)
        ? actionAdvice.retakeOrEscalate
        : []
    ).map((text, index) => ({
      stepId: `route_conflict_${index + 1}`,
      text,
      type: 'route_conflict_guard',
      priority: index + 1
    }))
  }
  return uniqList([
    ...(Array.isArray(actionAdvice.todayActions) ? actionAdvice.todayActions : []),
    ...(Array.isArray(actionAdvice.threeDayActions) ? actionAdvice.threeDayActions : []),
    ...(Array.isArray(actionAdvice.sevenDayObserve) ? actionAdvice.sevenDayObserve : [])
  ]).map((text, index) => ({
    stepId: `route_action_${index + 1}`,
    text,
    type: 'route_action',
    priority: index + 1
  }))
}

function buildActionAvoidTexts(actionAdvice = null) {
  if (!actionAdvice || typeof actionAdvice !== 'object') {return []}
  return uniqList([
    ...(Array.isArray(actionAdvice.avoidActions) ? actionAdvice.avoidActions : []),
    ...(actionAdvice.conflictDetected && Array.isArray(actionAdvice.retakeOrEscalate)
      ? actionAdvice.retakeOrEscalate
      : [])
  ])
}

function resolvePrimarySymptomClass(symptomClassRuntime = null) {
  if (!symptomClassRuntime || typeof symptomClassRuntime !== 'object') {return null}

  const primaryClass = symptomClassRuntime?.primaryClass
  if (primaryClass && typeof primaryClass === 'object') {
    const classKey = normalizeText(primaryClass.classKey)
    const classNameCn = normalizeText(primaryClass.classNameCn)
    const runtimeNotes = normalizeText(primaryClass.runtimeNotes)
    if (classKey || classNameCn || runtimeNotes) {
      return {
        classKey,
        classNameCn,
        runtimeNotes
      }
    }
  }

  const currentClassKey = normalizeText(symptomClassRuntime?.currentClassKey)
  if (!currentClassKey) {return null}

  return {
    classKey: currentClassKey,
    classNameCn: '',
    runtimeNotes: ''
  }
}

function buildSymptomClassUncertainPrefix(symptomClassRuntime = null) {
  const primaryClass = resolvePrimarySymptomClass(symptomClassRuntime)
  if (!primaryClass) {return ''}

  const classLabel = normalizeText(primaryClass.classNameCn || primaryClass.classKey)
  if (!classLabel) {return ''}

  return `当前已收敛到“${classLabel}”，但还缺少足够的补充事实，暂时不能安全定位到具体原因。`
}

function pickPrimaryOutcome(candidateOutcomes = [], problemMap = new Map()) {
  const allowedRoles = new Set(outcomeSelectionConfig.supportRolesAsTop1)
  for (const item of candidateOutcomes || []) {
    const problem = problemMap.get(item.problemKey)
    const role = problem?.problemRole || ''
    if (allowedRoles.has(role)) {return item}
  }
  return null
}

function buildExplanation(problem, explanationRow) {
  return {
    whyItHappens:
      explanationRow?.whyItHappensCn ||
      problem?.userDefinitionCn ||
      problem?.definition ||
      '',
    whatToCheckNext: explanationRow?.whatToCheckNextCn || '',
    firstAid:
      explanationRow?.firstAidCn ||
      problem?.userActionCn ||
      problem?.defaultAction ||
      '',
    avoid:
      explanationRow?.avoidCn ||
      problem?.userPreventionCn ||
      problem?.defaultPrevention || '',
    reassurance: explanationRow?.reassuranceCn || ''
  }
}

function mapSeverity(problem) {
  return (problem?.severityHintCn || '中').includes('高') ? 'high' : 'medium'
}

function mapUrgency(problem) {
  return (problem?.urgencyHintCn || '中').includes('高') ? 'high' : 'medium'
}

function buildLowConfidenceSummary(displayName, baseSummary, lowConfidence = {}) {
  if (!displayName) {
    return lowConfidence?.isLowConfidence ? '当前证据不足，暂时无法稳定判断。' : baseSummary
  }

  if (!lowConfidence?.isLowConfidence) {
    return baseSummary
  }

  return `当前更像 ${displayName}，但还不够确定。${baseSummary ? ` ${baseSummary}` : ''}`.trim()
}

function buildHighSpecificityFastConvergenceSummary(displayName = '', baseSummary = '') {
  if (!displayName) {
    return baseSummary || '当前证据非常支持问题性方向，可优先按该问题处理。'
  }

  return `当前证据非常支持 ${displayName} 方向，可优先按该问题处理；若后续出现反向证据，再复查。${
    baseSummary ? ` ${baseSummary}` : ''
  }`.trim()
}

function isOutOfPoolNoMappingLowConfidence(lowConfidence = {}) {
  return normalizeText(lowConfidence?.uncertainLegalityReason || '') === 'out_of_pool_no_mapping' ||
    (Array.isArray(lowConfidence?.reasons) &&
      lowConfidence.reasons.some(item => normalizeText(item) === 'out_of_pool_no_mapping'))
}

function isOutOfPoolLowConfidence(lowConfidence = {}) {
  const reasonSet = new Set(
    (Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : [])
      .map(item => normalizeText(item))
      .filter(Boolean)
  )
  const legalityReason = normalizeText(lowConfidence?.uncertainLegalityReason || '')
  return (
    isOutOfPoolNoMappingLowConfidence(lowConfidence) ||
    legalityReason === 'out_of_pool_review_required' ||
    legalityReason === 'out_of_pool_hint_unconfirmed' ||
    reasonSet.has('weak_out_of_pool_proxy_only') ||
    reasonSet.has('out_of_pool_hint_unconfirmed_after_followup')
  )
}

function resolveOutOfPoolObservation(lowConfidence = {}) {
  const observation = lowConfidence?.outOfPoolObservation &&
    typeof lowConfidence.outOfPoolObservation === 'object'
    ? lowConfidence.outOfPoolObservation
    : null
  const observationText = normalizeText(observation?.observationText || '')
  const observationNames = Array.isArray(observation?.observationNames)
    ? observation.observationNames.map(item => normalizeText(item)).filter(Boolean)
    : []
  if (!observationText && !observationNames.length) {return null}
  return {
    observationNames,
    observationText: observationText || observationNames.join('；')
  }
}

function buildUncertainSummary(lowConfidence = {}, symptomClassRuntime = null) {
  if (isOutOfPoolLowConfidence(lowConfidence)) {
    const observation = resolveOutOfPoolObservation(lowConfidence)
    return observation?.observationText
      ? `图片中存在当前自动诊断范围外的可见异常。模型原始观察为：${observation.observationText}。这不是正式诊断结论，系统暂不能给出针对性处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。`
      : '图片中存在当前自动诊断范围外的可见异常。系统无法把它稳定归入现有诊断路径，因此本次不继续常规诊断，也不判断为“暂无明显问题”。由于该异常尚未纳入当前诊断池，系统暂不能给出针对性的处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。'
  }

  const advice = Array.isArray(lowConfidence?.advice)
    ? lowConfidence.advice.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const classPrefix = buildSymptomClassUncertainPrefix(symptomClassRuntime)

  if (classPrefix) {
    return advice.length ? `${classPrefix} ${advice[0]}`.trim() : classPrefix
  }

  if (advice.length) {
    return advice[0]
  }

  return '当前证据不足，暂不能安全判断，建议补充更稳定的图片或观察信息。'
}

function buildUncertainExplanation(lowConfidence = {}, symptomClassRuntime = null) {
  if (isOutOfPoolLowConfidence(lowConfidence)) {
    const observation = resolveOutOfPoolObservation(lowConfidence)
    return {
      whyItHappens: observation?.observationText
        ? `当前图片中有可见异常，但该异常未形成可确认的正式诊断证据。模型原始观察为：${observation.observationText}。`
        : '当前图片中有可见异常，但该异常超出当前自动诊断支持的症状范围，或尚未形成可确认的正式诊断证据。',
      whatToCheckNext: '可继续观察该异常是否扩大、重复出现或影响整体状态；如变化明显，建议由人工或更完整资料进一步确认。',
      firstAid: '在没有稳定归类前，先保持养护条件相对稳定，不建议仅凭本次结果进行针对性处理。',
      avoid: '避免把该异常直接等同于某个具体问题，也避免在缺少确认时大幅调整养护或使用处理措施。',
      reassurance: '跳过常规诊断是为了避免把诊断池外的异常硬套进现有问题。'
    }
  }

  const advice = Array.isArray(lowConfidence?.advice)
    ? lowConfidence.advice.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const primaryClass = resolvePrimarySymptomClass(symptomClassRuntime)
  const classLabel = normalizeText(primaryClass?.classNameCn || primaryClass?.classKey)
  const runtimeNotes = normalizeText(primaryClass?.runtimeNotes)
  const whyItHappens = classLabel
    ? `当前视觉和追问更支持“${classLabel}”这一症状模式，但具体 root cause 仍缺少关键上下文，继续硬判风险较高。`
    : '当前证据不足或仍有冲突，继续硬判具体问题风险较高。'
  const whatToCheckNext = uniqList([
    advice[0],
    runtimeNotes
  ]).join(' ')

  return {
    whyItHappens,
    whatToCheckNext:
      whatToCheckNext ||
      '建议补拍整株、受损部位特写、叶背和盆土状态后重新判断。',
    firstAid:
      advice[1] ||
      '先保持当前养护稳定，避免一次性大幅调整浇水、施肥或用药。',
    avoid: '不要在证据不足时立即大幅调整养护或连续使用药剂。',
    reassurance: '暂不硬判是当前更安全的输出。'
  }
}

function buildUncertainFinalResult({ resultId, lowConfidence = {} } = {}) {
  if (isOutOfPoolLowConfidence(lowConfidence)) {
    return {
      resultId,
      problemId: '',
      displayName: '发现诊断范围外的可见异常',
      summary: buildUncertainSummary(lowConfidence),
      severity: 'low',
      urgency: 'low',
      outOfPoolObservation: resolveOutOfPoolObservation(lowConfidence)
    }
  }

  return {
    resultId,
    problemId: '',
    displayName: '暂不能稳定判断',
    summary: buildUncertainSummary(lowConfidence),
    severity: 'low',
    urgency: 'medium'
  }
}

function resolveOutcomeType({
  followUpRequired = false,
  lowConfidence = {},
  stopDecision = null
} = {}) {
  if (followUpRequired) {return null}

  const lockedOutcomeType = normalizeText(stopDecision?.outcomeLocked || '', '')
  if (lockedOutcomeType === 'uncertain') {
    return 'uncertain'
  }
  if (lockedOutcomeType === 'problematic' || lockedOutcomeType === 'non_problematic') {
    return lockedOutcomeType
  }

  return lowConfidence?.uncertainLegalityReason ? 'uncertain' : 'problematic'
}

function resolveRoutePrimaryAction({
  followUpRequired = false,
  outcomeType = null,
  preferredRoutePrimaryAction = ''
} = {}) {
  if (preferredRoutePrimaryAction === 'retake_first') {return 'retake_first'}
  if (followUpRequired) {return 'ask_first'}
  if (outcomeType === 'uncertain') {return 'uncertain_prepare'}
  return 'standard_flow'
}

function resolveStopReason({ followUpRequired = false, stopDecision = null } = {}) {
  if (followUpRequired) {return 'await_follow_up'}
  return normalizeText(stopDecision?.stopReason || '', '')
}

module.exports = {
  buildActionAdviceSteps,
  buildActionAvoidTexts,
  buildExplanation,
  buildHighSpecificityFastConvergenceSummary,
  buildLowConfidenceSummary,
  buildUncertainExplanation,
  buildUncertainFinalResult,
  buildUncertainSummary,
  mapSeverity,
  mapUrgency,
  normalizeText,
  pickPrimaryOutcome,
  resolveOutcomeType,
  resolveRoutePrimaryAction,
  resolveStopReason,
  roundValue,
  uniqList
}
