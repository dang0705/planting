'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const { buildPublicCoreProcess } = require('../../utils/public-core-process')
const { safeJsonParse, normalizeStoredNullableText } = require('../../utils/stored-value')
const {
  LIKELY_MINI_PROGRAM_OPENID_PATTERN,
  MINI_PROGRAM_CLIENT_PLATFORMS,
  SESSION_ID_COLLATION
} = require('./normalizers')
const {
  buildClientPlatformSql,
  buildReviewSourceEvidenceSql,
  buildDiagnosisReviewImageSummaryProjection,
  buildDiagnosisReviewQuestionCountDefaults
} = require('./sql-builders')
const {
  buildReviewListVisualDefault,
  buildReviewListQuestionCountDefault,
  loadDiagnosisReviewListVisualRows,
  loadDiagnosisReviewListQuestionCounts
} = require('./list-enrichment')
const {
  resolveLlmPromptAuditFromRawStructuredOutput,
  normalizeReviewPromptColumns
} = require('./prompt-audit-mappers')
const { buildSymptomClassRuntimeReviewPayload } = require('./question-summary')
const { mapDiagnosisReviewRow } = require('./row-mapper')
const { resolveDiagnosisReviewActionAdviceGovernance } = require('./action-advice-governance')
const {
  getDiagnosisBatchReviewRecord,
  listDiagnosisReviewVisualRawRecords,
  getLatestVisualAggregateSummary,
  resolveSymptomClassFromVisualCandidates
} = require('./detail-data-loaders')
const { listDiagnosisReviewQuestions, listDiagnosisReviewAnswerEvents } = require('./question-detail-loaders')
const {
  createReviewTimingLogger,
  settleOptionalReviewSection
} = require('./review-performance')

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function buildEnvironmentCareCalculationReviewPayload(environmentCareContext = null) {
  if (!isPlainObject(environmentCareContext)) {
    return null
  }

  const watering = isPlainObject(environmentCareContext.watering)
    ? environmentCareContext.watering
    : {}
  const fertilizing = isPlainObject(environmentCareContext.fertilizing)
    ? environmentCareContext.fertilizing
    : {}
  const light = isPlainObject(environmentCareContext.light)
    ? environmentCareContext.light
    : {}
  const calculationTrace = isPlainObject(environmentCareContext.calculationTrace)
    ? environmentCareContext.calculationTrace
    : {}
  const thresholds = isPlainObject(environmentCareContext.thresholds)
    ? environmentCareContext.thresholds
    : {}
  const wateringThresholds = isPlainObject(thresholds.watering)
    ? thresholds.watering
    : {}
  const historicalSummary10d = isPlainObject(environmentCareContext.historicalSummary10d)
    ? environmentCareContext.historicalSummary10d
    : {}
  const historicalThresholds = isPlainObject(historicalSummary10d.thresholds)
    ? historicalSummary10d.thresholds
    : {}

  return {
    version: String(environmentCareContext.version || '').trim() || 'v7',
    thresholds,
    thresholdFactors: {
      wetHighHumidityDaysMin: Number(wateringThresholds.wetHighHumidityDaysMin || 0),
      wetHighHumidityConsecutiveDaysMin: Number(wateringThresholds.wetHighHumidityConsecutiveDaysMin || 0),
      wetColdHumidDaysMin: Number(wateringThresholds.wetColdHumidDaysMin || 0),
      wetColdHumidConsecutiveDaysMin: Number(wateringThresholds.wetColdHumidConsecutiveDaysMin || 0),
      wetRainyDaysMin: Number(wateringThresholds.wetRainyDaysMin || 0),
      wetRainyConsecutiveDaysMin: Number(wateringThresholds.wetRainyConsecutiveDaysMin || 0),
      wetPressureDeductionPerHit: Number(wateringThresholds.wetPressureDeductionPerHit || 0),
      dryForecastHotDryDaysMin: Number(wateringThresholds.dryForecastHotDryDaysMin || 0),
      dryForecastHotDryConsecutiveDaysMin: Number(wateringThresholds.dryForecastHotDryConsecutiveDaysMin || 0),
      dryHistoricalHotDryDaysMin: Number(wateringThresholds.dryHistoricalHotDryDaysMin || 0),
      dryHistoricalHotDryConsecutiveDaysMin: Number(wateringThresholds.dryHistoricalHotDryConsecutiveDaysMin || 0),
      dryLastWateredDaysAgoMin: Number(wateringThresholds.dryLastWateredDaysAgoMin || 0)
    },
    keyMetrics: {
      highHumidityDays: Number(historicalSummary10d.highHumidityDays || 0),
      maxConsecutiveHighHumidityDays: Number(historicalSummary10d.maxConsecutiveHighHumidityDays || 0),
      humidityMaxPercent:
        historicalThresholds.humidityMaxPercent === null ||
        historicalThresholds.humidityMaxPercent === undefined
          ? null
          : Number(historicalThresholds.humidityMaxPercent)
    },
    inputs: {
      behaviorSummary10d: isPlainObject(environmentCareContext.behaviorSummary10d)
        ? environmentCareContext.behaviorSummary10d
        : null,
      historicalSummary10d: isPlainObject(historicalSummary10d)
        ? historicalSummary10d
        : null,
      forecastSummary15d: isPlainObject(environmentCareContext.forecastSummary15d)
        ? environmentCareContext.forecastSummary15d
        : null
    },
    watering: {
      baseline: isPlainObject(watering.baseline) ? watering.baseline : null,
      wateringContext: String(watering.wateringContext || '').trim(),
      action: String(watering.action || '').trim(),
      reasons: Array.isArray(watering.reasons)
        ? watering.reasons.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      formula: isPlainObject(watering.calculation)
        ? watering.calculation
        : (isPlainObject(calculationTrace.watering) ? calculationTrace.watering : null)
    },
    fertilizing: {
      baseline: isPlainObject(fertilizing.baseline) ? fertilizing.baseline : null,
      action: String(fertilizing.action || '').trim(),
      lastFertilizedBucket: String(fertilizing.lastFertilizedBucket || '').trim(),
      reasons: Array.isArray(fertilizing.reasons)
        ? fertilizing.reasons.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      formula: isPlainObject(fertilizing.calculation)
        ? fertilizing.calculation
        : (isPlainObject(calculationTrace.fertilizing) ? calculationTrace.fertilizing : null)
    },
    light: {
      lightContext: Array.isArray(light.lightContext)
        ? light.lightContext.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      realExposureScene: Boolean(light.realExposureScene),
      formula: isPlainObject(calculationTrace.light) ? calculationTrace.light : null
    },
    result: isPlainObject(environmentCareContext.outputs)
      ? environmentCareContext.outputs
      : null
  }
}

