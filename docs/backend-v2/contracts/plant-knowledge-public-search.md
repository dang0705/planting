# 已发布植物身份公开搜索合同

- 合同版本：`plant-knowledge-public-search/v1`
- 所有者：`plant-knowledge`
- 路由：`GET /api/v2/plant-knowledge/search`（`operationId=searchPublishedPlants`，安全级别 `public`，幂等 `not_applicable`）
- 依据：[植物分类与身份合同](plant-taxonomy.md)「发布与读取」、[已发布植物公开读取合同](plant-knowledge-public-read.md) §2–§4、[HTTP API 公共合同](http-api.md) §2–§3，以及主代理对首版搜索范围的裁决。

## 1. 请求

| 位置 | 字段 | 约束 |
|---|---|---|
| query | `q` | 必填字符串；先去除首尾空白，再转为 Unicode NFC；规范化后须为 1–64 个 Unicode 码点。空词或超长词返回 `400 VALIDATION_FAILED`。长度按码点而非 UTF-16 单元或 UTF-8 字节计算。 |

首版不提供 `limit` 或 `cursor`。公开搜索不读取、不要求也不解析身份凭证。

## 2. 匹配与排序

1. 仅对已发布身份的 `displayNameZh` 与其主要分类实体的 `acceptedScientificName` 做字面前缀匹配；不搜索别名、百科正文、Tropicals 等供应商候选或其他待审核记录。
2. 匹配与字符串排序使用数据库 `utf8mb4_unicode_ci` 排序规则：大小写不敏感，字符等价关系由该固定排序规则决定，不依赖应用运行环境的大小写转换。`%`、`_`、反斜杠 `\` 及 SQL 转义符均按普通查询字符处理，不作为通配符或转义标记。
3. 精确匹配（在同一数据库排序规则下，展示名或接受学名等于规范化查询词）排在其他前缀命中之前；随后按 `displayNameZh`、`acceptedScientificName`、`plantIdentityRef` 升序稳定排序。公开引用作为最终唯一排序键。
4. 每个 `plantIdentityRef` 最多一项；不同公开引用即使展示名相同也分别保留。

## 3. 成功响应

HTTP `200`，统一信封 `{ "data": PlantSearchResponse }`：

```ts
/** 已发布植物身份搜索结果；不暴露发布内部信息，也不提供翻页状态。 */
export type PlantSearchResponse = {
  /** 按本合同稳定排序的已发布身份；最多 20 项。 */
  items: PublishedPlantResponse[]
  /** 命中数超过 20 时为 true；否则为 false。 */
  truncated: boolean
}
```

`PublishedPlantResponse` 严格沿用 [已发布植物公开读取合同](plant-knowledge-public-read.md) §2 的五字段 DTO：`plantIdentityRef`、`displayNameZh`、`identityKind`、`acceptedScientificName`、`taxonRank`。结果上限以生效的业务策略 `plant-knowledge/public_search` 为准，当前 20（用户 2026-10-10 裁定；代码绝对上限 20，策略只能调小）。服务可读取第 21 条以判断 `truncated`，但不得把它放进响应。无命中返回 `200`、`items: []`、`truncated: false`。

## 4. 可见性规则

搜索仅返回同时满足 [已发布植物公开读取合同](plant-knowledge-public-read.md) §3 双 active release 准入条件的身份：身份与主要分类实体表状态均为 `ACTIVE`，且当前 identity 与 taxonomy active release 的 `ACTIVE` 明细分别收录该对象。每个请求只使用当前 active release，不把候选记录写入或合并到公开搜索。

任一 active release 指针不存在时，当前没有满足双发布准入条件的身份，返回 `200` 空结果。指针或其关联发布数据无法查询、违反数据库结构约束或读取失败时，返回 §5 的内部错误。单项详情路由既有的不可见身份 `404` 语义保持不变。

## 5. 错误

| 情况 | HTTP | `error.type` | `error.message` |
|---|---:|---|---|
| `q` 缺失、空词或规范化后超过 64 个 Unicode 码点 | 400 | `VALIDATION_FAILED` | 请求参数不合法 |
| 数据库或 active release 查询基础设施不可用、发布结构损坏或未分类失败 | 500 | `INTERNAL_ERROR` | 服务暂时不可用 |

错误正文只使用 `http-api/v1` 的 `{ "error": { "type", "message" } }` 形状，不得包含 SQL、堆栈、内部主键或发布引用。

## 6. 固定硬限制与范围

查询长度上限（当前 64 个 Unicode 码点，代码绝对上限 255 = 被搜索列最大长度）与结果上限（当前 20 项，绝对上限 20）以生效的业务策略 `plant-knowledge/public_search` 为准（用户 2026-10-10 裁定）；策略不可用时返回 `503 SERVICE_UNAVAILABLE`。首版不包含模糊搜索、别名搜索、Tropicals 候选搜索、分类筛选、客户端指定上限、游标翻页或用户个性化排序。
