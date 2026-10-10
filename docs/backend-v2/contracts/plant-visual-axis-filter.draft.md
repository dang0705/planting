# 植物三轴视觉筛选公开读取合同（草案，待用户审）

> **状态：草案，待用户审。** 未冻结，不得据此实现、写 DTO 或登记路由。标注【待拍板】的条目需用户裁决后才能冻结。

- 拟定合同版本：`plant-visual-axis-filter/v1`（冻结时确定）
- 负责域：`plant-knowledge`（目录/百科现有领域内的只读能力，不新增业务域）
- 票据：ClickUp `z8v0kmuqv6`「[E01/E02][P2] 植物三轴筛选只读纵向切片」
- 真相源：用户 2026-10-07 确认的三轴准入与 `qinghuazhi_v2_test` 数据源；2026-10-10 测试库只读核验（证据 `.codex/backend-v2/evidence/E02-three-axis-filter-discovery-2026-10-10.json`）。
- 范围：只开放 `LEAF_SHAPE`（叶型）、`GROWTH_FORM`（株型）、`LEAF_SURFACE`（叶面质感）。`LEAF_MARGIN`、`LEAF_SIZE`、`FOLIAGE_DENSITY` 及密度补证队列不进入首版。不重新抽取、不补齐、不使用诊断/浇水的 `*_visual_evidence`。

## 1. 数据现状（只读核验摘要，2026-10-10）

前端类比：`plant_visual_axis_results` 像一张「每株植物 × 每个筛选维度 × 每次打标批次」的标签表，`values_json` 是这株在这个维度上的多选标签数组。

| 事实 | 核验结果 |
|---|---|
| 结果表 | `plant_visual_axis_results`，约 75 万行；唯一键 `(encyclopedia_id, axis_code, extraction_version)`；索引 `(axis_code, status)`、`(taxon_id)` |
| 关联百科 | `encyclopedia_id` = 百科表内部 id；同时冗余 `taxon_id`（抽样 1–30000 号 6 万余行：孤儿 0、taxon_id 不一致 0） |
| 版本 | `visual-axis-all-v1`（全量）、`visual-axis-v2`（核心 90，与 weather 90 种完全重合）、`visual-axis-v1`（旧核心批次，约 90 行/轴，含全部 UNKNOWN） |
| 状态 | 仅 `EXTRACTED`、`UNKNOWN` 两种；**不存在 CONFLICT**。`UNKNOWN` 只出现在 `visual-axis-v1`（叶型 54 / 株型 46 / 叶面 38 行）；`all-v1` 与 `v2` 全部为 EXTRACTED |
| 缺值 | `all-v1` **不存未知行**：没抽到就没有这一行。抽样 1–30000 号：叶型缺 30.7%、株型缺 32.3%、叶面缺 33.8%，三轴全缺 9.0% |
| 行数（all-v1 EXTRACTED） | 叶型 237,091；株型 193,839；叶面 182,251 |
| 枚举 | `plant_visual_axis_values` `catalog_version=v1`：叶型 15、株型 7、叶面 8 个值，三轴 `axis_mode=MULTI`；all-v1 实际出现的值全部在目录内，无目录外值 |
| 同轴多值 | 普遍：all-v1 叶型 2 值以上 51.6%（最多 6 个），株型 26.0%，叶面 49.2%；数组内无重复值，无空数组 |
| 跨版本差异（核心 90） | all-v1 对这 90 种：叶型缺 38、与 v2 不同 16；株型缺 42、不同 14；叶面缺 43、不同 12 |
| 规则目录 | `plant_visual_axis_rule_catalog` 仅有 `visual-axis-v2` 规则（41 条），无 all-v1 规则行 |
| 核心 90 视图 | `plant_visual_profile_v2`（VIEW），只覆盖 v2 的 90 种，不能当全量表用 |

## 2. 入口（草案）

均为公开、只读、无个性化、无需幂等键，挂在 plant-knowledge 函数下。

