-- 青花植后端 v2 / 诊断知识人工审核撤销记录。
-- 仅供按 manifest 顺序初始化空库；不在 HTTP 函数启动时执行。
-- 撤销独立追加，不改写原批准；审核/撤销请求幂等及发布竞争仍由 diagnosis 事务校验。

CREATE TABLE `diagnosis_review_revocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '审核撤销记录内部主键，不进入公开响应',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `revocation_ref` VARCHAR(96) NOT NULL COMMENT '本次撤销的独立幂等引用',
  `target_review_internal_id` BIGINT UNSIGNED NOT NULL COMMENT '被撤销的既有批准审核内部主键',
  `target_decision` VARCHAR(16) NOT NULL DEFAULT 'approved' COMMENT '目标必须为已批准审核，数据库固定为 approved',
  `request_sha256` CHAR(64) NOT NULL COMMENT '规范化撤销请求摘要；同引用异参必须冲突',
  `revoked_by_ref_hash` CHAR(64) NOT NULL COMMENT '服务端验证后的管理员主体不可逆摘要',
  `reason_zh` TEXT NOT NULL COMMENT '撤销既有批准的中文理由',
  `review_evidence_ref` VARCHAR(191) NULL COMMENT '受控审核证据引用，不进入公开响应',
  `revoked_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '服务端记录的撤销时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_diag_revocation_ref` (`revocation_ref`),
  UNIQUE KEY `uq_diag_revocation_target` (`target_review_internal_id`),
  KEY `idx_diag_revocation_target_decision` (`target_review_internal_id`, `target_decision`),
  CONSTRAINT `fk_diag_revocation_approved_review` FOREIGN KEY (`target_review_internal_id`, `target_decision`) REFERENCES `diagnosis_review_attestations` (`id`, `decision`),
  CONSTRAINT `ck_diag_revocation_approved` CHECK (`target_decision` = 'approved'),
  CONSTRAINT `ck_diag_revocation_reason` CHECK (CHAR_LENGTH(TRIM(`reason_zh`)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='针对既有批准的独立撤销事实；保留原审核凭据';
