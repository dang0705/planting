function normalizeHistoryList(data) {
  if (!data || typeof data !== 'object') {
    return {
      items: [],
      page: 1,
      pageSize: 10,
      hasMore: false
    }
  }

  if (Array.isArray(data.items)) {
    return data
  }

  const list = Array.isArray(data.list) ? data.list : []
  return {
    ...data,
    items: list.map(item => ({
      historyId: item?._id || '',
      resultId: item?._id || '',
      plantId: item?.plantId || item?.userPlantId || item?.plantCatalogId || '',
      userPlantId: item?.userPlantId || null,
      plantCatalogId: item?.plantCatalogId || null,
      plantIdentityId: item?.plantIdentityId || '',
      latestVisualCallBatchId: item?.latestVisualCallBatchId || null,
      outcomeType: item?.outcomeType || '',
      nonProblematicType: item?.nonProblematicType || '',
      nonProblematicLabel: item?.nonProblematicLabel || '',
      createdAt: item?.createdAt || '',
      summary: {
        problemId: item?.topProblemKey || '',
        displayName:
          item?.mainIssue ||
          (item?.outcomeType === 'non_problematic'
            ? '暂未见明显问题'
            : item?.outcomeType === 'uncertain'
              ? '暂不能稳定判断'
              : !item?.outcomeType
                ? '待进一步确认'
                : '诊断记录'),
        severity:
          !item?.outcomeType ||
          item?.outcomeType === 'non_problematic' ||
          item?.outcomeType === 'uncertain'
            ? 'low'
            : item?.healthStatus === 'danger'
              ? 'high'
              : 'medium'
      }
    }))
  }
}

function normalizeStringList(items = []) {
  return (Array.isArray(items) ? items : []).map(item => String(item || '').trim()).filter(Boolean)
}

function normalizeObservedEvidenceSet(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
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
      supersededByBatchId: item?.supersededByBatchId || item?.superseded_by_batch_id || null,
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
    supersededByBatchId: trace?.supersededByBatchId || trace?.superseded_by_batch_id || null,
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
    compareStatus:
      String(summary?.compareStatus || summary?.compare_status || '').trim() || 'disabled',
    comparedImageCount: Number(summary?.comparedImageCount ?? summary?.compared_image_count ?? 0),
    succeededImageCount: Number(
      summary?.succeededImageCount ?? summary?.succeeded_image_count ?? 0
    ),
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
    effectiveImageCount: Number(
      summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0
    ),
    organCoverageSummary: summary?.organCoverageSummary || summary?.organ_coverage_summary || null,
    duplicateViewGroups: Array.isArray(
      summary?.duplicateViewGroups || summary?.duplicate_view_groups
    )
      ? summary.duplicateViewGroups || summary.duplicate_view_groups
      : [],
    aggregateQualityGrade: summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || '',
    aggregateAnalyzability:
      summary?.aggregateAnalyzability || summary?.aggregate_analyzability || '',
    suggestedAdditionalImageCapture: normalizeStringList(
      summary?.suggestedAdditionalImageCapture || summary?.suggested_additional_image_capture
    ),
    admissionReadyFlag: Number(summary?.admissionReadyFlag ?? summary?.admission_ready_flag ?? 0)
      ? 1
      : 0,
    routePrimaryAction: String(
      summary?.routePrimaryAction || summary?.route_primary_action || ''
    ).trim(),
    shadowCompareSummary: normalizeShadowCompareSummary(
      summary?.shadowCompareSummary || summary?.shadow_compare_summary
    )
  }
}

function normalizeDerivedEvidenceSet(derivedEvidenceSet = []) {
  return (Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet : [])
    .map(item => ({
      derivedEvidenceId: String(item?.derivedEvidenceId || item?.derived_evidence_id || '').trim(),
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
      parentSymptomKeys: normalizeStringList(item?.parentSymptomKeys || item?.parent_symptom_keys),
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
              allowConclusionOnlyByProblemKey: Number(
                item.outputGateHints?.allowConclusionOnlyByProblemKey || 0
              )
                ? 1
                : 0,
              requiresAuditedClosure: Number(item.outputGateHints?.requiresAuditedClosure || 0)
                ? 1
                : 0,
              shouldStayInternal: Number(item.outputGateHints?.shouldStayInternal || 0) ? 1 : 0
            }
          : null,
      round: Math.max(1, Number(item?.round || 1)),
      updatedAt: Number(item?.updatedAt || item?.updated_at || 0) || 0
    }))
    .filter(item => item.directionId)
}

