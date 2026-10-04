-- Care v2：统一 Ephemeral 语义 + 新确定性派生类型。

ALTER TABLE `care_environment_derivations`
  DROP CHECK `ck_environment_derivation_type`,
  MODIFY COLUMN `derivation_type` VARCHAR(48) NOT NULL COMMENT 'v2 环境/栽培派生类型：estimated_indoor_environment、air_vpd、window_plane_irradiance、light_exposure、air_movement_proxy、environmental_drying_demand、cultivation_retention',
  ADD CONSTRAINT `ck_environment_derivation_type` CHECK (`derivation_type` IN (
    'estimated_indoor_environment',
    'air_vpd',
    'window_plane_irradiance',
    'light_exposure',
    'air_movement_proxy',
    'environmental_drying_demand',
    'cultivation_retention'
  ));

CREATE TABLE `care_decision_derivations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '养护决策派生内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `derivation_ref` VARCHAR(64) NOT NULL COMMENT '高熵决策派生公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `environment_snapshot_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '本次决策锁定的环境输入快照内部主键',
  `derivation_type` VARCHAR(40) NOT NULL COMMENT '决策派生类型：growth_activity_state、personal_calibration、dry_progress',
  `algorithm_release_ref` VARCHAR(64) NOT NULL COMMENT '不可变算法/Prompt 发布公开引用',
  `algorithm_release_sha256` CHAR(64) NOT NULL COMMENT '算法/Prompt 发布内容 SHA-256',
  `input_manifest_sha256` CHAR(64) NOT NULL COMMENT '与输入快照一致的规范化输入清单 SHA-256',
  `result_schema_version` VARCHAR(48) NOT NULL COMMENT '派生结果结构版本',
  `result_json` JSON NOT NULL COMMENT '按派生类型 Schema 校验的结构化结果；不保存思维链',
  `result_sha256` CHAR(64) NOT NULL COMMENT '规范化派生结果 SHA-256',
  `confidence_band` VARCHAR(16) NOT NULL COMMENT '派生可信程度：low、medium、high',
  `generated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '派生结果生成时间，UTC 毫秒',
  `valid_until_ms` BIGINT UNSIGNED NOT NULL COMMENT '派生结果允许用于新决策的截止时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒；不可变记录应与创建时间相同',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_care_decision_derivation_ref` (`derivation_ref`),
  UNIQUE KEY `uq_care_decision_derivation_release` (`environment_snapshot_internal_id`, `derivation_type`, `algorithm_release_ref`, `algorithm_release_sha256`),
  KEY `idx_care_decision_derivation_owner` (`user_internal_id`, `user_plant_internal_id`, `derivation_type`, `valid_until_ms`),
  CONSTRAINT `fk_care_decision_derivation_snapshot` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`, `environment_snapshot_internal_id`) REFERENCES `care_environment_snapshots` (`user_internal_id`, `user_plant_internal_id`, `id`),
  CONSTRAINT `ck_care_decision_derivation_type` CHECK (`derivation_type` IN ('growth_activity_state', 'personal_calibration', 'dry_progress')),
  CONSTRAINT `ck_care_decision_derivation_confidence` CHECK (`confidence_band` IN ('low', 'medium', 'high')),
  CONSTRAINT `ck_care_decision_derivation_algorithm_sha` CHECK (REGEXP_LIKE(`algorithm_release_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_care_decision_derivation_input_sha` CHECK (REGEXP_LIKE(`input_manifest_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_care_decision_derivation_result_sha` CHECK (REGEXP_LIKE(`result_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_care_decision_derivation_time` CHECK (`valid_until_ms` > `generated_at_ms` AND `created_at_ms` = `generated_at_ms` AND `updated_at_ms` = `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 不可变养护决策派生';

ALTER TABLE `temporary_care_sessions`
  MODIFY COLUMN `guest_plant_case_internal_id` BIGINT UNSIGNED NULL COMMENT '游客 Ephemeral backing case；与 authenticated 字段二选一',
  ADD COLUMN `authenticated_ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '已登录用户 Ephemeral backing case；与 guest 字段二选一' AFTER `guest_plant_case_internal_id`,
  ADD KEY `idx_temporary_care_authenticated_case` (`authenticated_ephemeral_case_internal_id`, `status`, `expires_at_ms`),
  ADD CONSTRAINT `fk_temporary_care_authenticated_case` FOREIGN KEY (`authenticated_ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`),
  ADD CONSTRAINT `ck_temporary_care_one_ephemeral_case` CHECK ((`guest_plant_case_internal_id` IS NOT NULL) <> (`authenticated_ephemeral_case_internal_id` IS NOT NULL));

ALTER TABLE `temporary_care_results`
  MODIFY COLUMN `guest_plant_case_internal_id` BIGINT UNSIGNED NULL COMMENT '游客 Ephemeral backing case；与 authenticated 字段二选一',
  MODIFY COLUMN `derivations_json` JSON NOT NULL COMMENT '临时案例按合同验证的环境/栽培派生与决策派生，包含单位/证据/置信度/有效期；不保存思维链',
  ADD COLUMN `authenticated_ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '已登录用户 Ephemeral backing case；与 guest 字段二选一' AFTER `guest_plant_case_internal_id`,
  ADD KEY `idx_temporary_care_result_authenticated_case` (`authenticated_ephemeral_case_internal_id`, `expires_at_ms`),
  ADD CONSTRAINT `fk_temporary_care_result_authenticated_case` FOREIGN KEY (`authenticated_ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`),
  ADD CONSTRAINT `ck_temporary_care_result_one_ephemeral_case` CHECK ((`guest_plant_case_internal_id` IS NOT NULL) <> (`authenticated_ephemeral_case_internal_id` IS NOT NULL));

