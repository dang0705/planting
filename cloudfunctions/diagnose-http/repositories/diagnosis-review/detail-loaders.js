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
const { listDiagnosisReviewFollowUps, listDiagnosisReviewAnswerEvents } = require('./follow-up-detail-loaders')

async function getDiagnosisReviewDetail({ diagnosisSessionId = '', sourceType: _sourceType = 'all' } = {}) {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return null}

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

  const row = result?.data?.executeResultList?.[0]
  if (!row) {return null}

  const [
    batchRecord,
    visualRawRecords,
    followUpRecords,
    answerRevisionEvents,
    visualAggregateSummary,
    visualListEnrichment,
    questionCountEnrichment
  ] = await Promise.all([
    getDiagnosisBatchReviewRecord(safeSessionId),
    listDiagnosisReviewVisualRawRecords(safeSessionId),
    listDiagnosisReviewFollowUps(safeSessionId),
    listDiagnosisReviewAnswerEvents(safeSessionId),
    getLatestVisualAggregateSummary({
      diagnosisSessionId: safeSessionId,
      visualCallBatchId: row.latest_visual_call_batch_id || ''
    }),
    loadDiagnosisReviewListVisualRows([safeSessionId]),
    loadDiagnosisReviewListQuestionCounts([safeSessionId])
  ])
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
  const symptomClassRuntime =
    runtimeSnapshot?.symptomClassRuntime ||
    await resolveSymptomClassFromVisualCandidates(visualAggregateSummary)
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
      : 'legacy'
  const reviewSourceEvidence = batchRecord
    ? 'batch_table'
    : storedReviewSourceType === 'manual' || MINI_PROGRAM_CLIENT_PLATFORMS.has(clientPlatform)
      ? 'platform_tagged'
      : isLikelyManualOpenId
        ? 'openid_inferred_manual'
      : 'openid_inferred_legacy'
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
  const actionAdviceGovernance = await resolveDiagnosisReviewActionAdviceGovernance({
    row: enrichedRow,
    runtimeSnapshot,
    mapped
  })
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
    questionQueue: runtimeSnapshot?.questionQueue || null,
    stopReason: runtimeSnapshot?.stopReason || runtimeSnapshot?.stopState?.stopReason || '',
    stopState: runtimeSnapshot?.stopState || null,
    outputEligibility: runtimeSnapshot?.outputEligibility || null,
    diagnosticTrace: Array.isArray(runtimeSnapshot?.diagnosticTrace)
      ? runtimeSnapshot.diagnosticTrace
      : []
  })

  return {
    ...mapped,
    symptomClass: buildSymptomClassRuntimeReviewPayload(symptomClassRuntime),
    coreProcess,
    actionAdviceGovernance,
    visualRawRecords,
    followUpRecords,
    answerRevisionEvents,
    followUpAnswerEvents: answerRevisionEvents,
    firstRoundQuestions: followUpRecords.filter(item => Number(item?.roundIndex || 1) <= 1),
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
}

module.exports = {
  getDiagnosisReviewDetail
}
