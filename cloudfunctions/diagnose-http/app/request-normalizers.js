'use strict'

const { normalizeOptionKey } = require('../mappers/legacy-rule-adapter')
const { fromQuestionId, fromOptionId } = require('../mappers/public-id-mapper')
const { getQuestionsByKeys } = require('../repositories/question-repository')
const {
  readQuestionKeyFromRationale,
  readQuestionGroupKeyFromRationale
} = require('../services/session-follow-up-service')
const {
  resolveQuestionText,
  buildQuestionTextCandidateKeys
} = require('../utils/question-text-resolver')

function normalizeUploadCompression(value = null) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const numberFields = [
    'originalSizeBytes',
    'uploadedSizeBytes',
    'compressionRatio',
    'quality',
    'width',
    'height',
    'targetSizeBytes',
    'minimumQuality'
  ]
  const normalized = {
    source: String(value.source || '').trim(),
    compressed: Boolean(value.compressed),
    preserveImageDetails: Boolean(value.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(value.doubleConfirmedForHunyuan)
  }

  for (const field of numberFields) {
    const num = Number(value[field])
    normalized[field] = Number.isFinite(num) && num > 0 ? num : null
  }

  return normalized
}

function pickQuestionKeysFromQuestionQueue(questionQueue = null) {
  const queueItems = Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : []
  return new Set(
    queueItems
      .map(item => String(item?.questionKey || '').trim())
      .filter(Boolean)
  )
}

function normalizeAnswerQuestionKey(value = '') {
  return String(value || '').trim()
}

