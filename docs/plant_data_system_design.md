# 植物诊断专用数据系统设计文档

## 1. 文档目标

本文档定义一套适用于植物识别 / 诊断项目的数据发布机制，目标是把当前的 Excel 驱动维护方式升级为稳定、可追溯、可审核、可回滚的数据系统。

目标流程：

```text
Excel / AI补数 → dev(staging) → diff → review → publish → prod
```

本文档面向工程落地，默认由 Codex/开发者据此实现：

- 数据库结构
- 导入脚本
- diff 引擎
- publish 引擎
- 回滚机制

---

## 2. 设计原则

### 2.1 总原则

1. 任何 Excel 导入都**不能直接写入 prod**
2. 任何 AI 生成内容都**默认进入 dev，且状态为待审核**
3. 任何发布都必须有 `batch_id` 和 `version_tag`
4. 任何删除默认不做物理删除，而是做软失效
5. 所有表都同时保留：
   - 数据库内部自增 `id`
   - 业务稳定键 `xxx_key`

---

## 3. 数据分层

建议使用同库不同表后缀的方式维护环境：

```text
*_dev   -> staging / 待发布环境
*_prod  -> 正式线上环境
```

例如：

```text
problems_dev
problems_prod

symptoms_dev
symptoms_prod

symptom_problem_evidence_dev
symptom_problem_evidence_prod
```

除此之外，增加元数据控制表：

```text
import_jobs
publish_batches
publish_diffs
review_logs
```

---

## 4. 数据分类与纳入范围

### 4.1 纳入发布系统的知识库表

以下表进入 Excel → dev → diff → publish → prod 流程：

- `problems`
- `symptoms`
- `symptom_problem_evidence`
- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`
- `problem_causality`

如果后续 Excel 中重新引入 `plant_catalog`，则也纳入同样机制。

### 4.2 不纳入发布系统的运行时表

以下表属于业务运行时表，不允许通过 Excel 批量发布覆盖：

- `users`
- `sys_user`
- `diagnosis_sessions`
- `diagnosis_follow_ups`
- `diagnosis_problem_rankings`
- `identify_sessions`
- 以及所有 `user_*`、缓存表、日志表

---

## 5. 主键设计（id + key）

### 5.1 统一规则

所有知识库表统一采用双标识结构：

- `id`: 数据库内部自增主键
- `xxx_key`: 业务稳定键，供 Excel、AI、代码、关系表使用

### 5.2 原则

- `id` 只用于数据库内部、ORM、索引优化
- `xxx_key` 才是业务世界里的真实主键
- 关系表优先使用 `xxx_key` 关联，不强制改成 `id`

### 5.3 示例

#### problems_dev / problems_prod

```sql
id BIGINT AUTO_INCREMENT PRIMARY KEY
problem_key VARCHAR(64) NOT NULL UNIQUE
problem_name_en VARCHAR(255) NULL
problem_name_cn VARCHAR(255) NULL
problem_type VARCHAR(64) NULL
problem_role VARCHAR(64) NULL
definition TEXT NULL
severity_hint_cn TEXT NULL
urgency_hint_cn TEXT NULL
data_status VARCHAR(32) NULL
data_source VARCHAR(64) NULL
source_type VARCHAR(20) NOT NULL DEFAULT 'excel'
source_batch_id VARCHAR(64) NOT NULL
version_tag VARCHAR(32) NOT NULL
row_hash CHAR(64) NOT NULL
review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
review_note TEXT NULL
is_active TINYINT(1) NOT NULL DEFAULT 1
ai_generated TINYINT(1) NOT NULL DEFAULT 0
ai_confidence DECIMAL(5,4) NULL
audited TINYINT(1) NOT NULL DEFAULT 0
audit_source VARCHAR(50) NULL
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
published_at DATETIME NULL
published_batch_id VARCHAR(64) NULL
```

#### symptoms_dev / symptoms_prod

```sql
id BIGINT AUTO_INCREMENT PRIMARY KEY
symptom_key VARCHAR(64) NOT NULL UNIQUE
symptom_cn VARCHAR(255) NULL
symptom_en VARCHAR(255) NULL
location_key VARCHAR(64) NULL
pattern_key VARCHAR(64) NULL
distribution_key VARCHAR(64) NULL
symptom_type VARCHAR(64) NULL
signal_reliability DECIMAL(5,4) NULL
ai_visual_pool JSON NULL
data_status VARCHAR(32) NULL
source_type VARCHAR(20) NOT NULL DEFAULT 'excel'
source_batch_id VARCHAR(64) NOT NULL
version_tag VARCHAR(32) NOT NULL
row_hash CHAR(64) NOT NULL
review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
review_note TEXT NULL
is_active TINYINT(1) NOT NULL DEFAULT 1
ai_generated TINYINT(1) NOT NULL DEFAULT 0
ai_confidence DECIMAL(5,4) NULL
audited TINYINT(1) NOT NULL DEFAULT 0
audit_source VARCHAR(50) NULL
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
published_at DATETIME NULL
published_batch_id VARCHAR(64) NULL
```

---

## 6. 关系表设计

关系表的核心原则：

1. 必须有数据库自增 `id`
2. 必须有稳定唯一组合键
3. diff 逻辑以业务组合键为准
4. 关系表删除默认软失效，不做物理删

### 6.1 symptom_problem_evidence

用途：症状与问题之间的证据映射

推荐唯一键：

```text
(symptom_key, problem_key, location_key, pattern_key, distribution_key)
```

推荐字段：

```sql
id BIGINT AUTO_INCREMENT PRIMARY KEY
symptom_key VARCHAR(64) NOT NULL
problem_key VARCHAR(64) NOT NULL
location_key VARCHAR(64) NULL
pattern_key VARCHAR(64) NULL
distribution_key VARCHAR(64) NULL
evidence_type VARCHAR(64) NULL
association_strength DECIMAL(6,4) NULL
edge_reliability DECIMAL(6,4) NULL
conditions_json JSON NULL
data_status VARCHAR(32) NULL

