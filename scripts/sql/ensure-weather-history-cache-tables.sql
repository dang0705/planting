CREATE TABLE IF NOT EXISTS weather_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  location_key VARCHAR(128) NOT NULL COMMENT '业务地点键，用于对象存储路径',
  qweather_location_id VARCHAR(64) NOT NULL DEFAULT '' COMMENT '和风 LocationID',
  city_name VARCHAR(128) NOT NULL DEFAULT '' COMMENT '城市或业务地点名',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT '地点时区',
  is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用采集',
  last_used_at DATETIME NULL COMMENT '最近被业务使用时间',
  recent_object_path VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'recent-10d.json 对象路径',
  recent_file_id VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'recent-10d.json 文件 ID',
  manifest_object_path VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'manifest.json 对象路径',
  manifest_file_id VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'manifest.json 文件 ID',
  recent_generated_at DATETIME NULL COMMENT 'recent-10d.json 生成时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_weather_locations_location_key (location_key),
  KEY idx_weather_locations_active (is_active, updated_at),
  KEY idx_weather_locations_qweather_location_id (qweather_location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='天气地点元数据，不保存 daily 主体';

CREATE TABLE IF NOT EXISTS diagnosis_weather_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  diagnosis_session_id VARCHAR(128) NOT NULL DEFAULT '' COMMENT '诊断会话 ID',
  location_key VARCHAR(128) NOT NULL DEFAULT '' COMMENT '天气地点键',
  weather_object_path VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'recent-10d.json 对象路径',
  source_kind VARCHAR(64) NOT NULL DEFAULT '' COMMENT '天气证据来源类型',
  quality VARCHAR(32) NOT NULL DEFAULT '' COMMENT '天气证据质量',
  generated_at DATETIME NULL COMMENT '天气对象生成时间',
  referenced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '诊断引用时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_diagnosis_weather_evidence_session (diagnosis_session_id),
  KEY idx_diagnosis_weather_evidence_location (location_key, referenced_at),
  KEY idx_diagnosis_weather_evidence_object_path (weather_object_path(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='诊断天气证据引用元数据，不保存天气 daily 主体';
