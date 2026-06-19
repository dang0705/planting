---
doc_id: active-contracts
status: current
doc_type: contract
owner: docs-keeper
sync_policy: active
last_verified_date: 2026-06-07
last_verified_commit: unknown-from-upload
source_of_truth:
  - src/http-functions/**
  - src/api/env.js
  - src/utils/runtime-env.js
  - cloudfunctions/layer/utils/http.js
  - cloudfunctions/diagnose-http/**
  - cloudfunctions/storage-http/app.js
  - cloudfunctions/identify-http/app.js
  - cloudfunctions/weather-http/**
  - cloudfunctions/plant-catalog-http/app.js
  - cloudfunctions/plant-user-http/app.js
  - cloudfunctions/auth-user-http/app.js
stale_if_changed:
  - src/http-functions/**
  - src/api/env.js
  - src/utils/runtime-env.js
  - cloudfunctions/*-http/**
  - cloudfunctions/layer/utils/http.js
---

# Active Contracts

本文只记录当前必须同步的外部契约。内部实现细节以代码为准，不在本文展开。

## 1. 契约优先级

```text
代码 / schema / tests / package scripts > 本文 > BRV index > 归档文档
```

当本文与源码冲突时，先信源码，然后由 `docs_keeper` 修补本文。

## 2. HTTP 云函数通用契约

### 2.1 响应格式

大多数 HTTP 云函数使用如下 envelope：

```json
{
  "code": 200,
  "message": "可选信息",
  "data": {}
}
```

错误响应通常也使用 `code/message/data`，具体状态码由对应函数入口决定。

### 2.2 环境与身份头

前端统一请求入口：

```text
src/http-functions/core/httpRequest.js
src/api/env.js
src/utils/runtime-env.js
```

重要请求头/参数：

| 名称 | 用途 |
|---|---|
| `x-app-env` / `x-env` | 指定 app 环境；后端用于 schema/env 分流。 |
| `Authorization` | CloudBase / 用户身份凭证。 |
| `x-wx-openid` / `x-openid` | 微信 openid 或本地调试身份。 |
| `x-terminal-e2e` | 终端 E2E 标记。 |
| `x-anonymous-dev-identity` | 本地/开发匿名身份辅助标记。 |

生产构建禁止使用本地或非 HTTPS `VITE_API_BASE_URL`。

### 2.3 schema/env 映射

| 输入环境 | 当前 schema/env |
|---|---|
| `development` / `dev` / `local` / `test` / `stage` | `cloud1_dev` |
| `production` / `prod` | `cloud1-2grufevs395a9d5e` |

后端事实源：

```text
cloudfunctions/diagnose-http/db/schema-resolver.js
cloudfunctions/layer/utils/http.js
```

## 3. `diagnose-http` 诊断契约

### 3.1 当前路由

| 方法 | 路径 | 当前用途 |
|---|---|---|
| GET | `/health` | 健康检查。 |
| POST | `/diagnosis/start` | 开始诊断主链。 |
| POST | `/diagnosis/question/start` | 题包初始化入口；不要从路径名反推当前仍是“追问”。 |
| POST | `/diagnosis/answer` | 提交题包/问题答案；当前契约不按“每轮最多 1 题”定义。 |
| GET | `/diagnosis/result` | 读取诊断结果。 |
| GET | `/diagnosis/history` | 读取诊断历史。 |
| POST | `/diagnosis/feedback` | 提交反馈。 |
| GET | `/diagnosis/review/list` | 诊断审查列表。 |
| GET | `/diagnosis/review/images` | 审查图片读取。 |
| GET | `/diagnosis/review/detail` | 审查详情。 |
| POST | `/diagnosis/review/import` | 导入审查样本。 |
| GET | `/visual/out-of-pool/list` | 池外视觉候选列表。 |
| GET | `/visual/out-of-pool/image` | 池外候选图片。 |
| POST | `/visual/out-of-pool/review` | 池外候选 review。 |
| GET | `/visual/out-of-pool/proxy-mappings/list` | 代理映射列表。 |
| POST | `/visual/out-of-pool/proxy-mappings/upsert` | 新增/更新代理映射。 |
| POST | `/visual/out-of-pool/proxy-mappings/disable` | 禁用代理映射。 |
| POST | `/stream/diagnose` | SSE/流式入口。 |
| POST | `/diagnose` | 后向路径入口。 |

事实源：`cloudfunctions/diagnose-http/app/http-router.js`。

### 3.2 前端诊断客户端

前端当前通过 `src/http-functions/diagnose/client.js` 暴露以下能力。注意：以下能力只作为接口入口与链路实现，不定义额外追问产品口径：

```text
requestDiagnosisStart
requestDiagnosisQuestionStart
requestDiagnosisAnswer
requestDiagnosisResult
requestDiagnosisHistory
requestDiagnosisFeedback
requestDiagnoseSync
requestDiagnoseStream
```

Review 与池外候选治理使用：

```text
src/http-functions/diagnose/diagnosis-review.js
src/http-functions/diagnose/out-of-pool-review.js
```

### 3.3 结果输出契约

`visibleOutcomes` 是当前前端可见诊断结果的首要出口。`primaryOutcome` / `secondaryOutcomes` 只能作为历史回读来源，不应作为新契约中心。

前端可依赖的核心字段包括：

```text
diagnosisSessionId
resultId
roundId
userPlantId
plantId
plantCatalogId
plantIdentityId
latestVisualCallBatchId
stage
status
routePrimaryAction
outcomeType
nonProblematicType
nonProblematicLabel
identityResolutionStatus
stopReason
followUpRequired
questions
questionPackage
finalResult
visibleOutcomes
outcomeMode
routeDecisionCause
summaryCard
resultExplanation / explanation
actionAdvice
nextSteps
whatToAvoid
treatmentText
preventionText
careBaselineSummary
environmentDeviationHints
visualBatchTrace
visualCombinedInfo
uiHints
outputEligibility
confidenceLevel
confidenceReasons
needHumanReview
careBehaviorTimeline
environmentCareContext
```

事实源：

```text
cloudfunctions/diagnose-http/app/frontend-response.js
cloudfunctions/diagnose-http/domain/result-formatter.js
cloudfunctions/diagnose-http/presenters/**
src/utils/diagnose-result-normalizer.js
```

### 3.4 问诊题包契约

当前产品口径不再维护“追问”，也不再把“每轮最多 1 题”作为 UX/产品契约。题包是当前问诊交互口径；单题追问相关端点、函数名、文件名只作为既有实现路径处理。

基础题目字段：

```text
questionId
questionKey
focusDimension
text
helpText
uiVariant
defaultOptionKey
options[]
```

题包模式当前不应再限定为黄叶/护养行为场景：

- 后端可以输出 `questionPackage`；题包可包含多题，长度由当前题包生成逻辑/任务需求决定。
- 前端题包模式可显示“问题 X/N”。
- 前端可在题包内本地导航，并在收集完成后提交整包答案。
- 前端提交题包答案时应把 `questionPackage` 和 `uiHints` 元数据随 answer payload 回传；这些字段用于后端识别 package 提交，不是展示专用临时字段。
- 固定题包 `requestMode: answer_submit` 且答案数满足题包元数据时，后端将其视为终止问诊状态；完成后不得再产生下一题或下一轮提问，响应应进入 final/result 路径。
- 后端 route planner 不再输出历史补充条件分支；缺失证据进入固定终止与公开响应收敛逻辑。
- 禁止把 `maxQuestionsPerRound: 1` 或“常规 route 追问每轮 1 题”写成当前 UX/产品契约。
- “黄叶 4 题 package”只能作为历史上已知题包形态，不是当前题包长度上限，也不是唯一适用场景。
- 有效 `yellow_leaf` 题包的包内答案按同一当前轮次整体持久化和归属校验；问题序列字段不作为题包题数和停止口径依据，仅作为历史实现字段。
- `wilting_droop` 固定题包使用 `sourceMode: manual_wilting_droop_route_package`，共 5 题：Q0 为 `care_behavior_timeline`/`CareBehaviorTimeline` 水分行为时间线，Q1-Q4 分别覆盖发蔫形态、节律/环境、近期应激和高危异常。
- `wilting_droop` 终端结果以 `visibleOutcomes` 多行动建议为中心，公开标题/结果名为“建议行动清单”；不提供 top 顺序口径或“最可能原因”排序输出。
- `wilting_droop` 结果可额外返回 `blockedActionExplanations`、`highRiskWarning`、`observationPeriod`。当高危异常阻断补水、喷水、施肥、暴晒等动作时，前端应展示冲突动作解释，而不是把被阻断动作继续作为主要建议。

需求指针：`docs/tickets/86exv6fnx-diagnose-question-package.md`。

事实源：

```text
cloudfunctions/diagnose-http/app/wilting-droop-question-package.js
cloudfunctions/diagnose-http/domain/wilting-droop-outcome-resolver.js
cloudfunctions/diagnose-http/app/question-package-response.js
cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js
cloudfunctions/diagnose-http/domain/diagnosis-engine.js
cloudfunctions/diagnose-http/app/manual-symptom-question-start-fast-path.js
cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js
cloudfunctions/diagnose-http/services/session-question-service.js
cloudfunctions/diagnose-http/constants/scoring.js
src/pages/diagnose/question-package/question-flow.js
src/utils/diagnose-result-normalizer.js
```

## 4. `storage-http` 图片契约

### 4.1 路由

| 方法 | 路径 | 当前用途 |
|---|---|---|
| GET | `/storage/health` | 健康检查。 |
| POST | `/storage/diagnose-images` | 上传诊断图片。 |
| DELETE | `/storage/diagnose-images` | 删除诊断图片。 |
| POST | `/storage/files` | 上传植物图片并写入 `plant_images`。 |
| GET | `/storage/files` | 根据 `fileId` 获取临时 URL。 |
| DELETE | `/storage/files` | 删除文件。 |
| GET | `/storage/plant-images` | 按 `plantId` 读取植物图片列表。 |
| PATCH | `/storage/plant-images` | 更新图片绑定的 `plantId`。 |

### 4.2 图片输入与路径

上传输入使用 base64 data URL：

```text
data:image/<type>;base64,<content>
```

当前允许后缀：

```text
jpg, jpeg, png, webp, heic, gif
```

CloudBase 路径规则：

```text
diagnose/<openid>/<plantId>_<timestamp>_<random>.<suffix>
plants/<openid>/<plantId>_<timestamp>_<random>.<suffix>
```

事实源：`cloudfunctions/storage-http/app.js`。

## 5. `identify-http` 植物识别契约

当前通过百度识别返回植物或食材候选，并尝试映射到规范植物知识库。

重要输出含义：

```text
identifyId
result[]
type
log_id
identityResolutionStatus / taxonomyMatchStatus
strongMatch
weakCandidates
primaryCandidate
plant match fields: id, plantIdentityId, historicalPlantId, canonicalName, matchAlias, internetName
```

事实源：`cloudfunctions/identify-http/app.js` 与 `cloudfunctions/layer/utils/plant-knowledge.js`。

## 6. `weather-http` 天气/环境上下文契约

### 6.1 当前路由

| 方法 | 路径 | 当前用途 |
|---|---|---|
| GET | `/weather/health` | 健康检查。 |
| GET/POST | `/weather/current` | 当前天气，以同位置同日期 D0 daily archive 作为缓存事实源；未命中时调用和风每日预报并后台调度 daily 归档。 |
| GET/POST | `/weather/recent` | 最近天气缓存接口，返回自有 recent-10d 缓存结果。 |
| GET/POST | `/weather/environment-context` | 环境天气窗口。 |
| GET/POST | `/weather/ingestion/recent-10d` | 触发最近十天历史天气抓取与归档更新。 |
| GET/POST | `/weather/v7/environment-context` | v7 环境天气窗口。 |

### 6.2 v7 天气窗口

环境上下文需要 `lat` 和 `lng`。`diagnosisDate` 可选。

当前窗口：

```text
historicalDays: 诊断日前 D-1 到 D-10（自有缓存）
forecastDays: 诊断日起 15 天
currentWeather: 当前天气，可失败降级
```

返回字段重点：

```text
meta.diagnosisDate
meta.historicalWindow
meta.forecastWindow
meta.todaySource
meta.recordCounts
meta.warnings
historicalDays[]
forecastDays[]
currentWeather
timestamp
```

诊断模式下，`/weather/environment-context` 必须优先读取自有 recent-10d 缓存。缓存 miss / 读取异常 / 读取超时时返回 `200`，以 `weather evidence insufficient` 或空 `historicalDays` 表示不足；不能在用户诊断链路中同步触发 QWeather 同步调用，也不能默认同步从 daily archives 重建 recent。同步 archive 重建只能由显式维护调用开启，前端诊断入口必须按短超时降级返回。

### 6.3 定时采集与批处理

`weather-http` 新增 CloudBase timer event：`weather-ingestion-recent-10d`，cron 为 `0 20 0/6 * * * *`。该事件由 `app.js` 顶部受控分支处理，复用 recent-10d service。

`/weather/current` 的 D0 daily archive 同时作为 current 响应缓存和 recent-10d 重建输入；旧 SQL `weather_cache` 城市缓存/用户缓存不再作为 current 路由缓存策略。daily 写入、raw snapshot 写入、`recent-10d.json` 重建和 manifest 更新均为后台归档动作，不阻塞客户端响应；定时采集仍默认维护 D-1 历史归档。

批处理逻辑只扫描 `weather_locations` 中 `is_active = 1` 且 `qweather_location_id` 非空的地点，并可带 `limit` 控制处理量，不触发全量省市/全国抓取。

数据库建表与校验使用官方 CloudBase CLI（`tcb db execute`）路径，统一通过 `run-with-cloudbase-env` 注入凭据执行；不要将 `$runSQL` 或 `$runSQLRaw` 作为建表主路径。注意：CloudBase Manager API 常见对 `$runSQLRaw` 的限制仅覆盖 DML，不构成 MySQL DDL 能力阻断依据。只允许幂等建表，`scripts/sql/ensure-weather-history-cache-tables.sql` 为当前 DDL 源文件，`npm run ensure:cloudbase-sql-schema` 与 `npm run ensure:cloudbase-sql-schema:verify` 为最小运维入口。

事实源已扩展为：

- `scripts/ensure-cloudbase-sql-schema.mjs`
- `scripts/lib/cloudbase-sql-runner.mjs`

实现 helper 已拆分为：

- `recent-weather-payloads.js`
- `recent-weather-archive.js`
- `recent-weather-batch.js`

事实源：

```text
cloudfunctions/weather-http/app.js
cloudfunctions/weather-http/routes/recent-weather-routes.js
cloudfunctions/weather-http/services/weather-window-service.js
cloudfunctions/weather-http/services/recent-weather-service.js
cloudfunctions/weather-http/services/weather-object-storage.js
cloudfunctions/weather-http/repositories/weather-location-repository.js
cloudfunctions/weather-http/routes/recent-weather-routes.js
cloudfunctions/weather-http/services/recent-weather-payloads.js
cloudfunctions/weather-http/services/recent-weather-archive.js
cloudfunctions/weather-http/services/recent-weather-batch.js
cloudfunctions/weather-http/adapters/qweather-adapter.js
scripts/sql/ensure-weather-history-cache-tables.sql
cloudfunctions/diagnose-http/repositories/weather-repository.js
cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js
cloudfunctions/weather-http/config.json
```

## 7. 植物目录与用户植物契约

### 7.1 `plant-catalog-http`

| 方法 | 路径 | 当前用途 |
|---|---|---|
| GET | `/catalog/health` | 健康检查。 |
| GET | `/catalog/map?keyword=` | 名称映射到规范植物候选。 |
| GET | `/catalog/plants` | 植物目录列表。 |
| GET | `/catalog/plants?plantId=` | 植物详情。 |

### 7.2 `plant-user-http`

| 方法 | 路径 | 当前用途 |
|---|---|---|
| GET | `/user-plants/health` | 健康检查。 |
| GET | `/user-plants` | 当前用户植物列表。 |
| POST | `/user-plants` | 新建用户植物。 |
| PATCH | `/user-plants` | 更新用户植物，需 `id`。 |
| DELETE | `/user-plants` | 删除用户植物，需 `id`。 |

`plant-user-http` 需要解析到 openid；否则返回 401。

## 8. 用户认证契约

`auth-user-http` 当前入口是 `/auth/user`，按 `action` 分发。

当前 action：

```text
wechatLogin
phoneLogin
updateEmail
updatePhoneNumber
getUserByUnionId
getUserByOpenid
getUserByEmail
```

健康检查：`/auth/user/health`。

事实源：`cloudfunctions/auth-user-http/app.js`。

## 9. 已退役契约

`diagnosis-history-http` 已下线：

- `/diagnosis/history/health` 返回 `status: deprecated`。
- `/diagnosis/history`、`/diagnosis/history/detail`、`/diagnosis/history/feedback`、`/diagnosis/decision` 返回 410。
- 替代路径在 `diagnose-http`：`/diagnosis/history`、`/diagnosis/result`、`/diagnosis/feedback`。

文档若要求调用 `diagnosis-history-http`，应标记为 stale/superseded。
