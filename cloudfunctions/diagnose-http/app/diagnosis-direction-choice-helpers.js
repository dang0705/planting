'use strict'

const {
  PEST_EVIDENCE_RULES,
  PEST_MODE_KEYS
} = require('../domain/diagnosis-mode-registry')
const { evidenceGroupForKey } = require('../domain/diagnosis-mode-router')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

const SINGLE_SELECTED_MODE_COUNT = 1

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeKey(value = '', conservative = '') {
  return normalizeText(value, conservative).toLowerCase()
}

function normalizeDirectionChoiceMode(payload = {}) {
  const choice = payload?.directionChoice || payload?.direction_choice || {}
  return normalizeText(
    payload.selectedModeKey ||
      payload.selected_mode_key ||
      payload.modeKey ||
      payload.mode_key ||
      choice.modeKey ||
      choice.mode_key ||
      choice.problemKey ||
      choice.problem_key ||
      ''
  )
}

function selectedDirectionKey(payload = {}) {
  return normalizeDirectionChoiceMode(payload)
}

function isDirectionChoicePayload({ requestMode = '', payload = {} } = {}) {
  return (
    normalizeText(requestMode) === 'direction_choice' ||
    Boolean(normalizeDirectionChoiceMode(payload))
  )
}

function directionChoicesFromRoute(routeResult = {}) {
  return Array.isArray(routeResult?.directionChoices) ? routeResult.directionChoices : []
}

function directionChoicesFromState(...states) {
  const merged = []
  const seen = new Set()
  for (const state of states) {
    const choices = Array.isArray(state?.directionChoices) ? state.directionChoices : []
    for (const choice of choices) {
      const key = normalizeText(choice?.modeKey || choice?.directionKey || choice?.problemKey || '')
      if (!key || seen.has(key)) {
        continue
      }
      seen.add(key)
      merged.push(choice)
    }
  }
  return merged
}

function findDirectionChoice(routeResult = {}, selectedKey = '') {
  return directionChoicesFromRoute(routeResult).find(
    item =>
      normalizeText(item?.modeKey || '') === selectedKey ||
      normalizeText(item?.directionKey || '') === selectedKey
  )
}

function findDirectionChoiceInList(choices = [], selectedKey = '') {
  return (Array.isArray(choices) ? choices : []).find(
    item =>
      normalizeText(item?.modeKey || '') === selectedKey ||
      normalizeText(item?.directionKey || '') === selectedKey
  )
}

function assertAllowedDirectionChoice(routeResult = {}, selectedKey = '', fallbackChoices = []) {
  const choices = directionChoicesFromRoute(routeResult)
  if (
    !findDirectionChoice(routeResult, selectedKey) &&
    !findDirectionChoiceInList(fallbackChoices, selectedKey)
  ) {
    throw Object.assign(new Error('所选诊断方向不属于当前会话'), { statusCode: 400 })
  }
  return choices
}

function normalizePestModeKeys(items = []) {
  return Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map(item => normalizeText(item))
        .filter(modeKey => PEST_MODE_KEYS.includes(modeKey))
    )
  )
}

function readArray(source = {}, snakeKey = '', camelKey = '') {
  if (Array.isArray(source?.[snakeKey])) {
    return source[snakeKey]
  }
  if (Array.isArray(source?.[camelKey])) {
    return source[camelKey]
  }
  return []
}

function mergeAggregateSources(...sources) {
  const merged = {}
  for (const source of sources) {
    if (source && typeof source === 'object') {
      Object.assign(merged, source)
    }
  }
  return Object.keys(merged).length ? merged : null
}

function resolveAggregateForDirectionChoice(refreshedSessionState = {}, sessionState = {}) {
  return mergeAggregateSources(
    refreshedSessionState.visualAggregateResult,
    sessionState.visualAggregateResult,
    refreshedSessionState.visualAggregateSummary,
    sessionState.visualAggregateSummary,
    refreshedSessionState.runtimeSnapshot?.visualAggregateResult,
    sessionState.runtimeSnapshot?.visualAggregateResult,
    refreshedSessionState.runtimeSnapshot?.visualAggregateSummary,
    sessionState.runtimeSnapshot?.visualAggregateSummary
  )
}

