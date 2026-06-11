# 02｜诊断 HTTP 接口、请求响应与路由

更新时间：2026-06-07

## 1. HTTP 入口总览

当前问诊相关的核心入口是：

- `/diagnosis/start`：从图片/既有上下文进入诊断主链。
- `/diagnosis/question/start`：从手动症状模式进入问诊，当前黄叶 4 题题包与枯萎/发蔫 5 题题包由此入口产生。
- `/diagnosis/answer`：提交题包答案或非 package 当前回答后重跑诊断主链。

这些入口不是同一套响应包装路径，差异会影响题包是否能完整透出。

## 2. `/diagnosis/start`

`handleDiagnosisStart` 调用 `runStartDiagnosis`，随后经过 `presentDiagnosisRoundResponse`，最后调用 `buildFrontendResponse`。该路径会进入 presenter 的公开响应整理逻辑。

代码来源：`cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` 32-57。

## 3. `/diagnosis/question/start`

`handleDiagnosisQuestionStart` 调用 `runQuestionStartDiagnosis` 后，直接调用 `buildFrontendResponse`，没有经过 `presentDiagnosisRoundResponse`。

代码来源：`cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` 67-104。

这个差异是固定题包能从手动入口完整到前端的关键原因之一：`question-start` 的静态题包启动路径已经把 `questions` 与 `questionPackage` 放进 result，handler 直接交给前端响应构造层。当前已覆盖 `yellow_leaf` 4 题和 `wilting_droop` 5 题。

## 4. `/diagnosis/answer`

`handleDiagnosisAnswer` 调用 `runAnswerDiagnosis`，随后经过 `presentDiagnosisAnswerResponse`，最后调用 `buildFrontendResponse`。

代码来源：`cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` 114-140。

回答入口会做严格归属校验：必须有 `diagnosisSessionId`，必须加载 session，必须校验当前轮次、问题 key、option key 与题包 snapshot 或非 package 当前行归属。package answer submit 会作为当前题包轮次的终止提交状态传入诊断引擎；该入口不能被文档描述成“前端传什么答案都可进入 route 重算”。

## 5. 手动症状模式入口

`runQuestionStartDiagnosis` 的当前事实：

1. `resolveManualSymptomMode` 从 `symptomClassKey` 解析固定手动症状模式，并校验可选 `symptomKey`。
2. 若命中 `yellowing_mode`，固定用 `static-question-package-start.js` 构造模块级静态 4 题 `yellow_leaf` package；若命中枯萎/发蔫模式，构造 5 题 `wilting_droop` package，`sourceMode` 为 `manual_wilting_droop_route_package`。
3. 默认路径通过 `persistRoundRuntime(..., { questionPackageSnapshotOnly: true })` 保存题包 snapshot；该静态路径不加载 prior repository、manual fast path 或 `diagnosis-engine`。
4. 当前未配置固定题包的手动模式返回 501，不再把 start 主路径转入 `runDiagnosisRound`。

代码来源：`cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js` 3-20、148-170、173-328；`cloudfunctions/diagnose-http/app/static-question-package-start.js` 82-119、159-233。

## 6. 当前响应契约

`buildFrontendDiagnosisResponse` 的关键逻辑：

- 读取 `resolveResponseQuestions(publicResponse)`；该 helper 只接受 `publicResponse.questions`。
- 通过 `getQuestionPackageByMode(mode)` 尝试构造固定 `questionPackage`。
- 有题包时按 `questionPackage.questionCount` 保留 `questions`；无题包时默认只保留 1 题。
- package 响应返回 `questions`、`questionPackage` 与 `uiHints`。

代码来源：`cloudfunctions/diagnose-http/app/frontend-response.js` 341-390；题包构造来源 `cloudfunctions/diagnose-http/app/question-package-response.js` 5-82。

## 7. 文档必须保留的接口差异

| 入口 | 是否经过 presenter | 常规题数 | 固定题包 |
|---|---:|---:|---|
| `/diagnosis/start` | 是 | 1 | 不作为手动固定题包主入口 |
| `/diagnosis/question/start` | 否，直接 `buildFrontendResponse` | 非 package 当前不转入 start 当前诊断 | 静态 package start 返回 active `questions`：黄叶 4 题，枯萎/发蔫 5 题 |
| `/diagnosis/answer` | 是 | 1 | 整包提交后重算或进入专用 resolver；后端按 package snapshot ownership 校验 |

## 8. 风险边界

文档必须明确：黄叶 4 题包与枯萎/发蔫 5 题包已经是 `getQuestionPackageByMode(mode)` 驱动的固定 package 协议，响应、前端展示/提交、package snapshot 与归属校验均应允许包内全部题目。黄叶 4 题语义不因新增 `wilting_droop` 改变。非 package 当前路径仍按单题 package state-anchor 语义工作，不能把 package 规则外推到所有模式。
