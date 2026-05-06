# 第一批代码落地：数据系统与 SQL 入口基础改造 v1

## 1. 本轮目标

本轮代码落地严格遵循：

- 基础设施冻结
- 前端壳不动
- 先改数据系统与后端最小共用层

因此第一批只做两件事：

1. 把 `data-system` 从“旧表 + 单 workbook 导入”切到“新正式表 + 多素材源导入”
2. 把 CloudBase SQL 白名单补到新表体系，避免后续重构时先被底层拦住

---

## 2. 已完成代码改动

### 2.1 `src/data-system/config/tables.js`

已完成：

- 将旧 `TABLE_CONFIGS` 重写为第一版正式基线导入表集合
- 正式纳入 3 类素材源：
  - `diagnosis`
  - `taxonomy`
  - `genus-care`
- 新增 Taxonomy 侧首批表配置：
  - `plant_identity_entities`
  - `plant_identity_aliases`
  - `plant_identity_match_rules`
- 新增 `genus_care_profiles` 配置
- 将问题侧问题表名称从旧 workbook 语义映射为正式表名：
  - `question_library_v5_real` -> `question_templates`
  - `question_option_mapping_v5_real` -> `question_option_sets`

同时补了第一阶段 mapper 规则：

- `plant_catalog.csv` -> `plant_identity_entities`
- `plant_catalog.csv` -> `plant_identity_aliases`
- `plant_catalog.csv` -> `plant_identity_match_rules`
- `genus_care_profile.csv` -> `genus_care_profiles`

### 2.2 `src/data-system/importer/excel-importer.js`

已完成：

- 保留现有 CLI 入口名 `runExcelImport`
- 内部改成 source-aware 导入器
- 支持：
  - `xlsx` workbook 导入
  - 无表头 `csv` 导入
- 支持按 source 自动选择默认素材路径
- 支持单条原始记录映射为多条正式记录
  - 例如一条 `plant_catalog.csv` 记录同时生成：
    - `plant_identity_entities`
    - `plant_identity_aliases`
    - `plant_identity_match_rules`

### 2.3 `src/data-system/validator/schema-validator.js`

已完成：

- 不再假设所有导入源都是单个 Excel 表头
- 改成双层校验：
  - 素材结构是否符合 source 预期
  - 正式表字段是否能在目标 DB 中命中
- 支持 `taxonomy` / `diagnosis` / `genus-care`

### 2.4 `src/cli.js`

已完成：

- `import-data` 新增 `--source`
- `validate-schema` 新增 `--source`
- usage 已更新为新素材源口径

### 2.5 `cloudfunctions/layer/utils/cloudbase.js`

已完成：

- 在 SQL 表 allowlist 中补入第一版新表名：
  - `plant_identity_entities`
  - `plant_identity_aliases`
  - `plant_identity_match_rules`
  - `plant_identity_merge_history`
  - `genus_care_profiles`
  - `plant_identity_diagnosis_links`
  - `question_templates`
  - `question_option_sets`
  - `diagnosis_result_explanations`
  - `visual_call_batches`
  - `plant_identity_resolution_records`
  - `visual_raw_image_records`
  - `visual_normalized_image_results`
  - `visual_admission_records`
  - `visual_call_aggregate_results`
  - `visual_supervision_records`

---

## 3. 本轮实际验证

本轮已完成的本地验证：

1. `node --check` 通过：
   - `src/data-system/config/tables.js`
   - `src/data-system/importer/excel-importer.js`
   - `src/data-system/validator/schema-validator.js`
   - `src/cli.js`
   - `cloudfunctions/layer/utils/cloudbase.js`

2. 已确认 workbook 真实 sheet 映射可用：
   - `problems`
   - `question_library_v5_real`
   - `question_option_mapping_v5_real`

3. 已确认无表头 CSV 可按 UTF-8 正确读取，未出现中文乱码

4. 已确认首条素材样例可生成正式 payload：
   - `plant_identity_entities`
   - `plant_identity_aliases`
   - `plant_identity_match_rules`
   - `genus_care_profiles`

---

## 4. 当前限制

本轮**没有**做以下事情：

1. 还没有实际执行 DB 导入
2. 还没有建表
3. 还没有改诊断主链
4. 还没有改 `identify-http`
5. 还没有改前端页面与诊断交互

另外，当前 taxonomy 导入 mapper 仍是第一阶段最小规则：

- `plant_identity_id` 为稳定 hash ID
- `canonical_identity_name` 目前优先取学名
- alias / match rule 目前只先生成最小可用集合

这意味着：

# **当前已具备“开始往新表导入 dev 数据”的基础代码条件，但还不等于 taxonomy 全量治理完成。**

---

## 5. 下一步建议

下一步建议直接进入：

1. 建立第一版 dev 新表
2. 先跑 `taxonomy + genus-care + diagnosis` 三类静态表导入
3. 跑出第一版 schema / import report
4. 再开始改 `plant-catalog-http` 与 `identify-http`

---

## 6. 一句话

**第一批代码已经把旧数据系统切到了“新正式表名 + 多素材源导入”的起跑线，并补齐了后端 SQL 入口对新表体系的最小兼容。**
