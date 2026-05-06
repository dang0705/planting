# DATABASE_SCHEMA_SPEC_v2.md

## 1. 文档目的

本文档定义植物诊断系统的数据表结构规范。  
本版规范以 `plants_v13_user_friendly_full_v7.xlsx` 为唯一字段真源，要求：

- **Excel 字段名 = 数据库字段名 = 代码读取字段名**
- 不允许在 spec 中重命名现有字段
- 所有新增字段必须是发布系统元数据字段，且不得破坏当前诊断流
- 与当前数据库结构保持一致：

```text
MySQL
 ├── cloud1-2grufevs395a9d5e   (prod)
 └── cloud1_dev                (dev)
```

---

## 2. 环境与 schema 规则

当前系统使用 **双 schema**，不是 `_dev/_prod` 表后缀模式。

### 2.1 schema 约定

- `cloud1_dev`：导入、diff、review、publish staging
- `cloud1-2grufevs395a9d5e`：生产知识库

### 2.2 表命名规则

两个 schema 内的表名完全一致，例如：

- `cloud1_dev.problems`
- `cloud1-2grufevs395a9d5e.problems`

### 2.3 运行时规则

- 诊断系统读取的 schema 由后端统一选择
- **生产环境必须强制读取 prod schema**
- 开发环境允许根据环境变量切换 dev / prod schema
- repository 层必须通过统一 schema 前缀函数拼接 SQL，禁止直接写裸表名

---

## 3. 总体字段规则

### 3.1 字段真源

以下字段名必须严格按 Excel 保持一致，不得改名：

- `problem_name`，不能改成 `problem_name_en`
- `problem_cn`，不能改成 `problem_name_cn`
- `genus_compatibility`，不能改成 `compatibility`
- `host_compatibility`，不能改成 `host_weight`
- `plant_id`，不能改成 `plant_key`
- `final_prior_score`，不能改成 `weight`
- `relation_strength`，不能改成 `weight`

### 3.2 主键设计

所有知识库表统一采用：

- `id BIGINT AUTO_INCREMENT PRIMARY KEY` 作为数据库内部主键
- 保留 Excel/业务 key 作为唯一业务标识
- 如果 Excel 已存在 `id` 列，则保留 `id` 字段名，但数据库中应允许迁移为数值自增或引入内部 surrogate id；**第一版优先保持当前代码可运行，不强制重构**

### 3.3 发布系统新增元数据字段

知识库表允许新增以下字段，用于发布系统；新增时必须保证旧代码不受影响：

- `source_type`
- `source_batch_id`
- `version_tag`
- `row_hash`
- `review_status`
- `review_note`
- `is_active`
- `published_at`
- `published_batch_id`

注意：

- 这些字段是**新增字段**
- 不得替换 Excel 原字段
- 第一版允许先只在 `cloud1_dev` 加这些字段，再逐步同步到 prod

---

## 4. 当前诊断流必须覆盖的表

以下表是当前诊断流实际依赖的最小集合：

1. `problems`
2. `symptoms`
3. `symptom_problem_evidence`
4. `genus_problem_profiles`
5. `problem_host_profiles`
6. `plant_problem_profiles`
7. `problem_causality`
8. `question_library_v5_real`
9. `question_option_mapping_v5_real`
10. `question_strategy_v5_real`
11. `question_generation_engine`
12. `diagnosis_result_explanations`

---

## 5. 表结构规范

下面的字段列表以 Excel 为准。  
DDL 不要求此刻 100% 一次性落库，但字段命名必须完全对齐。

---

## 5.1 problems

### Excel 字段真源

- `problem_key`
- `problem_name`
- `problem_cn`
- `problem_type`
- `problem_role`
- `definition`
- `definition_audited`
- `default_action`
- `default_action_audited`
- `default_prevention`
- `default_prevention_audited`
- `data_status`
- `data_source`
- `audit_note`
- `display_name_cn`
- `user_definition_cn`
- `user_action_cn`
- `user_prevention_cn`
- `severity_hint_cn`
- `urgency_hint_cn`
- `first_check_cn`
- `avoid_cn`

### 业务唯一键

- `problem_key`

### 推荐索引

- `UNIQUE(problem_key)`
- `INDEX(problem_type)`
- `INDEX(problem_role)`
- `INDEX(data_status)`

### 说明

- `problem_name` 和 `problem_cn` 必须保留现名
- 用户展示层直接依赖：
  - `display_name_cn`
  - `user_definition_cn`
  - `user_action_cn`
  - `user_prevention_cn`
  - `severity_hint_cn`
  - `urgency_hint_cn`
  - `first_check_cn`
  - `avoid_cn`

---

## 5.2 symptoms

