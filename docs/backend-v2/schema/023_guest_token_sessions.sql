-- 023：游客改为服务端自发令牌（guest-token/v1，用户 2026-10-08 冻结）。
-- 只扩展 guest_sessions：
--   1. anonymous_subject_hash 改为可空，语义改为“可选平台匿名信号摘要”（抖音 anonymous_openid 的 HMAC），仅作防刷键；
--   2. 新增 identity_source 标记游客身份来源，新签发一律为 server_issued_guest_token；
--   3. 新增 issuance_source_hash 作为签发限流键（平台匿名信号摘要或客户端来源摘要），并建索引支持“每来源每小时”计数。
-- possession_proof_hash 继续存持有证明摘要：服务端自发令牌的 SHA-256。不保存令牌原文、设备 ID 或 IP。
-- 不删除、不重命名既有字段；历史行保留原 CloudBase 语义（identity_source 默认 cloudbase_anonymous）。

ALTER TABLE `guest_sessions`
  MODIFY COLUMN `anonymous_subject_hash` CHAR(64) NULL COMMENT '可选平台匿名信号（抖音 anonymous_openid）HMAC 摘要；仅作防刷，不作业务主键；历史行为 CloudBase 匿名主体摘要',
  ADD COLUMN `identity_source` VARCHAR(32) NOT NULL DEFAULT 'cloudbase_anonymous' COMMENT '游客身份来源：server_issued_guest_token（新签发）或历史 cloudbase_anonymous' AFTER `guest_session_ref`,
  ADD COLUMN `issuance_source_hash` CHAR(64) NOT NULL DEFAULT '' COMMENT '签发限流键摘要（平台匿名信号或客户端来源），不作归属或认领凭证' AFTER `anonymous_subject_hash`,
  ADD KEY `idx_guest_session_issuance` (`issuance_source_hash`, `issued_at_ms`),
  ADD CONSTRAINT `ck_guest_session_identity_source` CHECK (`identity_source` IN ('cloudbase_anonymous', 'server_issued_guest_token'));
