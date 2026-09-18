# 小青 Tab 与独立 H5

## 当前边界

小程序入口为 `src/pages/agent/agent.vue`，独立 uni-app H5 源码为 `src/agent-h5/`。`npm run build:agent:h5` 仅构建小青，输出到 `cloudfunctions/agent-http/public/`。不引入新的 npm 依赖。

`agent-http` 是独立原生 HTTP 服务：同域提供 H5 与聊天接口，并把只读业务工具接到青花植正式服务。当前提供文字对话、流式正文、结构化提问、正式问诊题包和用户植物浇水规划；不接入订阅计费、图片上传、写入、删除或提醒创建。

## 身份与接口

| 接口 | 约束 |
| --- | --- |
| `POST /agent-http/ticket` | 通过现有 `user_sessions` 校验小程序登录，创建 60 秒一次性随机票据 |
| `GET /agent-http/agent/index.html` | 静态 H5；票据只放 URL fragment，启动即从地址中移除 |
| `POST /agent-http/session` | 同源检查，原子兑换票据，设置 1 小时 HttpOnly、Secure、SameSite=Strict Cookie |
| `POST /agent-http/message` | 再检查原登录未撤销且用户有效，服务端绑定 Agent 会话，客户端只能提交文字 |

API Key 始终留在服务端。只转发 `agent_message_chunk` 正文，不转发思考、工具参数、上游原始错误、会话编号。客户端无权传入 Agent 会话编号。每次请求最多 2000 字、60 秒、64 KiB 回复；这些是技术边界，不是订阅额度或最终成本保证。停止按钮中断当前连接；是否停止上游模型计费需平台另行验证。

`agent_web_sessions` 只保存票据及会话摘要、父登录摘要、期限、服务端会话关联和并发锁。复用原登录表身份，不向其中混入 WebView 票据。小青额度复用 `users.usage_chatToday`，不新增表；每次 `/message` 在调用模型前由服务端条件更新预扣，达到阈值直接返回 429，前端禁用输入只是展示层配合。过期行需按 `expires_at` 定期清理；当前未新增定时任务。

## 发布包与配置

发布范围为 `cloudfunctions/agent-http`（含构建后的 `public/`）、共享层中身份票据/CloudBase/用户配额调用导出，以及已存在的正式 `diagnose-http`、`plant-user-http` 函数兼容变更。使用 HTTP 函数、Nodejs18.15、端口 9000、建议超时 70 秒，启动脚本 `scf_bootstrap`。绑定能提供 `/opt/utils/cloudbase`、`/opt/utils/platform-session`、`/opt/utils/http`、`/opt/utils/http-identity-ticket` 与 `/opt/utils/quota` 的现有共享层，并验证其导出与本地合同一致。

服务端配置：

- `APP_ENV=development`，数据库相关环境变量明确指向 `cloud1_dev`。
- `SESSION_TOKEN_SECRET` 必须与现有登录服务一致，通过安全环境注入。
- `AGENT_API_KEY` 或 `CLOUDBASE_AI_API_KEY`：已经验证具有该 Agent 调用权限的服务端凭证。
- 现有数据库 SDK 所需凭证，仅在服务端注入；不得直接复制无关函数整套环境配置。
- `AGENT_H5_ORIGIN`：H5 实际 HTTPS 地址的 origin，必须精确匹配。
- `AGENT_CHAT_DAILY_LIMIT`：可选的全等级小青每日对话轮次上限；未设置时，免费用户读取共享 `QUOTA_CONFIG.free.chatDaily`（当前为 `20`），基础/高级会员保持原有不限策略。后端和 H5 使用后端下发的同一状态，剩余 20% 时提醒，达到上限后按现有共享额度的 UTC 日界线恢复（北京时间通常为 08:00）。
- `CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY=1` 或 `true` 只允许本地调试，云端不得设置；它会允许非 Secure 的本地 Cookie。

开发环境已在 CloudBase 默认 HTTPS 域名挂载 `/agent-http`，并启用完整路径透传。该默认域名只适合开发：浏览器导航会先显示 CloudBase 风险提示页。正式提供 WebView 前必须绑定已备案的自定义域名，把 `AGENT_H5_ORIGIN` 和前端公开地址一并切换到该域名，再在微信后台把它配置为业务域名。函数对外可达不替代业务鉴权；未经登录的票据接口必须返回 401，网页接口必须验证同源和会话。

回退只撤销新增 `/agent-http` 路由及新函数，不改动原 Agent 和其他函数；新表保留待审核，不自动删除数据。小程序上线前必须完成整条真实链路验收。

## 验证与未完成项

- `unit_fake`：后端票据、并发兑换、登录撤销、真实 HTTP handler 接线、跨用户会话输入拒绝、流式中文分片及内部事件过滤；前端发送去重、停止后迟到片段、失败文案和 URL 边界。
- 额度阀门：后端条件预扣/429 拒绝、前端额度事件、达到上限后的输入禁用均有单元测试覆盖。
- H5 独立构建与微信开发环境构建通过；浏览器验证无票据状态正常显示、发送禁用且无脚本错误。
- `e2e_real_api`：本地链路已验证。完整 LAN 网关启动 `agent-http`，真实微信登录态可签发票据、同源兑换 Cookie，并通过本地服务收到已部署 Agent 的正文事件与 `end_turn`。开发库读写已命中 `cloud1_dev.agent_web_sessions`。
- `automator_live_real_api`：部分验证。微信模拟器已从首页切换到小青 Tab，真实登录后 WebView 成功进入可输入状态；本轮真实 Agent 问答通过同一登录态和本地 HTTP 链路验证，但未在 WebView 内自动点击发送。发送/取消/重进、登录撤销、慢网断流与恢复仍未完成正式 catalog 验收。
- 上线阻断：已备案自定义域名及微信业务域名配置、真实登录 H5 流式会话、正式 Automator 证据，以及用户业务工具的真实调用与跨用户隔离验证。
