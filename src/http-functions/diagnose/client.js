import { httpRequest } from '@/http-functions/core/httpRequest'
import { isDevelopmentAppEnv } from '@/utils/runtime-env'

const DEV_H5_DIAGNOSIS_OPENID = 'dev_terminal_diagnosis_h5'

function isH5Runtime() {
  return typeof window !== 'undefined' && (typeof wx === 'undefined' || typeof wx?.cloud === 'undefined')
}

function shouldUseDevBypass() {
  return isH5Runtime() && (Boolean(import.meta.env.DEV) || isDevelopmentAppEnv())
}

function buildDevBypassPayload(payload = {}) {
  if (!shouldUseDevBypass()) {
    return payload
  }

  return {
    ...payload,
    skipAuth: true,
    openid: payload?.openid || DEV_H5_DIAGNOSIS_OPENID
  }
}

function isRetryableRequestError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network error') ||
    message.includes('request:fail') ||
    message.includes('fail timeout')
  )
}

function normalizeRequestError(error, fallbackMessage) {
  const message = String(error?.message || error || '')
  if (/timeout|timed out|fail timeout/i.test(message)) {
    return new Error(`${fallbackMessage}，请求超时，请重试`)
  }
  return error instanceof Error ? error : new Error(fallbackMessage)
}

async function requestWithRetry(task, { retries = 1, fallbackMessage = '请求失败' } = {}) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (attempt >= retries || !isRetryableRequestError(error)) {
        break
      }
    }
  }

  throw normalizeRequestError(lastError, fallbackMessage)
}

function decodeChunkToText(chunk) {
  if (!chunk) {return ''}
  if (typeof chunk === 'string') {return chunk}

  const arrayBuffer =
    chunk instanceof ArrayBuffer
      ? chunk
      : chunk?.buffer instanceof ArrayBuffer
        ? chunk.buffer
        : null

  if (!arrayBuffer) {
    return ''
  }

  const uint8 = new Uint8Array(arrayBuffer)
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8').decode(uint8)
    } catch (error) {
      console.warn('流式响应 TextDecoder 解码失败，回退到字符拼接:', error)
    }
  }

  let text = ''
  for (let index = 0; index < uint8.length; index += 1) {
    text += String.fromCharCode(uint8[index])
  }

  try {
    return decodeURIComponent(escape(text))
  } catch {
    return text
  }
}

function createSseParser(onEvent) {
  let buffer = ''

  function emitBlock(rawBlock) {
    const block = String(rawBlock || '').trim()
    if (!block) {return}

    let eventName = 'message'
    const dataLines = []

    block.split('\n').forEach(line => {
      const normalizedLine = String(line || '').trimEnd()
      if (!normalizedLine || normalizedLine.startsWith(':')) {
        return
      }

      if (normalizedLine.startsWith('event:')) {
        eventName = normalizedLine.slice(6).trim() || eventName
        return
      }

      if (normalizedLine.startsWith('data:')) {
        dataLines.push(normalizedLine.slice(5).trimStart())
      }
    })

    if (!dataLines.length) {return}

    const dataText = dataLines.join('\n')
    let payload = { raw: dataText }

    try {
      payload = JSON.parse(dataText)
    } catch {
      payload = { raw: dataText }
    }

    onEvent?.(eventName, payload)
  }

  return {
    push(chunkText) {
      buffer += String(chunkText || '').replace(/\r\n/g, '\n')

      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex >= 0) {
        const rawBlock = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)
        emitBlock(rawBlock)
        separatorIndex = buffer.indexOf('\n\n')
      }
    },
    flush() {
      if (!buffer.trim()) {return}
      emitBlock(buffer)
      buffer = ''
    }
  }
}

function unwrapResponseEnvelope(raw, fallbackMessage = '请求失败') {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应为空')
  }

  const code = Number(raw.code ?? 200)
  if (code !== 200) {
    throw new Error(raw.message || fallbackMessage)
  }

  return raw.data ?? null
}

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
          !item?.outcomeType || item?.outcomeType === 'non_problematic' || item?.outcomeType === 'uncertain'
            ? 'low'
            : item?.healthStatus === 'danger'
              ? 'high'
              : 'medium'
      }
    }))
  }
}