function normalizeQuestionPackageSnapshot(questionPackageSnapshot = null) {
  if (!questionPackageSnapshot || typeof questionPackageSnapshot !== 'object') {
    return null
  }

  return {
    questionPackageSnapshotId: String(
      questionPackageSnapshot?.questionPackageSnapshotId || ''
    ).trim(),
    sessionId: String(questionPackageSnapshot?.sessionId || '').trim(),
    roundId: String(questionPackageSnapshot?.roundId || '').trim(),
    roundIndex: Number(questionPackageSnapshot?.roundIndex || 1),
    routePrimaryAction: String(questionPackageSnapshot?.routePrimaryAction || '').trim(),
    questionItems: (Array.isArray(questionPackageSnapshot?.questionItems)
      ? questionPackageSnapshot.questionItems
      : []
    ).map(item => ({
      questionKey: String(item?.questionKey || '').trim(),
      questionId: String(item?.questionId || '').trim(),
      targetSymptomKey: String(item?.targetSymptomKey || '').trim(),
      questionGroupKey: String(item?.questionGroupKey || '').trim(),
      packageTopic: String(item?.packageTopic || '').trim(),
      packageSection: String(item?.packageSection || '').trim(),
      routePackageRole: String(item?.routePackageRole || item?.routePackageRole || '').trim(),
      routePackageRole: String(item?.routePackageRole || item?.routePackageRole || '').trim(),
      packageEffect: String(item?.packageEffect || '').trim(),
      questionText: String(item?.questionText || item?.text || '').trim(),
      helpText: String(item?.helpText || '').trim(),
      currentPriority: Number(item?.currentPriority || 0),
      estimatedInformationGain: Number(item?.estimatedInformationGain || 0),
      serviceTarget: String(item?.serviceTarget || '').trim(),
      appliesWhen:
        item?.appliesWhen && typeof item.appliesWhen === 'object' ? item.appliesWhen : null,
      asked: Number(item?.asked || 0) ? 1 : 0,
      answered: Number(item?.answered || 0) ? 1 : 0,
      invalidated: Number(item?.invalidated || 0) ? 1 : 0,
      invalidReason: String(item?.invalidReason || '').trim(),
      status: String(item?.status || '').trim() || 'pending'
    })),
    activeItemCount: Number(questionPackageSnapshot?.activeItemCount || 0),
    askedItemCount: Number(questionPackageSnapshot?.askedItemCount || 0),
    answeredItemCount: Number(questionPackageSnapshot?.answeredItemCount || 0),
    invalidatedItemCount: Number(questionPackageSnapshot?.invalidatedItemCount || 0)
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
  const normalizedQuestionPackageSnapshot = fallback?.questionPackageSnapshot || null
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
  const questionCore = coreProcess?.questions || coreProcess?.questionPackage || {}
  const questionPackageSnapshotForSummary =
    questionCore?.questionPackageSnapshot &&
    typeof questionCore.questionPackageSnapshot === 'object'
      ? normalizeQuestionPackageSnapshot(questionCore.questionPackageSnapshot)
      : normalizedQuestionPackageSnapshot

  const questionCountSummary =
    questionCore?.questionCountSummary && typeof questionCore.questionCountSummary === 'object'
      ? {
          totalItems: Number(questionCore.questionCountSummary?.totalItems || 0),
          activeItems: Number(questionCore.questionCountSummary?.activeItems || 0),
          askedItems: Number(questionCore.questionCountSummary?.askedItems || 0),
          answeredItems: Number(questionCore.questionCountSummary?.answeredItems || 0),
          invalidatedItems: Number(questionCore.questionCountSummary?.invalidatedItems || 0)
        }
      : {
          totalItems: Array.isArray(questionPackageSnapshotForSummary?.questionItems)
            ? questionPackageSnapshotForSummary.questionItems.length
            : 0,
          activeItems: Number(questionPackageSnapshotForSummary?.activeItemCount || 0),
          askedItems: Number(questionPackageSnapshotForSummary?.askedItemCount || 0),
          answeredItems: Number(questionPackageSnapshotForSummary?.answeredItemCount || 0),
          invalidatedItems: Number(questionPackageSnapshotForSummary?.invalidatedItemCount || 0)
        }

  return {
    visual: {
      latestVisualCallBatchId:
        coreProcess?.visual?.latestVisualCallBatchId || fallback?.latestVisualCallBatchId || null,
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
    questions: {
      routePrimaryAction: String(
        questionCore?.routePrimaryAction || fallback?.routePrimaryAction || ''
      ).trim(),
      questionPackageSnapshot: questionPackageSnapshotForSummary,
      questionCountSummary
    },
    decision: {
      stopReason: String(coreProcess?.decision?.stopReason || fallback?.stopReason || '').trim(),
      stopState: normalizeStopState(coreProcess?.decision?.stopState) || normalizedStopState,
      outputEligibility:
        normalizeOutputEligibility(coreProcess?.decision?.outputEligibility) ||
        normalizedOutputEligibility,
      diagnosticTrace: Array.isArray(coreProcess?.decision?.diagnosticTrace)
        ? normalizeDiagnosticTrace(coreProcess.decision.diagnosticTrace)
        : normalizedDiagnosticTrace
    }
  }
}

export {
  normalizeHistoryList,
  normalizeStringList,
  normalizeObservedEvidenceSet,
  normalizeVisualBatchTrace,
  normalizeShadowCompareSummary,
  normalizeVisualAggregateSummary,
  normalizeDerivedEvidenceSet,
  normalizeDiagnosisDirections,
  normalizeQuestionPackageSnapshot,
  normalizeStopState,
  normalizeOutputEligibility,
  normalizeDiagnosticTrace,
  normalizeCoreProcess
}
