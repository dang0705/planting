-- 微信支付订阅订单表。
-- 本轮只准备 cloud1_dev 结构，不执行生产库；执行前仍需按项目 runbook 由人工确认目标库。
-- 金额、订单号和微信交易号均保留服务端审计字段；不保存 API v3 密钥、商户私钥或完整回调密文。
CREATE TABLE IF NOT EXISTS `cloud1_dev`.`subscription_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `out_trade_no` VARCHAR(32) NOT NULL COMMENT '商户订单号，传给微信支付',
  `client_request_id` VARCHAR(64) NOT NULL COMMENT '客户端幂等请求号，同一用户内唯一',
  `_openid` VARCHAR(128) NOT NULL COMMENT '下单用户 openid',
  `user_id` VARCHAR(128) NOT NULL COMMENT 'users._id 快照',
  `plan_id` VARCHAR(64) NOT NULL COMMENT '服务端套餐 ID',
  `plan_type` VARCHAR(32) NOT NULL COMMENT 'premium（免费方案不创建支付订单）',
  `duration_days` SMALLINT UNSIGNED NOT NULL,
  `amount_total` INT UNSIGNED NOT NULL COMMENT '人民币分',
  `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
  `description` VARCHAR(127) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'created' COMMENT 'created/prepay_processing/prepay_created/prepay_failed/paid/wechat_*',
  `prepay_id` VARCHAR(128) NULL,
  `transaction_id` VARCHAR(64) NULL,
  `payer_openid` VARCHAR(128) NULL,
  `paid_at` BIGINT UNSIGNED NULL,
  `failure_reason` VARCHAR(255) NULL,
  `notify_body_sha256` CHAR(64) NULL COMMENT '已验签回调原文摘要',
  `notify_received_at` BIGINT UNSIGNED NULL,
  `created_at` BIGINT UNSIGNED NOT NULL,
  `updated_at` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subscription_out_trade_no` (`out_trade_no`),
  UNIQUE KEY `uq_subscription_client_request` (`_openid`, `client_request_id`),
  KEY `idx_subscription_openid_created` (`_openid`, `created_at`),
  KEY `idx_subscription_transaction` (`transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信支付订阅订单审计表';
