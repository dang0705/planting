-- Fix yellowing route non-watering branches.
-- Scope:
-- 1. Ensure yellowing leaf-age question and options exist for old-leaf route closure.
-- 2. Keep route-planned question descriptions free of unresolved template variables in runtime code.

INSERT INTO question_library_v5_real (
  question_key,
  question_text_cn,
  question_type,
  target_symptom_key,
  question_group_key,
  question_level,
  observability,
  target_dimension,
  routing_scope,
  question_role,
  effect_mode,
  allow_unknown,
  priority,
  data_status,
  data_source,
  note,
  question_text_user_cn,
  help_text_cn,
  why_this_question_cn,
  default_option_key,
  ui_variant,
  render_mode,
  template_engine_rule_key,
  source_type,
  source_batch_id,
  version_tag,
  review_status,
  review_note,
  is_active,
  created_at,
  updated_at,
  published_at,
  published_batch_id
) VALUES (
  'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
  '发黄主要先出现在新叶，还是老叶/下部叶？',
  'single_choice',
  'leaf_yellowing',
  'observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
  1,
  'medium',
  'yellowing_leaf_age_pattern',
  'differential_probe',
  'differential_probe',
  'score_adjustment',
  1,
  200,
  'audited',
  'data_template',
  'leaf age yellowing branch copy is governed in data layer',
  '黄叶如果暂时没有明显虫痕、病斑或养护变化，就需要看它先从哪里开始。发黄主要先出现在新叶，还是老叶/下部叶？',
  '这题用于区分自然代谢、弱光和根区压力等方向，不是重复确认黄叶本身。',
  '黄叶新老叶分流题由数据层治理。',
  '',
  'single_select_accordion',
  'data_template',
  'qge_yellowing_leaf_age_pattern',
  'manual',
  'fix_yellowing_route_non_watering_20260511',
  'v20260511_route_non_watering_fix',
  'audited',
  '补齐黄叶旧叶自然代谢 route 所需问题。',
  1,
  NOW(),
  NOW(),
  NOW(),
  'fix_yellowing_route_non_watering_20260511'
) ON DUPLICATE KEY UPDATE
  question_text_cn = VALUES(question_text_cn),
  question_text_user_cn = VALUES(question_text_user_cn),
  target_symptom_key = VALUES(target_symptom_key),
  question_group_key = VALUES(question_group_key),
  target_dimension = VALUES(target_dimension),
  routing_scope = VALUES(routing_scope),
  question_role = VALUES(question_role),
  effect_mode = VALUES(effect_mode),
  help_text_cn = VALUES(help_text_cn),
  why_this_question_cn = VALUES(why_this_question_cn),
  ui_variant = VALUES(ui_variant),
  render_mode = VALUES(render_mode),
  data_status = VALUES(data_status),
  review_status = VALUES(review_status),
  is_active = VALUES(is_active),
  updated_at = NOW();