ALTER TABLE `temporary_watering_visual_evidence`
  MODIFY COLUMN `guest_plant_case_internal_id` BIGINT UNSIGNED NULL COMMENT '游客 Ephemeral backing case；与 authenticated 字段二选一',
  ADD COLUMN `authenticated_ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '已登录用户 Ephemeral backing case；与 guest 字段二选一' AFTER `guest_plant_case_internal_id`,
  ADD KEY `idx_temporary_watering_authenticated_case` (`authenticated_ephemeral_case_internal_id`, `expires_at_ms`),
  ADD CONSTRAINT `fk_temporary_watering_authenticated_case` FOREIGN KEY (`authenticated_ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`),
  ADD CONSTRAINT `ck_temporary_watering_one_ephemeral_case` CHECK ((`guest_plant_case_internal_id` IS NOT NULL) <> (`authenticated_ephemeral_case_internal_id` IS NOT NULL));

ALTER TABLE `temporary_diagnosis_sessions`
  MODIFY COLUMN `guest_plant_case_internal_id` BIGINT UNSIGNED NULL COMMENT '游客 Ephemeral backing case；与 authenticated 字段二选一',
  ADD COLUMN `authenticated_ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '已登录用户 Ephemeral backing case；与 guest 字段二选一' AFTER `guest_plant_case_internal_id`,
  ADD KEY `idx_temporary_diagnosis_authenticated_case` (`authenticated_ephemeral_case_internal_id`, `status`, `expires_at_ms`),
  ADD CONSTRAINT `fk_temporary_diagnosis_authenticated_case` FOREIGN KEY (`authenticated_ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`),
  ADD CONSTRAINT `ck_temporary_diagnosis_one_ephemeral_case` CHECK ((`guest_plant_case_internal_id` IS NOT NULL) <> (`authenticated_ephemeral_case_internal_id` IS NOT NULL));

ALTER TABLE `temporary_diagnosis_answers`
  MODIFY COLUMN `guest_plant_case_internal_id` BIGINT UNSIGNED NULL COMMENT '游客 Ephemeral backing case；与 authenticated 字段二选一',
  ADD COLUMN `authenticated_ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '已登录用户 Ephemeral backing case；与 guest 字段二选一' AFTER `guest_plant_case_internal_id`,
  ADD CONSTRAINT `fk_temporary_answer_authenticated_case` FOREIGN KEY (`authenticated_ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`),
  ADD CONSTRAINT `ck_temporary_answer_one_ephemeral_case` CHECK ((`guest_plant_case_internal_id` IS NOT NULL) <> (`authenticated_ephemeral_case_internal_id` IS NOT NULL));

ALTER TABLE `temporary_diagnosis_results`
  MODIFY COLUMN `guest_plant_case_internal_id` BIGINT UNSIGNED NULL COMMENT '游客 Ephemeral backing case；与 authenticated 字段二选一',
  ADD COLUMN `authenticated_ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '已登录用户 Ephemeral backing case；与 guest 字段二选一' AFTER `guest_plant_case_internal_id`,
  ADD CONSTRAINT `fk_temporary_result_authenticated_case` FOREIGN KEY (`authenticated_ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`),
  ADD CONSTRAINT `ck_temporary_result_one_ephemeral_case` CHECK ((`guest_plant_case_internal_id` IS NOT NULL) <> (`authenticated_ephemeral_case_internal_id` IS NOT NULL));

ALTER TABLE `temporary_diagnosis_visual_evidence`
  MODIFY COLUMN `guest_plant_case_internal_id` BIGINT UNSIGNED NULL COMMENT '游客 Ephemeral backing case；与 authenticated 字段二选一',
  ADD COLUMN `authenticated_ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '已登录用户 Ephemeral backing case；与 guest 字段二选一' AFTER `guest_plant_case_internal_id`,
  ADD KEY `idx_temporary_diagnosis_visual_authenticated_case` (`authenticated_ephemeral_case_internal_id`, `expires_at_ms`),
  ADD CONSTRAINT `fk_temporary_visual_authenticated_case` FOREIGN KEY (`authenticated_ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`),
  ADD CONSTRAINT `ck_temporary_visual_one_ephemeral_case` CHECK ((`guest_plant_case_internal_id` IS NOT NULL) <> (`authenticated_ephemeral_case_internal_id` IS NOT NULL));
