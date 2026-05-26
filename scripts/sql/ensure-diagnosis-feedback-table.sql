CREATE TABLE IF NOT EXISTS diagnosis_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  diagnosis_id VARCHAR(64) NOT NULL,
  _openid VARCHAR(64) NOT NULL,
  is_helpful TINYINT(1) NOT NULL DEFAULT 0,
  is_accurate TINYINT(1) NOT NULL DEFAULT 0,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_diagnosis_feedback_diagnosis_id (diagnosis_id),
  KEY idx_diagnosis_feedback_openid (_openid),
  KEY idx_diagnosis_feedback_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