source_type VARCHAR(20) NOT NULL DEFAULT 'excel'
source_batch_id VARCHAR(64) NOT NULL
version_tag VARCHAR(32) NOT NULL
row_hash CHAR(64) NOT NULL
review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
review_note TEXT NULL
is_active TINYINT(1) NOT NULL DEFAULT 1
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
published_at DATETIME NULL
published_batch_id VARCHAR(64) NULL
```

### 6.2 genus_problem_profiles

用途：属级别常见问题画像

唯一键：

```text
(genus, problem_key)
```

推荐字段：

```sql
id BIGINT AUTO_INCREMENT PRIMARY KEY
genus VARCHAR(128) NOT NULL
problem_key VARCHAR(64) NOT NULL
compatibility DECIMAL(6,4) NULL
reason TEXT NULL
severity_bias DECIMAL(6,4) NULL
detectability_bias DECIMAL(6,4) NULL

source_type VARCHAR(20) NOT NULL DEFAULT 'excel'
source_batch_id VARCHAR(64) NOT NULL
version_tag VARCHAR(32) NOT NULL
row_hash CHAR(64) NOT NULL
review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
review_note TEXT NULL
is_active TINYINT(1) NOT NULL DEFAULT 1
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
published_at DATETIME NULL
published_batch_id VARCHAR(64) NULL
```

### 6.3 problem_host_profiles

用途：问题与宿主范围映射

唯一键：

```text
(problem_key, host_level, host_name)
```

推荐字段：

```sql
id BIGINT AUTO_INCREMENT PRIMARY KEY
problem_key VARCHAR(64) NOT NULL
host_level VARCHAR(32) NOT NULL
host_name VARCHAR(128) NOT NULL
host_weight DECIMAL(6,4) NULL
solutions_json JSON NULL
preventions_json JSON NULL

source_type VARCHAR(20) NOT NULL DEFAULT 'excel'
source_batch_id VARCHAR(64) NOT NULL
version_tag VARCHAR(32) NOT NULL
row_hash CHAR(64) NOT NULL
review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
review_note TEXT NULL
is_active TINYINT(1) NOT NULL DEFAULT 1
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
published_at DATETIME NULL
published_batch_id VARCHAR(64) NULL
```

### 6.4 plant_problem_profiles

用途：植物级问题映射

唯一键：

```text
(plant_key, problem_key)
```

推荐字段：

```sql
id BIGINT AUTO_INCREMENT PRIMARY KEY
plant_key VARCHAR(64) NOT NULL
problem_key VARCHAR(64) NOT NULL
weight DECIMAL(6,4) NULL
notes TEXT NULL

