-- 收紧黄叶通风湿度分支进入叶斑 outcome 的闭合条件。
-- 目的：黄叶 + 通风/湿度 + 快速扩散只能说明环境压力或扩散风险，
-- 不能在没有明确叶斑可见证据时直接闭合为 leaf_spot_problem。

UPDATE outcome_route_gates
SET
  required_evidence_json = JSON_OBJECT(
    'symptomKeys', JSON_ARRAY('spreading_spots'),
    'anySymptomKeys', JSON_ARRAY(
      'leaf_yellowing',
      'uniform_yellowing',
      'yellow_lower_leaves',
      'yellow_new_leaves',
      'interveinal_chlorosis'
    )
  ),
  decision_cause_text_cn = '黄叶同时存在明确斑点扩散证据，并伴随通风/湿度变化与快速扩散，才支持叶斑类问题。',
  updated_at = NOW()
WHERE gate_key = 'airflow_leaf_spot_gate'
  AND route_key = 'yellowing_airflow_leaf_spot_route';
