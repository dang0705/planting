-- 修复黄叶 airflow 分支命中与可读性问题
-- 目标：确保 airflow 分支 route/gate/question/answer 完整落库，避免文案/分类漂移。

-- root_stress 用户可读文案（保持 key 不变，避免影响路由与审计）
UPDATE diagnosis_outcomes
SET
  outcome_name_cn = '根部环境压力',
  display_name_cn = '根部环境压力',
  user_definition_cn = '当前更像根部周围环境不稳定，疑似闷根或根系受压，但暂未细分到腐烂或单纯水分问题。',
  updated_at = NOW()
WHERE outcome_key = 'root_stress';

-- 清理历史错误 key / 重复分支残留（如存在）
DELETE FROM outcome_routes
WHERE route_key IN ('yellowing_airing_root_stress_route');

DELETE FROM outcome_route_gates
WHERE gate_key IN ('airflow_root_stress_gate')
  AND route_key IN ('yellowing_airing_root_stress_route');

DELETE FROM outcome_route_questions
WHERE route_key IN ('yellowing_airing_root_stress_route');

DELETE FROM outcome_answer_effects
WHERE route_key IN ('yellowing_airing_root_stress_route');

-- 黄叶 airflow 路线定义（upsert）
REPLACE INTO outcome_routes (
  route_key,
  route_group_key,
  outcome_key,
  route_name_cn,
  route_entry_type,
  entry_symptom_keys_json,
  entry_direction_keys_json,
  entry_symptom_class_keys_json,
  host_profile_condition_json,
  entry_priority,
  max_questions,
  fallback_policy,
  action_profile_key,
  action_conflict_group,
  enabled,
  review_status,
  data_status
) VALUES
  ('yellowing_airflow_leaf_spot_route', 'yellowing_care_split_group', 'leaf_spot_problem', '黄叶 + 通风湿度变化 + 快速扩散路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 80, 2, 'uncertain', 'action_leaf_spot_basic', 'control_moisture', 1, 'audited', 'active'),
  ('yellowing_airflow_root_stress_route', 'yellowing_care_split_group', 'root_stress', '黄叶 + 通风湿度变化 + 萎蔫掉叶路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 79, 2, 'uncertain', 'action_root_stress_basic', 'root_stabilize', 1, 'audited', 'active'),
  ('yellowing_airflow_humidity_stress_route', 'yellowing_care_split_group', 'humidity_airflow_stress', '黄叶 + 通风湿度环境压力路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 78, 2, 'uncertain', 'action_humidity_airflow_stabilize', 'environment_stabilize', 1, 'audited', 'active'),
  ('yellowing_airflow_unknown_route', 'yellowing_care_split_group', 'uncertain_observation', '黄叶 + 通风湿度进展不确定路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 40, 2, 'uncertain', 'action_uncertain_prepare', '', 1, 'audited', 'active');

-- 黄叶 airflow 关键信息门控（含叶斑闭合前置证据补齐）
REPLACE INTO outcome_route_gates (
  gate_key,
  route_key,
  gate_role,
  required_evidence_json,
  required_answer_effects_json,
  blocker_evidence_json,
  conflict_outcome_keys_json,
  closure_level,
  on_pass,
  on_fail,
  on_unknown,
  decision_cause_key,
  decision_cause_text_cn,
  gate_priority,
  enabled,
  review_status,
  data_status
) VALUES
  (
    'airflow_leaf_spot_gate',
    'yellowing_airflow_leaf_spot_route',
    'display',
    JSON_OBJECT(
      'symptomKeys', JSON_ARRAY('spreading_spots'),
      'anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')
    ),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area', 'q_observed_probe__leaf_yellowing__yellowing_progression_speed:rapid_spreading'),
      'routeKeys', JSON_ARRAY('yellowing_airflow_leaf_spot_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY(),
    'probable',
    'display_outcome',
    'ask_next',
    'uncertain',
    'airflow_leaf_spot_confirmed',
    '黄叶同时存在明确斑点扩散证据，并伴随通风/湿度变化与快速扩散，才支持叶斑类问题。',
    80,
    1,
    'audited',
    'active'
  ),
  (
    'airflow_root_stress_gate',
    'yellowing_airflow_root_stress_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area', 'q_observed_probe__leaf_yellowing__yellowing_progression_speed:with_wilting_or_drop'),
      'routeKeys', JSON_ARRAY('yellowing_airflow_root_stress_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY(),
    'probable',
    'display_outcome',
    'ask_next',
    'uncertain',
    'airflow_root_stress_confirmed',
    '通风/湿度变化叠加萎蔫或掉叶，更符合根部环境压力方向。',
    79,
    1,
    'audited',
    'active'
  ),
  (
    'airflow_humidity_stress_gate',
    'yellowing_airflow_humidity_stress_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area', 'q_observed_probe__leaf_yellowing__yellowing_progression_speed:slow_stable'),
      'routeKeys', JSON_ARRAY('yellowing_airflow_humidity_stress_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY(),
    'probable',
    'display_outcome',
    'ask_next',
    'uncertain',
    'airflow_humidity_stress_confirmed',
    '通风/湿度变化但进展较慢，更符合环境稳定性压力方向。',
    78,
    1,
    'audited',
    'active'
  ),
  (
    'airflow_unknown_gate',
    'yellowing_airflow_unknown_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area', 'q_observed_probe__leaf_yellowing__yellowing_progression_speed:unknown'),
      'routeKeys', JSON_ARRAY('yellowing_airflow_unknown_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY(),
    'uncertain',
    'display_outcome',
    'uncertain',
    'uncertain',
    'airflow_unknown',
    '通风/湿度变化后的进展仍不明确，保留不确定输出。',
    40,
    1,
    'audited',
    'active'
  );

-- 黄叶 airflow 问题问题分支问题序列
REPLACE INTO outcome_route_questions (
  route_key,
  step_no,
  question_key,
  gate_key,
  question_role,
  required_for_closure,
  ask_priority,
  skip_if_evidence_json,
  repeat_policy,
  enabled,
  review_status,
  data_status
) VALUES
  ('yellowing_airflow_leaf_spot_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_leaf_spot_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_leaf_spot_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_leaf_spot_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_root_stress_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_root_stress_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_root_stress_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_root_stress_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_humidity_stress_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_stress_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_humidity_stress_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_humidity_stress_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_unknown_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_unknown_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_unknown_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_unknown_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active');

-- 黄叶 airflow 回答效应（关键修正：通风湿度分流命中 root_stress/叶斑/环境压力）
REPLACE INTO outcome_answer_effects (
  question_key,
  option_key,
  outcome_key,
  route_key,
  effect_type,
  effect_strength,
  redirect_outcome_key,
  evidence_dimension,
  effect_note_cn,
  enabled,
  review_status,
  data_status
) VALUES
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'leaf_spot_problem', 'yellowing_airflow_leaf_spot_route', 'support', 0.3500, '', 'airflow_humidity_context', '通风/湿度分流进入叶斑扩散判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'root_stress', 'yellowing_airflow_root_stress_route', 'support', 0.3500, '', 'airflow_humidity_context', '通风/湿度分流进入根部环境压力判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'humidity_airflow_stress', 'yellowing_airflow_humidity_stress_route', 'support', 0.3500, '', 'airflow_humidity_context', '通风/湿度分流进入环境压力判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'uncertain_observation', 'yellowing_airflow_unknown_route', 'support', 0.2000, '', 'airflow_humidity_context', '通风/湿度背景不明确时保守观察。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'rapid_spreading', 'leaf_spot_problem', 'yellowing_airflow_leaf_spot_route', 'support', 1.0000, '', 'yellowing_progression_speed', '黄叶快速扩散，支持叶斑类或潮湿扩散方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'slow_stable', 'humidity_airflow_stress', 'yellowing_airflow_humidity_stress_route', 'support', 1.0000, '', 'yellowing_progression_speed', '黄叶变化缓慢，支持通风/湿度环境压力方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'with_wilting_or_drop', 'root_stress', 'yellowing_airflow_root_stress_route', 'support', 1.0000, '', 'yellowing_progression_speed', '伴随萎蔫或掉叶，支持根部环境压力方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'unknown', 'uncertain_observation', 'yellowing_airflow_unknown_route', 'support', 0.5000, '', 'yellowing_progression_speed', '进展未明确，保留不确定输出。', 1, 'audited', 'active');

-- 兼容性兜底：若黄叶分流组中未包含最新 outcome 列表，按新口径补齐
UPDATE outcome_route_groups
SET candidate_outcome_keys_json = JSON_ARRAY(
  'overwatering_root_pressure',
  'underwatering',
  'normal_leaf_aging',
  'low_light_growth_weakness',
  'sunburn',
  'nitrogen_deficiency',
  'iron_deficiency',
  'nutrient_deficiency',
  'fertilizer_repot_stress',
  'humidity_airflow_stress',
  'root_stress',
  'leaf_spot_problem',
  'dry_air_stress',
  'uncertain_observation'
),
updated_at = NOW()
WHERE route_group_key = 'yellowing_care_split_group';