source_type VARCHAR(20) NOT NULL DEFAULT 'excel'
source_batch_id VARCHAR(64) NOT NULL
version_tag VARCHAR(32) NOT NULL
row_hash CHAR(64) NOT NULL
review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
review_note TEXT NULL
is_active TINYINT(1) NOT NULL DEFAULT 1
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
published_at DATETIME NULL
published_batch_id VARCHAR(64) NULL
```

### 6.5 problem_causality

用途：问题与问题之间的因果关系

唯一键：

```text
(cause_problem_key, effect_problem_key)
```

推荐字段：

```sql
id BIGINT AUTO_INCREMENT PRIMARY KEY
cause_problem_key VARCHAR(64) NOT NULL
effect_problem_key VARCHAR(64) NOT NULL
causality_type VARCHAR(64) NULL
weight DECIMAL(6,4) NULL
notes TEXT NULL

source_type VARCHAR(20) NOT NULL DEFAULT 'excel'
source_batch_id VARCHAR(64) NOT NULL
version_tag VARCHAR(32) NOT NULL
row_hash CHAR(64) NOT NULL
review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
review_note TEXT NULL
is_active TINYINT(1) NOT NULL DEFAULT 1
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
published_at DATETIME NULL
published_batch_id VARCHAR(64) NULL
```

---

## 7. 索引策略

### 7.1 索引总体原则

1. 每张表必须有：
   - `PRIMARY KEY (id)`
   - `UNIQUE KEY`（业务键或业务组合键）
2. 所有高频查询字段必须有普通索引
3. diff / publish 依赖字段必须建索引：
   - `row_hash`
   - `source_batch_id`
   - `version_tag`
   - `review_status`
   - `is_active`

### 7.2 各表建议索引

#### problems

```sql
PRIMARY KEY (id)
UNIQUE KEY uk_problem_key (problem_key)
KEY idx_problem_type (problem_type)
KEY idx_review_status (review_status)
KEY idx_is_active (is_active)
KEY idx_row_hash (row_hash)
KEY idx_source_batch_id (source_batch_id)
KEY idx_version_tag (version_tag)
```

#### symptoms

```sql
PRIMARY KEY (id)
UNIQUE KEY uk_symptom_key (symptom_key)
KEY idx_location_key (location_key)
KEY idx_pattern_key (pattern_key)
KEY idx_distribution_key (distribution_key)
KEY idx_review_status (review_status)
KEY idx_is_active (is_active)
KEY idx_row_hash (row_hash)
KEY idx_source_batch_id (source_batch_id)
KEY idx_version_tag (version_tag)
```

#### symptom_problem_evidence

```sql
PRIMARY KEY (id)
UNIQUE KEY uk_spe_business (
  symptom_key,
  problem_key,
  location_key,
  pattern_key,
  distribution_key
)
KEY idx_symptom_key (symptom_key)
KEY idx_problem_key (problem_key)
KEY idx_symptom_problem (symptom_key, problem_key)
KEY idx_review_status (review_status)
KEY idx_is_active (is_active)
KEY idx_row_hash (row_hash)
KEY idx_source_batch_id (source_batch_id)
KEY idx_version_tag (version_tag)
```

#### genus_problem_profiles

```sql
PRIMARY KEY (id)
UNIQUE KEY uk_genus_problem (genus, problem_key)
KEY idx_genus (genus)
KEY idx_problem_key (problem_key)
KEY idx_review_status (review_status)
KEY idx_is_active (is_active)
KEY idx_row_hash (row_hash)
KEY idx_source_batch_id (source_batch_id)
KEY idx_version_tag (version_tag)
```

#### problem_host_profiles

```sql
PRIMARY KEY (id)
UNIQUE KEY uk_problem_host (problem_key, host_level, host_name)
KEY idx_problem_key (problem_key)
KEY idx_host_level (host_level)
KEY idx_host_name (host_name)
KEY idx_review_status (review_status)
KEY idx_is_active (is_active)
KEY idx_row_hash (row_hash)
KEY idx_source_batch_id (source_batch_id)
KEY idx_version_tag (version_tag)
```

#### plant_problem_profiles

```sql
PRIMARY KEY (id)
UNIQUE KEY uk_plant_problem (plant_key, problem_key)
KEY idx_plant_key (plant_key)
KEY idx_problem_key (problem_key)
KEY idx_review_status (review_status)
KEY idx_is_active (is_active)
KEY idx_row_hash (row_hash)
KEY idx_source_batch_id (source_batch_id)
KEY idx_version_tag (version_tag)
```

#### problem_causality

```sql
PRIMARY KEY (id)
UNIQUE KEY uk_problem_causality (cause_problem_key, effect_problem_key)
KEY idx_cause_problem_key (cause_problem_key)
KEY idx_effect_problem_key (effect_problem_key)
KEY idx_review_status (review_status)
KEY idx_is_active (is_active)
KEY idx_row_hash (row_hash)
KEY idx_source_batch_id (source_batch_id)
KEY idx_version_tag (version_tag)
```

---

## 8. diff / publish 兼容结构

### 8.1 核心思想

不是整表覆盖，而是：

- dev 接收导入
- dev 和 prod 做 diff
- 只发布变化项
- 删除走软失效
- 发布必须有批次号和版本号

### 8.2 必备控制字段

所有知识库表都必须带上：

```text
source_type
source_batch_id
version_tag
row_hash
review_status
review_note
is_active
created_at
updated_at
published_at
published_batch_id
```

### 8.3 row_hash 规则

每张表都必须定义“参与哈希的业务字段集合”。

#### problems.row_hash 参与字段

- `problem_key`
- `problem_name_en`
- `problem_name_cn`
- `problem_type`
- `problem_role`
- `definition`
- `severity_hint_cn`
- `urgency_hint_cn`
- `data_status`

#### symptoms.row_hash 参与字段

- `symptom_key`
- `symptom_cn`
- `symptom_en`
- `location_key`
- `pattern_key`
- `distribution_key`
- `symptom_type`
- `signal_reliability`
- `data_status`

#### symptom_problem_evidence.row_hash 参与字段

- `symptom_key`
- `problem_key`
- `location_key`
- `pattern_key`
- `distribution_key`
- `evidence_type`
- `association_strength`
- `edge_reliability`
- `conditions_json`
- `data_status`

### 8.4 diff 类型

每条差异记录只可能属于 3 类之一：

- `added`
- `updated`
- `removed`

#### added
dev 有，prod 没有

#### updated
dev 和 prod 业务键相同，但 `row_hash` 不同

#### removed
prod 有，dev 没有

注意：`removed` 默认不 delete，只做 `is_active = 0`

---

## 9. 元数据控制表设计

### 9.1 import_jobs

记录一次导入任务

```sql
CREATE TABLE import_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL UNIQUE,
  source_type VARCHAR(20) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  sheet_summary_json JSON NULL,
  error_summary_json JSON NULL,
  created_at DATETIME NOT NULL,
  finished_at DATETIME NULL
);
```

### 9.2 publish_batches

记录一次发布批次

```sql
CREATE TABLE publish_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL UNIQUE,
  version_tag VARCHAR(32) NOT NULL,
  source_batch_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  summary_json JSON NULL,
  created_at DATETIME NOT NULL,
  created_by VARCHAR(64) NULL,
  approved_at DATETIME NULL,
  published_at DATETIME NULL,
  rollback_of_batch_id VARCHAR(64) NULL
);
```

### 9.3 publish_diffs

记录每条 diff

```sql
CREATE TABLE publish_diffs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  record_key VARCHAR(255) NOT NULL,
  change_type VARCHAR(20) NOT NULL,
  old_row_json JSON NULL,
  new_row_json JSON NULL,
  old_hash CHAR(64) NULL,
  new_hash CHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  reviewed_at DATETIME NULL,
  reviewed_by VARCHAR(64) NULL,
  KEY idx_batch_id (batch_id),
  KEY idx_table_name (table_name),
  KEY idx_record_key (record_key),
  KEY idx_status (status)
);
```

### 9.4 review_logs

记录审核动作

```sql
CREATE TABLE review_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  record_key VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  comment TEXT NULL,
  reviewed_by VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_batch_id (batch_id),
  KEY idx_table_name (table_name),
  KEY idx_record_key (record_key)
);
```

---

## 10. 导入流程

### 10.1 流程总览

```text
上传 Excel
  ↓
