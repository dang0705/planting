---
doc_id: current-system-map
status: current
doc_type: map
owner: main
sync_policy: active
last_verified_date: 2026-07-20
last_verified_commit: working-tree-pest-visual-mode
source_of_truth:
  - package.json
  - src/main.js
  - src/pages.json
  - src/manifest.json
  - src/http-functions/**
  - src/vue-query/**
  - src/pages/**
  - src/utils/**
  - cloudfunctions/**
  - docs/tickets/86exv6fnx-diagnose-question-package.md
  - scripts/**
stale_if_changed:
  - package.json
  - src/pages.json
  - src/manifest.json
  - src/http-functions/**
  - .brvspace
  - cloudfunctions/**
  - docs/tickets/86exv6fnx-diagnose-question-package.md
  - scripts/dev/**
  - scripts/deploy-*.mjs
---

# Current System Map

本文是当前代码事实的最小导航图。它替代冗长版文档作为默认 AI 入口。

## 1. 项目定位

当前项目是 `AI植伴`：基于 uni-app / Vue 3 的植物养护与诊断小程序/H5 应用，后端主要由 CloudBase HTTP 云函数提供。核心业务是：植物识别、图片上传、天气/环境上下文、用户植物档案、诊断问诊、诊断结果、复盘审查与池外视觉候选治理。

## 2. 默认事实源

| 领域                 | 当前事实源                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 前端入口             | `src/main.js`, `src/pages.json`, `src/manifest.json`                                                                                                             |
| 前端诊断页面         | `src/pages/diagnose/diagnose.vue`（统一诊断入口页面）、`src/subpackages/diagnosis/flow.vue`（完整诊断流程）、`src/subpackages/diagnosis/diagnose-flow/**`、`src/subpackages/diagnosis/components/DiagnosePopup.vue` |
| 前端 HTTP 函数客户端 | `src/http-functions/**`, `src/api/env.js`                                                                                                                        |
| Vue Query 数据流     | `src/vue-query/**`                                                                                                                                               |
| 前端诊断归一化       | `src/subpackages/diagnosis/utils/diagnose-result-normalizer.js`, `src/subpackages/diagnosis/utils/diagnose-flow*.js`                                             |
| 诊断统一后端         | `cloudfunctions/diagnose-http/**`                                                                                                                                |
| 诊断路由入口         | `cloudfunctions/diagnose-http/app.js`, `cloudfunctions/diagnose-http/app/http-router.js`                                                                         |
| 诊断主链             | `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`                                                                                                        |
| 结果输出契约         | `cloudfunctions/diagnose-http/app/frontend-response.js`, `cloudfunctions/diagnose-http/domain/result-formatter.js`, `cloudfunctions/diagnose-http/presenters/**` |
| 环境/schema 分流     | `src/utils/runtime-env.js`, `src/api/env.js`, `cloudfunctions/diagnose-http/db/schema-resolver.js`, `cloudfunctions/layer/utils/http.js`                         |
| 本地调试/部署        | `package.json`, `scripts/dev/**`, `scripts/deploy-*.mjs`, `scripts/security/check-no-secrets.mjs`                                                                |
| BRV/AI 工作流        | `.codex/**`, `.brvspace`, `docs/_sync-map.yml`                                                                                                                   |

## 3. 当前主要模块

### 3.0 Automator v3 运行边界

- 正式端上 QA 使用持久测试 profile 与固定 QA 端口 `9421/9422/9424/3799/3011/9100-9107`，不接触日常 `9420`、日常 profile 或日常 DevTools 进程；9424 仅用于 QA 原生认证状态重绑定并受主进程/profile/参数所有权校验；运行平面、构建镜像、manifest、owner、lease 和截图证据均由 QA-owned 状态管理。
- 启动 readiness 不只检查端口：QA 主进程必须使用系统安装的原生 DevTools executable/package，并带有 QA-owned、来源哈希可核验的扩展快照 `--load-extension=<QA extension snapshot>` 和对应 `--custom-devtools-frontend=<snapshot>/inspector`，再在同一 QA profile、原生 bundle 和 owner 进程树中观察到真实 `--extension-process`；profile 内的 `WeappPlugin` 不再作为扩展事实源。QA CLI 副本只作为隔离 HOME 下的 `open`/`quit` 路由适配器，不能成为 runtime executable/package。只有 manifest、`devtools_page`、`inspector` 目录、快照 marker、源哈希和扩展子进程全部成立才可进入 ready；QA 还必须在项目打开前通过固定 9424 的 QA-owned 原生认证桥接端口调用动态发现的 `getUserInfo/updateUserInfo`，核对原生状态、`userInfo_*` 持久化字段、认证世代和 identity hash；缺少扩展子进程时返回 `qa_extension_load_failed`，原生认证桥接失败时返回有界的 `qa_native_auth_*` 终态，不得把“端口已监听”当作可用。
- 同一微信号的两个 profile 只能通过认证 broker 协调 DevTools 服务端票据，不能把文件夹隔离误认为账号隔离。日常进程必须先通过 PID、进程启动身份、固定 profile、固定 3798/9423 端口、服务 listener 所属和一次性 capability 校验；在票据进入 120 秒窗口时，broker 通过原生日常 DevTools 官方 `Tool.refreshTicket` 让日常 owner 自己续票，再只读观察 profile/session log 并发布同一代 auth generation。QA 只能消费这份共享票据，不能自行调用刷新接口；刷新调用、观察不到新代次或身份变化都会在有界窗口内阻断。两边都关闭后，QA broker 仍可刷新共享票据并保留跨重启登录态。
- 认证模式必须区分：未由受控启动器持有 owner/capability 的日常进程是 `native_daily_read_only`，只允许安全观察；由受控启动器启动、且服务 listener 与固定端口均通过校验的日常进程是 `managed_daily_single_writer`，可通过官方 `Tool.refreshTicket` 完成持续刷新；`qa_only_shared_refresh` 只证明两边关闭后的重启复用。三者不能互相冒充。
- 认证 broker 的写入来源只有受控 `daily`、明确的 `broker_observed_daily` 观察发布和 `qa-auth-broker` 内部刷新；旧的模糊 `broker`/legacy profile 扫描路径已被拒绝，避免从不明 profile 选票或把只读观察当成正式写入。
- 端上“拉起即用”的最终放行仍需以当前 generation 的冷启动、真实 `wx.request`、有效 PNG、重复截图和 catalog live 叶子证据为准；unit、构建或旧截图不替代正式 runtime 证据。
- 具体稳定性门是 3 次完整冷启动压力、同一 generation 的 5 个 warm `qa-run`，以及当前 catalog 每个 live 叶子连续 3 次 `qa-run`；warm/live preflight 必须不超过 15 秒，且不得发生重建、重开 DevTools 或恢复。
- 3 次冷启动只是一道短门禁；最终可靠性门采用分层证据：20 次完整真实冷启动，每次检查首张有效 PNG、真实 `wx.request`、identity 和清理状态；随后在一个新 generation 上执行 1000 次快速 control-plane probe，连续检查 supervisor、lease、profile owner、固定端口、manifest、LAN owner 和 identity 不漂移。1000 次 probe 通过单个有界 Node 批处理执行，不为每次 probe 重启进程或扫描全量进程表。20 次真实冷启动与 1000 次快速 probe 必须全部通过，不能把快速 probe 冒充冷启动；真实冷启动单轮不超过 5 分钟，快速 probe 阶段不超过 10 分钟，整个可靠性门不超过 45 分钟。
- 同号并行也有独立短门和持续门：先执行 3 次启动采样，再在受控日常单写入者 + QA 同时运行期间执行固定 30 分钟、至少 300 次控制面采样。profile realpath、端口和 owner PID 必须持续稳定，identity hash 必须一致，认证代次只能由 broker 单调刷新且 QA 必须持续来自 `broker_effective_shared`；原生日常进程、过期票据、身份变化或无法证明 owner 时只能阻断。
- 同号并行证据还必须证明 QA 的有效票据来源是 `broker_effective_shared`；QA profile 中的旧缓存不能替代运行时消费路径证明。
- 认证消费回执的 120 秒新鲜窗口只用于认证并行阶段的启动采样；同一 supervisor generation 的 warm/live 叶子可复用回执，但必须逐叶绑定同一 QA PID、进程启动身份、profile、identity hash、认证代次和 ticket hash，且消费时间不得晚于该叶子捕获时间。这样长套件不会因墙上时间经过而制造假失败，也不会接受旧进程或旧票据。
- 长 live/soak 阶段不再要求单张认证票据静态覆盖整个阶段；启动时仍要求票据新鲜且日常 owner、capability、identity 均可验证。若预计会过期，broker 必须在 120 秒窗口内调用原生日常 owner 的官方 `Tool.refreshTicket`，并在最多 15 秒内观察到更高 auth generation，再在 30 秒窗口内观察到同号 QA 的精确消费回执；identity、日常 owner、代次回退、端口 ownership 或消费未出现都会立即阻断。live/soak 报告必须包含 `auth_watchdog.status=passed`，不能把“允许续期”当成“已经续期”。
- 5 个 warm 叶子不代表全部业务覆盖；正式放行前还必须执行 `npm run qa:automator:live-matrix -- --allow-live ...`，逐一验收 catalog 当前全部 `automator_live_real_api` 叶子。live 集合由 catalog 动态决定，不能再把数量写死。diagnostic 叶子必须单独报告，不能计入 live 通过。
- catalog live 集合也不等于全功能覆盖。`test/e2e/automator/business-coverage.json` 独立登记 `src/pages.json` 的全部注册页面和关键业务能力，并要求每个页面对应 live/diagnostic 证据；日历、提醒、光照保存回传、植物详情三模式等未形成闭环时必须保持 `blocked`，最终门禁拒绝 `status=incomplete`，不能通过增加或重复已有叶子掩盖漏测。
- 最终放行必须再执行 `npm run qa:automator:final-gate -- --dispatch-run-id=<同一dispatch-run-id> --run-instance-id=<本次执行实例> --auth-report=<...> --cold-start-report=<...> --warm-report=<...> --live-report=<...> --soak-report=<...>`。它只接受同一 dispatch run、同一 run instance 下的 5 份机器报告，并再次核对 3 次同号采样、3 次短冷启动、5 次 warm、当前全部 live 叶子各 3 次重复执行，以及可靠性门的 20 次真实冷启动 + 1000 次快速 control-plane probe；还必须核对 live/soak 的认证续期 watchdog 没有失败。每次 preflight 的首张截图都必须在第 1 次 worker 尝试成功，发生截图重试即阻断，不得用第二次成功冒充首次成功。任何旧报告拼接、恢复/重建/重启、无效 PNG、缺少真实 `wx.request` 或清理失败都会阻断。
- 正式 suite 必须由 `npm run qa:automator:v3-suite -- --allow-live --dispatch-run-id=<唯一dispatch-run-id>` 编排。full 模式先快速校验业务覆盖清单，发现注册页面或关键能力未覆盖就立即 `blocked`，不消耗 30 分钟认证连续采样和可靠性门；需要单独取得基础设施证据时使用 `--infra-only`，它仍执行认证、3 次短冷启动、5 次 warm、20 次真实冷启动和 1000 次快速 probe，终态只能是 `diagnostic_passed`，不得宣称拉起即用。通过业务快门后，full suite 才在同一 run lease 下执行两条证据链，最终 Gate 仍要求全部同时通过。任何阶段失败立即写出 blocked 终态并释放 lease，不从旧轮次拼接报告。单 runner 仍可用于排障，但不构成最终放行证据。
- final gate 不只核对报告数量：manifest 中的 live 清单必须与当前 catalog 的官方 `automator_live_real_api` 集合完全一致；每个 warm/live 记录必须回指对应 `catalog_id`、`automator_live_real_api`、`persisted_real_wechat` 和非 diagnostic mutation policy；每次真实 `wx.request` 必须明确 `identity_required=true` 且 `identity_resolved=true`。PNG 证据还要通过 CRC、IHDR、IDAT 和 IEND 完整性校验，正式记录、截图和五份报告必须真实落在 `.tmp/dispatch-task/<dispatch-run-id>/qa-runs/<run-instance-id>/` 与 `.tmp/dispatch-task/<dispatch-run-id>/qa-artifacts/<run-instance-id>/` 下。
- live 业务叶子的每一张截图也必须写入 `screenshot_attempts`，并与 `screenshots` 一一对应；每张图只能有一次 worker 尝试且第 1 次成功。业务截图第 2 次重试得到 PNG 时，live matrix 和 final gate 都阻断，不能把启动预检的首次成功与业务叶子的重试混为一谈。

### 3.1 前端

- `src/pages/index/index.vue`：首页，植物卡水滴 icon 点击打开浇水提醒弹框（不再跳转日历页）。
- `src/pages/index/components/WateringReminderSheet.vue`：浇水提醒底部弹框，含上次浇水入口、建议下次浇水 Summary、添加至日历主操作；点击上次浇水打开二级日期选择器（复用 `CareBehaviorTimeline`）。已保存提醒会回显上次设置时间和下次浇水建议。
- `src/pages/diagnose/diagnose.vue`：诊断 Tab 的统一入口页面，直接挂载照片/无图症状入口；微信继续进入完整诊断流程，抖音/小红书在同一页面按能力表显示中性提示。
- `src/subpackages/diagnosis/flow.vue`：完整诊断流程页面，接收植物和诊断模式上下文；受限平台只显示不可用提示，不创建诊断请求。
- `src/subpackages/diagnosis/diagnose-flow/**`：完整诊断内核，负责模式选择、图片、视觉请求、方向选择、题包交接、补拍和结果状态；所有可见题包统一由公共题包页承接。
- `src/subpackages/diagnosis/question-package.vue`：黄叶、发蔫或下垂及 1～2 题动态虫害包的公共答题页；题包只按整包 `answer_submit` 提交。
- `src/subpackages/diagnosis/components/DiagnosePopup.vue`：可复用的 BottomSheet 诊断容器，保留 open/close/reset、植物上下文和弹窗生命周期；当前首页植物卡片和植物详情入口直接导航到 `subpackages/diagnosis/flow`，不在主包创建该弹窗。
- `src/subpackages/diagnosis/result.vue`：诊断历史的只读结果承接页；不与新诊断入口页混用。
- `src/pages/reminder/reminder.vue`：五项 tab 中的提醒页；加载真实用户植物，并分别复用 `WateringReminderSheet` 与 `FertilizationMonthlySheet` 完成浇水、施肥提醒入口和保存后刷新。
- 诊断延续页与相关目录：历史命名不定义当前产品口径，当前以问诊题包与结果展示理解。
- `src/subpackages/review/diagnosis-review.vue`：诊断审查分包页面。
- `src/subpackages/review/out-of-pool-review.vue`：池外视觉候选和代理映射审查分包页面。
- `src/http-functions/core/httpRequest.js`：统一 HTTP 云函数请求封装。
- `src/subpackages/diagnosis/http-functions/diagnose/client.js`：诊断主链、结果、历史、反馈、SSE 客户端。
- `src/subpackages/diagnosis/http-functions/diagnose/diagnosis-review.js`：诊断 review 客户端。
- `src/subpackages/diagnosis/http-functions/diagnose/out-of-pool-review.js`：池外候选治理客户端。
- `src/http-functions/storage/client.js`：诊断图片上传/删除客户端。

### 3.2 后端 CloudBase HTTP 函数

| 函数                     | 当前职责                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagnose-http`          | 统一诊断主链、问诊题包、结果、历史、反馈、review、池外候选，含 `/diagnose` 入口路径。                                                                                                                                                                                                                                                                                                                                                             |
| `storage-http`           | 诊断/植物图片上传、临时 URL、图片删除，图片后缀有 allowlist。                                                                                                                                                                                                                                                                                                                                                                                     |
| `identify-http`          | 植物识别，当前通过百度视觉识别能力取候选。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `weather-http`           | 当前天气与环境天气窗口，支持 `/weather/current`、`/weather/environment-context`、`/weather/v7/environment-context`、`/weather/health`、`/weather/recent` 与 `/weather/ingestion/recent-10d`。天气窗口采用双层缓存：D0 从当天 `days/{date}.json.latestSample` 读取，D-1~D-10 从 `recent-10d.json` 读取；D0 now 由定时 QWeather 采样维护，诊断请求不现场调用和风。`plantFeatures.weatherLightFactor10d` 参与 light 估算；任一层未命中时按来源字段降级，`historicalDays` 可为空。 |
| `plant-catalog-http`     | 植物目录列表、详情、名称映射。                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `plant-user-http`        | 用户植物实例 CRUD，含 `/user-plants/watering-planner` 浇水规划器接口（接收 10 天浇水事件集合 + 天气数据，返回 nextWaterDate 等），以及 `/user-plants/watering-reminders` 日历创建后的提醒读写接口。                                                                                                                                                                                                                                               |
| `auth-user-http`         | 微信登录、手机号绑定、用户资料更新、AI quota/权限等用户能力。                                                                                                                                                                                                                                                                                                                                                                                     |
| `wechat-identity`        | 微信 openid/unionid 相关身份桥接。                                                                                                                                                                                                                                                                                                                                                                                                                |
| `wechat-phone`           | 微信手机号解密/桥接。                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `diagnosis-history-http` | 已退役；仅保留 health，其他未公开路径返回 404；历史、结果、反馈改由 `diagnose-http` 提供。                                                                                                                                                                                                                                                                                                                                                         |
| `layer`                  | 共享 CloudBase、HTTP、运行环境、LLM、配额、植物知识工具，含 `watering-planner.js`（浇水规划器纯计算模块，diagnose-http 与 plant-user-http 共用）。                                                                                                                                                                                                                                                                                                |

## 4. 当前诊断主链

统一入口：

```text
cloudfunctions/diagnose-http/app.js
→ cloudfunctions/diagnose-http/app/http-router.js
→ handlers/*
→ app/*-runner.js
→ domain/diagnosis-engine.js
→ presenters / frontend-response
```

核心 HTTP 路由：

```text
GET  /health
POST /diagnosis/start            # streamVisualDecision=true 时返回视觉阶段 SSE
POST /diagnosis/question/start   # 题包初始化入口；不要从名称反推当前仍是追问
POST /diagnosis/answer           # 题包/问题答案提交；不要按每轮 1 题解释
POST /diagnosis/retake/authorize # 用户确认后创建唯一的三分钟补拍授权
POST /diagnosis/retake/skip      # 风险补拍跳过；以 unknown 结束本次诊断
GET  /diagnosis/result
GET  /diagnosis/history
POST /diagnosis/feedback
GET  /diagnosis/review/list
GET  /diagnosis/review/images
GET  /diagnosis/review/detail
POST /diagnosis/review/import
GET  /visual/out-of-pool/list
GET  /visual/out-of-pool/image
POST /visual/out-of-pool/review
GET  /visual/out-of-pool/proxy-mappings/list
POST /visual/out-of-pool/proxy-mappings/upsert
POST /visual/out-of-pool/proxy-mappings/disable
POST /stream/diagnose
POST /diagnose
```

## 5. 当前运行时关键事实

- 诊断运行时已是 route/outcome 主导，不应以历史排序文档当当前事实。
- `visibleOutcomes` 是前端可见结果的首要出口；`primaryOutcome` / `secondaryOutcomes` 仅为历史回读来源，不应作为新契约中心。
- AI 视觉结果只能通过全局 `resolveDiagnosisModeRoute` 进入症状模式；页面和 handler 不得各自判断模式，也不得直接相信模型输出的模式名称。
- 全局模式注册表用 `requiresAiInitialAssessment` 区分入口：`yellow_leaf`、`wilting_droop` 保持无图手工直入；八种具体虫害必须先经过 AI 视觉。`pest` 只作为诊断 profile/上位分类，不是用户可见的泛虫害题包。
- 诊断 tab 未绑定植物时使用匿名诊断会话；可用用户位置读取天气背景，但不会把匿名占位 ID 当成用户植物执行资料更新。
- 虫害直判和题包结果允许同时保留多个 `visibleOutcomes`；动态虫害题包为 0～2 题，正式接纳的视觉证据锁定为正向证据并隐藏同组重复题。
- 补拍建议不会自动开始计时；只有用户在同一确认框阅读风险说明、安全步骤和三分钟截止后确认，服务端才创建一次三分钟授权。过期返回 `RETAKE_WINDOW_EXPIRED` 并把会话终止为 `ended_retake_timeout`，旧会话不可恢复。
- “不敢操作 / 跳过”由服务端持久化为 `skipped_unknown`，值为 `unknown`，不会当成“没有虫”；会话以不确定结果结束，只能重新诊断。授权和跳过的网络重试不会重置原三分钟时间。
- 视觉 Prompt 采用稳定静态前缀和动态尾部；不提供逐虫虫体形态描述，模型先独立识别当前图中的虫体或叶内潜道，再按当前器官映射模式与直接证据键；细网、点状白黄伤痕、银白擦伤、同区针尖黑点和叶内潜道等非虫体异常仍在动态尾部说明；`full/pest`、首次/补拍共用静态前缀，补拍只分析新图并通过正式证据摘要与 `originVisualCallBatchId` 衔接前一批证据。
- 合法且器官匹配的具体虫害 `mode_candidates` 在置信度 `>=0.90` 时会作为独立实体候选继续进入 route；不能因同次返回未带重复的正式症状键而被丢弃，且不会被改写成并不存在的正式症状。低置信、profile 不匹配或器官不匹配候选仍会过滤；单独的 `yellow_speckling` / `stippling` 不能把结果推为 `spider_mite`。
- 视觉流式入口仍复用 `/diagnosis/start`：只有 `streamVisualDecision=true` 才使用 `context.sse()`；前端以单个 chunked 请求接收 `visual_*` 生命周期事件和唯一 `done`，失败时不得再重放一次普通诊断。SSE 建立后先发送不承诺会话或模型已启动的 `visual_preparing`；单图模型首个非空内容到达时最多补发一次不含模型内容的 `visual_model_response_started`。模型 JSON、机器键和提示词不得进入进度文案。TokenHub 视觉请求仅在有稳定 system 静态前缀时发送由契约版本、模型和静态前缀哈希组成的全局 `prompt_cache_key`，让所有诊断共用该静态前缀缓存；动态尾部、图片、用户和会话信息不得进入该键。存在服务端诊断会话时，另发送由不可逆摘要生成的 `X-Session-ID` 仅作同会话实例亲和，且不参与缓存键。缓存是否命中只看服务商 usage 的 `cached_tokens`，不从三分钟倒计时或耗时推测；TokenHub Chat 的“创建量”为零不能单独判为失败。模型链路的 `firstByteMs` 与 `firstContentMs` 分别记录首字节和首个可见内容。
- 诊断图片在上传前按 `1,638,400` 像素上限和 32 像素网格做物理缩放，不放大小图；随后按 Q72 起步压缩且不低于 Q68。视觉 token 由最终像素规模主导，不能用 JPEG 文件大小代替；原始/输出尺寸、像素数和估算 Qwen 视觉 token 会随请求进入审计链路。
- 2026-06-06 最新题包口径：当前不存在“追问”，也不再以“每轮最多 1 题”作为产品/UX 契约。
- `maxQuestionsPerRound: 1` 及相关历史参数/命名即使在实现中可见，也只能视为实现细节或历史命名，不能覆盖当前题包口径。
- 问诊题包是当前任务口径；黄叶 4 题是已知历史题包形态之一，不再作为题包长度或题包场景上限。
- `wilting_droop` 是当前固定题包模式之一，source mode 为 `manual_wilting_droop_route_package`，由手动枯萎/发蔫入口返回 5 题 package：Q0 为 `CareBehaviorTimeline` 浇水时间线，Q1-Q4 覆盖发蔫形态、节律/环境、近期应激和高危异常。
- `wilting_droop` 整包提交后的终端 resolver 可产出多个 `visibleOutcomes`，并返回轻量冲突动作解释、`highRiskWarning` 与 `observationPeriod`；用户结果页口径是“建议行动清单”，不得写成“最可能原因”。
- 固定题包 `answer_submit` 完成后是终止问诊状态；后端不得继续规划 route-planned、forced 或 generic 下一题，响应应进入 final/result 路径。
- route 只保留 outcome/evidence 判定；缺失证据不应进入补问或重试分支，当前路径按终止决策与公开响应收敛。
- 有效 `yellow_leaf` 题包答案必须按同一当前轮次的 package 进行持久化和归属校验；既往队列或锚点实现不再作为包级停止依据。
- 环境上下文当前以 v7 为准，使用 10 天历史窗口与 15 天天气预报窗口参与养护建议。
- `buildWateringPlanner` 已从 `diagnose-http` 抽取到 `cloudfunctions/layer/utils/watering-planner.js` 作为共享纯计算模块；diagnose-http 与 plant-user-http 共用同一实现。
- 浇水规划器新增 `nextWaterDate/nextWaterWindow/nextWaterReason` 输出，WET（偏湿/过浇）时返回 null 阻断浇水，前端禁用"添加至日历"按钮。
- WET 阻断有两条触发路径：浇水次数超限、强偏湿环境独立触发（≥2 种偏湿天气信号 + 有浇水记录）。
- `src/store/plants.js` 的 `completeWatering` 已下线旧前端平均值公式，改写回 planner 产出的 `nextWaterDate`。
- 首页植物卡水滴 icon 不再跳转日历页，改为打开浇水提醒底部弹框。
- 首页浇水提醒先写系统日历；`uni.addPhoneCalendar` 成功后才通过 `plant-user-http/user-plants/watering-reminders` 保存应用内提醒状态。一次性水提醒按 `nextTime` 过期，过期后水滴不再高亮。
- `watering_events_json` TEXT 列用于持久化 10 天浇水事件集合；读写均 try/catch 容错，列不存在时不阻断主流程。
- `diagnosis-history-http` 已下线；历史、结果、反馈通过 `diagnose-http`。

## 6. 环境与 schema

| 场景                             | 值                                                           |
| -------------------------------- | ------------------------------------------------------------ |
| development / dev / local / test | `cloud1_dev`                                                 |
| production / prod                | `cloud1-2grufevs395a9d5e`                                    |
| 前端默认 CloudBase envId         | `cloud1-2grufevs395a9d5e`，可由 `VITE_CLOUDBASE_ENV_ID` 覆盖 |
| 本地 API base                    | `VITE_API_BASE_URL`，生产环境禁止本地或非 HTTPS base URL     |
| 请求环境头                       | `x-app-env` / `x-env`                                        |

## 7. 本地与发布入口

最小常用命令见 `docs/RUNBOOK.md`。不要直接复用历史 handoff 命令作为当前发布入口。

## 8. 不是当前事实源的材料

以下材料默认不作为当前事实：

```text
docs/new-rules/planting_ai_diagnosis_all_in_one.md
docs/route规划及outcome瘦身计划/**
docs/ai-runs/**
docs/ai-tasks/**
.brv/review-backups/**
.brv/dream-log/**
BRV superseded facts
```

这些材料只能在明确需要历史原因、原始规则溯源、既往方案比较时按索引读取。

## 9. 当前题包任务指针

最新问诊题包任务使用 `docs/tickets/86exv6fnx-diagnose-question-package.md` 作为极简需求指针。该指针用于使“追问 / 每轮 1 题”口径失效；实现事实仍必须回到当前代码、测试、schema 和提交 diff 验证。