function normalizeStringList(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
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
      questionRole: String(item?.questionRole || item?.questionCategory || '').trim(),
      questionCategory: String(item?.questionCategory || item?.questionRole || '').trim(),
      effectMode: String(item?.effectMode || '').trim(),
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

function normalizeHistoryAdviceSteps(detail = {}, explanation = {}) {
  const directSteps = Array.isArray(detail.nextSteps) ? detail.nextSteps : []
  const texts = normalizeStringList([
    ...directSteps.map(item =>
      typeof item === 'string'
        ? item
        : item?.text || item?.title || item?.label || ''
    ),
    detail.treatmentText,
    detail.treatment,
    explanation?.firstAid
  ])

  return texts.map((text, index) => ({
    stepId: directSteps[index]?.stepId || `advice_${index + 1}`,
    text,
    type: directSteps[index]?.type || ''
  }))
}

function normalizeHistoryAvoidAdvice(detail = {}, explanation = {}) {
  return normalizeStringList([
    ...(Array.isArray(detail.whatToAvoid)
      ? detail.whatToAvoid.map(item =>
          typeof item === 'string'
            ? item
            : item?.text || item?.title || item?.label || ''
        )
      : []),
    detail.preventionText,
    detail.prevention,
    explanation?.avoid
  ])
}

function normalizeHistoryDetail(detail) {
  if (!detail || typeof detail !== 'object') {
    return null
  }

  if (detail?.diagnosisSessionId && detail?.finalResult) {
    const followUps = Array.isArray(detail.followUps) ? detail.followUps : []
    const hasPendingFollowUps =
      String(detail.stage || '').toLowerCase() === 'followup' ||
      followUps.some(item => String(item?.status || '').toLowerCase() === 'pending')
    const observedEvidenceSet = normalizeObservedEvidenceSet(detail.observedEvidenceSet)
    const derivedEvidenceSet = normalizeDerivedEvidenceSet(detail.derivedEvidenceSet)
    const diagnosisDirections = normalizeDiagnosisDirections(detail.diagnosisDirections)
    const questionQueue = normalizeQuestionQueue(detail.questionQueue)
    const stopState = normalizeStopState(detail.stopState)
    const outputEligibility = normalizeOutputEligibility(detail.outputEligibility)
    const diagnosticTrace = normalizeDiagnosticTrace(detail.diagnosticTrace)
    const visualBatchTrace = normalizeVisualBatchTrace(detail.visualBatchTrace)
    const visualAggregateSummary = normalizeVisualAggregateSummary(detail.visualAggregateSummary)
    const explanation = detail.explanation || detail.resultExplanation || {}
    const nextSteps = normalizeHistoryAdviceSteps(detail, explanation)
    const whatToAvoid = normalizeHistoryAvoidAdvice(detail, explanation)
    const shadowCompareSummary =
      normalizeShadowCompareSummary(detail.shadowCompareSummary) ||
      normalizeVisualAggregateSummary(detail.visualAggregateSummary)?.shadowCompareSummary ||
      null
    const coreProcess = normalizeCoreProcess(detail.coreProcess, {
      latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
      observedSymptoms: Array.isArray(detail.observedSymptoms) ? detail.observedSymptoms : [],
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary: detail.careBaselineSummary || null,
      environmentDeviationHints: Array.isArray(detail.environmentDeviationHints)
        ? detail.environmentDeviationHints
        : [],
      routePrimaryAction: detail.routePrimaryAction || '',
      questionQueue,
      stopReason: detail.stopReason || '',
      stopState,
      outputEligibility,
      diagnosticTrace,
      visualBatchTrace,
      visualAggregateSummary,
      shadowCompareSummary
    })

    return {
      ...detail,
      resultId: detail.resultId || detail.diagnosisSessionId || '',
      diagnosisSessionId: detail.diagnosisSessionId || '',
      plantId: detail.plantId || detail.userPlantId || detail.plantCatalogId || '',
      userPlantId: detail.userPlantId || null,
      plantCatalogId: detail.plantCatalogId || null,
      plantIdentityId: detail.plantIdentityId || '',
      latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
      stage: detail.stage || (hasPendingFollowUps ? 'followup' : 'final'),
      status: detail.status || (hasPendingFollowUps ? 'active' : 'closed'),
      outcomeType: detail.outcomeType || '',
      nonProblematicType: detail.nonProblematicType || '',
      nonProblematicLabel: detail.nonProblematicLabel || '',
      routePrimaryAction: detail.routePrimaryAction || '',
      identityResolutionStatus: detail.identityResolutionStatus || '',
      explanation,
      observedSymptoms: Array.isArray(detail.observedSymptoms) ? detail.observedSymptoms : [],
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary: detail.careBaselineSummary || null,
      environmentDeviationHints: Array.isArray(detail.environmentDeviationHints)
        ? detail.environmentDeviationHints
        : [],
      rankings: Array.isArray(detail.rankings) ? detail.rankings : [],
      followUps,
      contributingFactors: Array.isArray(detail.contributingFactors) ? detail.contributingFactors : [],
      intermediateStates: Array.isArray(detail.intermediateStates) ? detail.intermediateStates : [],
      nextSteps,
      whatToAvoid,
      treatmentText:
        detail.treatmentText ||
        detail.treatment ||
        explanation?.firstAid ||
        nextSteps.map(item => item?.text).filter(Boolean).join('\n'),
      preventionText:
        detail.preventionText ||
        detail.prevention ||
        explanation?.avoid ||
        whatToAvoid.join('\n'),
      questionQueue,
      stopState,
      outputEligibility,
      diagnosticTrace,
      coreProcess,
      visualBatchTrace,
      visualAggregateSummary,
      shadowCompareSummary,
      confidenceLevel: detail.confidenceLevel || 'normal',
      needHumanReview: Boolean(detail.needHumanReview),
      timeline: detail.timeline || { createdAt: '' },
      versionMetadata: detail.versionMetadata || {}
    }
  }

  const diagnosisSessionId = detail._id || detail.diagnosisSessionId || ''
  const summary = String(detail.summary || '').trim()

  return {
    resultId: diagnosisSessionId,
    diagnosisSessionId,
    plantId: detail.plantId || detail.userPlantId || detail.plantCatalogId || '',
    userPlantId: detail.userPlantId || null,
    plantCatalogId: detail.plantCatalogId || null,
    plantIdentityId: detail.plantIdentityId || '',
    latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
    stage: detail.needsFollowUp ? 'followup' : 'final',
    status: detail.needsFollowUp ? 'active' : 'closed',
    finalResult: {
      problemId: detail.topProblemKey || '',
      displayName: detail.finalProblemCn || detail.topProblemKey || '待进一步确认',
      summary,
      severity: detail.healthStatus === 'danger' ? 'high' : 'medium',
      urgency: 'medium'
    },
    explanation: {
      whyItHappens: summary,
      whatToCheckNext: '',
      firstAid: detail.treatment || '',
      avoid: detail.prevention || ''
    },
    observedSymptoms: Array.isArray(detail.symptoms)
      ? detail.symptoms.map(item => ({
          symptomKey: item?.symptomKey || '',
          symptomCn: item?.symptomCn || item?.symptomKey || '',
          confidence: Number(item?.confidence || 0),
          source: item?.evidenceSource || 'history'
        }))
      : [],
    observedEvidenceSet: [],
    derivedEvidenceSet: [],
    diagnosisDirections: [],
    careBaselineSummary: null,
    environmentDeviationHints: [],
    rankings: Array.isArray(detail.rankings)
      ? detail.rankings.map(item => ({
          problemKey: item?.problemKey || '',
          problemCn: item?.problemCn || item?.problemKey || '',
          weightedScore: Number(item?.weightedScore || 0),
          finalScore: Number(item?.weightedScore || 0),
          rankNo: Number(item?.rankNo || 0)
        }))
      : [],
    followUps: Array.isArray(detail.followUps)
      ? detail.followUps.map(item => ({
          questionId: item?.symptomKey || '',
          text: item?.questionText || '',
          helpText: item?.rationale || '',
          status: item?.status || 'pending',
          answerValue: item?.answerValue || ''
        }))
      : [],
    contributingFactors: [],
    intermediateStates: [],
    nextSteps: detail.treatment
      ? [{ stepId: 'step_1', text: detail.treatment }]
      : [],
    whatToAvoid: detail.prevention ? [detail.prevention] : [],
    treatmentText: detail.treatment || '',
    preventionText: detail.prevention || '',
    questionQueue: null,
    stopState: null,
    outputEligibility: null,
    diagnosticTrace: [],
    coreProcess: normalizeCoreProcess(null, {
      latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
      observedSymptoms: Array.isArray(detail.symptoms)
        ? detail.symptoms.map(item => ({
            symptomKey: item?.symptomKey || '',
            symptomCn: item?.symptomCn || item?.symptomKey || '',
            confidence: Number(item?.confidence || 0),
            source: item?.evidenceSource || 'history'
          }))
        : [],
      observedEvidenceSet: [],
      derivedEvidenceSet: [],
      diagnosisDirections: [],
      careBaselineSummary: null,
      environmentDeviationHints: [],
      routePrimaryAction: '',
      questionQueue: null,
      stopReason: '',
      stopState: null,
      outputEligibility: null,
      diagnosticTrace: [],
      visualBatchTrace: null,
      visualAggregateSummary: null,
      shadowCompareSummary: null
    }),
    visualBatchTrace: null,
    visualAggregateSummary: null,
    shadowCompareSummary: null,
    timeline: {
      createdAt: detail.createdAt || ''
    }
  }
}

const startDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/start',
  method: 'POST'
})

const streamDiagnoseRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/start',
  method: 'POST',
  enableChunked: true,
  responseType: 'text',
  headers: {
    Accept: 'text/event-stream'
  }
})

const answerDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/answer',
  method: 'POST'
})

const resultDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/result',
  method: 'GET'
})

const historyDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/history',
  method: 'GET'
})

const feedbackDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/feedback',
  method: 'POST'
})

export async function requestDiagnosisStart(payload) {
  const response = await requestWithRetry(
    () => startDiagnosisRequester({ payload, timeout: 65000 }),
    { retries: 1, fallbackMessage: '发起诊断失败' }
  )
  return unwrapResponseEnvelope(response?.data, '发起诊断失败')
}

export async function requestDiagnosisAnswer(payload) {
  const response = await requestWithRetry(
    () => answerDiagnosisRequester({ payload, timeout: 25000 }),
    { retries: 1, fallbackMessage: '提交问诊失败' }
  )
  return unwrapResponseEnvelope(response?.data, '提交问诊失败')
}

export async function requestDiagnosisResult(query) {
  const requestQuery = {
    id: query?.id || query?.sessionId || query?.resultId || ''
  }
  if (query?.skipAuth !== undefined) {
    requestQuery.skipAuth = query.skipAuth
  }
  if (query?.openid) {
    requestQuery.openid = query.openid
  }

  const response = await resultDiagnosisRequester({
    query: requestQuery
  })
  const data = unwrapResponseEnvelope(response?.data, '读取诊断结果失败')
  return normalizeHistoryDetail(data)
}

