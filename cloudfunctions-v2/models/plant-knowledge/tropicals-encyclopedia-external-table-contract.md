# 外部表读取合同：`tropicals_species_encyclopedia_ref`

依据：主代理 2026-10-09 裁决 B——该表由 Tropicals 导入流程拥有（52 列共享表），**不纳入 v2 迁移**；v2 只读。

## 1. 所有权

- **拥有者**：Tropicals 导入流程（表结构、数据、导入批次、索引）。
- **v2 角色**：只读消费方。v2 代码不得 INSERT/UPDATE/DELETE/ALTER 本表，不在 v2 迁移中 CREATE 本表，不在 HTTP 函数启动时校验或修复本表。
- **v2 隔离测试**：只允许在测试内建立「读取桩」最小表，列类型必须照抄测试库 information_schema，并标明不是正式 DDL。

## 2. v2 代码实际读取的列（2026-10-09 从 `cloudfunctions-v2/src` 的 SQL 中 grep 得出）

| 列 | 类型（测试库 qinghuazhi_v2_test information_schema，主代理 2026-10-09 只读查询） | 读取方 | 用途 |
|---|---|---|---|
| `id` | `bigint unsigned NOT NULL AUTO_INCREMENT`（主键） | weather（`src/weather/repository/mysql-city-climate-fit-repository.ts`，**他人未提交工作区代码**） | 以 `e.id = f.encyclopedia_id` 关联 |
| `taxon_id` | `varchar(512) NOT NULL UNIQUE` | plant-knowledge 百科读取、Tropicals 浇水基线读取 | 目录引用（`catalogTaxonRef`），等值匹配 |
| `water_frequency_tier` | `varchar(32) NULL` | Tropicals 浇水基线读取（care 浇水建议经此读取） | 与 `watering_baseline_policy.water_frequency_tier` 二进制等值连接 |
| `water_frequency_source_json` | `json NULL` | Tropicals 浇水基线读取 | 来源记录，AJV 校验 `source_url`、`source_sha256`、`independent_review_status`、`record.{taxonID,measurementTypeID,measurementValue,measurementRemarks}` |
| `name` | `varchar(512) NOT NULL` | 百科读取、weather（他人未提交） | 展示名 |
| `scientific_name` | `varchar(512) NULL`（有普通索引） | 百科读取、weather（他人未提交） | 学名展示 |
| `additional_names_json` | `json NOT NULL` | 百科读取 | 别名 |
| `taxon_rank`、`order_name`、`family`、`genus` | `taxon_rank varchar(64) NULL`；`order_name`、`family`、`genus` 均为 `varchar(255) NULL` | 百科读取 | 分类展示 |
| `description` | `text NULL` | 百科读取 | 简介 |
| `bio_morphology`、`bio_distribution`、`bio_varieties`、`bio_habitat`、`bio_propagation`、`bio_commercial`、`bio_pests` | 均为 `mediumtext NULL` | 百科读取 | 百科正文 |
| `care_difficulty` | `varchar(64) NULL` | 百科读取、weather（他人未提交） | 养护难度 |
| `temperature_range`、`humidity_range`、`light_requirement` | `temperature_range`、`humidity_range` 为 `varchar(64) NULL`；`light_requirement` 为 `varchar(512) NULL` | 百科读取 | 环境偏好展示 |
| `cover_image_ref` | `varchar(1024) NULL` | weather（他人未提交） | 封面图引用 |

v2 不读取上表以外的列（该表共 52 列，其余由 Tropicals 流程使用）；新增读取列必须先更新本合同。weather 读取方当前为他人未提交代码，其提交时须复核本表相应行。

## 3. v2 依赖的语义（变更须通知 v2 的条件）

以下任一变化发生前，Tropicals 导入流程必须通知 v2 维护者，v2 先更新合同、测试与读取器再上线变更：

1. 上表任一列被删除、重命名、改类型、改可空性，或 `taxon_id` 失去唯一性。
2. `taxon_id` 取值格式变化（当前为 `https://tropicals.cn/species/<slug>` 形式的稳定目录引用）。
3. `water_frequency_tier` 的取值集合变化（当前 v1 基线覆盖 `constant_moisture`、`regular`、`occasional`、`drought_tolerant`），或与 `measurementValue` 不再一致。
4. `water_frequency_source_json` 的结构变化（上节 AJV 必填字段任一缺失或改名）、`measurementTypeID` 变化，或 `measurementRemarks` 语义变化（影响触发状态编译）。
5. 表被拆分、迁移到其他库/实例，或改为视图。
6. 字符集/排序规则变化导致 `taxon_id` 等值匹配或与基线表的二进制连接结果变化。

## 4. 失败处理（v2 侧）

- 行缺失 → 浇水基线 `not_found` → 浇水建议 `insufficient_evidence`（不报错）。
- 来源 JSON 不合 Schema 或与 tier 不一致 → `invalid_source` → 同上。
- 查询异常 → 浇水建议 503 `SERVICE_UNAVAILABLE`；不回退其他版本或默认值。