1. `GET /api/v2/plant-knowledge/catalog/visual-axes`：返回三个已准入的维度及其可选值（中文名、定义、排序），供前端渲染筛选面板。
2. `GET /api/v2/plant-knowledge/catalog/visual-filter?leafShape=&growthForm=&leafSurface=&limit=&cursor=`：按三轴筛选目录植物。

与现有路由的关系：结果项的 `catalogTaxonRef` 与 `catalog/search`、`encyclopedia/{slug}?catalogTaxonRef=` 是同一命名空间（`taxon_id`），可直接跳百科详情。不返回、也不推导 `plantIdentityRef`（内部身份）。目录搜索与百科路由保持不变。

## 3. 请求参数与组合规则

| 参数 | 约束 |
|---|---|
| `leafShape` / `growthForm` / `leafSurface` | 可选；英文逗号分隔的值代码，例如 `leafShape=HEART,ELLIPTIC`。代码必须属于该轴当前生效的枚举目录，否则返回 400。同一参数内的重复值去重。每轴最多的值个数等于该轴枚举大小（代码硬边界） |
| `limit` | 可选整数；默认值与上限**走策略发布**（见 §7），不在代码里写默认值 |
| `cursor` | 可选；上一页返回的不透明游标 |

- **同轴 OR**：`leafShape=HEART,ELLIPTIC` 表示叶型含心形 **或** 含椭圆形。
- **跨轴 AND**：`leafShape=HEART&growthForm=VINING` 表示叶型命中 **且** 株型命中。
- 某轴不传：这一维度不做限制，该轴缺值的植物也可以出现在结果里。
- 三轴都不传：400【待拍板 D5，推荐必须至少选一个值，避免把 27 万目录整表翻页】。
- 前端类比：就像电商筛选，「品牌」里多选是 OR，「品牌 + 颜色」之间是 AND。

## 4. 状态、缺值与版本（不自动补齐）

- 只有 `status=EXTRACTED` 且 `values_json` 含所选值的行才算命中。
- UNKNOWN 行、没有行（缺值）、`values_json` 非数组或含目录外代码的行，对这个轴的任何筛选值**都不命中**。不按其他版本、规则、属或近缘种补值。
- 数据里出现的未知 status（例如将来的 CONFLICT）一律按不命中处理；状态枚举随合同版本冻结。
- **版本选定**：每个轴只读一个 `extraction_version`。同一请求里三个轴的版本取自同一份策略快照，不按植物逐株混用版本。【待拍板 D1】
- `visual-axis-v1`（含 UNKNOWN 的旧核心批次）不进入筛选。
- `visual-axis-v2` 核心 90 与 `plant_visual_profile_v2` 视图不冒充全量：若启用，必须是显式的「核心 90」范围，响应中注明。【待拍板 D2】

## 5. 排序、分页与确定性

- 排序【待拍板 D3】：推荐首版按 `catalogTaxonRef`（taxon_id）升序。它唯一、稳定，可用作翻页书签。缺点是排在前面的是冷门学名（例如 `abuta-*`）。按热度或中文名排序需要 DDL 或预计算表，本票不做。
- 分页：用 `taxon_id` 作书签的游标分页（cursor = 上一页最后一项的 taxon_id，经编码后不透明）。每页多取 1 条来判断 `hasMore`，不返回总数。不使用 offset：深页时 offset 会扫描并丢弃大量行。
- 同一游标、同一策略快照下结果确定可复现。

## 6. 成功 DTO（草案）

```ts
/** 筛选结果单项：只含目录引用、展示名与封面，以及三轴的公开取值。 */
type PlantVisualFilterItem = {
  catalogTaxonRef: string            // taxon_id，与目录搜索、百科读取同一命名空间
  displayName: string                // 百科 name
  scientificName: string | null      // 百科 scientific_name
  coverImage: TropicalsCoverImage | null  // 复用 plant-encyclopedia-read/v2「封面图」DTO 与规则
  visualAxes: {
    leafShape: string[] | null       // 该轴所选版本的值代码；缺值/UNKNOWN 为 null
    growthForm: string[] | null
    leafSurface: string[] | null
  }
}
type PlantVisualFilterResponse = {
  items: PlantVisualFilterItem[]
  nextCursor: string | null
}
```

