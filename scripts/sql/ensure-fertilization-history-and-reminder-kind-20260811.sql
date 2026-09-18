-- MVP 施肥历史与提醒类型迁移。
-- 本次只执行 cloud1_dev，不执行生产库。

CREATE TABLE IF NOT EXISTS `cloud1_dev`.`user_fertilization_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '实际施肥事件自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '关联 user_plant_instances.id',
  `event_date` DATE NOT NULL COMMENT '用户确认的实际施肥日期',
  `fertilizer_type` VARCHAR(32) NOT NULL COMMENT 'liquid/slowRelease',
  `amount_value` DECIMAL(10,2) NULL COMMENT 'MVP暂不要求填写；预留实际用量数值',
  `amount_unit` VARCHAR(16) NULL COMMENT 'ml/g/粒等；MVP暂不要求填写',
  `source` VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'reminder_setup/reminder_complete/manual/qa',
  `plan_id` VARCHAR(160) NULL COMMENT '关联提醒计划；同一计划只允许产生一条事件',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '写入时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid_plan` (`_openid`, `plan_id`),
  INDEX `idx_plant_date` (`user_plant_id`, `event_date` DESC),
  INDEX `idx_openid` (`_openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户实际施肥历史事件表';

SET @has_reminder_kind_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'cloud1_dev'
    AND TABLE_NAME = 'user_fertilization_reminder_events'
    AND COLUMN_NAME = 'reminder_kind'
);
SET @add_reminder_kind_sql := IF(
  @has_reminder_kind_column = 0,
  'ALTER TABLE `cloud1_dev`.`user_fertilization_reminder_events` ADD COLUMN `reminder_kind` VARCHAR(32) NOT NULL DEFAULT ''normal'' COMMENT ''normal/first_confirmation'' AFTER `status`',
  'SELECT 1'
);
PREPARE add_reminder_kind_statement FROM @add_reminder_kind_sql;
EXECUTE add_reminder_kind_statement;
DEALLOCATE PREPARE add_reminder_kind_statement;

UPDATE `cloud1_dev`.`user_fertilization_reminder_events`
SET reminder_kind = CASE
  WHEN last_date_source = 'estimated' THEN 'first_confirmation'
  ELSE 'normal'
END
WHERE reminder_kind IS NULL OR reminder_kind = '';
