function normalizeOutcomeType(outcomeType = '') {
  return String(outcomeType || '').trim().toLowerCase()
}

function mapSeverityToHealthText({ severity = 'medium', outcomeType = '', followUpRequired = false } = {}) {
  const normalizedOutcomeType = normalizeOutcomeType(outcomeType)

  if (followUpRequired) return '待进一步确认'
  if (normalizedOutcomeType === 'non_problematic') return '暂未见明显问题'
  if (normalizedOutcomeType === 'uncertain') return '待进一步确认'

  const key = String(severity || '').toLowerCase()
  if (key === 'critical') return '严重问题'
  if (key === 'high') return '需要治疗'
  if (key === 'low') return '轻微问题'
  return '需要治疗'
}

export function getHealthClass(status) {
  const classes = {
    健康: 'bg-green-100 text-green-700 px-3 py-1 rounded-full',
    暂未见明显问题: 'bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full',
    待进一步确认: 'bg-slate-100 text-slate-700 px-3 py-1 rounded-full',
    轻微问题: 'bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full',
    需要治疗: 'bg-orange-100 text-orange-700 px-3 py-1 rounded-full',
    严重问题: 'bg-red-100 text-red-700 px-3 py-1 rounded-full'
  }
  return classes[status] || classes['待进一步确认']
}

export function formatCausalityItem(item) {
  if (!item) return ''
  return `${item?.causeProblemKey || 'unknown'} → ${item?.effectProblemKey || 'unknown'}`
}

function normalizeObservedSymptoms(observedSymptoms = []) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : [])
    .filter(item => item?.symptomKey)
    .map(item => ({
      symptomKey: item.symptomKey,
      symptomCn: item.symptomCn || item.displayTextCn || item.symptomKey,
      confidence: Number(item.confidence || 0),
      source: item.source || item.evidenceSource || 'mixed'
    }))
}

function normalizeObservedEvidenceSet(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
    .filter(item => item?.observedEvidenceSetId || item?.observed_evidence_set_id)
    .map(item => ({
      observedEvidenceSetId: String(
        item?.observedEvidenceSetId || item?.observed_evidence_set_id || ''
      ).trim(),
      evidenceKey: String(
        item?.evidenceKey || item?.evidence_key || item?.symptomKey || item?.symptom_key || ''
      ).trim(),
      evidenceType: String(item?.evidenceType || item?.evidence_type || '').trim(),
      symptomKey: String(item?.symptomKey || item?.symptom_key || '').trim(),
      symptomCn: String(
        item?.symptomCn ||
          item?.symptom_cn ||
          item?.displayTextCn ||
          item?.display_text_cn ||
          item?.symptomKey ||
          item?.symptom_key ||
          item?.evidenceKey ||
          item?.evidence_key ||
          ''
      ).trim(),
      confidence: Number(item?.confidence || 0),
      sourceType: String(item?.sourceType || item?.source_type || '').trim(),
      currentStatus: String(item?.currentStatus || item?.current_status || '').trim() || 'active',
      targetLayer: String(item?.targetLayer || item?.target_layer || '').trim(),
      evidenceRole: String(item?.evidenceRole || item?.evidence_role || '').trim(),
      observability: String(item?.observability || '').trim(),
      reliability: String(item?.reliability || '').trim(),
      parentEvidenceKey: String(item?.parentEvidenceKey || item?.parent_evidence_key || '').trim(),
      sourceRecordId: String(item?.sourceRecordId || item?.source_record_id || '').trim(),
      originVisualCallBatchId:
        item?.originVisualCallBatchId || item?.origin_visual_call_batch_id || null,
      supersededByBatchId:
        item?.supersededByBatchId || item?.superseded_by_batch_id || null,
      independenceGroupIds: (Array.isArray(item?.independenceGroupIds)
        ? item.independenceGroupIds
        : Array.isArray(item?.independence_group_ids)
          ? item.independence_group_ids
          : []
      )
        .map(value => String(value || '').trim())
        .filter(Boolean),
      firstSeenStage: String(item?.firstSeenStage || item?.first_seen_stage || '').trim(),
      lastUpdatedAt: String(item?.lastUpdatedAt || item?.last_updated_at || '').trim(),
      enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
      isKeyEvidence: Number(item?.isKeyEvidence ?? item?.is_key_evidence ?? 0) ? 1 : 0
    }))
    .filter(item => item.observedEvidenceSetId && (item.evidenceKey || item.symptomKey))
}

