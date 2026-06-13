'use strict'

const { toOptionId, toQuestionId } = require('../mappers/public-id-mapper')
const { buildRuntimeArtifacts } = require('../domain/runtime-artifacts')
const { buildObservedProbePackageQuestions } = require('./static-package-question-builder')
const { filterDisabledYellowingFlowQuestions } = require('../utils/yellowing-question-policy')
const {
  buildRegisteredQuestionForPackageTopic,
  mapRegisteredQuestionOptions
} = require('./diagnosis-question-registry')
const {
  YELLOW_LEAF_PACKAGE_MODE,
  YELLOWING_PACKAGE_QUESTION_COUNT,
  getQuestionPackageByMode,
  buildQuestionPackageUiHints
} = require('./question-package-response')
const {
  WILTING_DROOP_PACKAGE_MODE,
  WILTING_DROOP_PACKAGE_SOURCE_MODE,
  WILTING_DROOP_PACKAGE_QUESTION_COUNT,
  WILTING_DROOP_STATIC_ITEM,
  buildWiltingDroopPackageQuestions,
  isWiltingDroopStaticQuestionStartMode
} = require('./wilting-droop-question-package')

const YELLOWING_SOURCE_MODE = 'manual_yellowing_care_environment_frontloaded'
const YELLOWING_SYMPTOM_KEY = 'leaf_yellowing'
const YELLOWING_CLASS_KEY = 'yellowing_mode'
const YELLOWING_STATIC_ITEM = Object.freeze({
  symptomKey: YELLOWING_SYMPTOM_KEY,
  symptomCn: '叶片发黄',
  displayTextCn: '叶片发黄',
  locationKey: 'leaf',
  patternKey: 'yellowing'
})

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value)) {
    deepFreeze(child)
  }
  return value
}

function clonePlain(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlain)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clonePlain(child)]))
  }
  return value
}

function mapStaticQuestionToPackageQuestion(question = {}) {
  return {
    questionKey: question.questionKey,
    questionId: question.questionId || toQuestionId(question.questionKey),
    selectionSource: 'static_question_package',
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
    packageEffect: question.packageEffect || '',
    type: question.questionType || question.answerType || 'single_choice',
    text: question.text || question.questionText || '',
    questionText: question.questionText || question.text || '',
    helpText: question.helpText || '',
    options: mapRegisteredQuestionOptions(question.options),
    whyThisQuestion: question.whyThisQuestion || ''
  }
}

function buildYellowingStaticQuestions() {
  const questionPackage = getQuestionPackageByMode(YELLOW_LEAF_PACKAGE_MODE)
  const packageTopics = questionPackage?.packageTopics || []
  const questions = packageTopics.flatMap(packageTopic =>
    buildRegisteredQuestionForPackageTopic(packageTopic, {
      targetSymptomKey: YELLOWING_STATIC_ITEM.symptomKey
    }) ||
    buildObservedProbePackageQuestions(YELLOWING_STATIC_ITEM, {
        maxQuestions: 1,
        preferredTopics: [packageTopic],
        plantContext: {}
      })
  )
  const uniqueQuestions = []
  const seenQuestionKeys = new Set()
  for (const question of filterDisabledYellowingFlowQuestions(questions)) {
    const questionKey = String(question?.questionKey || '').trim()
    if (!questionKey || seenQuestionKeys.has(questionKey)) {
      continue
    }
    seenQuestionKeys.add(questionKey)
    uniqueQuestions.push(question)
  }
  return deepFreeze(uniqueQuestions.map(mapStaticQuestionToPackageQuestion))
}

const STATIC_YELLOWING_PACKAGE_QUESTIONS = buildYellowingStaticQuestions()

function isYellowingStaticQuestionStartMode(option = {}) {
  return String(option?.classKey || '').trim() === YELLOWING_CLASS_KEY
}

function buildMinimalPlantContext({ plantId = '', userPlantId = '', plantCatalogId = '' } = {}) {
  return {
    plantId: plantCatalogId || plantId || '',
    userPlantId: userPlantId || '',
    plantIdentityId: '',
    identityResolutionStatus: 'question_start_static_package'
  }
}

function buildStaticObservedSymptoms(option = {}) {
  return [
    {
      symptomKey: option.symptomKey,
      symptomCn: option.symptomCn,
      confidence: 0.82,
      source: 'manual_symptom_mode',
      evidenceSource: 'manual_symptom_mode',
      classKey: option.classKey,
      classNameCn: option.classNameCn
    }
  ]
}

