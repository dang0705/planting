import {
  mapSeverityToHealthText,
  normalizeOutcomeType,
  normalizeStringList
} from './diagnose-flow-shared.js'
import { getQuestionIdentity } from './diagnose-question-identity.js'
import {
  normalizeObservedEvidenceSet,
  normalizeObservedSymptoms,
  normalizeShadowCompareSummary,
  normalizeVisualAggregateSummary,
  normalizeVisualBatchTrace,
  normalizeDerivedEvidenceSet,
  normalizeDiagnosisDirections
} from './diagnose-evidence-normalizers.js'
import {
  normalizeCoreProcess,
  normalizeDiagnosticTrace,
  normalizeOutputEligibility,
  normalizeProblemCausality,
  normalizeQuestionPackageSnapshot,
  normalizeStopState
} from './diagnose-process-normalizers.js'
import {
  normalizeActionAdvice,
  normalizeDiagnosisAdviceSteps,
  normalizeDiagnosisAvoidAdvice,
  normalizeOutcomeEntry,
  normalizeOutcomeList,
  normalizeOutcomeModeText,
  normalizeRouteDecision,
  normalizeRouteDecisionCause,
  resolveMainIssueText,
  resolveScientificName,
  resolveSummaryText,
  synthesizeVisibleOutcomes
} from './diagnose-outcome-normalizers.js'

const EMPTY_COUNT = 0
const SINGLE_VISIBLE_OUTCOME_COUNT = 1

function resolveDiagnosisQuestionSource(diagnosis = {}) {
  if (Array.isArray(diagnosis.questions) && diagnosis.questions.length) {
    return diagnosis.questions
  }
  return Array.isArray(diagnosis.questions) ? diagnosis.questions : []
}

function normalizeQuestionMode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function shouldSuppressDirectionChoicesForSingleVisibleOutcome(
  diagnosis = {},
  visibleOutcomes = []
) {
  const hasSingleVisibleOutcome =
    Array.isArray(visibleOutcomes) &&
    visibleOutcomes.length > EMPTY_COUNT &&
    visibleOutcomes.length <= SINGLE_VISIBLE_OUTCOME_COUNT
  if (!hasSingleVisibleOutcome) {
    return false
  }
  const status = normalizeQuestionMode(diagnosis.status || diagnosis.sessionStatus || '')
  const routePrimaryAction = normalizeQuestionMode(diagnosis.routePrimaryAction || '')
  return (
    diagnosis.questionRequired === false ||
    status === 'completed' ||
    status === 'closed' ||
    routePrimaryAction === 'finalize' ||
    routePrimaryAction === 'direct_result'
  )
}

export function normalizeDiagnosisDirectionChoices(
  directionChoices = [],
  { diagnosis = {}, visibleOutcomes = [] } = {}
) {
  if (shouldSuppressDirectionChoicesForSingleVisibleOutcome(diagnosis, visibleOutcomes)) {
    return []
  }
  return Array.isArray(directionChoices) ? directionChoices : []
}

function resolveQuestionPackageLimit(questionPackage = null, uiHints = {}) {
  const candidateValues = [
    questionPackage?.questionCount,
    questionPackage?.maxQuestionsThisRound,
    uiHints?.maxQuestionsThisRound
  ]
  for (const value of candidateValues) {
    const count = Number(value)
    if (Number.isFinite(count) && count > 1) {
      return count
    }
  }
  return 1
}

function isActiveQuestionPackage({
  stage = '',
  questionPackage = null,
  uiHints = {},
  questions = []
} = {}) {
  if (!questions.length) {
    return false
  }
  const normalizedStage = normalizeQuestionMode(stage)
  const answerSubmitMode = normalizeQuestionMode(
    uiHints?.answerSubmitMode || questionPackage?.answerSubmitMode
  )
  const questionDisplayMode = normalizeQuestionMode(
    uiHints?.questionDisplayMode || questionPackage?.questionDisplayMode
  )
  return (
    normalizedStage === 'question_package' ||
    answerSubmitMode === 'package' ||
    questionDisplayMode === 'package' ||
    Boolean(questionPackage && questions.length > 1)
  )
}

