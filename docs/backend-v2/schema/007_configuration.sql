SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE `business_policy_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '领域业务策略发布内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `release_ref` VARCHAR(64) NOT NULL COMMENT '高熵策略发布引用',
  `domain_code` VARCHAR(40) NOT NULL COMMENT '业务域代码',
  `policy_code` VARCHAR(80) NOT NULL COMMENT '类型化策略代码，不允许任意键值',
  `schema_version` VARCHAR(64) NOT NULL COMMENT '类型化策略 Schema 版本',
  `release_version` VARCHAR(64) NOT NULL COMMENT '不可变策略发布版本',
  `content_sha256` CHAR(64) NOT NULL COMMENT '规范化策略内容 SHA-256',
  `policy_json` JSON NOT NULL COMMENT '通过对应 TypeScript 与 AJV Schema 校验的策略内容',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：draft、verified、active、retired',
  `effective_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '策略生效时间，UTC 毫秒',
  `expires_at_ms` BIGINT UNSIGNED NULL COMMENT '策略失效时间，UTC 毫秒',
  `verified_at_ms` BIGINT UNSIGNED NULL COMMENT '验证通过时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_policy_ref` (`release_ref`),
  UNIQUE KEY `uq_business_policy_version` (`domain_code`, `policy_code`, `release_version`),
  UNIQUE KEY `uq_business_policy_sha` (`content_sha256`),
  UNIQUE KEY `uq_business_policy_replay_identity` (`id`, `domain_code`, `policy_code`, `release_ref`, `release_version`, `content_sha256`),
  KEY `idx_business_policy_status` (`domain_code`, `policy_code`, `status`, `effective_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 类型化领域业务策略发布';

CREATE TABLE `active_business_policy_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '当前生效业务策略指针内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `domain_code` VARCHAR(40) NOT NULL COMMENT '业务域代码',
  `policy_code` VARCHAR(80) NOT NULL COMMENT '类型化策略代码',
  `release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '当前生效业务策略发布内部主键',
  `active_release_version` VARCHAR(64) NOT NULL COMMENT '当前生效发布版本冗余校验值',
  `active_content_sha256` CHAR(64) NOT NULL COMMENT '当前生效内容 SHA-256 冗余校验值',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '原子切换乐观并发版本',
  `activated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '激活时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_active_business_policy` (`domain_code`, `policy_code`),
  CONSTRAINT `fk_active_business_policy_release` FOREIGN KEY (`release_internal_id`) REFERENCES `business_policy_releases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 当前生效领域业务策略指针';

CREATE TABLE `provider_config_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '第三方能力配置发布内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `release_ref` VARCHAR(64) NOT NULL COMMENT '高熵 Provider 配置发布引用',
  `provider_code` VARCHAR(40) NOT NULL COMMENT '第三方或 CloudBase 能力提供方代码',
  `capability_code` VARCHAR(64) NOT NULL COMMENT '能力代码，例如植物识别、天气或模型问诊',
  `schema_version` VARCHAR(64) NOT NULL COMMENT 'Provider 配置 Schema 版本',
  `release_version` VARCHAR(64) NOT NULL COMMENT '不可变 Provider 配置发布版本',
  `configuration_sha256` CHAR(64) NOT NULL COMMENT '规范化 Provider 配置 SHA-256',
  `configuration_json` JSON NOT NULL COMMENT '通过 TypeScript 与 AJV 校验的非密钥配置，仅允许 credential_ref',
  `credential_ref` VARCHAR(191) NOT NULL COMMENT '受控凭证引用，不保存凭证内容',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：draft、verified、active、retired',
  `effective_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '配置生效时间，UTC 毫秒',
  `expires_at_ms` BIGINT UNSIGNED NULL COMMENT '配置失效时间，UTC 毫秒',
  `verified_at_ms` BIGINT UNSIGNED NULL COMMENT '验证通过时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_provider_config_ref` (`release_ref`),
  UNIQUE KEY `uq_provider_config_version` (`provider_code`, `capability_code`, `release_version`),
  UNIQUE KEY `uq_provider_config_sha` (`configuration_sha256`),
  KEY `idx_provider_config_status` (`provider_code`, `capability_code`, `status`, `effective_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 类型化 Provider 配置发布';

CREATE TABLE `active_provider_config_releases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '当前生效 Provider 配置指针内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `provider_code` VARCHAR(40) NOT NULL COMMENT '能力提供方代码',
  `capability_code` VARCHAR(64) NOT NULL COMMENT '能力代码',
  `release_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '当前生效 Provider 配置发布内部主键',
  `active_release_version` VARCHAR(64) NOT NULL COMMENT '当前生效发布版本冗余校验值',
  `active_configuration_sha256` CHAR(64) NOT NULL COMMENT '当前生效配置 SHA-256 冗余校验值',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '原子切换乐观并发版本',
  `activated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '激活时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_active_provider_config` (`provider_code`, `capability_code`),
  CONSTRAINT `fk_active_provider_config_release` FOREIGN KEY (`release_internal_id`) REFERENCES `provider_config_releases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 当前生效 Provider 配置指针';

CREATE TABLE `configuration_request_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '请求级配置快照内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `snapshot_ref` VARCHAR(64) NOT NULL COMMENT '高熵请求级配置快照引用',
  `request_scope_hash` CHAR(64) NOT NULL COMMENT '脱敏请求作用域 SHA-256，不保存追踪 ID',
  `policy_snapshot_sha256` CHAR(64) NOT NULL COMMENT '本次请求使用的全部业务策略清单 SHA-256',
  `provider_snapshot_sha256` CHAR(64) NOT NULL COMMENT '本次请求使用的全部 Provider 配置清单 SHA-256',
  `snapshot_manifest_json` JSON NOT NULL COMMENT '只读发布引用与版本清单，不包含密钥和用户数据',
  `captured_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '快照形成时间，UTC 毫秒',
  `retain_until_ms` BIGINT UNSIGNED NOT NULL COMMENT '审计保留截止时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_configuration_snapshot_ref` (`snapshot_ref`),
  KEY `idx_configuration_snapshot_retention` (`retain_until_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 请求级不可变配置快照';

CREATE TABLE `configuration_release_audit_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '配置发布审计记录内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `audit_ref` VARCHAR(64) NOT NULL COMMENT '高熵配置审计引用',
  `configuration_kind` VARCHAR(24) NOT NULL COMMENT '配置类型：business_policy、provider_config',
  `configuration_scope_code` VARCHAR(128) NOT NULL COMMENT '领域策略或 Provider 能力作用域',
  `action` VARCHAR(24) NOT NULL COMMENT '动作：verify、activate、rollback、retire',
  `from_release_version` VARCHAR(64) NULL COMMENT '切换前发布版本',
  `to_release_version` VARCHAR(64) NOT NULL COMMENT '切换后发布版本',
  `actor_type` VARCHAR(24) NOT NULL COMMENT '操作者类型：service、reviewer',
  `actor_ref_hash` CHAR(64) NOT NULL COMMENT '操作者脱敏引用 SHA-256',
  `reason_code` VARCHAR(64) NOT NULL COMMENT '版本化原因代码',
  `evidence_ref` VARCHAR(255) NOT NULL COMMENT '脱敏验证或回滚证据引用',
  `occurred_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '动作发生时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_configuration_audit_ref` (`audit_ref`),
  KEY `idx_configuration_audit_scope` (`configuration_kind`, `configuration_scope_code`, `occurred_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 配置发布与回滚审计记录';