function normalizeVisualBatchTrace(trace = null) {
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
    supersededByBatchId:
      trace?.supersededByBatchId || trace?.superseded_by_batch_id || null,
    supersedeApplied: Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) ? 1 : 0,
    supersedeReason: String(trace?.supersedeReason || trace?.supersede_reason || '').trim(),
    supersedeScope: String(trace?.supersedeScope || trace?.supersede_scope || '').trim(),
    supersedeSource: String(trace?.supersedeSource || trace?.supersede_source || '').trim(),
    supersedeTime: String(trace?.supersedeTime || trace?.supersede_time || '').trim() || null
  }
}

function normalizeShadowCompareSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    enabled: Number(summary?.enabled ?? 0) ? 1 : 0,
    compareStatus: String(summary?.compareStatus || summary?.compare_status || '').trim() || 'disabled',
    comparedImageCount: Number(summary?.comparedImageCount ?? summary?.compared_image_count ?? 0),
    succeededImageCount: Number(summary?.succeededImageCount ?? summary?.succeeded_image_count ?? 0),
    skippedImageCount: Number(summary?.skippedImageCount ?? summary?.skipped_image_count ?? 0),
    failedImageCount: Number(summary?.failedImageCount ?? summary?.failed_image_count ?? 0),
    providers: normalizeStringList(summary?.providers),
    modelNames: normalizeStringList(summary?.modelNames || summary?.model_names)
  }
}

function normalizeVisualAggregateSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    visualCallBatchId: summary?.visualCallBatchId || summary?.visual_call_batch_id || null,
    effectiveImageCount: Number(summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0),
    organCoverageSummary:
      summary?.organCoverageSummary || summary?.organ_coverage_summary || null,
    duplicateViewGroups: Array.isArray(summary?.duplicateViewGroups || summary?.duplicate_view_groups)
      ? (summary.duplicateViewGroups || summary.duplicate_view_groups)
      : [],
    aggregateQualityGrade:
      summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || '',
    aggregateAnalyzability:
      summary?.aggregateAnalyzability || summary?.aggregate_analyzability || '',
    suggestedFollowupCapture: normalizeStringList(
      summary?.suggestedFollowupCapture || summary?.suggested_followup_capture
    ),
    admissionReadyFlag: Number(summary?.admissionReadyFlag ?? summary?.admission_ready_flag ?? 0) ? 1 : 0,
    routePrimaryAction: String(summary?.routePrimaryAction || summary?.route_primary_action || '').trim(),
    shadowCompareSummary: normalizeShadowCompareSummary(
      summary?.shadowCompareSummary || summary?.shadow_compare_summary
    )
  }
}

function normalizeQuestionQueue(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return null
  }

  return {
    questionQueueId: String(questionQueue?.questionQueueId || '').trim(),
    sessionId: String(questionQueue?.sessionId || '').trim(),
    roundId: String(questionQueue?.roundId || '').trim(),
    roundIndex: Number(questionQueue?.roundIndex || 1),
    routePrimaryAction: String(questionQueue?.routePrimaryAction || '').trim(),
    queueStatus: String(questionQueue?.queueStatus || '').trim(),
    queueDecision:
      questionQueue?.queueDecision && typeof questionQueue.queueDecision === 'object'
        ? {
            hasActionableItems: Number(questionQueue.queueDecision?.hasActionableItems || 0) ? 1 : 0,
            exhaustedReason: String(questionQueue.queueDecision?.exhaustedReason || '').trim(),
            serviceTarget: String(questionQueue.queueDecision?.serviceTarget || '').trim()
          }
        : null,
    questionItems: (Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : []).map(item => ({
      questionKey: String(item?.questionKey || '').trim(),
      questionId: String(item?.questionId || '').trim(),
      targetSymptomKey: String(item?.targetSymptomKey || '').trim(),
      questionGroupKey: String(item?.questionGroupKey || '').trim(),
      questionText: String(item?.questionText || item?.text || '').trim(),
      helpText: String(item?.helpText || '').trim(),
      currentPriority: Number(item?.currentPriority || 0),
      estimatedInformationGain: Number(item?.estimatedInformationGain || 0),
      serviceTarget: String(item?.serviceTarget || '').trim(),
      appliesWhen: item?.appliesWhen && typeof item.appliesWhen === 'object' ? item.appliesWhen : null,
      asked: Number(item?.asked || 0) ? 1 : 0,
      answered: Number(item?.answered || 0) ? 1 : 0,
      invalidated: Number(item?.invalidated || 0) ? 1 : 0,
      invalidReason: String(item?.invalidReason || '').trim(),
      status: String(item?.status || '').trim() || 'pending'
    })),
    activeItemCount: Number(questionQueue?.activeItemCount || 0),
    askedItemCount: Number(questionQueue?.askedItemCount || 0),
    answeredItemCount: Number(questionQueue?.answeredItemCount || 0),
    invalidatedItemCount: Number(questionQueue?.invalidatedItemCount || 0)
  }
}

