'use strict'

const {
  getQuestionsByKeys,
  getQuestionOptionMappings,
  findQuestionKeysByTargetSymptoms
} = require('../repositories/question-repository')
const { toOptionId, toQuestionId } = require('../mappers/public-id-mapper')
const outcomeRouteRepository = require('../repositories/outcome-route-repository')
const {
  planOutcomeRoutes,
  buildRouteEvidenceContext
} = require('../domain/outcome-route-planner')
const { buildRuntimeArtifacts } = require('../domain/runtime-artifacts')
const { buildDiagnosisDirections } = require('../utils/diagnosis-directions')
const { buildDerivedEvidenceSet } = require('../utils/derived-evidence')
const { collectBridgeTargetSymptomKeys } = require('../utils/question-symptom-bridge')
const { buildSyntheticObservedProbeQuestions } = require('../utils/synthetic-question-package')
const { QUESTION_PACKAGE_TOPICS } = require('../utils/question-package-topic')
const {
  filterYellowingCareEnvironmentCandidateOutcomeKeys,
  filterDisabledYellowingFlowQuestions,
  isYellowingFlowSymptomKey
} = require('../utils/yellowing-question-policy')
const {
  YELLOW_LEAF_PACKAGE_MODE,
  YELLOWING_PACKAGE_QUESTION_COUNT,
  getQuestionPackageByMode,
  buildQuestionPackageUiHints
} = require('./question-package-response')
const YELLOW_LEAF_QUESTION_PACKAGE = getQuestionPackageByMode(YELLOW_LEAF_PACKAGE_MODE)
const YELLOWING_FRONTLOADED_CARE_CONTEXT_DIMENSIONS =
  YELLOW_LEAF_QUESTION_PACKAGE?.packageTopics || [
    QUESTION_PACKAGE_TOPICS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_PACKAGE_TOPICS.LIGHT_CHANGE_CONTEXT,
    QUESTION_PACKAGE_TOPICS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_PACKAGE_TOPICS.AIRFLOW_HUMIDITY_CONTEXT
  ]

