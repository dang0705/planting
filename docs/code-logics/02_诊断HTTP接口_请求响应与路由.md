# 02 诊断 HTTP 接口、请求响应与路由

> 文档口径：本组文档基于 `Archive 2.zip` 中可见的 CloudBase 云函数代码、`rules.zip` 中的实施规范、以及现有粗文档 `diagnosis-runtime-code-logic.md` 整理。中文概念优先，英文函数名、字段名、路径只用于定位代码。
>
> 重要限制：压缩包内未发现 uni-app/小程序前端页面源码，因此前端实现只能按后端接口契约、返回结构和小程序接入规范反推，不写成“已确认源码行为”。

## 一、诊断服务入口

入口文件：`cloudfunctions/diagnose-http/app.js`。`main(event, context)` 负责解析 CloudBase HTTP 请求、路径、方法、query、body、当前用户身份，然后按路径分发到对应 handler，最后返回统一 JSON 或 SSE 响应。

## 二、主要路由

| 路由片段 | 处理函数 | 说明 |
|---|---|---|
| `/health` | 健康检查 | 返回服务可用状态和重构准备状态 |
| `/diagnosis/start` | `handleDiagnosisStart()` | 开始一次诊断，通常包含图片、植物上下文、客户端上下文 |
| `/diagnosis/question/start` | `handleDiagnosisQuestionStart()` | 无图症状模式直接创建问诊，不调用视觉模型 |
| `/diagnosis/answer` | `handleDiagnosisAnswer()` | 提交某一轮追问答案，进入下一轮诊断 |
| `/diagnosis/result` | `handleDiagnosisResult()` | 读取指定诊断结果 |
| `/diagnosis/history` | `handleDiagnosisHistory()` | 读取用户诊断历史 |
| `/diagnosis/feedback` | `handleDiagnosisFeedback()` | 保存用户对结果的反馈 |
| `/diagnosis/review/list` | `handleDiagnosisReviewList()` | 审计用诊断会话列表 |
| `/diagnosis/review/images` | `handleDiagnosisReviewImages()` | 审计用图片列表 |
| `/diagnosis/review/detail` | `handleDiagnosisReviewDetail()` | 审计用诊断详情 |
| `/diagnosis/review/import` | `handleDiagnosisReviewImportBatch()` | 批量导入审计结果 |
| `/visual/out-of-pool/list` | `handleOutOfPoolCandidateList()` | 池外视觉候选列表 |
| `/visual/out-of-pool/image` | `handleOutOfPoolCandidateImage()` | 池外候选图片读取 |
| `/visual/out-of-pool/review` | `handleOutOfPoolCandidateReview()` | 池外异常审核 |
| `/visual/out-of-pool/proxy-mappings/list` | `handleOutOfPoolProxyMappingList()` | 池外 proxy 映射列表 |
| `/visual/out-of-pool/proxy-mappings/upsert` | `handleOutOfPoolProxyMappingUpsert()` | 新增或更新池外 proxy 映射 |
| `/visual/out-of-pool/proxy-mappings/disable` | `handleOutOfPoolProxyMappingDisable()` | 禁用池外 proxy 映射 |
| `/stream/diagnose` | `handleDiagnosisStartStream()` | 流式诊断进度输出 |
| `/diagnose` | `handleLegacyDiagnose()` / `handleLegacyDiagnoseStream()` | 旧诊断接口兼容 |

## 三、开始诊断主流程

`handleDiagnosisStart()` 调用 `runStartDiagnosis()`，流程是：

1. 解析图片输入。支持结构化 `images` / `imageInputs`，也兼容 `imageIds` 和单个 `image`。
2. 解析植物上下文，包括 `plantId`、`userPlantId`、植物显示名、属、科、类目、养护基线等。
3. 调用视觉诊断服务，将图片送入视觉分析并持久化批次结果。
4. 把视觉聚合结果传入 `runDiagnosisRound()`。
5. 持久化本轮运行时、问题队列、结果和会话状态。
6. 通过 presenter 返回公开响应。

图片输入归一函数包括 `normalizeUploadCompression()`、`resolveVisualImageInputs()`、`resolveImagesFromPayload()`。

### 3.1 无图症状模式直接问诊入口

