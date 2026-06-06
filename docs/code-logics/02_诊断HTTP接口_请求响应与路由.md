# 02｜诊断 HTTP 接口、请求响应与路由

更新时间：2026-06-06

## 1. HTTP 入口总览

当前问诊相关的核心入口是：

- `/diagnosis/start`：从图片/既有上下文进入诊断主链。
- `/diagnosis/question/start`：从手动症状模式进入问诊，当前黄叶 4 题题包由此入口产生。
- `/diagnosis/answer`：提交 follow-up 回答后重跑诊断主链。

这些入口不是同一套响应包装路径，差异会影响题包是否能完整透出。

## 2. `/diagnosis/start`

`handleDiagnosisStart` 调用 `runStartDiagnosis`，随后经过 `presentDiagnosisRoundResponse`，最后调用 `buildFrontendResponse`。该路径会进入 presenter 的公开响应整理逻辑。

代码来源：`cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` 32-57。

## 3. `/diagnosis/question/start`

`handleDiagnosisQuestionStart` 调用 `runQuestionStartDiagnosis` 后，直接调用 `buildFrontendResponse`，没有经过 `presentDiagnosisRoundResponse`。

代码来源：`cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` 67-104。

这个差异是黄叶 4 题题包能从手动入口完整到前端的关键原因之一：`question-start` fast path 已经把 `followUps` 与 `questionPackage` 放进 result，handler 直接交给前端响应构造层。

## 4. `/diagnosis/answer`

`handleDiagnosisAnswer` 调用 `runAnswerDiagnosis`，随后经过 `presentDiagnosisAnswerResponse`，最后调用 `buildFrontendResponse`。

代码来源：`cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` 114-140。

回答入口会做严格归属校验：必须有 `diagnosisSessionId`，必须加载 session，必须校验当前轮次、问题 key、option key 与 follow-up 归属。该入口不能被文档描述成“前端传什么答案都可进入 route 重算”。

## 5. 手动症状模式入口

`runQuestionStartDiagnosis` 的当前事实：

1. `resolveManualSymptomMode` 从 `symptomClassKey` 解析固定手动症状模式，并校验可选 `symptomKey`。
2. 构造 `manual_symptom_mode` 的 observed symptom 与 observed evidence。
3. 优先尝试 `buildManualQuestionStartRoundResult`。
4. 若 fast path 未命中，则 fallback 到 `runDiagnosisRound`，stage 为 `preliminary`。
5. 最后持久化 round runtime。

代码来源：`cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js` 14-112、139-260。

## 6. 当前响应契约

`buildFrontendDiagnosisResponse` 的关键逻辑：

- 当 `publicResponse.followUpRequired` 为 true 时，读取 `resolveResponseQuestions(publicResponse)`。
- 尝试构造黄叶 `questionPackage`。
- 有题包时按 `questionPackage.questionCount` 保留 follow-up；无题包时默认只保留 1 题。
- 返回 `questions`、`followUpQuestions`、`questionPackage` 与 `uiHints`。

代码来源：`cloudfunctions/diagnose-http/app/frontend-response.js` 341-390；题包构造来源 `cloudfunctions/diagnose-http/app/question-package-response.js` 3-67。

## 7. 文档必须保留的接口差异

| 入口 | 是否经过 presenter | 常规题数 | 黄叶题包 |
|---|---:|---:|---|
| `/diagnosis/start` | 是 | 1 | 不作为黄叶题包主入口 |
| `/diagnosis/question/start` | 否，直接 `buildFrontendResponse` | 1 或 fast path | 可一次性返回 4 题题包 |
| `/diagnosis/answer` | 是 | 1 | 提交答案后重算；后端校验仍受 queue/持久化约束 |

## 8. 风险边界

文档必须明确：黄叶 4 题包是“响应与前端支持”的事实，但当前后端 queue 与持久化校验并未完全包级化。若产品要求真正一次性提交 4 题并全量通过后端归属校验，需要同步改 `questionQueue` 规划、`appendFollowUpQuestions` 过滤与 `validateFollowUpAnswerOwnership`。