function parseFollowUpRationale(value = '') {
  if (value && typeof value === 'object') {
    return value
  }

  const raw = String(value || '').trim()
  if (!raw) {return {}}

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function resolveQuestionKey(item = {}) {
  return String(
    item?.questionKey ||
      item?.question_key ||
      item?.questionId ||
      item?.question_id ||
      ''
  ).trim()
}

function resolveQuestionKeyCandidates(item = {}) {
  const candidates = buildQuestionTextCandidateKeys(item)
  return candidates.length ? candidates : [resolveQuestionKey(item)].filter(Boolean)
}

async function withQuestionTextFallback(response = {}) {
  const followUps = Array.isArray(response?.followUps) ? response.followUps : []
  const questions = Array.isArray(response?.questions) ? response.questions : []
  const sourceList = [...followUps, ...questions]
  if (!sourceList.length) {
    return response
  }

  const missingQuestionKeys = Array.from(
    new Set(
      sourceList
        .filter(item => !resolveQuestionText(item))
        .flatMap(resolveQuestionKeyCandidates)
        .filter(Boolean)
    )
  )
  if (!missingQuestionKeys.length) {
    return response
  }

  const questionRows = await getQuestionsByKeys(missingQuestionKeys)
  const questionMetaByKey = new Map(
    questionRows.map(item => [
      String(item?.questionKey || '').trim(),
      item
    ])
  )

  const hydrateItem = item => {
    if (resolveQuestionText(item)) {
      return item
    }
    const fallbackText = resolveQuestionText(
      item,
      new Map(resolveQuestionKeyCandidates(item).map(key => [key, questionMetaByKey.get(key)]))
    )
    if (!fallbackText) {
      return item
    }
    return {
      ...item,
      text: fallbackText,
      questionText: fallbackText
    }
  }
  const keepItemWithQuestionText = item => Boolean(resolveQuestionText(item))

  return {
    ...response,
    followUps: followUps.length
      ? followUps.map(hydrateItem).filter(keepItemWithQuestionText)
      : response.followUps,
    questions: questions.length
      ? questions.map(hydrateItem).filter(keepItemWithQuestionText)
      : response.questions
  }
}

function buildAskedQuestionRowsFromFollowUpRows(rows = []) {
  const askRows = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const result = []

  for (const row of askRows) {
    if (Number(row?.asked || 0) !== 1) {
      continue
    }

    const normalizedQuestionKey = normalizeAnswerQuestionKey(
      readQuestionKeyFromRationale(row?.rationale || '') || String(row?.symptom_key || '').trim()
    )
    if (!normalizedQuestionKey || seen.has(normalizedQuestionKey)) {
      continue
    }
    seen.add(normalizedQuestionKey)

    const rationale = parseFollowUpRationale(row?.rationale)
    const questionText = String(
      rationale?.questionTextUserCn ||
        rationale?.questionTextCn ||
        rationale?.questionText ||
        row?.question_text ||
        row?.questionText ||
        ''
    ).trim()
    const groupKey = readQuestionGroupKeyFromRationale(row?.rationale)
    result.push({
      questionKey: normalizedQuestionKey,
      targetSymptomKey: normalizeAnswerQuestionKey(
        rationale?.tsk ||
          rationale?.targetSymptomKey ||
          row?.target_symptom_key ||
          ''
      ),
      targetDimension: normalizeAnswerQuestionKey(
        rationale?.td ||
          rationale?.targetDimension ||
          ''
      ),
      questionGroupKey: normalizeAnswerQuestionKey(
        groupKey ||
          rationale?.questionGroupKey ||
          row?.question_group_key ||
          '__default__'
      ) || '__default__',
      routingScope: normalizeAnswerQuestionKey(
        rationale?.rs ||
          rationale?.routingScope ||
          ''
      ),
      questionText,
      questionTextUserCn: questionText,
      questionTextCn: questionText,
      status: String(row?.status || '').trim().toLowerCase(),
      optionKey: String(row?.answer_value || row?.answerValue || '').trim().toLowerCase()
    })
  }

  return result
}

function buildRuntimeAnswersFromFollowUpUpdates(previousAnswers = [], updatedFollowUpAnswers = []) {
  const answerMap = new Map()

  for (const item of Array.isArray(previousAnswers) ? previousAnswers : []) {
    const key = normalizeAnswerQuestionKey(item?.questionKey || '')
    if (!key) {continue}
    answerMap.set(key, {
      questionKey: key,
      optionKey: String(item?.optionKey || '').trim()
    })
  }

  for (const item of Array.isArray(updatedFollowUpAnswers) ? updatedFollowUpAnswers : []) {
    const key = normalizeAnswerQuestionKey(item?.questionKey || '')
    const optionKey = String(item?.optionKey || '').trim()
    if (!key || !optionKey) {continue}
    answerMap.set(key, {
      questionKey: key,
      optionKey: optionKey.toLowerCase()
    })
  }

  return Array.from(answerMap.values())
}

function buildRuntimeUnknownCountByGroup(previousUnknownCountByGroup = {}, updatedFollowUpAnswers = []) {
  const nextUnknownCountByGroup = {
    ...previousUnknownCountByGroup
  }

  for (const item of Array.isArray(updatedFollowUpAnswers) ? updatedFollowUpAnswers : []) {
    const groupKey = String(item?.questionGroupKey || '__default__').trim() || '__default__'
    const status = String(item?.status || '').trim().toLowerCase()

    if (groupKey === '__default__') {
      continue
    }

    nextUnknownCountByGroup[groupKey] = status === 'skipped'
      ? Number(nextUnknownCountByGroup[groupKey] || 0) + 1
      : 0
  }

  return nextUnknownCountByGroup
}

function resolveVisualImageInputs(payload = {}) {
  const imageEntries = []

  const structuredImages = Array.isArray(payload.images)
    ? payload.images
    : Array.isArray(payload.imageInputs)
      ? payload.imageInputs
      : []

  for (const [index, item] of structuredImages.entries()) {
    const imageRef = String(
      item?.imageRef || item?.imageUrl || item?.image || item?.url || item?.imageId || ''
    ).trim()
    if (!imageRef) {continue}

    const normalizedOrderIndex = Number(item?.orderIndex ?? index)
    const normalizedInputSlotOrder = Number(item?.inputSlotOrder ?? item?.orderIndex ?? index)
    const normalizedDeclaredOrganConfidence =
      item?.userDeclaredOrganConfidence ?? item?.declaredOrganConfidence ?? null
    const uploadCompression = normalizeUploadCompression(
      item?.uploadCompression || item?.compression || null
    )

    imageEntries.push({
      imageRef,
      inputSlotType:
        item?.inputSlotType || item?.slotType || item?.organHint || item?.organ || 'unknown',
      orderIndex: Number.isFinite(normalizedOrderIndex) ? normalizedOrderIndex : index,
      inputSlotOrder: Number.isFinite(normalizedInputSlotOrder)
        ? normalizedInputSlotOrder
        : index,
      inputSlotLabel: item?.inputSlotLabel || item?.slotLabel || '',
      userDeclaredOrganType:
        item?.userDeclaredOrganType || item?.declaredOrganType || item?.userDeclaredOrgan || '',
      userDeclaredOrganConfidence:
        normalizedDeclaredOrganConfidence === null ||
        normalizedDeclaredOrganConfidence === undefined ||
        normalizedDeclaredOrganConfidence === ''
          ? null
          : Number.isFinite(Number(normalizedDeclaredOrganConfidence))
            ? Number(normalizedDeclaredOrganConfidence)
            : null,
      ...(uploadCompression ? { uploadCompression } : {})
    })
  }

  if (imageEntries.length) {
    return imageEntries
  }

  const imageIds = Array.isArray(payload.imageIds)
    ? payload.imageIds.map(item => String(item || '').trim()).filter(Boolean)
    : []

  if (imageIds.length) {
    return imageIds.map((imageRef, index) => ({
      imageRef,
      inputSlotType: 'unknown',
      orderIndex: index,
      inputSlotOrder: index,
      inputSlotLabel: '',
      userDeclaredOrganType: '',
      userDeclaredOrganConfidence: null
    }))
  }

  if (payload.image) {
    return [
      {
        imageRef: String(payload.image).trim(),
        inputSlotType: 'unknown',
        orderIndex: 0,
        inputSlotOrder: 0,
        inputSlotLabel: '',
        userDeclaredOrganType: '',
        userDeclaredOrganConfidence: null
      }
    ].filter(item => item.imageRef)
  }

  return []
}

function normalizeEvidenceSourceType(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isVisualEvidenceItem(item = {}) {
  const sourceType = normalizeEvidenceSourceType(item?.sourceType || item?.source_type || '')
  if (!sourceType) {return false}
  if (sourceType === 'legacy_observed_symptom') {return true}
  return sourceType.includes('visual')
}

function stripVisualEvidenceItems(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).filter(
    item => !isVisualEvidenceItem(item)
  )
}

function normalizeRoundFromRoundId(roundId) {
  const match = String(roundId || '').match(/round_(\d+)/i)
  if (!match) {return null}
  return Number(match[1] || 0) || null
}

function normalizePublicAnswers(answers = []) {
  const normalized = (Array.isArray(answers) ? answers : [])
    .map(item => {
      if (!item) {return null}

      const questionKey =
        fromQuestionId(item.questionId || '') ||
        String(item.questionKey || item.question_key || item.questionId || '').trim()
      const optionKey =
        fromOptionId(item.optionId || '') ||
        normalizeOptionKey(item.optionKey || item.option_key || item.answerValue || item.optionId || '')

      if (!questionKey || !optionKey) {return null}

      return {
        questionKey,
        optionKey
      }
    })
    .filter(Boolean)

  const deduped = new Map()
  for (const item of normalized) {
    deduped.set(item.questionKey, item)
  }
  return Array.from(deduped.values())
}

function normalizeRequestMode(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveNextAnswerRevision(sessionState = {}, baseAnswerRevision = null) {
  const currentRevision = Number(sessionState?.runtimeSnapshot?.answerRevision || 0)
  const baseRevision = Number(baseAnswerRevision || 0)
  return Math.max(currentRevision, Number.isFinite(baseRevision) ? baseRevision : 0) + 1
}

function mergeClientContextFields(primary = null, fallback = null) {
  const source = primary && typeof primary === 'object' ? primary : {}
  const base = fallback && typeof fallback === 'object' ? fallback : {}
  const pickText = key => {
    const first = String(source?.[key] || '').trim()
    if (first) {return first}
    const second = String(base?.[key] || '').trim()
    return second || ''
  }
  const structuredImageCountSource = Number(source?.structuredImageCount || 0)
  const structuredImageCountFallback = Number(base?.structuredImageCount || 0)

  const merged = {
    source: pickText('source'),
    platform: pickText('platform'),
    reviewSourceType: pickText('reviewSourceType'),
    visualInputVersion: pickText('visualInputVersion'),
    structuredImageCount:
      structuredImageCountSource > 0
        ? structuredImageCountSource
        : structuredImageCountFallback > 0
          ? structuredImageCountFallback
          : 0,
    auditLabel: pickText('auditLabel'),
    auditFileName: pickText('auditFileName'),
    auditCaseKey: pickText('auditCaseKey')
  }

  return Object.values(merged).some(value => (typeof value === 'number' ? value > 0 : Boolean(value)))
    ? merged
    : null
}

function resolveRequestClientContext(payload = {}, fallback = null) {
  const explicitContext = {
    source: payload?.source,
    platform: payload?.platform,
    reviewSourceType: payload?.reviewSourceType,
    visualInputVersion: payload?.visualInputVersion,
    structuredImageCount: payload?.structuredImageCount,
    auditLabel: payload?.auditLabel,
    auditFileName: payload?.auditFileName,
    auditCaseKey: payload?.auditCaseKey
  }

  return mergeClientContextFields(payload?.clientContext || null, mergeClientContextFields(explicitContext, fallback))
}

module.exports = {
  normalizeUploadCompression,
  pickQuestionKeysFromQuestionQueue,
  normalizeAnswerQuestionKey,
  parseFollowUpRationale,
  resolveQuestionKey,
  resolveQuestionKeyCandidates,
  withQuestionTextFallback,
  buildAskedQuestionRowsFromFollowUpRows,
  buildRuntimeAnswersFromFollowUpUpdates,
  buildRuntimeUnknownCountByGroup,
  resolveVisualImageInputs,
  stripVisualEvidenceItems,
  normalizeRoundFromRoundId,
  normalizePublicAnswers,
  normalizeRequestMode,
  resolveNextAnswerRevision,
  mergeClientContextFields,
  resolveRequestClientContext
}
