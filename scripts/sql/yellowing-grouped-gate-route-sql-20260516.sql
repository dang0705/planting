-- 黄叶 gate 分组问诊修正：一页一组 gate.options，完成必要分组后再由 route/gate/outcome 收敛。
-- 目标：
-- 1. 停用旧 yellowing_care_area_gate 作为 route 闭合依赖。
-- 2. route gate 直接依赖对应分组问题的 option。
-- 3. 停用旧 care-area / primary-clue 对 outcome_answer_effects 的 ranking/effect 输入。

UPDATE outcome_route_questions
SET enabled = 0,
    data_status = 'inactive',
    updated_at = NOW()
WHERE route_key LIKE 'yellowing_%'
  AND question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate';

UPDATE outcome_route_gates
SET required_answer_effects_json = CASE route_key
  WHEN 'yellowing_wet_soil_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'),
    'routeKeys',
    JSON_ARRAY('yellowing_wet_soil_route')
  )
  WHEN 'yellowing_dry_soil_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry'),
    'routeKeys',
    JSON_ARRAY('yellowing_dry_soil_route')
  )
  WHEN 'yellowing_low_light_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__light_change_context:weaker_light'),
    'routeKeys',
    JSON_ARRAY('yellowing_low_light_route')
  )
  WHEN 'yellowing_sunburn_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'),
    'routeKeys',
    JSON_ARRAY('yellowing_sunburn_route')
  )
  WHEN 'yellowing_low_fertilizer_iron_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__fertilization_growth_context:low_or_no_fertilizer'),
    'routeKeys',
    JSON_ARRAY('yellowing_low_fertilizer_iron_route')
  )
  WHEN 'yellowing_low_fertilizer_nitrogen_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__fertilization_growth_context:low_or_no_fertilizer'),
    'routeKeys',
    JSON_ARRAY('yellowing_low_fertilizer_nitrogen_route')
  )
  WHEN 'yellowing_low_fertilizer_nutrient_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__fertilization_growth_context:low_or_no_fertilizer'),
    'routeKeys',
    JSON_ARRAY('yellowing_low_fertilizer_nutrient_route')
  )
  WHEN 'yellowing_heavy_fertilizer_repot_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__fertilization_growth_context:recent_heavy_fertilizer_or_repot'),
    'routeKeys',
    JSON_ARRAY('yellowing_heavy_fertilizer_repot_route')
  )
  WHEN 'yellowing_fertilization_unknown_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__fertilization_growth_context:unknown'),
    'routeKeys',
    JSON_ARRAY('yellowing_fertilization_unknown_route')
  )
  WHEN 'yellowing_airflow_leaf_spot_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_progression_speed:rapid_spreading'),
    'routeKeys',
    JSON_ARRAY('yellowing_airflow_leaf_spot_route')
  )
  WHEN 'yellowing_airflow_root_stress_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_progression_speed:with_wilting_or_drop'),
    'routeKeys',
    JSON_ARRAY('yellowing_airflow_root_stress_route')
  )
  WHEN 'yellowing_airflow_humidity_stress_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_progression_speed:slow_stable'),
    'routeKeys',
    JSON_ARRAY('yellowing_airflow_humidity_stress_route')
  )
  WHEN 'yellowing_airflow_unknown_route' THEN JSON_OBJECT(
    'questionOptionPairs',
    JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_progression_speed:unknown'),
    'routeKeys',
    JSON_ARRAY('yellowing_airflow_unknown_route')
  )
  ELSE required_answer_effects_json
END,
updated_at = NOW()
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
);

UPDATE outcome_answer_effects
SET enabled = 0,
    data_status = 'inactive',
    updated_at = NOW()
WHERE question_key IN (
  'q_observed_probe__leaf_yellowing__yellowing_care_area_gate',
  'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate'
);

UPDATE question_option_mapping_v5_real
SET is_active = 0,
    data_status = 'inactive',
    updated_at = NOW()
WHERE question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate';

UPDATE question_library_v5_real
SET is_active = 0,
    data_status = 'inactive',
    updated_at = NOW()
WHERE question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate';
