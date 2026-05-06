# 第二批 dev 核心建表与兼容迁移说明 v1

## 1. 这一步做什么

第二批不碰前端壳，也不直接改 `identify-http / diagnose-http` 业务逻辑。

当前先把 `cloud1_dev` 补成能承接新框架主链的最小 dev 底座：

1. 新建第一版核心新表。
2. 对已存在的旧 `diagnosis_sessions` 做兼容扩展，而不是删除重建。
3. 收紧数据系统默认导入范围，避免延后对象继续被默认写入。

---

## 2. 第二批正式落地范围

### 2.1 本批新建的核心表

- `plant_identity_entities`
- `plant_identity_aliases`
- `genus_care_profiles`
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`

### 2.2 本批兼容扩展的表

- `diagnosis_sessions`

### 2.3 本批明确不动的对象

- prod schema
- 旧业务表删除 / 重命名
- `plant_problem_profiles`
- `plant_identity_match_rules`
- `plant_identity_merge_history`
- `visual_call_aggregate_results`
- `visual_supervision_records`

---

## 3. 为什么 `diagnosis_sessions` 不直接重建

我核对了 `cloud1_dev.diagnosis_sessions`，当前情况是：

- 旧表已存在
- 旧主键仍是 `diagnosis_id`
- 表内已有 46 条 dev 历史记录

在这个前提下，直接 `DROP + CREATE` 会把 dev 追溯链打断，也会把“旧链还能对照”的价值清空。

因此第二批采取兼容迁移策略：

1. 保留旧表名 `diagnosis_sessions`
2. 保留旧主键 `diagnosis_id`
3. 新增 `session_id` 作为新链正式会话键
4. 把新框架所需的 route / round / outcome / snapshot 字段补进去
5. 用 `diagnosis_id -> session_id` 回填旧数据，确保新旧记录都能被会话语义统一引用

这不是最终清库方案，而是第一版重构期的最小安全过渡。

---

## 4. 数据系统默认范围调整

第二批代码里还同步收紧了默认导入范围：

- `plant_problem_profiles` 改为 `enabledByDefault: false`
- `plant_identity_match_rules` 改为 `enabledByDefault: false`

含义是：

- 不显式点名时，默认导入不会再把这两类“延后对象”带进去
- 如果后续确实要单独试验，仍可通过显式 `--tables=` 指定

这样可以避免默认执行路径继续偏离已经冻结的第一版口径。

---

## 5. 本批脚本文件

本批建表 / 迁移脚本落在：

- [第二批_dev核心建表脚本_v1.sql](/Users/jay/WebstormProjects/planting/docs/mvp-simplify/codex/第二批_dev核心建表脚本_v1.sql)

执行原则：

1. 先 `CREATE TABLE IF NOT EXISTS` 新表
2. 再扩展 `diagnosis_sessions`
3. 不删旧表
4. 不碰 prod

---

## 6. 下一步接什么

如果这批 schema 落成功，下一步顺序就是：

1. taxonomy / genus care 静态数据导入 dev
2. 新身份查询与植物添加链改造
3. `identify-http` 接新视觉批次与身份解析链
4. `diagnose-http` 切到轻量 `diagnosis_sessions` + outcome 三类结构
