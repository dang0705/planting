# Handoff：微信小程序本地 CloudBase HTTP 云函数免部署调试

## 任务信息

- 任务名：ClickUp 86exqj6ww - 微信小程序本地云函数免部署调试与环境切换
- 创建时间：2026-05-25
- 当前阶段：实现与验证完成，等待最终提交与 ClickUp 状态更新
- 当前结论：已新增小程序优先的本地函数 gateway、前端 API base 切换、生产保护、脚本与文档；微信开发者工具 AppService 运行态已验证本地请求闭环，默认云端路径保持不变。

## Main Agent Dispatch Plan 摘要

```text
任务类型：非简单 CloudBase / 微信小程序 / 本地开发环境切换实现
目标验收契约：
  - 观察入口：微信开发者工具 dist/dev/mp-weixin、local gateway health、diagnose-http health、终端 smoke、mp-weixin build
  - 用户可见成功标准：本地小程序可通过 VITE_API_BASE_URL 请求本机 HTTP 云函数，无需先部署；云端默认路径不变；生产环境不能使用本地或非 HTTPS base
  - 必须验证证据：本地 gateway HTTP 200、诊断 smoke、mp-weixin local/cloud build、H5 build、production fail-fast、touched-file lint
  - 非目标：不改线上函数部署逻辑，不改诊断业务规则，不修改 CloudBase 生产 layer，不提交密钥
选择的 subagent：code_explorer、architect_reviewer、docs_keeper、qa_reviewer
实现闭环：main agent 直接实现；architect_reviewer 做实现前分析与实现后 review
文档同步计划：新增本地调试文档与 README 入口；docs_keeper 只读复核
```

## Subagent 线程复用表

| logical_role | requested_agent_type | actual_agent_type | agent_id/thread_id | 状态 | 说明 |
|---|---|---|---|---|---|
| code_explorer | code_explorer | code_explorer | 019e5f9c-df5f-7972-a2d2-3e976f8e5745 | 已完成 | 只读定位小程序 API 调用链与本地函数边界 |
| architect_reviewer | architect_reviewer | architect_reviewer | 019e5f9c-ff1f-71e2-8da3-8d247fe07357 | 已完成 | 复用同一线程做实现前架构分析和实现后代码 review |
| docs_keeper | docs_keeper | docs_keeper | 019e5fa8-1214-7f71-8233-0af5da91a832 | 已完成 | 只读复核文档覆盖范围 |
| qa_reviewer | qa_reviewer | qa_reviewer | 019e5fab-2dfa-7173-bbd6-d774fc55b223 | 已完成 | 首轮要求补小程序运行态证据；补证后最终 QA 放行 |

## 相关文件

- `src/api/env.js`
- `src/http-functions/core/httpRequest.js`
- `vite.config.js`
- `scripts/dev/cloudfunctions-local-opt-alias.cjs`
- `scripts/dev/install-local-functions.mjs`
- `scripts/dev/local-functions-gateway.mjs`
- `scripts/dev/run-env.mjs`
- `scripts/dev/run-local-api-env.mjs`
- `package.json`
- `README.md`
- `.env.local.example`
- `docs/local-cloudbase-functions-debugging.md`
- `cloudfunctions/diagnosis-history-http/package-lock.json`
- `cloudfunctions/identify-http/package-lock.json`
- `cloudfunctions/plant-user-http/package-lock.json`

## 已完成

- 新增 `VITE_API_BASE_URL` 显式覆盖，支持 loopback/LAN 私网地址本地调试。
- 本地 API base 时不追加 `webfn=true`，不依赖 CloudBase gateway token，注入 development headers 与开发 openid。
- 未设置 `VITE_API_BASE_URL` 时保留原 CloudBase gateway；H5 dev 保留 `/__tcb_functions__` 代理。
- 新增本地 gateway，统一转发 `diagnose-http`、`plant-catalog-http`、`plant-user-http`、`identify-http`、`diagnosis-history-http`、`auth-user-http`、`weather-http`、`storage-http`。
- 新增 `/opt` layer 本地 alias，仅通过 `NODE_OPTIONS --require` 注入，不修改线上函数源码。
- 新增小程序 local/LAN/cloud-dev 脚本、H5 local 脚本、函数依赖安装脚本。
- 新增 `.env.local.example`、README 入口和本地调试完整文档。
- 补齐三个缺失 HTTP 函数 lockfile，使本地函数安装可复现。

