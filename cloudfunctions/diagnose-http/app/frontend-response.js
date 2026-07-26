'use strict'

const {
  normalizeStringList,
  pickMinimalQuestions,
  pickActiveIntermediateFields,
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
  buildVisibleOutcomeEntries,
  normalizeOutcomeMode,
  pickMinimalSummaryCard,
  pickMinimalVisualBatchTrace,
  pickMinimalVisualAggregateSummary,
  pickMinimalOutputEligibility,
  compactCareBehaviorTimelineForPublic,
  compactEnvironmentCareContextForPublic,
  buildQuestionPackageUiHints,
  buildQuestionPackage,
  buildYellowingQuestionPackage,
  resolveResponseQuestions,
  pickMinimalPackageQuestions,
  buildQuestionPackageSummaryCard
} = require('./frontend-response-helpers')

function buildFrontendDiagnosisResponse(publicResponse = {}) {
  const rawQuestions = resolveResponseQuestions(publicResponse)
  // 可选追问（likely result）场景：questions 非空但带有 finalResult/visibleOutcomes + optionalFollowUp 标记，
  // 不能走问诊包分支（hasActiveQuestionPackage），否则会丢弃 finalResult/visibleOutcomes。
  // 初始 /diagnosis/start 与 answer 路径都通过 buildFrontendDiagnosisResponse 输出，
  // 这里统一处理 optionalFollowUp，避免初始响应丢失 likely 结论。
  const hasOptionalFollowUp = Boolean(
    publicResponse?.questionPackage?.optionalFollowUp ||
      publicResponse?.uiHints?.optionalFollowUp
  )
  const hasActiveQuestionPackage =
    Boolean(publicResponse?.questionPackage) &&
    rawQuestions.length > 0 &&
    !hasOptionalFollowUp
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
      ...pickActiveIntermediateFields(publicResponse),
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
    candidateModes: Array.isArray(publicResponse.candidateModes)
      ? publicResponse.candidateModes
      : [],
    provisionalModes: Array.isArray(publicResponse.provisionalModes)
      ? publicResponse.provisionalModes
      : [],
    candidateRefinementAvailable: Boolean(publicResponse.candidateRefinementAvailable),
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
    ...pickActiveIntermediateFields(publicResponse),
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
  // 可选追问（likely result）场景：questions 非空但带有 finalResult/visibleOutcomes，
  // 不能走 buildFrontendDiagnosisResponse 的问诊包路径，否则会丢弃结论数据。
  const hasOptionalFollowUp = Boolean(
    publicResponse?.questionPackage?.optionalFollowUp ||
      publicResponse?.uiHints?.optionalFollowUp
  )
  if (questions.length && !hasOptionalFollowUp) {
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
    ).trim() === 'package' &&
    Array.isArray(publicResponse?.questions) &&
    publicResponse.questions.length > 0 &&
    Number(questionPackage?.questionCount || publicResponse.questions.length || 0) > 0
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

  const likelyResult = Boolean(
    publicResponse?.uiHints?.likelyResult || publicResponse?.questionPackage?.likelyResult
  )
  const hasActiveQuestionsFlag = Boolean(
    publicResponse?.hasActiveQuestions ||
      (hasOptionalFollowUp && Array.isArray(publicResponse?.questions) && publicResponse.questions.length > 0)
  )
  const optionalQuestions = hasOptionalFollowUp
    ? pickMinimalQuestions(resolveResponseQuestions(publicResponse))
    : []
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

  const responsePayload = {
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
    hasActiveQuestions: hasActiveQuestionsFlag,
    questions: optionalQuestions,
    ...(environmentCareContext ? { environmentCareContext } : {}),
    ...pickActiveIntermediateFields(publicResponse),
    ...(packageUiHints
      ? { uiHints: packageUiHints }
      : {
          uiHints: {
            ...(publicResponse.uiHints || {}),
            canUploadMoreImages: Boolean(publicResponse?.uiHints?.canUploadMoreImages),
            maxQuestionsThisRound: optionalQuestions.length || 0,
            questionDisplayMode: 'single',
            answerSubmitMode: 'per_question',
            optionLayout: 'vertical',
            transition: 'swiper'
          }
        })
  }
  if (hasOptionalFollowUp) {
    responsePayload.uiHints = {
      ...(responsePayload.uiHints || {}),
      optionalFollowUp: true,
      likelyResult,
      maxQuestionsThisRound: optionalQuestions.length || 1
    }
  }
  return responsePayload
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
  pickActiveIntermediateFields,
  buildFrontendDiagnosisResponse,
  buildFrontendAnswerResponse
}