export async function requestDiagnosisHistory(query = {}) {
  const response = await historyDiagnosisRequester({ query })
  const data = unwrapResponseEnvelope(response?.data, '读取诊断历史失败')
  return normalizeHistoryList(data)
}

export async function requestDiagnosisFeedback(payload) {
  const response = await feedbackDiagnosisRequester({ payload: buildDevBypassPayload(payload) })
  return unwrapResponseEnvelope(response?.data, '提交反馈失败')
}

// 兼容旧调用名：同步诊断即发起首轮诊断。
export async function requestDiagnoseSync(payload) {
  return requestDiagnosisStart(payload)
}

function normalizeVisualDecisionEvent(payloadItem = {}) {
  const decision = payloadItem?.decision || {}
  const counts = decision?.counts || {}
  const symptomCandidates = Array.isArray(decision?.symptomCandidates)
    ? decision.symptomCandidates
    : Array.isArray(decision?.aggregatedSymptomCandidates)
      ? decision.aggregatedSymptomCandidates
      : Array.isArray(decision?.aggregated_symptom_candidates)
        ? decision.aggregated_symptom_candidates
        : Array.isArray(payloadItem?.aggregated_symptom_candidates)
          ? payloadItem.aggregated_symptom_candidates
          : Array.isArray(payloadItem?.symptom_candidates)
            ? payloadItem.symptom_candidates
            : []
  const outOfPoolSymptomCandidates = Array.isArray(decision?.outOfPoolSymptomCandidates)
    ? decision.outOfPoolSymptomCandidates
    : Array.isArray(decision?.out_of_pool_symptom_candidates)
      ? decision.out_of_pool_symptom_candidates
      : Array.isArray(decision?.outOfPoolSymptomHints)
        ? decision.outOfPoolSymptomHints
        : Array.isArray(decision?.out_of_pool_symptom_hints)
          ? decision.out_of_pool_symptom_hints
          : Array.isArray(payloadItem?.out_of_pool_symptom_hints)
            ? payloadItem.out_of_pool_symptom_hints
            : Array.isArray(payloadItem?.out_of_pool_symptom_candidates)
              ? payloadItem.out_of_pool_symptom_candidates
              : []
  const observedSymptoms = Array.isArray(decision?.observedSymptoms)
    ? decision.observedSymptoms
    : Array.isArray(decision?.observed_symptoms)
      ? decision.observed_symptoms
      : Array.isArray(payloadItem?.observed_symptoms)
        ? payloadItem.observed_symptoms
        : []
  const routeHints = Array.isArray(decision?.routeHints)
    ? decision.routeHints
    : Array.isArray(decision?.aggregateRouteHints)
      ? decision.aggregateRouteHints
      : Array.isArray(decision?.aggregate_route_hints)
        ? decision.aggregate_route_hints
        : []
  const primaryCandidate =
    symptomCandidates[0] || observedSymptoms[0] || outOfPoolSymptomCandidates[0] || null

  return {
    contractVersion: String(decision?.contractVersion || '').trim(),
    counts: {
      observedSymptoms: Number(counts.observedSymptoms || observedSymptoms.length || 0),
      symptomCandidates: Number(counts.symptomCandidates || symptomCandidates.length || 0),
      outOfPoolSymptomCandidates: Number(
        counts.outOfPoolSymptomCandidates || outOfPoolSymptomCandidates.length || 0
      ),
      routeHints: Number(counts.routeHints || routeHints.length || 0)
    },
    primaryLabel: String(
      primaryCandidate?.symptomCn ||
        primaryCandidate?.symptom_cn ||
        primaryCandidate?.rawVisualNameCn ||
        primaryCandidate?.raw_visual_name_cn ||
        primaryCandidate?.symptomKey ||
        primaryCandidate?.symptom_key ||
        primaryCandidate?.rawVisualNameEn ||
        primaryCandidate?.raw_visual_name_en ||
        ''
    ).trim()
  }
}

