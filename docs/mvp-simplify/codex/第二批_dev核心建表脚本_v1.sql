-- 第二批 dev 核心建表脚本 v1
-- 作用：
-- 1. 在 cloud1_dev 中创建第一版重构所需核心新表
-- 2. 对已存在的 diagnosis_sessions 做兼容扩展，而不是直接重建
-- 3. 不删除旧表，不触碰 prod schema

CREATE TABLE IF NOT EXISTS plant_identity_entities (
  plant_identity_id            VARCHAR(64) PRIMARY KEY COMMENT '植物身份对象ID',
  _openid                      VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  legacy_plant_id              VARCHAR(64) NULL COMMENT '历史植物ID',
  canonical_identity_name      VARCHAR(255) NOT NULL COMMENT '主身份主名',
  canonical_identity_name_cn   VARCHAR(255) NULL COMMENT '中文主身份主名',
  canonical_identity_name_en   VARCHAR(255) NULL COMMENT '英文主身份主名',
  primary_display_name         VARCHAR(255) NOT NULL COMMENT '主展示名',
  identity_level               VARCHAR(64) NOT NULL COMMENT '身份层级',
  family_name_canonical        VARCHAR(255) NULL COMMENT '归一科名（第一阶段正式挂接键）',
  family_name_cn               VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en               VARCHAR(255) NULL COMMENT '科英文名',
  genus_name                   VARCHAR(255) NULL COMMENT '属名',
  species_name                 VARCHAR(255) NULL COMMENT '种名',
  scientific_name              VARCHAR(255) NULL COMMENT '学名',
  category_name_cn             VARCHAR(255) NULL COMMENT '分类中文名',
  category_name_en             VARCHAR(255) NULL COMMENT '分类英文名',
  basic_description            TEXT NULL COMMENT '基础描述',
  cover_image_ref              TEXT NULL COMMENT '封面图引用',
  is_active                    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  review_status                VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                  VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                      VARCHAR(64) NULL COMMENT '版本',
  created_at                   DATETIME NULL COMMENT '创建时间',
  updated_at                   DATETIME NULL COMMENT '更新时间',
  retired_at                   DATETIME NULL COMMENT '退役时间',
  replacement_identity_id      VARCHAR(64) NULL COMMENT '替代对象ID',
  UNIQUE KEY uk_identity_name_level (canonical_identity_name, identity_level),
  KEY idx_genus_family (genus_name, family_name_canonical),
  KEY idx_identity_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='植物身份主表';

CREATE TABLE IF NOT EXISTS plant_identity_aliases (
  alias_id                     VARCHAR(64) PRIMARY KEY COMMENT '别名ID',
  _openid                      VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  plant_identity_id            VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  alias_name                   VARCHAR(255) NOT NULL COMMENT '别名内容',
  alias_type                   VARCHAR(64) NOT NULL COMMENT '别名类型',
  is_preferred_search_alias    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否优先搜索别名',
  source_name                  VARCHAR(128) NULL COMMENT '来源',
  is_active                    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                   DATETIME NULL COMMENT '创建时间',
  UNIQUE KEY uk_identity_alias_type (plant_identity_id, alias_name, alias_type),
  KEY idx_alias_name (alias_name),
  KEY idx_alias_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='植物身份别名表';

CREATE TABLE IF NOT EXISTS genus_care_profiles (
  genus_care_profile_id        VARCHAR(64) PRIMARY KEY COMMENT '属级养护基线ID',
  _openid                      VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  genus_name                   VARCHAR(255) NOT NULL COMMENT '属名',
  family_name_canonical        VARCHAR(255) NOT NULL COMMENT '归一科名（第一阶段正式挂接键）',
  family_name_cn               VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en               VARCHAR(255) NULL COMMENT '科英文名',
  genus_id                     VARCHAR(64) NULL COMMENT '属ID（预留升级位）',
  genus_identity_id            VARCHAR(64) NULL COMMENT '属级身份对象ID（预留升级位）',
  plant_category               VARCHAR(64) NOT NULL COMMENT '植物类别',
  watering_strategy_json       JSON NOT NULL COMMENT '浇水策略JSON',
  fertilizing_strategy_json    JSON NOT NULL COMMENT '施肥策略JSON',
  light_strategy_json          JSON NOT NULL COMMENT '光照策略JSON',
  airflow_strategy_json        JSON NOT NULL COMMENT '通风策略JSON',
  temp_min_c                   DECIMAL(5,2) NULL COMMENT '最低适宜温度（℃）',
  temp_max_c                   DECIMAL(5,2) NULL COMMENT '最高适宜温度（℃）',
  humidity_min                 DECIMAL(5,2) NULL COMMENT '最低适宜湿度',
  humidity_max                 DECIMAL(5,2) NULL COMMENT '最高适宜湿度',
  toxicity_level               VARCHAR(64) NOT NULL COMMENT '毒性等级',
  review_status                VARCHAR(64) NOT NULL COMMENT '审核状态',
  source_evidence              TEXT NULL COMMENT '证据来源',
  baseline_note                TEXT NULL COMMENT '基线说明',
  evidence_level               VARCHAR(64) NOT NULL COMMENT '证据层级',
  evidence_strategy            VARCHAR(64) NOT NULL COMMENT '证据策略',
  data_source                  VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                      VARCHAR(64) NULL COMMENT '版本',
  is_active                    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                   DATETIME NULL COMMENT '创建时间',
  updated_at                   DATETIME NULL COMMENT '更新时间',
  retired_at                   DATETIME NULL COMMENT '退役时间',
  replacement_profile_id       VARCHAR(64) NULL COMMENT '替代基线ID',
  UNIQUE KEY uk_genus_family (genus_name, family_name_canonical),
  KEY idx_care_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='属级养护基线表';

CREATE TABLE IF NOT EXISTS visual_call_batches (
  visual_call_batch_id         VARCHAR(64) PRIMARY KEY COMMENT '视觉调用批次ID',
  _openid                      VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  session_id                   VARCHAR(64) NOT NULL COMMENT '会话ID',
  trigger_source               VARCHAR(64) NULL COMMENT '触发来源',
  round_id                     VARCHAR(64) NULL COMMENT '轮次ID',
  batch_status                 VARCHAR(64) NULL COMMENT '批次状态',
  image_count                  INT NULL COMMENT '图片数量',
  created_at                   DATETIME NULL COMMENT '创建时间',
  updated_at                   DATETIME NULL COMMENT '更新时间',
  KEY idx_session_round (session_id, round_id),
  KEY idx_batch_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='视觉调用批次主记录表';

CREATE TABLE IF NOT EXISTS plant_identity_resolution_records (
  identity_resolution_record_id VARCHAR(64) PRIMARY KEY COMMENT '身份解析记录ID',
  _openid                       VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  session_id                    VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id          VARCHAR(64) NULL COMMENT '视觉调用批次ID',
  raw_recognition_name          VARCHAR(255) NULL COMMENT '原始识别名',
  taxonomy_match_status         VARCHAR(64) NOT NULL COMMENT '原始识别名对Taxonomy的命中结果',
  identity_resolution_status    VARCHAR(64) NOT NULL COMMENT '进入会话裁定后的身份解析状态',
  matched_plant_identity_id     VARCHAR(64) NULL COMMENT '命中植物身份对象ID',
  is_current_primary_identity   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前主身份结果',
  match_rule                    VARCHAR(64) NULL COMMENT '命中规则',
  match_score                   DECIMAL(6,3) NULL COMMENT '命中分数',
  match_reason                  TEXT NULL COMMENT '命中原因',
  superseded_by_resolution_id   VARCHAR(64) NULL COMMENT '被哪个解析记录覆盖',
  superseded_reason             TEXT NULL COMMENT '覆盖原因',
  superseded_at                 DATETIME NULL COMMENT '覆盖时间',
  created_at                    DATETIME NULL COMMENT '创建时间',
  updated_at                    DATETIME NULL COMMENT '更新时间',
  KEY idx_resolution_session (session_id, is_current_primary_identity),
  KEY idx_resolution_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='植物身份解析记录表';

CREATE TABLE IF NOT EXISTS visual_raw_image_records (
  visual_raw_image_record_id   VARCHAR(64) PRIMARY KEY COMMENT '单图视觉原始记录ID',
  _openid                      VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  session_id                   VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id         VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  image_ref                    TEXT NULL COMMENT '图片引用',
  input_slot_type              VARCHAR(64) NULL COMMENT '输入槽位类型',
  input_slot_order             INT NULL COMMENT '输入槽位顺序',
  input_slot_label             VARCHAR(255) NULL COMMENT '输入槽位标签',
  user_declared_organ_type     VARCHAR(64) NULL COMMENT '用户声明器官类型',
  user_declared_organ_confidence DECIMAL(6,3) NULL COMMENT '用户声明器官置信度',
  source_model_provider        VARCHAR(128) NULL COMMENT '来源模型供应方',
  source_model_name            VARCHAR(255) NULL COMMENT '来源模型名称',
  model_name                   VARCHAR(128) NULL COMMENT '模型名称',
  model_version                VARCHAR(128) NULL COMMENT '模型版本',
  prompt_version               VARCHAR(128) NULL COMMENT '提示词版本',
  raw_text_output              LONGTEXT NULL COMMENT '原始文本输出',
  raw_structured_output        LONGTEXT NULL COMMENT '原始结构化输出',
  call_status                  VARCHAR(64) NULL COMMENT '调用状态',
  latency_ms                   INT NULL COMMENT '延迟毫秒数',
  error_code                   VARCHAR(64) NULL COMMENT '错误码',
  created_at                   DATETIME NULL COMMENT '创建时间',
  KEY idx_raw_batch (visual_call_batch_id),
  KEY idx_raw_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单图视觉原始记录表';

CREATE TABLE IF NOT EXISTS visual_normalized_image_results (
  visual_normalized_image_result_id VARCHAR(64) PRIMARY KEY COMMENT '单图视觉标准化结果ID',
  _openid                           VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_raw_image_record_id        VARCHAR(64) NOT NULL COMMENT '单图视觉原始记录ID',
  source_model_provider             VARCHAR(128) NULL COMMENT '来源模型供应方',
  source_model_name                 VARCHAR(255) NULL COMMENT '来源模型名称',
  input_slot_order                  INT NULL COMMENT '输入槽位顺序',
  input_slot_label                  VARCHAR(255) NULL COMMENT '输入槽位标签',
  user_declared_organ_type          VARCHAR(64) NULL COMMENT '用户声明器官类型',
  user_declared_organ_confidence    DECIMAL(6,3) NULL COMMENT '用户声明器官置信度',
  analyzability_level               VARCHAR(64) NULL COMMENT '可分析等级',
  clarity_level                     VARCHAR(64) NULL COMMENT '清晰度等级',
  subject_completeness_level        VARCHAR(64) NULL COMMENT '主体完整性等级',
  primary_organ_type                VARCHAR(64) NULL COMMENT '主器官类型',
  primary_organ_confidence          DECIMAL(6,3) NULL COMMENT '主器官置信度',
  organ_source                      VARCHAR(64) NULL COMMENT '器官来源',
  multi_organ_detected              TINYINT(1) NULL COMMENT '是否检测到多器官',
  organ_conflict_flag               TINYINT(1) NULL COMMENT '器官冲突标记',
  organ_resolution_reason           TEXT NULL COMMENT '器官冲突处理原因',
  topk_symptoms_json                JSON NULL COMMENT '前K症状JSON',
  pattern_candidates_json           JSON NULL COMMENT '模式候选JSON',
  route_hints_json                  JSON NULL COMMENT '路由建议JSON',
  route_primary_action              VARCHAR(64) NULL COMMENT '路由建议主动作',
  top1_stability_score              DECIMAL(6,3) NULL COMMENT 'Top1稳定性分数',
  top3_stability_score              DECIMAL(6,3) NULL COMMENT 'Top3稳定性分数',
  long_tail_noise_flag              TINYINT(1) NULL COMMENT '长尾噪声标记',
  pattern_derivation_status         VARCHAR(64) NULL COMMENT '模式推导状态',
  created_at                        DATETIME NULL COMMENT '创建时间',
  KEY idx_normalized_batch (visual_call_batch_id),
  KEY idx_normalized_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单图视觉标准化结果表';

CREATE TABLE IF NOT EXISTS visual_admission_records (
  visual_admission_record_id    VARCHAR(64) PRIMARY KEY COMMENT '视觉接纳判定记录ID',
  _openid                       VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  session_id                    VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id          VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_normalized_image_result_id VARCHAR(64) NOT NULL COMMENT '单图视觉标准化结果ID',
  object_type                   VARCHAR(64) NOT NULL COMMENT '对象类型',
  object_key                    VARCHAR(255) NULL COMMENT '对象键',
  admission_result              VARCHAR(64) NOT NULL COMMENT '接纳结果',
  admission_reason              TEXT NULL COMMENT '接纳理由',
  entered_runtime               TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否进入运行时正式层',
  target_layer                  VARCHAR(64) NULL COMMENT '进入目标层级',
  created_at                    DATETIME NULL COMMENT '创建时间',
  KEY idx_admission_batch (visual_call_batch_id),
  KEY idx_admission_openid (_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='视觉接纳判定记录表';

CREATE TABLE IF NOT EXISTS observed_evidence_set (
  observed_evidence_row_id      BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '已观察证据行ID',
  observed_evidence_set_id      VARCHAR(255) NOT NULL COMMENT '已观察证据集条目ID',
  _openid                       VARCHAR(64) NOT NULL DEFAULT '' COMMENT '云开发用户标识',
  session_id                    VARCHAR(64) NOT NULL COMMENT '会话ID',
  diagnosis_id                  VARCHAR(64) NOT NULL COMMENT '诊断ID（当前与session_id同值）',
  evidence_key                  VARCHAR(255) NOT NULL COMMENT '证据键',
  evidence_type                 VARCHAR(64) NOT NULL COMMENT '证据类型',
  symptom_key                   VARCHAR(255) NOT NULL COMMENT '症状键',
  symptom_cn                    VARCHAR(255) NULL COMMENT '症状中文名',
  confidence                    DECIMAL(12,6) NULL COMMENT '会话内可信度修正',
  source_type                   VARCHAR(64) NOT NULL COMMENT '来源类型',
  current_status                VARCHAR(64) NOT NULL COMMENT '当前状态',
  target_layer                  VARCHAR(64) NULL COMMENT '目标层级',
  parent_evidence_key           VARCHAR(255) NULL COMMENT '父证据引用',
  source_record_id              VARCHAR(255) NULL COMMENT '来源记录ID',
  origin_visual_call_batch_id   VARCHAR(64) NULL COMMENT '来源视觉批次ID',
  superseded_by_batch_id        VARCHAR(64) NULL COMMENT '被覆盖批次ID',
  independence_group_ids_json   JSON NULL COMMENT '独立支持组ID列表',
  conflict_evidence_keys_json   JSON NULL COMMENT '冲突证据键列表',
  conflict_level                VARCHAR(64) NULL COMMENT '冲突等级',
  conflict_resolved             TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已解决冲突',
  first_seen_stage              VARCHAR(64) NULL COMMENT '首次出现阶段',
  last_updated_at               DATETIME NULL COMMENT '最近更新时间',
  entered_runtime               TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否进入运行时',
  is_key_evidence               TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否关键证据',
  entered_explanation           TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已进入解释层',
  created_at                    DATETIME NULL COMMENT '创建时间',
  updated_at                    DATETIME NULL COMMENT '更新时间',
  UNIQUE KEY uk_observed_evidence_session_item (session_id, observed_evidence_set_id),
  KEY idx_observed_evidence_openid (_openid),
  KEY idx_observed_evidence_diagnosis (diagnosis_id),
  KEY idx_observed_evidence_batch (origin_visual_call_batch_id),
  KEY idx_observed_evidence_symptom (symptom_key),
  KEY idx_observed_evidence_status (current_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='已观察证据集事实表';

-- diagnosis_sessions 不重建，做兼容扩展：
-- 1. 保留 diagnosis_id 作为当前主键，避免清空旧 dev 记录
-- 2. 新增 session_id 与新框架所需的轻量列
-- 3. 现有 46 条旧记录允许按 diagnosis_id 回填 session_id

ALTER TABLE diagnosis_sessions
  ADD COLUMN session_id VARCHAR(64) NULL COMMENT '新版会话ID' AFTER diagnosis_id,
  ADD COLUMN current_plant_identity_id VARCHAR(64) NULL COMMENT '当前主身份对象ID' AFTER plant_id,
  ADD COLUMN current_identity_resolution_status VARCHAR(64) NULL COMMENT '当前身份解析状态' AFTER current_plant_identity_id,
  ADD COLUMN current_route_primary_action VARCHAR(64) NULL COMMENT '当前主路由动作' AFTER current_identity_resolution_status,
  ADD COLUMN current_round_id VARCHAR(64) NULL COMMENT '当前轮次ID' AFTER current_route_primary_action,
  ADD COLUMN current_round_index TINYINT NOT NULL DEFAULT 0 COMMENT '当前轮次序号' AFTER current_round_id,
  ADD COLUMN latest_visual_call_batch_id VARCHAR(64) NULL COMMENT '最近视觉批次ID' AFTER current_round_index,
  ADD COLUMN outcome_type VARCHAR(64) NULL COMMENT '最终结论类型' AFTER latest_visual_call_batch_id,
  ADD COLUMN outcome_payload_json JSON NULL COMMENT '最终结论快照JSON' AFTER outcome_type,
  ADD COLUMN stop_reason VARCHAR(128) NULL COMMENT '停止原因' AFTER outcome_payload_json,
  ADD COLUMN session_status VARCHAR(64) NULL COMMENT '会话状态' AFTER stop_reason,
  ADD COLUMN runtime_snapshot_json JSON NULL COMMENT '运行时快照JSON' AFTER session_status,
  ADD COLUMN ended_at DATETIME NULL COMMENT '会话结束时间' AFTER runtime_snapshot_json;

UPDATE diagnosis_sessions
SET
  session_id = COALESCE(session_id, diagnosis_id),
  current_round_index = COALESCE(NULLIF(current_round_index, 0), follow_up_round, 0),
  outcome_type = CASE
    WHEN outcome_type IS NOT NULL THEN outcome_type
    WHEN final_problem_key IS NOT NULL THEN 'problematic'
    ELSE outcome_type
  END,
  session_status = CASE
    WHEN session_status IS NOT NULL THEN session_status
    WHEN final_problem_key IS NOT NULL THEN 'completed'
    WHEN needs_follow_up = 1 THEN 'awaiting_follow_up'
    ELSE 'active'
  END,
  ended_at = CASE
    WHEN ended_at IS NOT NULL THEN ended_at
    WHEN final_problem_key IS NOT NULL THEN updated_at
    ELSE ended_at
  END
WHERE session_id IS NULL
   OR current_round_index = 0
   OR outcome_type IS NULL
   OR session_status IS NULL
   OR ended_at IS NULL;

ALTER TABLE diagnosis_sessions
  ADD UNIQUE KEY uk_session_id (session_id),
  ADD KEY idx_session_status (session_status),
  ADD KEY idx_current_identity (current_plant_identity_id),
  ADD KEY idx_latest_visual_batch (latest_visual_call_batch_id);
