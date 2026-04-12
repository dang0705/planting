# 第十六批代码落地: 诊断链承接 user_plant identity 锚点 v1

## 1. 本批目标

在不继续改前端 UI、不改诊断评分主逻辑的前提下，把 `diagnose-http` 的宿主植物读取链正式收口到新的 `user_plant_instances` identity-first 写链上。

本批要解决的核心问题只有一个:

- 当用户从“我的植物”发起诊断时，诊断主链应优先使用 `user_plant_instances.plant_identity_id` 作为 catalog 回查锚点，而不是继续以旧 `plant_id` 心智为主。

## 2. 实际代码改动

### 2.1 修改文件

- `cloudfunctions/diagnose-http/repositories/prior-repository.js`

### 2.2 改动内容

新增 `buildResolvedPlantContext()`，统一把 user plant 和 catalog plant 合并成诊断侧真正使用的 `plantContext`。

`resolvePlantContext()` 现在的读取优先级变为：

1. `userPlant.plantIdentityId`
2. `userPlant.legacyPlantId`
3. `userPlant.plantId`

也就是说，当用户植物实例已经带有新 taxonomy identity 时，诊断链会先用 identity 回查 catalog，不再退回旧 `plant_catalog` 时代的单一 `plant_id` 思路。

### 2.3 新增透传字段

从 `user_plant_instances` 读取到的以下信息，现在会一并进入诊断宿主上下文：

- `plantIdentityId`
- `legacyPlantId`
- `identityResolutionStatus`
- `visualCallBatchId`
- `recognizedName`
- `sourceType`
- `recognitionType`
- `recognitionConfidence`

其中最关键的是：

- `identityResolutionStatus`
- `latestVisualCallBatchId`

这两个字段会继续被 `diagnosis-engine` 和 `session-service` 消费，进入会话锚点与结果快照。

## 3. 行为变化

### 3.1 之前

如果诊断入口来自用户植物实例，`prior-repository` 主要依赖：

- `userPlant.plantId`

然后再回查 catalog。

这意味着当写链已经切成 identity-first，而读链仍把旧 `plant_id` 当第一锚点时，会出现结构性错位。

### 3.2 现在

如果用户植物实例已具备：

- `plant_identity_id`

则诊断读取链会优先使用它。

如果没有，再退回：

- `legacy_plant_id`
- `plant_id`

这样诊断主链与“添加植物”写链就收口到了同一条 identity-first 数据路径。

## 4. 本地校验

已执行：

```bash
node --check cloudfunctions/diagnose-http/repositories/prior-repository.js
```

结果：

- 通过

## 5. 云端部署

已执行 CloudBase 云函数代码更新：

- Function: `diagnose-http`
- Env: `cloud1-2grufevs395a9d5e`
- Action: `updateFunctionCode`

部署请求已成功提交，RequestId：

- `21fc6090-918b-4814-bdb8-f765ff75bd0e`

随后用 `queryFunctions(action="listFunctions")` 做了只读复核：

- `diagnose-http` 最终状态：`Active`
- 最新云端修改时间：`2026-04-06 19:40:29 +08`

## 6. 当前结论

本批没有新增表、没有改 SQL schema、没有改前端界面，只做了诊断宿主上下文的 identity-first 对齐。

这一步完成后，主链状态变成：

1. 添加植物写链：已写入 `plant_identity_id / identity_resolution_status / visual_call_batch_id`
2. 用户植物读取链：已按新 catalog 富化
3. 诊断宿主读取链：已优先承接 `plant_identity_id`

因此，“从识别到入库，再到发起诊断”的植物身份锚点已经在代码层基本对齐。

## 7. 后续建议

下一步应继续推进两件事：

1. 做一次真实登录态下的“添加植物 -> 发起诊断”端到端验收。
2. 继续清理诊断侧剩余旧 `plant_id` 心智的兼容代码，最终把诊断链的公开契约也逐步收口到 identity-first 口径。
