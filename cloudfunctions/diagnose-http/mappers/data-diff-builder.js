'use strict'

const requiredTables = require('../constants/tables')
const repositoryShapes = require('../constants/repository-shapes')

const expectedColumns = {
  problems: [
    'problem_key',
    'problem_cn',
    'problem_role',
    'problem_type',
    'display_name_cn',
    'user_definition_cn',
    'user_action_cn',
    'user_prevention_cn',
    'severity_hint_cn',
    'urgency_hint_cn',
    'data_status'
  ],
  symptoms: [
    'symptom_key',
    'symptom_cn',
    'location_key',
    'symptom_type',
    'signal_reliability',
    'display_text_cn',
    'user_observation_tip_cn',
    'confusion_note_cn',
    'data_status'
  ],
  symptom_problem_evidence: [
    'symptom_key',
    'problem_key',
    'association_strength',
    'edge_reliability',
    'evidence_type',
    'data_status'
  ],
  plant_identity_diagnosis_links: [
    'plant_identity_id',
    'link_level',
    'target_profile_key',
    'target_table_name',
    'target_record_key',
    'link_strength',
    'review_status',
    'is_active'
  ],
  genus_problem_profiles: ['genus', 'problem_key', 'genus_compatibility', 'data_status'],
  problem_host_profiles: ['problem_key', 'host_level', 'host_name', 'host_compatibility', 'data_status'],
  plant_problem_profiles: ['plant_id', 'problem_key', 'genus_compatibility', 'host_compatibility', 'final_prior_score', 'data_status'],
  problem_causality: ['cause_problem_key', 'effect_problem_key', 'relation_type', 'relation_strength', 'data_status'],
  question_library_v5_real: ['question_key', 'question_text_cn', 'question_group_key', 'allow_unknown', 'priority', 'target_symptom_key', 'data_status'],
  question_option_mapping_v5_real: ['question_key', 'option_key', 'maps_to_symptom_key', 'value', 'association_strength', 'data_status'],
  question_strategy_v5_real: ['problem_key', 'question_group_key', 'question_key', 'priority_score', 'trigger_type', 'data_status'],
  question_generation_engine: ['engine_rule_key', 'applies_to_group', 'input_signal', 'allow_unknown_default'],
  diagnosis_result_explanations: ['problem_key', 'display_name_cn', 'result_summary_cn', 'why_it_happens_cn', 'what_to_check_next_cn', 'first_aid_cn', 'avoid_cn'],
  visual_supervision_records: [
    'session_id',
    'visual_call_batch_id',
    'visual_admission_record_id',
    'adopted_by_evidence',
    'corrected_by_question',
    'denied_by_runtime',
    'denied_by_outcome_competition',
    'question_correction_scope',
    'final_outcome_type',
    'final_stop_reason'
  ],
  question_queue: [
    'question_queue_id',
    '_openid',
    'session_id',
    'diagnosis_id',
    'round_id',
    'round_index',
    'route_primary_action',
    'queue_status',
    'service_target',
    'exhausted_reason',
    'question_items_json',
    'active_item_count',
    'asked_item_count',
    'answered_item_count',
    'invalidated_item_count',
    'created_at',
    'updated_at'
  ],
  stop_state: [
    'stop_state_id',
    '_openid',
    'session_id',
    'diagnosis_id',
    'round_id',
    'round_index',
    'is_stopped',
    'stop_reason_type',
    'stop_reason',
    'stop_reason_text',
    'final_output_ref',
    'allow_more_questions',
    'output_eligible',
    'output_judgment',
    'conclusion_type',
    'conclusion_status',
    'output_conservatism',
    'key_evidence_summary',
    'unresolved_risks_json',
    'next_step_hints_json',
    'created_at',
    'updated_at'
  ]
}

function buildTableDiff(tableName, actualColumns = []) {
  const expected = expectedColumns[tableName] || []
  const actualSet = new Set((actualColumns || []).map(item => String(item || '').trim().toLowerCase()))

  const missingColumns = expected.filter(col => !actualSet.has(col.toLowerCase()))
  const extraColumns = (actualColumns || []).filter(col => !expected.includes(String(col || '').trim()))

  return {
    table: tableName,
    expectedColumns: expected,
    actualColumns,
    missingColumns,
    extraColumns,
    type: missingColumns.length
      ? 'missing'
      : extraColumns.length
        ? 'extra'
        : 'matched'
  }
}

function buildDataDiffReport({ runtimeSchema = {} } = {}) {
  const tableDiffs = requiredTables.map(table =>
    buildTableDiff(table, runtimeSchema[table] || [])
  )

  const missingTables = requiredTables.filter(table => !runtimeSchema[table])

  return {
    generatedAt: new Date().toISOString(),
    scope: 'diagnosis-new-schema-v13',
    summary: {
      requiredTableCount: requiredTables.length,
      runtimeTableCount: Object.keys(runtimeSchema || {}).length,
      missingTableCount: missingTables.length,
      tablesWithMissingColumns: tableDiffs.filter(item => item.missingColumns.length).length,
      tablesWithExtraColumns: tableDiffs.filter(item => item.extraColumns.length).length
    },
    missingTables,
    tableDiffs,
    repositoryOutputShape: repositoryShapes,
    notes: [
      '先完成主键空间闭环，再补证据边，再补先验，再补问诊，再补解释层',
      'runtimeSchema 未提供时，报告默认为“待运行时校验”状态'
    ]
  }
}

module.exports = {
  expectedColumns,
  buildDataDiffReport
}