### Excel 字段真源

- `symptom_key`
- `symptom_cn`
- `location_key`
- `pattern_key`
- `distribution_key`
- `severity_hint`
- `symptom_type`
- `signal_reliability`
- `ai_visual_pool`
- `data_status`
- `data_source`
- `note`
- `display_text_cn`
- `user_observation_tip_cn`
- `confusion_note_cn`

### 业务唯一键

- `symptom_key`

### 推荐索引

- `UNIQUE(symptom_key)`
- `INDEX(location_key)`
- `INDEX(pattern_key)`
- `INDEX(distribution_key)`
- `INDEX(symptom_type)`
- `INDEX(data_status)`

### 说明

- 当前没有 `symptom_en` 字段，spec 不得凭空新增为核心字段
- 用户展示层依赖：
  - `display_text_cn`
  - `user_observation_tip_cn`
  - `confusion_note_cn`

---

## 5.3 symptom_problem_evidence

### Excel 字段真源

- `id`
- `symptom_key`
- `problem_key`
- `location_key`
- `pattern_key`
- `distribution_key`
- `evidence_type`
- `association_strength`
- `edge_reliability`
- `data_status`
- `data_source`
- `note`

### 业务唯一键（推荐）

```text
(symptom_key, problem_key, evidence_type)
```

### 推荐索引

- `INDEX(symptom_key)`
- `INDEX(problem_key)`
- `INDEX(symptom_key, problem_key)`
- `INDEX(data_status)`

### 说明

- 当前诊断评分核心依赖：
  - `association_strength`
  - `edge_reliability`

---

## 5.4 genus_problem_profiles

### Excel 字段真源

- `id`
- `genus`
- `problem_key`
- `genus_compatibility`
- `compatibility_level`
- `data_status`
- `data_source`
- `audit_note`

### 业务唯一键（推荐）

```text
(genus, problem_key)
```

### 推荐索引

- `INDEX(genus)`
- `INDEX(problem_key)`
- `INDEX(genus, problem_key)`
- `INDEX(data_status)`

### 说明

- 字段名必须使用 `genus_compatibility`
- 不得改成 `compatibility`

---

## 5.5 problem_host_profiles

### Excel 字段真源

- `id`
- `problem_key`
- `host_level`
- `host_name`
- `host_compatibility`
- `compatibility_level`
- `data_status`
- `data_source`
- `evidence_basis`

### 业务唯一键（推荐）

```text
(problem_key, host_level, host_name)
```

### 推荐索引

- `INDEX(problem_key)`
- `INDEX(host_level)`
- `INDEX(host_name)`
- `INDEX(data_status)`

### 说明

- 字段名必须使用 `host_compatibility`
- 不得改成 `host_weight`

---

## 5.6 plant_problem_profiles

### Excel 字段真源

- `id`
- `plant_id`
- `genus`
- `family`
- `category`
- `problem_key`
- `genus_compatibility`
- `host_compatibility`
- `final_prior_score`
- `matched_host_level`
- `source_layer`
- `data_status`

### 业务唯一键（推荐）

```text
(plant_id, problem_key)
```

### 推荐索引

- `INDEX(plant_id)`
- `INDEX(problem_key)`
- `INDEX(genus)`
- `INDEX(family)`
- `INDEX(category)`
- `INDEX(data_status)`

### 说明

- 字段名必须使用：
  - `plant_id`
  - `final_prior_score`
- 不得改成：
  - `plant_key`
  - `weight`

---

## 5.7 problem_causality

### Excel 字段真源

- `id`
- `cause_problem_key`
- `effect_problem_key`
- `relation_type`
- `relation_strength`
- `data_status`
- `data_source`
- `note`
- `created_at`
- `updated_at`

### 业务唯一键（推荐）

```text
(cause_problem_key, effect_problem_key, relation_type)
```

### 推荐索引

- `INDEX(cause_problem_key)`
- `INDEX(effect_problem_key)`
- `INDEX(relation_type)`
- `INDEX(data_status)`

### 说明

- 字段名必须使用 `relation_strength`
- 不得改成 `weight`

---

## 5.8 question_library_v5_real

### Excel 字段真源

- `question_key`
- `question_text_cn`
- `question_type`
- `target_symptom_key`
- `question_group_key`
- `question_level`
- `observability`
- `allow_unknown`
- `priority`
- `data_status`
- `data_source`
- `note`
- `question_text_user_cn`
- `help_text_cn`
- `why_this_question_cn`

### 业务唯一键

- `question_key`

### 推荐索引

- `UNIQUE(question_key)`
- `INDEX(question_group_key)`
- `INDEX(target_symptom_key)`
- `INDEX(priority)`
- `INDEX(data_status)`

---