`POST /diagnosis/question/start` 是正式无图症状模式直接诊断入口，前端正式入口为 quick select `id="3ef72261--diagnose-dev-symptom-class-quick-select"`。该接口用于用户主动选择症状模式后直接进入问诊：

1. 不调用 `/diagnosis/start`。
2. 不走 `/stream/diagnose`、SSE 进度弹窗或视觉模型。
3. 初始证据来源写为 `sourceType=manual_symptom_mode`，表示用户选择的症状证据，不是视觉证据。
4. 接口返回首轮问诊或可公开结果；后续用户答案继续走 `/diagnosis/answer`。
5. QA 验收必须覆盖：点击 quick select 后进入问诊、没有 AI/SSE 过程、会话证据中存在 `manual_symptom_mode`、后续回答链路仍由 `/diagnosis/answer` 推进。

## 四、回答追问主流程

`handleDiagnosisAnswer()` 调用 `runAnswerDiagnosis()`，流程是：

1. 校验用户身份。
2. 读取会话状态。
3. 校验本次回答是否属于当前会话和当前问题。
4. 标记问题答案，推进 answer revision。
5. 从会话中恢复上一轮植物上下文、视觉批次、已观察证据、症状模式状态、已问问题等。
6. 再次调用 `runDiagnosisRound()`。
7. 持久化新一轮运行时与会话状态。
8. 返回下一题或最终结果。

## 五、公开响应裁剪

`buildFrontendDiagnosisResponse()` 把完整领域响应裁剪成前端稳定结构，保留会话轮次、是否需要追问、本轮问题、最终结果卡片、摘要卡片、建议步骤、避免事项、视觉批次追踪、视觉聚合摘要和输出资格摘要。

前端不应直接依赖完整领域对象中的私有字段，否则后端内部重构会拖累页面。

## 六、SSE 流式输出

`/stream/diagnose` 与旧 `/diagnose` 的流式模式使用 `createSseEmitter()`、`buildVisualProgressContent()`、`createVisualStreamBridge()`。流式输出只负责体验层进度反馈，最终业务结果仍以 `runDiagnosisRound()` 为准。

## 七、review 与 answer 契约（本轮修复补充）

### `/diagnosis/review/detail`

`handleDiagnosisReviewDetail()` 返回审计详情时，必须把可选片段的读取改为“超时/异常不拖垮主响应”模型：

1. 所有可选片段（如图片批次、图片摘要、规则摘要、路由决策快照、问题队列）按独立异步任务或容错路径读取。
2. 任一片段超时或异常时，整体接口仍返回 HTTP 200，且附带：
   - `partial: true`
   - `degradedSections: [{ section, reason }]`
3. 只要主链路 session 数据可读，`/diagnosis/review/detail` 不得返回 500；失败归因需写入函数日志。
4. 前端展示层必须按 `partial` 与 `degradedSections` 进行降级展示，不能用单段异常阻断详情页。

### `/diagnosis/review/list`

`handleDiagnosisReviewList()` 主查询改为“列表专用紧凑输出”：

1. 列表主响应默认返回 compact payload，包含列表行元信息与可读索引字段，不再返回完整 `coreSummary`、`routeDecisionSummary` 等重载字段。
2. 图片二进制/大对象、深度路由摘要、过往快照大字段仅在 `/diagnosis/review/images` 或 detail 按需补齐。
3. 列表侧必须支持 SQL fallback：超时或查询失败返回降级空列表时保持 200，并在 `degradedSections`/日志里记录原因，避免前端空白。

### `/diagnosis/review/images`

审计页图片数据采用 lazy fetch，图片接口只返回图片级最小元数据和可用性标志；列表与详情不得依赖一次性 inline 重放图。

### `/diagnosis/answer`

`handleDiagnosisAnswer()` 的 answer-only / no-image 场景按以下约定执行：

1. 增加 timing 指标（函数内和子链路耗时），用于监控 P50/P95。
2. 命中 warm path 时启用 route fast path 与静态 route/outcome 缓存，避免重复做完整慢链路。
3. `answer` 与 `queue` 持久化允许并行化，减少整体尾延迟，目标将无图追问路径控制在 1 秒以内。
