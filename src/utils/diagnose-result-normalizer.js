import {
  mapSeverityToHealthText,
  normalizeOutcomeType,
  normalizeStringList
} from './diagnose-flow-shared.js'
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
  normalizeQuestionQueue,
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

function resolveDiagnosisQuestionSource(diagnosis = {}) {
  if (Array.isArray(diagnosis.questions) && diagnosis.questions.length) {
    return diagnosis.questions
  }
  if (Array.isArray(diagnosis.followUps) && diagnosis.followUps.length) {
    return diagnosis.followUps
  }
  return Array.isArray(diagnosis.questions) ? diagnosis.questions : diagnosis.followUps
}

export function normalizeQuestions(questions = [], options = {}) {
  const limit = Math.max(1, Number(options?.limit || 1))
  return (Array.isArray(questions) ? questions : [])
    .filter(item => item?.questionId)
    .slice(0, limit)
    .map(item => ({
      questionId: item.questionId,
      questionKey: item.questionKey || item.questionId,
      targetSymptomKey: item.targetSymptomKey || '',
      targetDimension: item.targetDimension || '',
      questionGroupKey: item.questionGroupKey || '',
      routingScope: item.routingScope || '',
      questionRole: item.questionRole || item.questionCategory || '',
      questionCategory: item.questionCategory || item.questionRole || '',
      effectMode: item.effectMode || '',
      text: item.questionTextUserCn || item.questionTextCn || item.text || item.questionText || item.title || '',
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

      careBehaviorTimeline: item.careBehaviorTimeline || item.care_behavior_timeline || item.timeline,
      timeline: item.timeline,

      options: (Array.isArray(item.options) ? item.options : [])
        .filter(option => option?.optionId)
        .map(option => ({
          optionId: option.optionId,
          optionKey: option.optionKey || '',
          text: option.optionTextUserCn || option.optionTextCn || option.text || option.optionText || option.label || option.desc || '',
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

export function normalizeDiagnosisResult(diagnosisResult, { images = [], plantName = '植物' } = {}) {
  const diagnosis = diagnosisResult || {}
  const stage = diagnosis.stage || 'followup'
  const rawQuestionPackage =
    diagnosis.questionPackage &&
    typeof diagnosis.questionPackage === 'object' &&
    !Array.isArray(diagnosis.questionPackage)
      ? { ...diagnosis.questionPackage }
      : null
  const packageQuestionCount = Number(rawQuestionPackage?.questionCount || 0)
  const followUps = normalizeQuestions(resolveDiagnosisQuestionSource(diagnosis), {
    limit: rawQuestionPackage && Number.isFinite(packageQuestionCount) && packageQuestionCount > 1
      ? packageQuestionCount
      : 1
  })
  const finalResult = diagnosis.finalResult || null
  const explanation = diagnosis.explanation || diagnosis.resultExplanation || {}
  const normalizedNextSteps = normalizeDiagnosisAdviceSteps(diagnosis, explanation)
  const normalizedWhatToAvoid = normalizeDiagnosisAvoidAdvice(diagnosis, explanation)
  const followUpRequired = Boolean(diagnosis.followUpRequired) || (stage === 'followup' && followUps.length > 0)
  const observedSymptoms = normalizeObservedSymptoms(
    diagnosis.observedSymptoms || diagnosis.symptoms
  )
  const problemCausality = normalizeProblemCausality(diagnosis.problemCausality)
  const outcomeType = normalizeOutcomeType(
    diagnosis.outcomeType ||
      finalResult?.outcomeType ||
      diagnosis.summaryCard?.outcomeType
  )
  const summaryCard = diagnosis.summaryCard || null
  const observedEvidenceSet = normalizeObservedEvidenceSet(diagnosis.observedEvidenceSet)
  const derivedEvidenceSet = normalizeDerivedEvidenceSet(diagnosis.derivedEvidenceSet)
  const diagnosisDirections = normalizeDiagnosisDirections(diagnosis.diagnosisDirections)
  const questionQueue = normalizeQuestionQueue(diagnosis.questionQueue)
  const stopState = normalizeStopState(diagnosis.stopState)
  const outputEligibility = normalizeOutputEligibility(diagnosis.outputEligibility)
  const diagnosticTrace = normalizeDiagnosticTrace(diagnosis.diagnosticTrace)
  const visualBatchTrace = normalizeVisualBatchTrace(diagnosis.visualBatchTrace)
  const visualAggregateSummary = normalizeVisualAggregateSummary(diagnosis.visualAggregateSummary)
  const shadowCompareSummary =
    normalizeShadowCompareSummary(diagnosis.shadowCompareSummary) ||
    visualAggregateSummary?.shadowCompareSummary ||
    null
  const legacyPrimaryOutcome = normalizeOutcomeEntry(
    diagnosis.primaryOutcome || finalResult?.primaryOutcome
  )
  const legacySecondaryOutcomes = normalizeOutcomeList(
    diagnosis.secondaryOutcomes || finalResult?.secondaryOutcomes
  )
  const visibleOutcomes = synthesizeVisibleOutcomes({
    visibleOutcomes: normalizeOutcomeList(
      diagnosis.visibleOutcomes || finalResult?.visibleOutcomes
    ),
    legacyPrimaryOutcome,
    legacySecondaryOutcomes
  })
  const routeDecisionCause = normalizeRouteDecisionCause(
    diagnosis.routeDecisionCause ||
      finalResult?.routeDecisionCause ||
      diagnosis.routeDecision?.decisionCause ||
      diagnosis.stopDecision?.decisionCause
  )
  const actionAdvice = normalizeActionAdvice(
    diagnosis.actionAdvice || finalResult?.actionAdvice
  )
  const routeDecision = normalizeRouteDecision(diagnosis.routeDecision)
  const questionPackage = rawQuestionPackage
  const rawMaxQuestionsThisRound = diagnosis?.uiHints?.maxQuestionsThisRound
  const hasMaxQuestionsThisRound = rawMaxQuestionsThisRound !== undefined &&
    rawMaxQuestionsThisRound !== null &&
    Number.isFinite(Number(rawMaxQuestionsThisRound))
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
    questionQueue,
    stopReason: diagnosis.stopReason || '',
    stopState,
    outputEligibility,
    diagnosticTrace,
    visualBatchTrace,
    visualAggregateSummary,
    shadowCompareSummary
  })

  const severity =
    finalResult?.severity ||
    summaryCard?.severity ||
    'medium'

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
    status: diagnosis.status || diagnosis.sessionStatus || (followUpRequired ? 'active' : 'closed'),
    outcomeType,
    nonProblematicType: diagnosis.nonProblematicType || '',
    nonProblematicLabel: diagnosis.nonProblematicLabel || '',
    routePrimaryAction: diagnosis.routePrimaryAction || '',
    identityResolutionStatus: diagnosis.identityResolutionStatus || '',
    stopReason: diagnosis.stopReason || '',
    plantName,
    scientificName: resolveScientificName(diagnosis),
    healthStatusText: mapSeverityToHealthText({ severity, outcomeType, followUpRequired }),
    mainIssueText: resolveMainIssueText({ finalResult, summaryCard, outcomeType, followUpRequired }),
    summaryText: resolveSummaryText({ finalResult, summaryCard, explanation, outcomeType }),
    followUps,
    ...(questionPackage ? { questionPackage } : {}),
    followUpRequired,
    answerRevision: Number(diagnosis.answerRevision || 0),
    uiPatch:
      diagnosis.uiPatch && typeof diagnosis.uiPatch === 'object'
        ? {
            keepUntilQuestionId: String(diagnosis.uiPatch.keepUntilQuestionId || '').trim(),
            invalidatedFromQuestionId: String(diagnosis.uiPatch.invalidatedFromQuestionId || '').trim()
          }
        : null,
    finalResult,
    visibleOutcomes,
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
    questionQueue,
    stopState,
    outputEligibility,
    diagnosticTrace,
    coreProcess,
    visualBatchTrace,
    visualAggregateSummary,
    shadowCompareSummary,
    uiHints: {
      canUploadMoreImages: Boolean(diagnosis?.uiHints?.canUploadMoreImages),
      maxQuestionsThisRound: hasMaxQuestionsThisRound ? Number(rawMaxQuestionsThisRound) : followUps.length ? 1 : 0,
      questionDisplayMode: diagnosis?.uiHints?.questionDisplayMode || 'single',
      answerSubmitMode: diagnosis?.uiHints?.answerSubmitMode || 'per_question',
      optionLayout: diagnosis?.uiHints?.optionLayout || 'vertical',
      transition: diagnosis?.uiHints?.transition || 'swiper'
    },
    confidenceLevel: diagnosis.confidenceLevel || 'normal',
    confidenceReasons: normalizeStringList(diagnosis.confidenceReasons),
    needHumanReview: Boolean(diagnosis.needHumanReview),
    treatmentText:
      diagnosis.treatmentText ||
      normalizedNextSteps.map(item => item?.text).filter(Boolean).join('\n') ||
      explanation?.firstAid,
    preventionText:
      diagnosis.preventionText ||
      normalizedWhatToAvoid.filter(Boolean).join('\n') ||
      explanation?.avoid,
    images
  }
}
