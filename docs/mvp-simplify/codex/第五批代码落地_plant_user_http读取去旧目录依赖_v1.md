# 第五批代码落地：plant-user 读取去旧目录依赖 v1

## 本批目标

- 不重建 `user_plant_instances`
- 不提前改前端用户植物页面壳
- 先把用户植物读取逻辑从旧：
  - `plant_catalog`
  - `genus_care_profile`
- 拆到新：
  - `getPlantCatalogById()`
  - `plant_identity_entities`
  - `plant_identity_aliases`
  - `genus_care_profiles`

目标是先完成“用户植物读取侧去旧目录依赖”，保持结构最小改动。

## 本批实际改动

文件：

- `cloudfunctions/layer/utils/plant-knowledge.js`

`cloudfunctions/plant-user-http/app.js` 本身未改，因为它只是对 `plant-knowledge` 的薄封装。

## 本批核心裁决

### 1. 用户植物表暂时不重建

第一版当前阶段，`user_plant_instances` 仍保留旧字段：

- `plant_id`
- `canonical_name`
- `plant_genus`
- `plant_family_en`
- `plant_latin_name`

本批不在这里引入新的 `plant_identity_id` 持久化列。

原因：

- 先把读路径稳定下来更重要
- 如果现在顺手改用户植物表结构，会把 `plant-user / index / plant-detail / diagnose prior context` 一起放大

### 2. 读取改为“实例表 + catalog 富化”

旧实现是直接在 SQL 里：

- `LEFT JOIN plant_catalog`
- `LEFT JOIN genus_care_profile`

本批改为：

1. 先查询 `user_plant_instances`
2. 再按 `plant_id` 调 `getPlantCatalogById()`
3. 用新 catalog 中枢返回的 identity / care 信息回填展示字段

这样做的结果是：

- 用户植物读取已经不再直接依赖旧目录表
- catalog 侧的切换可以被用户植物侧复用
- 同时又不需要马上重做 `user_plant_instances`

## 本批具体变化

### 1. `createUserPlantInstance`

新增一个兼容收口：

- 当调用方传入 `plantId` 时，先通过新 catalog 查到植物
- 最终写入 `user_plant_instances.plant_id` 的值，改为优先使用 `plant.id`

当前 `plant.id` 的返回规则仍是：

- 优先 `legacy_plant_id`
- 否则回退 `plant_identity_id`

这意味着：

- 即便未来有调用方开始传 `plant_identity_id`
- 只要该对象仍带 `legacy_plant_id`
- 当前表里最终仍会优先落旧兼容 ID，减少连锁影响

### 2. `getUserPlantInstanceById`

旧逻辑：

- 直接 join 旧目录表与旧属级养护表

新逻辑：

- 只查 `user_plant_instances`
- 保留最新诊断状态子查询
- 再调用 `getPlantCatalogById(row.plant_id)` 做 identity / care 富化

### 3. `listUserPlantInstances`

旧逻辑：

- 列表 SQL 直接 join 旧目录表与旧养护表

新逻辑：

- 列表 SQL 只查 `user_plant_instances + diagnosis_sessions latest`
- 汇总本页唯一 `plant_id`
- 批量调用 `getPlantCatalogById()` 做页内富化
- 再映射回前端当前仍在使用的展示字段

## 返回结构兼容策略

本批没有改前端 store / 页面壳，所以用户植物返回仍保持当前字段名：

- `id`
- `plantId`
- `canonicalName`
- `nickname`
- `displayName`
- `recognizedName`
- `location`
- `photos`
- `imageFileId`
- `lastWatered`
- `nextWater`
- `createdAt`
- `genus`
- `familyEn`
- `latinName`
- `watering`
- `fertilization`
- `sunning`
- `ventilation`
- `temperatureMin`
- `temperatureMax`
- `humidityMin`
- `humidityMax`
- `varianceLevel`
- `healthStatus`
- `healthScore`

同时补出一个新字段：

- `plantIdentityId`

供后续重构继续往新语义迁移。

## 这一批解决了什么

到本批结束，用户植物主链在“读取和展示”这件事上，已经不再直接依赖：

- `plant_catalog`
- `genus_care_profile`

也就是说：

# **旧目录表现在主要只剩在 `identify` 和部分诊断 legacy 链里还没拔干净。**

## 本批验证

本地已完成：

- `node --check cloudfunctions/layer/utils/plant-knowledge.js`

结果：

- 语法检查通过

本批未做：

- 云函数部署
- 前端联调

## 当前结论

当前可以认为：

1. `catalog` 目录读取已经切到新 identity / care 底座
2. `user plant` 读取也已经跟着切到新 catalog 富化口径

这意味着下一步最该处理的，不再是目录或用户植物读取，而是：

1. `identify-http`
2. `recordIdentifySession`
3. 诊断前置 `prior-repository` 中仍绑定旧 `plant_catalog` 的部分

## 下一步建议

下一批优先改：

- `identify-http`

原因：

- 它仍在把匹配结果写进旧 `identify_sessions.canonical_plant_id`
- `recordIdentifySession()` 里还在用旧 `plant_catalog` 做存在性校验
- 这会继续把视觉入口链绑在旧目录表上
