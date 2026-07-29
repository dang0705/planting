-- 黄叶光照路径升级：light health evidence 为主证据，旧 light_change_context 仅在无有效 score 时兼容回退。

UPDATE outcome_route_conditions
SET required_answer_effects_json = JSON_OBJECT(
  'lightHealthDirections', JSON_ARRAY('low'),
  'lightHealthLevels', JSON_ARRAY('略不足', '明显不足', '严重不足'),
  'fallbackQuestionOptionPairs', JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__light_change_context:weaker_light'
  ),
  'routeKeys', JSON_ARRAY('yellowing_low_light_route')
),
decision_cause_text_cn = '黄叶进入光照分流，且光照健康度 evidence 显示低于属级需求；未携带新字段时回退近期更阴答案。'
WHERE condition_key = 'yellowing_low_light_condition'
  AND route_key = 'yellowing_low_light_route';

UPDATE outcome_route_conditions
SET required_answer_effects_json = JSON_OBJECT(
  'lightHealthDirections', JSON_ARRAY('strong'),
  'lightHealthLevels', JSON_ARRAY('略偏强', '明显偏强', '严重偏强'),
  'fallbackQuestionOptionPairs', JSON_ARRAY(
    'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
  ),
  'routeKeys', JSON_ARRAY('yellowing_sunburn_route')
),
decision_cause_text_cn = '黄叶进入光照分流，且光照健康度 evidence 显示高于属级需求；未携带新字段时回退近期直射增强答案。'
WHERE condition_key = 'yellowing_sunburn_condition'
  AND route_key = 'yellowing_sunburn_route';
