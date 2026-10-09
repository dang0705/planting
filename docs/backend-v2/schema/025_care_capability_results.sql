-- 025：长期用户植物养护能力计算结果（long-term-care/v1 §10，主代理 2026-10-09 裁决 T4）。
-- 只追加：与 temporary_care_results 同形（内联输入清单、算法发布清单、派生、结果及各自 SHA-256），保证可回放。
-- proposal_internal_id 可空且唯一：结果为 ready 且行动可确认时链接同一植物的 care_proposals；应用层核对同归属。
-- 只用于新环境与本地隔离 MySQL；不在 HTTP 启动时执行，不修改已应用迁移。

CREATE TABLE `care_capability_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '长期养护能力结果内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `result_ref` VARCHAR(64) NOT NULL COMMENT '高熵长期养护结果公开引用（cres_）',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `proposal_internal_id` BIGINT UNSIGNED NULL COMMENT '可确认时链接的同一植物养护建议；无可确认行动时为空',
  `capability_type` VARCHAR(24) NOT NULL COMMENT '能力类型：watering、fertilizing、lighting、ventilation',
  `contract_version` VARCHAR(48) NOT NULL COMMENT '统一养护输出合同版本',
  `details_schema_version` VARCHAR(48) NOT NULL COMMENT '能力详情结构版本',
  `environment_contract_version` VARCHAR(48) NOT NULL COMMENT '原子环境事实与派生指标合同版本',
  `input_manifest_json` JSON NOT NULL COMMENT '当次计算锁定的请求输入、档案、最近事实与品种绑定清单',
  `input_manifest_sha256` CHAR(64) NOT NULL COMMENT '规范化输入清单 SHA-256',
  `algorithm_release_manifest_json` JSON NOT NULL COMMENT '当次计算使用的算法发布、基线版本与外部数据状态；无发布时明确记录',
  `algorithm_release_manifest_sha256` CHAR(64) NOT NULL COMMENT '规范化算法发布清单 SHA-256',
  `derivations_json` JSON NOT NULL COMMENT '受控派生摘要（光照、环境时段、时区等），不保存思维链',
  `derivations_sha256` CHAR(64) NOT NULL COMMENT '规范化派生摘要 SHA-256',
  `result_json` JSON NOT NULL COMMENT '已脱敏统一养护能力结果',
  `result_sha256` CHAR(64) NOT NULL COMMENT '规范化结果 SHA-256',
  `generated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '结果生成时间，UTC 毫秒',
  `valid_until_ms` BIGINT UNSIGNED NULL COMMENT '结果有效截止时间，UTC 毫秒；未确定为空',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒；不可变记录与创建时间相同',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_care_capability_result_ref` (`result_ref`),
  UNIQUE KEY `uq_care_capability_result_proposal` (`proposal_internal_id`),
  KEY `idx_care_capability_result_owner_time` (`user_internal_id`, `user_plant_internal_id`, `capability_type`, `generated_at_ms`),
  CONSTRAINT `fk_care_capability_result_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `fk_care_capability_result_proposal` FOREIGN KEY (`proposal_internal_id`) REFERENCES `care_proposals` (`id`),
  CONSTRAINT `ck_care_capability_result_type` CHECK (`capability_type` IN ('watering', 'fertilizing', 'lighting', 'ventilation')),
  CONSTRAINT `ck_care_capability_input_sha` CHECK (REGEXP_LIKE(`input_manifest_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_care_capability_algorithm_sha` CHECK (REGEXP_LIKE(`algorithm_release_manifest_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_care_capability_derivations_sha` CHECK (REGEXP_LIKE(`derivations_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_care_capability_result_sha` CHECK (REGEXP_LIKE(`result_sha256`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_care_capability_result_time` CHECK ((`valid_until_ms` IS NULL OR `valid_until_ms` > `generated_at_ms`) AND `created_at_ms` = `generated_at_ms` AND `updated_at_ms` = `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 长期用户植物养护能力计算结果（只追加）';

DELIMITER $$
CREATE TRIGGER `trg_care_capability_results_reject_update`
BEFORE UPDATE ON `care_capability_results`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '长期养护结果不可修改，请追加新结果';
END$$
DELIMITER ;
