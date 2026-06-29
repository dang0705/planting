---
doc_id: current-system-map
status: current
doc_type: map
owner: docs-keeper
sync_policy: active
last_verified_date: 2026-06-26
last_verified_commit: sprint-ai-workflow
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
| 前端诊断页面 | `src/pages/diagnose/**`, `src/components/DiagnosePopup.vue` |
| 前端 HTTP 函数客户端 | `src/http-functions/**`, `src/api/env.js` |
| Vue Query 数据流 | `src/vue-query/**` |
| 前端诊断归一化 | `src/utils/diagnose-result-normalizer.js`, `src/utils/diagnose-flow*.js` |
| 诊断统一后端 | `cloudfunctions/diagnose-http/**` |
| 诊断路由入口 | `cloudfunctions/diagnose-http/app.js`, `cloudfunctions/diagnose-http/app/http-router.js` |
| 诊断主链 | `cloudfunctions/diagnose-http/domain/diagnosis-engine.js` |
| 结果输出契约 | `cloudfunctions/diagnose-http/app/frontend-response.js`, `cloudfunctions/diagnose-http/domain/result-formatter.js`, `cloudfunctions/diagnose-http/presenters/**` |
| 环境/schema 分流 | `src/utils/runtime-env.js`, `src/api/env.js`, `cloudfunctions/diagnose-http/db/schema-resolver.js`, `cloudfunctions/layer/utils/http.js` |
| 本地调试/部署 | `package.json`, `scripts/dev/**`, `scripts/deploy-*.mjs`, `scripts/security/check-no-secrets.mjs` |
| BRV/AI 工作流 | `.codex/**`, `.brv/context-tree/**`, `docs/_sync-map.yml` |

## 3. 当前主要模块

### 3.1 前端

- `src/pages/index/index.vue`：首页，植物卡水滴 icon 点击打开浇水提醒弹框（不再跳转日历页）。
- `src/pages/index/components/WateringReminderSheet.vue`：浇水提醒底部弹框，含上次浇水入口、建议下次浇水 Summary、添加至日历主操作；点击上次浇水打开二级日期选择器（复用 `CareBehaviorTimeline`）。
- `src/pages/diagnose/diagnose.vue`：诊断入口。
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
| `plant-user-http` | 用户植物实例 CRUD，含 `/user-plants/watering-planner` 浇水规划器接口（接收 10 天浇水事件集合 + 天气数据，返回 nextWaterDate 等）。 |
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
POST /diagnosis/start
POST /diagnosis/question/start   # 题包初始化入口；不要从名称反推当前仍是追问
POST /diagnosis/answer           # 题包/问题答案提交；不要按每轮 1 题解释
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