export function normalizeQuestions(questions = [], options = {}) {
  const limit = Math.max(1, Number(options?.limit || 1))
  return (Array.isArray(questions) ? questions : [])
    .filter(item => getQuestionIdentity(item))
    .slice(0, limit)
    .map(item => ({
      ...(item.questionId ? { questionId: item.questionId } : {}),
      questionKey: getQuestionIdentity(item),
      targetSymptomKey: item.targetSymptomKey || '',
      packageTopic: item.packageTopic || '',
      questionGroupKey: item.questionGroupKey || '',
      packageSection: item.packageSection || '',
      routePackageRole: item.routePackageRole || '',
      packageEffect: item.packageEffect || '',
      text:
        item.questionTextUserCn ||
        item.questionTextCn ||
        item.text ||
        item.questionText ||
        item.title ||
        '',
      helpText: item.helpTextCn || item.helpText || item.questionHelpText || '',
      defaultOptionKey: item.defaultOptionKey || '',
      defaultOptionId: item.defaultOptionId || '',
      uiVariant: item.uiVariant || '',
      renderMode: item.renderMode || '',

      weather: item.weather,
      weatherByDate: item.weatherByDate,
      environmentWeatherWindow: item.environmentWeatherWindow,
      environmentContext: item.environmentContext,
      payload: item.payload,

      careBehaviorTimeline:
        item.careBehaviorTimeline || item.care_behavior_timeline || item.timeline,
      timeline: item.timeline,

      options: (Array.isArray(item.options) ? item.options : [])
        .filter(option => option?.optionId || option?.optionKey)
        .map(option => ({
          optionId: option.optionId || option.optionKey,
          optionKey: option.optionKey || option.optionId || '',
          text:
            option.optionTextUserCn ||
            option.optionTextCn ||
            option.text ||
            option.optionText ||
            option.label ||
            option.desc ||
            '',
          description:
            option.optionDescriptionUserCn ||
            option.descriptionCn ||
            option.optionDescription ||
            option.description ||
            option.desc ||
            '',
          isDefault: Boolean(option.isDefault)
        }))
    }))
}

