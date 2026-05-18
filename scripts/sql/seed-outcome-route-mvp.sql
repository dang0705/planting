-- 说明：
-- 1. 本文件提供 route-planning MVP 的最小 seed，仅写入本地/测试环境时使用。
-- 2. 导入前应先执行 scripts/sql/ensure-outcome-route-tables.sql。
-- 3. 其中 question_key 需与当前 question_library_v5_real / question_option_mapping_v5_real 做最终核对后再执行到共享环境。

DELETE FROM outcome_answer_effects
WHERE question_key = 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate';

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
  ('overwatering_root_pressure', 'overwatering_root_pressure', '积水/根系压力', 'problem_cluster', 'water', '积水/根系压力', '当前更像盆土长期偏湿或根系承压。', 'action_overwatering_basic', 'medium', 1, 0, 1, 1, 100, 'audited', 'active'),
  ('underwatering', 'underwatering', '缺水压力', 'problem_cluster', 'water', '缺水压力', '当前更像盆土长期偏干或供水不足。', 'action_underwatering_basic', 'medium', 1, 0, 1, 1, 95, 'audited', 'active'),
  ('low_light_growth_weakness', 'low_light_growth_weakness', '光照不足/生长偏弱', 'care_cluster', 'light', '光照不足/生长偏弱', '当前更像长期光照不足引起的徒长与偏弱。', 'action_low_light_basic', 'low', 1, 0, 1, 1, 85, 'audited', 'active'),
  ('sunburn', 'sunburn', '晒伤/强光刺激', 'problem_cluster', 'light', '晒伤/强光刺激', '当前更像暴晒或强光刺激后的组织灼伤。', 'action_sunburn_basic', 'medium', 1, 0, 1, 1, 88, 'audited', 'active'),
  ('dry_air_stress', 'dry_air_stress', '叶尖焦枯/环境压力', 'care_cluster', 'environment', '叶尖焦枯/环境压力', '当前更像空气偏干或空调直吹造成的环境压力。', 'action_dry_air_basic', 'low', 1, 0, 1, 1, 78, 'audited', 'active'),
  ('leaf_spot_problem', 'leaf_spot_problem', '叶斑类问题', 'problem_cluster', 'leaf_spot', '叶斑类问题', '当前更像在潮湿、通风差条件下扩散的叶斑方向。', 'action_leaf_spot_basic', 'medium', 1, 0, 1, 1, 90, 'audited', 'active'),
  ('structural_damage_old_injury', 'structural_damage_old_injury', '结构损伤/旧伤', 'care_cluster', 'structural', '结构损伤/旧伤', '当前更像旧伤或机械结构损伤，不是继续扩散的问题。', 'action_old_injury_basic', 'low', 1, 0, 1, 1, 70, 'audited', 'active'),
  ('chewing_pest_damage', 'chewing_pest_damage', '疑似虫害痕迹', 'problem_cluster', 'pest', '疑似虫害痕迹', '当前更像咀嚼型虫害留下的取食痕迹。', 'action_chewing_pest_basic', 'medium', 1, 0, 1, 1, 92, 'audited', 'active'),
  ('normal_leaf_aging', 'normal_leaf_aging', '自然代谢', 'non_problematic', 'non_problematic', '自然代谢', '底部老叶逐步退出，更符合自然代谢。', 'action_non_problematic_observe', 'low', 1, 0, 1, 1, 60, 'audited', 'active'),
  ('stable_natural_marking', 'stable_natural_marking', '艺斑/正常斑纹', 'non_problematic', 'non_problematic', '艺斑/正常斑纹', '斑纹长期稳定，更符合正常品种纹路。', 'action_non_problematic_observe', 'low', 1, 0, 1, 1, 58, 'audited', 'active'),
  ('uncertain_observation', 'uncertain_observation', '暂不能稳定判断', 'uncertain', 'uncertain', '暂不能稳定判断', '当前证据仍不足以安全闭合到具体方向。', 'action_uncertain_prepare', 'low', 1, 0, 0, 1, 40, 'audited', 'active');

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
  ('action_overwatering_basic', '先停水并改善通风', JSON_ARRAY('先暂停浇水', '检查盆底是否积水', '改善根区通风'), JSON_ARRAY('3 天内观察盆土是否逐步变干'), JSON_ARRAY('记录新叶和茎基部是否继续变软'), JSON_ARRAY('不要在盆土久湿时继续加大浇水'), JSON_ARRAY('若茎基部继续发软或异味明显，补拍根茎并升级处理'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_underwatering_basic', '先补充水分并恢复节律', JSON_ARRAY('按盆土干湿补一次透水', '恢复稳定浇水节律'), JSON_ARRAY('观察叶片能否回弹', '观察盆土干湿恢复速度'), JSON_ARRAY('记录新叶是否恢复挺立'), JSON_ARRAY('不要连续少量频繁补水又很快断水'), JSON_ARRAY('若补水后仍持续萎蔫，补拍根区和盆土状态'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_low_light_basic', '先补光并维持稳定', JSON_ARRAY('把植株移到更稳定明亮散射光处'), JSON_ARRAY('3 天内观察新叶节间是否继续拉长'), JSON_ARRAY('7 天内观察整体株型是否稳定'), JSON_ARRAY('不要突然暴晒或一次性大幅施肥'), JSON_ARRAY('若徒长继续加重，补拍整株与摆放环境'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_sunburn_basic', '先避开暴晒', JSON_ARRAY('先移离正午直射光', '保持通风稳定'), JSON_ARRAY('3 天内观察灼伤边界是否继续扩大'), JSON_ARRAY('7 天内观察新叶是否恢复正常'), JSON_ARRAY('不要马上重肥或重药'), JSON_ARRAY('若灼伤持续扩大，补拍叶面与摆放位置'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_dry_air_basic', '先提高环境湿度稳定性', JSON_ARRAY('远离空调直吹', '提高环境湿度稳定性'), JSON_ARRAY('3 天内观察焦边是否停止扩大'), JSON_ARRAY('7 天内观察新叶边缘状态'), JSON_ARRAY('不要立刻重浇或重肥'), JSON_ARRAY('若新叶持续焦边，补拍整株与环境位置'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_leaf_spot_basic', '先降潮并提高通风', JSON_ARRAY('先减少叶面长期潮湿', '改善通风'), JSON_ARRAY('3 天内观察斑点是否继续扩散'), JSON_ARRAY('7 天内记录新斑点是否出现'), JSON_ARRAY('不要继续频繁喷水到叶面'), JSON_ARRAY('若扩散加快，补拍正反叶面并升级判断'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_old_injury_basic', '以观察为主', JSON_ARRAY('先保持养护稳定'), JSON_ARRAY('3 天内观察是否继续扩大'), JSON_ARRAY('7 天内确认无新增缺损'), JSON_ARRAY('不要把旧伤直接当虫害反复处理'), JSON_ARRAY('若新增孔洞继续出现，再补拍复核'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_chewing_pest_basic', '先排查虫害', JSON_ARRAY('检查叶背、叶柄和盆边是否有虫体或虫粪'), JSON_ARRAY('3 天内复查新孔洞是否继续出现'), JSON_ARRAY('7 天内记录取食痕迹变化'), JSON_ARRAY('不要在未确认前混用多种药剂'), JSON_ARRAY('若虫体明显或继续加重，补拍虫体特写并升级处理'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_non_problematic_observe', '先继续观察', JSON_ARRAY('保持当前养护稳定'), JSON_ARRAY('3 天内继续观察是否有新异常'), JSON_ARRAY('7 天内对比新叶和整体状态'), JSON_ARRAY('不要因为单次轻微信号就大幅调整养护'), JSON_ARRAY('若出现新增异常，再补拍复核'), 'respect_genus_care_profile', 'audited', 'active'),
  ('action_uncertain_prepare', '先补充信息', JSON_ARRAY('先保持养护稳定', '补拍整株、叶背、盆土和环境位置'), JSON_ARRAY('3 天内整理浇水、光照、通风背景'), JSON_ARRAY('7 天内观察异常是否扩大或重复出现'), JSON_ARRAY('不要在证据不足时大幅浇水、施肥或用药'), JSON_ARRAY('若出现明显加重，优先升级人工复核'), 'respect_genus_care_profile', 'audited', 'active');

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
  ('yellowing_care_split_group', '黄叶养护分流组', '叶片发黄时优先区分积水、缺水、自然老叶和光照偏弱/偏强。', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('overwatering_root_pressure', 'underwatering', 'normal_leaf_aging', 'low_light_growth_weakness', 'sunburn'), 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 3, '优先区分浇水、光照与自然老叶代谢。', 1, 'audited', 'active'),
  ('wilting_care_split_group', '萎蔫养护分流组', '植株萎蔫时优先区分湿土根压和干土缺水。', JSON_ARRAY('wilting'), JSON_ARRAY('overwatering_root_pressure', 'underwatering'), 'q_root_rot_wet_soil_wilt', 2, '优先区分湿土萎蔫与干土萎蔫。', 1, 'audited', 'active'),
  ('light_heat_split_group', '光照与热胁迫分流组', '徒长、晒伤、焦边等环境型线索。', JSON_ARRAY('leggy_growth', 'scorching_spots', 'burnt_leaf_edge'), JSON_ARRAY('low_light_growth_weakness', 'sunburn', 'dry_air_stress'), '', 3, '区分弱光、暴晒和干空气压力。', 1, 'audited', 'active'),
  ('leaf_spot_split_group', '叶斑分流组', '斑点扩散时优先判断是否叶斑方向。', JSON_ARRAY('spreading_spots'), JSON_ARRAY('leaf_spot_problem', 'uncertain_observation'), '', 2, '在潮湿和通风差背景下确认叶斑方向。', 1, 'audited', 'active'),
  ('holes_in_leaf_split_group', '孔洞分流组', '叶片孔洞时区分旧伤与虫害取食。', JSON_ARRAY('holes_in_leaf'), JSON_ARRAY('structural_damage_old_injury', 'chewing_pest_damage'), 'q_observed_probe__holes_in_leaf__structural_cause', 2, '先区分结构旧伤还是仍在继续发生的取食痕迹。', 1, 'audited', 'active');

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
  ('yellowing_wet_soil_route', 'yellowing_care_split_group', 'overwatering_root_pressure', '黄叶 + 浇水偏勤/盆土久湿路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 95, 2, 'uncertain', 'action_overwatering_basic', 'watering_stop', 1, 'audited', 'active'),
  ('yellowing_dry_soil_route', 'yellowing_care_split_group', 'underwatering', '黄叶 + 浇水偏少/盆土偏干路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 92, 2, 'uncertain', 'action_underwatering_basic', 'watering_add', 1, 'audited', 'active'),
  ('yellowing_old_leaf_route', 'yellowing_care_split_group', 'normal_leaf_aging', '黄叶 + 底部老叶自然代谢路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 84, 2, 'uncertain', 'action_non_problematic_observe', 'observe_only', 1, 'audited', 'active'),
  ('yellowing_low_light_route', 'yellowing_care_split_group', 'low_light_growth_weakness', '黄叶 + 光照偏弱路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 83, 2, 'uncertain', 'action_low_light_basic', 'increase_light', 1, 'audited', 'active'),
  ('yellowing_sunburn_route', 'yellowing_care_split_group', 'sunburn', '黄叶 + 近期强光/暴晒路径', 'visual_symptom', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis'), JSON_ARRAY('yellowing_direction'), JSON_ARRAY('yellowing_mode'), JSON_OBJECT(), 82, 2, 'uncertain', 'action_sunburn_basic', 'avoid_sun', 1, 'audited', 'active'),
  ('leggy_low_light_route', 'light_heat_split_group', 'low_light_growth_weakness', '徒长 + 弱光路径', 'visual_symptom', JSON_ARRAY('leggy_growth', 'weak_light'), JSON_ARRAY(), JSON_ARRAY(), JSON_OBJECT(), 88, 1, 'uncertain', 'action_low_light_basic', 'increase_light', 1, 'audited', 'active'),
  ('sunburn_recent_exposure_route', 'light_heat_split_group', 'sunburn', '焦斑 + 最近暴晒路径', 'visual_symptom', JSON_ARRAY('scorching_spots', 'recent_strong_sun'), JSON_ARRAY(), JSON_ARRAY(), JSON_OBJECT(), 90, 1, 'uncertain', 'action_sunburn_basic', 'avoid_sun', 1, 'audited', 'active'),
  ('dry_air_leaf_edge_route', 'light_heat_split_group', 'dry_air_stress', '焦边 + 干空气路径', 'visual_symptom', JSON_ARRAY('burnt_leaf_edge', 'dry_air_condition'), JSON_ARRAY(), JSON_ARRAY(), JSON_OBJECT(), 82, 1, 'uncertain', 'action_dry_air_basic', 'raise_humidity', 1, 'audited', 'active'),
  ('leaf_spot_humid_route', 'leaf_spot_split_group', 'leaf_spot_problem', '斑点扩散 + 通风差路径', 'visual_symptom', JSON_ARRAY('spreading_spots', 'poor_ventilation'), JSON_ARRAY(), JSON_ARRAY(), JSON_OBJECT(), 86, 1, 'uncertain', 'action_leaf_spot_basic', 'control_moisture', 1, 'audited', 'active'),
  ('holes_old_injury_route', 'holes_in_leaf_split_group', 'structural_damage_old_injury', '孔洞 + 无虫迹 + 不扩散路径', 'visual_symptom', JSON_ARRAY('holes_in_leaf', 'not_spreading'), JSON_ARRAY('structural_damage_direction'), JSON_ARRAY('chewing_pest_mode'), JSON_OBJECT(), 80, 1, 'uncertain', 'action_old_injury_basic', 'observe_only', 1, 'audited', 'active'),
  ('holes_chewing_pest_route', 'holes_in_leaf_split_group', 'chewing_pest_damage', '孔洞 + 虫迹路径', 'visual_symptom', JSON_ARRAY('holes_in_leaf', 'visible_pest_trace'), JSON_ARRAY('chewing_pest_direction'), JSON_ARRAY('chewing_pest_mode'), JSON_OBJECT(), 93, 2, 'uncertain', 'action_chewing_pest_basic', 'control_pest', 1, 'audited', 'active'),
  ('wilting_wet_soil_route', 'wilting_care_split_group', 'overwatering_root_pressure', '萎蔫 + 土湿路径', 'visual_symptom', JSON_ARRAY('wilting', 'soil_wet'), JSON_ARRAY('root_rot_wet_wilt_mode'), JSON_ARRAY(), JSON_OBJECT(), 96, 2, 'uncertain', 'action_overwatering_basic', 'watering_stop', 1, 'audited', 'active'),
  ('wilting_dry_soil_route', 'wilting_care_split_group', 'underwatering', '萎蔫 + 土干路径', 'visual_symptom', JSON_ARRAY('wilting', 'soil_dry'), JSON_ARRAY(), JSON_ARRAY(), JSON_OBJECT(), 94, 1, 'uncertain', 'action_underwatering_basic', 'watering_add', 1, 'audited', 'active');

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
  ('wet_soil_confirmation_gate', 'yellowing_wet_soil_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area', 'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'), 'routeKeys', JSON_ARRAY('yellowing_wet_soil_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area')), JSON_ARRAY('underwatering'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'wet_soil_confirmed', '黄叶进入浇水分流且背景长期偏湿，支持积水/根系压力。', 95, 1, 'audited', 'active'),
  ('dry_soil_confirmation_gate', 'yellowing_dry_soil_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area', 'q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry'), 'routeKeys', JSON_ARRAY('yellowing_dry_soil_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area')), JSON_ARRAY('overwatering_root_pressure'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'dry_soil_confirmed', '黄叶进入浇水分流且背景长期偏干，支持缺水压力。', 95, 1, 'audited', 'active'),
  ('old_leaf_aging_gate', 'yellowing_old_leaf_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:old_lower_leaves_first'), 'routeKeys', JSON_ARRAY('yellowing_old_leaf_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:new_leaves_first')), JSON_ARRAY(), 'probable', 'display_outcome', 'uncertain', 'uncertain', 'old_leaf_aging_confirmed', '主要是老叶或下位叶先黄，更符合自然代谢。', 84, 1, 'audited', 'active'),
  ('yellowing_low_light_gate', 'yellowing_low_light_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area', 'q_observed_probe__leaf_yellowing__light_change_context:weaker_light'), 'routeKeys', JSON_ARRAY('yellowing_low_light_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area')), JSON_ARRAY(), 'probable', 'display_outcome', 'uncertain', 'uncertain', 'yellowing_low_light_confirmed', '黄叶进入光照分流且近期明显更阴，更符合光照不足/生长偏弱。', 83, 1, 'audited', 'active'),
  ('yellowing_sunburn_gate', 'yellowing_sunburn_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('leaf_yellowing', 'uniform_yellowing', 'yellow_lower_leaves', 'yellow_new_leaves', 'interveinal_chlorosis')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__yellowing_care_area_gate:light_area', 'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'), 'routeKeys', JSON_ARRAY('yellowing_sunburn_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_observed_probe__leaf_yellowing__light_change_context:weaker_light', 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate:watering_area')), JSON_ARRAY(), 'probable', 'display_outcome', 'uncertain', 'uncertain', 'yellowing_sunburn_confirmed', '黄叶进入光照分流且近期直射明显增强，更符合晒伤/强光刺激。', 82, 1, 'audited', 'active'),
  ('low_light_gate', 'leggy_low_light_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('leggy_growth', 'weak_light')), JSON_OBJECT(), JSON_OBJECT(), JSON_ARRAY(), 'confirmed', 'display_outcome', 'uncertain', 'uncertain', 'low_light_confirmed', '徒长并伴随弱光，更符合光照不足/生长偏弱。', 88, 1, 'audited', 'active'),
  ('sunburn_gate', 'sunburn_recent_exposure_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('scorching_spots', 'recent_strong_sun')), JSON_OBJECT(), JSON_OBJECT(), JSON_ARRAY(), 'confirmed', 'display_outcome', 'uncertain', 'uncertain', 'sunburn_confirmed', '焦斑与近期暴晒一致，更符合晒伤/强光刺激。', 90, 1, 'audited', 'active'),
  ('dry_air_gate', 'dry_air_leaf_edge_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('burnt_leaf_edge', 'dry_air_condition')), JSON_OBJECT(), JSON_OBJECT(), JSON_ARRAY(), 'confirmed', 'display_outcome', 'uncertain', 'uncertain', 'dry_air_confirmed', '焦边与干空气背景一致，更符合环境压力。', 82, 1, 'audited', 'active'),
  ('leaf_spot_gate', 'leaf_spot_humid_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('spreading_spots', 'poor_ventilation')), JSON_OBJECT(), JSON_OBJECT(), JSON_ARRAY(), 'confirmed', 'display_outcome', 'uncertain', 'uncertain', 'leaf_spot_confirmed', '斑点扩散且通风差，更符合叶斑类问题。', 86, 1, 'audited', 'active'),
  ('old_injury_gate', 'holes_old_injury_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('holes_in_leaf', 'no_pest_trace', 'not_spreading')), JSON_OBJECT(), JSON_OBJECT('symptomKeys', JSON_ARRAY('visible_pest_trace')), JSON_ARRAY('chewing_pest_damage'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'old_injury_confirmed', '孔洞没有继续扩散且缺少虫迹，更像结构损伤或旧伤。', 80, 1, 'audited', 'active'),
  ('chewing_pest_gate', 'holes_chewing_pest_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('holes_in_leaf', 'visible_pest_trace')), JSON_OBJECT(), JSON_OBJECT(), JSON_ARRAY('structural_damage_old_injury'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'chewing_pest_confirmed', '孔洞伴随虫迹，更像咀嚼型虫害痕迹。', 93, 1, 'audited', 'active'),
  ('wilting_wet_gate', 'wilting_wet_soil_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('wilting')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_root_rot_wet_soil_wilt:yes')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_root_rot_wet_soil_wilt:no')), JSON_ARRAY('underwatering'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'wet_wilt_confirmed', '湿土仍萎蔫，更支持积水/根系压力。', 96, 1, 'audited', 'active'),
  ('wilting_dry_gate', 'wilting_dry_soil_route', 'display', JSON_OBJECT('symptomKeys', JSON_ARRAY('wilting')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_root_rot_wet_soil_wilt:no')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_root_rot_wet_soil_wilt:yes')), JSON_ARRAY('overwatering_root_pressure'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'dry_wilt_confirmed', '干土萎蔫，更支持缺水压力。', 94, 1, 'audited', 'active');

DELETE FROM outcome_route_questions
WHERE route_key IN (
  'yellowing_wet_soil_route',
  'yellowing_dry_soil_route',
  'yellowing_old_leaf_route',
  'yellowing_low_light_route',
  'yellowing_sunburn_route'
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
  ('yellowing_wet_soil_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'wet_soil_confirmation_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_wet_soil_route', 2, 'q_observed_probe__leaf_yellowing__watering_frequency_context', 'wet_soil_confirmation_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_dry_soil_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'dry_soil_confirmation_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_dry_soil_route', 2, 'q_observed_probe__leaf_yellowing__watering_frequency_context', 'dry_soil_confirmation_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_old_leaf_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'old_leaf_aging_gate', 'critical_split', 1, 230, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_light_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'yellowing_low_light_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_low_light_route', 2, 'q_observed_probe__leaf_yellowing__light_change_context', 'yellowing_low_light_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_sunburn_route', 1, 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate', 'yellowing_sunburn_gate', 'critical_split', 1, 250, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('yellowing_sunburn_route', 2, 'q_observed_probe__leaf_yellowing__light_change_context', 'yellowing_sunburn_gate', 'context_probe', 1, 240, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('holes_old_injury_route', 1, 'q_observed_probe__holes_in_leaf__structural_cause', 'old_injury_gate', 'critical_split', 1, 90, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('holes_chewing_pest_route', 1, 'q_holes_in_leaf_confirm', 'chewing_pest_gate', 'critical_split', 1, 92, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('wilting_wet_soil_route', 1, 'q_root_rot_wet_soil_wilt', 'wilting_wet_gate', 'critical_split', 1, 96, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('wilting_dry_soil_route', 1, 'q_root_rot_wet_soil_wilt', 'wilting_dry_gate', 'critical_split', 1, 96, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active');

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
  ('q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern', 'new_leaves_first', 'normal_leaf_aging', 'yellowing_old_leaf_route', 'exclude', 1.0000, '', 'leaf_age_pattern', '新叶先黄，不支持自然老叶代谢路径。', 1, 'audited', 'active'),
  ('q_observed_probe__holes_in_leaf__structural_cause', 'old_injury', 'structural_damage_old_injury', 'holes_old_injury_route', 'support', 1.0000, '', 'structural_cause', '用户确认更像旧伤，支持结构损伤/旧伤。', 1, 'audited', 'active'),
  ('q_observed_probe__holes_in_leaf__structural_cause', 'pest_like', 'chewing_pest_damage', 'holes_chewing_pest_route', 'support', 1.0000, '', 'structural_cause', '用户确认更像虫害取食，支持疑似虫害痕迹。', 1, 'audited', 'active'),
  ('q_holes_in_leaf_confirm', 'yes', 'chewing_pest_damage', 'holes_chewing_pest_route', 'support', 0.9000, '', 'structural_cause', '用户确认孔洞持续增多，进一步支持虫害取食方向。', 1, 'audited', 'active');

-- doc04补强：补齐 stable_natural_marking / uncertain_observation 的 question-route-gate-answer_effect 链路
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
  'q_non_problematic_variegation_stability',
  '这些斑纹是否已经稳定存在很久，最近没有继续扩大或新增？',
  'single_choice',
  'stable_natural_marking_pattern',
  'non_problematic_marking_group',
  1,
  'user_observable',
  'variegation_stability',
  'route_planning',
  'critical_split',
  'route_effect',
  1,
  200,
  'audited',
  'route_outcome_mvp_seed',
  'doc04 stable_natural_marking / uncertain_observation route split question.',
  '这些斑纹是否已经稳定存在很久，最近没有继续扩大或新增？',
  '用于区分稳定艺斑/正常斑纹和仍需观察的不确定斑块。',
  '稳定且不扩大的斑纹更像正常品种纹路；持续扩大或无法确认时不应直接闭合。',
  'stable_for_weeks',
  'segmented',
  'single_choice',
  'route_outcome_seed',
  'route_outcome_mvp_20260511',
  'route_outcome_mvp_v1',
  'audited',
  'route planning doc04 supplement',
  1,
  NOW(),
  NOW(),
  NOW(),
  'route_outcome_mvp_20260511'
) ON DUPLICATE KEY UPDATE
  question_text_cn = VALUES(question_text_cn),
  target_symptom_key = VALUES(target_symptom_key),
  question_group_key = VALUES(question_group_key),
  question_text_user_cn = VALUES(question_text_user_cn),
  help_text_cn = VALUES(help_text_cn),
  why_this_question_cn = VALUES(why_this_question_cn),
  default_option_key = VALUES(default_option_key),
  priority = VALUES(priority),
  data_status = VALUES(data_status),
  review_status = VALUES(review_status),
  is_active = VALUES(is_active),
  updated_at = NOW(),
  published_at = VALUES(published_at),
  published_batch_id = VALUES(published_batch_id);

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
  ('q_non_problematic_variegation_stability', 'stable_for_weeks', '是，稳定存在很久，最近没有扩大', 'stable_natural_marking_pattern', 1.0000, 1.0000, 'audited', 'route_outcome_mvp_seed', '支持稳定艺斑/正常斑纹路径。', '是，稳定存在很久，最近没有扩大', '支持艺斑/正常斑纹。', '长期稳定且不扩大的斑纹更接近正常纹路。', 1, 1, 'route_outcome_seed', 'route_outcome_mvp_20260511', 'route_outcome_mvp_v1', 'audited', 'route planning doc04 supplement', 1, NOW(), NOW(), NOW(), 'route_outcome_mvp_20260511'),
  ('q_non_problematic_variegation_stability', 'expanding_or_uncertain', '不是，最近在扩大或我不能确认是否稳定', 'irregular_blotches', 1.0000, 1.0000, 'audited', 'route_outcome_mvp_seed', '支持保守不确定观察路径。', '不是，最近在扩大或我不能确认是否稳定', '转入不确定观察。', '扩大或无法确认稳定时，不直接当作正常斑纹闭合。', 2, 0, 'route_outcome_seed', 'route_outcome_mvp_20260511', 'route_outcome_mvp_v1', 'audited', 'route planning doc04 supplement', 1, NOW(), NOW(), NOW(), 'route_outcome_mvp_20260511')
ON DUPLICATE KEY UPDATE
  option_text_cn = VALUES(option_text_cn),
  maps_to_symptom_key = VALUES(maps_to_symptom_key),
  value = VALUES(value),
  association_strength = VALUES(association_strength),
  option_text_user_cn = VALUES(option_text_user_cn),
  answer_effect_cn = VALUES(answer_effect_cn),
  option_description_user_cn = VALUES(option_description_user_cn),
  display_order = VALUES(display_order),
  is_default = VALUES(is_default),
  data_status = VALUES(data_status),
  review_status = VALUES(review_status),
  is_active = VALUES(is_active),
  updated_at = NOW(),
  published_at = VALUES(published_at),
  published_batch_id = VALUES(published_batch_id);

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
  ('non_problematic_marking_group', '稳定斑纹分流组', '识别稳定艺斑/正常斑纹并与不确定观察分离。', JSON_ARRAY('stable_natural_marking_pattern', 'irregular_blotches'), JSON_ARRAY('stable_natural_marking', 'uncertain_observation'), 'q_non_problematic_variegation_stability', 2, '先确认斑纹是否长期稳定，再决定自然代谢或不确定。', 1, 'audited', 'active');

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
  ('stable_natural_marking_route', 'non_problematic_marking_group', 'stable_natural_marking', '稳定斑纹/艺斑路径', 'visual_symptom', JSON_ARRAY('stable_natural_marking_pattern'), JSON_ARRAY('variegation_direction'), JSON_ARRAY('non_problematic_mode'), JSON_OBJECT(), 90, 1, 'uncertain', 'action_non_problematic_observe', 'observe_only', 1, 'audited', 'active'),
  ('uncertain_observation_route', 'non_problematic_marking_group', 'uncertain_observation', '稳定斑纹未闭合-保守不确定路径', 'visual_symptom', JSON_ARRAY('stable_natural_marking_pattern', 'irregular_blotches'), JSON_ARRAY('variegation_direction'), JSON_ARRAY('general_stress_mode'), JSON_OBJECT(), 65, 1, 'uncertain', 'action_uncertain_prepare', 'uncertain_prepare', 1, 'audited', 'active');

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
  ('stable_natural_marking_gate', 'stable_natural_marking_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('stable_natural_marking_pattern')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_non_problematic_variegation_stability:stable_for_weeks'), 'routeKeys', JSON_ARRAY('stable_natural_marking_route')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_non_problematic_variegation_stability:expanding_or_uncertain')), JSON_ARRAY('uncertain_observation'), 'confirmed', 'display_outcome', 'ask_next', 'uncertain', 'stable_natural_marking_confirmed', '斑纹长期稳定且无扩展，更符合艺斑/正常斑纹。', 90, 1, 'audited', 'active'),
  ('uncertain_observation_gate', 'uncertain_observation_route', 'display', JSON_OBJECT('anySymptomKeys', JSON_ARRAY('stable_natural_marking_pattern', 'irregular_blotches')), JSON_OBJECT('questionOptionPairs', JSON_ARRAY('q_non_problematic_variegation_stability:expanding_or_uncertain'), 'routeKeys', JSON_ARRAY('uncertain_observation_route')), JSON_OBJECT(), JSON_ARRAY('stable_natural_marking'), 'probable', 'display_outcome', 'uncertain', 'uncertain', 'uncertain_observation_confirmed', '斑纹稳定性证据不足或存在扩展，转入保守不确定观察。', 65, 1, 'audited', 'active');

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
  ('stable_natural_marking_route', 1, 'q_non_problematic_variegation_stability', 'stable_natural_marking_gate', 'critical_split', 1, 200, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active'),
  ('uncertain_observation_route', 1, 'q_non_problematic_variegation_stability', 'uncertain_observation_gate', 'critical_split', 1, 195, JSON_OBJECT(), 'never_repeat', 1, 'audited', 'active');

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
  ('q_non_problematic_variegation_stability', 'stable_for_weeks', 'stable_natural_marking', 'stable_natural_marking_route', 'support', 1.0000, '', 'variegation_stability', '用户确认斑纹稳定且长期存在，支持艺斑/正常斑纹。', 1, 'audited', 'active'),
  ('q_non_problematic_variegation_stability', 'expanding_or_uncertain', 'stable_natural_marking', 'stable_natural_marking_route', 'exclude', 1.0000, '', 'variegation_stability', '斑纹在扩展或无法确认稳定，排除稳定艺斑。', 1, 'audited', 'active'),
  ('q_non_problematic_variegation_stability', 'expanding_or_uncertain', 'uncertain_observation', 'uncertain_observation_route', 'support', 1.0000, '', 'variegation_stability', '用户无法确认稳定或观察到扩展，转入不确定观察路径。', 1, 'audited', 'active');
