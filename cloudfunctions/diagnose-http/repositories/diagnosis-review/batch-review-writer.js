'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const {
  toSqlText,
  toSqlNumber,
  toSqlDateTime
} = require('./sql-builders')

async function upsertDiagnosisBatchReviews({ records = [], batchSource = 'plant-sample-combination-audit' } = {}) {
  const safeRecords = (Array.isArray(records) ? records : [])
    .map(item => ({
      diagnosisSessionId: String(item?.diagnosisSessionId || item?.diagnosis_id || '').trim(),
      sourceSchema: String(item?.sourceSchema || item?.source_schema || '').trim(),
      batchGeneratedAt: item?.batchGeneratedAt || item?.batch_generated_at || null,
      sampleLabel: String(item?.sampleLabel || item?.label || item?.sample_label || '').trim(),
      sampleFileName: String(item?.sampleFileName || item?.fileName || item?.sample_file_name || '').trim(),
      sampleAbsolutePath: String(item?.sampleAbsolutePath || item?.absolutePath || item?.sample_absolute_path || '').trim(),
      answerPathSignature: String(item?.answerPathSignature || item?.answer_path_signature || '').trim(),
      answerPathJson: JSON.stringify(Array.isArray(item?.answerPath) ? item.answerPath : []),
      roundsUsed: Number(item?.roundsUsed || item?.rounds_used || 0),
      questionCount: Number(item?.questionCount || item?.question_count || 0),
      observedEvidenceCount: Number(item?.observedEvidenceCount || item?.observed_evidence_count || 0),
      diagnosisDirectionLabelsJson: JSON.stringify(
        Array.isArray(item?.diagnosisDirectionLabels || item?.diagnosis_direction_labels)
          ? item?.diagnosisDirectionLabels || item?.diagnosis_direction_labels
          : []
      )
    }))
    .filter(item => item.diagnosisSessionId)

  if (!safeRecords.length) {
    return {
      upsertedCount: 0
    }
  }

  const valuesClause = safeRecords
    .map(item => {
      return `(
        ${toSqlText(item.diagnosisSessionId)},
        ${toSqlText(batchSource)},
        ${toSqlText(item.sourceSchema)},
        ${toSqlDateTime(item.batchGeneratedAt)},
        ${toSqlText(item.sampleLabel)},
        ${toSqlText(item.sampleFileName)},
        ${toSqlText(item.sampleAbsolutePath, { nullable: true })},
        ${toSqlText(item.answerPathSignature, { nullable: true })},
        ${toSqlText(item.answerPathJson, { nullable: true })},
        ${toSqlNumber(item.roundsUsed, 0)},
        ${toSqlNumber(item.questionCount, 0)},
        ${toSqlNumber(item.observedEvidenceCount, 0)},
        ${toSqlText(item.diagnosisDirectionLabelsJson, { nullable: true })}
      )`
    })
    .join(',\n')

  await models.$runSQL(
    `
      INSERT INTO ${table('diagnosis_batch_reviews')} (
        diagnosis_id,
        batch_source,
        source_schema,
        batch_generated_at,
        sample_label,
        sample_file_name,
        sample_absolute_path,
        answer_path_signature,
        answer_path_json,
        rounds_used,
        question_count,
        observed_evidence_count,
        diagnosis_direction_labels_json
      ) VALUES
      ${valuesClause}
      ON DUPLICATE KEY UPDATE
        batch_source = VALUES(batch_source),
        source_schema = VALUES(source_schema),
        batch_generated_at = VALUES(batch_generated_at),
        sample_label = VALUES(sample_label),
        sample_file_name = VALUES(sample_file_name),
        sample_absolute_path = VALUES(sample_absolute_path),
        answer_path_signature = VALUES(answer_path_signature),
        answer_path_json = VALUES(answer_path_json),
        rounds_used = VALUES(rounds_used),
        question_count = VALUES(question_count),
        observed_evidence_count = VALUES(observed_evidence_count),
        diagnosis_direction_labels_json = VALUES(diagnosis_direction_labels_json),
        updated_at = CURRENT_TIMESTAMP
    `,
    {}
  )

  return {
    upsertedCount: safeRecords.length
  }
}

module.exports = {
  upsertDiagnosisBatchReviews
}