function buildVisualProgressText(eventName, payloadItem = {}) {
  const normalizedEventName = String(eventName || payloadItem?.phase || payloadItem?.type || '').trim()
  const explicitContent = String(payloadItem?.content || '').trim()
  if (explicitContent) {return explicitContent}

  if (normalizedEventName === 'visual_session_created') {
    return '已建立诊断会话，准备分析图片。'
  }
  if (normalizedEventName === 'visual_input_ready') {
    const imageCount = Number(payloadItem?.imageCount || 0)
    return imageCount > 1
      ? `已接收 ${imageCount} 张图片，开始逐张视觉分析。`
      : '已接收图片，开始视觉分析。'
  }
  if (normalizedEventName === 'visual_model_started') {
    return '视觉模型正在读取图片证据。'
  }
  if (normalizedEventName === 'visual_model_complete') {
    return '视觉模型已完成图片读取，正在结构化裁决证据。'
  }
  if (normalizedEventName === 'visual_decision_ready') {
    const decision = normalizeVisualDecisionEvent(payloadItem)
    const inPoolCount = Math.max(
      decision.counts.symptomCandidates,
      decision.counts.observedSymptoms
    )
    const outOfPoolCount = decision.counts.outOfPoolSymptomCandidates
    const suffix = decision.primaryLabel ? `，主要证据：${decision.primaryLabel}` : ''
    if (inPoolCount > 0 && outOfPoolCount > 0) {
      return `视觉裁决完成：发现 ${inPoolCount} 个池内候选，并记录 ${outOfPoolCount} 个池外可见异常${suffix}。`
    }
    if (inPoolCount > 0) {
      return `视觉裁决完成：发现 ${inPoolCount} 个池内候选证据${suffix}。`
    }
    if (outOfPoolCount > 0) {
      return `视觉裁决完成：记录 ${outOfPoolCount} 个池外可见异常${suffix}。`
    }
    return '视觉裁决完成：未形成稳定的池内候选证据。'
  }
  if (normalizedEventName === 'visual_persisted') {
    return '视觉裁决已记录，正在进入问诊决策。'
  }
  if (normalizedEventName === 'visual_extraction_complete') {
    return '视觉证据裁决完成，正在生成下一步问诊或结果。'
  }
  return ''
}

