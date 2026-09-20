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

CREATE TABLE `care_environment_observations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '原子环境事实内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `observation_ref` VARCHAR(64) NOT NULL COMMENT '高熵原子环境事实公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `factor_type` VARCHAR(32) NOT NULL COMMENT '原子因素：light、air_temperature、relative_humidity、air_movement、pot、substrate、drainage、soil_surface',
  `source_scope` VARCHAR(24) NOT NULL COMMENT '证据空间范围：indoor、outdoor、plant_zone、pot',
  `source_kind` VARCHAR(32) NOT NULL COMMENT '来源：user_context、weather_adapter、indoor_sensor、visual_evidence、confirmed_fact',
  `source_ref` VARCHAR(128) NOT NULL COMMENT '来源对象公开引用或不可逆摘要，不保存私有 URL',
  `contract_version` VARCHAR(48) NOT NULL COMMENT '原子环境事实合同版本',
  `normalized_value_json` JSON NOT NULL COMMENT '按 factor 类型 Schema 校验的单一规范值',
  `unit_code` VARCHAR(24) NOT NULL COMMENT '规范单位代码；无量纲分类固定为 none',
  `confidence_band` VARCHAR(16) NOT NULL COMMENT '证据质量：low、medium、high',
  `evidence_sha256` CHAR(64) NOT NULL COMMENT '规范化原子事实内容 SHA-256',
  `observed_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '事实观察时间，UTC 毫秒',
  `valid_until_ms` BIGINT UNSIGNED NULL COMMENT '允许参与计算的截止时间；长期配置事实可为空',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒；不可变记录应与创建时间相同',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_environment_observation_ref` (`observation_ref`),
  UNIQUE KEY `uq_environment_observation_source` (`user_internal_id`, `user_plant_internal_id`, `source_kind`, `source_ref`, `factor_type`, `observed_at_ms`),
  KEY `idx_environment_observation_owner` (`user_internal_id`, `user_plant_internal_id`, `factor_type`, `observed_at_ms`),
  CONSTRAINT `fk_environment_observation_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `ck_environment_observation_factor` CHECK (`factor_type` IN ('light', 'air_temperature', 'relative_humidity', 'air_movement', 'pot', 'substrate', 'drainage', 'soil_surface')),
  CONSTRAINT `ck_environment_observation_scope` CHECK (`source_scope` IN ('indoor', 'outdoor', 'plant_zone', 'pot')),
  CONSTRAINT `ck_environment_observation_source` CHECK (`source_kind` IN ('user_context', 'weather_adapter', 'indoor_sensor', 'visual_evidence', 'confirmed_fact')),
  CONSTRAINT `ck_environment_observation_weather_scope` CHECK (`source_kind` <> 'weather_adapter' OR `source_scope` = 'outdoor'),
  CONSTRAINT `ck_environment_observation_confidence` CHECK (`confidence_band` IN ('low', 'medium', 'high')),
  CONSTRAINT `ck_environment_observation_sha` CHECK (REGEXP_LIKE(`evidence_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_environment_observation_time` CHECK ((`valid_until_ms` IS NULL OR `valid_until_ms` > `observed_at_ms`) AND `created_at_ms` >= `observed_at_ms` AND `updated_at_ms` = `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 不可变原子环境事实';

