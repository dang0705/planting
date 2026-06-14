'use strict'

function normalizeStringList(items = []) {
  return (Array.isArray(items) ? items : []).map(item => String(item || '').trim()).filter(Boolean)
}

const {
  compactCareBehaviorTimelineForPublic,
  compactEnvironmentCareContextForPublic
} = require('../presenters/diagnosis-round-presenter')
const {
  buildQuestionPackageUiHints,
  buildQuestionPackage,
  buildYellowingQuestionPackage,
  resolveResponseQuestions
} = require('./question-package-response')
const {
  pickMinimalPackageQuestions,
  buildQuestionPackageSummaryCard
} = require('./frontend-question-package-response')

function pickMinimalQuestions(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item?.questionId || item?.questionKey)
    .slice(0, 1)
    .map(item => {
      const questionText = String(
        item?.text || item?.questionText || item?.questionTextUserCn || item?.questionTextCn || ''
      ).trim()

      return {
        questionId: String(item?.questionId || item?.questionKey || '').trim(),
        questionKey: String(item?.questionKey || item?.questionId || '').trim(),
        targetSymptomKey: String(item?.targetSymptomKey || '').trim(),
        packageTopic: String(item?.packageTopic || '').trim(),
        questionGroupKey: String(item?.questionGroupKey || '').trim(),
        packageSection: String(item?.packageSection || '').trim(),
        routePackageRole: String(item?.routePackageRole || item?.routePackageRole || '').trim(),
        routePackageRole: String(item?.routePackageRole || item?.routePackageRole || '').trim(),
        packageEffect: String(item?.packageEffect || '').trim(),
        defaultOptionKey: String(item?.defaultOptionKey || '').trim(),
        defaultOptionId: String(item?.defaultOptionId || '').trim(),
        uiVariant: String(item?.uiVariant || '').trim(),
        renderMode: String(item?.renderMode || '').trim(),
        text: questionText,
        questionText,
        helpText: String(item?.helpText || '').trim(),
        options: (Array.isArray(item?.options) ? item.options : [])
          .filter(option => option?.optionId || option?.optionKey)
          .map(option => ({
            optionId: String(option?.optionId || option?.optionKey || '').trim(),
            optionKey: String(option?.optionKey || option?.optionId || '').trim(),
            text: String(option?.text || option?.label || '').trim(),
            description: String(option?.description || option?.desc || '').trim(),
            isDefault: Boolean(option?.isDefault)
          }))
      }
    })
}

function pickMinimalNextSteps(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      if (typeof item === 'string') {
        const text = item.trim()
        return text ? { text } : null
      }

      const text = String(item?.text || item?.title || item?.label || '').trim()
      return text
        ? {
            text,
            type: String(item?.type || '').trim(),
            priority: Number(item?.priority || 0) || undefined
          }
        : null
    })
    .filter(Boolean)
}

function pickMinimalTextItems(items = []) {
  return normalizeStringList(
    (Array.isArray(items) ? items : []).map(item =>
      typeof item === 'string' ? item : item?.text || item?.title || item?.label || ''
    )
  )
}

function pickMinimalActionAdvice(actionAdvice = null) {
  if (!actionAdvice || typeof actionAdvice !== 'object') {
    return null
  }
  const compact = {
    todayActions: normalizeStringList(actionAdvice.todayActions),
    threeDayActions: normalizeStringList(actionAdvice.threeDayActions),
    sevenDayObserve: normalizeStringList(actionAdvice.sevenDayObserve),
    avoidActions: normalizeStringList(actionAdvice.avoidActions),
    retakeOrEscalate: normalizeStringList(actionAdvice.retakeOrEscalate),
    conflictDetected: Boolean(actionAdvice.conflictDetected)
  }
  const hasText =
    compact.todayActions.length ||
    compact.threeDayActions.length ||
    compact.sevenDayObserve.length ||
    compact.avoidActions.length ||
    compact.retakeOrEscalate.length
  return hasText || compact.conflictDetected ? compact : null
}

function pickActionAdviceStepTexts(actionAdvice = null) {
  const compact = pickMinimalActionAdvice(actionAdvice)
  if (!compact) {
    return []
  }
  return normalizeStringList([
    ...compact.todayActions,
    ...compact.threeDayActions,
    ...compact.sevenDayObserve
  ])
}

