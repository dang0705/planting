'use strict'

const TABLE_CONFIGS = [
  {
    table: 'problems',
    sheet: 'problems',
    keys: ['problem_key'],
    columns: [
      'problem_key',
      'problem_name',
      'problem_cn',
      'problem_type',
      'problem_role',
      'definition',
      'definition_audited',
      'default_action',
      'default_action_audited',
      'default_prevention',
      'default_prevention_audited',
      'data_status',
      'data_source',
      'audit_note',
      'display_name_cn',
      'user_definition_cn',
      'user_action_cn',
      'user_prevention_cn',
      'severity_hint_cn',
      'urgency_hint_cn',
      'first_check_cn',
      'avoid_cn'
    ],
    numericColumns: [],
    jsonColumns: []
  },
  {
    table: 'symptoms',
    sheet: 'symptoms',
    keys: ['symptom_key'],
    columns: [
      'symptom_key',
      'symptom_cn',
      'location_key',
      'pattern_key',
      'distribution_key',
      'severity_hint',
      'symptom_type',
      'signal_reliability',
      'ai_visual_pool',
      'data_status',
      'data_source',
      'note',
      'display_text_cn',
      'user_observation_tip_cn',
      'confusion_note_cn'
    ],
    numericColumns: ['signal_reliability'],
    jsonColumns: ['ai_visual_pool']
  },
  {
    table: 'symptom_problem_evidence',
    sheet: 'symptom_problem_evidence',
    keys: ['symptom_key', 'problem_key', 'evidence_type'],
    columns: [
      'id',
      'symptom_key',
      'problem_key',
      'location_key',
      'pattern_key',
      'distribution_key',
      'evidence_type',
      'association_strength',
      'edge_reliability',
      'data_status',
      'data_source',
      'note'
    ],
    numericColumns: ['association_strength', 'edge_reliability'],
    jsonColumns: []
  },
  {
    table: 'genus_problem_profiles',
    sheet: 'genus_problem_profiles',
    keys: ['genus', 'problem_key'],
    columns: [
      'id',
      'genus',
      'problem_key',
      'genus_compatibility',
      'compatibility_level',
      'data_status',
      'data_source',
      'audit_note'
    ],
    numericColumns: ['genus_compatibility'],
    jsonColumns: []
  },
  {
    table: 'problem_host_profiles',
    sheet: 'problem_host_profiles',
    keys: ['problem_key', 'host_level', 'host_name'],
    columns: [
      'id',
      'problem_key',
      'host_level',
      'host_name',
      'host_compatibility',
      'compatibility_level',
      'data_status',
      'data_source',
      'evidence_basis'
    ],
    numericColumns: ['host_compatibility'],
    jsonColumns: []
  },
  {
    table: 'plant_problem_profiles',
    sheet: 'plant_problem_profiles',
    keys: ['plant_id', 'problem_key'],
    columns: [
      'id',
      'plant_id',
      'genus',
      'family',
      'category',
      'problem_key',
      'genus_compatibility',
      'host_compatibility',
      'final_prior_score',
      'matched_host_level',
      'source_layer',
      'data_status'
    ],
    numericColumns: ['genus_compatibility', 'host_compatibility', 'final_prior_score'],
    jsonColumns: []
  },
  {
    table: 'problem_causality',
    sheet: 'problem_causality',
    keys: ['cause_problem_key', 'effect_problem_key', 'relation_type'],
    columns: [
      'id',
      'cause_problem_key',
      'effect_problem_key',
      'relation_type',
      'relation_strength',
      'data_status',
      'data_source',
      'note',
      'created_at',
      'updated_at'
    ],
    numericColumns: ['relation_strength'],
    jsonColumns: []
  },
  {
    table: 'question_library_v5_real',
    sheet: 'question_library_v5_real',
    keys: ['question_key'],
    columns: [
      'question_key',
      'question_text_cn',
      'question_type',
      'target_symptom_key',
      'question_group_key',
      'question_level',
      'observability',
      'allow_unknown',
      'priority',
      'data_status',
      'data_source',
      'note',
      'question_text_user_cn',
      'help_text_cn',
      'why_this_question_cn'
    ],
    numericColumns: ['question_level', 'allow_unknown', 'priority'],
    jsonColumns: []
  },
  {
    table: 'question_option_mapping_v5_real',
    sheet: 'question_option_mapping_v5_real',
    keys: ['question_key', 'option_key'],
    columns: [
      'question_key',
      'option_key',
      'option_text_cn',
      'maps_to_symptom_key',
      'value',
      'association_strength',
      'data_status',
      'data_source',
      'note',
      'option_text_user_cn',
      'answer_effect_cn'
    ],
    numericColumns: ['value', 'association_strength'],
    jsonColumns: []
  },
  {
    table: 'question_strategy_v5_real',
    sheet: 'question_strategy_v5_real',
    keys: ['problem_key', 'question_group_key', 'question_key'],
    columns: [
      'problem_key',
      'question_group_key',
      'question_key',
      'priority_score',
      'trigger_type',
      'data_status',
      'data_source',
      'note',
      'strategy_note_cn'
    ],
    numericColumns: ['priority_score'],
    jsonColumns: []
  },
  {
    table: 'question_generation_engine',
    sheet: 'question_generation_engine',
    keys: ['engine_rule_key'],
    columns: [
      'engine_rule_key',
      'applies_to_group',
      'input_signal',
      'template_cn',
      'observability_default',
      'allow_unknown_default',
      'output_field',
      'note',
      'template_user_cn',
      'engine_usage_cn'
    ],
    numericColumns: ['allow_unknown_default'],
    jsonColumns: []
  },
  {
    table: 'diagnosis_result_explanations',
    sheet: 'diagnosis_result_explanations',
    keys: ['problem_key'],
    columns: [
      'problem_key',
      'display_name_cn',
      'result_summary_cn',
      'why_it_happens_cn',
      'what_to_check_next_cn',
      'first_aid_cn',
      'avoid_cn',
      'reassurance_cn'
    ],
    numericColumns: [],
    jsonColumns: []
  }
]

const TABLE_CONFIG_MAP = Object.fromEntries(TABLE_CONFIGS.map(item => [item.table, item]))

const METADATA_COLUMNS = [
  'source_type',
  'source_batch_id',
  'version_tag',
  'row_hash',
  'review_status',
  'review_note',
  'is_active',
  'created_at',
  'updated_at',
  'published_at',
  'published_batch_id'
]

module.exports = {
  TABLE_CONFIGS,
  TABLE_CONFIG_MAP,
  METADATA_COLUMNS
}
