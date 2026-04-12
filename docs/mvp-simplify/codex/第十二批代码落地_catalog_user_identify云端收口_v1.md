# 第十二批代码落地：catalog / user / identify 云端收口 v1

日期：2026-04-06

## 1. 本批目标

将已经完成本地改造、但云端仍停留在旧共享层版本的 3 条主链函数正式收口到当前基线：

- `plant-catalog-http`
- `plant-user-http`
- `identify-http`

同时确认：

- 三条函数已切换到最新共享层
- 本地代码语法无阻塞
- 当前是否存在可以直接执行的云端验收入口

## 2. 发布前状态

发布前查询结果：

- `plant-catalog-http` 绑定 `layer:38`
- `plant-user-http` 绑定 `layer:38`
- `identify-http` 绑定 `layer:38`

这说明：

- 三条函数仍依赖旧共享工具层
- 尚未收口到 taxonomy-based catalog 与 identify runtime 的当前版本

## 3. 已执行操作

### 3.1 本地语法检查

已通过：

- `node --check cloudfunctions/plant-catalog-http/app.js`
- `node --check cloudfunctions/plant-user-http/app.js`
- `node --check cloudfunctions/identify-http/app.js`
- `node --check cloudfunctions/layer/utils/plant-knowledge.js`
- `node --check cloudfunctions/layer/utils/identify-runtime.js`

### 3.2 共享层绑定更新

已执行：

- `plant-catalog-http -> layer:39`
- `plant-user-http -> layer:39`
- `identify-http -> layer:39`

### 3.3 云函数代码更新

已执行：

- `manageFunctions(action="updateFunctionCode", functionName="plant-catalog-http", functionRootPath="/Users/jay/WebstormProjects/planting/cloudfunctions")`
- `manageFunctions(action="updateFunctionCode", functionName="plant-user-http", functionRootPath="/Users/jay/WebstormProjects/planting/cloudfunctions")`
- `manageFunctions(action="updateFunctionCode", functionName="identify-http", functionRootPath="/Users/jay/WebstormProjects/planting/cloudfunctions")`

## 4. 发布后状态

### 4.1 `plant-catalog-http`

复核结果：

- `Status = Active`
- `Layers = [layer:39]`
- 代码体积已变化，说明平台已接收最新代码

### 4.2 `plant-user-http`

复核结果：

- 已切换到 `layer:39`
- 发布后平台短暂进入 `Updating`
- 当前已完成平台侧代码更新提交

### 4.3 `identify-http`

复核结果：

- 已切换到 `layer:39`
- 发布后平台短暂进入 `Updating`
- 当前已完成平台侧代码更新提交

## 5. 安全规则与访问面复核

对这三条函数只读读取安全规则后，结果一致：

- `aclTag = CUSTOM`
- 规则：`{"*":{"invoke":"auth != null"}}`

结论：

- 三条函数都要求 CloudBase 合法登录身份
- CLI 不能匿名做真实 HTTP 验收

## 6. 网关现状

对这三条函数查询网关访问配置后，结果一致：

- `enableService = false`
- `.service.tcloudbase.com` 默认访问服务未开启
- 当前 `queryGateway.getAccess` 未返回这些函数的默认 HTTP 访问 URL

结论：

- 当前无法通过默认访问服务直接做外部验收
- 仍需依赖小程序真实登录态，或补充专门的 CloudBase 用户凭证链

## 7. 代码契约复核

本批额外复核了前端与这三条函数之间的主要契约，结论如下：

### 7.1 `catalog`

当前前端主要依赖字段：

- `id`
- `canonicalName`
- `imageFileId / imageUrl`
- `internetName`

新 `plant-knowledge` 输出仍覆盖这些字段，未发现会直接打挂页面的字段缺口。

### 7.2 `user-plant`

当前前端 store 主要依赖字段：

- `id`
- `plantId`
- `canonicalName`
- `nickname`
- `displayName`
- `watering / fertilization / sunning / ventilation`

新 `listUserPlantInstances` / `getUserPlantInstanceById` 输出仍保持兼容。

### 7.3 `identify`

当前添加植物页主要依赖字段：

- `name`
- `confidence`
- `matchedPlant`
- `candidates`

本次 `identify-http` 的最小新返回结构仍保留这些字段，同时补充了：

- `sessionId`
- `visualCallBatchId`
- `taxonomyMatchStatus`
- `identityResolutionStatus`
- `routePrimaryAction`

因此前端现有流程不会因为这次后端切换而立刻失效。

## 8. 本批结论

本批可判定为：

- `共享层收口：已完成`
- `代码发布：已完成`
- `平台状态复核：已完成`
- `真实带身份 HTTP 验收：仍受 CloudBase 用户凭证链限制`

也就是说，这 3 条函数现在已经和 `diagnose-http` 一样，进入了：

- `云端代码已收口`
- `共享层已统一`
- `仍待真实登录态请求做最后一跳验收`

的状态。
