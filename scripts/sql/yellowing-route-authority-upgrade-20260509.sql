REPLACE INTO outcome_route_groups (
  route_group_key,
  route_group_name_cn,
  entry_scene_cn,
  entry_symptom_keys_json,
  candidate_outcome_keys_json,
  default_split_question_key,
  max_visible_outcomes,
  visible_question_purpose_cn,
  enabled,
  review_status,
  data_status
) VALUES
  ('yellowing_care_split_group', '黄叶养护分流组', '叶片发黄时优先区分积水、缺水、自然老叶和光照偏弱/偏强。', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('overwatering_root_pressure', 'underwatering', 'normal_leaf_aging', 'low_light_growth_weakness', 'sunburn'), 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 3, '优先区分浇水、光照与自然老叶代谢。', 1, 'audited', 'active');

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
  ('yellowing_wet_soil_route', 'yellowing_care_split_group', 'overwatering_root_pressure', '黄叶 + 浇水偏勤/盆土久湿路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 95, 3, 'uncertain', 'action_overwatering_basic', 'watering_stop', 1, 'audited', 'active'),
  ('yellowing_dry_soil_route', 'yellowing_care_split_group', 'underwatering', '黄叶 + 浇水偏少/盆土偏干路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 92, 3, 'uncertain', 'action_underwatering_basic', 'watering_add', 1, 'audited', 'active'),
  ('yellowing_old_leaf_route', 'yellowing_care_split_group', 'normal_leaf_aging', '黄叶 + 底部老叶自然代谢路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 84, 2, 'uncertain', 'action_non_problematic_observe', 'observe_only', 1, 'audited', 'active'),
  ('yellowing_low_light_route', 'yellowing_care_split_group', 'low_light_growth_weakness', '黄叶 + 光照偏弱路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 83, 3, 'uncertain', 'action_low_light_basic', 'increase_light', 1, 'audited', 'active'),
  ('yellowing_sunburn_route', 'yellowing_care_split_group', 'sunburn', '黄叶 + 近期强光/暴晒路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 82, 3, 'uncertain', 'action_sunburn_basic', 'avoid_sun', 1, 'audited', 'active');

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
  ('wet_soil_confirmation_gate', 'yellowing_wet_soil_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate:care_context', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area', 'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'), 'routeKeys', JSON_ARRAY('yellowing_wet_soil_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry')), JSON_ARRAY('underwatering'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'wet_soil_confirmed', '黄叶进入浇水分流且背景长期偏湿，支持积水/根系压力。', 95, 1, 'audited', 'active'),
  ('dry_soil_confirmation_gate', 'yellowing_dry_soil_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate:care_context', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area', 'q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry'), 'routeKeys', JSON_ARRAY('yellowing_dry_soil_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet')), JSON_ARRAY('overwatering_root_pressure'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'dry_soil_confirmed', '黄叶进入浇水分流且背景长期偏干，支持缺水压力。', 95, 1, 'audited', 'active'),
  ('old_leaf_aging_gate', 'yellowing_old_leaf_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:old_lower_leaves_first'), 'routeKeys', JSON_ARRAY('yellowing_old_leaf_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate:care_context', 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:new_leaves_first')), JSON_ARRAY(), 'probable', 'display_outcome', 'uncertain', 'uncertain', 'old_leaf_aging_confirmed', '主要是老叶或下位叶先黄，更符合自然代谢。', 84, 1, 'audited', 'active'),
  ('yellowing_low_light_gate', 'yellowing_low_light_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate:care_context', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area', 'q_observed_probe__leaf_yellowing__light_change_context:weaker_light'), 'routeKeys', JSON_ARRAY('yellowing_low_light_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light')), JSON_ARRAY(), 'probable', 'display_outcome', 'uncertain', 'uncertain', 'yellowing_low_light_confirmed', '黄叶进入光照分流且近期明显更阴，更符合光照不足/生长偏弱。', 83, 1, 'audited', 'active'),
  ('yellowing_sunburn_gate', 'yellowing_sunburn_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate:care_context', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area', 'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'), 'routeKeys', JSON_ARRAY('yellowing_sunburn_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__light_change_context:weaker_light')), JSON_ARRAY(), 'probable', 'display_outcome', 'uncertain', 'uncertain', 'yellowing_sunburn_confirmed', '黄叶进入光照分流且近期直射明显增强，更符合晒伤/强光刺激。', 82, 1, 'audited', 'active');

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
  ('yellowing_wet_soil_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'wet_soil_confirmation_gate', 'critical_split', 1, 260, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_wet_soil_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'wet_soil_confirmation_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_wet_soil_route', 3, 'q_observed_probe__leaf_yellowing__watering_frequency_context', 'wet_soil_confirmation_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_dry_soil_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'dry_soil_confirmation_gate', 'critical_split', 1, 260, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_dry_soil_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'dry_soil_confirmation_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_dry_soil_route', 3, 'q_observed_probe__leaf_yellowing__watering_frequency_context', 'dry_soil_confirmation_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_old_leaf_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'old_leaf_aging_gate', 'critical_split', 0, 260, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_old_leaf_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'old_leaf_aging_gate', 'critical_split', 1, 230, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_light_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'yellowing_low_light_gate', 'critical_split', 1, 260, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_light_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'yellowing_low_light_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_light_route', 3, 'q_observed_probe__leaf_yellowing__light_change_context', 'yellowing_low_light_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_sunburn_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'yellowing_sunburn_gate', 'critical_split', 1, 260, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_sunburn_route', 2, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'yellowing_sunburn_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_sunburn_route', 3, 'q_observed_probe__leaf_yellowing__light_change_context', 'yellowing_sunburn_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active');

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
  ('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'care_context', 'overwatering_root_pressure', 'yellowing_wet_soil_route', 'support', 0.2500, '', 'yellowing_primary_gate', '黄叶首层进入养护方向，为积水路径提供入口。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'care_context', 'underwatering', 'yellowing_dry_soil_route', 'support', 0.2500, '', 'yellowing_primary_gate', '黄叶首层进入养护方向，为缺水路径提供入口。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'care_context', 'low_light_growth_weakness', 'yellowing_low_light_route', 'support', 0.2500, '', 'yellowing_primary_gate', '黄叶首层进入养护方向，为弱光路径提供入口。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate', 'care_context', 'sunburn', 'yellowing_sunburn_route', 'support', 0.2500, '', 'yellowing_primary_gate', '黄叶首层进入养护方向，为强光路径提供入口。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_area', 'overwatering_root_pressure', 'yellowing_wet_soil_route', 'support', 0.3500, '', 'care_area_gate', '养护分流进入浇水方向，继续判断是否过湿。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'watering_area', 'underwatering', 'yellowing_dry_soil_route', 'support', 0.3500, '', 'care_area_gate', '养护分流进入浇水方向，继续判断是否缺水。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_area', 'low_light_growth_weakness', 'yellowing_low_light_route', 'support', 0.3500, '', 'care_area_gate', '养护分流进入光照方向，继续判断是否弱光。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'light_area', 'sunburn', 'yellowing_sunburn_route', 'support', 0.3500, '', 'care_area_gate', '养护分流进入光照方向，继续判断是否强光刺激。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__watering_frequency_context', 'often_wet', 'overwatering_root_pressure', 'yellowing_wet_soil_route', 'support', 1.0000, '', 'soil_moisture', '浇水偏勤或盆土长期偏湿，支持积水/根系压力。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__watering_frequency_context', 'often_dry', 'underwatering', 'yellowing_dry_soil_route', 'support', 1.0000, '', 'soil_moisture', '浇水偏少或盆土长期偏干，支持缺水压力。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__watering_frequency_context', 'normal_or_stable', 'overwatering_root_pressure', 'yellowing_wet_soil_route', 'weaken', 0.6000, '', 'soil_moisture', '浇水接近参考范围，削弱过湿路径。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__watering_frequency_context', 'normal_or_stable', 'underwatering', 'yellowing_dry_soil_route', 'weaken', 0.6000, '', 'soil_moisture', '浇水接近参考范围，削弱缺水路径。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__light_change_context', 'weaker_light', 'low_light_growth_weakness', 'yellowing_low_light_route', 'support', 1.0000, '', 'light_context', '近期明显更阴或直射不足，支持弱光/生长偏弱。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__light_change_context', 'stronger_direct_light', 'sunburn', 'yellowing_sunburn_route', 'support', 1.0000, '', 'light_context', '近期直射明显增强或暴晒更多，支持晒伤/强光刺激。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'old_lower_leaves_first', 'normal_leaf_aging', 'yellowing_old_leaf_route', 'support', 1.0000, '', 'leaf_age_pattern', '老叶或下位叶先黄，更符合自然代谢。', 1, 'audited', 'active'),
  ('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'new_leaves_first', 'normal_leaf_aging', 'yellowing_old_leaf_route', 'exclude', 1.0000, '', 'leaf_age_pattern', '新叶先黄，不支持自然老叶代谢路径。', 1, 'audited', 'active');
