# 植物目录公开搜索合同

- 合同版本：`plant-catalog-search/v1`
- 所有者：`plant-knowledge`
- 路由：`GET /api/v2/plant-knowledge/catalog/search`（`operationId=searchPlantCatalog`，安全级别 `public`，幂等 `not_applicable`）
- 运行时数据源：`plant_search_terms` → `plant_search_documents`

## 1. 定位

本合同服务于 27 万级植物目录检索，不等同于“已发布青花植 PlantIdentity 搜索”。

```text
目录搜索命中
≠ 已发布 PlantIdentity
≠ 用户植物当前身份
```

搜索命中可以供用户查看、选择候选或进入百科详情；只有已建立并发布的内部 PlantIdentity 才能作为规范产品身份。目录行是否 `is_selectable=1` 仅表示允许进入后续候选/选择流程，不代表它已经成为青花植内部权威身份。

## 2. 请求

| 位置 | 字段 | 约束 |
|---|---|---|
| query | `q` | 必填；去首尾空白并转 Unicode NFC；规范化后 1–64 个 Unicode 码点 |
| query | `limit` | 可选整数；默认与上限以生效策略 `plant-knowledge/public_search` 为准，当前默认 10、范围 1–20（用户 2026-10-10 裁定；查询长度当前 64 码点，绝对上限 255；策略不可用 503） |

首版不提供分页游标、分类筛选或用户个性化排序。公开搜索不要求登录。

## 3. 搜索与排序

1. 仅检索 `plant_search_terms.is_active=1` 且目标 `plant_search_documents.is_searchable=1` 的词条。
2. 使用 `normalized_term` 做精确/前缀召回；不得把 `%`、`_` 或反斜杠解释成客户端可控 SQL 通配符。
3. 同一 `plant_search_documents` 由多个词条命中时只返回一次；同一中文俗名对应多个分类实体时必须保留多个结果，禁止同名直选。
4. 排序优先级：精确匹配优先 → `match_priority` 升序 → 主名称优先 → `preferred_display_name` → `scientific_name` → `taxon_id` 稳定排序。
5. `target_identity_internal_id` 只用于服务端把特定词条定向到已存在的内部身份；公开响应不得暴露内部主键。

## 4. 成功响应

```ts
export type PlantCatalogSearchItem = {
  /** 当前目录事实源的分类实体引用；客户端必须视为不透明引用，不能据其字符串结构推导内部身份。 */
  catalogTaxonRef: string
  displayName: string
  scientificName: string
  taxonRank: string
  taxonomicStatus: string
  selectable: boolean
  hasEncyclopedia: boolean
  hasImage: boolean
  /** 仅当目录行已唯一映射到当前可见的 ACTIVE PlantIdentity 时返回。 */
  plantIdentityRef?: string
}

export type PlantCatalogSearchResponse = {
  items: PlantCatalogSearchItem[]
  truncated: boolean
}
```

`catalogTaxonRef` 当前由目录投影的 `taxon_id` 提供，但合同语义是“目录引用”，不是内部 `plantIdentityRef`，客户端不得把二者等值。

## 5. 与百科和身份的关系

- `hasEncyclopedia=true`：表示可按目录引用进入 SQL 百科读取链；不代表该行已通过青花植身份准入。
- `selectable=true`：表示允许成为识别/手选候选；最终进入用户植物身份仍需走正式确认与内部身份准入规则。
- 若 `plantIdentityRef` 存在，它只是附带的已发布内部身份引用；目录搜索全集仍远大于内部身份全集。
- 展示百科里的养护/环境/病虫害文本不得直接进入 Care/Diagnosis。

## 6. 错误

| 情况 | HTTP | `error.type` |
|---|---:|---|
| `q` 非法或 `limit` 越界 | 400 | `VALIDATION_FAILED` |
| 目录投影不可用 | 500 | `INTERNAL_ERROR` |

错误正文继续使用 `http-api/v1` 稳定错误信封，不泄露 SQL、内部主键或来源凭证。
