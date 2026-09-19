-- 青花植后端 v2 / care 与 diagnosis 域空库 DDL。
-- 长期记录必须双重归属统一用户和用户植物；游客临时记录只归属游客植物案例。

CREATE TABLE `care_facts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '养护事实内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `fact_ref` VARCHAR(64) NOT NULL COMMENT '高熵不可变事实公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `fact_type` VARCHAR(32) NOT NULL COMMENT '事实类型：watering、fertilizing、repotting、location_change、observation',
  `occurred_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '实际发生时间，UTC 毫秒',
  `fact_payload_json` JSON NOT NULL COMMENT '已确认事实的结构化载荷',
  `source_command_ref` VARCHAR(64) NOT NULL COMMENT '产生事实的用户确认命令引用',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_care_fact_ref` (`fact_ref`),
  UNIQUE KEY `uq_care_fact_source` (`source_command_ref`),
  KEY `idx_care_fact_owner_time` (`user_internal_id`, `user_plant_internal_id`, `occurred_at_ms`),
  CONSTRAINT `fk_care_fact_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 用户确认的不可变养护事实';

CREATE TABLE `care_proposals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '养护建议内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `proposal_ref` VARCHAR(64) NOT NULL COMMENT '高熵养护建议公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `capability_type` VARCHAR(24) NOT NULL COMMENT '能力：watering、fertilizing、lighting、ventilation',
  `contract_version` VARCHAR(48) NOT NULL COMMENT '统一养护输出合同版本',
  `details_schema_version` VARCHAR(48) NOT NULL COMMENT '能力详情结构版本',
  `result_json` JSON NOT NULL COMMENT '已脱敏统一养护能力结果',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：proposed、confirmed、dismissed、expired',
  `valid_until_ms` BIGINT UNSIGNED NULL COMMENT '建议有效截止时间，UTC 毫秒',
  `idempotency_key` VARCHAR(128) NOT NULL COMMENT '产品动作幂等键',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_care_proposal_ref` (`proposal_ref`),
  UNIQUE KEY `uq_care_proposal_idempotency` (`user_internal_id`, `idempotency_key`),
  KEY `idx_care_proposal_owner` (`user_internal_id`, `user_plant_internal_id`, `status`),
  CONSTRAINT `fk_care_proposal_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 养护能力建议';

CREATE TABLE `care_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '养护计划内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `plan_ref` VARCHAR(64) NOT NULL COMMENT '高熵养护计划公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `proposal_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '用户确认的来源建议',
  `plan_type` VARCHAR(32) NOT NULL COMMENT '计划类型',
  `scheduled_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '计划执行时间，UTC 毫秒',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：planned、completed、cancelled、expired',
  `plan_payload_json` JSON NOT NULL COMMENT '计划结构化载荷',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观并发版本',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_care_plan_ref` (`plan_ref`),
  UNIQUE KEY `uq_care_plan_proposal` (`proposal_internal_id`),
  KEY `idx_care_plan_due` (`user_internal_id`, `user_plant_internal_id`, `status`, `scheduled_at_ms`),
  CONSTRAINT `fk_care_plan_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `fk_care_plan_proposal` FOREIGN KEY (`proposal_internal_id`) REFERENCES `care_proposals` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 用户确认后的养护计划';

CREATE TABLE `reminder_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '提醒任务内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `reminder_ref` VARCHAR(64) NOT NULL COMMENT '高熵提醒公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `care_plan_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '来源养护计划',
  `next_attempt_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '下次投递时间，UTC 毫秒',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：pending、dispatching、delivered、cancelled、dead_letter',
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '投递尝试次数',
  `lease_until_ms` BIGINT UNSIGNED NULL COMMENT '任务租约失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reminder_ref` (`reminder_ref`),
  UNIQUE KEY `uq_reminder_plan` (`care_plan_internal_id`),
  KEY `idx_reminder_dispatch` (`status`, `next_attempt_at_ms`, `lease_until_ms`),
  CONSTRAINT `fk_reminder_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `fk_reminder_plan` FOREIGN KEY (`care_plan_internal_id`) REFERENCES `care_plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 养护提醒任务';

