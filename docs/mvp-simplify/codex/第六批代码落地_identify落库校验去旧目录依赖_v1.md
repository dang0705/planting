# 第六批代码落地：identify 落库校验去旧目录依赖 v1

## 本批目标

在不重写 `identify-http` 主流程的前提下，先拔掉它最后一个明显的旧目录依赖：

- `recordIdentifySession()` 里对旧 `plant_catalog` 的存在性校验

## 本批实际改动

文件：

- `cloudfunctions/layer/utils/plant-knowledge.js`
- `cloudfunctions/identify-http/app.js`

## 改动内容

### 1. `recordIdentifySession()` 不再查询旧 `plant_catalog`

旧逻辑：

- 收到 `canonicalPlantId`
- 用 SQL 去查 `plant_catalog.plant_id`
- 不存在则清空

新逻辑：

- 直接调用新 catalog 中枢 `getPlantCatalogById()`
- 若命中，统一收口到 `catalogPlant.id`
- 若未命中，再清空

这意味着：

- identify 落库前的有效性校验已经转到新 identity / care 目录口径
- 不再要求新链路继续依赖旧 `plant_catalog`

### 2. `identify-http` 对外补充新身份字段

`pickPlantMatchFields()` 现在额外返回：

- `plantIdentityId`
- `legacyPlantId`

同时保留原有：

- `id`
- `canonicalName`
- `matchAlias`
- `internetName`

这样当前前端仍可以继续按旧字段消费，而后续重构时又已经拿得到新的身份对象标识。

## 本批边界

这一批**不是**完整的 identify 重构。

本批没有做：

- `visual_call_batches`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `plant_identity_resolution_records`
- 新视觉入口运行时裁决

本批只做了一件事：

# **先把 identify 的旧目录校验口径切到新 catalog 中枢。**

## 本批验证

本地已完成：

- `node --check cloudfunctions/layer/utils/plant-knowledge.js`
- `node --check cloudfunctions/identify-http/app.js`

结果：

- 两个文件均通过语法检查

## 当前结论

到本批结束：

- `catalog` 目录查询已切到新 identity / care 表
- `plant-user` 读取已通过新 catalog 做富化
- `identify` 落库前的目录存在性校验，也已经不再依赖旧 `plant_catalog`

当前仍待完整重构的主链，已经明显集中到：

1. `identify-http` 的视觉入口模型本身
2. `diagnose-http` 与 `prior-repository`
3. outcome / route-first / evidence-first 诊断主链
