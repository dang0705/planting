-- Follow-up copy polish for yellowing observed-probe questions.
-- Scope: user-facing copy only. Do not change option_key, mapping semantics,
-- answer effects, association strength, or route configuration.

UPDATE question_library_v5_real
SET
  question_text_user_cn = CASE question_key
    WHEN 'q_leaf_yellowing_watering_background' THEN '最近 2 周，你的浇水情况更接近哪一种？'
    WHEN 'q_leaf_yellowing_light_background' THEN '最近 1-2 周，这盆植物的光照更接近哪一种？'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '最近 1 个月，施肥或换盆情况更接近哪一种？'
    WHEN 'q_observed_probe__leaf_yellowing__watering_frequency_context' THEN '最近 2 周，你的浇水情况更接近哪一种？'
    WHEN 'q_observed_probe__leaf_yellowing__light_change_context' THEN '最近 1-2 周，这盆植物的光照更接近哪一种？'
    WHEN 'q_observed_probe__leaf_yellowing__fertilization_growth_context' THEN '最近 1 个月，施肥或换盆情况更接近哪一种？'
    ELSE question_text_user_cn
  END,
  question_text_cn = CASE question_key
    WHEN 'q_leaf_yellowing_watering_background' THEN '最近 2 周，你的浇水情况更接近哪一种？'
    WHEN 'q_leaf_yellowing_light_background' THEN '最近 1-2 周，这盆植物的光照更接近哪一种？'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '最近 1 个月，施肥或换盆情况更接近哪一种？'
    WHEN 'q_observed_probe__leaf_yellowing__watering_frequency_context' THEN '最近 2 周，你的浇水情况更接近哪一种？'
    WHEN 'q_observed_probe__leaf_yellowing__light_change_context' THEN '最近 1-2 周，这盆植物的光照更接近哪一种？'
    WHEN 'q_observed_probe__leaf_yellowing__fertilization_growth_context' THEN '最近 1 个月，施肥或换盆情况更接近哪一种？'
    ELSE question_text_cn
  END,
  help_text_cn = CASE question_key
    WHEN 'q_leaf_yellowing_watering_background' THEN '只按最近实际情况选择，不用先判断对错；系统会结合黄叶线索判断偏湿、稳定或偏干方向。'
    WHEN 'q_leaf_yellowing_light_background' THEN '重点看直射时长和摆放变化，不需要先判断植物是否耐晒。'
    WHEN 'q_leaf_yellowing_fertilization_background' THEN '这题只记录近期营养与换盆背景，不直接等同于缺肥或肥害结论。'
    WHEN 'q_observed_probe__leaf_yellowing__watering_frequency_context' THEN '只按最近实际情况选择，不用先判断对错；系统会结合黄叶线索判断偏湿、稳定或偏干方向。'
    WHEN 'q_observed_probe__leaf_yellowing__light_change_context' THEN '按全日光、散光、全阴或离窗远近选择；系统会结合植物养护基线判断偏强或偏弱。'
    WHEN 'q_observed_probe__leaf_yellowing__fertilization_growth_context' THEN '这题只记录近期营养与换盆背景，不直接等同于缺肥或肥害结论。'
    ELSE help_text_cn
  END,
  updated_at = NOW()
WHERE question_key IN (
  'q_leaf_yellowing_watering_background',
  'q_leaf_yellowing_light_background',
  'q_leaf_yellowing_fertilization_background',
  'q_observed_probe__leaf_yellowing__watering_frequency_context',
  'q_observed_probe__leaf_yellowing__light_change_context',
  'q_observed_probe__leaf_yellowing__fertilization_growth_context'
);

