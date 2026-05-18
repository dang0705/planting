-- 将 root_stress 的用户态表达从“根区压力”改为更容易理解的“根部环境压力”。
-- 内部 outcome_key/problem_key 不变，避免影响 route、gate、review 追踪。

UPDATE diagnosis_outcomes
SET
  outcome_name_cn = '根部环境压力',
  display_name_cn = '根部环境压力',
  user_definition_cn = '当前更像根部周围环境不稳定，疑似闷根或根系受压，但暂未细分到腐烂或单纯水分问题。',
  updated_at = NOW()
WHERE outcome_key = 'root_stress';

UPDATE outcome_action_profiles
SET
  title_cn = '先稳定根部环境',
  today_actions_json = JSON_ARRAY(
    '先检查盆土干湿、盆底积水和通风状态',
    '保持根部周围环境稳定，避免继续刺激'
  ),
  avoid_actions_json = JSON_ARRAY('不要在疑似闷根或根系受压时继续重肥或频繁浇水'),
  updated_at = NOW()
WHERE action_profile_key = 'action_root_stress_basic';

UPDATE outcome_route_gates
SET
  decision_cause_text_cn = '通风/湿度变化叠加萎蔫或掉叶，更符合根部环境压力方向。',
  updated_at = NOW()
WHERE gate_key = 'airflow_root_stress_gate'
  AND route_key = 'yellowing_airflow_root_stress_route';

UPDATE outcome_answer_effects
SET
  effect_note_cn = CASE
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate'
      THEN '通风/湿度分流进入根部环境压力判断。'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_progression_speed'
      THEN '伴随萎蔫或掉叶，支持根部环境压力方向。'
    ELSE effect_note_cn
  END,
  updated_at = NOW()
WHERE outcome_key = 'root_stress'
  AND route_key = 'yellowing_airflow_root_stress_route';
