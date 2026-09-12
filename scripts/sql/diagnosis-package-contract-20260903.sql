-- 仅补齐 cloud1_dev 当前诊断题包代码已使用的字段。
-- 执行前必须确认目标 schema 中这些字段不存在；不包含生产库操作。

ALTER TABLE `question_library_v5_real`
  ADD COLUMN `package_topic` VARCHAR(64) NULL COMMENT '问题要确认或分流的事实维度' AFTER `observability`,
  ADD COLUMN `package_section` VARCHAR(64) NULL COMMENT 'symptom_confirmation|differential_probe|context_probe' AFTER `package_topic`,
  ADD COLUMN `route_package_role` VARCHAR(64) NULL COMMENT '问题在路径中的角色' AFTER `package_section`,
  ADD COLUMN `package_effect` VARCHAR(64) NULL COMMENT '回答的下游影响方式' AFTER `route_package_role`;

ALTER TABLE `question_generation_engine`
  ADD COLUMN `package_topic_default` VARCHAR(64) NULL COMMENT '生成规则默认目标维度' AFTER `observability_default`,
  ADD COLUMN `package_section_default` VARCHAR(64) NULL COMMENT '生成规则默认分流范围' AFTER `package_topic_default`,
  ADD COLUMN `route_package_role_default` VARCHAR(64) NULL COMMENT '生成规则默认问题类别' AFTER `package_section_default`,
  ADD COLUMN `package_effect_default` VARCHAR(64) NULL COMMENT '生成规则默认答案影响方式' AFTER `route_package_role_default`;

ALTER TABLE `outcome_route_questions`
  ADD COLUMN `route_package_role` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '问题角色' AFTER `question_key`;

ALTER TABLE `outcome_routes`
  ADD COLUMN `conservative_policy` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '保守策略' AFTER `fallback_policy`;

ALTER TABLE `diagnosis_result_snapshots`
  ADD COLUMN `session_adapter_version` VARCHAR(64) NULL COMMENT '会话适配器版本' AFTER `legacy_adapter_version`;

UPDATE `question_library_v5_real`
SET
  `package_topic` = COALESCE(NULLIF(`package_topic`, ''), `target_dimension`),
  `package_section` = COALESCE(NULLIF(`package_section`, ''), `routing_scope`),
  `route_package_role` = COALESCE(NULLIF(`route_package_role`, ''), `question_role`),
  `package_effect` = COALESCE(NULLIF(`package_effect`, ''), `effect_mode`)
WHERE `package_topic` IS NULL OR `package_topic` = ''
   OR `package_section` IS NULL OR `package_section` = ''
   OR `route_package_role` IS NULL OR `route_package_role` = ''
   OR `package_effect` IS NULL OR `package_effect` = '';

UPDATE `question_generation_engine`
SET
  `package_topic_default` = COALESCE(NULLIF(`package_topic_default`, ''), `target_dimension_default`),
  `package_section_default` = COALESCE(NULLIF(`package_section_default`, ''), `routing_scope_default`),
  `route_package_role_default` = COALESCE(NULLIF(`route_package_role_default`, ''), `question_role_default`),
  `package_effect_default` = COALESCE(NULLIF(`package_effect_default`, ''), `effect_mode_default`)
WHERE `package_topic_default` IS NULL OR `package_topic_default` = ''
   OR `package_section_default` IS NULL OR `package_section_default` = ''
   OR `route_package_role_default` IS NULL OR `route_package_role_default` = ''
   OR `package_effect_default` IS NULL OR `package_effect_default` = '';

UPDATE `outcome_route_questions`
SET `route_package_role` = COALESCE(NULLIF(`route_package_role`, ''), `question_role`)
WHERE `route_package_role` IS NULL OR `route_package_role` = '';

UPDATE `outcome_routes`
SET `conservative_policy` = COALESCE(NULLIF(`conservative_policy`, ''), `fallback_policy`)
WHERE `conservative_policy` IS NULL OR `conservative_policy` = '';

UPDATE `diagnosis_result_snapshots`
SET `session_adapter_version` = COALESCE(NULLIF(`session_adapter_version`, ''), `legacy_adapter_version`)
WHERE `session_adapter_version` IS NULL OR `session_adapter_version` = '';