export function normalizeDiagnosisResult(
  diagnosisResult,
  { images = [], plantName = '植物' } = {}
) {
  const diagnosis = diagnosisResult || {}
  const hasIncomingQuestions = Array.isArray(diagnosis.questions) && diagnosis.questions.length
  const stage = diagnosis.stage || (hasIncomingQuestions ? 'question_package' : 'final')
  const rawUiHints =
    diagnosis.uiHints && typeof diagnosis.uiHints === 'object' && !Array.isArray(diagnosis.uiHints)
      ? diagnosis.uiHints
      : {}
  const rawQuestionPackage =
    diagnosis.questionPackage &&
    typeof diagnosis.questionPackage === 'object' &&
    !Array.isArray(diagnosis.questionPackage)
      ? { ...diagnosis.questionPackage }
      : null
  const directVisualResult =
    normalizeQuestionMode(diagnosis.routePrimaryAction) === 'direct_result' ||
    normalizeQuestionMode(diagnosis.diagnosisModeRouteResult?.nextAction) === 'direct_result' ||
    (diagnosis.questionRequired === false &&
      normalizeQuestionMode(diagnosis.sessionStatus || diagnosis.status) === 'completed' &&
      Array.isArray(diagnosis.visibleOutcomes) &&
      diagnosis.visibleOutcomes.length > 0)
  const normalizedQuestions = normalizeQuestions(resolveDiagnosisQuestionSource(diagnosis), {
    limit: resolveQuestionPackageLimit(rawQuestionPackage, rawUiHints)
  })
  const questions = directVisualResult ? [] : normalizedQuestions
  const finalResult = diagnosis.finalResult || null
  const explanation = diagnosis.explanation || diagnosis.resultExplanation || {}
  const normalizedNextSteps = normalizeDiagnosisAdviceSteps(diagnosis, explanation)
  const normalizedWhatToAvoid = normalizeDiagnosisAvoidAdvice(diagnosis, explanation)
  const activeQuestionPackage =
    !directVisualResult &&
    isActiveQuestionPackage({
      stage,
      questionPackage: rawQuestionPackage,
      uiHints: rawUiHints,
      questions
    })
  const hasActiveQuestions = Boolean(
    questions.length &&
    (activeQuestionPackage || normalizeQuestionMode(stage) === 'question_package')
  )
  const observedSymptoms = normalizeObservedSymptoms(
    diagnosis.observedSymptoms || diagnosis.symptoms
  )
  const problemCausality = normalizeProblemCausality(diagnosis.problemCausality)
  const outcomeType = normalizeOutcomeType(
    diagnosis.outcomeType || finalResult?.outcomeType || diagnosis.summaryCard?.outcomeType
  )
  const summaryCard = diagnosis.summaryCard || null
  const observedEvidenceSet = normalizeObservedEvidenceSet(diagnosis.observedEvidenceSet)
  const derivedEvidenceSet = normalizeDerivedEvidenceSet(diagnosis.derivedEvidenceSet)
  const diagnosisDirections = normalizeDiagnosisDirections(diagnosis.diagnosisDirections)
  const questionPackageSnapshot = normalizeQuestionPackageSnapshot(
    diagnosis.questionPackageSnapshot
  )
  const stopState = normalizeStopState(diagnosis.stopState)
  const outputEligibility = normalizeOutputEligibility(diagnosis.outputEligibility)
  const diagnosticTrace = normalizeDiagnosticTrace(diagnosis.diagnosticTrace)
  const visualBatchTrace = normalizeVisualBatchTrace(diagnosis.visualBatchTrace)
  const visualAggregateSummary = normalizeVisualAggregateSummary(diagnosis.visualAggregateSummary)
  const shadowCompareSummary =
    normalizeShadowCompareSummary(diagnosis.shadowCompareSummary) ||
    visualAggregateSummary?.shadowCompareSummary ||
    null
  const sessionPrimaryOutcome = normalizeOutcomeEntry(
    diagnosis.primaryOutcome || finalResult?.primaryOutcome
  )
  const sessionSecondaryOutcomes = normalizeOutcomeList(
    diagnosis.secondaryOutcomes || finalResult?.secondaryOutcomes
  )
  const visibleOutcomes = synthesizeVisibleOutcomes({
    visibleOutcomes: normalizeOutcomeList(
      diagnosis.visibleOutcomes || finalResult?.visibleOutcomes
    ),
    sessionPrimaryOutcome,
    sessionSecondaryOutcomes
  })
  const directionChoices = normalizeDiagnosisDirectionChoices(diagnosis.directionChoices, {
    diagnosis,
    visibleOutcomes
  })
  const routeDecisionCause = normalizeRouteDecisionCause(
    diagnosis.routeDecisionCause ||
      finalResult?.routeDecisionCause ||
      diagnosis.routeDecision?.decisionCause ||
      diagnosis.stopDecision?.decisionCause
  )
  const actionAdvice = normalizeActionAdvice(diagnosis.actionAdvice || finalResult?.actionAdvice)
  const routeDecision = normalizeRouteDecision(diagnosis.routeDecision)
  // A package snapshot with zero active questions can survive a direct-result
  // response. Do not expose that stale package to the popup or render a
  // misleading question count.
  const questionPackage = activeQuestionPackage ? rawQuestionPackage : null
  const rawMaxQuestionsThisRound = rawUiHints?.maxQuestionsThisRound
  const hasMaxQuestionsThisRound =
    rawMaxQuestionsThisRound !== undefined &&
    rawMaxQuestionsThisRound !== null &&
    Number.isFinite(Number(rawMaxQuestionsThisRound))
  const questionDisplayMode =
    rawUiHints?.questionDisplayMode ||
    questionPackage?.questionDisplayMode ||
    (activeQuestionPackage ? 'package' : 'single')
  const answerSubmitMode =
    rawUiHints?.answerSubmitMode ||
    questionPackage?.answerSubmitMode ||
    (activeQuestionPackage ? 'package' : 'per_question')
  const coreProcess = normalizeCoreProcess(diagnosis.coreProcess, {
    latestVisualCallBatchId: diagnosis.latestVisualCallBatchId || null,
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: diagnosis.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(diagnosis.environmentDeviationHints)
      ? diagnosis.environmentDeviationHints
      : [],
    routePrimaryAction: diagnosis.routePrimaryAction || '',
    questionPackageSnapshot,
    stopReason: diagnosis.stopReason || '',
    stopState,
    outputEligibility,
    diagnosticTrace,
    visualBatchTrace,
    visualAggregateSummary,
    shadowCompareSummary
  })

  const severity = finalResult?.severity || summaryCard?.severity || 'medium'

  return {
    diagnosisSessionId: diagnosis.diagnosisSessionId || '',
    resultId: diagnosis.resultId || '',
    roundId: diagnosis.roundId || 'round_1',
    plantId: diagnosis.plantId || diagnosis.userPlantId || diagnosis.plantCatalogId || '',
    userPlantId: diagnosis.userPlantId || null,
    plantCatalogId: diagnosis.plantCatalogId || null,
    plantIdentityId: diagnosis.plantIdentityId || '',
    latestVisualCallBatchId: diagnosis.latestVisualCallBatchId || null,
    stage,
    status:
      diagnosis.status || diagnosis.sessionStatus || (hasActiveQuestions ? 'active' : 'closed'),
    outcomeType,
    nonProblematicType: diagnosis.nonProblematicType || '',
    nonProblematicLabel: diagnosis.nonProblematicLabel || '',
    routePrimaryAction: diagnosis.routePrimaryAction || '',
    identityResolutionStatus: diagnosis.identityResolutionStatus || '',
    stopReason: diagnosis.stopReason || '',
    plantName,
    scientificName: resolveScientificName(diagnosis),
    healthStatusText: mapSeverityToHealthText({ severity, outcomeType, hasActiveQuestions }),
    mainIssueText: resolveMainIssueText({
      finalResult,
      summaryCard,
      outcomeType,
      hasActiveQuestions
    }),
    summaryText: resolveSummaryText({ finalResult, summaryCard, explanation, outcomeType }),
    questions,
    ...(questionPackage ? { questionPackage } : {}),
    hasActiveQuestions,
    answerRevision: Number(diagnosis.answerRevision || 0),
    uiPatch:
      diagnosis.uiPatch && typeof diagnosis.uiPatch === 'object'
        ? {
            keepUntilQuestionId: String(diagnosis.uiPatch.keepUntilQuestionId || '').trim(),
            invalidatedFromQuestionId: String(
              diagnosis.uiPatch.invalidatedFromQuestionId || ''
            ).trim()
          }
        : null,
    finalResult,
    visibleOutcomes,
    directionChoices,
    recommendedDirection: diagnosis.recommendedDirection || '',
    recommendedMode: diagnosis.recommendedMode || '',
    candidateModes: Array.isArray(diagnosis.candidateModes) ? diagnosis.candidateModes : [],
    provisionalModes: Array.isArray(diagnosis.provisionalModes) ? diagnosis.provisionalModes : [],
    candidateRefinementAvailable: Boolean(
      diagnosis.candidateRefinementAvailable && directionChoices.length > EMPTY_COUNT
    ),
    outcomeMode: normalizeOutcomeModeText(
      diagnosis.outcomeMode || finalResult?.outcomeMode || routeDecision?.mode || '',
      visibleOutcomes
    ),
    routeDecisionCause,
    actionAdvice,
    routeDecision,
    contributingFactors: Array.isArray(diagnosis.contributingFactors)
      ? diagnosis.contributingFactors
      : [],
    intermediateStates: Array.isArray(diagnosis.intermediateStates)
      ? diagnosis.intermediateStates
      : [],
    nextSteps: normalizedNextSteps,
    whatToAvoid: normalizedWhatToAvoid,
    problemCausality,
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: diagnosis.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(diagnosis.environmentDeviationHints)
      ? diagnosis.environmentDeviationHints
      : [],
    questionPackageSnapshot,
    stopState,
    outputEligibility,
    diagnosticTrace,
    coreProcess,
    visualBatchTrace,
    visualAggregateSummary,
    shadowCompareSummary,
    retakeRequest:
      diagnosis.retakeRequest && typeof diagnosis.retakeRequest === 'object'
        ? diagnosis.retakeRequest
        : null,
    retakeAuthorizationState:
      diagnosis.retakeAuthorizationState && typeof diagnosis.retakeAuthorizationState === 'object'
        ? diagnosis.retakeAuthorizationState
        : null,
    uiHints: {
      canUploadMoreImages: Boolean(rawUiHints?.canUploadMoreImages),
      maxQuestionsThisRound: hasMaxQuestionsThisRound
        ? Number(rawMaxQuestionsThisRound)
        : questions.length,
      questionDisplayMode,
      answerSubmitMode,
      optionLayout: rawUiHints?.optionLayout || 'vertical',
      transition: rawUiHints?.transition || 'swiper'
    },
    confidenceLevel: diagnosis.confidenceLevel || 'normal',
    confidenceReasons: normalizeStringList(diagnosis.confidenceReasons),
    needHumanReview: Boolean(diagnosis.needHumanReview),
    treatmentText:
      diagnosis.treatmentText ||
      normalizedNextSteps
        .map(item => item?.text)
        .filter(Boolean)
        .join('\n') ||
      explanation?.firstAid,
    preventionText:
      diagnosis.preventionText ||
      normalizedWhatToAvoid.filter(Boolean).join('\n') ||
      explanation?.avoid,
    images
  }
}
