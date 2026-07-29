-- 用户浇水日历提醒事件表：仅记录系统日历创建成功后的应用内提醒状态。
-- 本脚本只允许幂等 CREATE TABLE IF NOT EXISTS；不得包含破坏性迁移语句。
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_watering_reminder_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '提醒事件自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '关联 user_plant_instances.id',
  `plan_id` VARCHAR(128) NOT NULL COMMENT '前端 planner 建议 ID 或日历保存 ID',
  `reminder_type` VARCHAR(32) NOT NULL DEFAULT 'water' COMMENT '提醒类型：water',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/superseded/cancelled',
  `last_watered` DATE NULL COMMENT '本次计算所依据的最近一次浇水日期',
  `next_water_date` DATE NOT NULL COMMENT '建议下次浇水日期',
  `next_time` DATETIME NOT NULL COMMENT '建议下次浇水时间',
  `watering_events_json` JSON NULL COMMENT '最近浇水事件集合',
  `planner_result_json` JSON NULL COMMENT 'planner 完整建议详情',
  `calendar_payload_json` JSON NULL COMMENT 'uni.addPhoneCalendar 写入摘要与状态',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_openid_plant_status_time` (`_openid`, `user_plant_id`, `status`, `next_time`),
  INDEX `idx_plant_plan` (`user_plant_id`, `plan_id`),
  INDEX `idx_next_time` (`next_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户浇水日历提醒事件表';

CREATE TABLE IF NOT EXISTS `cloud1_dev`.`user_watering_reminder_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '提醒事件自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '关联 user_plant_instances.id',
  `plan_id` VARCHAR(128) NOT NULL COMMENT '前端 planner 建议 ID 或日历保存 ID',
  `reminder_type` VARCHAR(32) NOT NULL DEFAULT 'water' COMMENT '提醒类型：water',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/superseded/cancelled',
  `last_watered` DATE NULL COMMENT '本次计算所依据的最近一次浇水日期',
  `next_water_date` DATE NOT NULL COMMENT '建议下次浇水日期',
  `next_time` DATETIME NOT NULL COMMENT '建议下次浇水时间',
  `watering_events_json` JSON NULL COMMENT '最近浇水事件集合',
  `planner_result_json` JSON NULL COMMENT 'planner 完整建议详情',
  `calendar_payload_json` JSON NULL COMMENT 'uni.addPhoneCalendar 写入摘要与状态',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_openid_plant_status_time` (`_openid`, `user_plant_id`, `status`, `next_time`),
  INDEX `idx_plant_plan` (`user_plant_id`, `plan_id`),
  INDEX `idx_next_time` (`next_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户浇水日历提醒事件表';