CREATE TABLE `care_environment_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '养护环境输入快照内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `snapshot_ref` VARCHAR(64) NOT NULL COMMENT '高熵不可变环境输入快照公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `care_context_version` INT UNSIGNED NOT NULL COMMENT '本次计算锁定的用户植物养护环境版本',
  `configuration_snapshot_ref` VARCHAR(64) NOT NULL COMMENT '请求级业务策略与 Provider 配置快照引用',
  `input_manifest_json` JSON NOT NULL COMMENT '原子观察、天气、盆土、最近事实与知识 release 的规范化引用清单',
  `input_manifest_sha256` CHAR(64) NOT NULL COMMENT '规范化输入引用清单 SHA-256',
  `evidence_window_start_ms` BIGINT UNSIGNED NOT NULL COMMENT '输入证据时间窗起点，UTC 毫秒',
  `evidence_window_end_ms` BIGINT UNSIGNED NOT NULL COMMENT '输入证据时间窗终点，UTC 毫秒',
  `generated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '输入快照生成时间，UTC 毫秒',
  `valid_until_ms` BIGINT UNSIGNED NOT NULL COMMENT '该输入快照允许产生新结论的截止时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒；不可变记录应与创建时间相同',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_environment_snapshot_ref` (`snapshot_ref`),
  UNIQUE KEY `uq_environment_snapshot_manifest` (`user_internal_id`, `user_plant_internal_id`, `input_manifest_sha256`),
  UNIQUE KEY `uq_environment_snapshot_owner_id` (`user_internal_id`, `user_plant_internal_id`, `id`),
  KEY `idx_environment_snapshot_owner_time` (`user_internal_id`, `user_plant_internal_id`, `generated_at_ms`),
  CONSTRAINT `fk_environment_snapshot_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `ck_environment_snapshot_context_version` CHECK (`care_context_version` > 0),
  CONSTRAINT `ck_environment_snapshot_sha` CHECK (REGEXP_LIKE(`input_manifest_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_environment_snapshot_time` CHECK (`evidence_window_end_ms` >= `evidence_window_start_ms` AND `generated_at_ms` >= `evidence_window_end_ms` AND `valid_until_ms` > `generated_at_ms` AND `created_at_ms` = `generated_at_ms` AND `updated_at_ms` = `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 不可变养护环境输入快照';

CREATE TABLE `care_environment_derivations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '派生环境指标内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `derivation_ref` VARCHAR(64) NOT NULL COMMENT '高熵派生环境指标公开引用',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `environment_snapshot_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '唯一输入快照内部主键',
  `derivation_type` VARCHAR(40) NOT NULL COMMENT '派生类型：vapor_pressure_deficit、light_exposure、air_exchange、substrate_drying_trait、environmental_drying_demand、estimated_dry_down',
  `algorithm_release_ref` VARCHAR(64) NOT NULL COMMENT '不可变算法发布公开引用',
  `algorithm_release_sha256` CHAR(64) NOT NULL COMMENT '算法发布内容 SHA-256',
  `input_manifest_sha256` CHAR(64) NOT NULL COMMENT '从输入快照复制并核对的规范化输入清单 SHA-256',
  `result_schema_version` VARCHAR(48) NOT NULL COMMENT '派生结果结构版本',
  `result_json` JSON NOT NULL COMMENT '按派生类型 Schema 校验的结果与明确单位',
  `result_sha256` CHAR(64) NOT NULL COMMENT '规范化派生结果 SHA-256',
  `confidence_band` VARCHAR(16) NOT NULL COMMENT '派生结论可信程度：low、medium、high',
  `generated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '派生结果生成时间，UTC 毫秒',
  `valid_until_ms` BIGINT UNSIGNED NOT NULL COMMENT '派生指标有效截止时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒；不可变记录应与创建时间相同',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_environment_derivation_ref` (`derivation_ref`),
  UNIQUE KEY `uq_environment_derivation_release` (`environment_snapshot_internal_id`, `derivation_type`, `algorithm_release_ref`, `algorithm_release_sha256`),
  KEY `idx_environment_derivation_owner` (`user_internal_id`, `user_plant_internal_id`, `derivation_type`, `valid_until_ms`),
  CONSTRAINT `fk_environment_derivation_snapshot` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`, `environment_snapshot_internal_id`) REFERENCES `care_environment_snapshots` (`user_internal_id`, `user_plant_internal_id`, `id`),
  CONSTRAINT `ck_environment_derivation_type` CHECK (`derivation_type` IN ('vapor_pressure_deficit', 'light_exposure', 'air_exchange', 'substrate_drying_trait', 'environmental_drying_demand', 'estimated_dry_down')),
  CONSTRAINT `ck_environment_derivation_confidence` CHECK (`confidence_band` IN ('low', 'medium', 'high')),
  CONSTRAINT `ck_environment_derivation_algorithm_sha` CHECK (REGEXP_LIKE(`algorithm_release_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_environment_derivation_input_sha` CHECK (REGEXP_LIKE(`input_manifest_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_environment_derivation_result_sha` CHECK (REGEXP_LIKE(`result_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_environment_derivation_time` CHECK (`valid_until_ms` > `generated_at_ms` AND `created_at_ms` = `generated_at_ms` AND `updated_at_ms` = `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 不可变派生环境指标';

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
  `environment_contract_version` VARCHAR(48) NOT NULL COMMENT '原子环境事实与派生指标合同版本',
  `input_manifest_json` JSON NOT NULL COMMENT '游客案例当次计算锁定的原子证据、天气、盆土、知识和配置引用清单',
  `input_manifest_sha256` CHAR(64) NOT NULL COMMENT '规范化游客输入清单 SHA-256',
  `algorithm_release_manifest_json` JSON NOT NULL COMMENT '当次计算使用的派生指标与养护算法 release 引用和内容哈希',
  `algorithm_release_manifest_sha256` CHAR(64) NOT NULL COMMENT '规范化算法 release 清单 SHA-256',
  `derivations_json` JSON NOT NULL COMMENT '按合同验证的派生环境指标、单位、置信度和有效期',
  `derivations_sha256` CHAR(64) NOT NULL COMMENT '规范化派生环境指标集 SHA-256',
  `result_json` JSON NOT NULL COMMENT '一次性脱敏结果',
  `result_sha256` CHAR(64) NOT NULL COMMENT '规范化临时养护结果 SHA-256',
  `generated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '结果生成时间，UTC 毫秒',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '结果失效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_temporary_care_result_ref` (`result_ref`),
  KEY `idx_temporary_care_result_case` (`guest_plant_case_internal_id`, `expires_at_ms`),
  CONSTRAINT `fk_temporary_care_result_session` FOREIGN KEY (`temporary_care_session_internal_id`) REFERENCES `temporary_care_sessions` (`id`),
  CONSTRAINT `fk_temporary_care_result_case` FOREIGN KEY (`guest_plant_case_internal_id`) REFERENCES `guest_plant_cases` (`id`),
  CONSTRAINT `ck_temporary_care_input_sha` CHECK (REGEXP_LIKE(`input_manifest_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_temporary_care_algorithm_sha` CHECK (REGEXP_LIKE(`algorithm_release_manifest_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_temporary_care_derivations_sha` CHECK (REGEXP_LIKE(`derivations_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_temporary_care_result_sha` CHECK (REGEXP_LIKE(`result_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_temporary_care_result_time` CHECK (`expires_at_ms` > `generated_at_ms` AND `created_at_ms` = `generated_at_ms` AND `updated_at_ms` = `created_at_ms`)
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

-- 原子环境事实、输入快照、派生指标和已生成的游客临时养护结果均只能追加。
-- 仅靠 updated_at_ms = created_at_ms 无法阻止保持时间戳不变的篡改，因此在数据库边界明确拒绝 UPDATE。
DELIMITER $$

CREATE TRIGGER `trg_environment_observations_reject_update`
BEFORE UPDATE ON `care_environment_observations`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '原子环境事实不可修改，请追加新事实';
END$$

CREATE TRIGGER `trg_environment_snapshots_reject_update`
BEFORE UPDATE ON `care_environment_snapshots`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '养护环境输入快照不可修改，请创建新快照';
END$$

CREATE TRIGGER `trg_environment_derivations_reject_update`
BEFORE UPDATE ON `care_environment_derivations`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '派生环境指标不可修改，请使用新算法 release 追加结果';
END$$

CREATE TRIGGER `trg_temporary_care_results_reject_update`
BEFORE UPDATE ON `temporary_care_results`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '已生成的游客临时养护结果不可修改';
END$$

DELIMITER ;
