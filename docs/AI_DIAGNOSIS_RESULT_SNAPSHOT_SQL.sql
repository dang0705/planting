CREATE TABLE IF NOT EXISTS diagnosis_result_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  diagnosis_id VARCHAR(64) NOT NULL,
  _openid VARCHAR(64) NOT NULL,
  snapshot_json JSON NOT NULL,
  diagnosis_engine_version VARCHAR(64) NOT NULL,
  data_bundle_version VARCHAR(64) NOT NULL,
  question_system_version VARCHAR(64) NOT NULL,
  result_explanation_version VARCHAR(64) NOT NULL,
  legacy_adapter_version VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_diagnosis_result_snapshots_diag (diagnosis_id),
  KEY idx_diagnosis_result_snapshots_openid_created (_openid, created_at)
);
