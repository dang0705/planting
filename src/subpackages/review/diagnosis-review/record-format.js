import { formatDetailLines, formatTime } from './basic-format.js'

export function getVisualRawRecords(detail = null) {
  return Array.isArray(detail?.visualRawRecords) ? detail.visualRawRecords : []
}

export function getQuestionRecords(detail = null) {
  return Array.isArray(detail?.questionRecords) ? detail.questionRecords : []
}

export function getAnswerRevisionEvents(detail = null) {
  if (Array.isArray(detail?.answerRevisionEvents)) {
    return detail.answerRevisionEvents
  }
  return Array.isArray(detail?.questionAnswerEvents) ? detail.questionAnswerEvents : []
}

export function getFirstRoundQuestions(detail = null) {
  const firstRoundQuestions = Array.isArray(detail?.firstRoundQuestions)
    ? detail.firstRoundQuestions
    : []
  if (firstRoundQuestions.length) {
    return firstRoundQuestions
  }

  const questionRecords = getQuestionRecords(detail)
  if (!questionRecords.length) {
    return []
  }
  const firstRoundIndex = Math.min(...questionRecords.map(item => Number(item?.roundIndex || 1)))
  return questionRecords.filter(item => Number(item?.roundIndex || 1) === firstRoundIndex)
}

export function getVisualCandidateLabels(detail = null) {
  const visualAggregateSummary = detail?.coreProcess?.visual?.visualAggregateSummary || null
  const candidates = Array.isArray(visualAggregateSummary?.aggregatedSymptomCandidates)
    ? visualAggregateSummary.aggregatedSymptomCandidates
    : Array.isArray(visualAggregateSummary?.aggregated_symptom_candidates)
      ? visualAggregateSummary.aggregated_symptom_candidates
      : []
  return candidates.map(entry => {
    const label = String(
      entry?.displayNameCn ||
        entry?.display_name_cn ||
        entry?.symptomCn ||
        entry?.symptom_cn ||
        entry?.symptomKey ||
        entry?.symptom_key ||
        ''
    ).trim()
    const symptomKey = String(entry?.symptomKey || entry?.symptom_key || '').trim()
    const band = String(entry?.confidenceBand || entry?.confidence_band || '').trim()
    return [label, symptomKey ? `(${symptomKey})` : '', band ? `[${band}]` : '']
      .filter(Boolean)
      .join(' ')
  })
}

export function formatRawSymptoms(symptoms = []) {
  const rows = (Array.isArray(symptoms) ? symptoms : [])
    .map(item => {
      const symptomKey = String(item?.symptom_key || item?.symptomKey || '').trim()
      const displayName = String(
        item?.display_name_cn || item?.displayNameCn || item?.symptomCn || ''
      ).trim()
      const confidence = String(item?.confidence_band || item?.confidenceBand || '').trim()
      return [
        displayName || symptomKey,
        symptomKey ? `(${symptomKey})` : '',
        confidence ? `[${confidence}]` : ''
      ]
        .filter(Boolean)
        .join(' ')
    })
    .filter(Boolean)
  return formatDetailLines(rows, '无')
}

export function stringifyCompact(value = null) {
  if (value === null || value === undefined || value === '') {
    return '无'
  }
  try {
    return JSON.stringify(value, null, 2).slice(0, 5000)
  } catch {
    return String(value).slice(0, 5000)
  }
}

export function formatVisualSlot(record = {}) {
  const order = Number(record?.inputSlotOrder || 0) + 1
  return `图${order} ${record?.inputSlotLabel || record?.inputSlotType || '未知槽位'}`
}

export function formatPackageTopic(value = '') {
  const normalized = String(value || '').trim()
  const map = {
    visual_presence: '视觉是否存在',
    tissue_integrity: '组织完整性',
    surface_texture: '表面质感',
    underside_presence: '叶背/隐蔽面',
    surface_stickiness: '黏液/蜜露',
    distribution_scope: '分布范围',
    progression: '进展变化',
    host_confirmation: '宿主确认',
    light_exposure: '光照背景',
    watering_context: '浇水背景',
    fertilization_context: '施肥背景',
    substrate_moisture: '盆土湿度'
  }
  return map[normalized] || normalized || '未标注'
}

export function formatPackageSection(value = '') {
  const normalized = String(value || '').trim()
  const map = {
    symptom_confirmation: '症状确认',
    context_probe: '上下文补问',
    differential_probe: '鉴别问题',
    problem_confirmation: '问题确认'
  }
  return map[normalized] || normalized || '未标注'
}

export function formatQuestionAnswer(question = {}) {
  const optionText = String(question?.optionText || '').trim()
  const optionKey = String(question?.optionKey || '').trim()
  const status = String(question?.status || '').trim()
  const effect = String(question?.answerEffect || '').trim()
  const answerText = optionText || optionKey || '未回答'
  return [answerText, status ? `状态：${status}` : '', effect].filter(Boolean).join('；')
}

