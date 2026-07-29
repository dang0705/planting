-- 86exxzd5t: DB-owned shared watering_frequency_context package question.
-- Current schema-safe version: only writes columns documented in
-- docs/data-base/DATABASE_SCHEMA_SPEC_v2.md for question_library_v5_real and
-- question_option_mapping_v5_real.
--
-- Runtime package metadata such as packageTopic/uiVariant/renderMode/defaultOptionKey
-- is supplied by the backend topic adapter, because those columns do not exist
-- in the current DB schema.

INSERT INTO question_library_v5_real (
  question_key,
  question_text_cn,
  question_type,
  target_symptom_key,
  question_group_key,
  question_level,
  observability,
  allow_unknown,
  priority,
  data_status,
  data_source,
  note,
  question_text_user_cn,
  help_text_cn,
  why_this_question_cn
) VALUES (
  'q_observed_probe__leaf_yellowing__watering_frequency_context',
  '请您选择在过去的10天内，哪几天浇了水？',
  'single_choice',
  'leaf_yellowing',
  'watering_frequency_context',
  1,
  'medium',
  1,
  240,
  'audited',
  'manual',
  'shared package watering timeline question owned by DB; runtime package metadata is supplied by backend topic adapter',
  '请您选择在过去的10天内，哪几天浇了水？',
  '系统会结合天气和浇水记录判断偏干、偏湿或基本合理。',
  '用过去 10 天的浇水时间线补齐水分背景，由 answer runtime 转成 route 可识别的干湿选项。'
)
ON DUPLICATE KEY UPDATE
  question_text_cn = VALUES(question_text_cn),
  question_text_user_cn = VALUES(question_text_user_cn),
  question_type = VALUES(question_type),
  target_symptom_key = VALUES(target_symptom_key),
  question_group_key = VALUES(question_group_key),
  question_level = VALUES(question_level),
  observability = VALUES(observability),
  allow_unknown = VALUES(allow_unknown),
  priority = VALUES(priority),
  data_status = VALUES(data_status),
  data_source = VALUES(data_source),
  note = VALUES(note),
  help_text_cn = VALUES(help_text_cn),
  why_this_question_cn = VALUES(why_this_question_cn);

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
  answer_effect_cn
) VALUES
  (
    'q_observed_probe__leaf_yellowing__watering_frequency_context',
    'care_behavior_timeline',
    '养护记录已提供',
    '',
    0,
    0,
    'audited',
    'manual',
    'care behavior timeline default option for package question; default is supplied by backend topic adapter',
    '养护记录已提供',
    '记录过去 10 天浇水时间线已提供，后端按环境养护上下文转换为 route 干湿选项。'
  ),
  (
    'q_observed_probe__leaf_yellowing__watering_frequency_context',
    'unknown',
    '不确定 / 记不清',
    '',
    0,
    0,
    'audited',
    'manual',
    'unknown watering timeline option for package question',
    '不确定 / 记不清',
    '暂不记录明确浇水时间线。'
  )
ON DUPLICATE KEY UPDATE
  option_text_cn = VALUES(option_text_cn),
  maps_to_symptom_key = VALUES(maps_to_symptom_key),
  value = VALUES(value),
  association_strength = VALUES(association_strength),
  data_status = VALUES(data_status),
  data_source = VALUES(data_source),
  note = VALUES(note),
  option_text_user_cn = VALUES(option_text_user_cn),
  answer_effect_cn = VALUES(answer_effect_cn);