function isEnabledFeatureFlag(primaryEnvKey = '', conservativeEnvKey = '', options = {}) {
  const primaryRaw = String(process.env[primaryEnvKey] || '').trim()
  const conservativeRaw = String(process.env[conservativeEnvKey] || '').trim()
  const defaultEnabled = Boolean(options?.defaultEnabled)
  const raw = String(primaryRaw || conservativeRaw || (defaultEnabled ? '1' : '0'))
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function resolveManualStartActiveSymptomKeys(observedEvidenceSet = [], observedSymptoms = []) {
  const symptomKeys = Array.from(new Set([
    ...(Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
      .filter(item =>
        Number(item?.enteredRuntime ?? item?.entered_runtime ?? 1) === 1 &&
        String(item?.currentStatus || item?.current_status || 'active').trim() !== 'superseded'
      )
      .map(item => String(item?.symptomKey || item?.symptom_key || '').trim())
      .filter(Boolean),
    ...(Array.isArray(observedSymptoms) ? observedSymptoms : [])
      .map(item => String(item?.symptomKey || item?.symptom_key || '').trim())
      .filter(Boolean)
  ]))

  return Array.from(new Set([
    ...symptomKeys,
    ...collectBridgeTargetSymptomKeys(symptomKeys)
  ].filter(Boolean)))
}

function collectCandidateOutcomeKeysFromRouteGroups(routeGroups = [], activeSymptomKeys = []) {
  const activeSymptomKeySet = new Set(
    (Array.isArray(activeSymptomKeys) ? activeSymptomKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  if (!activeSymptomKeySet.size) {return []}

  const candidateOutcomeKeys = Array.from(new Set(
    (Array.isArray(routeGroups) ? routeGroups : [])
      .filter(group =>
        Array.isArray(group?.entrySymptomKeys) &&
        group.entrySymptomKeys.some(symptomKey => activeSymptomKeySet.has(String(symptomKey || '').trim()))
      )
      .flatMap(group => Array.isArray(group?.candidateOutcomeKeys) ? group.candidateOutcomeKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  ))

  return shouldUseYellowingCareEnvironmentGuard(activeSymptomKeys)
    ? filterYellowingCareEnvironmentCandidateOutcomeKeys(candidateOutcomeKeys)
    : candidateOutcomeKeys
}

function shouldUseYellowingCareEnvironmentGuard(activeSymptomKeys = []) {
  const keys = (Array.isArray(activeSymptomKeys) ? activeSymptomKeys : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
  return Boolean(keys.length && keys.every(isYellowingFlowSymptomKey))
}

function mapSyntheticQuestionToQuestion(question = {}) {
  return {
    questionKey: question.questionKey,
    questionId: toQuestionId(question.questionKey),
    selectionSource: 'route_planner',
    routeKey: '',
    conditionKey: '',
    outcomeKey: '',
    targetSymptomKey: question.targetSymptomKey || '',
    questionGroupKey: question.questionGroupKey || '',
    packageTopic: question.packageTopic || '',
    packageSection: question.packageSection || '',
    defaultOptionKey: question.defaultOptionKey || '',
    defaultOptionId: question.defaultOptionKey ? toOptionId(question.defaultOptionKey) : '',
    uiVariant: question.uiVariant || '',
    renderMode: question.renderMode || '',
    routePackageRole: question.routePackageRole || '',
    routePackageRole: question.routePackageRole || '',
    packageEffect: question.packageEffect || '',
    type: question.questionType || 'single_choice',
    text: question.questionText || '',
    questionText: question.questionText || '',
    helpText: question.helpText || '',
    options: (Array.isArray(question.options) ? question.options : []).map(option => ({
      optionId: toOptionId(option.optionKey),
      optionKey: option.optionKey,
      text: option.text || '',
      description: option.description || '',
      isDefault: Boolean(option.isDefault)
    })),
    whyThisQuestion: question.whyThisQuestion || ''
  }
}

function buildManualYellowingCareStartQuestions({ plantContext = {} } = {}) {
  const yellowingItem = {
    symptomKey: 'leaf_yellowing',
    symptomCn: '叶片发黄',
    displayTextCn: '叶片发黄',
    locationKey: 'leaf',
    patternKey: 'yellowing'
  }
  const questions = YELLOWING_FRONTLOADED_CARE_CONTEXT_DIMENSIONS.flatMap(packageTopic =>
    buildSyntheticObservedProbeQuestions(yellowingItem, {
      maxQuestions: 1,
      preferredTopics: [packageTopic],
      plantContext
    })
  )
  const uniqueQuestions = []
  const seenQuestionKeys = new Set()
  for (const question of filterDisabledYellowingFlowQuestions(questions)) {
    const questionKey = String(question?.questionKey || '').trim()
    if (!questionKey || seenQuestionKeys.has(questionKey)) {continue}
    seenQuestionKeys.add(questionKey)
    uniqueQuestions.push(question)
  }
  return uniqueQuestions.map(mapSyntheticQuestionToQuestion)
}

async function buildManualStartRouteDecision({
  plantContext,
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  routeRepository = outcomeRouteRepository,
  routePlanner = planOutcomeRoutes
} = {}) {
  const activeSymptomKeys = resolveManualStartActiveSymptomKeys(observedEvidenceSet)
  const routeGroups = await routeRepository.getAllActiveOutcomeRouteGroups()
  const candidateOutcomeKeys = collectCandidateOutcomeKeysFromRouteGroups(routeGroups, activeSymptomKeys)
  if (!candidateOutcomeKeys.length) {return null}

  return routePlanner({
    candidateOutcomeKeys,
    routeEvidenceContext: buildRouteEvidenceContext({
      plantContext,
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      answers: [],
      askedQuestionKeys: []
    }),
    maxVisibleOutcomes: 3,
    maxQuestionCount: 1,
    routeRepository,
    featureFlags: {
      routePlanningEnabled: isEnabledFeatureFlag(
        'ROUTE_PLANNING_OBSERVATION_ENABLED',
        'ROUTE_MODE_ENABLED',
        { defaultEnabled: true }
      )
    }
  })
}

async function buildManualQuestionStartRoundResult({
  sessionId,
  plantContext,
  observedSymptoms = [],
  observedEvidenceSet = [],
  round = 1,
  routeRepository: _routeRepository = outcomeRouteRepository,
  questionRepository: _questionRepository = {
    findQuestionKeysByTargetSymptoms,
    getQuestionsByKeys,
    getQuestionOptionMappings
  },
  routePlanner: _routePlanner = planOutcomeRoutes
} = {}) {
  const derivedEvidenceSet = buildDerivedEvidenceSet({
    observedEvidenceSet,
    symptomDictionary: []
  })
  const diagnosisDirections = buildDiagnosisDirections({
    observedEvidenceSet,
    derivedEvidenceSet,
    visualCandidateSymptoms: [],
    routeHints: [],
    round
  })
  const activeSymptomKeys = resolveManualStartActiveSymptomKeys(observedEvidenceSet, observedSymptoms)
  const useYellowingCareEnvironmentGuard = shouldUseYellowingCareEnvironmentGuard(activeSymptomKeys)
  if (useYellowingCareEnvironmentGuard) {
    const yellowingCareQuestions = await buildManualYellowingCareStartQuestions({
      plantContext
    })
    if (yellowingCareQuestions.length === YELLOWING_PACKAGE_QUESTION_COUNT) {
      const questionPackage = getQuestionPackageByMode(YELLOW_LEAF_PACKAGE_MODE, {
        questionCount: yellowingCareQuestions.length
      })
      const response = {
        diagnosisSessionId: sessionId,
        roundId: `round_${Number(round || 1)}`,
        roundIndex: Number(round || 1),
        currentRoundIndex: Number(round || 1),
        currentRoundId: `round_${Number(round || 1)}`,
        stage: 'question_package',
        status: 'active',
        questionRequired: true,
        routePrimaryAction: 'ask_first',
        stopReason: 'await_package_answers',
        sessionStatus: 'awaiting_question_package',
        outcomeType: '',
        plantId: plantContext?.userPlantId || plantContext?.plantId || '',
        plantIdentityId: plantContext?.plantIdentityId || '',
        identityResolutionStatus: plantContext?.identityResolutionStatus || '',
        latestVisualCallBatchId: null,
        observedSymptoms,
        observedEvidenceSet,
        derivedEvidenceSet,
        diagnosisDirections,
        questions: yellowingCareQuestions,
        questionPackage,
        uiHints: buildQuestionPackageUiHints({}, questionPackage, yellowingCareQuestions.length),
        metrics: {
            routeDecision: {
              mode: 'manual_yellowing_care_environment_frontloaded',
              candidateOutcomeKeys: [],
              visibleOutcomeKeys: [],
              requiresQuestion: false,
              decisionCause: {
              decisionCauseKey: 'manual_yellowing_care_environment_guard',
              decisionCauseText: '黄叶手动入口直接前置养护/环境实题。'
            }
          }
        },
        __runtimeRouteDecision: {
          mode: 'manual_yellowing_care_environment_frontloaded',
          visibleOutcomeKeys: [],
          requiresQuestion: false
        },
        plantContext
      }

      return {
        ...response,
        ...buildRuntimeArtifacts(response, {
          observedEvidenceSet,
          derivedEvidenceSet,
          diagnosisDirections
        })
      }
    }
  }
  return null
}

module.exports = {
  buildManualQuestionStartRoundResult,
  _test: {
    resolveManualStartActiveSymptomKeys,
    collectCandidateOutcomeKeysFromRouteGroups,
    shouldUseYellowingCareEnvironmentGuard,
    buildManualYellowingCareStartQuestions,
    buildManualStartRouteDecision,
    buildManualQuestionStartRoundResult
  }
}
