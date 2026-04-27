# 第一版 SQL 表结构草案 v1.1（完整最终版，开发收口版）

> 说明：
>
> - 本文件是在 v1 基础上的开发收口版。
> - 本版只修真正阻断开发的点，并与收口裁决保持一致。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **以 dev 落地为第一目标**

---

# 一、当前建表分层

## 1. Taxonomy 主数据层
- `plant_identity_entities`
- `plant_identity_aliases`
- `plant_identity_match_rules`
- `plant_identity_merge_history`
- `genus_care_profiles`

## 2. Diagnosis 静态业务层
- `problems`
- `symptoms`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`（仅 audited generation asset，不计入 formal runtime coverage）
- `diagnosis_result_explanations`
- `plant_problem_profiles`

## 3. Taxonomy 到 Diagnosis 挂接层
- `plant_identity_diagnosis_links`

## 4. 运行时与监督层
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`
- `visual_call_aggregate_results`
- `visual_supervision_records`

---

# 二、Taxonomy 主数据层表结构草案

## 2.1 `plant_identity_entities`（植物身份主表）

```sql
CREATE TABLE plant_identity_entities (
  plant_identity_id            VARCHAR(64) PRIMARY KEY COMMENT '植物身份对象ID',
  legacy_plant_id             VARCHAR(64) NULL COMMENT '历史植物ID',
  canonical_identity_name     VARCHAR(255) NOT NULL COMMENT '主身份主名',
  canonical_identity_name_cn  VARCHAR(255) NULL COMMENT '中文主身份主名',
  canonical_identity_name_en  VARCHAR(255) NULL COMMENT '英文主身份主名',
  primary_display_name        VARCHAR(255) NOT NULL COMMENT '主展示名',
  identity_level              VARCHAR(64) NOT NULL COMMENT '身份层级',
  family_name_canonical       VARCHAR(255) NULL COMMENT '归一科名（第一阶段正式挂接键）',
  family_name_cn              VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en              VARCHAR(255) NULL COMMENT '科英文名',
  genus_name                  VARCHAR(255) NULL COMMENT '属名',
  species_name                VARCHAR(255) NULL COMMENT '种名',
  scientific_name             VARCHAR(255) NULL COMMENT '学名',
  category_name_cn            VARCHAR(255) NULL COMMENT '分类中文名',
  category_name_en            VARCHAR(255) NULL COMMENT '分类英文名',
  basic_description           TEXT NULL COMMENT '基础描述',
  cover_image_ref             TEXT NULL COMMENT '封面图引用',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_identity_id     VARCHAR(64) NULL COMMENT '替代对象ID',
  UNIQUE KEY uk_identity_name_level (canonical_identity_name, identity_level),
  KEY idx_genus_family (genus_name, family_name_canonical)
) COMMENT='植物身份主表';
```

---

## 2.2 `genus_care_profiles`（属级养护基线表）

```sql
CREATE TABLE genus_care_profiles (
  genus_care_profile_id       VARCHAR(64) PRIMARY KEY COMMENT '属级养护基线ID',
  genus_name                  VARCHAR(255) NOT NULL COMMENT '属名',
  family_name_canonical       VARCHAR(255) NOT NULL COMMENT '归一科名（第一阶段正式挂接键）',
  family_name_cn              VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en              VARCHAR(255) NULL COMMENT '科英文名',
  genus_id                    VARCHAR(64) NULL COMMENT '属ID（预留升级位）',
  genus_identity_id           VARCHAR(64) NULL COMMENT '属级身份对象ID（预留升级位）',
  plant_category              VARCHAR(64) NOT NULL COMMENT '植物类别',
  watering_strategy_json      JSON NOT NULL COMMENT '浇水策略JSON',
  fertilizing_strategy_json   JSON NOT NULL COMMENT '施肥策略JSON',
  light_strategy_json         JSON NOT NULL COMMENT '光照策略JSON',
  airflow_strategy_json       JSON NOT NULL COMMENT '通风策略JSON',
  temp_min_c                  DECIMAL(5,2) NULL COMMENT '最低适宜温度（℃）',
  temp_max_c                  DECIMAL(5,2) NULL COMMENT '最高适宜温度（℃）',
  humidity_min                DECIMAL(5,2) NULL COMMENT '最低适宜湿度',
  humidity_max                DECIMAL(5,2) NULL COMMENT '最高适宜湿度',
  toxicity_level              VARCHAR(64) NOT NULL COMMENT '毒性等级',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  source_evidence             TEXT NULL COMMENT '证据来源',
  baseline_note               TEXT NULL COMMENT '基线说明',
  evidence_level              VARCHAR(64) NOT NULL COMMENT '证据层级',
  evidence_strategy           VARCHAR(64) NOT NULL COMMENT '证据策略',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_profile_id      VARCHAR(64) NULL COMMENT '替代基线ID',
  UNIQUE KEY uk_genus_family (genus_name, family_name_canonical)
) COMMENT='属级养护基线表';
```

---

# 三、运行时与监督层表结构草案

## 3.1 `visual_call_batches`（视觉调用批次主记录表）

