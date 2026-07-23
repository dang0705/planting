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

| 领域 | 当前事实源 |
|---|---|
| 前端入口 | `src/main.js`, `src/pages.json`, `src/manifest.json` |
| 前端诊断页面 | `src/pages/diagnose/**`, `src/components/diagnose-flow/**`, `src/components/DiagnosePopup.vue` |
| 前端 HTTP 函数客户端 | `src/http-functions/**`, `src/api/env.js` |
| Vue Query 数据流 | `src/vue-query/**` |
| 前端诊断归一化 | `src/utils/diagnose-result-normalizer.js`, `src/utils/diagnose-flow*.js` |
| 诊断统一后端 | `cloudfunctions/diagnose-http/**` |
| 诊断路由入口 | `cloudfunctions/diagnose-http/app.js`, `cloudfunctions/diagnose-http/app/http-router.js` |
| 诊断主链 | `cloudfunctions/diagnose-http/domain/diagnosis-engine.js` |
| 结果输出契约 | `cloudfunctions/diagnose-http/app/frontend-response.js`, `cloudfunctions/diagnose-http/domain/result-formatter.js`, `cloudfunctions/diagnose-http/presenters/**` |
| 环境/schema 分流 | `src/utils/runtime-env.js`, `src/api/env.js`, `cloudfunctions/diagnose-http/db/schema-resolver.js`, `cloudfunctions/layer/utils/http.js` |
| 本地调试/部署 | `package.json`, `scripts/dev/**`, `scripts/deploy-*.mjs`, `scripts/security/check-no-secrets.mjs` |
| BRV/AI 工作流 | `.codex/**`, `.brvspace`, `docs/_sync-map.yml` |

## 3. 当前主要模块

### 3.1 前端

- `src/pages/index/index.vue`：首页，植物卡水滴 icon 点击打开浇水提醒弹框（不再跳转日历页）。
- `src/pages/index/components/WateringReminderSheet.vue`：浇水提醒底部弹框，含上次浇水入口、建议下次浇水 Summary、添加至日历主操作；点击上次浇水打开二级日期选择器（复用 `CareBehaviorTimeline`）。已保存提醒会回显上次设置时间和下次浇水建议。
- `src/pages/diagnose/diagnose.vue`：五项 tab 中的诊断入口，直接复用共享 `DiagnoseFlow`；默认 `full`，可切换 `pest`，并显要展示黄叶、枯萎无图直入。
- `src/components/diagnose-flow/**`：诊断 tab 与植物卡片弹窗共用的完整诊断内核，负责模式选择、图片、视觉请求、方向选择、题包交接、补拍和结果状态；所有可见题包统一由公共题包页承接。
- `src/pages/diagnose/question-package.vue`：黄叶、发蔫或下垂及 1～2 题动态虫害包的公共答题页；题包只按整包 `answer_submit` 提交。
- `src/components/DiagnosePopup.vue`：植物卡片诊断按钮使用的 BottomSheet 容器，保留 open/close/reset、植物上下文和弹窗生命周期，内部嵌入 `DiagnoseFlow`。
- `src/pages/diagnose/result.vue`：诊断历史的只读结果承接页；不与新诊断入口页混用。
- `src/pages/reminder/reminder.vue`：五项 tab 中的提醒页；当前仅展示浇水分支并复用 `WateringReminderSheet`，不展示未实现的施肥入口。
- 诊断延续页与相关目录：历史命名不定义当前产品口径，当前以问诊题包与结果展示理解。
- `src/pages/profile/diagnosis-review.vue`：诊断审查页面。
- `src/pages/profile/out-of-pool-review.vue`：池外视觉候选和代理映射审查。
- `src/http-functions/core/httpRequest.js`：统一 HTTP 云函数请求封装。
- `src/http-functions/diagnose/client.js`：诊断主链、结果、历史、反馈、SSE 客户端。
- `src/http-functions/diagnose/diagnosis-review.js`：诊断 review 客户端。
- `src/http-functions/diagnose/out-of-pool-review.js`：池外候选治理客户端。
- `src/http-functions/storage/client.js`：诊断图片上传/删除客户端。

### 3.2 后端 CloudBase HTTP 函数

| 函数 | 当前职责 |
|---|---|
| `diagnose-http` | 统一诊断主链、问诊题包、结果、历史、反馈、review、池外候选，含 `/diagnose` 入口路径。 |
| `storage-http` | 诊断/植物图片上传、临时 URL、图片删除，图片后缀有 allowlist。 |
| `identify-http` | 植物识别，当前通过百度视觉识别能力取候选。 |
| `weather-http` | 当前天气与环境天气窗口，支持 `/weather/current`、`/weather/environment-context`、`/weather/v7/environment-context`、`/weather/health`、`/weather/recent` 与 `/weather/ingestion/recent-10d`。支持 `weather-ingestion-recent-10d` 定时触发并入库最近 10 天天气缓存。诊断模式下 `environment-context` 使用自有 recent-10d 缓存优先，`plantFeatures.weatherLightFactor10d` 参与 light 估算；未命中/读取失败时返回 `200` 且 `historicalDays` 可为空。 |
| `plant-catalog-http` | 植物目录列表、详情、名称映射。 |
| `plant-user-http` | 用户植物实例 CRUD，含 `/user-plants/watering-planner` 浇水规划器接口（接收 10 天浇水事件集合 + 天气数据，返回 nextWaterDate 等），以及 `/user-plants/watering-reminders` 日历创建后的提醒读写接口。 |
| `auth-user-http` | 微信登录、手机号绑定、用户资料更新、AI quota/权限等用户能力。 |
| `wechat-identity` | 微信 openid/unionid 相关身份桥接。 |
| `wechat-phone` | 微信手机号解密/桥接。 |
| `diagnosis-history-http` | 已退役；返回 410 并指向 `diagnose-http` 替代路径。 |
| `layer` | 共享 CloudBase、HTTP、运行环境、LLM、配额、植物知识工具，含 `watering-planner.js`（浇水规划器纯计算模块，diagnose-http 与 plant-user-http 共用）。 |

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

| 场景 | 值 |
|---|---|
| development / dev / local / test | `cloud1_dev` |
| production / prod | `cloud1-2grufevs395a9d5e` |
| 前端默认 CloudBase envId | `cloud1-2grufevs395a9d5e`，可由 `VITE_CLOUDBASE_ENV_ID` 覆盖 |
| 本地 API base | `VITE_API_BASE_URL`，生产环境禁止本地或非 HTTPS base URL |
| 请求环境头 | `x-app-env` / `x-env` |

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