INSERT INTO question_option_mapping_v5_real (
  question_key,
  option_key,
  option_text_cn,
  maps_to_symptom_key,
  value,
  association_strength,
  data_status,
  data_source,
  note,
  option_text_user_cn,
  answer_effect_cn,
  option_description_user_cn,
  display_order,
  is_default,
  source_type,
  source_batch_id,
  version_tag,
  review_status,
  review_note,
  is_active,
  created_at,
  updated_at,
  published_at,
  published_batch_id
) VALUES
  ('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'new_leaves_first', '新叶更明显', '', 0, 0, 'audited', 'data_template', 'new leaves first', '新叶更明显', '记录新叶先黄。', '', 10, 0, 'manual', 'fix_yellowing_route_non_watering_20260511', 'v20260511_route_non_watering_fix', 'audited', '新叶选项。', 1, NOW(), NOW(), NOW(), 'fix_yellowing_route_non_watering_20260511'),
  ('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'old_lower_leaves_first', '老叶或下部叶更明显', '', 0, 0, 'audited', 'data_template', 'old lower leaves first', '老叶或下部叶更明显', '记录老叶或下部叶先黄。', '', 20, 0, 'manual', 'fix_yellowing_route_non_watering_20260511', 'v20260511_route_non_watering_fix', 'audited', '老叶选项。', 1, NOW(), NOW(), NOW(), 'fix_yellowing_route_non_watering_20260511'),
  ('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'no_clear_age_bias', '新老叶差不多，或看不出先后', '', 0, 0, 'audited', 'data_template', 'no age bias', '新老叶差不多，或看不出先后', '记录新老叶先后不明显。', '', 30, 0, 'manual', 'fix_yellowing_route_non_watering_20260511', 'v20260511_route_non_watering_fix', 'audited', '无叶龄差异选项。', 1, NOW(), NOW(), NOW(), 'fix_yellowing_route_non_watering_20260511'),
  ('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'unknown', '不确定', '', 0, 0, 'audited', 'data_template', 'unknown age bias', '不确定', '暂不记录明确叶龄分布。', '', 40, 0, 'manual', 'fix_yellowing_route_non_watering_20260511', 'v20260511_route_non_watering_fix', 'audited', '叶龄不确定选项。', 1, NOW(), NOW(), NOW(), 'fix_yellowing_route_non_watering_20260511')
ON DUPLICATE KEY UPDATE
  option_text_cn = VALUES(option_text_cn),
  option_text_user_cn = VALUES(option_text_user_cn),
  answer_effect_cn = VALUES(answer_effect_cn),
  option_description_user_cn = VALUES(option_description_user_cn),
  display_order = VALUES(display_order),
  data_status = VALUES(data_status),
  review_status = VALUES(review_status),
  is_active = VALUES(is_active),
  updated_at = NOW();

-- Fix 黄叶非浇水 branch 路由闭环：施肥/换盆、通风/湿度不再一律收敛到 uncertain。
-- 只有用户明确 unknown 或正式证据不足时才保守进入 uncertain_observation。
REPLACE INTO diagnosis_outcomes (
  outcome_key,
  legacy_problem_key,
  outcome_name_cn,
  outcome_type,
  outcome_category,
  display_name_cn,
  user_definition_cn,
  action_profile_key,
  risk_level,
  is_final_output,
  is_intermediate_node,
  allow_direct_close,
  allow_uncertain_close,
  priority,
  review_status,
  data_status
) VALUES
  ('nitrogen_deficiency', 'nitrogen_deficiency', '缺氮/长期营养不足', 'problem_cluster', 'nutrition', '缺氮/长期营养不足', '当前更像长期补肥不足或营养供给偏弱导致的老叶/整体黄化。', 'action_nutrient_support_basic', 'medium', 1, 0, 1, 1, 86, 'audited', 'active'),
  ('iron_deficiency', 'iron_deficiency', '缺铁/新叶脉间黄化', 'problem_cluster', 'nutrition', '缺铁/新叶脉间黄化', '当前更像新叶或脉间黄化相关的营养吸收问题。', 'action_nutrient_support_basic', 'medium', 1, 0, 1, 1, 85, 'audited', 'active'),
  ('nutrient_deficiency', 'nutrient_deficiency', '营养供给偏弱', 'problem_cluster', 'nutrition', '营养供给偏弱', '当前更像长期养分供给不足，但暂不细分到单一元素。', 'action_nutrient_support_basic', 'medium', 1, 0, 1, 1, 82, 'audited', 'active'),
  ('fertilizer_repot_stress', 'fertilizer_repot_stress', '施肥/换盆应激', 'care_cluster', 'nutrition', '施肥/换盆应激', '当前更像近期重肥、频繁施肥或换盆换土后的根区应激。', 'action_fertilizer_repot_stress', 'medium', 1, 0, 1, 1, 81, 'audited', 'active'),
  ('humidity_airflow_stress', 'humidity_airflow_stress', '通风/湿度环境压力', 'care_cluster', 'environment', '通风/湿度环境压力', '当前更像通风、湿度或环境稳定性变化带来的黄叶压力。', 'action_humidity_airflow_stabilize', 'low', 1, 0, 1, 1, 79, 'audited', 'active'),
  ('root_stress', 'root_stress', '根部环境压力', 'problem_cluster', 'root', '根部环境压力', '当前更像根部周围环境不稳定，疑似闷根或根系受压，但暂未细分到腐烂或单纯水分问题。', 'action_root_stress_basic', 'medium', 1, 0, 1, 1, 87, 'audited', 'active');

REPLACE INTO outcome_action_profiles (
  action_profile_key,
  title_cn,
  today_actions_json,
  three_day_actions_json,
  seven_day_observe_json,
  avoid_actions_json,
  retake_or_escalate_json,
  plant_baseline_merge_policy,
  review_status,
  data_status
) VALUES
  ('action_nutrient_support_basic', '温和恢复营养供给', JSON_ARRAY('先核对最近 1-2 个生长周期是否长期未补肥', '若植株仍在生长期，可从低浓度、少量补肥开始'), JSON_ARRAY('3 天内观察是否继续快速黄化，不要连续追肥'), JSON_ARRAY('7 天内对比新叶和老叶黄化是否继续扩大'), JSON_ARRAY('不要一次性重肥猛补，也不要和大幅浇水调整同时进行'), JSON_ARRAY('若新叶持续脉间黄化或老叶快速扩大，补拍新老叶对比和盆土状态'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_fertilizer_repot_stress', '先稳定根区恢复', JSON_ARRAY('近期刚重肥或换盆时先暂停继续施肥', '保持盆土干湿和光照稳定'), JSON_ARRAY('3 天内观察黄叶是否继续扩大或伴随萎蔫'), JSON_ARRAY('7 天内记录新叶是否恢复稳定'), JSON_ARRAY('不要继续重肥、频繁换土或同时大幅改变浇水'), JSON_ARRAY('若伴随软塌、异味或持续掉叶，补拍根茎和盆土后升级复核'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_humidity_airflow_stabilize', '先稳定通风和湿度', JSON_ARRAY('先把环境调整到稳定通风，避免闷湿或风口直吹', '保持浇水和光照不要同时大幅改动'), JSON_ARRAY('3 天内观察黄叶是否继续扩散或出现斑点'), JSON_ARRAY('7 天内记录新叶和下部叶变化'), JSON_ARRAY('不要在未确认前频繁喷水、重肥或重药'), JSON_ARRAY('若出现斑点扩散、萎蔫或掉叶，补拍叶面叶背和环境位置'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_root_stress_basic', '先稳定根部环境', JSON_ARRAY('先检查盆土干湿、盆底积水和通风状态', '保持根部周围环境稳定，避免继续刺激'), JSON_ARRAY('3 天内观察是否继续萎蔫、掉叶或黄化扩大'), JSON_ARRAY('7 天内记录盆土干湿恢复速度和新叶状态'), JSON_ARRAY('不要在疑似闷根或根系受压时继续重肥或频繁浇水'), JSON_ARRAY('若出现异味、黑根、糊根或基部软塌，补拍根茎后升级复核'), 'respect_genus_care_profile', 'audited', 'active');

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
)
WHERE route_group_key = 'yellowing_care_split_group';

DELETE FROM outcome_routes
WHERE route_key IN (
  'yellowing_fertilization_area_route',
  'yellowing_airflow_humidity_route',
  'yellowing_low_fertilizer_iron_route',
  'yellowing_low_fertilizer_nitrogen_route',
  'yellowing_low_fertilizer_nutrient_route',
  'yellowing_heavy_fertilizer_repot_route',
  'yellowing_fertilization_unknown_route',
  'yellowing_airflow_leaf_spot_route',
  'yellowing_airflow_root_stress_route',
  'yellowing_airflow_humidity_stress_route',
  'yellowing_airflow_unknown_route'
);

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
  ('yellowing_low_fertilizer_iron_route', 'yellowing_care_split_group', 'iron_deficiency', '黄叶 + 低施肥 + 新叶/脉间黄化路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 87, 2, 'uncertain', 'action_nutrient_support_basic', 'nutrient_adjust', 1, 'audited', 'active'),
  ('yellowing_low_fertilizer_nitrogen_route', 'yellowing_care_split_group', 'nitrogen_deficiency', '黄叶 + 低施肥 + 老叶/均匀黄化路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 86, 2, 'uncertain', 'action_nutrient_support_basic', 'nutrient_adjust', 1, 'audited', 'active'),
  ('yellowing_low_fertilizer_nutrient_route', 'yellowing_care_split_group', 'nutrient_deficiency', '黄叶 + 长期缺肥营养供给偏弱路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 82, 2, 'uncertain', 'action_nutrient_support_basic', 'nutrient_adjust', 1, 'audited', 'active'),
  ('yellowing_heavy_fertilizer_repot_route', 'yellowing_care_split_group', 'fertilizer_repot_stress', '黄叶 + 重肥/换盆根区应激路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 81, 2, 'uncertain', 'action_fertilizer_repot_stress', 'root_stabilize', 1, 'audited', 'active'),
  ('yellowing_fertilization_unknown_route', 'yellowing_care_split_group', 'uncertain_observation', '黄叶 + 施肥背景不确定路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 40, 2, 'uncertain', 'action_uncertain_prepare', '', 1, 'audited', 'active'),
  ('yellowing_airflow_leaf_spot_route', 'yellowing_care_split_group', 'leaf_spot_problem', '黄叶 + 通风湿度变化 + 快速扩散路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 80, 2, 'uncertain', 'action_leaf_spot_basic', 'control_moisture', 1, 'audited', 'active'),
  ('yellowing_airflow_root_stress_route', 'yellowing_care_split_group', 'root_stress', '黄叶 + 通风湿度变化 + 萎蔫掉叶路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 79, 2, 'uncertain', 'action_root_stress_basic', 'root_stabilize', 1, 'audited', 'active'),
  ('yellowing_airflow_humidity_stress_route', 'yellowing_care_split_group', 'humidity_airflow_stress', '黄叶 + 通风湿度环境压力路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 78, 2, 'uncertain', 'action_humidity_airflow_stabilize', 'environment_stabilize', 1, 'audited', 'active'),
  ('yellowing_airflow_unknown_route', 'yellowing_care_split_group', 'uncertain_observation', '黄叶 + 通风湿度进展不确定路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 40, 2, 'uncertain', 'action_uncertain_prepare', '', 1, 'audited', 'active');

DELETE FROM outcome_route_gates
WHERE gate_key IN (
  'fertilization_confirmation_gate',
  'airflow_confirmation_gate',
  'low_fertilizer_iron_gate',
  'low_fertilizer_nitrogen_gate',
  'low_fertilizer_nutrient_gate',
  'heavy_fertilizer_repot_gate',
  'fertilization_unknown_gate',
  'airflow_leaf_spot_gate',
  'airflow_root_stress_gate',
  'airflow_humidity_stress_gate',
  'airflow_unknown_gate'
);

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
    'low_fertilizer_iron_gate',
    'yellowing_low_fertilizer_iron_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('yellow_new_leaves', 'interveinal_chlorosis')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area', 'q_observed_probe__leaf_yellowing__fertilization_growth_context:low_or_no_fertilizer'),
      'routeKeys', JSON_ARRAY('yellowing_low_fertilizer_iron_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY(),
    'probable',
    'display_outcome',
    'ask_next',
    'uncertain',
    'low_fertilizer_iron_confirmed',
    '低施肥背景叠加新叶或脉间黄化，更符合缺铁/营养吸收方向。',
    87,
    1,
    'audited',
    'active'
  ),
  (
    'low_fertilizer_nitrogen_gate',
    'yellowing_low_fertilizer_nitrogen_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('uniform_yellowing', 'yellow_lower_leaves')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area', 'q_observed_probe__leaf_yellowing__fertilization_growth_context:low_or_no_fertilizer'),
      'routeKeys', JSON_ARRAY('yellowing_low_fertilizer_nitrogen_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY(),
    'probable',
    'display_outcome',
    'ask_next',
    'uncertain',
    'low_fertilizer_nitrogen_confirmed',
    '低施肥背景叠加老叶或均匀黄化，更符合缺氮/长期营养不足方向。',
    86,
    1,
    'audited',
    'active'
  ),
  (
    'low_fertilizer_nutrient_gate',
    'yellowing_low_fertilizer_nutrient_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area', 'q_observed_probe__leaf_yellowing__fertilization_growth_context:low_or_no_fertilizer'),
      'routeKeys', JSON_ARRAY('yellowing_low_fertilizer_nutrient_route')
    ),
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')),
    JSON_ARRAY(),
    'probable',
    'display_outcome',
    'ask_next',
    'uncertain',
    'low_fertilizer_nutrient_confirmed',
    '低施肥背景支持营养供给偏弱方向。',
    82,
    1,
    'audited',
    'active'
  ),
  (
    'heavy_fertilizer_repot_gate',
    'yellowing_heavy_fertilizer_repot_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area', 'q_observed_probe__leaf_yellowing__fertilization_growth_context:recent_heavy_fertilizer_or_repot'),
      'routeKeys', JSON_ARRAY('yellowing_heavy_fertilizer_repot_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY('nitrogen_deficiency', 'iron_deficiency'),
    'probable',
    'display_outcome',
    'ask_next',
    'uncertain',
    'heavy_fertilizer_repot_confirmed',
    '近期重肥、频繁施肥或换盆换土，更符合施肥/换盆应激方向。',
    81,
    1,
    'audited',
    'active'
  ),
  (
    'fertilization_unknown_gate',
    'yellowing_fertilization_unknown_route',
    'display',
    JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')),
    JSON_OBJECT(
      'questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area', 'q_observed_probe__leaf_yellowing__fertilization_growth_context:unknown'),
      'routeKeys', JSON_ARRAY('yellowing_fertilization_unknown_route')
    ),
    JSON_OBJECT(),
    JSON_ARRAY(),
    'uncertain',
    'display_outcome',
    'uncertain',
    'uncertain',
    'fertilization_unknown',
    '施肥背景仍不明确，保留不确定输出。',
    40,
    1,
    'audited',
    'active'
  ),
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

DELETE FROM outcome_route_questions
WHERE route_key IN (
  'yellowing_fertilization_area_route',
  'yellowing_airflow_humidity_route',
  'yellowing_low_fertilizer_iron_route',
  'yellowing_low_fertilizer_nitrogen_route',
  'yellowing_low_fertilizer_nutrient_route',
  'yellowing_heavy_fertilizer_repot_route',
  'yellowing_fertilization_unknown_route',
  'yellowing_airflow_leaf_spot_route',
  'yellowing_airflow_root_stress_route',
  'yellowing_airflow_humidity_stress_route',
  'yellowing_airflow_unknown_route'
);

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
  ('yellowing_low_fertilizer_iron_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'low_fertilizer_iron_gate', 'critical_split', 1, 230, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_fertilizer_iron_route', 2, 'q_observed_probe__leaf_yellowing__fertilization_growth_context', 'low_fertilizer_iron_gate', 'context_probe', 1, 228, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_fertilizer_nitrogen_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'low_fertilizer_nitrogen_gate', 'critical_split', 1, 230, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_fertilizer_nitrogen_route', 2, 'q_observed_probe__leaf_yellowing__fertilization_growth_context', 'low_fertilizer_nitrogen_gate', 'context_probe', 1, 228, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_fertilizer_nutrient_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'low_fertilizer_nutrient_gate', 'critical_split', 1, 230, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_fertilizer_nutrient_route', 2, 'q_observed_probe__leaf_yellowing__fertilization_growth_context', 'low_fertilizer_nutrient_gate', 'context_probe', 1, 228, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_heavy_fertilizer_repot_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'heavy_fertilizer_repot_gate', 'critical_split', 1, 230, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_heavy_fertilizer_repot_route', 2, 'q_observed_probe__leaf_yellowing__fertilization_growth_context', 'heavy_fertilizer_repot_gate', 'context_probe', 1, 228, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_fertilization_unknown_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilization_unknown_gate', 'critical_split', 1, 230, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_fertilization_unknown_route', 2, 'q_observed_probe__leaf_yellowing__fertilization_growth_context', 'fertilization_unknown_gate', 'context_probe', 1, 228, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_leaf_spot_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_leaf_spot_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_leaf_spot_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_leaf_spot_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_root_stress_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_root_stress_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_root_stress_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_root_stress_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_humidity_stress_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_stress_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_humidity_stress_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_humidity_stress_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_unknown_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_unknown_gate', 'critical_split', 1, 220, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_airflow_unknown_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'airflow_unknown_gate', 'context_probe', 1, 218, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active');

DELETE FROM outcome_answer_effects
WHERE question_key IN (
  'q_observed_probe__leaf_yellowing__yellowing_care_area_gate',
  'q_observed_probe__leaf_yellowing__fertilization_growth_context',
  'q_observed_probe__leaf_yellowing__yellowing_progression_speed'
) AND route_key IN (
  'yellowing_fertilization_area_route',
  'yellowing_airflow_humidity_route',
  'yellowing_low_fertilizer_iron_route',
  'yellowing_low_fertilizer_nitrogen_route',
  'yellowing_low_fertilizer_nutrient_route',
  'yellowing_heavy_fertilizer_repot_route',
  'yellowing_fertilization_unknown_route',
  'yellowing_airflow_leaf_spot_route',
  'yellowing_airflow_root_stress_route',
  'yellowing_airflow_humidity_stress_route',
  'yellowing_airflow_unknown_route'
);

INSERT INTO outcome_answer_effects (
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
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilization_area', 'iron_deficiency', 'yellowing_low_fertilizer_iron_route', 'support', 0.3500, '', 'fertilization_context', '施肥/换盆分流进入缺铁/新叶黄化判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilization_area', 'nitrogen_deficiency', 'yellowing_low_fertilizer_nitrogen_route', 'support', 0.3500, '', 'fertilization_context', '施肥/换盆分流进入缺氮/老叶黄化判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilization_area', 'nutrient_deficiency', 'yellowing_low_fertilizer_nutrient_route', 'support', 0.3500, '', 'fertilization_context', '施肥/换盆分流进入营养供给判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilization_area', 'fertilizer_repot_stress', 'yellowing_heavy_fertilizer_repot_route', 'support', 0.3500, '', 'fertilization_context', '施肥/换盆分流进入重肥或换盆应激判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilization_area', 'uncertain_observation', 'yellowing_fertilization_unknown_route', 'support', 0.2000, '', 'fertilization_context', '施肥背景不明确时保守观察。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__fertilization_growth_context', 'low_or_no_fertilizer', 'iron_deficiency', 'yellowing_low_fertilizer_iron_route', 'support', 1.0000, '', 'fertilization_growth_context', '长期施肥不足叠加新叶/脉间黄化，支持缺铁/营养吸收方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__fertilization_growth_context', 'low_or_no_fertilizer', 'nitrogen_deficiency', 'yellowing_low_fertilizer_nitrogen_route', 'support', 1.0000, '', 'fertilization_growth_context', '长期施肥不足叠加老叶/均匀黄化，支持缺氮方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__fertilization_growth_context', 'low_or_no_fertilizer', 'nutrient_deficiency', 'yellowing_low_fertilizer_nutrient_route', 'support', 1.0000, '', 'fertilization_growth_context', '长期施肥不足，支持营养供给偏弱方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__fertilization_growth_context', 'normal_light_fertilizer', 'nutrient_deficiency', 'yellowing_low_fertilizer_nutrient_route', 'weaken', 0.5000, '', 'fertilization_growth_context', '施肥接近常规范围，削弱营养不足路径。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__fertilization_growth_context', 'recent_heavy_fertilizer_or_repot', 'fertilizer_repot_stress', 'yellowing_heavy_fertilizer_repot_route', 'support', 1.0000, '', 'fertilization_growth_context', '近期重肥、频繁施肥或换盆换土，支持施肥/换盆应激方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__fertilization_growth_context', 'unknown', 'uncertain_observation', 'yellowing_fertilization_unknown_route', 'support', 0.5000, '', 'fertilization_growth_context', '施肥信息不明确，保留不确定输出。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'leaf_spot_problem', 'yellowing_airflow_leaf_spot_route', 'support', 0.3500, '', 'airflow_humidity_context', '通风/湿度分流进入叶斑扩散判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'root_stress', 'yellowing_airflow_root_stress_route', 'support', 0.3500, '', 'airflow_humidity_context', '通风/湿度分流进入根部环境压力判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'humidity_airflow_stress', 'yellowing_airflow_humidity_stress_route', 'support', 0.3500, '', 'airflow_humidity_context', '通风/湿度分流进入环境压力判断。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_area', 'uncertain_observation', 'yellowing_airflow_unknown_route', 'support', 0.2000, '', 'airflow_humidity_context', '通风/湿度背景不明确时保守观察。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'rapid_spreading', 'leaf_spot_problem', 'yellowing_airflow_leaf_spot_route', 'support', 1.0000, '', 'yellowing_progression_speed', '黄叶快速扩散，支持叶斑类或潮湿扩散方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'slow_stable', 'humidity_airflow_stress', 'yellowing_airflow_humidity_stress_route', 'support', 1.0000, '', 'yellowing_progression_speed', '黄叶变化缓慢，支持通风/湿度环境压力方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'with_wilting_or_drop', 'root_stress', 'yellowing_airflow_root_stress_route', 'support', 1.0000, '', 'yellowing_progression_speed', '伴随萎蔫或掉叶，支持根部环境压力方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_progression_speed', 'unknown', 'uncertain_observation', 'yellowing_airflow_unknown_route', 'support', 0.5000, '', 'yellowing_progression_speed', '进展未明确，保留不确定输出。', 1, 'audited', 'active');

UPDATE outcome_route_gates
SET blocker_evidence_json = CASE route_key
  WHEN 'yellowing_wet_soil_route' THEN JSON_OBJECT('anyQuestionOptionPairs', JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area'
  ))
  WHEN 'yellowing_dry_soil_route' THEN JSON_OBJECT('anyQuestionOptionPairs', JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area'
  ))
  WHEN 'yellowing_low_light_route' THEN JSON_OBJECT('anyQuestionOptionPairs', JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area'
  ))
  WHEN 'yellowing_sunburn_route' THEN JSON_OBJECT('anyQuestionOptionPairs', JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__light_change_context:weaker_light',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area'
  ))
  WHEN 'yellowing_old_leaf_route' THEN JSON_OBJECT('anyQuestionOptionPairs', JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:new_leaves_first',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilization_area',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_area'
  ))
  ELSE blocker_evidence_json
END
WHERE route_key IN (
  'yellowing_wet_soil_route',
  'yellowing_dry_soil_route',
  'yellowing_low_light_route',
  'yellowing_sunburn_route',
  'yellowing_old_leaf_route'
);
