# 第二批代码落地 dev 核心 schema 与兼容迁移 v1

## 1. 本批目标

第二批的目标不是改业务链，而是先把第一版重构需要的 dev 底座补齐：

1. 收紧默认导入范围，避免延后对象继续被默认处理。
2. 在 `cloud1_dev` 中创建新框架第一批核心表。
3. 对旧 `diagnosis_sessions` 做兼容迁移，给后续新会话链留出正式锚点。

---

## 2. 本地代码改动

### 2.1 默认导入范围收紧

已改动：

- [excel-importer.js](/Users/jay/WebstormProjects/planting/src/data-system/importer/excel-importer.js)
- [tables.js](/Users/jay/WebstormProjects/planting/src/data-system/config/tables.js)
- [cli.js](/Users/jay/WebstormProjects/planting/src/cli.js)

本批做了两件事：

1. `pickTableConfigs()` 默认只选 `enabledByDefault !== false` 的表。
2. 把以下对象改成默认不导入：
   - `plant_identity_match_rules`
   - `plant_problem_profiles`

这样默认导入行为就和已经冻结的第一版执行口径对齐了。

---

## 3. 本地文档 / 脚本产物

新增：

- [第二批_dev核心建表脚本_v1.sql](/Users/jay/WebstormProjects/planting/docs/mvp-simplify/codex/第二批_dev核心建表脚本_v1.sql)
- [第二批_dev核心建表与兼容迁移说明_v1.md](/Users/jay/WebstormProjects/planting/docs/mvp-simplify/codex/第二批_dev核心建表与兼容迁移说明_v1.md)

其中 SQL 脚本覆盖两部分：

1. 新核心表创建
2. `diagnosis_sessions` 兼容扩展 + 回填

---

## 4. CloudBase 实际执行结果

执行环境：

- `EnvId`: `cloud1-2grufevs395a9d5e`
- `Schema`: `cloud1_dev`

### 4.1 已新建表

以下表已确认存在：

- `plant_identity_entities`
- `plant_identity_aliases`
- `genus_care_profiles`
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`

### 4.2 `diagnosis_sessions` 已兼容迁移

已完成：

- 新增 `session_id`
- 新增 `current_plant_identity_id`
- 新增 `current_identity_resolution_status`
- 新增 `current_route_primary_action`
- 新增 `current_round_id`
- 新增 `current_round_index`
- 新增 `latest_visual_call_batch_id`
- 新增 `outcome_type`
- 新增 `outcome_payload_json`
- 新增 `stop_reason`
- 新增 `session_status`
- 新增 `runtime_snapshot_json`
- 新增 `ended_at`

同时完成：

- `session_id` 唯一索引
- `session_status` 索引
- `current_plant_identity_id` 索引
- `latest_visual_call_batch_id` 索引

### 4.3 旧数据回填结果

`cloud1_dev.diagnosis_sessions` 旧记录共 46 条，本批全部完成：

- `session_id` 回填：46 / 46
- `outcome_type` 回填：46 / 46
- `session_status` 回填：46 / 46

兼容策略是：

- `session_id = diagnosis_id`
- `final_problem_key` 非空时，`outcome_type` 回填为 `problematic`
- 已有最终问题结果时，`session_status` 回填为 `completed`
- 需要追问但未结束时，回填为 `awaiting_follow_up`
- 其余回填为 `active`

---

## 5. 本批验证

### 5.1 本地静态校验

已通过：

- `node --check src/data-system/importer/excel-importer.js`
- `node --check src/data-system/config/tables.js`
- `node --check src/cli.js`

### 5.2 云端只读复核

已确认：

1. 8 张新表均存在于 `cloud1_dev`
2. `diagnosis_sessions` 新列已真实落库
3. `session_id` 已成为唯一键
4. 46 条旧记录已完成回填

---

## 6. 还没做的事

这批**没有**做：

- taxonomy / genus care 实际导入
- 新身份查询链改造
- `identify-http` 重构
- `diagnose-http` 重构
- 新表安全规则收口

也就是说，这批完成的是“dev 底座到位”，不是“主业务链已切换”。

---

## 7. 建议的下一步

下一步最顺的是：

1. 向 `plant_identity_entities / plant_identity_aliases / genus_care_profiles` 导入第一批静态数据
2. 先改植物添加链与 identity 查询链
3. 再接 `identify-http`
4. 最后切 `diagnose-http`
