---
doc_id: current-system-map
status: current
doc_type: map
owner: docs-keeper
sync_policy: active
last_verified_date: 2026-06-06
last_verified_commit: unknown-from-upload
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

本文是当前代码事实的最小导航图。它替代旧的“大而全文档”作为默认 AI 入口。

## 1. 项目定位

当前项目是 `AI植伴`：基于 uni-app / Vue 3 的植物养护与诊断小程序/H5 应用，后端主要由 CloudBase HTTP 云函数提供。核心业务是：植物识别、图片上传、天气/环境上下文、用户植物档案、诊断问诊、诊断结果、复盘审查与池外视觉候选治理。

## 2. 默认事实源

| 领域 | 当前事实源 |
|---|---|
| 前端入口 | `src/main.js`, `src/pages.json`, `src/manifest.json` |
| 前端诊断页面 | `src/pages/diagnose/**`, `src/components/DiagnosePopup.vue` |
| 前端 HTTP 函数客户端 | `src/http-functions/**`, `src/api/env.js` |
| Vue Query 数据流 | `src/vue-query/**` |
| 前端诊断归一化 | `src/utils/diagnose-result-normalizer.js`, `src/utils/diagnose-flow*.js`, `src/utils/diagnose-follow-up-payload.js` |
| 诊断统一后端 | `cloudfunctions/diagnose-http/**` |
| 诊断路由入口 | `cloudfunctions/diagnose-http/app.js`, `cloudfunctions/diagnose-http/app/http-router.js` |
| 诊断主链 | `cloudfunctions/diagnose-http/domain/diagnosis-engine.js` |
| 结果输出契约 | `cloudfunctions/diagnose-http/app/frontend-response.js`, `cloudfunctions/diagnose-http/domain/result-formatter.js`, `cloudfunctions/diagnose-http/presenters/**` |
| 环境/schema 分流 | `src/utils/runtime-env.js`, `src/api/env.js`, `cloudfunctions/diagnose-http/db/schema-resolver.js`, `cloudfunctions/layer/utils/http.js` |
| 本地调试/部署 | `package.json`, `scripts/dev/**`, `scripts/deploy-*.mjs`, `scripts/security/check-no-secrets.mjs` |
| BRV/AI 工作流 | `.codex/**`, `.brv/context-tree/**`, `docs/_sync-map.yml` |

## 3. 当前主要模块

### 3.1 前端

- `src/pages/index/index.vue`：首页。
- `src/pages/diagnose/diagnose.vue`：诊断入口。
- `src/pages/diagnose/follow-up.vue` 与 `src/pages/diagnose/follow-up/**`：历史命名仍含 `follow-up`，但当前产品口径应按问诊题包/结果展示理解，不再按“追问”理解。
- `src/pages/profile/diagnosis-review.vue`：诊断审查页面。
- `src/pages/profile/out-of-pool-review.vue`：池外视觉候选和代理映射审查。
- `src/http-functions/core/httpRequest.js`：统一 HTTP 云函数请求封装。
- `src/http-functions/diagnose/client.js`：诊断主链、结果、历史、反馈、SSE 兼容客户端。
- `src/http-functions/diagnose/diagnosis-review.js`：诊断 review 客户端。
- `src/http-functions/diagnose/out-of-pool-review.js`：池外候选治理客户端。
- `src/http-functions/storage/client.js`：诊断图片上传/删除客户端。

### 3.2 后端 CloudBase HTTP 函数

| 函数 | 当前职责 |
|---|---|
| `diagnose-http` | 统一诊断主链、问诊题包、结果、历史、反馈、review、池外候选、legacy `/diagnose` 兼容。 |
| `storage-http` | 诊断/植物图片上传、临时 URL、图片删除，图片后缀有 allowlist。 |
| `identify-http` | 植物识别，当前通过百度视觉识别能力取候选。 |
| `weather-http` | 当前天气与环境天气窗口，支持 `/weather/current`、`/weather/environment-context`、`/weather/v7/environment-context`。 |
| `plant-catalog-http` | 植物目录列表、详情、名称映射。 |
| `plant-user-http` | 用户植物实例 CRUD。 |
| `auth-user-http` | 微信登录、手机号绑定、用户资料更新、AI quota/权限等用户能力。 |
| `wechat-identity` | 微信 openid/unionid 相关身份桥接。 |
| `wechat-phone` | 微信手机号解密/桥接。 |
| `diagnosis-history-http` | 已退役；返回 410 并指向 `diagnose-http` 替代路径。 |
| `layer` | 共享 CloudBase、HTTP、运行环境、LLM、配额、植物知识工具。 |

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
POST /diagnosis/question/start   # 题包/兼容入口；不要从名称反推当前仍是追问
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

- 诊断运行时已是 route/outcome 主导，不应把旧 ranking 规划文档当当前事实。
- `visibleOutcomes` 是前端可见结果的首要出口；旧 `primaryOutcome` / `secondaryOutcomes` 只能作为兼容或回读来源，不应作为新契约中心。
- 2026-06-06 最新题包口径：当前不存在“追问”，也不再以“每轮最多 1 题”作为产品/UX 契约。
- `maxQuestionsPerRound: 1`、`maxFollowUpRounds`、`follow-up` 文件名或函数名如果仍存在，只能视为实现细节、历史命名或兼容路径，不能覆盖当前题包口径。
- 问诊题包是当前任务口径；旧“黄叶 4 题 package”只能作为已知题包形态之一，不再作为题包长度或题包场景上限。
- 固定题包 `answer_submit` 完成后是终止问诊状态；后端不得继续规划 route-planned、forced 或 generic 下一题，响应应进入 final/result 路径。
- 有效 `yellow_leaf` 题包答案必须按同一当前轮次的 package 进行持久化和归属校验；legacy `questionQueue` 仍是兼容/选择锚点，不能拒绝同一题包内的 sibling questions。非题包路径仍保持旧 queue-anchor 单题语义。
- 环境上下文当前以 v7 为准，使用 10 天历史窗口与 15 天天气预报窗口参与养护建议。
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

最小常用命令见 `docs/RUNBOOK.md`。不要从旧 handoff 中复制一次性命令作为当前发布入口。

## 8. 不是当前事实源的材料

以下材料默认不作为当前事实：

```text
docs/new-rules/planting_ai_diagnosis_all_in_one.md
docs/route规划及outcome瘦身计划/**
docs/ai-runs/**
docs/ai-tasks/**
.brv/review-backups/**
.brv/dream-log/**
旧 BRV superseded facts
```

这些材料只能在明确需要历史原因、原始规则溯源、旧方案比较时按索引读取。

## 9. 当前题包任务指针

最新问诊题包任务使用 `docs/tickets/86exv6fnx-diagnose-question-package.md` 作为极简需求指针。该指针用于使旧“追问 / 每轮 1 题”口径失效；实现事实仍必须回到当前代码、测试、schema 和提交 diff 验证。
