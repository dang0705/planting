-- Add persistent follow-up question classification.
-- route_package_role is the stable category used by selection/review:
-- condition | differential_probe | context_metric | symptom_confirmation | visual_fact_review
-- package_effect is the main downstream effect of the answer:
-- route_condition | score_adjustment | evidence_admission | context_feature | visual_fact_review

ALTER TABLE `question_library_v5_real`
  ADD COLUMN `route_package_role` VARCHAR(64) NULL COMMENT 'condition|differential_probe|context_metric|symptom_confirmation|visual_fact_review' AFTER `package_section`,
  ADD COLUMN `package_effect` VARCHAR(64) NULL COMMENT 'route_condition|score_adjustment|evidence_admission|context_feature|visual_fact_review' AFTER `route_package_role`;

ALTER TABLE `question_generation_engine`
  ADD COLUMN `route_package_role_default` VARCHAR(64) NULL COMMENT '生成规则默认问题类别' AFTER `package_section_default`,
  ADD COLUMN `package_effect_default` VARCHAR(64) NULL COMMENT '生成规则默认答案影响方式' AFTER `route_package_role_default`;

UPDATE `question_library_v5_real`
SET
  `route_package_role` = CASE
    WHEN `package_topic` IN (
      'yellowing_primary_clue_condition',
      'yellowing_care_area_condition',
      'yellowing_disease_trace_condition'
    ) THEN 'condition'
    WHEN `package_topic` = 'visual_presence' THEN 'symptom_confirmation'
    WHEN `package_section` = 'differential_probe' THEN 'differential_probe'
    WHEN `package_section` = 'context_probe' THEN 'context_metric'
    ELSE 'symptom_confirmation'
  END
WHERE `route_package_role` IS NULL OR `route_package_role` = '';

UPDATE `question_library_v5_real`
SET
  `package_effect` = CASE
    WHEN `route_package_role` = 'condition' THEN 'route_condition'
    WHEN `route_package_role` = 'context_metric' THEN 'context_feature'
    WHEN `route_package_role` = 'visual_fact_review' THEN 'visual_fact_review'
    WHEN `package_topic` = 'visual_presence' THEN 'evidence_admission'
    ELSE 'score_adjustment'
  END
WHERE `package_effect` IS NULL OR `package_effect` = '';

UPDATE `question_generation_engine`
SET
  `route_package_role_default` = CASE
    WHEN `package_topic_default` IN (
      'yellowing_primary_clue_condition',
      'yellowing_care_area_condition',
      'yellowing_disease_trace_condition'
    ) THEN 'condition'
    WHEN `package_topic_default` = 'visual_presence' THEN 'symptom_confirmation'
    WHEN `package_section_default` = 'differential_probe' THEN 'differential_probe'
    WHEN `package_section_default` = 'context_probe' THEN 'context_metric'
    ELSE COALESCE(`route_package_role_default`, 'symptom_confirmation')
  END
WHERE `route_package_role_default` IS NULL OR `route_package_role_default` = '';

UPDATE `question_generation_engine`
SET
  `package_effect_default` = CASE
    WHEN `route_package_role_default` = 'condition' THEN 'route_condition'
    WHEN `route_package_role_default` = 'context_metric' THEN 'context_feature'
    WHEN `route_package_role_default` = 'visual_fact_review' THEN 'visual_fact_review'
    WHEN `package_topic_default` = 'visual_presence' THEN 'evidence_admission'
    ELSE COALESCE(`package_effect_default`, 'score_adjustment')
  END
WHERE `package_effect_default` IS NULL OR `package_effect_default` = '';
