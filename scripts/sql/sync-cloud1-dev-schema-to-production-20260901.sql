-- 2026-09-01 已执行：将 cloud1_dev 的业务 schema 补齐到生产 schema。
-- 目标：`cloud1-2grufevs395a9d5e`。本迁移只复制结构，不复制数据。
-- 策略：生产现有数据和额外遗留列保留；别名列改回当前正式列名；空的历史天气表修正为 canonical 结构。
-- 注意：本文件记录本次已执行的 DDL，CHANGE/MODIFY 段不是可盲目重复执行的幂等脚本。

-- 1) 仅复制开发库中生产缺失的表结构（LIKE 不复制行数据）。
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`import_jobs` LIKE `cloud1_dev`.`import_jobs`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`publish_batches` LIKE `cloud1_dev`.`publish_batches`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`publish_diffs` LIKE `cloud1_dev`.`publish_diffs`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`review_logs` LIKE `cloud1_dev`.`review_logs`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`subscription_orders` LIKE `cloud1_dev`.`subscription_orders`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_fertilization_events` LIKE `cloud1_dev`.`user_fertilization_events`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_fertilization_reminder_events` LIKE `cloud1_dev`.`user_fertilization_reminder_events`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_plant_file_deletion_jobs` LIKE `cloud1_dev`.`user_plant_file_deletion_jobs`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_watering_reminder_events` LIKE `cloud1_dev`.`user_watering_reminder_events`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`visual_out_of_pool_candidate_groups` LIKE `cloud1_dev`.`visual_out_of_pool_candidate_groups`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`visual_out_of_pool_proxy_mappings` LIKE `cloud1_dev`.`visual_out_of_pool_proxy_mappings`;
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`watering_advisor_sessions` LIKE `cloud1_dev`.`watering_advisor_sessions`;

-- 2) 将生产中仍使用的历史别名列改为开发库正式列名，保留原有值。
ALTER TABLE `cloud1-2grufevs395a9d5e`.`class_question_group_strategy`
  CHANGE COLUMN `class_gate_type` `class_condition_type` VARCHAR(64) NOT NULL DEFAULT 'soft',
  CHANGE COLUMN `followup_mode_v1` `question_mode_v1` VARCHAR(64) NOT NULL DEFAULT 'disabled';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`diagnosis_outcomes`
  CHANGE COLUMN `legacy_problem_key` `problem_key` VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_identity_entities`
  CHANGE COLUMN `legacy_plant_id` `session_plant_id` VARCHAR(64) NULL;
ALTER TABLE `cloud1-2grufevs395a9d5e`.`symptom_class_mapping`
  CHANGE COLUMN `followup_enabled_v1` `question_enabled_v1` TINYINT(1) NOT NULL DEFAULT 0,
  CHANGE COLUMN `followup_mode_v1` `question_mode_v1` VARCHAR(64) NOT NULL DEFAULT 'disabled';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`symptom_classes`
  CHANGE COLUMN `followup_enabled_v1` `question_enabled_v1` TINYINT(1) NOT NULL DEFAULT 0,
  CHANGE COLUMN `followup_mode_v1` `question_mode_v1` VARCHAR(64) NOT NULL DEFAULT 'disabled',
  CHANGE COLUMN `runtime_gate_rule` `runtime_condition_rule` VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`user_plant_instances`
  CHANGE COLUMN `legacy_plant_id` `session_plant_id` VARCHAR(64) NULL;

-- 3) 补齐现有表缺失的开发字段。
ALTER TABLE `cloud1-2grufevs395a9d5e`.`question_generation_engine`
  ADD COLUMN `question_role_default` VARCHAR(64) NULL COMMENT '生成规则默认问题类别',
  ADD COLUMN `effect_mode_default` VARCHAR(64) NULL COMMENT '生成规则默认答案影响方式',
  ADD COLUMN `help_template_user_cn` TEXT NULL COMMENT '用户可见帮助模板',
  ADD COLUMN `template_variables_json` TEXT NULL COMMENT '模板变量声明 JSON 文本',
  ADD COLUMN `fallback_values_json` TEXT NULL COMMENT '变量缺失时的兜底值 JSON 文本',
  ADD COLUMN `render_policy` VARCHAR(32) NULL COMMENT 'strict|fallback',
  ADD COLUMN `option_template_json` TEXT NULL COMMENT '动态选项模板声明 JSON 文本';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`user_plant_instances`
  ADD COLUMN `light_environment_json` JSON NULL COMMENT '用户填写的光照环境，结构与诊断 userLightContext 一致',
  ADD COLUMN `pot_top_diameter_cm` DECIMAL(6,2) NULL COMMENT '盆口直径，单位 cm',
  ADD COLUMN `pot_bottom_diameter_cm` DECIMAL(6,2) NULL COMMENT '盆底直径，单位 cm',
  ADD COLUMN `pot_height_cm` DECIMAL(6,2) NULL COMMENT '盆高，单位 cm',
  ADD COLUMN `has_drainage_hole` VARCHAR(16) NOT NULL DEFAULT 'unknown' COMMENT '是否有排水孔：true/false/unknown',
  ADD COLUMN `pot_material` VARCHAR(32) NOT NULL DEFAULT 'unknown' COMMENT '盆器材质：plastic/ceramic/terracotta/glazed/unknown',
  ADD COLUMN `substrate_type` VARCHAR(2048) NOT NULL DEFAULT 'unknown' COMMENT '基质类型：允许 JSON 数组字符串（多选+比例）或单值',
  ADD COLUMN `pot_profile_version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '盆型画像版本',
  ADD COLUMN `pot_profile_source` VARCHAR(32) NOT NULL DEFAULT 'default' COMMENT '盆型画像来源：user/default/inferred',
  ADD COLUMN `pot_profile_confidence` VARCHAR(16) NOT NULL DEFAULT 'low' COMMENT '盆型画像置信度：low/normal/high',
  ADD COLUMN `air_environment_json` JSON NULL COMMENT '用户填写的通风环境',
  ADD COLUMN `fertilization_guard_json` JSON NULL COMMENT '施肥暂缓状态，由明确诊断结果生成；过期后读取时解除';