function buildStaticObservedEvidenceSet(option = {}) {
  return [
    {
      observedEvidenceSetId: `manual_symptom_mode::${option.classKey}::${option.symptomKey}`,
      evidenceKey: option.symptomKey,
      evidenceType: 'symptom',
      symptomKey: option.symptomKey,
      symptomCn: option.symptomCn,
      confidence: 0.82,
      sourceType: 'manual_symptom_mode',
      currentStatus: 'active',
      targetLayer: 'observed_evidence_set',
      sourceRecordId: option.classKey,
      firstSeenStage: 'manual_symptom_mode',
      enteredRuntime: 1,
      enteredExplanation: 1,
      isKeyEvidence: 1,
      symptomClassKey: option.classKey,
      symptomClassNameCn: option.classNameCn
    }
  ]
}

function buildStaticQuestionPackageStartRoundResult({
  sessionId,
  option,
  plantContext,
  round = 1
} = {}) {
  if (
    !isYellowingStaticQuestionStartMode(option) &&
    !isWiltingDroopStaticQuestionStartMode(option)
  ) {
    return null
  }
  const isWiltingDroopPackage = isWiltingDroopStaticQuestionStartMode(option)
  const expectedQuestionCount = isWiltingDroopPackage
    ? WILTING_DROOP_PACKAGE_QUESTION_COUNT
    : YELLOWING_PACKAGE_QUESTION_COUNT
  const packageQuestions = isWiltingDroopPackage
    ? buildWiltingDroopPackageQuestions()
    : clonePlain(STATIC_YELLOWING_PACKAGE_QUESTIONS)
  if (packageQuestions.length !== expectedQuestionCount) {
    throw Object.assign(new Error('固定题包数量异常'), { statusCode: 500 })
  }

  const packageOption = isWiltingDroopPackage ? { ...option, ...WILTING_DROOP_STATIC_ITEM } : option
  const observedSymptoms = buildStaticObservedSymptoms(packageOption)
  const observedEvidenceSet = buildStaticObservedEvidenceSet(packageOption)
  const packageMode = isWiltingDroopPackage ? WILTING_DROOP_PACKAGE_MODE : YELLOW_LEAF_PACKAGE_MODE
  const sourceMode = isWiltingDroopPackage
    ? WILTING_DROOP_PACKAGE_SOURCE_MODE
    : YELLOWING_SOURCE_MODE
  const questionPackage = getQuestionPackageByMode(packageMode, {
    questionCount: packageQuestions.length,
    sourceMode
  })
  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${Number(round || 1)}`,
    roundIndex: Number(round || 1),
    currentRoundIndex: Number(round || 1),
    currentRoundId: `round_${Number(round || 1)}`,
    stage: 'question_package',
    status: 'active',
    routePrimaryAction: 'ask_first',
    stopReason: 'await_package_answers',
    sessionStatus: 'awaiting_package_answers',
    outcomeType: '',
    plantId: plantContext?.userPlantId || plantContext?.plantId || '',
    plantIdentityId: plantContext?.plantIdentityId || '',
    identityResolutionStatus: plantContext?.identityResolutionStatus || '',
    latestVisualCallBatchId: null,
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet: [],
    diagnosisDirections: [],
    questions: packageQuestions,
    questionPackage,
    uiHints: buildQuestionPackageUiHints({}, questionPackage, packageQuestions.length),
    metrics: {
      questionStartPath: 'static_question_package',
      routeDecision: {
        mode: sourceMode,
        candidateOutcomeKeys: [],
        visibleOutcomeKeys: [],
        requiresQuestionPackage: true,
        decisionCause: {
          decisionCauseKey: isWiltingDroopPackage
            ? 'static_wilting_droop_question_package'
            : 'static_yellowing_question_package',
          decisionCauseText: isWiltingDroopPackage
            ? '枯萎 / 发蔫手动入口使用模块级静态固定题包。'
            : '黄叶手动入口使用模块级静态固定题包。'
        }
      }
    },
    __runtimeRouteDecision: {
      mode: sourceMode,
      visibleOutcomeKeys: [],
      requiresQuestionPackage: true
    },
    plantContext
  }

  return {
    ...response,
    ...buildRuntimeArtifacts(response, {
      observedEvidenceSet,
      derivedEvidenceSet: [],
      diagnosisDirections: []
    })
  }
}

module.exports = {
  buildMinimalPlantContext,
  buildStaticQuestionPackageStartRoundResult,
  isYellowingStaticQuestionStartMode,
  isWiltingDroopStaticQuestionStartMode,
  _test: {
    STATIC_YELLOWING_PACKAGE_QUESTIONS,
    buildWiltingDroopPackageQuestions,
    buildYellowingStaticQuestions,
    buildStaticObservedSymptoms,
    buildStaticObservedEvidenceSet
  }
}
