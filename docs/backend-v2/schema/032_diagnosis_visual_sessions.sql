-- 032：生成式视觉诊断（diagnosis-visual-api/v1，ClickUp z8v0kmvhnd「视觉诊断 3/4」；最小反馈 z8v0kmvh0f 的数据结构）。
-- 三张表都是新建：已登记图片、诊断会话与结果（不可变、带版本组与 SHA-256、可回放）、只追加的最小反馈。不改任何既有表，不写数据。
-- 依赖：001（users）、003（user_plants）、016（authenticated_ephemeral_plant_cases）。
-- 不可变规则：会话只能在 processing 状态下认领处理或写入一次终态；终态后不得修改，任何时候不得删除；反馈只追加。
-- 不保存模型原文、提示词或坐标：只保存原文 SHA-256、结构化公开结果、计量与尝试记录。
-- 切换条件：information_schema.TABLES 读回三张表、TRIGGERS 读回 6 个门禁触发器；只在本机与测试库执行，生产执行另行获准。
-- 回退：停止视觉诊断路由（返回 503）；保留已写记录，不删表（删除须 DBA 另行批准，不在本文件中）。

CREATE TABLE `diagnosis_visual_images` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '视觉诊断已登记图片内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `image_ref` VARCHAR(64) NOT NULL COMMENT '高熵图片公开引用 dvi_…',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '上传并登记图片的统一用户',
  `storage_file_id` VARCHAR(512) NOT NULL COMMENT '本人诊断上传目录中的云文件 ID，不进入公开响应',
  `mime_type` VARCHAR(32) NOT NULL COMMENT '按文件魔数判定的真实类型',
  `byte_size` INT UNSIGNED NOT NULL COMMENT '登记时下载校验的字节数',
  `content_sha256` CHAR(64) NOT NULL COMMENT '登记时下载内容的 SHA-256',
  `registered_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '登记时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_visual_image_ref` (`image_ref`),
  UNIQUE KEY `uq_diag_visual_image_file` (`storage_file_id`),
  KEY `idx_diag_visual_image_owner` (`user_internal_id`, `registered_at_ms`),
  CONSTRAINT `ck_diag_visual_image_mime` CHECK (`mime_type` IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT `ck_diag_visual_image_size` CHECK (`byte_size` > 0),
  CONSTRAINT `fk_diag_visual_image_user` FOREIGN KEY (`user_internal_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 视觉诊断已登记图片';

CREATE TABLE `diagnosis_visual_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '视觉诊断会话内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `visual_diagnosis_ref` VARCHAR(64) NOT NULL COMMENT '高熵诊断公开引用 vds_…',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '发起诊断并被扣点的统一用户',
  `subject_kind` VARCHAR(32) NOT NULL COMMENT '诊断对象：user_plant 本人用户植物；authenticated_ephemeral 本人登录临时案例',
  `user_plant_internal_id` BIGINT UNSIGNED NULL COMMENT '用户植物内部主键；临时案例为空',
  `ephemeral_case_internal_id` BIGINT UNSIGNED NULL COMMENT '登录临时案例内部主键；用户植物为空',
  `image_refs_json` JSON NOT NULL COMMENT '本次诊断使用的 1～3 个图片公开引用（按 imageIndex 顺序）',
  `user_question_zh` VARCHAR(200) NULL COMMENT '用户描述（只作症状线索）',
  `reservation_ref` VARCHAR(64) NOT NULL COMMENT 'AI 额度预占公开引用，不进入公开响应',
  `version_group_json` JSON NOT NULL COMMENT '版本组：策略发布版本与摘要、模型顺序、请求参数、成本策略、价目、提示词摘要、输出 Schema、药剂名单版本',
  `context_summary_json` JSON NULL COMMENT '本次使用的诊断上下文摘要（已校验、无坐标）；没有时为空',
  `status` VARCHAR(24) NOT NULL COMMENT '状态：processing、completed、released_no_charge、failed_no_charge',
  `processing_claimed_at_ms` BIGINT UNSIGNED NULL COMMENT '处理认领时间，UTC 毫秒；同一会话只认领一次',
  `release_reason` VARCHAR(32) NULL COMMENT '不扣点原因：not_plant、image_unusable、model_failed、safety_gate_rejected',
  `public_result_json` JSON NULL COMMENT '完成时的 diagnosis-result/v2 公开结果（不可变，回放直接返回）',
  `image_assessment_json` JSON NULL COMMENT '脱敏图片评估',
  `model_code` VARCHAR(80) NULL COMMENT '最终产出结果的模型代码，不进入公开响应',
  `raw_text_sha256s_json` JSON NULL COMMENT '每次模型回包原文的 SHA-256（原文不保存）',
  `model_calls_json` JSON NULL COMMENT '每次成功调用的模型与 tokens 计量',
  `model_attempts_json` JSON NULL COMMENT '全部尝试记录（模型代码、结果类型、HTTP 状态）',
  `cost_micros` BIGINT UNSIGNED NULL COMMENT '按版本组价目计算的实际成本，人民币微元',
  `charged_points` INT UNSIGNED NULL COMMENT '公开扣点（不超过预估点数）；不扣点为 0',
  `quota_outcome` VARCHAR(32) NULL COMMENT '额度结局：settled、released、pending_reconciliation、unconfirmed',
  `record_sha256` CHAR(64) NULL COMMENT '版本组、输入与终态记录的规范化 SHA-256',
  `completed_at_ms` BIGINT UNSIGNED NULL COMMENT '进入终态时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_visual_session_ref` (`visual_diagnosis_ref`),
  UNIQUE KEY `uq_diag_visual_session_reservation` (`reservation_ref`),
  KEY `idx_diag_visual_session_owner` (`user_internal_id`, `created_at_ms`, `id`),
  KEY `idx_diag_visual_session_plant` (`user_internal_id`, `user_plant_internal_id`, `created_at_ms`, `id`),
  CONSTRAINT `ck_diag_visual_session_subject` CHECK (
    (`subject_kind` = 'user_plant' AND `user_plant_internal_id` IS NOT NULL AND `ephemeral_case_internal_id` IS NULL)
    OR (`subject_kind` = 'authenticated_ephemeral' AND `ephemeral_case_internal_id` IS NOT NULL AND `user_plant_internal_id` IS NULL)
  ),
  CONSTRAINT `ck_diag_visual_session_status` CHECK (`status` IN ('processing', 'completed', 'released_no_charge', 'failed_no_charge')),
  CONSTRAINT `ck_diag_visual_session_terminal` CHECK (
    (`status` = 'processing' AND `completed_at_ms` IS NULL AND `record_sha256` IS NULL AND `public_result_json` IS NULL AND `release_reason` IS NULL AND `charged_points` IS NULL)
    OR (`status` = 'completed' AND `completed_at_ms` IS NOT NULL AND `record_sha256` IS NOT NULL AND `public_result_json` IS NOT NULL
      AND `image_assessment_json` IS NOT NULL AND `release_reason` IS NULL AND `charged_points` IS NOT NULL AND `quota_outcome` IS NOT NULL)
    OR (`status` = 'released_no_charge' AND `completed_at_ms` IS NOT NULL AND `record_sha256` IS NOT NULL AND `public_result_json` IS NULL
      AND `image_assessment_json` IS NOT NULL AND `release_reason` IN ('not_plant', 'image_unusable') AND `charged_points` = 0 AND `quota_outcome` IS NOT NULL)
    OR (`status` = 'failed_no_charge' AND `completed_at_ms` IS NOT NULL AND `record_sha256` IS NOT NULL AND `public_result_json` IS NULL
      AND `release_reason` IN ('model_failed', 'safety_gate_rejected') AND `charged_points` = 0 AND `quota_outcome` IS NOT NULL)
  ),
  CONSTRAINT `ck_diag_visual_session_quota` CHECK (`quota_outcome` IS NULL OR `quota_outcome` IN ('settled', 'released', 'pending_reconciliation', 'unconfirmed')),
  CONSTRAINT `ck_diag_visual_session_time` CHECK (`updated_at_ms` >= `created_at_ms` AND (`completed_at_ms` IS NULL OR `completed_at_ms` >= `created_at_ms`)),
  CONSTRAINT `fk_diag_visual_session_user` FOREIGN KEY (`user_internal_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_diag_visual_session_plant` FOREIGN KEY (`user_internal_id`, `user_plant_internal_id`) REFERENCES `user_plants` (`user_internal_id`, `id`),
  CONSTRAINT `fk_diag_visual_session_ephemeral` FOREIGN KEY (`ephemeral_case_internal_id`) REFERENCES `authenticated_ephemeral_plant_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 生成式视觉诊断会话与不可变结果';

CREATE TABLE `diagnosis_visual_feedback` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '视觉诊断反馈内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `feedback_ref` VARCHAR(64) NOT NULL COMMENT '高熵反馈公开引用 dvf_…',
  `visual_session_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属视觉诊断会话',
  `user_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '提交反馈的统一用户（必须是会话所有者）',
  `feedback_kind` VARCHAR(32) NOT NULL COMMENT '反馈类型：helpfulness 有无帮助；follow_up_outcome 回访结局',
  `feedback_value` VARCHAR(32) NOT NULL COMMENT '取值：helpful、not_helpful；improved、unchanged、worse',
  `submitted_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '提交时间，UTC 毫秒',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_visual_feedback_ref` (`feedback_ref`),
  UNIQUE KEY `uq_diag_visual_feedback_kind` (`visual_session_internal_id`, `feedback_kind`),
  CONSTRAINT `ck_diag_visual_feedback_value` CHECK (
    (`feedback_kind` = 'helpfulness' AND `feedback_value` IN ('helpful', 'not_helpful'))
    OR (`feedback_kind` = 'follow_up_outcome' AND `feedback_value` IN ('improved', 'unchanged', 'worse'))
  ),
  CONSTRAINT `fk_diag_visual_feedback_session` FOREIGN KEY (`visual_session_internal_id`) REFERENCES `diagnosis_visual_sessions` (`id`),
  CONSTRAINT `fk_diag_visual_feedback_user` FOREIGN KEY (`user_internal_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 视觉诊断最小反馈（只追加，只作加权信号）';

DELIMITER $$
CREATE TRIGGER `tr_diag_visual_image_update` BEFORE UPDATE ON `diagnosis_visual_images` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='已登记图片不可修改';
END$$
CREATE TRIGGER `tr_diag_visual_session_insert` BEFORE INSERT ON `diagnosis_visual_sessions` FOR EACH ROW
BEGIN
  IF NEW.status <> 'processing' OR NEW.processing_claimed_at_ms IS NOT NULL OR NEW._openid <> '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='新视觉诊断必须以未认领的处理中状态创建';
  END IF;
END$$
CREATE TRIGGER `tr_diag_visual_session_update` BEFORE UPDATE ON `diagnosis_visual_sessions` FOR EACH ROW
BEGIN
  IF OLD.status <> 'processing' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='视觉诊断结果不可修改';
  END IF;
  IF NOT (NEW.visual_diagnosis_ref <=> OLD.visual_diagnosis_ref) OR NOT (NEW.user_internal_id <=> OLD.user_internal_id)
    OR NOT (NEW.subject_kind <=> OLD.subject_kind) OR NOT (NEW.user_plant_internal_id <=> OLD.user_plant_internal_id)
    OR NOT (NEW.ephemeral_case_internal_id <=> OLD.ephemeral_case_internal_id) OR NOT (NEW.image_refs_json <=> OLD.image_refs_json)
    OR NOT (NEW.user_question_zh <=> OLD.user_question_zh) OR NOT (NEW.reservation_ref <=> OLD.reservation_ref)
    OR NOT (NEW.version_group_json <=> OLD.version_group_json) OR NOT (NEW.context_summary_json <=> OLD.context_summary_json)
    OR NOT (NEW.created_at_ms <=> OLD.created_at_ms) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='视觉诊断输入与版本组不可修改';
  END IF;
  IF OLD.processing_claimed_at_ms IS NOT NULL AND NOT (NEW.processing_claimed_at_ms <=> OLD.processing_claimed_at_ms) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='视觉诊断只能认领一次';
  END IF;
END$$
CREATE TRIGGER `tr_diag_visual_session_delete` BEFORE DELETE ON `diagnosis_visual_sessions` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='视觉诊断不可删除';
END$$
CREATE TRIGGER `tr_diag_visual_feedback_update` BEFORE UPDATE ON `diagnosis_visual_feedback` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='视觉诊断反馈只追加';
END$$
CREATE TRIGGER `tr_diag_visual_feedback_delete` BEFORE DELETE ON `diagnosis_visual_feedback` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='视觉诊断反馈只追加';
END$$
DELIMITER ;
