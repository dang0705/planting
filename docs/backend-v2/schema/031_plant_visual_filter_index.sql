-- 031：三轴视觉筛选预计算索引（plant-visual-axis-filter/v1 修订 1；ClickUp z8v0kmvgab 改表票，用户 2026-10-10 授权开票）。
-- 背景：直接查 plant_visual_axis_results（约 75 万行、JSON 数组）在测试库实测中位数不少于 28 秒；改为每株一行、三轴位掩码的窄表，
-- 按覆盖索引 idx_visual_filter_entry_scan (filter_set_id, taxon_id, 三个掩码, encyclopedia_id) 的顺序只扫索引，凑满一页即停止。
-- 三张表都是新建，不改任何既有表，不搬迁、不删除任何记录。数据由离线幂等回填脚本写入（cloudfunctions-v2/scripts/visual-filter-index.mjs），
-- 不在本文件中写数据，也不在 HTTP 函数启动时执行。
-- 切换条件：information_schema.TABLES 读回三张表、STATISTICS 读回主键与唯一键；回填后 plant_visual_filter_sets.status = 'ready'。
-- 回退：三轴接口在索引缺失或未就绪时返回 503，不影响其他接口；需要撤下时，由 DBA 另行批准删除这三张表（不在本文件中）。
-- 外部表 tropicals_species_encyclopedia_ref、plant_visual_axis_results 不属 v2 迁移，因此这里不建外键，只存其 id / taxon_id 的值。

CREATE TABLE `plant_visual_filter_sets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `source_key` CHAR(64) NOT NULL COMMENT '策略 visualAxisSources 规范 JSON 的 SHA-256；读取方按它定位唯一一份索引',
  `sources_json` JSON NOT NULL COMMENT '构建所依据的 visualAxisSources 原文（各轴 extraction_version 与枚举 catalog_version）',
  `status` VARCHAR(16) NOT NULL COMMENT '构建状态：building 构建中 / ready 已就绪（只有 ready 可被读取）',
  `next_encyclopedia_id` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '断点续跑位置：下一批回填从该百科内部 id 开始',
  `plant_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '就绪时索引收录的植物行数（至少一轴有合法取值）',
  `built_at_ms` BIGINT UNSIGNED NULL COMMENT '标记就绪的时间，UTC 毫秒；构建中为空',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_visual_filter_set_source` (`source_key`),
  CONSTRAINT `ck_visual_filter_set_status` CHECK (`status` IN ('building', 'ready')),
  CONSTRAINT `ck_visual_filter_set_ready_time` CHECK ((`status` = 'ready') = (`built_at_ms` IS NOT NULL)),
  CONSTRAINT `ck_visual_filter_set_source_key` CHECK (REGEXP_LIKE(`source_key`, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT `ck_visual_filter_set_time` CHECK (`updated_at_ms` >= `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 三轴筛选索引批次：一份 visualAxisSources 对应一份索引';

CREATE TABLE `plant_visual_filter_value_bits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `filter_set_id` BIGINT UNSIGNED NOT NULL COMMENT '所属索引批次内部 id',
  `axis_code` VARCHAR(32) NOT NULL COMMENT '准入轴代码：LEAF_SHAPE / GROWTH_FORM / LEAF_SURFACE',
  `value_code` VARCHAR(64) NOT NULL COLLATE utf8mb4_bin COMMENT '生效枚举值代码（区分大小写）',
  `bit_position` TINYINT UNSIGNED NOT NULL COMMENT '该值在本轴位掩码中的位序号（0–63）',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_visual_filter_bit_value` (`filter_set_id`, `axis_code`, `value_code`),
  UNIQUE KEY `uk_visual_filter_bit_position` (`filter_set_id`, `axis_code`, `bit_position`),
  CONSTRAINT `fk_visual_filter_bit_set` FOREIGN KEY (`filter_set_id`) REFERENCES `plant_visual_filter_sets` (`id`),
  CONSTRAINT `ck_visual_filter_bit_axis` CHECK (`axis_code` IN ('LEAF_SHAPE', 'GROWTH_FORM', 'LEAF_SURFACE')),
  CONSTRAINT `ck_visual_filter_bit_position` CHECK (`bit_position` <= 63),
  CONSTRAINT `ck_visual_filter_bit_time` CHECK (`updated_at_ms` >= `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 三轴筛选索引的值位表：枚举值与位序号一一对应';

CREATE TABLE `plant_visual_filter_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '内部主键',
  `filter_set_id` BIGINT UNSIGNED NOT NULL COMMENT '所属索引批次内部 id',
  `taxon_id` VARCHAR(512) NOT NULL COLLATE utf8mb4_unicode_ci COMMENT '百科分类引用；排序规则与百科表一致，决定公开排序与游标',
  `encyclopedia_id` BIGINT UNSIGNED NOT NULL COMMENT '百科内部 id，只用于服务端联表，不进入公开响应',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `leaf_shape_mask` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '叶型位掩码；0 表示该轴缺值或无合法取值',
  `growth_form_mask` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '株型位掩码；0 表示该轴缺值或无合法取值',
  `leaf_surface_mask` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '叶面质感位掩码；0 表示该轴缺值或无合法取值',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_visual_filter_entry_taxon` (`filter_set_id`, `taxon_id`),
  UNIQUE KEY `uk_visual_filter_entry_encyclopedia` (`filter_set_id`, `encyclopedia_id`),
  KEY `idx_visual_filter_entry_scan` (`filter_set_id`, `taxon_id`, `leaf_shape_mask`, `growth_form_mask`, `leaf_surface_mask`, `encyclopedia_id`),
  CONSTRAINT `fk_visual_filter_entry_set` FOREIGN KEY (`filter_set_id`) REFERENCES `plant_visual_filter_sets` (`id`),
  CONSTRAINT `ck_visual_filter_entry_any_axis` CHECK (`leaf_shape_mask` <> 0 OR `growth_form_mask` <> 0 OR `leaf_surface_mask` <> 0),
  CONSTRAINT `ck_visual_filter_entry_time` CHECK (`updated_at_ms` >= `created_at_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 三轴筛选索引条目：每株一行，三轴位掩码';
