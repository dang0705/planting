-- 024：Tropicals 浇水名义基线策略表纳入 v2 迁移（主代理 2026-10-09 裁决 A3）。
-- 业务列 id、policy_version、water_frequency_tier、trigger_state、min_days、max_days、is_active 与测试库
-- qinghuazhi_v2_test.watering_baseline_policy 同名同类型；索引名与列照抄（uk_policy_tier_trigger、idx_active_lookup）。
-- 按 v2 惯例另加 _openid 与 created_at_ms/updated_at_ms（UTC 毫秒），表 COMMENT 以「青花植 v2」开头，排序规则沿用既有迁移。
-- 一次性差异登记：测试库现存旧形态表（时间列为数据库时间类型、无 _openid、排序规则 utf8mb4_0900_ai_ci）；
-- v2 读取器只读上述同名同类型业务列，因此兼容。两者差异在正式切换迁移时核对，不在测试库重放 024（2026-10-09 只读核对）。
-- 本文件只用于新环境与本地隔离 MySQL；v1 种子数据见 seeds/watering_baseline_policy.v1.sql，建表后单独执行。

CREATE TABLE `watering_baseline_policy` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `policy_version` VARCHAR(32) NOT NULL COMMENT '基线策略版本',
  `water_frequency_tier` VARCHAR(32) NOT NULL COMMENT 'Tropicals 浇水频率状态',
  `trigger_state` VARCHAR(32) NOT NULL COMMENT '运行时归约后的浇水触发状态',
  `min_days` SMALLINT UNSIGNED NOT NULL COMMENT '基线最小天数',
  `max_days` SMALLINT UNSIGNED NOT NULL COMMENT '基线最大天数',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '当前策略行是否启用',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_policy_tier_trigger` (`policy_version`, `water_frequency_tier`, `trigger_state`),
  KEY `idx_active_lookup` (`is_active`, `water_frequency_tier`, `trigger_state`),
  CONSTRAINT `ck_watering_baseline_days` CHECK (`min_days` <= `max_days`),
  CONSTRAINT `ck_watering_baseline_active` CHECK (`is_active` IN (0, 1)),
  CONSTRAINT `ck_watering_baseline_time` CHECK (`updated_at_ms` >= `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 浇水基线策略：Tropicals tier + trigger_state 映射到 min/max 天数';