function normalizeStopState(stopState = null) {
  if (!stopState || typeof stopState !== 'object') {
    return null
  }

  return {
    stopStateId: String(stopState?.stopStateId || '').trim(),
    sessionId: String(stopState?.sessionId || '').trim(),
    roundId: String(stopState?.roundId || '').trim(),
    roundIndex: Number(stopState?.roundIndex || 1),
    isStopped: Number(stopState?.isStopped || 0) ? 1 : 0,
    stopReasonType: String(stopState?.stopReasonType || '').trim(),
    stopReason: String(stopState?.stopReason || '').trim(),
    stopReasonText: String(stopState?.stopReasonText || '').trim(),
    finalOutputRef: stopState?.finalOutputRef || null,
    allowMoreQuestions: Number(stopState?.allowMoreQuestions || 0) ? 1 : 0
  }
}

function normalizeOutputEligibility(outputEligibility = null) {
  if (!outputEligibility || typeof outputEligibility !== 'object') {
    return null
  }

  return {
    eligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
    judgment: String(outputEligibility?.judgment || '').trim(),
    conclusionType: String(outputEligibility?.conclusionType || '').trim(),
    conclusionStatus: String(outputEligibility?.conclusionStatus || '').trim(),
    outputConservatism: String(outputEligibility?.outputConservatism || '').trim(),
    keyEvidenceSummary: String(outputEligibility?.keyEvidenceSummary || '').trim(),
    unresolvedRisks: normalizeStringList(outputEligibility?.unresolvedRisks),
    nextStepHints: normalizeStringList(outputEligibility?.nextStepHints)
  }
}

function normalizeDiagnosticTrace(trace = []) {
  return (Array.isArray(trace) ? trace : [])
    .map(item => ({
      eventType: String(item?.eventType || item?.event_type || '').trim(),
      roundId: String(item?.roundId || item?.round_id || '').trim(),
      payload: item?.payload && typeof item.payload === 'object' ? item.payload : null
    }))
    .filter(item => item.eventType)
}

function normalizeRankings(rankings = []) {
  return (Array.isArray(rankings) ? rankings : [])
    .filter(item => item?.problemKey)
    .map((item, index) => {
      const weightedScore = Number(item.weightedScore ?? item.finalScore ?? 0)
      const baseScore = Number(item.baseScore ?? item.weightedScore ?? item.finalScore ?? 0)

      return {
        problemId: item.problemId || '',
        problemKey: item.problemKey,
        problemCn: item.problemCn || item.displayName || item.problemKey,
        role: item.role || item.problemRole || '',
        rankNo: Number(item.rankNo || index + 1),
        weightedScore,
        finalScore: Number(item.finalScore ?? weightedScore),
        baseScore
      }
    })
}

function normalizeProblemCausality(items = []) {
  return (Array.isArray(items) ? items : []).map(item => ({
    causeProblemKey: item?.causeProblemKey || item?.cause_problem_key || '',
    effectProblemKey: item?.effectProblemKey || item?.effect_problem_key || '',
    relationType: item?.relationType || item?.relation_type || '',
    relationStrength: Number(item?.relationStrength ?? item?.relation_strength ?? 0),
    note: item?.note || ''
  }))
}

function normalizeQuestions(questions = []) {
  return (Array.isArray(questions) ? questions : [])
    .filter(item => item?.questionId)
    .map(item => ({
      questionId: item.questionId,
      text: item.text || '',
      helpText: item.helpText || '',
      options: (Array.isArray(item.options) ? item.options : [])
        .filter(option => option?.optionId)
        .map(option => ({
          optionId: option.optionId,
          text: option.text || ''
        }))
    }))
}

