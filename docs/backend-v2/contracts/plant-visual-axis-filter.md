# 植物三轴视觉筛选公开读取合同

- 合同版本：`plant-visual-axis-filter/v1`
- 状态：**已冻结**（用户 2026-10-10 审定草案 D1–D8 全部按推荐；每页默认 20、上限 50）
- 负责域：`plant-knowledge`（目录/百科领域内的只读能力，不新增业务域）
- 票据：ClickUp `z8v0kmuqv6`「[E01/E02][P2] 植物三轴筛选只读纵向切片」
- 真相源：用户 2026-10-07 确认的三轴准入与 `qinghuazhi_v2_test` 数据源；2026-10-10 测试库只读核验（`.codex/backend-v2/evidence/E02-three-axis-filter-discovery-2026-10-10.json`）；用户 2026-10-10 审定。
- 范围：只开放 `LEAF_SHAPE`（叶型）、`GROWTH_FORM`（株型）、`LEAF_SURFACE`（叶面质感）。`LEAF_MARGIN`、`LEAF_SIZE`、`FOLIAGE_DENSITY` 与密度补证队列不进入 v1。不重新抽取、不补齐、不使用诊断/浇水的 `*_visual_evidence`。

## 1. 数据来源（只读）

前端类比：`plant_visual_axis_results` 像一张「每株植物 × 每个筛选维度 × 每次打标批次」的标签表，`values_json` 是这株在该维度上的多选标签数组。

| 来源 | 用途 |
|---|---|
| `plant_visual_axis_results` | 每轴只读策略指定的一个 `extraction_version`；只有 `status='EXTRACTED'` 且 `values_json` 为数组的行参与匹配 |
| `plant_visual_axis_values` | 策略指定 `catalog_version`、`is_active=1` 的三轴枚举：中文名、定义、排序；也是请求取值合法性的唯一来源 |
| `tropicals_species_encyclopedia_ref` | 经 `id = encyclopedia_id` 内部关联，取 `taxon_id`、`name`、`scientific_name`、封面两列；内部 id 不对外 |
| `plant_search_documents` | 经 `taxon_id` 关联，**只返回 `is_searchable=1`**，与目录搜索、百科读取一致 |

规则目录 `plant_visual_axis_rule_catalog` 只作抽取审计，不在运行时读取，规则正文不得公开。核心 90 视图 `plant_visual_profile_v2` 和 `visual-axis-v2`、`visual-axis-v1` 批次不进入 v1（D2）。

## 2. 入口

均为公开、只读、无个性化、无需幂等键。挂在 plant-knowledge 函数下。

1. `GET /api/v2/plant-knowledge/catalog/visual-axes`（`operationId=listPlantVisualAxes`）：返回三个已准入维度及其可选值，供前端渲染筛选面板。
2. `GET /api/v2/plant-knowledge/catalog/visual-filter`（`operationId=filterPlantsByVisualAxes`）：按三轴筛选目录植物。

与现有路由的关系：结果项的 `catalogTaxonRef` 与 `catalog/search`、`encyclopedia/{slug}?catalogTaxonRef=` 同一命名空间（`taxon_id`），可直接进入百科详情。不返回、不推导 `plantIdentityRef`。目录搜索与百科路由不变。

## 3. 请求参数（visual-filter）

| 参数 | 约束 |
|---|---|
| `leafShape` / `growthForm` / `leafSurface` | 可选；英文逗号分隔的值代码，例如 `leafShape=HEART,ELLIPTIC`。每段须匹配 `^[A-Z][A-Z0-9_]{0,63}$`（与 `value_code VARCHAR(64)` 一致），并属于该轴生效枚举；同一参数内重复值去重。空串、空段（如 `HEART,,ELLIPTIC`）、同名参数出现多次均为 400 |
| `limit` | 可选，十进制正整数且无前导零。省略时取策略 `visualFilterPageSize.default`（当前 20），上限为策略 `visualFilterPageSize.max`（当前 50，代码绝对上限 50） |
| `cursor` | 可选；上一页响应的 `nextCursor` 原样传回。不透明字符串，服务端校验，损坏即 400 |

未知查询参数忽略（与目录搜索一致）。

- **同轴 OR**：`leafShape=HEART,ELLIPTIC` 表示叶型含心形**或**含椭圆形。
- **跨轴 AND**：`leafShape=HEART&growthForm=VINING` 表示叶型命中**且**株型命中。
- 某轴不传：这一维度不做限制，该轴缺值的植物也可以出现。
- **三轴都不传：400**（D5）。

## 4. 状态、缺值与版本（不自动补齐）

- 命中条件：该轴所选版本存在 `status='EXTRACTED'` 的行，`values_json` 为 JSON 数组，且与请求值有交集。
- UNKNOWN 行、没有行（缺值）、`values_json` 非数组，对该轴任何筛选值都**不命中**。不从其他版本、规则、属或近缘种补值。
- 数据中出现 `EXTRACTED` 以外的任何状态（例如将来的 CONFLICT）一律不命中。
- 行内出现的目录外代码不参与匹配、也不输出；同一行的其他合法代码照常匹配。
- **版本选定（D1）**：每轴版本来自策略 `visualAxisSources`，当前三轴均为 `visual-axis-all-v1`。策略 Schema 只允许全量批次（`visual-axis-all-v<n>`），避免核心 90 批次冒充全量。同一请求的三轴版本与枚举版本来自同一份策略快照，不按植物逐株混用。

