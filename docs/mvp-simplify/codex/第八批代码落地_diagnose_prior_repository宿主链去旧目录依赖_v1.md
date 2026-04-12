# 第八批代码落地：diagnose prior-repository 宿主链去旧目录依赖 v1

## 本批目标

把 `diagnose-http` 中最直接依赖旧目录表的宿主先验入口拆掉。

本批不重写诊断引擎本身，只处理：

- `prior-repository.resolvePlantContext()`

## 本批实际改动

文件：

- `cloudfunctions/diagnose-http/repositories/prior-repository.js`

## 改动内容

### 1. 不再在 `prior-repository` 里直接 join `plant_catalog`

旧逻辑：

- 查 `user_plant_instances`
- 再 `LEFT JOIN plant_catalog`
- 直接从旧目录表取：
  - `genus`
  - `family_en`
  - `category_cn/category_en`

新逻辑：

- 用户植物场景：直接调用 `getUserPlantInstanceById()`
- 若需要更完整的宿主背景，再调用 `getPlantCatalogById()`
- 目录植物场景：直接调用 `getPlantCatalogById()`

这样做之后，`diagnose-http` 的宿主上下文获取已经转到新 catalog 中枢。

### 2. 宿主上下文字段保持兼容

`resolvePlantContext()` 当前仍返回诊断侧已在使用的这些字段：

- `userPlantId`
- `plantId`
- `plantDisplayName`
- `genus`
- `family`
- `category`

本批额外补出：

- `plantIdentityId`

供后续 diagnosis 主链继续往新 identity 语义迁移。

## 本批意义

这一步虽然不大，但它很关键：

# **diagnose 的宿主先验入口，已经不再自己读旧目录表。**

也就是说，后面 diagnosis 再往新框架迁移时：

- 宿主背景
- genus / family / category
- 植物展示名

都已经可以统一从新 catalog 中枢获得，而不是在 diagnosis 模块里继续复制一套旧 SQL。

## 本批验证

本地已完成：

- `node --check cloudfunctions/diagnose-http/repositories/prior-repository.js`

结果：

- 语法检查通过

## 当前结论

到本批结束，`diagnose-http` 还没有完成主链重构，但至少：

- catalog 目录读取已切新
- plant-user 读取已切新
- identify 最小视觉入口对象层已落库
- diagnose 宿主先验入口也已经不再直接绑旧 `plant_catalog`

## 下一步建议

下一批应继续推进 diagnosis 主链，优先级建议：

1. `session-service / diagnosis_sessions` 如何正式挂 `current_plant_identity_id`
2. `runDiagnosisRound` 如何接受新的宿主身份上下文
3. `route_primary_action -> outcome 三类` 的主链收口
