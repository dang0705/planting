---
doc_id: active-contracts
status: current
doc_type: contract
owner: main
sync_policy: active
last_verified_date: 2026-07-20
last_verified_commit: working-tree-pest-visual-mode
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
  - cloudfunctions/layer/utils/watering-planner.js
  - cloudfunctions/layer/utils/plant-knowledge.js
  - cloudfunctions/layer/utils/pot-geometry.js
  - cloudfunctions/layer/utils/hydration-load.js
  - cloudfunctions/diagnose-http/utils/environment-context-v7.js
  - src/pages/index/components/WateringReminderSheet.vue
  - src/pages/index/components/DoseSelector.vue
  - src/pages/index/components/PotProfileEditor.vue
  - src/components/PotCanvas.vue
  - src/store/plants.js
  - src/components/CareBehaviorTimeline.vue
  - src/components/diagnose-flow/**
  - src/components/DiagnosePopup.vue
  - scripts/sql/watering-reminder-v21-schema-20260630.sql
  - scripts/sql/add-specific-pest-diagnosis-mvp-20260720.sql
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

当本文与源码冲突时，先信源码，然后由 main 修补本文。

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

| 名称                       | 用途                                      |
| -------------------------- | ----------------------------------------- |
| `x-app-env` / `x-env`      | 指定 app 环境；后端用于 schema/env 分流。 |
| `Authorization`            | CloudBase / 用户身份凭证。                |
| `x-wx-openid` / `x-openid` | 微信 openid 或本地调试身份。              |
| `x-terminal-e2e`           | 终端 E2E 标记。                           |
| `x-anonymous-dev-identity` | 本地/开发匿名身份辅助标记。               |

生产构建禁止使用本地或非 HTTPS `VITE_API_BASE_URL`。

### 2.3 schema/env 映射

| 输入环境                                           | 当前 schema/env           |
| -------------------------------------------------- | ------------------------- |
| `development` / `dev` / `local` / `test` / `stage` | `cloud1_dev`              |
| `production` / `prod`                              | `cloud1-2grufevs395a9d5e` |

后端事实源：

```text
cloudfunctions/diagnose-http/db/schema-resolver.js
cloudfunctions/layer/utils/http.js
```

## 3. `diagnose-http` 诊断契约

### 3.1 当前路由

| 方法 | 路径                                         | 当前用途                                             |
| ---- | -------------------------------------------- | ---------------------------------------------------- |
| GET  | `/health`                                    | 健康检查。                                           |
| POST | `/diagnosis/start`                           | 开始诊断主链；`streamVisualDecision=true` 时使用 SSE 返回视觉阶段事件。 |
| POST | `/diagnosis/question/start`                  | 题包初始化入口；不要从路径名反推当前仍是“追问”。     |
| POST | `/diagnosis/answer`                          | 提交题包/问题答案；当前契约不按“每轮最多 1 题”定义。 |
| POST | `/diagnosis/retake/authorize`                | 用户确认补拍后创建本次会话唯一的三分钟服务端授权。   |
| POST | `/diagnosis/retake/skip`                     | 跳过风险补拍并以 `unknown` 结束本次诊断。            |
| GET  | `/diagnosis/result`                          | 读取诊断结果。                                       |
| GET  | `/diagnosis/history`                         | 读取诊断历史。                                       |
| POST | `/diagnosis/feedback`                        | 提交反馈。                                           |
| GET  | `/diagnosis/review/list`                     | 诊断审查列表。                                       |
| GET  | `/diagnosis/review/images`                   | 审查图片读取。                                       |
| GET  | `/diagnosis/review/detail`                   | 审查详情。                                           |
| POST | `/diagnosis/review/import`                   | 导入审查样本。                                       |
| GET  | `/visual/out-of-pool/list`                   | 池外视觉候选列表。                                   |
| GET  | `/visual/out-of-pool/image`                  | 池外候选图片。                                       |
| POST | `/visual/out-of-pool/review`                 | 池外候选 review。                                    |
| GET  | `/visual/out-of-pool/proxy-mappings/list`    | 代理映射列表。                                       |
| POST | `/visual/out-of-pool/proxy-mappings/upsert`  | 新增/更新代理映射。                                  |
| POST | `/visual/out-of-pool/proxy-mappings/disable` | 禁用代理映射。                                       |
| POST | `/stream/diagnose`                           | SSE/流式入口。                                       |
| POST | `/diagnose`                                  | 后向路径入口。                                       |

事实源：`cloudfunctions/diagnose-http/app/http-router.js`。

### 3.2 前端诊断客户端

前端当前通过 `src/http-functions/diagnose/client.js` 暴露诊断主链能力，通过 `src/http-functions/diagnose/retake.js` 暴露补拍授权与跳过能力。以下能力只作为接口入口与链路实现，不定义额外追问产品口径：

```text
requestDiagnosisStart
requestDiagnoseStream
requestDiagnosisQuestionStart
requestDiagnosisAnswer
requestDiagnosisResult
requestDiagnosisRetakeAuthorize
requestDiagnosisRetakeSkip
requestDiagnosisHistory
requestDiagnosisFeedback
requestDiagnoseSync
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
diagnosisProfile
diagnosisModeRouteResult
directionChoices
directMatches
confirmationCandidates
retakeRequest
retakeAuthorizationState
originVisualCallBatchId
evidenceSnapshotId
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
- `yellow_leaf` 仍为原固定 4 题，`wilting_droop` 仍为原固定 5 题；两者可无图直入，不调用视觉模型，题目 ID、顺序、选项、答案提交和结果逻辑不得被动态虫害包覆盖。
- 诊断 tab 未绑定植物时可以用匿名会话启动上述固定题包，并可临时使用用户位置补齐天气背景；匿名占位 ID 不得写入或更新用户植物资料。
- 具体虫害模式必须由 AI 初诊后的正式接纳证据进入；`pest` 是 profile/上位类别，不提供无图泛虫害题包。
- `dynamic_specific_pest` 为 0～2 题动态题包。已正式接纳的视觉证据在题包中正向预填、锁定并隐藏同证据组问题；低置信或未接纳线索不得预填。
- 动态虫害题包允许 1 题正式 package 提交，也允许多个具体虫害同时保留到 `visibleOutcomes`；命中项只排序，不删除次要结果。
- 所有可见题包统一进入 `pages/diagnose/question-package`；`DiagnoseFlow` 只负责把当前会话和题包交给公共题包页，不在内核中维护另一套动态虫害答题 UI。
- 题包答案统一以 `requestMode: answer_submit` 整包提交。服务端以会话中持久化的 `questionPackageSnapshot` 校验问题和选项归属，客户端回传的题包元数据不得成为选项授权来源。
- 风险任务必须返回风险说明、明确同意和“不敢操作 / 跳过”；跳过值固定为 `unknown`，不得计作阴性。

### 3.5 视觉模式路由与补拍契约

- 所有“正式接纳的 AI 视觉证据 → 症状模式”只调用 `resolveDiagnosisModeRoute`。模型只输出可见证据和候选，不能直接确诊或启动题包。
- `POST /diagnosis/start` 仅在请求明确携带 `streamVisualDecision=true` 且函数运行时提供 `context.sse()` 时进入视觉 SSE 分支；该分支依次发送用户可读的 `visual_*` 生命周期事件，最后只发送一次 `done`。原始模型 JSON、模型思考内容和内部路由术语不得流向客户端。
- SSE 建立后、身份与模型前置流程完成前可先发送 `visual_preparing`，但不得伪称会话或模型已经启动；单图模型收到首个非空内容时最多发送一次 `visual_model_response_started`，其负载不得含模型 chunk、JSON、机器键或提示词。模型传输时序把 `firstByteMs` 与 `firstContentMs` 分开记录；后者只代表首个可见内容到达，不承诺模型推理变快。
- SSE 客户端使用一次 `enableChunked` 请求消费事件流；流式请求失败时不得自动重放一次普通 `/diagnosis/start`。运行时不支持 SSE 时，服务端在调用模型前返回 `SSE_UNSUPPORTED`；不带流式标记的旧调用继续使用 `{ code, message, data }` JSON 包装。
- `diagnosisProfile=full` 可提出黄叶、枯萎和具体虫害方向；`diagnosisProfile=pest` 只允许八种具体虫害成为模式候选，黄叶、下垂只作为伴随现象保存。
- 高特异性组合只能使用同一图片、同一 `regionRef` 的独立证据组；同义证据最多计一次。一个以上虫害达到门槛时全部保留。
- Prompt 的静态区包含完整 schema、器官/拍摄区域、证据与模式目录；profile、分析轮次、入口、植物上下文、前序正式证据摘要和未解决缺口只放动态尾部。
- 提示词不描述逐虫虫体形状，也不得以文字特征诱导模型找虫；模型先独立识别当前图中的虫体或叶内潜道，随后 `PEST_VISUAL_RULES` 才按当前器官把模式键和 `PEST_EVIDENCE_RULES` 的直接证据组合编译到动态尾部。细网、叶片点状白黄伤痕、银白擦伤、同区针尖黑点、叶内潜道等非虫体可见异常必须保留在动态尾部，辅助证据不得被误写成直判必填项。
- 合法、器官匹配且置信度不低于 `0.90` 的具体虫害 `mode_candidates` 是独立的实体候选来源；不得仅因同次输出没有重复的正式症状键而在 parser 或 route 层丢弃。该保留不会伪造正式症状证据，也不放宽低置信、profile 不匹配或器官不匹配候选的过滤。`yellow_speckling` 或 `stippling` 单独不得生成 `spider_mite` 候选；叶螨仍要求可见虫群，或同图同区的细网加点状伤痕组合才可直判。
- `full/pest` 与首次/补拍必须保持同一静态前缀哈希。TokenHub 仅对有非空 system 静态前缀的视觉请求发送全局 `prompt_cache_key`，其值只含固定契约版本、模型和静态前缀哈希，以让所有诊断复用该静态前缀缓存；动态尾部、图片、用户、会话或批次信息不得进入。存在服务端诊断会话时，另发送不可逆摘要形式的 `X-Session-ID` 只用于同会话实例亲和，不能参与缓存键，也不得泄露原始会话值。是否真正命中服务商缓存只能以模型 usage 中的 `cached_tokens` / `prompt_cache_hit_tokens` 为准；三分钟补拍时限不是缓存命中保证，Chat 监控中的创建量为零也不能单独作为失败结论。
- `DiagnoseFlow` 的首次图片和补拍图片在上传前统一执行物理像素预算：最多 `1,638,400` 像素、按 32 像素网格对齐且禁止放大；缩放后再进行 JPEG 压缩，质量不得低于 68。文件 KB 变小不等于视觉 token 变少，视觉 token 优化必须以最终宽高为准。服务端 `max_pixels` 仅作额外保护，不得假定 CloudBase 网关一定透传。
- 图片审计必须分别保留原始宽高、最终宽高、原始/最终像素数、是否缩放、像素预算及估算视觉 token。服务商明确返回 `image_tokens` 时记录精确值；未返回时只能记录按 Qwen 32×32 网格计算的估算值，不得伪造精确拆分。
- 首次分析只能提出补拍计划。用户确认后服务端生成一次授权，`retakeExpiresAt = serverNow + 3 分钟`；上传时服务端再次验时。
- 风险补拍的风险说明、安全步骤和三分钟硬截止在同一次确认中展示；“不敢操作 / 跳过”由服务端持久化为 `skipped_unknown`，答案值为 `unknown`，并结束本次诊断。
- 授权和跳过接口允许网络超时后的同状态幂等重放，但不会重置既有 `retakeExpiresAt`；授权后不能再跳过，跳过后不能再授权。
- 授权超时后返回业务错误 `RETAKE_WINDOW_EXPIRED`，会话终态为 `ended_retake_timeout`，前端只允许重新诊断。
- 补拍模型只分析新图；证据账本保留首批正式证据，并通过 `originVisualCallBatchId`、前序证据摘要和未解决证据组衔接。
- `surface_glossy_residue` 只表示“叶片或枝条表面可见发亮、近透明的滴状或薄膜状残留”，视觉层不得推断“发黏”或“蜜露”。只有用户明确选择发黏时，结果才可说明“甜黏的透明分泌物（也叫蜜露）”。

当前 SQL artifact 为 `scripts/sql/add-specific-pest-diagnosis-mvp-20260720.sql`。它只补充正式虫害视觉证据目录，本次未执行生产或本地数据库迁移；未应用该 artifact 的环境不能把缺失键当成已审计正式证据。

需求指针：`docs/tickets/86exv6fnx-diagnose-question-package.md`。

事实源：

```text
cloudfunctions/diagnose-http/app/wilting-droop-question-package.js
cloudfunctions/diagnose-http/domain/wilting-droop-outcome-resolver.js
cloudfunctions/diagnose-http/app/question-package-response.js
cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js
cloudfunctions/diagnose-http/app/pest-question-package.js
cloudfunctions/diagnose-http/app/retake-authorization.js
cloudfunctions/diagnose-http/domain/diagnosis-mode-registry.js
cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js
cloudfunctions/diagnose-http/domain/diagnosis-engine.js
cloudfunctions/diagnose-http/app/manual-symptom-question-start-fast-path.js
cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js
cloudfunctions/diagnose-http/services/session-question-service.js
cloudfunctions/diagnose-http/constants/scoring.js
cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js
src/components/diagnose-flow/**
src/http-functions/diagnose/retake.js
src/pages/diagnose/question-package/question-flow.js
src/utils/diagnose-result-normalizer.js
```

## 4. `storage-http` 图片契约

### 4.1 路由

| 方法   | 路径                       | 当前用途                            |
| ------ | -------------------------- | ----------------------------------- |
| GET    | `/storage/health`          | 健康检查。                          |
| POST   | `/storage/diagnose-images` | 上传诊断图片。                      |
| DELETE | `/storage/diagnose-images` | 删除诊断图片。                      |
| POST   | `/storage/files`           | 上传植物图片并写入 `plant_images`。 |
| GET    | `/storage/files`           | 根据 `fileId` 获取临时 URL。        |
| DELETE | `/storage/files`           | 删除文件。                          |
| GET    | `/storage/plant-images`    | 按 `plantId` 读取植物图片列表。     |
| PATCH  | `/storage/plant-images`    | 更新图片绑定的 `plantId`。          |

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

| 方法     | 路径                              | 当前用途                                                                                                                              |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET      | `/weather/health`                 | 健康检查。                                                                                                                            |
| GET/POST | `/weather/current`                | 当前天气，优先读取同位置当天 `days/{yyyy-mm-dd}.json.latestSample`；缺失时降级到最近 finalized day rollup，仍缺失则返回天气证据不足。 |
| GET/POST | `/weather/recent`                 | 最近天气缓存接口，返回自有 recent-10d 缓存结果。                                                                                      |
| GET/POST | `/weather/environment-context`    | 环境天气窗口。                                                                                                                        |
| GET/POST | `/weather/ingestion/recent-10d`   | 触发最近十天历史天气抓取与归档更新。                                                                                                  |
| GET/POST | `/weather/v7/environment-context` | v7 环境天气窗口。                                                                                                                     |

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
plantFeatures
historicalDays[]
forecastDays[]
currentWeather
timestamp
```

诊断模式下，`/weather/environment-context` 必须优先读取自有 recent-10d 缓存。`environment-context` 返回重点字段包含 `plantFeatures`（至少 `weatherLightFactor10d/lightConfidence/lightEvidenceInsufficient/validLightDayCount/missingLightDayCount` 及 `dailyRollup.lightFeatures` 派生字段）。诊断天气事实链路为 `plant -> careLocationId -> locationKey -> weather-cache`；诊断请求已有植物 careLocation 时不得使用用户当前位置作为事实源。热门城市上海必须使用 `locationKey=city:shanghai`，上海/上海市/上海坐标不能退化为 `coord:*`；读取路径为 `weather-cache/v1/locations/{locationKey}/recent-10d.json`。缓存 miss / 读取异常 / 读取超时时返回 `200`，以 `weather evidence insufficient` 或空 `historicalDays` 表示不足；`weatherEvidenceInsufficient = true` 或 `lightEvidenceInsufficient = true` 时对应光照估算中性回退为 `1.00`；`city:shanghai` 的有效 recent payload 已生成且日期窗口匹配时，`weatherEvidenceInsufficient` 应为 `false`。不能在用户诊断链路中同步触发 QWeather 同步调用，也不能默认同步从旧 `dailyArchives` 重建 recent。同步 recent 重建只能读取已 `finalized` 的 `days/{date}.json`，并只能由显式维护调用开启；前端诊断入口必须按短超时降级返回。diagnosis reader 必须保留日期窗口守卫：partial recent payload 只有匹配 `diagnosisDate` / `window.targetDate = diagnosisDate - 1` 时才可作为有效证据，过期 payload 不得通过。

### 6.3 定时采集与批处理

`weather-http` CloudBase timer event `weather-ingestion-recent-10d` 的 cron 为 `0 20 0/6 * * * *`。该事件由 `app.js` 顶部受控分支处理，复用 recent-10d service。timer 先确保全国节气历（`weather-cache/v1/solar-term-calendar/cn/{year}.json`）具备 `year-1/year/year+1`。仅在节气日进入城市更新候选，非节气日 no-change，不触发 D0 城市更新。

D0 天气归档使用单一 day file 状态机：路径为 `weather-cache/v1/locations/{locationKey}/days/{yyyy-mm-dd}.json`。白天 now 采样调用 QWeather `/v7/weather/now`，追加 `samples[]` 并更新 `latestSample`，`state=working`；`samples[]` 必须保留 `/v7/weather/now` 的完整关键观测字段，`latestSample` 必须从最终样本列表中取最新样本。定稿时在同一文件生成 `dailyRollup`，写入 `state=finalized`、`finalizedAt`、`sourceKind=observed_now_rollup`。`/weather/current` 不再同步调用 QWeather realtime，也不再读写旧 SQL `weather_cache` 城市缓存/用户缓存；缺失时返回空态或 `weatherEvidenceInsufficient`，不能返回 500。

D0 now 采样由 7 个线上 timer 驱动：`weather-ingestion-recent-10d`、`weather-d0-now-sunrise-sweep`、`weather-d0-now-morning-0720`、`weather-d0-now-forenoon-1120`、`weather-d0-now-noon-1420`、`weather-d0-now-afternoon-1620`、`weather-d0-now-sunset-sweep`。`sunrise-sweep` 每 10 分钟覆盖 04:00-07:59，`sunset-sweep` 每 10 分钟覆盖 17:00-20:59；函数内使用 `suncalc` 按城市计算日出/日落，只处理距离当前触发时刻 10 分钟内的热门城市。`sunrise` 是 D0 第一枪，`sunset` 是 D0 最后一枪，二者都会写入 `samples[]`；`sunset` 是瞬时样本，不是 `finalize`。固定 `weather-d0-now-finalize-2130` 不再作为触发依据；若需要定稿，必须走显式 finalize 路径。`weather-ingestion-recent-10d` 只维护 D-1 到 D-10 recent 窗口，不负责创建当天 `days/{date}.json`。

`recent-10d.json` 只聚合 D-1 到 D-10 且 `state=finalized` 的 `days/{date}.json`，D0 当天不得进入 recent。`dailyRollup.lightFeatures` 包含 `daylightCloudMean/daylightCloudP75/daylightCloudMax`、`visibilityMin/visibilityMean`、`dominantWeatherIcon/dominantWeatherText`、`weatherLightFactor`、`confidence`、`weatherLightCategory`；`recent-10d.json.plantFeatures` 包含至少 `weatherLightFactor10d/lightConfidence/lightEvidenceInsufficient/validLightDayCount/missingLightDayCount`，并可携带支持字段（daylight/cloud/visibility/dominant icon/text）。批处理默认覆盖 20 个热门城市（含 `city:shanghai`），并可由环境变量 `WEATHER_HOT_CITY_INGESTION_KEYS` 限定为部分城市；变量空值时按既有 hot city fallback 回退并记录 audit。随后再合并 `weather_locations` 中 `is_active = 1` 且 `qweather_location_id` 非空的地点去重。支持 `batch` 入参 `limit` 控制处理量；不触发全量省市/全国抓取。诊断请求仍 storage-only，不同步调用 QWeather/GeoAPI。`weatherEvidenceInsufficient` 与 `lightEvidenceInsufficient` 为 true 时，光照相关估算回退为中性 `1.00` 而非低光判定。

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
cloudfunctions/weather-http/services/weather-cache-paths.js
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

| 方法 | 路径                       | 当前用途                 |
| ---- | -------------------------- | ------------------------ |
| GET  | `/catalog/health`          | 健康检查。               |
| GET  | `/catalog/map?keyword=`    | 名称映射到规范植物候选。 |
| GET  | `/catalog/plants`          | 植物目录列表。           |
| GET  | `/catalog/plants?plantId=` | 植物详情。               |

### 7.2 `plant-user-http`

| 方法   | 路径                                          | 当前用途                                     |
| ------ | --------------------------------------------- | -------------------------------------------- |
| GET    | `/user-plants/health`                         | 健康检查。                                   |
| GET    | `/user-plants`                                | 当前用户植物列表。                           |
| POST   | `/user-plants`                                | 新建用户植物。                               |
| PATCH  | `/user-plants`                                | 更新用户植物，需 `id`。                      |
| DELETE | `/user-plants`                                | 删除用户植物，需 `id`。                      |
| POST   | `/user-plants/watering-planner`               | 复用共享规划器计算浇水建议。                 |
| GET    | `/user-plants/watering-reminders?plantId=...` | 读取当前用户指定植物最新未过期浇水日历提醒。 |
| POST   | `/user-plants/watering-reminders`             | 系统日历创建成功后保存完整浇水提醒事件。     |

`plant-user-http` 需要解析到 openid；否则返回 401。

### 7.2.1 `POST /user-plants/watering-planner`

本接口用于前端请求下一次浇水建议，计算逻辑复用 `cloudfunctions/layer/utils/watering-planner.js`（v2.1），并与 `diagnose-http` 的建议链路共享。`buildWateringPlanner` 已从 `diagnose-http` 抽取到 layer 共享纯计算模块，diagnose-http 通过 try/catch 回退委托调用。

v2.1 算法升级：移除 `wateringCount10d` 作为核心判断，改用 `effectiveHydrationLoad` / `wetPressureLoad` / `lastEffectiveRootWateredDaysAgo` / `rootZoneMoistureIndex` / Dry/Wet Gate。盆型几何（来自 `user_plant_instances` 主表盆型列）影响干透速率、排水风险和水量建议。

入参约束：

- `plantId`：植物实例 ID（必填）
- `wateringEvents`：最近 10 天（含当日可回传）的浇水事件集合，元素结构 `{ date: 'YYYY-MM-DD', watered: true, amount: 'normal' }`
- `referenceDate`：计算基准日期（ISO 字符串）
- `weatherDays`：历史天气日数据数组（来自 `getEnvironmentWeatherWindow` 的 `historicalDays`），每日含 `tempMaxC/tempMinC/humidity/precipMm/textDay`
- `forecastDays`：预报天气日数据数组（来自 `getEnvironmentWeatherWindow` 的 `forecastDays`），字段同 `weatherDays`
- `potProfile`：可选的盆型档案临时覆盖（字段同下方"盆型档案读写"小节）。独立浇水建议流程（`watering-advisor`）在"我的植物"路径下，会将当前步骤中的盆型（默认值或用户修改值，由前端 `PotProfileFormCore` 产出）通过此字段传入，仅用于本次计算，不写回 `user_plant_instances` 主表。后端优先使用 `request.body.potProfile`，未传时回退到 `strategy.potProfile`（来自 `getUserPlantWateringStrategy` 读取的数据库盆型列），保持首页 `WateringReminderSheet` 浇水提醒的旧行为不变。

返回字段：

- `nextWaterDate`：下次浇水日期 'YYYY-MM-DD' 或 null（WET 阻断时为 null）
- `nextWaterWindow`：[minDays, maxDays] 建议窗口
- `nextWaterReason`：人类可读的推算理由
- `wateringContext`：`likely_too_wet` / `likely_too_dry` / `keep_baseline_or_check_soil`
- `action`：对应 action 枚举
- `amountClass`：水量等级 `unknown` / `mist` / `small` / `normal` / `thorough`
- `amountRangeMl`：[minMl, maxMl] 水量区间
- `stopCondition`：停止浇水条件描述
- `confidenceLevel`：`low` / `normal` / `high`
- `reasonCodes`：原因码数组（如 `OVERWATERING_RISK_WARNING`、`CHECK_SOIL_BEFORE_WATERING`、`INCREASE_WATERING_FREQUENCY` 等）
- `effectiveHydrationLoad`：有效水合负载（0~1+）
- `wetPressureLoad`：湿压负载（0~1+）
- `lastEffectiveRootWateredDaysAgo`：距上次有效根区浇水天数（null 表示无记录）
- `rootZoneMoistureIndex`：根区湿度指数（0~1）

WET 阻断逻辑：

- WET（偏湿/过浇）时 `nextWaterDate` 返回 null，不推导具体浇水日期
- 前端检测到 WET 后禁用"添加至日历"按钮，提示"近期过浇，暂不安排浇水"
- WET 触发条件（任一满足）：
  1. 根区湿度指数 > 0.6 且湿压负载 > 0.4
  2. 浇透 + 近日期（≤3天）+ 强偏湿天气（≥2 种命中）
  3. 无排水孔 + 窄底盆 + 根区湿度偏高（>0.5）
  4. 根区湿度极高（>0.8）+ 近期有效浇水（≤2天）
- `nextWaterDate` 所有分支均 clamp 到不早于 referenceDate + 1（明天）

盆型档案读写（折叠进 /user-plants，无独立接口）：

- 盆型字段随 `GET /user-plants` 列表/详情一并返回，挂在每个 item 的 `potProfile` 对象上
- 盆型写入通过 `PATCH /user-plants`（与 nickname / location 等字段共用同一写口），后端 `updateUserPlantInstance` 识别盆型字段并单独写入主表列，保留 `pot_profile_version = pot_profile_version + 1` 版本自增语义
- 盆型档案保存在 `user_plant_instances` 主表盆型列，不保存到单次 watering event
- 字段：`potTopDiameterCm`、`potBottomDiameterCm`、`potHeightCm`（可选）、`hasDrainageHole`、`potMaterial`、`substrateType`
- `substrateType` 对应 SQL 字段 `substrate_type`，当前允许两类值：单值字符串（如 `general` / `peat` / `unknown`）或 JSON 数组字符串（多选基质 + 比例）。后端读取 JSON 数组字符串时会解析为 `substrateComposition` 返回给前端；该字段不得再用固定枚举 CHECK 阻断 JSON 数组。
- `genus_care_profiles.watering_way_quantization_json` 是 `watering_strategy_json.way/freq` 的量化扩展，必须包含 `wayClass`、`depletionTrigger`、`targetMoistureMid`、`wetTolerance`、`dryTolerance`、`amountPolicy`、`nextActionClass`、`seasonalGate`，不替代 `watering_strategy_json` 事实源。

天气数据流：

- 前端 `WateringReminderSheet` 在点击"上次浇水"入口时调 `getEnvironmentWeatherWindow({ mode: 'environment' })`
- `historicalDays` → `weatherDays` → planner `historical`
- `forecastDays` → `forecastDays` → planner `forecast`
- 后端 `buildWeatherSummary` 从日数据提取 highHumidityDays/coldHumidDays/rainyDays/hotDryDays 等摘要

性能优化：

- 接口不走 `getUserPlantInstanceById`（3 次串行 SQL），改用 `getUserPlantWateringStrategy`（含主表盆型列查询）
- 不查 `watering_events_json`、不查 `alias_summary`

实现约定：

- 数据层字段 `watering_events_json` 为未来发布前需持久化的字段；读写均具备 try/catch 容错，列不存在时不阻断主流程
- `plant-user-http` 的 `POST /user-plants/watering-planner` 为纯调度接口，不直接修改用户植物主数据
- `src/store/plants.js` 的 `completeWatering` 已下线旧前端平均值公式，改写回 planner 产出的 `nextWaterDate`

### 7.2.2 `GET/POST /user-plants/watering-reminders`

本接口只处理系统日历已创建后的应用内提醒状态，不替代 `/watering-planner` 纯计算职责。

- `GET` 需要 `plantId`，只返回当前 openid 名下该植物的最新 active 且未过期水提醒；无权限返回 404。
- `POST` 必须在前端 `uni.addPhoneCalendar` 成功后调用，保存 `plantId`、`planId`、`lastWatered`、`nextWaterDate`、`nextWaterTime/nextTime`、最近浇水事件集合、planner 结果详情和 calendar payload。
- `POST` 会将同一植物既有 active 水提醒标记为 `superseded`，再插入新提醒，并同步 `user_plant_instances.last_watered/next_water`。
- `GET /user-plants` 列表会附带紧凑 `wateringReminder`；若新表在旧环境缺失，列表降级为无提醒状态，不阻断植物列表加载。
- 一次性水提醒以 `nextTime` 过期，前端不得使用 `repeat=true` 维持长期高亮。

事实源：

```text
cloudfunctions/layer/utils/watering-planner.js
cloudfunctions/layer/utils/pot-geometry.js
cloudfunctions/layer/utils/hydration-load.js
cloudfunctions/diagnose-http/utils/environment-context-v7.js
cloudfunctions/plant-user-http/app.js
cloudfunctions/layer/utils/plant-knowledge.js
src/pages/index/components/WateringReminderSheet.vue
src/store/plants.js
```

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
