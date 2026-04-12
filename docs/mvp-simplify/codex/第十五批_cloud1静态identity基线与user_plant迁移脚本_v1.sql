-- 第十五批 cloud1 静态 identity 基线与 user_plant 迁移脚本 v1
-- 说明：
-- 1. 为当前环境 cloud1 补齐 taxonomy / visual runtime 核心表
-- 2. 为 user_plant_instances 增加 identity-first 写链所需列
-- 3. 回填旧 user_plant_instances 记录到新 identity 中枢

CREATE TABLE IF NOT EXISTS plant_identity_entities (
  plant_identity_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  legacy_plant_id VARCHAR(64) NULL,
  canonical_identity_name VARCHAR(255) NOT NULL,
  canonical_identity_name_cn VARCHAR(255) NULL,
  canonical_identity_name_en VARCHAR(255) NULL,
  primary_display_name VARCHAR(255) NOT NULL,
  identity_level VARCHAR(64) NOT NULL,
  family_name_canonical VARCHAR(255) NULL,
  family_name_cn VARCHAR(255) NULL,
  family_name_en VARCHAR(255) NULL,
  genus_name VARCHAR(255) NULL,
  species_name VARCHAR(255) NULL,
  scientific_name VARCHAR(255) NULL,
  category_name_cn VARCHAR(255) NULL,
  category_name_en VARCHAR(255) NULL,
  basic_description TEXT NULL,
  cover_image_ref TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  review_status VARCHAR(64) NOT NULL,
  data_source VARCHAR(128) NOT NULL,
  version VARCHAR(64) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  retired_at DATETIME NULL,
  replacement_identity_id VARCHAR(64) NULL,
  UNIQUE KEY uk_identity_name_level (canonical_identity_name, identity_level),
  KEY idx_genus_family (genus_name, family_name_canonical),
  KEY idx_identity_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plant_identity_aliases (
  alias_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  plant_identity_id VARCHAR(64) NOT NULL,
  alias_name VARCHAR(255) NOT NULL,
  alias_type VARCHAR(64) NOT NULL,
  is_preferred_search_alias TINYINT(1) NOT NULL DEFAULT 0,
  source_name VARCHAR(128) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  UNIQUE KEY uk_identity_alias_type (plant_identity_id, alias_name, alias_type),
  KEY idx_alias_name (alias_name),
  KEY idx_alias_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS genus_care_profiles (
  genus_care_profile_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  genus_name VARCHAR(255) NOT NULL,
  family_name_canonical VARCHAR(255) NOT NULL,
  family_name_cn VARCHAR(255) NULL,
  family_name_en VARCHAR(255) NULL,
  genus_id VARCHAR(64) NULL,
  genus_identity_id VARCHAR(64) NULL,
  plant_category VARCHAR(64) NOT NULL,
  watering_strategy_json JSON NOT NULL,
  fertilizing_strategy_json JSON NOT NULL,
  light_strategy_json JSON NOT NULL,
  airflow_strategy_json JSON NOT NULL,
  temp_min_c DECIMAL(5,2) NULL,
  temp_max_c DECIMAL(5,2) NULL,
  humidity_min DECIMAL(5,2) NULL,
  humidity_max DECIMAL(5,2) NULL,
  toxicity_level VARCHAR(64) NOT NULL,
  review_status VARCHAR(64) NOT NULL,
  source_evidence TEXT NULL,
  baseline_note TEXT NULL,
  evidence_level VARCHAR(64) NOT NULL,
  evidence_strategy VARCHAR(64) NOT NULL,
  data_source VARCHAR(128) NOT NULL,
  version VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  retired_at DATETIME NULL,
  replacement_profile_id VARCHAR(64) NULL,
  UNIQUE KEY uk_genus_family (genus_name, family_name_canonical),
  KEY idx_care_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS visual_call_batches (
  visual_call_batch_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  session_id VARCHAR(64) NOT NULL,
  trigger_source VARCHAR(64) NULL,
  round_id VARCHAR(64) NULL,
  batch_status VARCHAR(64) NULL,
  image_count INT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_session_round (session_id, round_id),
  KEY idx_batch_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plant_identity_resolution_records (
  identity_resolution_record_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  session_id VARCHAR(64) NOT NULL,
  visual_call_batch_id VARCHAR(64) NULL,
  raw_recognition_name VARCHAR(255) NULL,
  taxonomy_match_status VARCHAR(64) NOT NULL,
  identity_resolution_status VARCHAR(64) NOT NULL,
  matched_plant_identity_id VARCHAR(64) NULL,
  is_current_primary_identity TINYINT(1) NOT NULL DEFAULT 0,
  match_rule VARCHAR(64) NULL,
  match_score DECIMAL(6,3) NULL,
  match_reason TEXT NULL,
  superseded_by_resolution_id VARCHAR(64) NULL,
  superseded_reason TEXT NULL,
  superseded_at DATETIME NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_resolution_session (session_id, is_current_primary_identity),
  KEY idx_resolution_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS visual_raw_image_records (
  visual_raw_image_record_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  session_id VARCHAR(64) NOT NULL,
  visual_call_batch_id VARCHAR(64) NOT NULL,
  image_ref TEXT NULL,
  input_slot_type VARCHAR(64) NULL,
  model_name VARCHAR(128) NULL,
  model_version VARCHAR(128) NULL,
  prompt_version VARCHAR(128) NULL,
  raw_text_output LONGTEXT NULL,
  raw_structured_output LONGTEXT NULL,
  call_status VARCHAR(64) NULL,
  latency_ms INT NULL,
  error_code VARCHAR(64) NULL,
  created_at DATETIME NULL,
  KEY idx_raw_batch (visual_call_batch_id),
  KEY idx_raw_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS visual_normalized_image_results (
  visual_normalized_image_result_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  session_id VARCHAR(64) NOT NULL,
  visual_call_batch_id VARCHAR(64) NOT NULL,
  visual_raw_image_record_id VARCHAR(64) NOT NULL,
  analyzability_level VARCHAR(64) NULL,
  clarity_level VARCHAR(64) NULL,
  subject_completeness_level VARCHAR(64) NULL,
  primary_organ_type VARCHAR(64) NULL,
  organ_source VARCHAR(64) NULL,
  topk_symptoms_json JSON NULL,
  pattern_candidates_json JSON NULL,
  route_hints_json JSON NULL,
  route_primary_action VARCHAR(64) NULL,
  top1_stability_score DECIMAL(6,3) NULL,
  top3_stability_score DECIMAL(6,3) NULL,
  long_tail_noise_flag TINYINT(1) NULL,
  pattern_derivation_status VARCHAR(64) NULL,
  created_at DATETIME NULL,
  KEY idx_normalized_batch (visual_call_batch_id),
  KEY idx_normalized_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS visual_admission_records (
  visual_admission_record_id VARCHAR(64) PRIMARY KEY,
  _openid VARCHAR(64) NOT NULL DEFAULT '',
  session_id VARCHAR(64) NOT NULL,
  visual_call_batch_id VARCHAR(64) NOT NULL,
  visual_normalized_image_result_id VARCHAR(64) NOT NULL,
  object_type VARCHAR(64) NOT NULL,
  object_key VARCHAR(255) NULL,
  admission_result VARCHAR(64) NOT NULL,
  admission_reason TEXT NULL,
  entered_runtime TINYINT(1) NOT NULL DEFAULT 0,
  target_layer VARCHAR(64) NULL,
  created_at DATETIME NULL,
  KEY idx_admission_batch (visual_call_batch_id),
  KEY idx_admission_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE user_plant_instances
  ADD COLUMN plant_identity_id VARCHAR(64) NULL AFTER plant_id,
  ADD COLUMN legacy_plant_id VARCHAR(64) NULL AFTER plant_identity_id,
  ADD COLUMN identity_resolution_status VARCHAR(64) NULL AFTER recognition_confidence,
  ADD COLUMN visual_call_batch_id VARCHAR(64) NULL AFTER identity_resolution_status,
  ADD KEY idx_user_plant_identity (plant_identity_id),
  ADD KEY idx_user_plant_legacy (legacy_plant_id),
  ADD KEY idx_user_visual_batch (visual_call_batch_id);

UPDATE user_plant_instances up
LEFT JOIN plant_identity_entities pie
  ON (pie.legacy_plant_id COLLATE utf8mb4_unicode_ci = up.plant_id)
  OR (pie.plant_identity_id COLLATE utf8mb4_unicode_ci = up.plant_id)
SET
  up.plant_identity_id = COALESCE(up.plant_identity_id, pie.plant_identity_id),
  up.legacy_plant_id = COALESCE(up.legacy_plant_id, pie.legacy_plant_id, up.plant_id),
  up.identity_resolution_status = COALESCE(
    up.identity_resolution_status,
    CASE WHEN pie.plant_identity_id IS NOT NULL THEN 'matched' ELSE 'unresolved' END
  )
WHERE up.plant_identity_id IS NULL
   OR up.legacy_plant_id IS NULL
   OR up.identity_resolution_status IS NULL;

UPDATE user_plant_instances
SET recognized_name = NULL
WHERE recognized_name = 'null';
