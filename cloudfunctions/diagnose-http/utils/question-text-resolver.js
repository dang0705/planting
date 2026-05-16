'use strict'

const { fromQuestionId } = require('../mappers/public-id-mapper')

const { normalizeQuestionTargetDimension } = require('./question-target-dimension')
const {
  buildOrthogonalProbeText,
  isSyntheticObservedProbeQuestionKey,
  parseSyntheticObservedProbeQuestionKey
} = require('./synthetic-follow-up')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeQuestionTextSources(item = {}, questionMeta = {}) {
  return normalizeText(
    item?.text ||
      item?.questionText ||
      item?.question_text ||
      item?.questionTextUserCn ||
      item?.questionTextCn ||
      questionMeta?.questionTextUserCn ||
      questionMeta?.questionTextCn ||
      ''
  )
}

function parseJson(value = '') {
  if (typeof value === 'object' && value !== null) {
    return value
  }

  if (typeof value !== 'string' || !value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function buildQuestionTextCandidateKeys(item = {}) {
  const keys = []

  const directQuestionKey = normalizeText(
    item?.questionKey || item?.question_key || item?.question || ''
  )
  if (directQuestionKey) {
    keys.push(directQuestionKey)
  }

  const encodedQuestionId = normalizeText(
    item?.questionId || item?.question_id || ''
  )
  if (encodedQuestionId) {
    keys.push(encodedQuestionId)
    const decodedQuestionKey = normalizeText(fromQuestionId(encodedQuestionId))
    if (decodedQuestionKey) {
      keys.push(decodedQuestionKey)
    }
  }

  const parsedRationale = parseJson(item?.rationale)
  const rationaleQuestionKey = normalizeText(
    parsedRationale?.questionKey || parsedRationale?.qk || parsedRationale?.question_key || ''
  )
  if (rationaleQuestionKey) {
    keys.push(rationaleQuestionKey)
  }

  return Array.from(new Set(keys.filter(Boolean)))
}

function resolveQuestionTextFromMeta(item = {}, meta = {}) {
  return normalizeQuestionTextSources(item, meta)
}

function resolveQuestionTextFromMetaMap(item = {}, metaMap = null) {
  const candidates = buildQuestionTextCandidateKeys(item)
  if (!metaMap || typeof metaMap.get !== 'function' || !candidates.length) {
    return ''
  }

  for (const questionKey of candidates) {
    const resolvedText = resolveQuestionTextFromMeta(item, metaMap.get(questionKey))
    if (resolvedText) {
      return resolvedText
    }
  }

  return ''
}

function resolveSyntheticObservedProbeQuestionText(questionKey = '', item = {}) {
  const normalizedQuestionKey = normalizeText(questionKey)
  if (!isSyntheticObservedProbeQuestionKey(normalizedQuestionKey)) {
    return ''
  }

  const { symptomKey, targetDimension } = parseSyntheticObservedProbeQuestionKey(normalizedQuestionKey)
  const normalizedSymptomKey = normalizeText(symptomKey)
  const normalizedTargetDimension = normalizeQuestionTargetDimension(targetDimension)
  if (!normalizedSymptomKey || !normalizedTargetDimension) {
    return ''
  }

  const probeText = buildOrthogonalProbeText(
    {
      symptomKey: normalizedSymptomKey,
      symptomCn: item?.symptomCn || '',
      locationKey: item?.locationKey || '',
      patternKey: item?.patternKey || ''
    },
    normalizedTargetDimension,
    item?.context || {}
  )

  return normalizeText(probeText?.questionText || '')
}

function resolveQuestionText(item = {}, questionMetaOrMetaMap = {}) {
  const staticText = normalizeQuestionTextSources(item)
  if (staticText) {
    return staticText
  }

  const fromMeta = resolveQuestionTextFromMeta(item, questionMetaOrMetaMap)
  if (fromMeta) {
    return fromMeta
  }

  const fromMetaMap = resolveQuestionTextFromMetaMap(item, questionMetaOrMetaMap)
  if (fromMetaMap) {
    return fromMetaMap
  }

  const firstQuestionKey = buildQuestionTextCandidateKeys(item)[0]
  return resolveSyntheticObservedProbeQuestionText(firstQuestionKey, item)
}

module.exports = {
  resolveQuestionText,
  buildQuestionTextCandidateKeys
}
