-- 用户植物完整删除的图片对象清理作业表。
-- 主数据删除在应用层原生 MySQL 事务中完成；本表只记录提交后 Cloud Storage 删除失败时的重试状态。
-- 执行前须在 cloud1_dev 与生产 schema 分别确认 DB_* 安全连接配置，禁止将凭据写入本脚本。

CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`user_plant_file_deletion_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片清理作业主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '所属用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '已删除的用户植物实例 ID',
  `file_id` VARCHAR(512) NOT NULL COMMENT '待清理 Cloud Storage 文件 ID',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/completed',
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
  `last_error_code` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最近一次安全错误码，不保存原始报错',
  `last_attempt_at` DATETIME NULL COMMENT '最近一次尝试时间',
  `completed_at` DATETIME NULL COMMENT '文件删除完成时间',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid_file` (`_openid`, `file_id`),
  KEY `idx_openid_status_updated` (`_openid`, `status`, `updated_at`),
  KEY `idx_user_plant_id` (`user_plant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户植物删除后的图片对象清理重试作业';

CREATE TABLE IF NOT EXISTS `cloud1_dev`.`user_plant_file_deletion_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片清理作业主键',
  `_openid` VARCHAR(128) NOT NULL COMMENT '所属用户 openid',
  `user_plant_id` BIGINT UNSIGNED NOT NULL COMMENT '已删除的用户植物实例 ID',
  `file_id` VARCHAR(512) NOT NULL COMMENT '待清理 Cloud Storage 文件 ID',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/completed',
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
  `last_error_code` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最近一次安全错误码，不保存原始报错',
  `last_attempt_at` DATETIME NULL COMMENT '最近一次尝试时间',
  `completed_at` DATETIME NULL COMMENT '文件删除完成时间',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid_file` (`_openid`, `file_id`),
  KEY `idx_openid_status_updated` (`_openid`, `status`, `updated_at`),
  KEY `idx_user_plant_id` (`user_plant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户植物删除后的图片对象清理重试作业';
