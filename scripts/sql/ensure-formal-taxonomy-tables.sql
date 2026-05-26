CREATE TABLE IF NOT EXISTS plant_identity_match_rules (
  match_rule_id VARCHAR(64) PRIMARY KEY COMMENT '命中规则ID',
  _openid VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  plant_identity_id VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  match_key VARCHAR(255) NOT NULL COMMENT '命中键',
  match_rule_type VARCHAR(64) NOT NULL COMMENT '命中规则类型',
  match_strength VARCHAR(32) NOT NULL COMMENT '命中强度',
  source_name VARCHAR(128) NULL COMMENT '来源',
  is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_identity_match (plant_identity_id, match_key, match_rule_type),
  KEY idx_match_key (match_key),
  KEY idx_match_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='植物身份命中规则表';

CREATE TABLE IF NOT EXISTS plant_identity_merge_history (
  merge_history_id VARCHAR(64) PRIMARY KEY COMMENT '合并历史ID',
  _openid VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  source_identity_id VARCHAR(64) NOT NULL COMMENT '源身份对象ID',
  target_identity_id VARCHAR(64) NOT NULL COMMENT '目标身份对象ID',
  merge_reason TEXT NULL COMMENT '合并原因',
  merged_at DATETIME NULL COMMENT '合并时间',
  KEY idx_merge_source_target (source_identity_id, target_identity_id),
  KEY idx_merge_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='植物身份合并历史表';