## 验证状态

- `node --check vite.config.js && node --check scripts/dev/*`：通过。
- `npx oxlint --quiet src/api/env.js src/http-functions/core/httpRequest.js vite.config.js scripts/dev/...`：通过，132 warnings / 0 errors。
- `git diff --check`：通过。
- `npm run dev:functions:install`：通过；为三个缺失 HTTP 函数生成 lockfile。
- `CLOUDBASE_LOCAL_FUNCTIONS_PORT=3010 npm run dev:functions`：通过启动；验证后已清理 3010、9000-9007 端口进程。
- `curl http://127.0.0.1:3010/__local_functions__/health`：HTTP 200。
- `curl http://127.0.0.1:3010/diagnose-http/health`：HTTP 200，`runtimeSchema.schema=cloud1_dev`，`tableCount=28`。
- `curl http://192.168.50.65:3010/__local_functions__/health`：HTTP 200。
- `TERMINAL_E2E_FUNCTION_BASE_URL=http://127.0.0.1:3010 npm run check:diagnose-smoke -- --skip-auth=true --force-anonymous-auth=true --app-env=development`：通过，final outcome 正常闭合。
- 微信开发者工具 AppService 运行态：
  - `require('api/env.js')` 返回 `BASE_URL=http://127.0.0.1:3010`、`IS_LOCAL_API_BASE_URL=true`、`shouldAppendWebFunctionFlag=false`。
  - 调用编译后的 `http-functions/core/httpRequest.js` 请求 `diagnose-http/health`，实际 `wx.request.url=http://127.0.0.1:3010/diagnose-http/health`。
  - 请求头包含 `x-app-env=development`、`x-env=development`、`x-terminal-e2e=true`、`x-anonymous-dev-identity=true` 和 openid headers。
  - 请求无 `Authorization`，URL 无 `webfn=true`，响应 HTTP 200 / `status=ok`。
- `npm run build:mp-weixin:local-functions`：通过。
- `npm run build:mp-weixin:cloud-dev`：通过，产物保持 CloudBase gateway fallback。
- `npm run build:h5`：通过。
- `VITE_APP_ENV=production VITE_API_BASE_URL=http://127.0.0.1:3000 ... uni build -p mp-weixin`：按预期失败。
- `VITE_APP_ENV=production VITE_API_BASE_URL=HTTP://example.com ... uni build -p mp-weixin`：按预期失败。
- `npm run lint -- --quiet`：未通过；失败点为既有 `cloudfunctions/diagnose-http/*` 的 `no-void` 5 errors，非本次 touched files。

## 文档同步状态

- `README.md`：已补本地云函数调试入口。
- `docs/local-cloudbase-functions-debugging.md`：已补微信小程序、本地 gateway、LAN、H5、云端回退、验证命令、安全边界。
- `.env.local.example`：已补本地调试变量示例，不包含密钥。
- `docs/code-logics/`、`docs/new-rules/`、All-in-One：未涉及诊断规则或代码逻辑词典变更，无需同步。

## 风险与后续建议

- `scripts/dev/local-functions-gateway.mjs` 约 388 行，当前可接受；后续再加功能应拆分为 registry/env/proxy/process-manager。
- 全量 lint 仍受既有 `diagnose-http` `no-void` 错误阻塞；本任务不改该基线。
- 工作区存在无关 staged 删除和未跟踪文件，本次 commit 必须用显式提交范围排除。
- QA 最终结论：可放行 commit 和 ClickUp 状态更新；完整 UI 点击链路未复跑为可接受残余风险，本任务的 AppService 请求层与环境切换目标已闭环。
