'use strict'

const { safeJsonParse } = require('../../utils/stored-value')
const {
  normalizeReviewDirectProblemAdjustments,
  normalizeReviewNullableNumber
} = require('./normalizers')

function mapDiagnosisFollowUpReviewRow(row = {}) {
  const rationale = safeJsonParse(row.rationale, {}) || {}
  const roundIndex = Math.max(1, Number(rationale.r || rationale.round || 1))
  const optionKey = String(row.answer_value || '').trim()
  const rationaleOptionText = (Array.isArray(rationale?.opts) ? rationale.opts : [])
    .map(item => ({
      optionKey: String(item?.k || item?.optionKey || '').trim(),
      optionText: String(item?.t || item?.text || '').trim()
    }))
    .find(item => item.optionKey === optionKey)?.optionText || ''

  return {
    id: Number(row.id || 0),
    diagnosisId: String(row.diagnosis_id || '').trim(),
    questionOrder: Number(row.question_order || 0),
    roundIndex,
    questionKey: String(row.symptom_key || '').trim(),
    targetSymptomKey: String(row.target_symptom_key || rationale.tsk || '').trim(),
    targetDimension: String(row.target_dimension || rationale.td || '').trim(),
    routingScope: String(row.routing_scope || rationale.rs || '').trim(),
    questionRole: String(row.question_role || rationale.qr || '').trim(),
    questionCategory: String(row.question_role || rationale.qr || '').trim(),
    effectMode: String(row.effect_mode || rationale.em || '').trim(),
    questionGroupKey: String(row.question_group_key || rationale.qg || '').trim(),
    questionText: String(row.question_text || row.question_text_user_cn || row.question_text_cn || '').trim(),
    optionKey,
    optionText: String(rationaleOptionText || row.option_text_user_cn || row.option_text_cn || row.answer_value || '').trim(),
    optionValue:
      row.option_value === null || row.option_value === undefined || row.option_value === ''
        ? null
        : Number(row.option_value),
    mapsToSymptomKey: String(row.maps_to_symptom_key || '').trim(),
    answerEffect: String(row.answer_effect_cn || '').trim(),
    resolvedMapsToSymptomKey: String(row.resolved_maps_to_symptom_key || row.maps_to_symptom_key || '').trim(),
    resolvedOptionValue: normalizeReviewNullableNumber(row.resolved_option_value ?? row.option_value),
    resolvedAssociationStrength: normalizeReviewNullableNumber(row.resolved_association_strength),
    resolvedAnswerEffect: String(row.resolved_answer_effect_cn || row.answer_effect_cn || '').trim(),
    resolvedDirectProblemAdjustments: normalizeReviewDirectProblemAdjustments(
      safeJsonParse(row.resolved_direct_problem_adjustments_json, [])
    ),
    resolvedEffectSource: String(row.resolved_effect_source || '').trim(),
    answerConfidence:
      row.answer_confidence === null || row.answer_confidence === undefined || row.answer_confidence === ''
        ? null
        : Number(row.answer_confidence),
    status: String(row.status || '').trim(),
    asked: Number(row.asked || 0) ? 1 : 0,
    rationale,
    createdAt: String(row.created_at || '').trim(),
    answeredAt: String(row.answered_at || '').trim()
  }
}

function indexSyntheticFollowUpOptionMappings(optionMappings = []) {
  const map = new Map()
  for (const item of Array.isArray(optionMappings) ? optionMappings : []) {
    const questionKey = String(item?.questionKey || '').trim()
    const optionKey = String(item?.optionKey || '').trim()
    if (!questionKey || !optionKey) {continue}
    map.set(`${questionKey}::${optionKey}`, item)
  }
  return map
}

function applySyntheticFollowUpReviewFallback(row = {}, syntheticMappingIndex = new Map()) {
  const questionKey = String(row?.symptom_key || '').trim()
  const optionKey = String(row?.answer_value || '').trim()
  if (!questionKey || !optionKey) {return row}

  const mapping = syntheticMappingIndex.get(`${questionKey}::${optionKey}`)
  if (!mapping) {return row}

  const next = { ...row }
  const resolvedDirectProblemAdjustments = normalizeReviewDirectProblemAdjustments(
    mapping.directProblemAdjustments
  )
  next.resolved_direct_problem_adjustments_json = JSON.stringify(resolvedDirectProblemAdjustments)
  next.resolved_effect_source = String(mapping.dataStatus || mapping.reviewStatus || 'resolved').trim()
  next.resolved_maps_to_symptom_key = String(mapping.mapsToSymptomKey || next.maps_to_symptom_key || '').trim()
  next.resolved_option_value = normalizeReviewNullableNumber(mapping.value)
  next.resolved_association_strength = normalizeReviewNullableNumber(mapping.associationStrength)
  next.resolved_answer_effect_cn = String(mapping.answerEffectCn || next.answer_effect_cn || '').trim()
  if (!String(next.option_text_cn || '').trim()) {
    next.option_text_cn = mapping.optionTextCn || mapping.optionTextUserCn || optionKey
  }
  if (!String(next.option_text_user_cn || '').trim()) {
    next.option_text_user_cn = mapping.optionTextUserCn || mapping.optionTextCn || optionKey
  }
  if (
    next.option_value === null ||
    next.option_value === undefined ||
    next.option_value === ''
  ) {
    next.option_value = mapping.value
  }
  if (!String(next.maps_to_symptom_key || '').trim()) {
    next.maps_to_symptom_key = mapping.mapsToSymptomKey || ''
  }
  if (!String(next.answer_effect_cn || '').trim()) {
    next.answer_effect_cn = mapping.answerEffectCn || ''
  }
  return next
}

module.exports = {
  mapDiagnosisFollowUpReviewRow,
  indexSyntheticFollowUpOptionMappings,
  applySyntheticFollowUpReviewFallback
}
