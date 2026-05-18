CREATE TABLE IF NOT EXISTS visual_out_of_pool_proxy_mappings (
  mapping_id VARCHAR(128) NOT NULL PRIMARY KEY,
  source_group_id VARCHAR(64) NOT NULL DEFAULT '',
  target_symptom_key VARCHAR(128) NOT NULL,
  match_terms_json JSON NOT NULL,
  rationale TEXT NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  enabled TINYINT NOT NULL DEFAULT 1,
  priority INT NOT NULL DEFAULT 0,
  created_by_openid VARCHAR(128) NULL,
  updated_by_openid VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_visual_out_of_pool_proxy_source_group (source_group_id, review_status, enabled)
);
