-- 026：用户植物 → Tropicals 目录品种绑定（long-term-care/v1 §1，用户 2026-10-09 裁决 U1，主代理裁决 T1）。
-- 只追加：最新一条（bound_at_ms、id 最大）生效；更换品种追加新行，可审计历史。catalog_taxon_ref 为外部目录引用，不建外键。
-- 只用于新环境与本地隔离 MySQL；不在 HTTP 启动时执行。

CREATE TABLE `user_plant_catalog_bindings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '品种绑定内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `binding_ref` VARCHAR(64) NOT NULL COMMENT '高熵品种绑定公开引用（cbd_）',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属统一用户内部主键',
  `user_plant_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户植物内部主键',
  `catalog_taxon_ref` VARCHAR(512) NOT NULL COMMENT 'Tropicals 目录引用（与 tropicals_species_encyclopedia_ref.taxon_id 同值域），不是产品植物身份',
  `bound_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '绑定生效时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒；不可变记录与创建时间相同',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_catalog_binding_ref` (`binding_ref`),
  KEY `idx_catalog_binding_latest` (`user_internal_id`, `user_plant_internal_id`, `bound_at_ms`, `id`),
  CONSTRAINT `fk_catalog_binding_owner_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `ck_catalog_binding_ref_not_blank` CHECK (CHAR_LENGTH(TRIM(`catalog_taxon_ref`)) > 0),
  CONSTRAINT `ck_catalog_binding_time` CHECK (`created_at_ms` = `bound_at_ms` AND `updated_at_ms` = `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 用户植物 Tropicals 品种绑定（只追加，最新生效）';

DELIMITER $$
CREATE TRIGGER `trg_user_plant_catalog_bindings_reject_update`
BEFORE UPDATE ON `user_plant_catalog_bindings`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '品种绑定不可修改，请追加新绑定';
END$$
DELIMITER ;
