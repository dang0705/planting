-- 低施肥黄叶分流收敛：
-- nutrient_deficiency 仅保留为泛化 fallback。
-- 一旦出现更具体的黄化模式，由 nitrogen_deficiency / iron_deficiency 承接，
-- 不再让 low_fertilizer_nutrient_gate 与它们同时可见。

UPDATE outcome_route_gates
SET required_evidence_json = JSON_OBJECT(
      'anySymptomKeys',
      JSON_ARRAY('leaf_yellowing')
    ),
    blocker_evidence_json = JSON_OBJECT(
      'anySymptomKeys',
      JSON_ARRAY(
        'uniform_yellowing',
        'yellow_lower_leaves',
        'yellow_new_leaves',
        'interveinal_chlorosis'
      )
    ),
    updated_at = NOW()
WHERE gate_key = 'low_fertilizer_nutrient_gate'
  AND route_key = 'yellowing_low_fertilizer_nutrient_route';
