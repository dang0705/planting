-- 用户浇水事件审计表：独立事件表取代 watering_events_json JSON 覆盖写。
-- 每条浇水事件独立 INSERT，带事件级 ID + plan_id 审计追溯。
-- user_plant_id 关联 user_plant_instances.id，JOIN 可获取盆型信息。
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_watering_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '事件自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '关联 user_plant_instances.id',
  `event_date` DATE NOT NULL COMMENT '浇水日期',
  `amount_label` VARCHAR(32) NULL COMMENT '浇水档位标签：mist/small/normal/thorough/unknown',
  `amount_ml` INT UNSIGNED NULL COMMENT '绝对浇水量 ml',
  `source` VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT '来源：manual/planner/qa',
  `plan_id` VARCHAR(64) NULL COMMENT '关联的 planner 建议 ID',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_plant_date` (`user_plant_id`, `event_date` DESC),
  INDEX `idx_openid` (`_openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户浇水事件审计表';