function candidateMapFromAggregate(aggregateResult = null) {
  const candidates = readArray(
    aggregateResult,
    'aggregated_symptom_candidates',
    'aggregatedSymptomCandidates'
  )
  return new Map(
    candidates
      .map(candidate => [
        normalizeKey(candidate?.symptom_key || candidate?.symptomKey || ''),
        candidate
      ])
      .filter(([key]) => key)
  )
}

function evidenceMatchesRuleGroup(group = [], evidenceKey = '') {
  const key = normalizeKey(evidenceKey)
  return Array.isArray(group) && group.map(normalizeKey).includes(key)
}

function pestModesForEvidenceKey(evidenceKey = '', selectedModeKeys = []) {
  const selectedSet = new Set(normalizePestModeKeys(selectedModeKeys))
  const matched = []
  for (const modeKey of PEST_MODE_KEYS) {
    if (selectedSet.size && !selectedSet.has(modeKey)) {
      continue
    }
    const rule = PEST_EVIDENCE_RULES[modeKey]
    if (!rule) {
      continue
    }
    const groups = [
      ...(Array.isArray(rule.directGroups) ? rule.directGroups : []),
      ...(Array.isArray(rule.candidateGroups) ? rule.candidateGroups : []),
      ...(Array.isArray(rule.indirectGroups) ? rule.indirectGroups : [])
    ]
    if (groups.some(group => evidenceMatchesRuleGroup(group, evidenceKey))) {
      matched.push(modeKey)
    }
  }
  return matched
}

function normalizeAdmittedVisualEvidenceLedgerItem({
  record = {},
  candidate = {},
  evidenceKey = '',
  modeKey = ''
} = {}) {
  const key = normalizeKey(
    evidenceKey ||
      record?.object_key ||
      record?.objectKey ||
      candidate?.symptom_key ||
      candidate?.symptomKey ||
      ''
  )
  const diagnosisMode = normalizeKey(modeKey)
  if (!key || !PEST_MODE_KEYS.includes(diagnosisMode)) {
    return null
  }
  const regionRef = normalizeCaptureRegion(
    candidate?.primary_capture_region ||
      candidate?.primaryCaptureRegion ||
      candidate?.region_ref ||
      candidate?.regionRef ||
      candidate?.capture_region ||
      candidate?.captureRegion ||
      record?.region_ref ||
      record?.regionRef ||
      ''
  )
  const imageId =
    normalizeText(candidate?.primary_support_image_id || candidate?.primarySupportImageId || '') ||
    normalizeText(
      Array.isArray(candidate?.support_image_ids) ? candidate.support_image_ids[0] : ''
    ) ||
    normalizeText(Array.isArray(candidate?.supportImageIds) ? candidate.supportImageIds[0] : '') ||
    normalizeText(record?.image_id || record?.imageId || '')
  return {
    evidenceKey: key,
    symptomKey: key,
    evidenceGroup: evidenceGroupForKey(
      candidate?.evidence_group || candidate?.evidenceGroup || key
    ),
    confidenceBand: normalizeKey(
      candidate?.confidence_band || candidate?.confidenceBand || 'medium'
    ),
    strengthLevel: normalizeKey(candidate?.strength_level || candidate?.strengthLevel || 'medium'),
    imageId,
    regionRef,
    sourceRecordId: normalizeText(
      record?.visual_admission_record_id ||
        record?.visualAdmissionRecordId ||
        record?.visual_normalized_image_result_id ||
        record?.visualNormalizedImageResultId ||
        candidate?.source_record_id ||
        candidate?.sourceRecordId ||
        ''
    ),
    currentStatus: 'active',
    evidenceKind: normalizeKey(candidate?.evidenceKind || candidate?.evidence_kind || 'indirect'),
    diagnosisMode,
    modeKey: diagnosisMode,
    routeEvidenceRole: 'confirmation_support',
    sourceType: 'visual_mode_router',
    suppressEquivalentQuestion: true,
    lockedInQuestionnaire: true,
    requiresUserConfirmation: false
  }
}