```sql
CREATE TABLE visual_call_batches (
  visual_call_batch_id        VARCHAR(64) PRIMARY KEY COMMENT '视觉调用批次ID',
  session_id                  VARCHAR(64) NOT NULL COMMENT '会话ID',
  trigger_source              VARCHAR(64) NULL COMMENT '触发来源',
  round_id                    VARCHAR(64) NULL COMMENT '轮次ID',
  batch_status                VARCHAR(64) NULL COMMENT '批次状态',
  image_count                 INT NULL COMMENT '图片数量',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间'
) COMMENT='视觉调用批次主记录表';
```

---

## 3.2 `plant_identity_resolution_records`（植物身份解析记录表）

```sql
CREATE TABLE plant_identity_resolution_records (
  identity_resolution_record_id VARCHAR(64) PRIMARY KEY COMMENT '身份解析记录ID',
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
  updated_at                    DATETIME NULL COMMENT '更新时间'
) COMMENT='植物身份解析记录表';
```

---

## 3.3 `visual_normalized_image_results`（单图视觉标准化结果表）

```sql
CREATE TABLE visual_normalized_image_results (
  visual_normalized_image_result_id VARCHAR(64) PRIMARY KEY COMMENT '单图视觉标准化结果ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_raw_image_record_id        VARCHAR(64) NOT NULL COMMENT '单图视觉原始记录ID',
  analyzability_level               VARCHAR(64) NULL COMMENT '可分析等级',
  clarity_level                     VARCHAR(64) NULL COMMENT '清晰度等级',
  subject_completeness_level        VARCHAR(64) NULL COMMENT '主体完整性等级',
  primary_organ_type                VARCHAR(64) NULL COMMENT '主器官类型',
  organ_source                      VARCHAR(64) NULL COMMENT '器官来源',
  topk_symptoms_json                JSON NULL COMMENT '前K症状JSON',
  pattern_candidates_json           JSON NULL COMMENT '模式候选JSON',
  route_hints_json                  JSON NULL COMMENT '路由建议JSON',
  route_primary_action              VARCHAR(64) NULL COMMENT '路由建议主动作',
  top1_stability_score              DECIMAL(6,3) NULL COMMENT 'Top1稳定性分数',
  top3_stability_score              DECIMAL(6,3) NULL COMMENT 'Top3稳定性分数',
  long_tail_noise_flag              TINYINT(1) NULL COMMENT '长尾噪声标记',
  pattern_derivation_status         VARCHAR(64) NULL COMMENT '模式推导状态',
  created_at                        DATETIME NULL COMMENT '创建时间'
) COMMENT='单图视觉标准化结果表';
```

---

## 3.4 `visual_admission_records`（视觉接纳判定记录表）

```sql
CREATE TABLE visual_admission_records (
  visual_admission_record_id   VARCHAR(64) PRIMARY KEY COMMENT '视觉接纳判定记录ID',
  session_id                   VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id         VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_normalized_image_result_id VARCHAR(64) NOT NULL COMMENT '单图视觉标准化结果ID',
  object_type                  VARCHAR(64) NOT NULL COMMENT '对象类型',
  object_key                   VARCHAR(255) NULL COMMENT '对象键',
  admission_result             VARCHAR(64) NOT NULL COMMENT '接纳结果',
  admission_reason             TEXT NULL COMMENT '接纳理由',
  entered_runtime              TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否进入运行时正式层',
  target_layer                 VARCHAR(64) NULL COMMENT '进入目标层级',
  created_at                   DATETIME NULL COMMENT '创建时间'
) COMMENT='视觉接纳判定记录表';
```

---

## 3.5 `visual_supervision_records`（视觉监督记录表）

```sql
CREATE TABLE visual_supervision_records (
  visual_supervision_record_id      VARCHAR(64) PRIMARY KEY COMMENT '视觉监督记录ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_admission_record_id        VARCHAR(64) NOT NULL COMMENT '视觉接纳判定记录ID',
  adopted_by_evidence               TINYINT(1) NULL COMMENT '后续是否被正式证据采纳',
  corrected_by_question             TINYINT(1) NULL COMMENT '后续是否被追问修正',
  denied_by_runtime                 TINYINT(1) NULL COMMENT '后续是否被运行时否定',
  denied_by_outcome_competition     TINYINT(1) NULL COMMENT '后续是否被结论竞争否定',
  question_correction_scope         VARCHAR(64) NULL COMMENT '问题回流纠正作用域',
  final_outcome_type                VARCHAR(64) NULL COMMENT '最终结论类型',
  final_stop_reason                 VARCHAR(128) NULL COMMENT '最终停止原因',
  updated_at                        DATETIME NULL COMMENT '更新时间'
) COMMENT='视觉监督记录表';
```

---

# 四、关键执行说明

## 4.1 `hold_for_review`
第一版已删除，不进入正式枚举。

## 4.2 `route_primary_action`
第一版正式枚举：

- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

## 4.3 正式证据先落位
只要条目已被：

- `formally_admitted`

就应先进入：

- `observed_evidence_set`

route hint 只改变后续流程优先级，不改变事实层先落位。

---

# 五、一句话总裁决

**这份 v1.1 已经足以作为 Codex 直接写 dev SQL 的第一版结构基线。**
