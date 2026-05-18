-- 黄叶模式前置问诊选项。
-- 目标：
-- 1. 黄叶模式不再先问“浇水可能不合适/光照变化明显”等原因类 gate。
-- 2. 直接让用户选择可观察的近期事实，问题与 options 仍全部来自 SQL。
-- 3. route gate 保留精确 question:option 闭合，不放宽 evaluator。

UPDATE question_library_v5_real
SET
  question_text_cn = '最近 2 周，哪项实际变化最接近这盆植物？',
  question_text_user_cn = '最近 2 周，哪项实际变化最接近这盆植物？',
  help_text_cn = '不用先判断黄叶原因，只选最接近的事实；系统会结合黄叶位置、分布和视觉证据继续判断。',
  default_option_key = '',
  updated_at = NOW()
WHERE question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate';

INSERT INTO question_option_mapping_v5_real (
  question_key, option_key, option_text_cn, maps_to_symptom_key, value,
  association_strength, data_status, data_source, note, option_text_user_cn,
  answer_effect_cn, option_description_user_cn, display_order, is_default,
  source_type, source_batch_id, version_tag, review_status, review_note,
  is_active, created_at, updated_at, published_at, published_batch_id
) VALUES
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_often_wet', '每 1-2 天浇一次，或土没干就浇', '', 0, 0, 'audited', 'manual', 'frontloaded watering wet context', '每 1-2 天浇一次，或土没干就浇', '记录黄叶浇水偏湿背景。', '', 10, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_often_dry', '近 2 周 0-1 次，或经常干透很久才浇', '', 0, 0, 'audited', 'manual', 'frontloaded watering dry context', '近 2 周 0-1 次，或经常干透很久才浇', '记录黄叶浇水偏干背景。', '', 20, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_stable', '每周 1-2 次，基本等土表干了再浇', '', 0, 0, 'audited', 'manual', 'frontloaded watering stable context', '每周 1-2 次，基本等土表干了再浇', '记录黄叶浇水节奏稳定背景。', '', 30, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_stronger', '全日光，或每天直射 3 小时以上', '', 0, 0, 'audited', 'manual', 'frontloaded strong light context', '全日光，或每天直射 3 小时以上', '记录黄叶强光背景。', '', 40, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_weaker', '全阴、离窗较远，或最近更暗', '', 0, 0, 'audited', 'manual', 'frontloaded weak light context', '全阴、离窗较远，或最近更暗', '记录黄叶弱光背景。', '', 50, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_stable_scattered', '散光为主，最近位置基本没变', '', 0, 0, 'audited', 'manual', 'frontloaded stable scattered light context', '散光为主，最近位置基本没变', '记录黄叶光照稳定背景。', '', 60, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilizer_low_or_none', '近 1 个月 0 次，或已经很久没补肥', '', 0, 0, 'audited', 'manual', 'frontloaded low fertilizer context', '近 1 个月 0 次，或已经很久没补肥', '记录黄叶长期少肥背景。', '', 70, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilizer_heavy_or_repot', '近 1 个月 2 次以上、重肥，或刚换盆/换土', '', 0, 0, 'audited', 'manual', 'frontloaded heavy fertilizer or repot context', '近 1 个月 2 次以上、重肥，或刚换盆/换土', '记录黄叶重肥或换盆背景。', '', 80, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_slow_stable', '远离窗户、通风偏弱，黄叶变化较慢', '', 0, 0, 'audited', 'manual', 'frontloaded airflow humidity slow context', '远离窗户、通风偏弱，黄叶变化较慢', '记录黄叶通风湿度环境压力背景。', '', 90, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_wilting_drop', '更闷或更潮，同时有萎蔫、掉叶或软塌', '', 0, 0, 'audited', 'manual', 'frontloaded airflow humidity root stress context', '更闷或更潮，同时有萎蔫、掉叶或软塌', '记录黄叶伴随根部环境压力背景。', '', 100, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_rapid_spreading', '更闷或更潮，几天到一两周内明显变多', '', 0, 0, 'audited', 'manual', 'frontloaded airflow humidity rapid context', '更闷或更潮，几天到一两周内明显变多', '记录黄叶快速扩散背景。', '', 110, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'unknown', '说不清 / 没留意', '', 0, 0, 'audited', 'manual', 'frontloaded unknown context', '说不清 / 没留意', '回到黄叶位置和分布继续排查。', '', 120, 0, 'manual', 'yellowing_frontload_followup_options_20260515', 'v20260515_yellowing_frontload', 'audited', '黄叶前置事实选项。', 1, NOW(), NOW(), NOW(), 'yellowing_frontload_followup_options_20260515')
ON DUPLICATE KEY UPDATE
  option_text_cn = VALUES(option_text_cn),
  option_text_user_cn = VALUES(option_text_user_cn),
  answer_effect_cn = VALUES(answer_effect_cn),
  option_description_user_cn = VALUES(option_description_user_cn),
  display_order = VALUES(display_order),
  is_default = VALUES(is_default),
  data_status = VALUES(data_status),
  review_status = VALUES(review_status),
  is_active = 1,
  updated_at = NOW(),
  published_at = NOW(),
  published_batch_id = VALUES(published_batch_id);

