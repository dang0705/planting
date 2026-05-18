-- Add persistent follow-up question classification.
-- question_role is the stable category used by selection/review:
-- gate | differential_probe | context_metric | symptom_confirmation | visual_fact_review
-- effect_mode is the main downstream effect of the answer:
-- route_gate | score_adjustment | evidence_admission | context_feature | visual_fact_review

ALTER TABLE `question_library_v5_real`
  ADD COLUMN `question_role` VARCHAR(64) NULL COMMENT 'gate|differential_probe|context_metric|symptom_confirmation|visual_fact_review' AFTER `routing_scope`,
  ADD COLUMN `effect_mode` VARCHAR(64) NULL COMMENT 'route_gate|score_adjustment|evidence_admission|context_feature|visual_fact_review' AFTER `question_role`;

ALTER TABLE `question_generation_engine`
  ADD COLUMN `question_role_default` VARCHAR(64) NULL COMMENT '生成规则默认问题类别' AFTER `routing_scope_default`,
  ADD COLUMN `effect_mode_default` VARCHAR(64) NULL COMMENT '生成规则默认答案影响方式' AFTER `question_role_default`;

UPDATE `question_library_v5_real`
SET
  `question_role` = CASE
    WHEN `target_dimension` IN (
      'yellowing_primary_clue_gate',
      'yellowing_care_area_gate',
      'yellowing_disease_trace_gate'
    ) THEN 'gate'
    WHEN `target_dimension` = 'visual_presence' THEN 'symptom_confirmation'
    WHEN `routing_scope` = 'differential_probe' THEN 'differential_probe'
    WHEN `routing_scope` = 'context_probe' THEN 'context_metric'
    ELSE 'symptom_confirmation'
  END
WHERE `question_role` IS NULL OR `question_role` = '';

UPDATE `question_library_v5_real`
SET
  `effect_mode` = CASE
    WHEN `question_role` = 'gate' THEN 'route_gate'
    WHEN `question_role` = 'context_metric' THEN 'context_feature'
    WHEN `question_role` = 'visual_fact_review' THEN 'visual_fact_review'
    WHEN `target_dimension` = 'visual_presence' THEN 'evidence_admission'
    ELSE 'score_adjustment'
  END
WHERE `effect_mode` IS NULL OR `effect_mode` = '';

UPDATE `question_generation_engine`
SET
  `question_role_default` = CASE
    WHEN `target_dimension_default` IN (
      'yellowing_primary_clue_gate',
      'yellowing_care_area_gate',
      'yellowing_disease_trace_gate'
    ) THEN 'gate'
    WHEN `target_dimension_default` = 'visual_presence' THEN 'symptom_confirmation'
    WHEN `routing_scope_default` = 'differential_probe' THEN 'differential_probe'
    WHEN `routing_scope_default` = 'context_probe' THEN 'context_metric'
    ELSE COALESCE(`question_role_default`, 'symptom_confirmation')
  END
WHERE `question_role_default` IS NULL OR `question_role_default` = '';

UPDATE `question_generation_engine`
SET
  `effect_mode_default` = CASE
    WHEN `question_role_default` = 'gate' THEN 'route_gate'
    WHEN `question_role_default` = 'context_metric' THEN 'context_feature'
    WHEN `question_role_default` = 'visual_fact_review' THEN 'visual_fact_review'
    WHEN `target_dimension_default` = 'visual_presence' THEN 'evidence_admission'
    ELSE COALESCE(`effect_mode_default`, 'score_adjustment')
  END
WHERE `effect_mode_default` IS NULL OR `effect_mode_default` = '';
