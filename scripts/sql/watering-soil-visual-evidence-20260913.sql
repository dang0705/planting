-- 盆土视觉证据：诊断原图只作为只读来源；新拍图仍归 plant_images 管理。
-- 本迁移需在 cloud1_dev 与生产库各执行一次，并与诊断/存储/浇水函数同批上线。

ALTER TABLE `cloud1_dev`.`visual_raw_image_records`
  ADD COLUMN `file_id` VARCHAR(512) NULL COMMENT '诊断上传云文件 ID，仅用于重新取得临时链接' AFTER `image_ref`,
  ADD KEY `idx_visual_raw_soil_reuse` (`_openid`, `input_slot_type`, `created_at`);

ALTER TABLE `cloud1-2grufevs395a9d5e`.`visual_raw_image_records`
  ADD COLUMN `file_id` VARCHAR(512) NULL COMMENT '诊断上传云文件 ID，仅用于重新取得临时链接' AFTER `image_ref`,
  ADD KEY `idx_visual_raw_soil_reuse` (`_openid`, `input_slot_type`, `created_at`);

ALTER TABLE `cloud1_dev`.`plant_images`
  ADD COLUMN `imagePurpose` VARCHAR(64) NULL COMMENT '图片用途，例如 watering_soil' AFTER `url`,
  ADD COLUMN `visualEvidenceJson` JSON NULL COMMENT '盆土视觉结构化结论' AFTER `imagePurpose`,
  ADD COLUMN `visualAnalyzedAt` DATETIME NULL COMMENT '盆土视觉分析完成时间' AFTER `visualEvidenceJson`,
  ADD KEY `idx_plant_images_visual_soil` (`_openid`, `plantId`, `imagePurpose`, `visualAnalyzedAt`);

ALTER TABLE `cloud1-2grufevs395a9d5e`.`plant_images`
  ADD COLUMN `imagePurpose` VARCHAR(64) NULL COMMENT '图片用途，例如 watering_soil' AFTER `url`,
  ADD COLUMN `visualEvidenceJson` JSON NULL COMMENT '盆土视觉结构化结论' AFTER `imagePurpose`,
  ADD COLUMN `visualAnalyzedAt` DATETIME NULL COMMENT '盆土视觉分析完成时间' AFTER `visualEvidenceJson`,
  ADD KEY `idx_plant_images_visual_soil` (`_openid`, `plantId`, `imagePurpose`, `visualAnalyzedAt`);

CREATE TABLE IF NOT EXISTS `cloud1_dev`.`watering_visual_evidences` (
  `evidence_id` VARCHAR(64) NOT NULL COMMENT '短期盆土证据 ID',
  `_openid` VARCHAR(128) NOT NULL COMMENT '所属用户',
  `user_plant_id` BIGINT NULL COMMENT '用户植物；独立顾问为空',
  `source_type` VARCHAR(32) NOT NULL COMMENT 'recent_diagnosis/plant_image/temporary',
  `source_file_id` VARCHAR(512) NOT NULL COMMENT '原云文件 ID',
  `source_visual_raw_image_record_id` VARCHAR(64) NULL COMMENT '复用诊断原图的原始记录 ID',
  `analysis_json` JSON NOT NULL COMMENT '结构化盆土视觉结论与模型用量审计',
  `analyzed_at` DATETIME NOT NULL COMMENT '分析时间',
  `expires_at` DATETIME NOT NULL COMMENT '证据失效时间',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`evidence_id`),
  KEY `idx_watering_visual_evidence_lookup` (`_openid`, `user_plant_id`, `expires_at`),
  KEY `idx_watering_visual_evidence_cleanup` (`_openid`, `source_type`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浇水盆土视觉短期证据';

CREATE TABLE IF NOT EXISTS `cloud1-2grufevs395a9d5e`.`watering_visual_evidences` LIKE `cloud1_dev`.`watering_visual_evidences`;