- 不输出：`encyclopedia_id` 等数据库主键、`extraction_version`【待拍板 D6】、`status`、`confidence`、`evidence_text`、`source_field`、`source_hash`、`source_encyclopedia_id`、规则正则、时间戳。
- 是否只返回 `plant_search_documents.is_searchable=1` 的目录行【待拍板 D4，推荐是：与目录搜索、百科读取一致，避免返回点进去 404 的植物】。

## 7. 配置化判定（按 configuration-layers/v2）

| 参数 | 层 | 说明 |
|---|---|---|
| 每页默认条数、每页上限 | 策略发布：扩展 `plant-knowledge/public_search` 出新 schema 版本（例如 v2 增加 `visualFilterDefaultLimit`、`visualFilterMaxItems`），或新增 `plant-knowledge/visual_filter`【待拍板 D7】 | 取值待用户给定，不得私设默认值。代码只保留合同 `maxItems` 绝对上限 |
| 各轴选用的 `extraction_version` 与枚举 `catalog_version` | 推荐同一策略里的 `axisSources`【D1】 | 新抽取批次上线时只需切换策略版本，可以回滚 |
| 已准入的轴集合（三轴） | 代码常量 + 合同版本 | 增加轴意味着改 DTO 与前端分支，属于合同变更 |
| 枚举值合法性 | 运行时读 `plant_visual_axis_values`（受策略锁定的 catalog_version） | 不在代码里硬编码值列表 |

以上配置项均未登记在 `configuration-variable-catalog.json`，需主代理裁决登记后才能实现。

## 8. 错误

- 参数非法（未知轴值、空值段、limit 越界、游标损坏）：400 `VALIDATION_FAILED`
- 策略快照不可用：503（沿用策略层规则，不回退源码默认值）
- 数据库异常：500 `INTERNAL_ERROR`，不泄露 SQL

## 9. 性能风险（需知会）

测试库 `EXPLAIN`：单轴条件走 `(axis_code, status)` 索引，预估扫描约 37 万行，再加文件排序，用 `JSON_OVERLAPS` 逐行判断；跨轴用唯一键逐行回查。典型组合查询（叶型 HEART 且株型 VINING，取 21 条）能在只读通道内返回，但需要先扫描约 23 万行。真正提速要靠多值索引或预计算筛选表，两者都需要 DDL，本票不做【待拍板 D8】。

## 10. 待用户拍板

| # | 问题 | 推荐 |
|---|---|---|
| D1 | 每轴版本 | 首版三轴都用 `visual-axis-all-v1`（全量覆盖）；版本写进策略，不写死在代码里 |
| D2 | 核心 90 的 v2 | 首版不启用。如需启用，作为显式参数 `scope=core90`，只在 90 种内筛选，不与 all-v1 逐株混用 |
| D3 | 排序 | taxon_id 升序（确定、能翻页）；热度/中文名排序另立票（需 DDL/预计算） |
| D4 | 是否限 `is_searchable=1` | 是 |
| D5 | 三轴全空是否允许 | 不允许（400） |
| D6 | 响应是否带版本标签 | 不在每项输出；如需追溯，在响应顶层给出策略 `releaseVersion` |
| D7 | 分页默认值与上限的取值及所在策略 | 扩展 `plant-knowledge/public_search` 出新 schema 版本；取值请用户给（参考：目录搜索默认 10、上限 20） |
| D8 | 是否接受首版的扫描成本，或先开 DDL 票建预计算表 | 先按只读实现并实测延迟；若超 1 秒再开 DDL 票 |
