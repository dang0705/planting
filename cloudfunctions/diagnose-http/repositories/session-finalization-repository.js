'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')

async function upsertDiagnosisSnapshotRecord(params = {}) {
  await models.$runSQL(
    `
      INSERT INTO ${table('diagnosis_result_snapshots')} (
        diagnosis_id,
        _openid,
        snapshot_json,
        diagnosis_engine_version,
        data_bundle_version,
        question_system_version,
        result_explanation_version,
        legacy_adapter_version
      ) VALUES (
        {{diagnosisId}},
        {{openid}},
        {{snapshotJson}},
        {{diagnosisEngineVersion}},
        {{dataBundleVersion}},
        {{questionSystemVersion}},
        {{resultExplanationVersion}},
        {{legacyAdapterVersion}}
      )
      ON DUPLICATE KEY UPDATE
        snapshot_json = VALUES(snapshot_json),
        diagnosis_engine_version = VALUES(diagnosis_engine_version),
        data_bundle_version = VALUES(data_bundle_version),
        question_system_version = VALUES(question_system_version),
        result_explanation_version = VALUES(result_explanation_version),
        legacy_adapter_version = VALUES(legacy_adapter_version),
        updated_at = CURRENT_TIMESTAMP
    `,
    params
  )
}

async function insertDiagnosisFeedbackRecord(params = {}) {
  await models.$runSQL(
    `
      INSERT INTO ${table('diagnosis_feedback')} (
        _openid,
        diagnosis_id,
        is_helpful,
        is_accurate,
        note
      ) VALUES (
        {{openid}},
        {{diagnosisId}},
        {{isHelpful}},
        {{isAccurate}},
        {{note}}
      )
    `,
    params
  )
}

module.exports = {
  upsertDiagnosisSnapshotRecord,
  insertDiagnosisFeedbackRecord
}
