-- 青花植后端 v2 / 共享基础设施空库 DDL。
-- 只保存不可逆主体/幂等键摘要和已脱敏公开结果，禁止保存原始认证材料。

CREATE TABLE `http_idempotency_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '共享 HTTP 幂等记录内部主键',
  `_openid` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属',
  `principal_type` VARCHAR(16) NOT NULL COMMENT '受控主体类型：guest、user、service',
  `principal_scope_hash` CHAR(64) NOT NULL COMMENT '主体幂等作用域的不可逆摘要，不保存用户、游客或服务原始标识',
  `http_method` VARCHAR(8) NOT NULL COMMENT '大写 HTTP 方法',
  `normalized_path` VARCHAR(191) NOT NULL COMMENT '不含敏感查询值的规范化路由模板',
  `operation_id` VARCHAR(96) NOT NULL COMMENT '路由登记表中的稳定业务动作标识',
  `idempotency_key_hash` CHAR(64) NOT NULL COMMENT 'Idempotency-Key 的不可逆摘要，不保存原始请求头',
  `request_hash` CHAR(64) NOT NULL COMMENT '规范化请求内容 SHA-256，用于判断同键同参或同键异参',
  `state` VARCHAR(16) NOT NULL COMMENT '状态：processing、completed',
  `response_status` SMALLINT UNSIGNED NULL COMMENT '首次确定公开结果的 HTTP 状态码，处理中为空',
  `response_json` JSON NULL COMMENT '首次确定的脱敏公开 JSON 响应，处理中为空',
  `response_hash` CHAR(64) NULL COMMENT '规范化公开响应 SHA-256，用于读回完整性核对',
  `stable_error_type` VARCHAR(64) NULL COMMENT '已确定失败时的公开稳定错误类型，成功或处理中为空',
  `expires_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '按当次请求锁定策略计算的到期时间，UTC 毫秒',
  `completed_at_ms` BIGINT UNSIGNED NULL COMMENT '首次请求完成时间，UTC 毫秒；处理中为空',
  `created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '唯一占位创建时间，UTC 毫秒',
  `updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '最后状态更新时间，UTC 毫秒',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_http_idempotency_scope` (`principal_type`, `principal_scope_hash`, `http_method`, `normalized_path`, `operation_id`, `idempotency_key_hash`),
  KEY `idx_http_idempotency_expiry` (`expires_at_ms`),
  CONSTRAINT `ck_http_idempotency_principal_type` CHECK (`principal_type` IN ('guest', 'user', 'service')),
  CONSTRAINT `ck_http_idempotency_state` CHECK (`state` IN ('processing', 'completed')),
  CONSTRAINT `ck_http_idempotency_response_status` CHECK (`response_status` IS NULL OR (`response_status` >= 200 AND `response_status` <= 599)),
  CONSTRAINT `ck_http_idempotency_completion` CHECK ((`state` = 'processing' AND `response_status` IS NULL AND `response_json` IS NULL AND `response_hash` IS NULL AND `stable_error_type` IS NULL AND `completed_at_ms` IS NULL) OR (`state` = 'completed' AND `response_status` IS NOT NULL AND `response_json` IS NOT NULL AND `response_hash` IS NOT NULL AND `completed_at_ms` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2 共享 HTTP 幂等记录';
