function normalizeOutcomeType(outcomeType = '') {
  return String(outcomeType || '').trim().toLowerCase()
}

function isEnglishLikeSymptomLabel(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  return /[A-Za-z]/.test(normalized) && !/[\u4e00-\u9fff]/.test(normalized)
}

function resolveDisplaySymptomCn(...candidates) {
  const candidate = candidates
    .map(item => String(item || '').trim())
    .find(Boolean)

  if (!candidate || isEnglishLikeSymptomLabel(candidate)) {
    return '待确认症状'
  }

  return candidate
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
      symptomCn: resolveDisplaySymptomCn(
        item.symptomCn,
        item.symptom_cn,
        item.displayTextCn,
        item.display_text_cn,
        item.label,
        item.evidenceLabel,
        item.symptomKey
      ),
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
      symptomCn: resolveDisplaySymptomCn(
        item?.symptomCn,
        item?.symptom_cn,
        item?.displayTextCn,
        item?.display_text_cn,
        item?.label,
        item?.evidenceLabel,
        item?.symptomKey,
        item?.symptom_key,
        item?.evidenceKey,
        item?.evidence_key
      ),
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

function normalizeDerivedEvidenceSet(derivedEvidenceSet = []) {
  return (Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet : [])
    .map(item => ({
      derivedEvidenceId: String(
        item?.derivedEvidenceId || item?.derived_evidence_id || ''
      ).trim(),
      derivedEvidenceKey: String(
        item?.derivedEvidenceKey || item?.derived_evidence_key || ''
      ).trim(),
      derivedEvidenceType: String(
        item?.derivedEvidenceType || item?.derived_evidence_type || ''
      ).trim(),
      patternKey: String(item?.patternKey || item?.pattern_key || '').trim(),
      locationKey: String(item?.locationKey || item?.location_key || '').trim(),
      distributionKey: String(item?.distributionKey || item?.distribution_key || '').trim(),
      label: String(item?.label || item?.labelCn || '').trim(),
      sourceType: String(item?.sourceType || item?.source_type || '').trim(),
      evidenceState: String(item?.evidenceState || item?.evidence_state || '').trim(),
      confidence: Number(item?.confidence || 0),
      parentEvidenceKeys: normalizeStringList(
        item?.parentEvidenceKeys || item?.parent_evidence_keys
      ),
      parentSymptomKeys: normalizeStringList(
        item?.parentSymptomKeys || item?.parent_symptom_keys
      ),
      independenceGroupIds: normalizeStringList(
        item?.independenceGroupIds || item?.independence_group_ids
      ),
      enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
      enteredExplanation: Number(item?.enteredExplanation ?? item?.entered_explanation ?? 0) ? 1 : 0
    }))
    .filter(item => item.derivedEvidenceId)
}

function normalizeDiagnosisDirections(diagnosisDirections = []) {
  return (Array.isArray(diagnosisDirections) ? diagnosisDirections : [])
    .map(item => ({
      directionId: String(item?.directionId || item?.direction_id || '').trim(),
      directionKey: String(item?.directionKey || item?.direction_key || '').trim(),
      categoryKey: String(item?.categoryKey || item?.category_key || '').trim(),
      label: String(item?.label || item?.labelCn || '').trim(),
      confidence: Number(item?.confidence || 0),
      status: String(item?.status || '').trim(),
      matchedSymptomKeys: normalizeStringList(
        item?.matchedSymptomKeys || item?.matched_symptom_keys
      ),
      matchedPatternKeys: normalizeStringList(
        item?.matchedPatternKeys || item?.matched_pattern_keys
      ),
      matchedCandidateSymptomKeys: normalizeStringList(
        item?.matchedCandidateSymptomKeys || item?.matched_candidate_symptom_keys
      ),
      matchedRouteHintTypes: normalizeStringList(
        item?.matchedRouteHintTypes || item?.matched_route_hint_types
      ),
      matchedRouteHintReasons: normalizeStringList(
        item?.matchedRouteHintReasons || item?.matched_route_hint_reasons
      ),
      coveredFactDimensions: normalizeStringList(
        item?.coveredFactDimensions || item?.covered_fact_dimensions
      ),
      preferredQuestionDimensions: normalizeStringList(
        item?.preferredQuestionDimensions || item?.preferred_question_dimensions
      ),
      allowedProblemKeys: normalizeStringList(
        item?.allowedProblemKeys || item?.allowed_problem_keys || item?.candidateProblemKeys
      ),
      candidateProblemKeys: normalizeStringList(
        item?.candidateProblemKeys || item?.candidate_problem_keys
      ),
      supportSummary:
        item?.supportSummary && typeof item.supportSummary === 'object'
          ? {
              matchedSymptomCount: Number(item.supportSummary?.matchedSymptomCount || 0),
              matchedPatternCount: Number(item.supportSummary?.matchedPatternCount || 0),
              confidence: Number(item.supportSummary?.confidence || 0)
            }
          : null,
      outputGateHints:
        item?.outputGateHints && typeof item.outputGateHints === 'object'
          ? {
              allowConclusionOnlyByProblemKey:
                Number(item.outputGateHints?.allowConclusionOnlyByProblemKey || 0) ? 1 : 0,
              requiresAuditedClosure:
                Number(item.outputGateHints?.requiresAuditedClosure || 0) ? 1 : 0,
              shouldStayInternal:
                Number(item.outputGateHints?.shouldStayInternal || 0) ? 1 : 0
            }
          : null,
      round: Math.max(1, Number(item?.round || 1)),
      updatedAt: Number(item?.updatedAt || item?.updated_at || 0) || 0
    }))
    .filter(item => item.directionId)
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
      targetDimension: String(item?.targetDimension || '').trim(),
      routingScope: String(item?.routingScope || '').trim(),
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

function normalizeCoreProcess(coreProcess = null, fallback = {}) {
  const normalizedObservedSymptoms = Array.isArray(fallback?.observedSymptoms)
    ? fallback.observedSymptoms
    : []
  const normalizedObservedEvidenceSet = Array.isArray(fallback?.observedEvidenceSet)
    ? fallback.observedEvidenceSet
    : []
  const normalizedDerivedEvidenceSet = Array.isArray(fallback?.derivedEvidenceSet)
    ? fallback.derivedEvidenceSet
    : []
  const normalizedDiagnosisDirections = Array.isArray(fallback?.diagnosisDirections)
    ? fallback.diagnosisDirections
    : []
  const normalizedQuestionQueue = fallback?.questionQueue || null
  const normalizedStopState = fallback?.stopState || null
  const normalizedOutputEligibility = fallback?.outputEligibility || null
  const normalizedDiagnosticTrace = Array.isArray(fallback?.diagnosticTrace)
    ? fallback.diagnosticTrace
    : []
  const normalizedVisualBatchTrace = fallback?.visualBatchTrace || null
  const normalizedVisualAggregateSummary = fallback?.visualAggregateSummary || null
  const normalizedShadowCompareSummary = fallback?.shadowCompareSummary || null
  const normalizedCareBaselineSummary = fallback?.careBaselineSummary || null
  const normalizedEnvironmentDeviationHints = Array.isArray(fallback?.environmentDeviationHints)
    ? fallback.environmentDeviationHints
    : []
  const questionQueueForSummary =
    coreProcess?.followUp?.questionQueue && typeof coreProcess.followUp.questionQueue === 'object'
      ? normalizeQuestionQueue(coreProcess.followUp.questionQueue)
      : normalizedQuestionQueue
  const questionCountSummary =
    coreProcess?.followUp?.questionCountSummary && typeof coreProcess.followUp.questionCountSummary === 'object'
      ? {
          totalItems: Number(coreProcess.followUp.questionCountSummary?.totalItems || 0),
          activeItems: Number(coreProcess.followUp.questionCountSummary?.activeItems || 0),
          askedItems: Number(coreProcess.followUp.questionCountSummary?.askedItems || 0),
          answeredItems: Number(coreProcess.followUp.questionCountSummary?.answeredItems || 0),
          invalidatedItems: Number(coreProcess.followUp.questionCountSummary?.invalidatedItems || 0)
        }
      : {
          totalItems: Array.isArray(questionQueueForSummary?.questionItems)
            ? questionQueueForSummary.questionItems.length
            : 0,
          activeItems: Number(questionQueueForSummary?.activeItemCount || 0),
          askedItems: Number(questionQueueForSummary?.askedItemCount || 0),
          answeredItems: Number(questionQueueForSummary?.answeredItemCount || 0),
          invalidatedItems: Number(questionQueueForSummary?.invalidatedItemCount || 0)
        }

  return {
    visual: {
      latestVisualCallBatchId:
        coreProcess?.visual?.latestVisualCallBatchId ||
        fallback?.latestVisualCallBatchId ||
        null,
      visualBatchTrace:
        normalizeVisualBatchTrace(coreProcess?.visual?.visualBatchTrace) ||
        normalizedVisualBatchTrace,
      visualAggregateSummary:
        normalizeVisualAggregateSummary(coreProcess?.visual?.visualAggregateSummary) ||
        normalizedVisualAggregateSummary,
      shadowCompareSummary:
        normalizeShadowCompareSummary(coreProcess?.visual?.shadowCompareSummary) ||
        normalizedShadowCompareSummary
    },
    evidence: {
      observedSymptomCount: Number(
        coreProcess?.evidence?.observedSymptomCount ?? normalizedObservedSymptoms.length
      ),
      observedSymptoms: Array.isArray(coreProcess?.evidence?.observedSymptoms)
        ? coreProcess.evidence.observedSymptoms
        : normalizedObservedSymptoms,
      observedEvidenceCount: Number(
        coreProcess?.evidence?.observedEvidenceCount ?? normalizedObservedEvidenceSet.length
      ),
      observedEvidenceSet: Array.isArray(coreProcess?.evidence?.observedEvidenceSet)
        ? normalizeObservedEvidenceSet(coreProcess.evidence.observedEvidenceSet)
        : normalizedObservedEvidenceSet,
      derivedEvidenceCount: Number(
        coreProcess?.evidence?.derivedEvidenceCount ?? normalizedDerivedEvidenceSet.length
      ),
      derivedEvidenceSet: Array.isArray(coreProcess?.evidence?.derivedEvidenceSet)
        ? normalizeDerivedEvidenceSet(coreProcess.evidence.derivedEvidenceSet)
        : normalizedDerivedEvidenceSet,
      diagnosisDirectionCount: Number(
        coreProcess?.evidence?.diagnosisDirectionCount ?? normalizedDiagnosisDirections.length
      ),
      diagnosisDirections: Array.isArray(coreProcess?.evidence?.diagnosisDirections)
        ? normalizeDiagnosisDirections(coreProcess.evidence.diagnosisDirections)
        : normalizedDiagnosisDirections,
      careBaselineSummary:
        coreProcess?.evidence?.careBaselineSummary || normalizedCareBaselineSummary,
      environmentDeviationHints: Array.isArray(coreProcess?.evidence?.environmentDeviationHints)
        ? coreProcess.evidence.environmentDeviationHints
        : normalizedEnvironmentDeviationHints
    },
    followUp: {
      routePrimaryAction:
        String(coreProcess?.followUp?.routePrimaryAction || fallback?.routePrimaryAction || '').trim(),
      questionQueue: questionQueueForSummary,
      questionCountSummary
    },
    decision: {
      stopReason:
        String(coreProcess?.decision?.stopReason || fallback?.stopReason || '').trim(),
      stopState:
        normalizeStopState(coreProcess?.decision?.stopState) || normalizedStopState,
      outputEligibility:
        normalizeOutputEligibility(coreProcess?.decision?.outputEligibility) ||
        normalizedOutputEligibility,
      diagnosticTrace: Array.isArray(coreProcess?.decision?.diagnosticTrace)
        ? normalizeDiagnosticTrace(coreProcess.decision.diagnosticTrace)
        : normalizedDiagnosticTrace
    }
  }
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
    .slice(0, 1)
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
      text: item.text || '',
      helpText: item.helpText || '',
      defaultOptionKey: item.defaultOptionKey || '',
      defaultOptionId: item.defaultOptionId || '',
      uiVariant: item.uiVariant || '',
      renderMode: item.renderMode || '',
      options: (Array.isArray(item.options) ? item.options : [])
        .filter(option => option?.optionId)
        .map(option => ({
          optionId: option.optionId,
          optionKey: option.optionKey || '',
          text: option.text || '',
          description: option.description || option.desc || '',
          isDefault: Boolean(option.isDefault)
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

function normalizeDiagnosisAdviceSteps(diagnosis = {}, explanation = {}) {
  const directSteps = Array.isArray(diagnosis.nextSteps) ? diagnosis.nextSteps : []
  const texts = normalizeStringList([
    ...directSteps.map(item =>
      typeof item === 'string'
        ? item
        : item?.text || item?.title || item?.label || ''
    ),
    diagnosis.treatmentText,
    diagnosis.treatment,
    explanation?.firstAid
  ])

  return texts.map((text, index) => ({
    stepId: directSteps[index]?.stepId || `advice_${index + 1}`,
    text,
    type: directSteps[index]?.type || ''
  }))
}

function normalizeDiagnosisAvoidAdvice(diagnosis = {}, explanation = {}) {
  return normalizeStringList([
    ...(Array.isArray(diagnosis.whatToAvoid)
      ? diagnosis.whatToAvoid.map(item =>
          typeof item === 'string'
            ? item
            : item?.text || item?.title || item?.label || ''
        )
      : []),
    diagnosis.preventionText,
    diagnosis.prevention,
    explanation?.avoid
  ])
}

export function normalizeDiagnosisResult(diagnosisResult, { images = [], plantName = '植物' } = {}) {
  const diagnosis = diagnosisResult || {}
  const stage = diagnosis.stage || 'followup'
  const followUps = normalizeQuestions(diagnosis.questions || diagnosis.followUps)
  const finalResult = diagnosis.finalResult || null
  const explanation = diagnosis.explanation || diagnosis.resultExplanation || {}
  const normalizedNextSteps = normalizeDiagnosisAdviceSteps(diagnosis, explanation)
  const normalizedWhatToAvoid = normalizeDiagnosisAvoidAdvice(diagnosis, explanation)
  const followUpRequired = Boolean(diagnosis.followUpRequired) || (stage === 'followup' && followUps.length > 0)
  const observedSymptoms = normalizeObservedSymptoms(
    diagnosis.observedSymptoms || diagnosis.symptoms
  )
  const rankings = normalizeRankings(diagnosis.rankings)
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
    contributingFactors: Array.isArray(diagnosis.contributingFactors)
      ? diagnosis.contributingFactors
      : [],
    intermediateStates: Array.isArray(diagnosis.intermediateStates)
      ? diagnosis.intermediateStates
      : [],
    nextSteps: normalizedNextSteps,
    whatToAvoid: normalizedWhatToAvoid,
    problemCausality,
    rankings,
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
      maxQuestionsThisRound: followUps.length ? 1 : 0,
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
      explanation?.firstAid ||
      normalizedNextSteps.map(item => item?.text).filter(Boolean).join('\n'),
    preventionText:
      diagnosis.preventionText ||
      explanation?.avoid ||
      normalizedWhatToAvoid.filter(Boolean).join('\n'),
    images
  }
}

export function createFollowUpAnswerMap(followUps = []) {
  const entries = {}
  for (const item of followUps || []) {
    if (!item?.questionId) continue
    const defaultOptionId =
      item.defaultOptionId ||
      (Array.isArray(item.options)
        ? item.options.find(option =>
            (item.defaultOptionKey && option.optionKey === item.defaultOptionKey) ||
            option.isDefault
          )?.optionId
        : '')
    entries[item.questionId] = defaultOptionId || ''
  }
  return entries
}

export function isFollowUpAnswerComplete(followUps = [], answerMap = {}) {
  const activeFollowUps = (followUps || []).filter(item => item?.questionId)
  if (!activeFollowUps.length) return false
  return activeFollowUps.every(item => Boolean(answerMap[item.questionId]))
}

export function buildFollowUpPayload(result, answerMap = {}, options = {}) {
  const followUps = Array.isArray(options?.questionStack)
    ? options.questionStack
    : Array.isArray(result?.followUps)
    ? result.followUps
    : Array.isArray(result?.questions)
      ? result.questions
      : []
  const answers = followUps
    .filter(item => item?.questionId && answerMap[item.questionId])
    .map(item => ({
      questionId: item.questionId,
      optionId: answerMap[item.questionId]
    }))

  return {
    diagnosisSessionId: result?.diagnosisSessionId || '',
    roundId: result?.roundId || '',
    answers,
    requestMode: options?.requestMode || (answers.length > 1 ? 'answer_revision' : 'answer_submit'),
    baseAnswerRevision: Number(options?.baseAnswerRevision || result?.answerRevision || 0),
    dirtyFromQuestionId: String(options?.dirtyFromQuestionId || '').trim()
  }
}