async function getDiagnosisReviewDetail({ diagnosisSessionId = '', sourceType: _sourceType = 'all' } = {}) {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return null}
  const timing = createReviewTimingLogger('diagnosis-review detail', {
    diagnosisSessionId: safeSessionId,
    sourceType: _sourceType
  })
  const degradedSections = []

  const result = await models.$runSQL(
    `
      SELECT
        sessions.diagnosis_id,
        sessions._openid,
        sessions.user_plant_id,
        sessions.plant_id,
        sessions.current_plant_identity_id,
        sessions.latest_visual_call_batch_id,
        sessions.outcome_type,
        sessions.outcome_payload_json,
        sessions.current_route_primary_action,
        sessions.current_identity_resolution_status,
        sessions.runtime_snapshot_json,
        sessions.final_problem_key,
        sessions.final_problem_cn,
        sessions.ai_summary,
        sessions.session_status,
        sessions.follow_up_round,
        sessions.current_round_index,
        (
          SELECT COUNT(*)
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ) AS feedback_count,
        (
          SELECT feedback.is_helpful
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_is_helpful,
        (
          SELECT feedback.is_accurate
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_is_accurate,
        (
          SELECT feedback.note
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_note,
        (
          SELECT feedback.created_at
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_created_at,
        sessions.created_at,
        sessions.updated_at,
        ${buildDiagnosisReviewImageSummaryProjection()},
        ${buildDiagnosisReviewQuestionCountDefaults()},
        ${buildClientPlatformSql('sessions')} AS client_platform,
        ${buildReviewSourceEvidenceSql('sessions')} AS review_source_evidence
      FROM ${table('diagnosis_sessions')} AS sessions
      WHERE sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = CONVERT({{diagnosisSessionId}} USING utf8mb4) COLLATE ${SESSION_ID_COLLATION}
      LIMIT 1
    `,
    {
      diagnosisSessionId: safeSessionId,
      likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
    }
  )
  timing.mark('base-row-loaded', {
    hasRow: Boolean(result?.data?.executeResultList?.[0])
  })

  const row = result?.data?.executeResultList?.[0]
  if (!row) {
    timing.finish({
      found: false,
      degradedSections
    })
    return null
  }

  const [
    batchRecordResult,
    visualRawRecordsResult,
    questionRecordsResult,
    answerRevisionEventsResult,
    visualAggregateSummaryResult,
    visualListEnrichmentResult,
    questionCountEnrichmentResult
  ] = await Promise.all([
    settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'batchRecord',
      loader: () => getDiagnosisBatchReviewRecord(safeSessionId),
      conservativeValue: null,
      degradedSections,
      timing,
      timeoutMs: 1200
    }),
    settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'visualRawRecords',
      loader: () => listDiagnosisReviewVisualRawRecords(safeSessionId),
      conservativeValue: [],
      degradedSections,
      timing,
      timeoutMs: 1200
    }),
    settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'questionRecords',
      loader: () => listDiagnosisReviewQuestions(safeSessionId),
      conservativeValue: [],
      degradedSections,
      timing,
      timeoutMs: 1200
    }),
    settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'answerRevisionEvents',
      loader: () => listDiagnosisReviewAnswerEvents(safeSessionId),
      conservativeValue: [],
      degradedSections,
      timing,
      timeoutMs: 1200
    }),
    settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'visualAggregateSummary',
      loader: () => getLatestVisualAggregateSummary({
        diagnosisSessionId: safeSessionId,
        visualCallBatchId: row.latest_visual_call_batch_id || ''
      }),
      conservativeValue: null,
      degradedSections,
      timing,
      timeoutMs: 1200
    }),
    settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'visualListEnrichment',
      loader: () => loadDiagnosisReviewListVisualRows([safeSessionId]),
      conservativeValue: new Map(),
      degradedSections,
      timing,
      timeoutMs: 1200
    }),
    settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'questionCountEnrichment',
      loader: () => loadDiagnosisReviewListQuestionCounts([safeSessionId]),
      conservativeValue: new Map(),
      degradedSections,
      timing,
      timeoutMs: 1200
    })
  ])
  const batchRecord = batchRecordResult.value
  const visualRawRecords = visualRawRecordsResult.value || []
  const questionRecords = questionRecordsResult.value || []
  const answerRevisionEvents = answerRevisionEventsResult.value || []
  const visualAggregateSummary = visualAggregateSummaryResult.value
  const visualListEnrichment = visualListEnrichmentResult.value || new Map()
  const questionCountEnrichment = questionCountEnrichmentResult.value || new Map()
  const enrichedRow = {
    ...row,
    ...buildReviewListVisualDefault(),
    ...buildReviewListQuestionCountDefault(),
    ...(visualListEnrichment.get(safeSessionId) || null),
    ...(questionCountEnrichment.get(safeSessionId) || null)
  }
  const primaryVisualPromptAudit =
    visualRawRecords?.[0]?.llmPromptAudit ||
    resolveLlmPromptAuditFromRawStructuredOutput(visualRawRecords?.[0]?.rawStructuredOutput)
  const visualPromptColumns = normalizeReviewPromptColumns(
    enrichedRow,
    { promptAudit: primaryVisualPromptAudit }
  )
  const runtimeSnapshot = safeJsonParse(enrichedRow.runtime_snapshot_json, {}) || {}
  const environmentCareContext = isPlainObject(runtimeSnapshot?.environmentCareContext)
    ? runtimeSnapshot.environmentCareContext
    : null
  const environmentCareCalculation = buildEnvironmentCareCalculationReviewPayload(environmentCareContext)
  let symptomClassRuntime = runtimeSnapshot?.symptomClassRuntime || null
  if (!symptomClassRuntime && visualAggregateSummary) {
    const symptomClassResult = await settleOptionalReviewSection({
      scope: 'diagnosis-review detail',
      sectionName: 'symptomClassRuntime',
      loader: () => resolveSymptomClassFromVisualCandidates(visualAggregateSummary),
      conservativeValue: null,
      degradedSections,
      timing,
      timeoutMs: 1200
    })
    symptomClassRuntime = symptomClassResult.value
  }
  const storedReviewSourceType = String(
    runtimeSnapshot?.reviewSourceType ||
      runtimeSnapshot?.clientContext?.reviewSourceType ||
      ''
  ).trim().toLowerCase()
  const clientPlatform = String(
    runtimeSnapshot?.clientContext?.platform || ''
  ).trim().toLowerCase()
  const isLikelyManualOpenId = new RegExp(LIKELY_MINI_PROGRAM_OPENID_PATTERN).test(
    String(row._openid || '').trim()
  )
  const reviewSourceType = batchRecord
    ? 'batch'
    : storedReviewSourceType === 'manual' ||
        MINI_PROGRAM_CLIENT_PLATFORMS.has(clientPlatform) ||
        isLikelyManualOpenId
      ? 'manual'
      : 'session'
  const reviewSourceEvidence = batchRecord
    ? 'batch_table'
    : storedReviewSourceType === 'manual' || MINI_PROGRAM_CLIENT_PLATFORMS.has(clientPlatform)
      ? 'platform_tagged'
      : isLikelyManualOpenId
        ? 'openid_inferred_manual'
      : 'openid_inferred_session'
  const previewImageRef = String(enrichedRow.preview_image_ref || '').trim()

  const mapped = mapDiagnosisReviewRow({
    ...enrichedRow,
    ...visualPromptColumns,
    preview_visual_raw_image_record_id: enrichedRow.preview_visual_raw_image_record_id || '',
    replay_image_ref: enrichedRow.replay_image_ref || '',
    preview_image_ref: previewImageRef,
    image_count: enrichedRow.image_count || 0,
    review_source_type: reviewSourceType,
    client_platform: clientPlatform,
    review_source_evidence: reviewSourceEvidence,
    batch_source: batchRecord?.batch_source || '',
    batch_sample_label: batchRecord?.sample_label || '',
    batch_sample_file_name: batchRecord?.sample_file_name || '',
    batch_sample_absolute_path: batchRecord?.sample_absolute_path || '',
    batch_answer_path_signature: batchRecord?.answer_path_signature || '',
    batch_generated_at: batchRecord?.batch_generated_at || ''
  })
  const actionAdviceGovernanceResult = await settleOptionalReviewSection({
    scope: 'diagnosis-review detail',
    sectionName: 'actionAdviceGovernance',
    loader: () => resolveDiagnosisReviewActionAdviceGovernance({
      row: enrichedRow,
      runtimeSnapshot,
      mapped
    }),
    conservativeValue: null,
    degradedSections,
    timing,
    timeoutMs: 1200
  })
  const actionAdviceGovernance = actionAdviceGovernanceResult.value
  const coreProcess = buildPublicCoreProcess({
    latestVisualCallBatchId:
      normalizeStoredNullableText(row.latest_visual_call_batch_id, null) ||
      runtimeSnapshot?.latestVisualCallBatchId ||
      null,
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary: visualAggregateSummary || runtimeSnapshot?.visualAggregateSummary || null,
    shadowCompareSummary:
      visualAggregateSummary?.shadow_compare_summary ||
      visualAggregateSummary?.shadowCompareSummary ||
      runtimeSnapshot?.shadowCompareSummary ||
      null,
    observedSymptoms: Array.isArray(runtimeSnapshot?.observedSymptoms)
      ? runtimeSnapshot.observedSymptoms
      : [],
    observedEvidenceSet: Array.isArray(runtimeSnapshot?.observedEvidenceSet)
      ? runtimeSnapshot.observedEvidenceSet
      : [],
    symptomClass: symptomClassRuntime || null,
    derivedEvidenceSet: Array.isArray(runtimeSnapshot?.derivedEvidenceSet)
      ? runtimeSnapshot.derivedEvidenceSet
      : [],
    diagnosisDirections: Array.isArray(runtimeSnapshot?.diagnosisDirections)
      ? runtimeSnapshot.diagnosisDirections
      : [],
    careBaselineSummary: runtimeSnapshot?.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(runtimeSnapshot?.environmentDeviationHints)
      ? runtimeSnapshot.environmentDeviationHints
      : [],
    routePrimaryAction:
      row.current_route_primary_action || runtimeSnapshot?.routePrimaryAction || '',
    routeDecision: runtimeSnapshot?.routeDecision || runtimeSnapshot?.metrics?.routeDecision || null,
    stopReason: runtimeSnapshot?.stopReason || runtimeSnapshot?.stopState?.stopReason || '',
    stopState: runtimeSnapshot?.stopState || null,
    outputEligibility: runtimeSnapshot?.outputEligibility || null,
    diagnosticTrace: Array.isArray(runtimeSnapshot?.diagnosticTrace)
      ? runtimeSnapshot.diagnosticTrace
      : []
  })

  const detail = {
    ...mapped,
    partial: degradedSections.length > 0,
    degradedSections,
    symptomClass: buildSymptomClassRuntimeReviewPayload(symptomClassRuntime),
    environmentCareContext,
    environmentCareCalculation,
    coreProcess,
    actionAdviceGovernance,
    visualRawRecords,
    questionRecords,
    answerRevisionEvents,
    questionAnswerEvents: answerRevisionEvents,
    firstRoundQuestions: questionRecords.filter(item => Number(item?.roundIndex || 1) <= 1),
    batchReviewMeta:
      batchRecord || mapped?.reviewSourceType === 'batch'
        ? {
            batchSource: String(batchRecord?.batch_source || mapped?.batchReviewMeta?.batchSource || '').trim(),
            sampleLabel: String(batchRecord?.sample_label || mapped?.batchReviewMeta?.sampleLabel || '').trim(),
            sampleFileName: String(batchRecord?.sample_file_name || mapped?.batchReviewMeta?.sampleFileName || '').trim(),
            sampleAbsolutePath: String(batchRecord?.sample_absolute_path || mapped?.batchReviewMeta?.sampleAbsolutePath || '').trim(),
            answerPathSignature: String(batchRecord?.answer_path_signature || mapped?.batchReviewMeta?.answerPathSignature || '').trim(),
            answerPathJson: safeJsonParse(batchRecord?.answer_path_json, []),
            roundsUsed: Number(batchRecord?.rounds_used || 0),
            questionCount: Number(batchRecord?.question_count || 0),
            observedEvidenceCount: Number(batchRecord?.observed_evidence_count || 0),
            diagnosisDirectionLabels: safeJsonParse(batchRecord?.diagnosis_direction_labels_json, []),
            batchGeneratedAt: String(batchRecord?.batch_generated_at || mapped?.batchReviewMeta?.batchGeneratedAt || '').trim()
      }
        : null
  }
  timing.finish({
    partial: degradedSections.length > 0,
    degradedSections
  })
  return detail
}

module.exports = {
  getDiagnosisReviewDetail
}
