# 第十五批代码落地：用户植物 identity 写链与 cloud1 静态基线补齐 v1

日期：2026-04-06

## 1. 本批目标

把“加植物”这条写链从旧 `plant_catalog` 心智正式推进到第一版新 identity 中枢，并把当前环境 `cloud1` 补到能承接这条链的最小静态基线。

本批同时收口两类问题：

- 本地代码里，`add-plant -> plant-user-http -> user_plant_instances` 仍丢失 `plantIdentityId / visualCallBatchId / identityResolutionStatus`
- 云端环境里，`cloud1` 仍缺 `plant_identity_entities / genus_care_profiles / visual_call_batches` 等新表

## 2. 本批代码改动

### 2.1 前端添加植物页保留 AI provenance

文件：

- `src/pages/add-plant/add-plant.vue`

本批新增：

- `identifyContext` 运行时对象
- `handlePlantSelect()`，用于手选目录植物时清空 AI provenance
- `normalizeIdentifyPlantCandidate()`，把识别结果中的候选对象归一到当前 catalog 结构
- `buildIdentifyContext()`，固定保留：
  - `sessionId`
  - `visualCallBatchId`
  - `recognizedName`
  - `recognitionType`
  - `recognitionConfidence`
  - `taxonomyMatchStatus`
  - `identityResolutionStatus`
  - `routePrimaryAction`
- `applyIdentifySelection()`，统一处理“命中目录植物 / 选候选 / 仅用识别名”

提交时不再只发旧 payload，而是按场景带上：

- `plantId`
- `plantIdentityId`
- `legacyPlantId`
- `recognizedName`
- `sourceType`
- `recognitionType`
- `recognitionConfidence`
- `identityResolutionStatus`
- `visualCallBatchId`

### 2.2 后端写链改为 identity-first

文件：

- `cloudfunctions/layer/utils/plant-knowledge.js`
- `cloudfunctions/plant-user-http/app.js`
- `src/store/plants.js`

已完成：

- `createUserPlantInstance()` 支持：
  - `plantIdentityId`
  - `legacyPlantId`
  - `identityResolutionStatus`
  - `visualCallBatchId`
- 写入前会校验 `visual_call_batches` 归属
- 会按 `plantIdentityId -> legacyPlantId -> plantId` 顺序回查新 catalog 中枢
- `userPlants` store 现已保留：
  - `plantIdentityId`
  - `legacyPlantId`
  - `sourceType`
  - `recognitionType`
  - `recognitionConfidence`
  - `identityResolutionStatus`
  - `visualCallBatchId`

## 3. 云端真实发现

本批最重要的实际发现不是代码，而是环境漂移：

- 之前文档和 dev 验收里的新表主要落在 `cloud1_dev`
- 当前真实运行环境 `cloud1-2grufevs395a9d5e` 仍停在旧静态 schema
- `SHOW TABLES` 初查时只有：
  - `plant_catalog`
  - `plant_aliases`
  - `genus_care_profile`
  - `identify_sessions`
  - `user_plant_instances`
  - 一组旧 `diagnosis_*`
- 不存在：
  - `plant_identity_entities`
  - `plant_identity_aliases`
  - `genus_care_profiles`
  - `visual_call_batches`
  - `plant_identity_resolution_records`
  - `visual_raw_image_records`
  - `visual_normalized_image_results`
  - `visual_admission_records`

这意味着如果只继续写代码、不补当前环境，线上函数会持续落在“代码依赖新表，但环境没有新表”的状态。

## 4. 当前环境已执行操作

### 4.1 cloud1 补齐 8 张核心新表

已在当前环境创建：

- `plant_identity_entities`
- `plant_identity_aliases`
- `genus_care_profiles`
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`

执行脚本已落盘：

- `docs/mvp-simplify/codex/第十五批_cloud1静态identity基线与user_plant迁移脚本_v1.sql`

### 4.2 taxonomy / alias / genus care 已导入 cloud1

导入方式：

- 先将原 `tmp/import-sql` 中以 `cloud1_dev` 为目标 schema 的 SQL 批次复制到 `/tmp/cloud1-import`
- 再替换为当前环境 schema `cloud1-2grufevs395a9d5e`
- 使用已有 `run-cloudbase-sql-import.js` 通过 CloudBase SDK 批量执行

实际结果：

- `plant_identity_entities = 192`
- `plant_identity_aliases = 400`
- `genus_care_profiles = 152`

说明：

- taxonomy 12 个批次一次性成功
- genus care 首轮执行时发生 `request timeout`
- 之后把批次改成 `INSERT IGNORE` 后重跑，最终补齐到 `152`

### 4.3 user_plant_instances 已迁移并回填

已新增列：

- `plant_identity_id`
- `legacy_plant_id`
- `identity_resolution_status`
- `visual_call_batch_id`

已新增索引：

- `idx_user_plant_identity`
- `idx_user_plant_legacy`
- `idx_user_visual_batch`

回填时遇到一个真实线上问题：

- 旧 `user_plant_instances` 与新 `plant_identity_entities` 的字符集排序规则不同
- 直接 `JOIN` 会报：
  - `Illegal mix of collations`

最终采用：

- `COLLATE utf8mb4_unicode_ci`

进行显式兼容回填。

回填结果：

- 原有记录 `plant_id = 21`
- 已成功回填到：
  - `plant_identity_id = plant_identity_7db0a6aed246a26a`
  - `legacy_plant_id = 21`
  - `identity_resolution_status = matched`
- 历史脏值 `recognized_name = 'null'` 也已清理为真正的 `NULL`

## 5. 云函数发布收口

### 5.1 发布新共享层

已发布：

- `layer:40`

描述：

- `User plant identity-first write chain and current cloud1 taxonomy baseline sync`

### 5.2 4 条主链函数已统一切到 `layer:40`

已更新层绑定：

- `plant-catalog-http`
- `plant-user-http`
- `identify-http`
- `diagnose-http`

复核结果：

- 4 条函数当前均绑定 `layer:40`
- `plant-user-http` 代码已重新发布
- 平台状态最终回到 `Active`

## 6. 本地校验

已通过：

- `node --check cloudfunctions/layer/utils/plant-knowledge.js`
- `node --check cloudfunctions/plant-user-http/app.js`

说明：

- `src/pages/add-plant/add-plant.vue` 属于 SFC，本批未跑整项目构建
- 当前未做真实登录态端到端写入验收，因为 `plant-user-http` 仍受 CloudBase 身份鉴权约束

## 7. 当前结论

到本批结束，可以认为以下两件事已经同时收口：

1. 本地代码层面，“加植物”提交链已经能承接第一版新 identity 字段
2. 云端环境层面，`cloud1` 已具备承接这条链的最小静态基线与运行时表结构

也就是说，后续继续推进时，不再是：

- “代码已经按新文档写了，但当前环境没有表”

而是已经进入：

- “代码和当前环境都能承接新 identity 写链，只差真实登录态验收与前端实际发布”

## 8. 后续建议

下一步最合理的是：

1. 继续推进真实带身份的 `add-plant -> plant-user-http` 验收
2. 然后处理用户植物详情页 / 首页植物卡片对新 identity 字段的消费
3. 最后再进入诊断首轮里对 `current_plant_identity_id` 的真正实写联动