## 5.9 question_option_mapping_v5_real

### Excel 字段真源

- `question_key`
- `option_key`
- `option_text_cn`
- `maps_to_symptom_key`
- `value`
- `association_strength`
- `data_status`
- `data_source`
- `note`
- `option_text_user_cn`
- `answer_effect_cn`

### 业务唯一键（推荐）

```text
(question_key, option_key)
```

### 推荐索引

- `INDEX(question_key)`
- `INDEX(option_key)`
- `INDEX(maps_to_symptom_key)`
- `INDEX(data_status)`

---

## 5.10 question_strategy_v5_real

### Excel 字段真源

- `problem_key`
- `question_group_key`
- `question_key`
- `priority_score`
- `trigger_type`
- `data_status`
- `data_source`
- `note`
- `strategy_note_cn`

### 业务唯一键（推荐）

```text
(problem_key, question_group_key, question_key)
```

### 推荐索引

- `INDEX(problem_key)`
- `INDEX(question_group_key)`
- `INDEX(question_key)`
- `INDEX(priority_score)`
- `INDEX(data_status)`

---

## 5.11 question_generation_engine

### Excel 字段真源

- `engine_rule_key`
- `applies_to_group`
- `input_signal`
- `template_cn`
- `observability_default`
- `allow_unknown_default`
- `output_field`
- `note`
- `template_user_cn`
- `engine_usage_cn`

### 业务唯一键

- `engine_rule_key`

### 推荐索引

- `UNIQUE(engine_rule_key)`
- `INDEX(applies_to_group)`
- `INDEX(output_field)`

---

## 5.12 diagnosis_result_explanations

### Excel 字段真源

- `problem_key`
- `display_name_cn`
- `result_summary_cn`
- `why_it_happens_cn`
- `what_to_check_next_cn`
- `first_aid_cn`
- `avoid_cn`
- `reassurance_cn`

### 业务唯一键

- `problem_key`

### 推荐索引

- `UNIQUE(problem_key)`

### 说明

- 该表当前诊断解释层直接依赖，不能漏掉

---

## 6. 数据发布控制表（仅 cloud1_dev）

以下控制表仅存在于 `cloud1_dev`：

1. `import_jobs`
2. `publish_batches`
3. `publish_diffs`
4. `review_logs`（建议补上）

---

## 6.1 import_jobs

建议字段：

- `id`
- `batch_id`
- `source_type`
- `file_name`
- `status`
- `sheet_summary_json`
- `error_summary_json`
- `created_at`
- `finished_at`

---

## 6.2 publish_batches

建议字段：

- `id`
- `batch_id`
- `version_tag`
- `source_batch_id`
- `status`
- `summary_json`
- `created_at`
- `created_by`
- `approved_at`
- `published_at`
- `rollback_of_batch_id`

---

## 6.3 publish_diffs

建议字段：

- `id`
- `batch_id`
- `table_name`
- `record_key`
- `change_type`
- `old_row_json`
- `new_row_json`
- `old_hash`
- `new_hash`
- `status`
- `created_at`
- `reviewed_at`
- `reviewed_by`

---

## 6.4 review_logs

建议字段：

- `id`
- `batch_id`
- `table_name`
- `record_key`
- `action`
- `comment`
- `reviewed_by`
- `created_at`

---

## 7. repository 层适配要求

当前仓储代码仍按现有字段读取，因此本 spec 的落地要求是：

1. **数据库字段必须与 Excel 完全一致**
2. repository 层如需重构，只能在 SQL/schemaPrefix 层新增能力
3. 禁止为追求“命名更优雅”而改坏当前代码字段

---

## 8. schema 路由要求

由于当前项目只有一个后端环境、两个数据库，必须新增统一 schema 选择层。

### 8.1 必须新增

- `schema resolver`
- `qualified table builder`

### 8.2 repository SQL 规则

禁止：

```sql
SELECT * FROM problems
```

允许：

```sql
SELECT * FROM ${schema}.problems
```

### 8.3 生产环境限制

- 生产后端必须强制读取 `cloud1-2grufevs395a9d5e`
- 不允许生产请求通过前端透传 env 读到 dev schema

---

## 9. Codex 执行目标

Codex 必须按本 v2 文档执行：

1. 先校正数据库字段名与 Excel 完全一致
2. 补齐问诊与解释表，不得只实现 7 张核心表
3. 为 repository 层引入 schema 前缀能力
4. 不得直接按旧 spec 重命名字段
5. DDL / migration / schema checker 必须以 Excel 为真源

---

## 10. 最终原则

一句话：

```text
plants_v13_user_friendly_full_v7.xlsx 是数据库字段真源；
spec 只能描述它，不能改写它。
```
