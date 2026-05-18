'use strict'

const { routeSelection: questionSelectionConfig } = require('../constants/scoring')
const {
  normalizeQuestionRole,
  inferQuestionRole,
  normalizeQuestionTargetDimension,
  normalizeQuestionEffectMode,
  inferQuestionEffectMode
} = require('../utils/question-target-dimension')
const { QUESTION_TARGET_DIMENSIONS } = require('../utils/question-target-dimension')
const { toOptionId, toQuestionId } = require('../mappers/public-id-mapper')
const {
  buildTemplateVariables,
  renderQuestionTemplate
} = require('../utils/synthetic-follow-up')

function sanitizeQuestionCopy(value = '', variables = {}) {
  const rendered = renderQuestionTemplate(value, variables)
  return String(rendered || '')
    .replace(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g, '')
    .replace(/\b[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+\b/g, '')
    .replace(/[ \t]+([。；，、！？])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildOptionMap(optionMappings = []) {
  const map = new Map()
  for (const row of Array.isArray(optionMappings) ? optionMappings : []) {
    const questionKey = String(row?.questionKey || '').trim()
    const optionKey = String(row?.optionKey || '').trim()
    if (!questionKey || !optionKey) {continue}
    if (!map.has(questionKey)) {
      map.set(questionKey, [])
    }
    const rows = map.get(questionKey)
    if (!rows.some(item => String(item?.optionKey || '').trim() === optionKey)) {
      rows.push(row)
    }
  }
  return map
}

function ensureUnknownOptionMappingRows(questionKey = '', optionRows = []) {
  const rows = Array.isArray(optionRows) ? [...optionRows] : []
  if (rows.some(item => String(item?.optionKey || '').trim().toLowerCase() === 'unknown')) {
    return rows
  }

  rows.push({
    questionKey: String(questionKey || '').trim(),
    optionKey: 'unknown',
    optionTextCn: '看不出/不确定',
    optionTextUserCn: '看不出/不确定',
    optionDescriptionUserCn: '',
    isDefault: false
  })

  return rows
}

function buildStaticFollowUpQuestionPayload(question = {}, optionRows = [], renderContext = {}) {
  const variables = buildTemplateVariables({}, renderContext)
  const questionRole = normalizeQuestionRole(
    question?.questionRole || question?.question_role || '',
    inferQuestionRole(question?.targetDimension || question?.target_dimension || '', question?.routingScope || question?.routing_scope || '')
  )
  const effectMode = normalizeQuestionEffectMode(
    question?.effectMode || question?.effect_mode || '',
    inferQuestionEffectMode(questionRole, question?.targetDimension || question?.target_dimension || '')
  )

  return {
    questionKey: question.questionKey,
    selectionSource: question.selectionSource || '',
    targetSymptomKey: question.targetSymptomKey || '',
    questionText: sanitizeQuestionCopy(question.questionTextUserCn || question.questionTextCn || '', variables),
    helpText: sanitizeQuestionCopy(question.helpTextCn || '', variables),
    questionGroupKey: question.questionGroupKey || '',
    targetDimension: normalizeQuestionTargetDimension(
      question?.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    ),
    routingScope: String(question?.routingScope || '').trim(),
    questionRole,
    effectMode,
    defaultOptionKey: question.defaultOptionKey || '',
    uiVariant: question.uiVariant || '',
    renderMode: question.renderMode || '',
    questionType: question.questionType || 'single_choice',
    options: ensureUnknownOptionMappingRows(question.questionKey, optionRows).map(item => ({
      optionKey: item.optionKey,
      text: sanitizeQuestionCopy(item.optionTextUserCn || item.optionTextCn || item.optionKey, variables),
      description: sanitizeQuestionCopy(item.optionDescriptionUserCn || '', variables),
      isDefault: Boolean(item.isDefault)
    })),
    whyThisQuestion: question.whyThisQuestionCn || ''
  }
}

async function buildRoutePlannedFollowUps({
  routeDecision = null,
  askedQuestions = [],
  askedQuestionKeys = [],
  maxQuestions = questionSelectionConfig.maxQuestionsPerRound,
  questionRepository = null,
  plantContext = {},
  weatherContext = null
} = {}) {
  if (!questionRepository) {
    throw new Error('questionRepository is required')
  }

  const routePlannedQuestions = Array.isArray(routeDecision?.nextQuestions)
    ? routeDecision.nextQuestions
    : []
  const fallbackQuestionKeys = Array.isArray(routeDecision?.nextQuestionKeys)
    ? routeDecision.nextQuestionKeys
    : []
  const effectiveRoutePlannedQuestions = routePlannedQuestions.length
    ? routePlannedQuestions
    : fallbackQuestionKeys.map(questionKey => ({
        questionKey: String(questionKey || '').trim(),
        routeKey: '',
        gateKey: '',
        outcomeKey: '',
        questionRole: ''
      }))
  const questionKeys = Array.from(
    new Set(
      effectiveRoutePlannedQuestions
        .map(item => String(item?.questionKey || '').trim())
        .filter(Boolean)
    )
  ).slice(0, Math.max(1, Number(maxQuestions || 1)))
  if (!questionKeys.length) {return []}

  const askedQuestionKeySet = new Set(
    (Array.isArray(askedQuestionKeys) ? askedQuestionKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  for (const item of Array.isArray(askedQuestions) ? askedQuestions : []) {
    const questionKey = String(item?.questionKey || item?.question_key || '').trim()
    if (questionKey) {askedQuestionKeySet.add(questionKey)}
  }

  const unresolvedQuestionKeys = questionKeys.filter(questionKey => !askedQuestionKeySet.has(questionKey))
  if (!unresolvedQuestionKeys.length) {return []}

  const [storedQuestions, optionMappingsFromStore] = await Promise.all([
    questionRepository.getQuestionsByKeys(unresolvedQuestionKeys),
    questionRepository.getQuestionOptionMappings(unresolvedQuestionKeys)
  ])
  const questions = storedQuestions
  const optionMappings = optionMappingsFromStore
  if (!questions.length) {return []}

  const routeQuestionMetaMap = new Map(
    effectiveRoutePlannedQuestions.map(item => [String(item?.questionKey || '').trim(), item])
  )
  const optionMap = buildOptionMap(optionMappings)

  return questions
    .map(question => {
      const questionKey = String(question?.questionKey || '').trim()
      const payload = buildStaticFollowUpQuestionPayload(question, optionMap.get(questionKey) || [], {
        plantContext,
        weatherContext
      })
      return {
        questionKey: questionKey,
        questionId: toQuestionId(questionKey),
        selectionSource: 'route_planner',
        routeKey: String(routeQuestionMetaMap.get(questionKey)?.routeKey || '').trim(),
        gateKey: String(routeQuestionMetaMap.get(questionKey)?.gateKey || '').trim(),
        outcomeKey: String(routeQuestionMetaMap.get(questionKey)?.outcomeKey || '').trim(),
        targetSymptomKey: payload.targetSymptomKey || '',
        questionGroupKey: payload.questionGroupKey || '',
        targetDimension: payload.targetDimension || '',
        routingScope: payload.routingScope || '',
        defaultOptionKey: payload.defaultOptionKey || '',
        defaultOptionId: payload.defaultOptionKey ? toOptionId(payload.defaultOptionKey) : '',
        uiVariant: payload.uiVariant || '',
        renderMode: payload.renderMode || '',
        questionRole:
          String(routeQuestionMetaMap.get(questionKey)?.questionRole || '').trim() ||
          payload.questionRole ||
          '',
        questionCategory:
          String(routeQuestionMetaMap.get(questionKey)?.questionRole || '').trim() ||
          payload.questionRole ||
          '',
        effectMode: payload.effectMode || '',
        type: payload.questionType || 'single_choice',
        text: payload.questionText || '',
        questionText: payload.questionText || '',
        helpText: payload.helpText || '',
        options: (Array.isArray(payload.options) ? payload.options : []).map(option => ({
          optionId: toOptionId(option.optionKey),
          optionKey: option.optionKey,
          text: option.text || '',
          description: option.description || '',
          isDefault: Boolean(option.isDefault)
        }))
      }
    })
    .filter(item => item?.questionKey)
    .slice(0, Math.max(1, Number(maxQuestions || 1)))
}

module.exports = {
  buildRoutePlannedFollowUps
}
