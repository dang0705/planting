function roundPercent(value) {
  return Math.round(Number(value || 0) * 100)
}

export function getHealthStatusText(status) {
  const statusMap = {
    healthy: '健康',
    warning: '轻微问题',
    sick: '需要治疗',
    danger: '需要治疗'
  }
  return statusMap[status] || '待诊断'
}

export function getHealthClass(status) {
  const classes = {
    健康: 'bg-green-100 text-green-700 px-3 py-1 rounded-full',
    轻微问题: 'bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full',
    需要治疗: 'bg-orange-100 text-orange-700 px-3 py-1 rounded-full',
    严重问题: 'bg-red-100 text-red-700 px-3 py-1 rounded-full'
  }
  return classes[status] || classes['健康']
}

export function formatCausalityItem(item) {
  const cause = item?.causeProblemKey || 'unknown'
  const effect = item?.effectProblemKey || 'unknown'
  const strength = Number(item?.relationStrength || 0)
  const note = item?.note ? `，${item.note}` : ''
  return `${cause} → ${effect}（${Math.round(strength * 100)}%）${note}`
}

export function normalizeDiagnosisResult(diagnosisResult, { images = [], plantName = '植物' } = {}) {
  const diagnosis = diagnosisResult || {}
  const healthStatusText = getHealthStatusText(diagnosis.healthStatus)
  const observedSymptoms = Array.isArray(diagnosis.observedSymptoms) ? diagnosis.observedSymptoms : []
  const followUps = Array.isArray(diagnosis.followUps) ? diagnosis.followUps : []
  const rankings = Array.isArray(diagnosis.rankings) ? diagnosis.rankings : []

  return {
    ...diagnosis,
    diagnosisId: diagnosis.diagnosisId || '',
    plantName,
    scientificName: diagnosis.scientificName || '待识别',
    healthStatusText,
    mainIssueText: diagnosis.finalProblemCn || diagnosis.mainIssue || '待进一步确认',
    summaryText: diagnosis.summary || '',
    treatmentText: diagnosis.treatment || '',
    preventionText: diagnosis.prevention || '',
    observedSymptoms,
    observedSymptomText: observedSymptoms.map(item => item.symptomCn || item.symptomKey).filter(Boolean).join('、'),
    rankings,
    followUps,
    followUpRequired: Boolean(diagnosis.needsFollowUp && followUps.length),
    reliabilityText: roundPercent(diagnosis.reliabilityScore || 0),
    problemCausality: Array.isArray(diagnosis.problemCausality) ? diagnosis.problemCausality : [],
    images
  }
}

export function createFollowUpAnswerMap(followUps = []) {
  const entries = {}
  for (const item of followUps || []) {
    if (!item?.symptomKey) continue
    entries[item.symptomKey] = ''
  }
  return entries
}

export function isFollowUpAnswerComplete(followUps = [], answerMap = {}) {
  const activeFollowUps = (followUps || []).filter(item => item?.symptomKey)
  if (!activeFollowUps.length) return false
  return activeFollowUps.every(item => ['yes', 'no'].includes(String(answerMap[item.symptomKey] || '')))
}

export function buildFollowUpPayload(result, answerMap = {}) {
  const observedSymptoms = Array.isArray(result?.observedSymptoms) ? result.observedSymptoms : []
  const followUps = Array.isArray(result?.followUps) ? result.followUps : []

  return {
    diagnosisId: result?.diagnosisId || '',
    observedSymptoms,
    followUpAnswers: followUps
      .filter(item => item?.symptomKey && ['yes', 'no'].includes(String(answerMap[item.symptomKey] || '')))
      .map(item => ({
        symptomKey: item.symptomKey,
        symptomCn: item.symptomCn || '',
        answerValue: answerMap[item.symptomKey],
        answerConfidence: 1
      }))
  }
}