export function formatResolvedDirectProblemAdjustments(adjustments = []) {
  return (Array.isArray(adjustments) ? adjustments : [])
    .map(item => {
      const problemKey = String(item?.problemKey || item?.problem_key || '').trim()
      return problemKey
    })
    .filter(Boolean)
}

export function formatResolvedAnswerEffect(question = {}) {
  const parts = []
  const resolvedEffectSource = String(question?.resolvedEffectSource || '').trim()
  const resolvedAnswerEffect = String(question?.resolvedAnswerEffect || '').trim()
  const mapsToSymptomKey = String(question?.resolvedMapsToSymptomKey || '').trim()
  const associationStrength = Number(question?.resolvedAssociationStrength)
  const directEffects = formatResolvedDirectProblemAdjustments(
    question?.resolvedDirectProblemAdjustments
  )

  if (
    resolvedAnswerEffect &&
    resolvedAnswerEffect !== String(question?.answerEffect || '').trim()
  ) {
    parts.push(resolvedAnswerEffect)
  }
  if (mapsToSymptomKey) {
    const strengthText =
      Number.isFinite(associationStrength) && associationStrength > 0
        ? `strength ${associationStrength.toFixed(2)}`
        : ''
    parts.push(`症状映射 ${mapsToSymptomKey}${strengthText ? `（${strengthText}）` : ''}`)
  }
  if (directEffects.length) {
    parts.push(`影响 outcome ${directEffects.join('，')}`)
  }
  if (resolvedEffectSource && parts.length) {
    parts.push(`来源 ${resolvedEffectSource}`)
  }
  return parts.join('；')
}

export function formatAnswerRevisionEventType(value = '') {
  const normalized = String(value || '').trim()
  const labels = {
    answer_changed: '修改答案',
    historical_answer_added: '补记历史答案',
    downstream_invalidated: '废弃后续问题'
  }
  return labels[normalized] || normalized || '答案改写'
}

export function formatAnswerRevisionEvent(event = {}) {
  const previousOption = String(event?.previousOptionKey || '').trim() || '未回答'
  const nextOption = String(event?.newOptionKey || '').trim() || '无'
  const revisionText = `revision ${Number(event?.answerRevisionBefore || 0)} -> ${Number(event?.answerRevisionAfter || 0)}`
  const changeText =
    String(event?.eventType || '').trim() === 'downstream_invalidated'
      ? `原答案 ${previousOption} 已废弃`
      : `${previousOption} -> ${nextOption}`
  const dirtyText = event?.dirtyQuestionKey ? `触发题：${event.dirtyQuestionKey}` : ''
  return [revisionText, changeText, dirtyText, event?.createdAt ? formatTime(event.createdAt) : '']
    .filter(Boolean)
    .join('；')
}

export function getObservedSymptomLabels(detail = null) {
  const observedSymptoms = Array.isArray(detail?.coreProcess?.evidence?.observedSymptoms)
    ? detail.coreProcess.evidence.observedSymptoms
    : []
  return observedSymptoms.map(entry =>
    String(entry?.symptomCn || entry?.displayTextCn || entry?.symptomKey || '').trim()
  )
}

export function getObservedEvidenceLabels(detail = null) {
  const observedEvidenceSet = Array.isArray(detail?.coreProcess?.evidence?.observedEvidenceSet)
    ? detail.coreProcess.evidence.observedEvidenceSet
    : []
  return observedEvidenceSet.map(entry =>
    String(entry?.symptomCn || entry?.displayTextCn || entry?.evidenceKey || '').trim()
  )
}

export function getDerivedEvidenceLabels(detail = null) {
  const derivedEvidenceSet = Array.isArray(detail?.coreProcess?.evidence?.derivedEvidenceSet)
    ? detail.coreProcess.evidence.derivedEvidenceSet
    : []
  return derivedEvidenceSet.map(entry =>
    String(entry?.label || entry?.derivedEvidenceKey || entry?.patternKey || '').trim()
  )
}

export function getDiagnosisDirectionLabels(detail = null) {
  const diagnosisDirections = Array.isArray(detail?.coreProcess?.evidence?.diagnosisDirections)
    ? detail.coreProcess.evidence.diagnosisDirections
    : []
  return diagnosisDirections.map(entry => String(entry?.label || entry?.directionKey || '').trim())
}

export function getQuestionPackageSnapshotLabels(detail = null) {
  const questionItems = Array.isArray(
    detail?.coreProcess?.questions?.questionPackageSnapshot?.questionItems
  )
    ? detail.coreProcess.questions.questionPackageSnapshot.questionItems
    : []
  return questionItems.map(entry => {
    const questionText = String(
      entry?.text || entry?.questionText || entry?.questionId || ''
    ).trim()
    const packageTopic = String(entry?.packageTopic || '').trim()
    const status = String(entry?.status || '').trim()
    return [questionText, packageTopic ? `(${packageTopic})` : '', status ? `[${status}]` : '']
      .filter(Boolean)
      .join(' ')
  })
}