创建 import_job / batch_id
  ↓
解析 workbook & sheet
  ↓
字段映射
  ↓
标准化
  ↓
生成 row_hash
  ↓
写入 raw/import log（可选）
  ↓
upsert 到 *_dev
```

### 10.2 字段标准化要求

导入时统一处理：

- trim 两端空格
- 空字符串转 `NULL`
- 枚举转统一格式（全部小写 snake_case）
- 数字字段转 number
- JSON 字段转标准 JSON
- 业务 key 统一 lower_snake_case

---

## 11. diff 引擎

### 11.1 逻辑

每张表按“业务唯一键”对比 dev / prod。

#### added
`dev.key exists` and `prod.key not exists`

#### updated
`dev.key == prod.key` and `dev.row_hash != prod.row_hash`

#### removed
`prod.key exists` and `dev.key not exists`

### 11.2 输出

diff 引擎输出到 `publish_diffs`，每条记录包含：

- 表名
- 业务键
- 变更类型
- old_row_json
- new_row_json
- old_hash
- new_hash

---

## 12. publish 引擎

### 12.1 原则

- 只允许从 dev 发布到 prod
- 只发布 `approved` 的 diff
- 不允许 dev 直接替换 prod 全表
- removed 默认软失效

### 12.2 处理规则

#### added
插入 prod

#### updated
按业务唯一键执行 upsert / update

#### removed
更新 prod：

```sql
is_active = 0
published_at = now()
published_batch_id = 当前 batch
```

---

## 13. AI 数据接入规则

AI 不允许直接写 prod。

AI 只能写入 dev，并且默认：

```text
source_type = ai
ai_generated = 1
review_status = pending
audited = 0
```

只有审核通过后才能参与 publish。

---

## 14. 回滚机制

### 14.1 回滚对象

以 `publish_batch` 为粒度回滚。

### 14.2 回滚方式

根据 `publish_diffs.old_row_json`：

- `added` 的回滚：对 prod 做 `is_active = 0` 或删除（默认建议失效）
- `updated` 的回滚：恢复 old_row_json 内容
- `removed` 的回滚：恢复 `is_active = 1`

---

## 15. Node / TypeScript 模块划分

建议目录结构：

```text
src/
  data-system/
    config/
      table-rules.ts
      field-mapping.ts
    parsers/
      excel-parser.ts
    normalizers/
      problems.normalizer.ts
      symptoms.normalizer.ts
      symptom-problem-evidence.normalizer.ts
      genus-problem-profiles.normalizer.ts
      problem-host-profiles.normalizer.ts
      plant-problem-profiles.normalizer.ts
      problem-causality.normalizer.ts
    staging/
      write-dev.ts
    diff/
      diff-engine.ts
    publish/
      publish-batch.ts
      rollback-batch.ts
    db/
      mysql.ts
      tables.ts
    types/
      problems.ts
      symptoms.ts
      relations.ts
