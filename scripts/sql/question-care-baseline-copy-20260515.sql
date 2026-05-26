-- Naturalize care-context follow-up question copy.
-- Scope: user-facing text only. Keep option_key, maps_to_symptom_key, value,
-- association_strength, answer_effect_cn, and route semantics unchanged.

UPDATE question_library_v5_real
SET
  question_text_user_cn = CASE question_key
    WHEN 'q_leaf_yellowing_watering_background' THEN '最近 2 周，浇水频率更接近哪一种？'
    WHEN 'q_leaf_yellowing_light_background' THEN '最近 1-2 周，这盆植物更接近哪种光照？'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '最近 1 个月，施肥情况更接近哪一种？'
    ELSE question_text_user_cn
  END,
  question_text_cn = CASE question_key
    WHEN 'q_leaf_yellowing_watering_background' THEN '最近 2 周，浇水频率更接近哪一种？'
    WHEN 'q_leaf_yellowing_light_background' THEN '最近 1-2 周，这盆植物更接近哪种光照？'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '最近 1 个月，施肥情况更接近哪一种？'
    ELSE question_text_cn
  END,
  help_text_cn = CASE question_key
    WHEN 'q_leaf_yellowing_watering_background' THEN '不需要先判断是否符合标准，只按最近实际频率选择；系统会结合植物养护基线判断偏多或偏少。'
    WHEN 'q_leaf_yellowing_light_background' THEN '直接按全日光、散光、全阴或离窗远近选择；系统会结合植物养护基线判断偏强或偏弱。'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '用次数、薄肥/重肥和是否刚换盆记录营养背景，不直接把黄叶等同于缺肥。'
    ELSE help_text_cn
  END,
  updated_at = NOW()
WHERE question_key IN (
  'q_leaf_yellowing_watering_background',
  'q_leaf_yellowing_light_background',
  'q_leaf_yellowing_fertilization_background'
);

UPDATE question_option_mapping_v5_real
SET
  option_text_user_cn = CASE
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_wet' THEN '每 1-2 天就浇一次，或土没干就浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_dry' THEN '近 2 周 0-1 次，或经常干透很久才浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'no_change' THEN '每周 1-2 次，基本等土表干了再浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'more_sun' THEN '全日光，或每天直射很多'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'less_light' THEN '全阴、离窗较远，或最近更暗'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'no_change' THEN '散光为主，最近基本没变'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'yes' THEN '近 1 个月 0 次，或已经很久没补肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'no' THEN '每 2 周 1 次左右薄肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'unknown' THEN '说不清/没留意'
    ELSE option_text_user_cn
  END,
  option_text_cn = CASE
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_wet' THEN '每 1-2 天就浇一次，或土没干就浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_dry' THEN '近 2 周 0-1 次，或经常干透很久才浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'no_change' THEN '每周 1-2 次，基本等土表干了再浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'more_sun' THEN '全日光，或每天直射很多'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'less_light' THEN '全阴、离窗较远，或最近更暗'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'no_change' THEN '散光为主，最近基本没变'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'yes' THEN '近 1 个月 0 次，或已经很久没补肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'no' THEN '每 2 周 1 次左右薄肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'unknown' THEN '说不清/没留意'
    ELSE option_text_cn
  END,
  option_description_user_cn = CASE
    WHEN question_key = 'q_leaf_yellowing_watering_background' THEN '只记录最近实际浇水频率；后端再结合植物养护基线判断偏多或偏少。'
    WHEN question_key = 'q_leaf_yellowing_light_background' THEN '只记录最近摆放位置和直射情况；后端再结合植物养护基线判断偏强或偏弱。'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' THEN '只记录近期施肥频率、薄肥/重肥和换盆背景。'
    ELSE option_description_user_cn
  END,
  updated_at = NOW()
WHERE question_key IN (
  'q_leaf_yellowing_watering_background',
  'q_leaf_yellowing_light_background',
  'q_leaf_yellowing_fertilization_background'
);