-- 4) 三张生产空表原本是旧导入结构；因确认 0 行，修复为开发库 canonical 类型和索引。
ALTER TABLE `cloud1-2grufevs395a9d5e`.`diagnosis_weather_evidence`
  DROP PRIMARY KEY,
  CHANGE COLUMN `id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  CHANGE COLUMN `diagnosis_session_id` `diagnosis_session_id` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '诊断会话 ID',
  CHANGE COLUMN `location_key` `location_key` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '天气地点键',
  CHANGE COLUMN `weather_object_path` `weather_object_path` VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'recent-10d.json 对象路径',
  CHANGE COLUMN `source_kind` `source_kind` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '天气证据来源类型',
  CHANGE COLUMN `quality` `quality` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '天气证据质量',
  CHANGE COLUMN `generated_at` `generated_at` DATETIME NULL COMMENT '天气对象生成时间',
  CHANGE COLUMN `referenced_at` `referenced_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '诊断引用时间',
  CHANGE COLUMN `created_at` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_diagnosis_weather_evidence_session` (`diagnosis_session_id`),
  ADD KEY `idx_diagnosis_weather_evidence_location` (`location_key`, `referenced_at`),
  ADD KEY `idx_diagnosis_weather_evidence_object_path` (`weather_object_path`(191));
ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_care_locations`
  DROP PRIMARY KEY,
  DROP INDEX `lcap-index-plant_id`,
  CHANGE COLUMN `id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  CHANGE COLUMN `_openid` `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 权限模型用户 OpenID',
  CHANGE COLUMN `plant_id` `plant_id` BIGINT UNSIGNED NOT NULL COMMENT '用户植物实例 ID',
  CHANGE COLUMN `user_id` `user_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '业务用户标识，默认与 _openid 一致',
  CHANGE COLUMN `location_key` `location_key` VARCHAR(128) NOT NULL COMMENT '天气缓存地点键',
  CHANGE COLUMN `city_name` `city_name` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '养护城市名',
  CHANGE COLUMN `latitude` `latitude` DECIMAL(9,4) NOT NULL COMMENT '城市纬度',
  CHANGE COLUMN `longitude` `longitude` DECIMAL(10,4) NOT NULL COMMENT '城市经度',
  CHANGE COLUMN `weather_location` `weather_location` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '天气查询坐标，格式 longitude,latitude',
  CHANGE COLUMN `source` `source` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '来源：gps_matched/manual_selected/legacy_user_location',
  CHANGE COLUMN `created_at` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  CHANGE COLUMN `updated_at` `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_plant_care_locations_openid_plant` (`_openid`, `plant_id`),
  ADD KEY `idx_plant_care_locations_location_key` (`location_key`),
  ADD KEY `idx_plant_care_locations_source` (`source`),
  ADD KEY `idx_plant_care_locations_user_id` (`user_id`);
ALTER TABLE `cloud1-2grufevs395a9d5e`.`weather_locations`
  DROP PRIMARY KEY,
  DROP INDEX `lcap-index-location_key`,
  CHANGE COLUMN `id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  CHANGE COLUMN `location_key` `location_key` VARCHAR(128) NOT NULL COMMENT '业务地点键，用于对象存储路径',
  CHANGE COLUMN `qweather_location_id` `qweather_location_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '和风 LocationID',
  CHANGE COLUMN `city_name` `city_name` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '城市或业务地点名',
  CHANGE COLUMN `timezone` `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT '地点时区',
  CHANGE COLUMN `is_active` `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用采集',
  CHANGE COLUMN `last_used_at` `last_used_at` DATETIME NULL COMMENT '最近被业务使用时间',
  CHANGE COLUMN `recent_object_path` `recent_object_path` VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'recent-10d.json 对象路径',
  CHANGE COLUMN `recent_file_id` `recent_file_id` VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'recent-10d.json 文件 ID',
  CHANGE COLUMN `manifest_object_path` `manifest_object_path` VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'manifest.json 对象路径',
  CHANGE COLUMN `manifest_file_id` `manifest_file_id` VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'manifest.json 文件 ID',
  CHANGE COLUMN `recent_generated_at` `recent_generated_at` DATETIME NULL COMMENT 'recent-10d.json 生成时间',
  CHANGE COLUMN `created_at` `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  CHANGE COLUMN `updated_at` `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_weather_locations_location_key` (`location_key`),
  ADD KEY `idx_weather_locations_active` (`is_active`, `updated_at`),
  ADD KEY `idx_weather_locations_qweather_location_id` (`qweather_location_id`);

