# 第四批代码落地：plant-catalog 身份中枢切换 v1

## 本批目标

- 把 `plant-catalog-http` 背后的目录查询正式从旧：
  - `plant_catalog`
  - `plant_aliases`
  - `genus_care_profile`
- 切到新第一版基线：
  - `plant_identity_entities`
  - `plant_identity_aliases`
  - `genus_care_profiles`

同时保持对前端现有页面壳的最小影响，不提前改 `add-plant`、首页植物卡片和 AI 识别弹窗的字段消费方式。

## 本批实际改动

文件：

- `cloudfunctions/layer/utils/plant-knowledge.js`

本批没有改 `cloudfunctions/plant-catalog-http/app.js` 的路由壳，因为 HTTP 入参与返回包装本身已经足够薄，只需要替换底层查询实现。

## 查询口径调整

### 1. `listPlantCatalog`

原来从旧目录表直接查。

现在改为：

- 主表：`plant_identity_entities`
- 别名聚合：`plant_identity_aliases`
- 养护挂接：`genus_care_profiles`
- 挂接键：`genus_name + family_name_canonical`

并且搜索口径也同步切换到新字段：

- `primary_display_name`
- `canonical_identity_name`
- `canonical_identity_name_cn`
- `canonical_identity_name_en`
- `scientific_name`
- `plant_identity_aliases.alias_name`

### 2. `getPlantCatalogById`

现在支持两类查找键：

- `legacy_plant_id`
- `plant_identity_id`

这样做的原因是：

- 现有前端与 `plant-user-http` 仍主要沿用旧 `plantId`
- 新框架内部又需要逐步过渡到 `plant_identity_id`

本批先兼容两种入口，不在这里强推全链切换。

### 3. `findCanonicalPlantMatch`

AI 识别后的名称匹配也已经改成基于新 identity / alias 表完成。

当前评分逻辑保持轻量：

- 精确别名命中：`4`
- 精确主字段命中：`3`
- 模糊别名命中：`2`
- 模糊主字段命中：`1`

这不是最终版 identity resolution 规则，只是 catalog / identify 过渡阶段的兼容命中策略。

## 对外兼容策略

本批最关键的执行口径是：

# **底层换新表，对外先保留旧字段名。**

`mapPlantRow()` 现在会把新表字段映射回旧前端仍在消费的字段：

- `id`
- `plantId`
- `canonicalName`
- `aliasNames`
- `latinName`
- `imageFileId`
- `plantDesc`
- `categoryCn`
- `categoryEn`
- `genus`
- `familyEn`
- `watering`
- `fertilization`
- `sunning`
- `ventilation`
- `temperatureMin`
- `temperatureMax`
- `humidityMin`
- `humidityMax`

同时额外补出新语义字段，供后续重构继续接入：

- `plantIdentityId`
- `legacyPlantId`
- `scientificName`
- `familyCn`
- `identityLevel`
- `identityReviewStatus`

## 关键兼容裁决

### 1. `id` 继续优先返回 `legacy_plant_id`

原因：

- 现有 `add-plant` 链路还会把选中的 `id` 继续传给旧 `plant-user-http`
- 如果这里直接改成 `plant_identity_id`，会把未重构的用户植物主链一起打断

当前返回规则：

- 优先 `legacy_plant_id`
- 否则回退 `plant_identity_id`

### 2. `internetName` 暂时回退到学名口径

新正式 identity 表没有旧 `internet_name` 字段。

本批采用最小兼容方案：

- 若 `scientific_name != canonicalName`，则 `internetName = scientific_name`
- 否则返回空字符串

这样至少不会破坏 `add-plant` 页里 AI 识别候选名称的展示逻辑。

### 3. 养护 JSON 直接复用新 `genus_care_profiles`

由于当前 `genus_care_profile.csv` 的 JSON 结构仍与旧前端消费方式兼容，例如：

- `watering.way`
- `light.way`

因此本批不再额外新增前端适配层，而是在知识层直接把：

- `watering_strategy_json`
- `fertilizing_strategy_json`
- `light_strategy_json`
- `airflow_strategy_json`

映射回原来页面已经在读取的字段名。

## 本批验证

本地已完成：

- `node --check cloudfunctions/layer/utils/plant-knowledge.js`
- `node --check cloudfunctions/plant-catalog-http/app.js`

结果：

- 两个文件语法检查均通过

本批还没有做：

- 云函数部署
- 真实 HTTP 调用联调

原因：

- 当前只切 catalog 中枢，`plant-user-http / identify-http` 还没同步重构
- 先在本地把兼容边界稳定下来，再推进下一批更合适

## 当前结论

到本批结束：

- `plant-catalog-http` 的目录查询语义已经正式转向新 identity / care 底座
- 但对前端现有壳仍尽量保持了旧字段契约
- 这使得下一步可以继续进入：
  - `plant-user-http`
  - `identify-http`

而不用再回头处理 catalog 的旧表依赖

## 下一步建议

下一批优先处理：

1. `plant-user-http`
2. `identify-http`

建议顺序是先 `plant-user-http`，因为：

- 它仍直接写旧 `plant_catalog` 语义
- 当前 catalog 已经开始返回新旧兼容对象
- 用户植物实例侧如果不跟上，后面前端“选植物 -> 落用户植物”的链路会继续被旧模型拖住
