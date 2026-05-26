-- Naturalize high-risk follow-up copy without changing option keys.
-- This migration is intentionally copy-only: runtime mappings remain governed by existing question keys and option keys.

UPDATE `question_library_v5_real`
SET
  `question_text_cn` = '最近 2 周浇水节奏更接近哪一种？',
  `question_text_user_cn` = '最近 2 周浇水节奏更接近哪一种？',
  `help_text_cn` = '用可回忆的时间节奏记录干湿背景，后续可与属级养护基线一起判断是否偏离。'
WHERE `question_key` = 'q_leaf_yellowing_watering_background';

UPDATE `question_option_mapping_v5_real`
SET `option_text_user_cn` = '浇得偏勤，常在没干透时又浇'
WHERE `question_key` = 'q_leaf_yellowing_watering_background'
  AND `option_key` IN ('more_wet', 'too_wet', 'yes');

UPDATE `question_option_mapping_v5_real`
SET `option_text_user_cn` = '间隔偏长，常干透很久才浇'
WHERE `question_key` = 'q_leaf_yellowing_watering_background'
  AND `option_key` IN ('more_dry', 'too_dry', 'no');

UPDATE `question_library_v5_real`
SET
  `question_text_cn` = '最近 1-2 周，光照变化更接近哪一种？',
  `question_text_user_cn` = '最近 1-2 周，光照变化更接近哪一种？',
  `help_text_cn` = '只记录光照背景，不把黄叶本身直接等同于晒伤或缺光。'
WHERE `question_key` = 'q_leaf_yellowing_light_background';

UPDATE `question_option_mapping_v5_real`
SET `option_text_user_cn` = '更强光或更多直晒后更明显'
WHERE `question_key` = 'q_leaf_yellowing_light_background'
  AND `option_key` IN ('more_sun', 'stronger_light', 'yes');

UPDATE `question_option_mapping_v5_real`
SET `option_text_user_cn` = '更弱光、更阴，或没有明显增光'
WHERE `question_key` = 'q_leaf_yellowing_light_background'
  AND `option_key` IN ('less_light', 'weaker_light', 'no');

UPDATE `question_library_v5_real`
SET
  `question_text_cn` = '最近一个生长周期内，施肥情况更接近哪一种？',
  `question_text_user_cn` = '最近一个生长周期内，施肥情况更接近哪一种？',
  `help_text_cn` = '只记录供肥背景，不直接把黄化等同于缺肥。'
WHERE `question_key` = 'q_leaf_yellowing_fertilization_background';

UPDATE `question_option_mapping_v5_real`
SET `option_text_user_cn` = '长期没施肥，或明显少于平时'
WHERE `question_key` = 'q_leaf_yellowing_fertilization_background'
  AND `option_key` IN ('less_fertilizer', 'no_fertilizer', 'yes');

UPDATE `question_option_mapping_v5_real`
SET `option_text_user_cn` = '有按平时节奏少量补肥'
WHERE `question_key` = 'q_leaf_yellowing_fertilization_background'
  AND `option_key` IN ('normal', 'no');

UPDATE `question_library_v5_real`
SET
  `question_text_cn` = '这些位置更像真实穿孔/缺口，还是表面斑点、焦边或旧伤造成的外观变化？',
  `question_text_user_cn` = '这些位置更像真实穿孔/缺口，还是表面斑点、焦边或旧伤造成的外观变化？',
  `help_text_cn` = '这里只确认组织是否真实缺损，不把“有洞”直接等同于虫害。'
WHERE `question_key` = 'q_holes_in_leaf_confirm';

UPDATE `question_library_v5_real`
SET
  `question_text_cn` = '叶缘是否有不规则缺口或组织缺损，而不是单纯焦边、干边或旧伤边缘？',
  `question_text_user_cn` = '叶缘是否有不规则缺口或组织缺损，而不是单纯焦边、干边或旧伤边缘？',
  `help_text_cn` = '这里只确认边缘组织是否真实缺损，不把缺口直接等同于被取食。'
WHERE `question_key` = 'q_chewed_edges_confirm';

UPDATE `question_library_v5_real`
SET
  `question_text_cn` = '叶片是否出现真实的组织缺损或网状骨架化，而不是单纯变薄、焦枯或旧伤痕？',
  `question_text_user_cn` = '叶片是否出现真实的组织缺损或网状骨架化，而不是单纯变薄、焦枯或旧伤痕？',
  `help_text_cn` = '这里只确认组织缺损形态，不把骨架化外观直接等同于虫害。'
WHERE `question_key` IN (
  'q_skeletonized_leaves_confirm',
  'q_skeletonized_leaf_confirm',
  'q_skeletonized_leaves_visible'
);