function pickActionAdviceAvoidTexts(actionAdvice = null) {
  const compact = pickMinimalActionAdvice(actionAdvice)
  if (!compact) {
    return []
  }
  return normalizeStringList([
    ...compact.avoidActions,
    ...(compact.conflictDetected ? compact.retakeOrEscalate : [])
  ])
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function buildMinimalAdviceSteps(publicResponse = {}, explanation = null) {
  const actionAdviceTexts = pickActionAdviceStepTexts(
    publicResponse.actionAdvice || publicResponse.finalResult?.actionAdvice
  )
  const directSteps = pickMinimalNextSteps(publicResponse.nextSteps)
  const conservativeTexts = normalizeStringList([
    publicResponse.treatmentText,
    publicResponse.treatment,
    explanation?.firstAid
  ])
  const mergedTexts = normalizeStringList([
    ...actionAdviceTexts,
    ...directSteps.map(item => item.text),
    ...conservativeTexts
  ])

  return mergedTexts.map((text, index) => ({
    text,
    type: directSteps[index]?.type || (index >= directSteps.length ? 'conservative' : ''),
    priority: directSteps[index]?.priority
  }))
}

function buildMinimalAvoidAdvice(publicResponse = {}, explanation = null) {
  const actionAdviceTexts = pickActionAdviceAvoidTexts(
    publicResponse.actionAdvice || publicResponse.finalResult?.actionAdvice
  )
  return normalizeStringList([
    ...actionAdviceTexts,
    ...pickMinimalTextItems(publicResponse.whatToAvoid),
    publicResponse.preventionText,
    publicResponse.prevention,
    explanation?.avoid
  ])
}

function pickMinimalFinalResult(finalResult = null) {
  if (!finalResult || typeof finalResult !== 'object') {
    return null
  }
  const visibleOutcomes = buildVisibleOutcomeEntries(finalResult)
  return {
    resultId: String(finalResult?.resultId || '').trim(),
    problemId: String(finalResult?.problemId || '').trim(),
    problemKey: String(finalResult?.problemKey || '').trim(),
    displayName: String(finalResult?.displayName || finalResult?.problemName || '').trim(),
    problemName: String(finalResult?.problemName || finalResult?.displayName || '').trim(),
    summary: String(finalResult?.summary || '').trim(),
    severity: String(finalResult?.severity || '').trim(),
    confidenceLevel: String(finalResult?.confidenceLevel || '').trim(),
    outcomeType: String(finalResult?.outcomeType || '').trim(),
    nonProblematicType: String(finalResult?.nonProblematicType || '').trim(),
    visibleOutcomes,
    outcomeMode: normalizeOutcomeMode(finalResult?.outcomeMode || '', visibleOutcomes),
    actionAdvice: pickMinimalActionAdvice(finalResult?.actionAdvice)
  }
}

function pickMinimalOutcomeEntry(outcome = null) {
  if (!outcome || typeof outcome !== 'object') {
    return null
  }
  return {
    outcomeKey: String(outcome?.outcomeKey || outcome?.problemKey || '').trim(),
    problemKey: String(outcome?.problemKey || outcome?.outcomeKey || '').trim(),
    outcomeType: String(outcome?.outcomeType || '').trim(),
    outcomeCategory: String(outcome?.outcomeCategory || '').trim(),
    displayNameCn: String(outcome?.displayNameCn || outcome?.displayName || '').trim(),
    summary: String(outcome?.summary || '').trim(),
    severity: String(outcome?.severity || '').trim(),
    urgency: String(outcome?.urgency || '').trim(),
    actionAdviceItems: normalizeStringList(outcome?.actionAdviceItems),
    avoidAdviceItems: normalizeStringList(outcome?.avoidAdviceItems)
  }
}

function resolveOutcomeIdentityKey(outcome = null, index = 0) {
  if (!outcome || typeof outcome !== 'object') {
    return `outcome_${index}`
  }
  return (
    normalizeText(outcome.outcomeKey || outcome.problemKey || outcome.problemId || '') ||
    `outcome_${index}`
  )
}

function buildVisibleOutcomeEntries(source = {}) {
  const directVisibleOutcomes = Array.isArray(
    source.visibleOutcomes || source.finalResult?.visibleOutcomes
  )
    ? source.visibleOutcomes || source.finalResult?.visibleOutcomes
    : []
  const primaryOutcomeEntry = source.primaryOutcome || source.finalResult?.primaryOutcome || null
  const secondaryOutcomeEntries = Array.isArray(
    source.secondaryOutcomes || source.finalResult?.secondaryOutcomes
  )
    ? source.secondaryOutcomes || source.finalResult?.secondaryOutcomes
    : []
  const merged = []
  const seen = new Set()
  for (const outcome of [
    ...directVisibleOutcomes,
    ...[primaryOutcomeEntry].filter(Boolean),
    ...secondaryOutcomeEntries
  ]) {
    const minimalOutcome = pickMinimalOutcomeEntry(outcome)
    if (!minimalOutcome) {
      continue
    }
    const identityKey = resolveOutcomeIdentityKey(minimalOutcome, merged.length)
    if (seen.has(identityKey)) {
      continue
    }
    seen.add(identityKey)
    merged.push(minimalOutcome)
  }
  return merged
}

function normalizeOutcomeMode(value = '', visibleOutcomes = []) {
  const normalized = normalizeText(value)
  if (['primary_with_secondary', 'primary_only'].includes(normalized)) {
    return Array.isArray(visibleOutcomes) && visibleOutcomes.length ? 'visible_outcomes' : ''
  }
  return normalized
}

function pickMinimalSummaryCard(summaryCard = null) {
  if (!summaryCard || typeof summaryCard !== 'object') {
    return null
  }
  return {
    title: String(summaryCard?.title || '').trim(),
    subtitle: String(summaryCard?.subtitle || '').trim(),
    severity: String(summaryCard?.severity || '').trim(),
    statusText: String(summaryCard?.statusText || '').trim()
  }
}

function pickMinimalVisualBatchTrace(trace = null) {
  if (!trace || typeof trace !== 'object') {
    return null
  }
  return {
    currentVisualCallBatchId:
      trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || null,
    originVisualCallBatchId:
      trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || null,
    supersedeTargetBatchId:
      trace?.supersedeTargetBatchId || trace?.supersede_target_batch_id || null,
    supersededByBatchId: trace?.supersededByBatchId || trace?.superseded_by_batch_id || null,
    supersedeApplied: Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) ? 1 : 0,
    supersedeReason: String(trace?.supersedeReason || trace?.supersede_reason || '').trim()
  }
}

function pickMinimalVisualAggregateSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }
  return {
    visualCallBatchId: summary?.visualCallBatchId || summary?.visual_call_batch_id || null,
    effectiveImageCount: Number(
      summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0
    ),
    aggregateQualityGrade: String(
      summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || ''
    ).trim(),
    aggregateAnalyzability: String(
      summary?.aggregateAnalyzability || summary?.aggregate_analyzability || ''
    ).trim(),
    suggestedFollowupCapture: normalizeStringList(
      summary?.suggestedFollowupCapture || summary?.suggested_question_capture
    ),
    admissionReadyFlag: Number(summary?.admissionReadyFlag ?? summary?.admission_ready_flag ?? 0)
      ? 1
      : 0,
    routePrimaryAction: String(
      summary?.routePrimaryAction || summary?.route_primary_action || ''
    ).trim()
  }
}

function pickMinimalOutputEligibility(outputEligibility = null) {
  if (!outputEligibility || typeof outputEligibility !== 'object') {
    return null
  }
  return {
    eligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
    judgment: String(outputEligibility?.judgment || '').trim(),
    conclusionType: String(outputEligibility?.conclusionType || '').trim(),
    conclusionStatus: String(outputEligibility?.conclusionStatus || '').trim()
  }
}

function buildFrontendDiagnosisResponse(publicResponse = {}) {
  const rawQuestions = resolveResponseQuestions(publicResponse)
  const hasActiveQuestionPackage =
    Boolean(publicResponse?.questionPackage) && rawQuestions.length > 0
  const questionPackage = hasActiveQuestionPackage
    ? buildQuestionPackage(publicResponse, rawQuestions) ||
      buildYellowingQuestionPackage(publicResponse, rawQuestions)
    : null
  const questions = hasActiveQuestionPackage
    ? pickMinimalPackageQuestions(rawQuestions, { limit: questionPackage?.questionCount || 1 })
    : pickMinimalQuestions(rawQuestions)
  if (hasActiveQuestionPackage) {
    const resultId = String(publicResponse.resultId || '').trim()
    const userPlantId = publicResponse.userPlantId || null
    const plantId =
      publicResponse.plantId || publicResponse.userPlantId || publicResponse.plantCatalogId || ''
    const plantCatalogId = publicResponse.plantCatalogId || null
    const plantIdentityId = String(publicResponse.plantIdentityId || '').trim()
    const latestVisualCallBatchId = publicResponse.latestVisualCallBatchId || null
    const answerRevision = Number(publicResponse.answerRevision || 0)
    const visualBatchTrace = pickMinimalVisualBatchTrace(publicResponse.visualBatchTrace)
    const visualAggregateSummary = pickMinimalVisualAggregateSummary(
      publicResponse.visualAggregateSummary
    )
    const careBehaviorTimeline = compactCareBehaviorTimelineForPublic(
      publicResponse.careBehaviorTimeline || null
    )
    const environmentCareContext = compactEnvironmentCareContextForPublic(
      publicResponse.environmentCareContext || null,
      publicResponse.careBehaviorTimeline || null
    )
    const uiPatch =
      publicResponse.uiPatch && typeof publicResponse.uiPatch === 'object'
        ? publicResponse.uiPatch
        : null

    return {
      diagnosisSessionId: publicResponse.diagnosisSessionId || '',
      ...(resultId ? { resultId } : {}),
      roundId: publicResponse.roundId || 'round_1',
      ...(userPlantId ? { userPlantId } : {}),
      ...(plantId ? { plantId } : {}),
      ...(plantCatalogId ? { plantCatalogId } : {}),
      ...(plantIdentityId ? { plantIdentityId } : {}),
      ...(latestVisualCallBatchId ? { latestVisualCallBatchId } : {}),
      stage: publicResponse.stage || 'question_package',
      status: publicResponse.status || publicResponse.sessionStatus || 'active',
      stopReason: publicResponse.stopReason || '',
      questions,
      ...(questionPackage ? { questionPackage } : {}),
      summaryCard: buildQuestionPackageSummaryCard(questions),
      ...(visualBatchTrace ? { visualBatchTrace } : {}),
      ...(visualAggregateSummary ? { visualAggregateSummary } : {}),
      ...(answerRevision ? { answerRevision } : {}),
      ...(uiPatch ? { uiPatch } : {}),
      ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
      ...(environmentCareContext ? { environmentCareContext } : {}),
      uiHints: buildQuestionPackageUiHints(
        publicResponse?.uiHints,
        questionPackage,
        questions.length
      )
    }
  }

  const explanation = publicResponse.explanation || publicResponse.resultExplanation || null
  const nextSteps = buildMinimalAdviceSteps(publicResponse, explanation)
  const whatToAvoid = buildMinimalAvoidAdvice(publicResponse, explanation)
  const actionAdvice = pickMinimalActionAdvice(
    publicResponse.actionAdvice || publicResponse.finalResult?.actionAdvice
  )
  const visibleOutcomes = buildVisibleOutcomeEntries(publicResponse)
  const finalResult = pickMinimalFinalResult(publicResponse.finalResult)
  const outcomeMode = normalizeOutcomeMode(
    publicResponse.outcomeMode || publicResponse.finalResult?.outcomeMode || '',
    visibleOutcomes
  )
  const treatmentText = normalizeText(
    publicResponse.treatmentText ||
      publicResponse.treatment ||
      nextSteps
        .map(item => item.text)
        .filter(Boolean)
        .join('\n') ||
      explanation?.firstAid
  )
  const preventionText = normalizeText(
    publicResponse.preventionText ||
      publicResponse.prevention ||
      whatToAvoid.join('\n') ||
      explanation?.avoid
  )
  const careBehaviorTimeline = compactCareBehaviorTimelineForPublic(
    publicResponse.careBehaviorTimeline || null
  )
  const environmentCareContext = compactEnvironmentCareContextForPublic(
    publicResponse.environmentCareContext || null,
    publicResponse.careBehaviorTimeline || null
  )
  return {
    diagnosisSessionId: publicResponse.diagnosisSessionId || '',
    resultId: publicResponse.resultId || '',
    roundId: publicResponse.roundId || 'round_1',
    userPlantId: publicResponse.userPlantId || null,
    plantId:
      publicResponse.plantId || publicResponse.userPlantId || publicResponse.plantCatalogId || '',
    plantCatalogId: publicResponse.plantCatalogId || null,
    plantIdentityId: publicResponse.plantIdentityId || '',
    latestVisualCallBatchId: publicResponse.latestVisualCallBatchId || null,
    stage: publicResponse.stage || '',
    status: publicResponse.status || publicResponse.sessionStatus || '',
    routePrimaryAction: publicResponse.routePrimaryAction || '',
    outcomeType: publicResponse.outcomeType || '',
    nonProblematicType: publicResponse.nonProblematicType || '',
    nonProblematicLabel: publicResponse.nonProblematicLabel || '',
    identityResolutionStatus: publicResponse.identityResolutionStatus || '',
    stopReason: publicResponse.stopReason || '',
    questions,
    finalResult,
    visibleOutcomes,
    blockedActionExplanations: Array.isArray(publicResponse.blockedActionExplanations)
      ? publicResponse.blockedActionExplanations
      : [],
    highRiskWarning: normalizeText(publicResponse.highRiskWarning),
    observationPeriod: normalizeText(publicResponse.observationPeriod),
    outcomeMode,
    routeDecisionCause: publicResponse.routeDecisionCause || null,
    summaryCard: pickMinimalSummaryCard(publicResponse.summaryCard),
    explanation,
    resultExplanation: explanation,
    actionAdvice,
    nextSteps,
    whatToAvoid,
    treatmentText,
    preventionText,
    careBaselineSummary: publicResponse.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(publicResponse.environmentDeviationHints)
      ? publicResponse.environmentDeviationHints
      : [],
    visualBatchTrace: pickMinimalVisualBatchTrace(publicResponse.visualBatchTrace),
    visualAggregateSummary: pickMinimalVisualAggregateSummary(
      publicResponse.visualAggregateSummary
    ),
    uiHints: {
      canUploadMoreImages: Boolean(publicResponse?.uiHints?.canUploadMoreImages),
      maxQuestionsThisRound: questions.length ? 1 : 0,
      questionDisplayMode: 'single',
      answerSubmitMode: 'per_question',
      optionLayout: 'vertical',
      transition: 'swiper'
    },
    outputEligibility: pickMinimalOutputEligibility(publicResponse.outputEligibility),
    confidenceLevel: publicResponse.confidenceLevel || '',
    confidenceReasons: normalizeStringList(publicResponse.confidenceReasons),
    needHumanReview: Boolean(publicResponse.needHumanReview),
    ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
    ...(environmentCareContext ? { environmentCareContext } : {})
  }
}

