-- 用户施肥检查提醒事件表。
-- 仅创建新表，不读取或改写浇水提醒表，也不迁移旧的本地 fertilize 状态。
-- 本脚本只允许幂等 CREATE TABLE IF NOT EXISTS；本轮执行时仅执行 cloud1_dev 段。
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_fertilization_reminder_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '提醒事件自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '关联 user_plant_instances.id',
  `plan_id` VARCHAR(160) NOT NULL COMMENT '本次施肥检查计划 ID',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/active/completed/dismissed/superseded/cancelled',
  `reminder_kind` VARCHAR(32) NOT NULL DEFAULT 'normal' COMMENT 'normal/first_confirmation',
  `fertilizer_type` VARCHAR(32) NOT NULL COMMENT 'liquid/slowRelease',
  `rule_month` TINYINT UNSIGNED NOT NULL COMMENT '生成快照时的月份',
  `rule_snapshot_json` JSON NOT NULL COMMENT '服务端生成的属级规则快照',
  `last_applied_date` DATE NULL COMMENT '用户确认的最近一次施肥日期；未知时为空',
  `last_date_source` VARCHAR(16) NULL COMMENT 'recorded/estimated',
  `next_check_date` DATE NOT NULL COMMENT '本次施肥检查日期',
  `next_time` DATETIME NOT NULL COMMENT '手机日历提醒时间，固定上午 09:00',
  `completed_date` DATE NULL COMMENT '用户确认已施肥的日期',
  `calendar_payload_json` JSON NULL COMMENT '手机日历写入摘要与状态',
  `expires_at` DATETIME NULL COMMENT 'pending 计划有效期，默认 15 分钟',
  `active_key` VARCHAR(160) GENERATED ALWAYS AS (
    IF(`status` = 'active', CONCAT(`_openid`, ':', `user_plant_id`), NULL)
  ) STORED,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid_plan` (`_openid`, `plan_id`),
  UNIQUE KEY `uk_active_key` (`active_key`),
  INDEX `idx_openid_plant_status_time` (`_openid`, `user_plant_id`, `status`, `next_time`),
  INDEX `idx_pending_expiry` (`_openid`, `status`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户施肥检查提醒事件表';

CREATE TABLE IF NOT EXISTS `cloud1_dev`.`user_fertilization_reminder_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '提醒事件自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '关联 user_plant_instances.id',
  `plan_id` VARCHAR(160) NOT NULL COMMENT '本次施肥检查计划 ID',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/active/completed/dismissed/superseded/cancelled',
  `reminder_kind` VARCHAR(32) NOT NULL DEFAULT 'normal' COMMENT 'normal/first_confirmation',
  `fertilizer_type` VARCHAR(32) NOT NULL COMMENT 'liquid/slowRelease',
  `rule_month` TINYINT UNSIGNED NOT NULL COMMENT '生成快照时的月份',
  `rule_snapshot_json` JSON NOT NULL COMMENT '服务端生成的属级规则快照',
  `last_applied_date` DATE NULL COMMENT '用户确认的最近一次施肥日期；未知时为空',
  `last_date_source` VARCHAR(16) NULL COMMENT 'recorded/estimated',
  `next_check_date` DATE NOT NULL COMMENT '本次施肥检查日期',
  `next_time` DATETIME NOT NULL COMMENT '手机日历提醒时间，固定上午 09:00',
  `completed_date` DATE NULL COMMENT '用户确认已施肥的日期',
  `calendar_payload_json` JSON NULL COMMENT '手机日历写入摘要与状态',
  `expires_at` DATETIME NULL COMMENT 'pending 计划有效期，默认 15 分钟',
  `active_key` VARCHAR(160) GENERATED ALWAYS AS (
    IF(`status` = 'active', CONCAT(`_openid`, ':', `user_plant_id`), NULL)
  ) STORED,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid_plan` (`_openid`, `plan_id`),
  UNIQUE KEY `uk_active_key` (`active_key`),
  INDEX `idx_openid_plant_status_time` (`_openid`, `user_plant_id`, `status`, `next_time`),
  INDEX `idx_pending_expiry` (`_openid`, `status`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户施肥检查提醒事件表';