UPDATE question_option_mapping_v5_real
SET is_active = 0, updated_at = NOW()
WHERE question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate'
  AND option_key IN ('watering_area', 'light_area', 'fertilization_area', 'airflow_humidity_area');

UPDATE outcome_route_questions
SET enabled = 0, updated_at = NOW()
WHERE route_key IN (
  'yellowing_wet_soil_route',
  'yellowing_dry_soil_route',
  'yellowing_low_light_route',
  'yellowing_sunburn_route',
  'yellowing_low_fertilizer_iron_route',
  'yellowing_low_fertilizer_nitrogen_route',
  'yellowing_low_fertilizer_nutrient_route',
  'yellowing_heavy_fertilizer_repot_route',
  'yellowing_fertilization_unknown_route',
  'yellowing_airflow_leaf_spot_route',
  'yellowing_airflow_root_stress_route',
  'yellowing_airflow_humidity_stress_route',
  'yellowing_airflow_unknown_route'
)
  AND question_key IN (
    'q_observed_probe__leaf_yellowing__watering_frequency_context',
    'q_observed_probe__leaf_yellowing__light_change_context',
    'q_observed_probe__leaf_yellowing__fertilization_growth_context',
    'q_observed_probe__leaf_yellowing__yellowing_progression_speed'
  );

UPDATE outcome_route_gates
SET required_answer_effects_json = CASE gate_key
  WHEN 'wet_soil_confirmation_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_often_wet'), 'routeKeys', JSON_ARRAY('yellowing_wet_soil_route'))
  WHEN 'dry_soil_confirmation_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_often_dry'), 'routeKeys', JSON_ARRAY('yellowing_dry_soil_route'))
  WHEN 'yellowing_low_light_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_weaker'), 'routeKeys', JSON_ARRAY('yellowing_low_light_route'))
  WHEN 'yellowing_sunburn_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_stronger'), 'routeKeys', JSON_ARRAY('yellowing_sunburn_route'))
  WHEN 'low_fertilizer_iron_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilizer_low_or_none'), 'routeKeys', JSON_ARRAY('yellowing_low_fertilizer_iron_route'))
  WHEN 'low_fertilizer_nitrogen_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilizer_low_or_none'), 'routeKeys', JSON_ARRAY('yellowing_low_fertilizer_nitrogen_route'))
  WHEN 'low_fertilizer_nutrient_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilizer_low_or_none'), 'routeKeys', JSON_ARRAY('yellowing_low_fertilizer_nutrient_route'))
  WHEN 'heavy_fertilizer_repot_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:fertilizer_heavy_or_repot'), 'routeKeys', JSON_ARRAY('yellowing_heavy_fertilizer_repot_route'))
  WHEN 'airflow_leaf_spot_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_rapid_spreading'), 'routeKeys', JSON_ARRAY('yellowing_airflow_leaf_spot_route'))
  WHEN 'airflow_root_stress_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_wilting_drop'), 'routeKeys', JSON_ARRAY('yellowing_airflow_root_stress_route'))
  WHEN 'airflow_humidity_stress_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_slow_stable'), 'routeKeys', JSON_ARRAY('yellowing_airflow_humidity_stress_route'))
  WHEN 'airflow_unknown_gate' THEN JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:unknown'), 'routeKeys', JSON_ARRAY('yellowing_airflow_unknown_route'))
  ELSE required_answer_effects_json
END,
updated_at = NOW()
WHERE gate_key IN (
  'wet_soil_confirmation_gate',
  'dry_soil_confirmation_gate',
  'yellowing_low_light_gate',
  'yellowing_sunburn_gate',
  'low_fertilizer_iron_gate',
  'low_fertilizer_nitrogen_gate',
  'low_fertilizer_nutrient_gate',
  'heavy_fertilizer_repot_gate',
  'airflow_leaf_spot_gate',
  'airflow_root_stress_gate',
  'airflow_humidity_stress_gate',
  'airflow_unknown_gate'
);