UPDATE question_option_mapping_v5_real
SET
  option_text_user_cn = CASE
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_wet' THEN '每 1-2 天浇一次，或土没干就浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'no_change' THEN '等土表发干再浇，最近节奏基本稳定'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_dry' THEN '近 2 周 0-1 次，或经常干透很久才浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'more_sun' THEN '直射明显变多，或每天晒得比较久'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'no_change' THEN '散光为主，最近位置基本没变'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'less_light' THEN '更阴了，或离窗更远、直射更少'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'yes' THEN '长期没补肥，或最近 1 个月几乎没施肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'no' THEN '有少量补肥，最近没有明显重肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'often_wet' THEN '每 1-2 天浇一次，或土没干就浇'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'normal_or_stable' THEN '等土表发干再浇，最近节奏基本稳定'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'often_dry' THEN '近 2 周 0-1 次，或经常干透很久才浇'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'stronger_direct_light' THEN '全日光，或每天直射很多'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'no_clear_change' THEN '散光为主，最近位置基本没变'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'weaker_light' THEN '全阴、离窗较远，或最近更暗'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'low_or_no_fertilizer' THEN '近 1 个月 0 次，或已经很久没补肥'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'normal_light_fertilizer' THEN '每 2 周 1 次左右薄肥'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'recent_heavy_fertilizer_or_repot' THEN '近 1 个月 2 次以上、重肥，或刚换盆/换土'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'unknown' THEN '说不清/没留意'
    ELSE option_text_user_cn
  END,
  option_text_cn = CASE
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_wet' THEN '每 1-2 天浇一次，或土没干就浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'no_change' THEN '等土表发干再浇，最近节奏基本稳定'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'more_dry' THEN '近 2 周 0-1 次，或经常干透很久才浇'
    WHEN question_key = 'q_leaf_yellowing_watering_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'more_sun' THEN '直射明显变多，或每天晒得比较久'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'no_change' THEN '散光为主，最近位置基本没变'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'less_light' THEN '更阴了，或离窗更远、直射更少'
    WHEN question_key = 'q_leaf_yellowing_light_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'yes' THEN '长期没补肥，或最近 1 个月几乎没施肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'no' THEN '有少量补肥，最近没有明显重肥'
    WHEN question_key = 'q_leaf_yellowing_fertilization_background' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'often_wet' THEN '每 1-2 天浇一次，或土没干就浇'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'normal_or_stable' THEN '等土表发干再浇，最近节奏基本稳定'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'often_dry' THEN '近 2 周 0-1 次，或经常干透很久才浇'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'stronger_direct_light' THEN '全日光，或每天直射很多'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'no_clear_change' THEN '散光为主，最近位置基本没变'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'weaker_light' THEN '全阴、离窗较远，或最近更暗'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__light_change_context' AND option_key = 'unknown' THEN '说不清/没留意'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'low_or_no_fertilizer' THEN '近 1 个月 0 次，或已经很久没补肥'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'normal_light_fertilizer' THEN '每 2 周 1 次左右薄肥'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'recent_heavy_fertilizer_or_repot' THEN '近 1 个月 2 次以上、重肥，或刚换盆/换土'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context' AND option_key = 'unknown' THEN '说不清/没留意'
    ELSE option_text_cn
  END,
  option_description_user_cn = CASE
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate' AND option_key = 'care_context' THEN '最近两周日常养护有明显变化，先从浇水、光照、施肥、通风湿度方向继续细分。'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate' AND option_key = 'watering_area' THEN '最近浇水频率明显变化，或盆土经常偏湿/偏干。'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate' AND option_key = 'light_area' THEN '最近直射时长、遮阴程度或摆放位置变化明显。'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate' AND option_key = 'fertilization_area' THEN '最近长期没补肥、施肥偏多，或刚换盆换土。'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate' AND option_key = 'airflow_humidity_area' THEN '最近环境更闷、更潮，或明显更干燥、风流变化较大。'
    WHEN question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate' AND option_key = 'unknown' THEN '暂时看不出最可疑项，先回到黄叶分布继续排查。'
    ELSE option_description_user_cn
  END,
  updated_at = NOW()
WHERE (question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context'
  AND option_key IN ('often_wet', 'normal_or_stable', 'often_dry', 'unknown'))
  OR (question_key = 'q_observed_probe__leaf_yellowing__light_change_context'
    AND option_key IN ('stronger_direct_light', 'no_clear_change', 'weaker_light', 'unknown'))
  OR (question_key = 'q_observed_probe__leaf_yellowing__fertilization_growth_context'
    AND option_key IN ('low_or_no_fertilizer', 'normal_light_fertilizer', 'recent_heavy_fertilizer_or_repot', 'unknown'))
  OR (question_key IN (
    'q_leaf_yellowing_watering_background',
    'q_leaf_yellowing_light_background',
    'q_leaf_yellowing_fertilization_background'
  ))
  OR (question_key = 'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate'
    AND option_key = 'care_context')
  OR (question_key = 'q_observed_probe__leaf_yellowing__yellowing_care_area_gate'
    AND option_key IN ('watering_area', 'light_area', 'fertilization_area', 'airflow_humidity_area', 'unknown'));