function buildStreamDiagnosisPromise(payload, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let latestFullText = ''
    let latestProgressText = ''

    const pushProgress = text => {
      const normalizedText = String(text || '').trim()
      if (!normalizedText || normalizedText === latestProgressText) {return}
      latestProgressText = normalizedText
      latestFullText = normalizedText
      onProgress?.(normalizedText)
    }

    const settleResolve = data => {
      if (settled) {return}
      settled = true
      resolve(data)
    }

    const settleReject = error => {
      if (settled) {return}
      settled = true
      reject(error)
    }

    const parser = createSseParser((eventName, payloadItem) => {
      const normalizedEventName = String(
        payloadItem?.event || eventName || payloadItem?.type || 'message'
      ).trim()

      if (normalizedEventName === 'visual_progress') {
        pushProgress(buildVisualProgressText(normalizedEventName, payloadItem))
        return
      }
      if (normalizedEventName.startsWith('visual_')) {
        const explicitContent = String(payloadItem?.content || '').trim()
        if (explicitContent) {
          pushProgress(explicitContent)
        }
        return
      }

      if (normalizedEventName === 'reply') {
        const fullText = String(payloadItem?.fullText || '').trim()
        const content = String(payloadItem?.content || '').trim()
        if (fullText) {
          latestFullText = fullText
          onProgress?.(fullText)
          return
        }
        if (content) {
          latestFullText += content
          onProgress?.(latestFullText)
        }
        return
      }

      if (normalizedEventName === 'error') {
        settleReject(new Error(payloadItem?.message || '流式诊断失败'))
        return
      }

      if (normalizedEventName === 'done') {
        const data = payloadItem?.data
        if (data && typeof data === 'object') {
          settleResolve(data)
          return
        }
        settleReject(new Error('流式诊断未返回有效结果'))
      }
    })

    streamDiagnoseRequester({
      payload,
      timeout: 65000,
      onChunkReceived: chunk => {
        const chunkText = decodeChunkToText(chunk?.data ?? chunk)
        if (!chunkText) {return}
        parser.push(chunkText)
      }
    })
      .then(response => {
        const responseText = typeof response?.data === 'string' ? response.data.trim() : ''
        if (responseText) {
          parser.push(responseText)
        }
        parser.flush()
        if (settled) {return}

        const envelope =
          response?.data && typeof response.data === 'object'
            ? response.data
            : responseText
              ? (() => {
                  try {
                    return JSON.parse(responseText)
                  } catch {
                    return null
                  }
                })()
              : null

        if (envelope?.data && typeof envelope.data === 'object') {
          settleResolve(envelope.data)
          return
        }

        if (latestFullText) {
          settleReject(new Error('流式诊断已结束，但未返回结构化结果'))
          return
        }

        settleReject(new Error('流式诊断响应为空'))
      })
      .catch(error => {
        settleReject(error)
      })
  })
}

// 兼容旧调用名：保留真实 SSE 调用入口，供灰度或脚本验证使用。
export async function requestDiagnoseStream(payload, { onProgress } = {}) {
  onProgress?.('正在分析图片并生成问诊...')
  const streamPayload = {
    ...payload,
    streamVisualDecision: true
  }

  try {
    return await requestWithRetry(
      () => buildStreamDiagnosisPromise(streamPayload, { onProgress }),
      { retries: 0, fallbackMessage: '发起流式诊断失败' }
    )
  } catch (error) {
    const message = String(error?.message || error || '')
    if (
      /流式诊断响应为空|流式诊断未返回有效结果|流式诊断已结束，但未返回结构化结果|当前请求不支持 SSE/i.test(
        message
      )
    ) {
      onProgress?.('流式视觉裁决通道不可用，已切换普通诊断。')
      return requestDiagnosisStart(payload)
    }
    throw error
  }
}

// 兼容旧调用名：follow-up 即提交问诊答案。
export async function requestDiagnoseFollowUp(payload) {
  return requestDiagnosisAnswer(payload)
}