## 5. 排序、分页与确定性

- 排序（D3）：按 `catalogTaxonRef`（`taxon_id`）升序，排序规则与百科表 `taxon_id` 列一致（唯一，无并列）。
- 游标分页：`nextCursor` 编码本页最后一项的 `catalogTaxonRef`；下一页从严格大于它的位置开始。每页多取 1 条判断是否还有下一页，没有时 `nextCursor=null`。不返回总数，不使用 offset。
- 同一组筛选条件、同一策略快照、数据不变时，逐页翻完的并集等于一次性全量结果：不重复、不遗漏。

## 6. 成功 DTO

```ts
/** visual-axes 响应。 */
type PlantVisualAxesResponse = {
  policyReleaseVersion: string        // 本次使用的 plant-knowledge/public_search 发布版本（D6）
  axes: Array<{
    axisCode: 'LEAF_SHAPE' | 'GROWTH_FORM' | 'LEAF_SURFACE'   // 固定此顺序
    queryParameter: 'leafShape' | 'growthForm' | 'leafSurface'
    nameZh: string                    // axis_name_zh
    values: Array<{ valueCode: string; nameZh: string; definitionZh: string }>  // sort_order 升序，再按 valueCode
  }>
}

/** visual-filter 结果项：只含目录引用、展示名、封面与三轴公开取值。 */
type PlantVisualFilterItem = {
  catalogTaxonRef: string                  // taxon_id
  displayName: string                      // 百科 name
  scientificName: string | null            // 百科 scientific_name
  coverImage: TropicalsCoverImage | null   // 复用 plant-encyclopedia-read/v2「封面图」DTO 与规则
  visualAxes: {
    leafShape: string[] | null             // 所选版本的合法值代码，按枚举 sort_order 排序；缺值/UNKNOWN/无合法值为 null
    growthForm: string[] | null
    leafSurface: string[] | null
  }
}
type PlantVisualFilterResponse = {
  policyReleaseVersion: string
  items: PlantVisualFilterItem[]
  nextCursor: string | null
}
```

响应信封为 `{ data: ... }`。不输出：数据库主键（含 `encyclopedia_id`）、`extraction_version`、`catalog_version`、`status`、`confidence`、`evidence_text`、`source_field`、`source_hash`、`source_encyclopedia_id`、规则正则、时间戳、原始封面来源 JSON。

## 7. 配置（configuration-layers/v2）

| 参数 | 层 | 目录 ID |
|---|---|---|
| 每页默认 20、上限 50 | 策略发布：`plant-knowledge/public_search` 新正文 `plant-knowledge-public-search/v2` 的 `visualFilterPageSize` | `plant-knowledge.visual_filter.page_size` |
| 各轴 `extraction_version` 与枚举 `catalog_version` | 同一正文的 `visualAxisSources` | `plant-knowledge.visual_filter.axis_sources` |
| 每页绝对上限 50 | 代码硬边界（`plant-knowledge.public_search.absolute_bounds.visualFilterMaxItems`），即本合同 `items` 的 maxItems | — |
| 已准入轴集合（三轴）与参数名 | 代码常量 + 合同版本 | 加轴是合同变更 |

`plant-knowledge-public-search/v2` 中 v1 原有四个字段的取值不变，目录搜索与百科读取行为不变。活动发布仍是 v1 时，本合同两个入口返回 503（v1 正文没有三轴字段）。

## 8. 错误

| 情况 | HTTP | `error.type` |
|---|---:|---|
| 未知轴值、值格式非法、空值段、重复参数、三轴全空、limit 越界或非法、游标损坏 | 400 | `VALIDATION_FAILED` |
| 策略快照不可用，或活动发布不含三轴字段 | 503 | `SERVICE_UNAVAILABLE` |
| 数据库异常；生效枚举缺失某一准入轴 | 500 | `INTERNAL_ERROR` |

错误正文沿用 `http-api/v1` 稳定错误信封，不泄露 SQL、内部主键、规则或策略正文。

## 9. 已知局限

- **排序**：taxon_id 升序会让冷门学名（如 `abuta-*`）排在前面。按热度或中文名排序另立票 ClickUp `z8v0kmvg9b`「植物筛选结果热度/中文名排序」（https://app.clickup.com/t/z8v0kmvg9b），需要 DDL 或预计算表。
- **性能（D8）**：结果表没有针对标签数组的多值索引。驱动轴走 `(axis_code, status)` 索引扫描并逐行用 `JSON_OVERLAPS` 判断，其余轴按唯一键逐行回查。v1 不加索引；测试环境实测典型组合超过 1 秒时，再开改表票。实测结果见证据文件。
- **缺值比例高**：all-v1 抽样约三成植物缺某一轴，缺值不命中，因此筛选结果是「已标注且命中」的子集。
- 核心 90 的 v2 精标不参与 v1。

## 10. Expected 与验收

- L1 / L3 `unit_fake`：真实 HTTP + 冻结路由 + 请求链 + Repository，仅替换 MySQL 与策略读取端口。覆盖同轴 OR / 跨轴 AND、UNKNOWN/缺值/非数组不命中、未知枚举 400、三轴全空 400、游标翻页不重不漏、排序稳定、只返回可搜索植物、公开脱敏、策略缺失或 v1 发布 503。
- L3 `unit_real_data`：本机 Docker MySQL，表结构与排序规则照抄测试库 information_schema，真实 SQL → HTTP 读回。
- 不冒充：网关、部署、生产数据规模下的延迟。