function buildVisualAdmittedEvidenceLedger({ aggregateResult = null, selectedModeKeys = [] } = {}) {
  if (!aggregateResult || typeof aggregateResult !== 'object') {
    return []
  }
  const candidatesByKey = candidateMapFromAggregate(aggregateResult)
  const result = []
  for (const record of readArray(aggregateResult, 'admission_records', 'admissionRecords')) {
    if (
      normalizeKey(record?.admission_result || record?.admissionResult || '') !==
      'formally_admitted'
    ) {
      continue
    }
    const evidenceKey = normalizeKey(record?.object_key || record?.objectKey || '')
    if (!evidenceKey) {
      continue
    }
    const candidate = record?.candidate || candidatesByKey.get(evidenceKey) || {}
    for (const modeKey of pestModesForEvidenceKey(evidenceKey, selectedModeKeys)) {
      const item = normalizeAdmittedVisualEvidenceLedgerItem({
        record,
        candidate,
        evidenceKey,
        modeKey
      })
      if (item) {
        result.push(item)
      }
    }
  }
  return mergeEvidenceLedgers(result)
}

function mergeEvidenceLedgers(...ledgers) {
  const merged = new Map()
  for (const item of ledgers.flat()) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const evidenceKey = normalizeKey(item.evidenceKey || item.evidence_key || item.symptomKey)
    const modeKey = normalizeKey(item.diagnosisMode || item.diagnosis_mode || item.modeKey)
    const role = normalizeKey(item.routeEvidenceRole || item.route_evidence_role || '')
    if (!evidenceKey && !modeKey) {
      continue
    }
    const key = `${modeKey || '__mode__'}::${evidenceKey || '__evidence__'}::${role}`
    if (!merged.has(key)) {
      merged.set(key, {
        ...item,
        evidenceKey: evidenceKey || item.evidenceKey,
        symptomKey: normalizeKey(item.symptomKey || item.symptom_key || evidenceKey),
        evidenceGroup: evidenceGroupForKey(
          item.evidenceGroup || item.evidence_group || evidenceKey
        ),
        diagnosisMode: modeKey || item.diagnosisMode,
        modeKey: modeKey || item.modeKey
      })
    }
  }
  return Array.from(merged.values())
}

function selectedPestModeKeysFromChoice(choice = {}, routeResult = {}) {
  const choiceModes = normalizePestModeKeys([
    ...(Array.isArray(choice?.directModeKeys) ? choice.directModeKeys : []),
    ...(Array.isArray(choice?.confirmationModeKeys) ? choice.confirmationModeKeys : []),
    ...(Array.isArray(choice?.pestModeKeys) ? choice.pestModeKeys : [])
  ])
  if (choiceModes.length) {
    return choiceModes
  }
  return normalizePestModeKeys(routeResult.associatedModes)
}

function buildPestFallbackRouteResultFromChoice(choice = {}) {
  const directModeKeys = normalizePestModeKeys(choice?.directModeKeys)
  const confirmationModeKeys = normalizePestModeKeys(
    Array.isArray(choice?.confirmationModeKeys) && choice.confirmationModeKeys.length
      ? choice.confirmationModeKeys
      : choice?.pestModeKeys
  ).filter(modeKey => !directModeKeys.includes(modeKey))
  const associatedModes = normalizePestModeKeys([
    ...directModeKeys,
    ...confirmationModeKeys,
    ...(Array.isArray(choice?.pestModeKeys) ? choice.pestModeKeys : [])
  ])
  if (!associatedModes.length) {
    return null
  }
  return {
    nextAction: 'choose_direction',
    routePrimaryAction: 'choose_direction',
    directMatches: directModeKeys.map(modeKey => ({ modeKey, decisionLevel: 'direct' })),
    confirmationCandidates: confirmationModeKeys.map(modeKey => ({
      modeKey,
      decisionLevel: 'confirm'
    })),
    associatedModes,
    directionChoices: [choice]
  }
}

module.exports = {
  SINGLE_SELECTED_MODE_COUNT,
  normalizeText,
  normalizeKey,
  normalizeDirectionChoiceMode,
  selectedDirectionKey,
  isDirectionChoicePayload,
  directionChoicesFromRoute,
  directionChoicesFromState,
  findDirectionChoice,
  findDirectionChoiceInList,
  assertAllowedDirectionChoice,
  normalizePestModeKeys,
  readArray,
  mergeAggregateSources,
  resolveAggregateForDirectionChoice,
  candidateMapFromAggregate,
  pestModesForEvidenceKey,
  normalizeAdmittedVisualEvidenceLedgerItem,
  buildVisualAdmittedEvidenceLedger,
  mergeEvidenceLedgers,
  selectedPestModeKeysFromChoice,
  buildPestFallbackRouteResultFromChoice
}
