# 已发布植物公开读取合同

- 合同版本：`plant-knowledge-public-read/v1`
- 所有者：`plant-knowledge`
- 路由：`GET /api/v2/plant-knowledge/plants/{plantIdentityRef}`（`operationId=getPublishedPlant`，安全级别 `public`，幂等 `not_applicable`）
- 依据：[植物分类与身份合同](plant-taxonomy.md)「发布与读取」、[HTTP API 公共合同](http-api.md) §2–§3、`docs/backend-v2/schema/002_plant_knowledge.sql`。

## 1. 请求

| 位置 | 字段 | 约束 |
|---|---|---|
| path | `plantIdentityRef` | 字符串，长度 8–100，只允许 `A-Z a-z 0-9 _ -`；不满足时返回 `400 VALIDATION_FAILED` |

公开路由不读取、不要求也不解析任何身份凭证；请求携带的 `Authorization` 头不改变结果。

## 2. 成功响应

HTTP `200`，统一信封 `{ "data": PublishedPlantResponse }`：

```ts
/** 已发布产品身份的最小公开视图；不含百科正文、证据、审核或发布内部信息。 */
export type PublishedPlantResponse = {
  /** 产品身份公开引用，对应 plant_identities.public_identity_ref。 */
  plantIdentityRef: string
  /** 中文一等公民展示名，对应 plant_identities.display_name_zh。 */
  displayNameZh: string
  /** 产品身份类型。 */
  identityKind: 'taxon' | 'cultivar' | 'product_group'
  /** 主要权威分类实体的接受学名（含作者串），对应 plant_taxa.accepted_scientific_name。 */
  acceptedScientificName: string
  /** 主要权威分类实体的分类等级，对应 plant_taxa.taxon_rank。 */
  taxonRank:
    | 'family'
    | 'genus'
    | 'species'
    | 'subspecies'
    | 'variety'
    | 'form'
    | 'hybrid'
    | 'cultivar'
    | 'species_group'
}
```

响应只允许以上 5 个字段，禁止追加数据库主键、`_openid`、审核状态、发布引用、证据摘要或来源版本。

## 3. 可见性规则

只有同时满足下列条件的产品身份才可读取，与“用户确认只能选择已发布且未隔离的产品身份”使用同一准入谓词：

1. `plant_identities.review_status = 'ACTIVE'`，且其主要分类实体 `plant_taxa.review_status = 'ACTIVE'`；
2. 当前 `identity` active release 的逐项明细包含该身份，且准入状态为 `ACTIVE`；
3. 当前 `taxonomy` active release 的逐项明细包含其主要分类实体，且准入状态为 `ACTIVE`。

任一条件不满足（包括不存在、未发布、已隔离、已拒绝、发布指针缺失）统一返回 `404 NOT_FOUND`，公开消息相同，不区分具体原因。

## 4. 错误

| 情况 | HTTP | `error.type` | `error.message` |
|---|---:|---|---|
| 路径参数不合法 | 400 | `VALIDATION_FAILED` | 请求参数不合法 |
| 身份不可见（见 §3） | 404 | `NOT_FOUND` | 植物不存在或尚未发布 |
| 数据库不可用、数据不符合本合同或未分类失败 | 500 | `INTERNAL_ERROR` | 服务暂时不可用 |

错误正文只使用 `http-api/v1` 的 `{ "error": { "type", "message" } }` 形状，不得包含 SQL、堆栈或内部引用。

## 5. 明确不在本合同内

百科展示正文、别名与搜索、养护/安全/诊断知识、图片、多语言名称、缓存策略。