CREATE TABLE `watering_visual_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '盆土视觉证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `evidence_ref` VARCHAR(64) NOT NULL COMMENT '高熵视觉证据公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `asset_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '私有图片资产内部主键',
  `soil_surface_state` VARCHAR(24) NOT NULL COMMENT '盆土表面状态枚举',
  `confidence_band` VARCHAR(16) NOT NULL COMMENT '置信区间：low、medium、high',
  `algorithm_version` VARCHAR(64) NOT NULL COMMENT '视觉诊断算法版本',
  `observed_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '观察时间，UTC 毫秒',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '证据失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_watering_visual_ref` (`evidence_ref`),
  KEY `idx_watering_visual_owner` (`user_internal_id`, `user_plant_internal_id`, `expires_at_ms`),
  CONSTRAINT `fk_watering_visual_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `fk_watering_visual_asset` FOREIGN KEY (`asset_internal_id`) REFERENCES `user_plant_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 盆土表面视觉证据';

CREATE TABLE `weather_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '天气快照内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `snapshot_ref` VARCHAR(64) NOT NULL COMMENT '高熵天气快照引用',
  `provider` VARCHAR(32) NOT NULL COMMENT '天气提供方',
  `location_key_hash` CHAR(64) NOT NULL COMMENT '脱敏规范位置键摘要',
  `snapshot_kind` VARCHAR(24) NOT NULL COMMENT '快照类型：history、current、forecast',
  `provider_version` VARCHAR(64) NOT NULL COMMENT '供应商合同版本',
  `payload_json` JSON NOT NULL COMMENT '经适配器校验的天气证据',
  `payload_hash` CHAR(64) NOT NULL COMMENT '规范化天气载荷 SHA-256',
  `observed_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '天气观测时间，UTC 毫秒',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '缓存失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weather_snapshot_ref` (`snapshot_ref`),
  UNIQUE KEY `uq_weather_snapshot_payload` (`provider`, `location_key_hash`, `snapshot_kind`, `observed_at_ms`),
  KEY `idx_weather_cache` (`location_key_hash`, `snapshot_kind`, `expires_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 带来源版本的天气证据快照';

CREATE TABLE `temporary_care_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '游客临时养护会话内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `session_ref` VARCHAR(64) NOT NULL COMMENT '高熵临时养护会话引用',
  `guest_plant_case_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属单株游客植物案例',
  `capability_type` VARCHAR(24) NOT NULL COMMENT '临时能力类型',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：active、completed、failed、expired',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_care_session_ref` (`session_ref`),
  KEY `idx_temporary_care_case` (`guest_plant_case_internal_id`, `status`, `expires_at_ms`),
  CONSTRAINT `fk_temporary_care_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 游客临时养护会话';

CREATE TABLE `temporary_care_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '游客临时养护结果内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `result_ref` VARCHAR(64) NOT NULL COMMENT '高熵临时养护结果引用',
  `temporary_care_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属临时养护会话',
  `guest_plant_case_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属单株游客植物案例',
  `contract_version` VARCHAR(48) NOT NULL COMMENT '统一养护输出合同版本',
  `details_schema_version` VARCHAR(48) NOT NULL COMMENT '能力详情结构版本',
  `result_json` JSON NOT NULL COMMENT '一次性脱敏结果',
  `generated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '结果生成时间，UTC 毫秒',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '结果失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_care_result_ref` (`result_ref`),
  KEY `idx_temporary_care_result_case` (`guest_plant_case_internal_id`, `expires_at_ms`),
  CONSTRAINT `fk_temporary_care_result_session` FOREIGN KEY (`temporary_care_session_internal_id`) REFERENCES `temporary_care_sessions` (`id`),
  CONSTRAINT `fk_temporary_care_result_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 游客临时养护结果';

CREATE TABLE `temporary_watering_visual_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '游客盆土视觉证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `evidence_ref` VARCHAR(64) NOT NULL COMMENT '高熵临时视觉证据引用',
  `guest_plant_case_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属单株游客植物案例',
  `storage_file_id` VARCHAR(512) NOT NULL COMMENT '临时私有文件标识',
  `soil_surface_state` VARCHAR(24) NOT NULL COMMENT '盆土表面状态枚举',
  `algorithm_version` VARCHAR(64) NOT NULL COMMENT '视觉诊断算法版本',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '证据失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_watering_visual_ref` (`evidence_ref`),
  UNIQUE KEY `uq_temporary_watering_file` (`storage_file_id`),
  KEY `idx_temporary_watering_case` (`guest_plant_case_internal_id`, `expires_at_ms`),
  CONSTRAINT `fk_temporary_watering_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 游客临时盆土视觉证据';

CREATE TABLE `diagnosis_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '诊断会话内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `diagnosis_ref` VARCHAR(64) NOT NULL COMMENT '高熵诊断公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `symptom_type` VARCHAR(32) NOT NULL COMMENT '症状类型',
  `question_package_release_ref` VARCHAR(64) NOT NULL COMMENT '不可变题包发布引用',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：active、completed、failed、expired',
  `started_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '开始时间，UTC 毫秒',
  `completed_at_ms` BIGINT UNSIGNED NULL COMMENT '完成时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diagnosis_ref` (`diagnosis_ref`),
  KEY `idx_diagnosis_owner_time` (`user_internal_id`, `user_plant_internal_id`, `started_at_ms`),
  CONSTRAINT `fk_diagnosis_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 用户植物诊断会话';

CREATE TABLE `diagnosis_answers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '诊断答案内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `answer_ref` VARCHAR(64) NOT NULL COMMENT '高熵诊断答案引用',
  `diagnosis_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断会话',
  `question_key` VARCHAR(128) NOT NULL COMMENT '题包问题稳定键',
  `answer_json` JSON NOT NULL COMMENT '结构化用户答案',
  `answered_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '回答时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diagnosis_answer_ref` (`answer_ref`),
  UNIQUE KEY `uq_diagnosis_question_answer` (`diagnosis_session_internal_id`, `question_key`),
  CONSTRAINT `fk_diagnosis_answer_session` FOREIGN KEY (`diagnosis_session_internal_id`) REFERENCES `diagnosis_sessions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 诊断结构化答案';

CREATE TABLE `diagnosis_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '诊断结果内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `result_ref` VARCHAR(64) NOT NULL COMMENT '高熵诊断结果公开引用',
  `diagnosis_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断会话',
  `result_version` VARCHAR(48) NOT NULL COMMENT '诊断结果合同版本',
  `evidence_summary_json` JSON NOT NULL COMMENT '脱敏证据摘要',
  `conclusion_json` JSON NOT NULL COMMENT '诊断结论与不确定性',
  `proposal_json` JSON NOT NULL COMMENT '建议动作，不是事实或计划',
  `generated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '结果生成时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diagnosis_result_ref` (`result_ref`),
  UNIQUE KEY `uq_diagnosis_session_result` (`diagnosis_session_internal_id`),
  CONSTRAINT `fk_diagnosis_result_session` FOREIGN KEY (`diagnosis_session_internal_id`) REFERENCES `diagnosis_sessions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 诊断结果与建议';

CREATE TABLE `diagnosis_visual_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '诊断视觉证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `evidence_ref` VARCHAR(64) NOT NULL COMMENT '高熵诊断视觉证据引用',
  `diagnosis_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属诊断会话',
  `asset_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '私有用户植物资产内部主键',
  `evidence_kind` VARCHAR(32) NOT NULL COMMENT '证据类型：leaf、stem、soil_surface、whole_plant',
  `model_contract_version` VARCHAR(64) NOT NULL COMMENT '视觉模型输出合同版本',
  `evidence_json` JSON NOT NULL COMMENT '结构化视觉证据，不保存模型原文',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '证据清理时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diagnosis_visual_ref` (`evidence_ref`),
  KEY `idx_diagnosis_visual_session` (`diagnosis_session_internal_id`, `expires_at_ms`),
  CONSTRAINT `fk_diagnosis_visual_session` FOREIGN KEY (`diagnosis_session_internal_id`) REFERENCES `diagnosis_sessions` (`id`),
  CONSTRAINT `fk_diagnosis_visual_asset` FOREIGN KEY (`asset_internal_id`) REFERENCES `user_plant_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 私有诊断视觉证据';

CREATE TABLE `temporary_diagnosis_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '游客临时诊断会话内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `diagnosis_ref` VARCHAR(64) NOT NULL COMMENT '高熵临时诊断引用',
  `guest_plant_case_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属单株游客植物案例',
  `symptom_type` VARCHAR(32) NOT NULL COMMENT '症状类型',
  `question_package_release_ref` VARCHAR(64) NOT NULL COMMENT '不可变题包发布引用',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：active、completed、failed、expired',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_diagnosis_ref` (`diagnosis_ref`),
  KEY `idx_temporary_diagnosis_case` (`guest_plant_case_internal_id`, `status`, `expires_at_ms`),
  CONSTRAINT `fk_temporary_diagnosis_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 游客临时诊断会话';

CREATE TABLE `temporary_diagnosis_answers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '游客临时诊断答案内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `answer_ref` VARCHAR(64) NOT NULL COMMENT '高熵临时答案引用',
  `temporary_diagnosis_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属临时诊断会话',
  `guest_plant_case_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属单株游客植物案例',
  `question_key` VARCHAR(128) NOT NULL COMMENT '题包问题稳定键',
  `answer_json` JSON NOT NULL COMMENT '结构化游客答案',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_diagnosis_answer_ref` (`answer_ref`),
  UNIQUE KEY `uq_temporary_question_answer` (`temporary_diagnosis_session_internal_id`, `question_key`),
  CONSTRAINT `fk_temporary_answer_session` FOREIGN KEY (`temporary_diagnosis_session_internal_id`) REFERENCES `temporary_diagnosis_sessions` (`id`),
  CONSTRAINT `fk_temporary_answer_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 游客临时诊断答案';

CREATE TABLE `temporary_diagnosis_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '游客临时诊断结果内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `result_ref` VARCHAR(64) NOT NULL COMMENT '高熵临时诊断结果引用',
  `temporary_diagnosis_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属临时诊断会话',
  `guest_plant_case_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属单株游客植物案例',
  `result_version` VARCHAR(48) NOT NULL COMMENT '诊断结果合同版本',
  `result_json` JSON NOT NULL COMMENT '一次性脱敏诊断结果与建议',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_diagnosis_result_ref` (`result_ref`),
  UNIQUE KEY `uq_temporary_diagnosis_result_session` (`temporary_diagnosis_session_internal_id`),
  CONSTRAINT `fk_temporary_result_session` FOREIGN KEY (`temporary_diagnosis_session_internal_id`) REFERENCES `temporary_diagnosis_sessions` (`id`),
  CONSTRAINT `fk_temporary_result_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 游客临时诊断结果';

CREATE TABLE `temporary_diagnosis_visual_evidence` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '游客临时诊断视觉证据内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `evidence_ref` VARCHAR(64) NOT NULL COMMENT '高熵临时诊断视觉证据引用',
  `temporary_diagnosis_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属临时诊断会话',
  `guest_plant_case_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属单株游客植物案例',
  `storage_file_id` VARCHAR(512) NOT NULL COMMENT '临时私有文件标识',
  `evidence_kind` VARCHAR(32) NOT NULL COMMENT '视觉证据类型',
  `evidence_json` JSON NOT NULL COMMENT '结构化视觉证据',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '清理时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_diagnosis_visual_ref` (`evidence_ref`),
  UNIQUE KEY `uq_temporary_diagnosis_file` (`storage_file_id`),
  KEY `idx_temporary_diagnosis_visual_case` (`guest_plant_case_internal_id`, `expires_at_ms`),
  CONSTRAINT `fk_temporary_visual_session` FOREIGN KEY (`temporary_diagnosis_session_internal_id`) REFERENCES `temporary_diagnosis_sessions` (`id`),
  CONSTRAINT `fk_temporary_visual_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 游客临时诊断视觉证据';
