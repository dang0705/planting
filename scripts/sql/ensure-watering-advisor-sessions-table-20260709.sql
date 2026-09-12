-- 独立浇水建议会话记录表：用户未绑定植物时，基于植物种类 + 临时盆型输入的浇水建议记录。
-- 用于回溯和收集真实用户数据（输入快照 + planner 完整结果）。
-- 本脚本只允许幂等 CREATE TABLE IF NOT EXISTS；不得包含破坏性迁移语句。
CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`watering_advisor_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `catalog_plant_id` VARCHAR(128) NOT NULL COMMENT '植物种类 ID（plant_identity_id 或 session_plant_id）',
  `catalog_plant_name` VARCHAR(255) NULL COMMENT '植物名称快照',
  `pot_profile_json` JSON NULL COMMENT '盆型输入快照（尺寸+排水孔+基质）',
  `weather_summary_json` JSON NULL COMMENT '天气摘要快照（historical+forecast）',
  `planner_result_json` JSON NULL COMMENT 'planner 完整建议结果',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_openid_created` (`_openid`, `created_at`),
  INDEX `idx_catalog_plant` (`catalog_plant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='独立浇水建议会话记录表';

CREATE TABLE IF NOT EXISTS `cloud1_dev`.`watering_advisor_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话自增主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '用户 openid',
  `catalog_plant_id` VARCHAR(128) NOT NULL COMMENT '植物种类 ID（plant_identity_id 或 session_plant_id）',
  `catalog_plant_name` VARCHAR(255) NULL COMMENT '植物名称快照',
  `pot_profile_json` JSON NULL COMMENT '盆型输入快照（尺寸+排水孔+基质）',
  `weather_summary_json` JSON NULL COMMENT '天气摘要快照（historical+forecast）',
  `planner_result_json` JSON NULL COMMENT 'planner 完整建议结果',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_openid_created` (`_openid`, `created_at`),
  INDEX `idx_catalog_plant` (`catalog_plant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='独立浇水建议会话记录表';