-- 5) 开发库使用更宽的字符串容量；对生产有数据表只做安全扩容，不做缩容。
ALTER TABLE `cloud1-2grufevs395a9d5e`.`diagnosis_sessions`
  MODIFY COLUMN `plant_genus` VARCHAR(255) NULL,
  MODIFY COLUMN `plant_family` VARCHAR(255) NULL;

-- 6) 统一三个仍为 utf8mb3 的生产表；utf8mb4 是开发库的字符集上限。
ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_identity_diagnosis_links`
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_call_aggregate_results`
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_supervision_records`
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 7) 同步表级说明，便于生产排障和审计。
ALTER TABLE `cloud1-2grufevs395a9d5e`.`genus_care_profiles` COMMENT='属级养护基线表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_identity_aliases` COMMENT='植物身份别名表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_identity_entities` COMMENT='植物身份主表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_identity_resolution_records` COMMENT='植物身份解析记录表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_admission_records` COMMENT='视觉接纳判定记录表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_call_aggregate_results` COMMENT='视觉调用聚合结果表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_call_batches` COMMENT='视觉调用批次主记录表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_normalized_image_results` COMMENT='单图视觉标准化结果表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_raw_image_records` COMMENT='单图视觉原始记录表';
ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_supervision_records` COMMENT='视觉监督记录表';
