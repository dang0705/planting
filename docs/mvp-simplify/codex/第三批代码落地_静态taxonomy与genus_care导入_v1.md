# 第三批代码落地：静态 taxonomy 与 genus care 导入 v1

## 本批目标

- 完成 `cloud1_dev` 中静态身份数据与属级养护基线的首轮导入收口。
- 把导入过程从“手动执行长 SQL”收口成可重复执行的工程脚本。

## 本批结果

- `plant_identity_entities` 已在此前批次导入完成，当前计数 `192`
- `plant_identity_aliases` 已在此前批次导入完成，当前计数 `400`
- `genus_care_profiles` 本批导入完成，当前计数 `152`

最终复核 SQL：

```sql
SELECT
  (SELECT COUNT(*) FROM plant_identity_entities) AS entity_count,
  (SELECT COUNT(*) FROM plant_identity_aliases) AS alias_count,
  (SELECT COUNT(*) FROM genus_care_profiles) AS care_count;
```

复核结果：

- `entity_count = 192`
- `alias_count = 400`
- `care_count = 152`

## 本批代码改动

### 1. 修正 genus care 导入映射

文件：

- `src/data-system/config/tables.js`

新增 `GENUS_CARE_FAMILY_OVERRIDES`，只处理 4 条已确认缺失 `family_name_canonical` 的素材行：

- `Crassulaceae -> Crassulaceae`
- `Dianthus -> Caryophyllaceae`
- `Gardenia -> Rubiaceae`
- `Rosa -> Rosaceae`

说明：

- 这不是放宽规则，而是对脏数据做最小收口。
- 其中 `Dianthus` / `Rosa` 可由现有 taxonomy / `plant_catalog.csv` 直接印证。
- `Gardenia` 在旧 `plant_catalog.csv` 中已有 `family_name_cn=茜草科`，本次将 canonical 英文统一补为 `Rubiaceae`。
- `Crassulaceae` 是现有素材中的类群占位记录，本次按 `genus_name=family_name_canonical=Crassulaceae` 收口，保证挂接键非空。

### 2. 新增 CloudBase 批量 SQL 执行脚本

文件：

- `src/data-system/importer/run-cloudbase-sql-import.js`

作用：

- 顺序读取目录下的 `.sql` 批次文件
- 通过现有 `cloudfunctions/layer/utils/cloudbase.js` 中的 `models.$runSQL` 执行
- 返回逐文件执行结果

这样后续静态导入不再需要手工把长 SQL 一段段塞进 MCP 参数。

## 导入执行口径

### 实际执行目录

- `tmp/import-sql/genus-care-25`

### 为什么从 50 行批次切到 25 行批次

- 50 行批次在交互链路里容易出现长字符串截断
- 25 行批次足够小，便于稳定执行和复核
- 数据内容未变化，只是执行切片变小

### 实际执行结果

导入脚本返回：

```json
{
  "ok": true,
  "appEnv": "development",
  "fileCount": 7
}
```

说明：

- `models.$runSQL` 返回中的 `rowsAffected` 未可靠反映写入数量
- 以最终数据库 `COUNT(*)` 结果作为成功判定

## 过程中的真实问题

### 1. MCP 直接执行长 SQL 可行，但不适合批量导入

- 单次长 SQL 参数在交互过程中容易截断
- 对批量静态导入来说，工程成本过高

### 2. genus care 素材存在 4 条 `family_name_canonical='null'` 的脏数据

涉及记录：

- `Crassulaceae`
- `Dianthus`
- `Gardenia`
- `Rosa`

这 4 条如果不收口，`genus_care_profiles.family_name_canonical NOT NULL` 会直接阻断导入。

## 当前状态

到本批结束，`cloud1_dev` 中第一版静态核心底座可视为已齐：

- `plant_identity_entities`
- `plant_identity_aliases`
- `genus_care_profiles`

这意味着后续可以开始进入：

- `plant-catalog-http` 新 taxonomy / identity 查询改造
- `identify-http` 新视觉入口与身份解析链改造
- `diagnose-http` evidence-first / route-first 主链改造

## 后续建议

- 把 `run-cloudbase-sql-import.js` 继续用于 diagnosis 静态表导入，不再回到手工 SQL 模式
- 在导入链上补一层“脏数据报告”，把 `null` / 非 canonical family / 非法 category 在生成 SQL 前一次性报告出来
