# 第十一批代码落地：diagnose-http 部署与云端验收 v1

日期：2026-04-06

## 1. 本批目标

把已经完成本地改造的 `diagnose-http` 正式部署到 CloudBase 当前环境，并完成最小云端验收，确认：

- 共享 layer 已切到新版本
- `diagnose-http` 已使用新代码
- 平台侧 `diagnosis_sessions` 新列能够被这版代码消费
- 找出真实云端验收的剩余阻塞点

## 2. 已执行事项

### 2.1 平台状态复核

当前环境：

- `EnvId = cloud1-2grufevs395a9d5e`
- `Alias = cloud1`
- `Status = NORMAL`

复核结果：

- `diagnose-http` 云函数存在，类型为 `HTTP`
- Runtime 为 `Nodejs18.15`
- 平台最终状态为 `Active`

### 2.2 共享 layer 发布与绑定收口

已发布新共享层版本：

- `layer:39`

说明：

- 用途：承载 taxonomy-based catalog、identify runtime、diagnose runtime 所需共享工具更新

已执行：

- 将 `diagnose-http` 的 layer 绑定从历史混挂收口为仅保留 `layer:39`

最终复核结果：

- `diagnose-http` 当前仅绑定 `layer:39`

### 2.3 云函数代码部署

已执行：

- `manageFunctions(action="updateFunctionCode", functionName="diagnose-http", functionRootPath="/Users/jay/WebstormProjects/planting/cloudfunctions")`

部署后复核结果：

- `diagnose-http.Status = Active`
- `diagnose-http.Layers = [layer:39]`
- 代码体积已变化，说明平台已接收新代码版本

### 2.4 本地发布前检查

已通过：

- `node --check cloudfunctions/diagnose-http/app.js`
- `node --check cloudfunctions/diagnose-http/services/session-service.js`
- `node --check cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
- `node --check cloudfunctions/diagnose-http/domain/result-formatter.js`
- `node --check cloudfunctions/diagnose-http/repositories/prior-repository.js`

## 3. 云端验收过程与结论

### 3.1 默认 HTTP 访问服务域名

查询结果：

- 默认域名存在：`cloud1-2grufevs395a9d5e.service.tcloudbase.com`
- 但 `EnableService = false`

直接访问 `/health` 的结果不是函数代码报错，而是平台级响应：

- `HTTPSERVICE_NONACTIVATED`

结论：

- 当前环境的默认 HTTP 访问服务未开启，不能拿它做外部验收入口

### 3.2 前端实际调用网关

前端当前不是走 `.service.tcloudbase.com`，而是：

- `https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions`

这与以下代码一致：

- `src/api/env.js`
- `src/http-functions/core/httpRequest.js`

直接访问该网关 `/diagnose-http/health?webfn=true` 的结果为：

- `MISSING_CREDENTIALS`

结论：

- 当前网关是可达的
- 但必须附带 CloudBase 合法用户凭证，CLI 不能匿名直测

### 3.3 函数安全规则复核

只读读取函数安全规则后，结果为：

- `aclTag = CUSTOM`
- 规则：`{"*":{"invoke":"auth != null"}}`

结论：

- `diagnose-http` 的调用要求调用方已具备 CloudBase 用户身份
- 因此 `MISSING_CREDENTIALS` 与当前安全规则一致，不是函数代码异常

### 3.4 CloudBase Node SDK 直调尝试

尝试使用 `@cloudbase/node-sdk` 管理员凭证调用 `app.callFunction({ name: "diagnose-http", ... })`

结果：

- 平台返回 `FunctionType parameter is invalid`

结论：

- 当前 `diagnose-http` 是 `HTTP` 类型云函数
- `callFunction` 这条 SDK 入口不适用于该类型的直接验收

## 4. 本批明确收口的事实

这轮已经可以确定：

1. `diagnose-http` 新代码已成功部署到 `cloud1`
2. 共享层已经切换并收口到 `layer:39`
3. 当前平台没有出现部署失败、layer 失配、函数状态异常等问题
4. 当前未完成的不是部署，而是“如何在 CLI 环境中拿到一个合法的 CloudBase 用户凭证以触发受保护 HTTP 函数”

## 5. 当前未完成项

本批未完成的唯一关键验收项：

- 未能从 CLI 发起一条真实受保护请求，因而尚未在云端直接验证：
  - `diagnosis_sessions` 新字段实写
  - `outcome_type / current_route_primary_action / runtime_snapshot_json` 实际落库
  - `diagnosis/start -> diagnosis/answer` 的真实闭环

注意：

- 这不是代码未部署
- 这是当前环境的访问服务开关与 CloudBase 用户鉴权链共同导致的验收入口缺失

## 6. 下一步建议

后续真实云端闭环验收有 3 条可选路径，按推荐顺序如下：

1. 使用真实小程序用户 token 做一次受保护网关请求
   - 成本最低
   - 与线上真实调用方式完全一致

2. 补充 `tcb_custom_login.json`，通过 Node 侧 `auth.createTicket` 生成合法登录票据
   - 可在 CLI 中稳定复现受保护调用
   - 适合后续持续化验收

3. 开启默认 HTTP 访问服务并暴露测试路径
   - 能降低验收成本
   - 但会改变环境对外暴露面，不建议作为当前默认动作

## 7. 本批结论

本批可以判定为：

- `部署：已完成`
- `平台绑定：已完成`
- `云端最小只读验收：已完成`
- `真实带身份写入验收：受 CloudBase 用户凭证链阻塞，暂未完成`

因此，`diagnose-http` 当前已经进入“可继续向前改造，但仍需补最后一跳真实身份验收”的状态。