function buildFrontendAnswerResponse(publicResponse = {}) {
  const questions = pickMinimalQuestions(resolveResponseQuestions(publicResponse))
  if (questions.length) {
    return buildFrontendDiagnosisResponse(publicResponse)
  }

  const explanation = publicResponse.explanation || publicResponse.resultExplanation || null
  const visibleOutcomes = buildVisibleOutcomeEntries(publicResponse)
  const rawFinalResult = pickMinimalFinalResult(publicResponse.finalResult) || {}
  const finalResult = {
    resultId: rawFinalResult.resultId || publicResponse.resultId || '',
    problemId: rawFinalResult.problemId || '',
    problemKey: rawFinalResult.problemKey || '',
    displayName: rawFinalResult.displayName || rawFinalResult.problemName || '',
    summary: rawFinalResult.summary || '',
    severity: rawFinalResult.severity || '',
    confidenceLevel: rawFinalResult.confidenceLevel || '',
    outcomeType: rawFinalResult.outcomeType || publicResponse.outcomeType || '',
    nonProblematicType: rawFinalResult.nonProblematicType || ''
  }
  const actionAdvice = pickMinimalActionAdvice(
    publicResponse.actionAdvice || publicResponse.finalResult?.actionAdvice
  )
  const nextSteps = buildMinimalAdviceSteps(publicResponse, explanation)
  const whatToAvoid = buildMinimalAvoidAdvice(publicResponse, explanation)
  const outcomeMode = normalizeOutcomeMode(
    publicResponse.outcomeMode || publicResponse.finalResult?.outcomeMode || '',
    visibleOutcomes
  )
  const summaryCard = pickMinimalSummaryCard(publicResponse.summaryCard)
  const questionPackage =
    publicResponse.questionPackage && typeof publicResponse.questionPackage === 'object'
      ? publicResponse.questionPackage
      : null
  const hasQuestionPackageResult =
    Boolean(questionPackage) &&
    String(
      questionPackage?.answerSubmitMode || publicResponse?.uiHints?.answerSubmitMode || ''
    ).trim() === 'package'
  const packageUiHints = hasQuestionPackageResult
    ? {
        canUploadMoreImages: false,
        maxQuestionsThisRound: Number(questionPackage?.questionCount || 0),
        questionDisplayMode: questionPackage?.questionDisplayMode || 'package',
        answerSubmitMode: questionPackage?.answerSubmitMode || 'package',
        optionLayout: 'vertical',
        transition: 'swiper'
      }
    : null

  const hasVisibleOutcomes = Array.isArray(visibleOutcomes) && visibleOutcomes.length > 0
  const treatmentText = normalizeText(
    publicResponse.treatmentText ||
      publicResponse.treatment ||
      nextSteps
        .map(item => item.text)
        .filter(Boolean)
        .join('\n') ||
      explanation?.firstAid
  )
  const preventionText = normalizeText(
    publicResponse.preventionText ||
      publicResponse.prevention ||
      whatToAvoid.join('\n') ||
      explanation?.avoid
  )
  const environmentCareContext = compactEnvironmentCareContextForPublic(
    publicResponse.environmentCareContext || null,
    publicResponse.careBehaviorTimeline || null
  )

  return {
    diagnosisSessionId: publicResponse.diagnosisSessionId || '',
    resultId: publicResponse.resultId || finalResult?.resultId || '',
    roundId: publicResponse.roundId || 'round_1',
    plantId:
      publicResponse.plantId || publicResponse.userPlantId || publicResponse.plantCatalogId || '',
    stage: publicResponse.stage || 'final',
    status: publicResponse.status || publicResponse.sessionStatus || 'closed',
    outcomeType: publicResponse.outcomeType || finalResult?.outcomeType || '',
    stopReason: publicResponse.stopReason || '',
    finalResult,
    visibleOutcomes,
    blockedActionExplanations: Array.isArray(publicResponse.blockedActionExplanations)
      ? publicResponse.blockedActionExplanations
      : [],
    highRiskWarning: normalizeText(publicResponse.highRiskWarning),
    observationPeriod: normalizeText(publicResponse.observationPeriod),
    outcomeMode,
    ...(publicResponse.userPlantId ? { userPlantId: publicResponse.userPlantId } : {}),
    ...(publicResponse.plantCatalogId ? { plantCatalogId: publicResponse.plantCatalogId } : {}),
    ...(publicResponse.nonProblematicType || finalResult?.nonProblematicType
      ? {
          nonProblematicType:
            publicResponse.nonProblematicType || finalResult?.nonProblematicType || ''
        }
      : {}),
    ...(publicResponse.nonProblematicLabel
      ? { nonProblematicLabel: publicResponse.nonProblematicLabel }
      : {}),
    ...(hasQuestionPackageResult ? { questionPackage } : {}),
    ...(!hasVisibleOutcomes && actionAdvice ? { actionAdvice } : {}),
    ...(!hasVisibleOutcomes && nextSteps.length ? { nextSteps } : {}),
    ...(!hasVisibleOutcomes && whatToAvoid.length ? { whatToAvoid } : {}),
    ...(!hasVisibleOutcomes && treatmentText ? { treatmentText } : {}),
    ...(!hasVisibleOutcomes && preventionText ? { preventionText } : {}),
    ...(!hasVisibleOutcomes && summaryCard ? { summaryCard } : {}),
    confidenceLevel: publicResponse.confidenceLevel || finalResult?.confidenceLevel || '',
    ...(publicResponse.needHumanReview ? { needHumanReview: true } : {}),
    hasActiveQuestions: false,
    questions: [],
    ...(environmentCareContext ? { environmentCareContext } : {}),
    ...(packageUiHints ? { uiHints: packageUiHints } : {})
  }
}

module.exports = {
  normalizeStringList,
  pickMinimalQuestions,
  pickMinimalNextSteps,
  pickMinimalTextItems,
  pickMinimalActionAdvice,
  pickActionAdviceStepTexts,
  pickActionAdviceAvoidTexts,
  normalizeText,
  buildMinimalAdviceSteps,
  buildMinimalAvoidAdvice,
  pickMinimalFinalResult,
  pickMinimalOutcomeEntry,
  pickMinimalSummaryCard,
  buildFrontendDiagnosisResponse,
  buildFrontendAnswerResponse
}