```

---

## 16. 实施顺序

### 第一阶段
先落地最小闭环：

1. 建 dev / prod 知识库表
2. 建 `import_jobs`
3. 建 `publish_batches`
4. 建 `publish_diffs`
5. 实现 Excel → dev importer
6. 实现 dev vs prod diff
7. 实现手动审核后 publish

### 第二阶段
补充：

1. review_logs
2. rollback
3. AI dev 写入
4. diff 报告增强
5. 字段级风险标记

---

## 17. 最终工程纪律

1. 任何 Excel 导入必须先进 dev
2. 任何 AI 补数必须默认 pending
3. 任何 removed 默认不物理删除
4. 任何 publish 必须记录 batch_id / version_tag
5. prod 表不作为人工编辑主阵地
6. 业务代码只读 prod；导入系统只写 dev；publish 引擎负责 prod 更新

---

## 18. 给 Codex 的执行目标

Codex 按本文档应完成以下交付：

1. 为纳入发布系统的知识库表生成 DDL（dev/prod）
2. 生成控制表 DDL（import_jobs / publish_batches / publish_diffs / review_logs）
3. 实现 Excel 解析与标准化模块
4. 实现 row_hash 生成逻辑
5. 实现 dev upsert 写入逻辑
6. 实现 diff engine
7. 实现 publish engine
8. 实现 rollback engine（至少支持 batch 级）
9. 输出 CLI 或脚本入口，支持：
   - import
   - diff
   - review
   - publish
   - rollback

---

## 19. 明确不做的事情（第一版）

第一版暂不实现：

- 复杂后台 UI
- 多人权限系统
- 实时在线表格编辑器
- 所有关系表都强制切换到数值外键
- 运行时表纳入 Excel 发布体系

---

## 20. 结语

本系统的核心不是“更方便导 Excel”，而是建立一个：

- 可导入
- 可对比
- 可审核
- 可发布
- 可追溯
- 可回滚

的植物诊断知识库数据系统。

所有实现都必须围绕以下主线：

```text
Excel / AI补数 → dev(staging) → diff → review → publish → prod
```
