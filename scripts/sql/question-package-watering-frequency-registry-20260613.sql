-- 86exxzd5t: DB-owned shared watering_frequency_context package question.
-- Scope:
-- 1. Keep question_key stable and readable for package questionKey identity.
-- 2. Move user-facing watering timeline copy/options into question_library_v5_real
--    and question_option_mapping_v5_real.
-- 3. Do not change outcome_route_conditions or outcome_answer_effects. Existing
--    route keys such as often_wet/often_dry remain owned by the route layer and
--    are produced from care_behavior_timeline in answer runtime.

INSERT INTO question_library_v5_real (
  question_key, question_text_cn, question_text_user_cn, question_type,
  target_symptom_key, question_group_key, question_level, observability,
  package_topic, package_section, route_package_role, package_effect,
  allow_unknown, priority, data_status, data_source, note, help_text_cn,
  why_this_question_cn, default_option_key, ui_variant, render_mode,
  template_engine_rule_key, source_type, source_batch_id, version_tag,
  review_status, review_note, is_active, created_at, updated_at,
  published_at, published_batch_id
) VALUES (
  'q_observed_probe__leaf_yellowing__watering_frequency_context',
  '请您选择在过去的10天内，哪几天浇了水？',
  '请您选择在过去的10天内，哪几天浇了水？',
  'single_choice',
  'leaf_yellowing',
  'watering_frequency_context',
  1,
  'medium',
  'watering_frequency_context',
  'route_package',
  'route_package_water_behavior',
  'route_outcome',
  1,
  240,
  'audited',
  'manual',
  'shared package watering timeline question owned by DB',
  '系统会结合天气和浇水记录判断偏干、偏湿或基本合理。',
  '用过去 10 天的浇水时间线补齐水分背景，由 answer runtime 转成 route 可识别的干湿选项。',
  'care_behavior_timeline',
  'care_behavior_timeline',
  'care_behavior_timeline',
  '',
  'manual',
  'question_package_watering_frequency_registry_20260613',
  'v20260613_question_package_watering_frequency',
  'audited',
  '共享题包浇水时间线题。',
  1,
  NOW(),
  NOW(),
  NOW(),
  'question_package_watering_frequency_registry_20260613'
)
ON DUPLICATE KEY UPDATE
  question_text_cn = VALUES(question_text_cn),
  question_text_user_cn = VALUES(question_text_user_cn),
  question_type = VALUES(question_type),
  target_symptom_key = VALUES(target_symptom_key),
  question_group_key = VALUES(question_group_key),
  package_topic = VALUES(package_topic),
  package_section = VALUES(package_section),
  route_package_role = VALUES(route_package_role),
  package_effect = VALUES(package_effect),
  allow_unknown = VALUES(allow_unknown),
  help_text_cn = VALUES(help_text_cn),
  why_this_question_cn = VALUES(why_this_question_cn),
  default_option_key = VALUES(default_option_key),
  ui_variant = VALUES(ui_variant),
  render_mode = VALUES(render_mode),
  template_engine_rule_key = VALUES(template_engine_rule_key),
  data_status = VALUES(data_status),
  review_status = VALUES(review_status),
  is_active = 1,
  updated_at = NOW(),
  published_at = NOW(),
  published_batch_id = VALUES(published_batch_id);

INSERT INTO question_option_mapping_v5_real (
  question_key, option_key, option_text_cn, maps_to_symptom_key, value,
  association_strength, data_status, data_source, note, option_text_user_cn,
  answer_effect_cn, option_description_user_cn, display_order, is_default,
  source_type, source_batch_id, version_tag, review_status, review_note,
  is_active, created_at, updated_at, published_at, published_batch_id
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
    'care behavior timeline default option for package question',
    '养护记录已提供',
    '记录过去 10 天浇水时间线已提供，后端按环境养护上下文转换为 route 干湿选项。',
    '',
    10,
    1,
    'manual',
    'question_package_watering_frequency_registry_20260613',
    'v20260613_question_package_watering_frequency',
    'audited',
    '题包浇水时间线默认选项。',
    1,
    NOW(),
    NOW(),
    NOW(),
    'question_package_watering_frequency_registry_20260613'
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
    '暂不记录明确浇水时间线。',
    '',
    20,
    0,
    'manual',
    'question_package_watering_frequency_registry_20260613',
    'v20260613_question_package_watering_frequency',
    'audited',
    '题包浇水时间线兜底选项。',
    1,
    NOW(),
    NOW(),
    NOW(),
    'question_package_watering_frequency_registry_20260613'
  )
ON DUPLICATE KEY UPDATE
  option_text_cn = VALUES(option_text_cn),
  option_text_user_cn = VALUES(option_text_user_cn),
  answer_effect_cn = VALUES(answer_effect_cn),
  option_description_user_cn = VALUES(option_description_user_cn),
  display_order = VALUES(display_order),
  is_default = VALUES(is_default),
  data_status = VALUES(data_status),
  review_status = VALUES(review_status),
  is_active = 1,
  updated_at = NOW(),
  published_at = NOW(),
  published_batch_id = VALUES(published_batch_id);

UPDATE question_option_mapping_v5_real
SET
  is_active = 0,
  updated_at = NOW()
WHERE question_key = 'q_observed_probe__leaf_yellowing__watering_frequency_context'
  AND option_key IN ('often_wet', 'normal_or_stable', 'often_dry');