INSERT INTO outcome_answer_effects (
  question_key, option_key, outcome_key, route_key, effect_type, effect_strength,
  redirect_outcome_key, evidence_dimension, effect_note_cn, enabled, review_status, data_status
) VALUES
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_often_wet', 'overwatering_root_pressure', 'yellowing_wet_soil_route', 'support', 1.0000, '', 'soil_moisture', '浇水偏勤或盆土长期偏湿，支持积水/根系压力。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_often_dry', 'underwatering', 'yellowing_dry_soil_route', 'support', 1.0000, '', 'soil_moisture', '浇水偏少或盆土长期偏干，支持缺水压力。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_stable', 'overwatering_root_pressure', 'yellowing_wet_soil_route', 'weaken', 0.6000, '', 'soil_moisture', '浇水节奏稳定，削弱过湿路径。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_stable', 'underwatering', 'yellowing_dry_soil_route', 'weaken', 0.6000, '', 'soil_moisture', '浇水节奏稳定，削弱缺水路径。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_weaker', 'low_light_growth_weakness', 'yellowing_low_light_route', 'support', 1.0000, '', 'light_context', '近期明显更阴或离窗较远，支持弱光/生长偏弱。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_stronger', 'sunburn', 'yellowing_sunburn_route', 'support', 1.0000, '', 'light_context', '近期全日光或直射明显增强，支持晒伤/强光刺激。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_stable_scattered', 'low_light_growth_weakness', 'yellowing_low_light_route', 'weaken', 0.5000, '', 'light_context', '散光且位置稳定，削弱光照突变路径。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilizer_low_or_none', 'iron_deficiency', 'yellowing_low_fertilizer_iron_route', 'support', 1.0000, '', 'fertilization_context', '长期少肥，结合新叶或脉间黄化时支持营养吸收方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilizer_low_or_none', 'nitrogen_deficiency', 'yellowing_low_fertilizer_nitrogen_route', 'support', 1.0000, '', 'fertilization_context', '长期少肥，结合老叶或均匀黄化时支持缺氮方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilizer_low_or_none', 'nutrient_deficiency', 'yellowing_low_fertilizer_nutrient_route', 'support', 1.0000, '', 'fertilization_context', '长期少肥，支持营养供给偏弱方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'fertilizer_heavy_or_repot', 'fertilizer_repot_stress', 'yellowing_heavy_fertilizer_repot_route', 'support', 1.0000, '', 'fertilization_context', '近期重肥或换盆换土，支持施肥/换盆应激方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_slow_stable', 'humidity_airflow_stress', 'yellowing_airflow_humidity_stress_route', 'support', 1.0000, '', 'airflow_humidity_context', '通风偏弱且黄叶慢性变化，支持通风/湿度环境压力。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_wilting_drop', 'root_stress', 'yellowing_airflow_root_stress_route', 'support', 1.0000, '', 'airflow_humidity_context', '闷湿伴随萎蔫或掉叶，支持根部环境压力。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_rapid_spreading', 'humidity_airflow_stress', 'yellowing_airflow_humidity_stress_route', 'support', 1.0000, '', 'airflow_humidity_context', '闷湿且黄叶快速变多，至少支持通风/湿度环境压力，避免直接落不确定。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'airflow_humidity_rapid_spreading', 'leaf_spot_problem', 'yellowing_airflow_leaf_spot_route', 'support', 1.0000, '', 'airflow_humidity_context', '闷湿且黄叶快速扩散，结合斑点证据时支持叶斑方向。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'unknown', 'uncertain_observation', 'yellowing_airflow_unknown_route', 'support', 0.5000, '', 'yellowing_context_unknown', '黄叶背景不明确，保留不确定并继续观察。', 1, 'audited', 'active')
ON DUPLICATE KEY UPDATE
  outcome_key = VALUES(outcome_key),
  route_key = VALUES(route_key),
  effect_type = VALUES(effect_type),
  effect_strength = VALUES(effect_strength),
  evidence_dimension = VALUES(evidence_dimension),
  effect_note_cn = VALUES(effect_note_cn),
  enabled = VALUES(enabled),
  review_status = VALUES(review_status),
  data_status = VALUES(data_status);

UPDATE outcome_route_gates
SET required_answer_effects_json = JSON_OBJECT(
  'anyQuestionOptionPairs',
  JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_slow_stable',
    'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:airflow_humidity_rapid_spreading'
  ),
  'routeKeys',
  JSON_ARRAY('yellowing_airflow_humidity_stress_route')
)
WHERE route_key = 'yellowing_airflow_humidity_stress_route'
  AND gate_key = 'airflow_humidity_stress_gate';