function normalizeStringList(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function resolveScientificName(diagnosis = {}) {
  return (
    diagnosis?.scientificName ||
    diagnosis?.plantScientificName ||
    diagnosis?.plantProfile?.scientificName ||
    ''
  )
}

function resolveMainIssueText({
  finalResult = null,
  summaryCard = null,
  outcomeType = '',
  followUpRequired = false
} = {}) {
  if (finalResult?.displayName) {
    return finalResult.displayName
  }

  if (summaryCard?.title) {
    return summaryCard.title
  }

  const normalizedOutcomeType = normalizeOutcomeType(outcomeType)
  if (followUpRequired) return '待进一步确认'
  if (normalizedOutcomeType === 'non_problematic') return '暂未见明显问题'
  if (normalizedOutcomeType === 'uncertain') return '暂不能稳定判断'
  return '待进一步确认'
}

function resolveSummaryText({
  finalResult = null,
  summaryCard = null,
  explanation = {},
  outcomeType = ''
} = {}) {
  if (finalResult?.summary) {
    return finalResult.summary
  }

  if (summaryCard?.subtitle) {
    return summaryCard.subtitle
  }

  const normalizedOutcomeType = normalizeOutcomeType(outcomeType)
  if (normalizedOutcomeType === 'uncertain') {
    return (
      explanation?.whatToCheckNext ||
      explanation?.whyItHappens ||
      '当前证据还不够稳定，建议继续补充观察信息。'
    )
  }

  if (normalizedOutcomeType === 'non_problematic') {
    return (
      explanation?.reassurance ||
      explanation?.whyItHappens ||
      '当前暂未看到明确问题信号。'
    )
  }

  return explanation?.whyItHappens || ''
}

export function normalizeDiagnosisResult(diagnosisResult, { images = [], plantName = '植物' } = {}) {
  const diagnosis = diagnosisResult || {}
  const stage = diagnosis.stage || 'followup'
  const followUps = normalizeQuestions(diagnosis.questions || diagnosis.followUps)
  const finalResult = diagnosis.finalResult || null
  const explanation = diagnosis.explanation || diagnosis.resultExplanation || {}
  const followUpRequired = Boolean(diagnosis.followUpRequired) || (stage === 'followup' && followUps.length > 0)
  const observedSymptoms = normalizeObservedSymptoms(
    diagnosis.observedSymptoms || diagnosis.symptoms
  )
  const rankings = normalizeRankings(diagnosis.rankings)
  const problemCausality = normalizeProblemCausality(diagnosis.problemCausality)
  const outcomeType = normalizeOutcomeType(diagnosis.outcomeType)
  const summaryCard = diagnosis.summaryCard || null
  const observedEvidenceSet = normalizeObservedEvidenceSet(diagnosis.observedEvidenceSet)
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
    followUpRequired,
    finalResult,
    contributingFactors: Array.isArray(diagnosis.contributingFactors)
      ? diagnosis.contributingFactors
      : [],
    intermediateStates: Array.isArray(diagnosis.intermediateStates)
      ? diagnosis.intermediateStates
      : [],
    nextSteps: Array.isArray(diagnosis.nextSteps) ? diagnosis.nextSteps : [],
    whatToAvoid: Array.isArray(diagnosis.whatToAvoid) ? diagnosis.whatToAvoid : [],
    problemCausality,
    rankings,
    observedSymptoms,
    observedEvidenceSet,
    questionQueue,
    stopState,
    outputEligibility,
    diagnosticTrace,
    visualBatchTrace,
    visualAggregateSummary,
    shadowCompareSummary,
    uiHints: {
      canUploadMoreImages: Boolean(diagnosis?.uiHints?.canUploadMoreImages),
      maxQuestionsThisRound: Number(diagnosis?.uiHints?.maxQuestionsThisRound || followUps.length || 0)
    },
    confidenceLevel: diagnosis.confidenceLevel || 'normal',
    confidenceReasons: normalizeStringList(diagnosis.confidenceReasons),
    needHumanReview: Boolean(diagnosis.needHumanReview),
    treatmentText:
      explanation?.firstAid ||
      (Array.isArray(diagnosis.nextSteps)
        ? diagnosis.nextSteps.map(item => item?.text).filter(Boolean).join('\n')
        : ''),
    preventionText:
      explanation?.avoid ||
      (Array.isArray(diagnosis.whatToAvoid)
        ? diagnosis.whatToAvoid.filter(Boolean).join('\n')
        : ''),
    images
  }
}

export function createFollowUpAnswerMap(followUps = []) {
  const entries = {}
  for (const item of followUps || []) {
    if (!item?.questionId) continue
    entries[item.questionId] = ''
  }
  return entries
}

export function isFollowUpAnswerComplete(followUps = [], answerMap = {}) {
  const activeFollowUps = (followUps || []).filter(item => item?.questionId)
  if (!activeFollowUps.length) return false
  return activeFollowUps.every(item => Boolean(answerMap[item.questionId]))
}

export function buildFollowUpPayload(result, answerMap = {}) {
  const followUps = Array.isArray(result?.followUps)
    ? result.followUps
    : Array.isArray(result?.questions)
      ? result.questions
      : []

  return {
    diagnosisSessionId: result?.diagnosisSessionId || '',
    roundId: result?.roundId || '',
    answers: followUps
      .filter(item => item?.questionId && answerMap[item.questionId])
      .map(item => ({
        questionId: item.questionId,
        optionId: answerMap[item.questionId]
      }))
  }
}
