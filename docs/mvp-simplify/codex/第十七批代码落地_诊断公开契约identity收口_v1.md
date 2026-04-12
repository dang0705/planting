# 第十七批代码落地: 诊断公开契约 identity 收口 v1

## 1. 本批目标

在不改页面模板、不重做交互的前提下，把诊断链对外暴露的植物锚点语义收口清楚。

这批解决的是一个持续存在的问题：

- 前端和后端长期把 `plantId` 同时当作“用户植物实例 ID”和“目录植物 ID”使用，语义混杂。

第一版不强行删掉 `plantId`，但要把显式字段补齐，让新的 identity-first 链路可以稳定透传。

## 2. 本批改动范围

### 2.1 后端

- `cloudfunctions/diagnose-http/app.js`
- `cloudfunctions/diagnose-http/services/session-service.js`

### 2.2 前端请求/归一层

- `src/http-functions/diagnose/client.js`
- `src/vue-query/diagnose/mutations/shared.js`
- `src/vue-query/diagnosis-history/queries/history.js`
- `src/utils/diagnose-flow.js`

## 3. 后端收口内容

### 3.1 start / answer / result / history 返回显式植物锚点

`diagnose-http` 公开返回体现在补齐以下字段：

- `userPlantId`
- `plantCatalogId`
- `plantIdentityId`
- `latestVisualCallBatchId`
- `plantId` 继续保留作为兼容字段

兼容字段 `plantId` 的口径现在明确为：

- 优先返回 `userPlantId`
- 否则回退 `plantCatalogId`

### 3.2 start 入口显式接受 `userPlantId`

首轮诊断现在显式支持：

- `userPlantId`
- `plantCatalogId`

旧字段 `plantId` 仍兼容，但不再作为唯一语义字段使用。

### 3.3 history 查询显式支持 `userPlantId`

诊断历史查询现在正式支持：

- `userPlantId`

同时继续兼容：

- `plantId`

### 3.4 session-service 对历史项与结果详情补齐身份字段

`listDiagnosisHistory()` 和 `getResultById()` 现在会返回：

- `userPlantId`
- `plantCatalogId`
- `plantIdentityId`
- `latestVisualCallBatchId`

这样历史页、结果详情页和本地诊断缓存就不必继续猜测 `plantId` 到底代表什么。

## 4. 前端请求与归一层收口内容

### 4.1 发起诊断 payload 显式带 `userPlantId`

前端构造诊断 payload 时，现在会主动补：

- `userPlantId`

当前页面仍把 `props.plantId` 传进来，但请求层会把它显式转成 `userPlantId` 发送给后端。

### 4.2 历史查询显式传 `userPlantId`

诊断历史查询层现在会发送：

- `userPlantId`

同时保留：

- `plantId`

这样在旧接口未完全下线前，前后端都能兼容。

### 4.3 归一化结果保留显式身份锚点

`normalizeDiagnosisResult()` 和诊断客户端归一函数现在会保留：

- `userPlantId`
- `plantCatalogId`
- `plantIdentityId`
- `latestVisualCallBatchId`

这样这些字段可以进入：

- 本地诊断 history store
- 诊断结果页/历史页后续渲染
- 后续端到端验收与调试定位

## 5. 这批之后的语义规则

第一版当前推荐口径：

1. `userPlantId`
   表示用户植物实例 ID，是“我的植物 -> 发起诊断”的主入口锚点。

2. `plantCatalogId`
   表示目录 / taxonomy catalog 锚点，用于 catalog 层回查和 problem prior 计算。

3. `plantIdentityId`
   表示正式 identity 中枢 ID，用于 taxonomy / identify / diagnose 的统一身份承接。

4. `plantId`
   仅作为兼容字段继续存在，不再承担唯一正式语义。

## 6. 本地验证

已执行：

```bash
node --check cloudfunctions/diagnose-http/app.js
node --check cloudfunctions/diagnose-http/services/session-service.js
npm exec -- npx uni build -p h5
```

结果：

- 后端语法检查通过
- H5 构建完成
- 构建期间只有 Sass legacy API deprecation warning，无阻断错误

## 7. 云端部署

已执行：

- `manageFunctions(action="updateFunctionCode", functionName="diagnose-http")`

CloudBase 请求号：

- `3bdaa437-311e-4131-a7d8-875057997f82`

随后用 `queryFunctions(action="listFunctions")` 做了只读复核：

- `diagnose-http` 最终状态：`Active`
- 最新云端修改时间：`2026-04-06 20:55:25 +08`

## 8. 当前结论

这批完成后，诊断主链在“公开契约层”的状态变成：

1. 写链已经 identity-first
2. 读链已经 identity-first
3. 对外返回体也开始显式区分 `userPlantId / plantCatalogId / plantIdentityId`

也就是说，现在不只是内部代码在切新框架，接口层也开始停止强化旧 `plantId` 混用。

## 9. 下一步建议

下一步应优先做两件事：

1. 做一次真实登录态下的“添加植物 -> 发起诊断 -> 查看历史/结果详情”端到端验收。
2. 继续清理 `diagnosis-history-http` 这条旧兼容链，避免同一业务存在两套历史输出口径。
