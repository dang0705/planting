---
title: 代码逻辑与架构
summary: 记录诊断主链、路由输出、鉴权边界与仓储/服务约束；所有条目均按“可追溯事实 / 规则 / 决策 / 观察”分层。
updatedAt: '2026-06-05'
tags: []
---

## Facts

- id: code_logic_route_entrypoint
  type: fact
  statement: `diagnose-http` 运行时入口是 `cloudfunctions/diagnose-http/app.js`，路由覆盖 `/diagnosis/start`、`/diagnosis/question/start`、`/diagnosis/answer`、`/diagnosis/result`、`/diagnosis/history`、`/diagnosis/review/*`、`/visual/out-of-pool/*`、`/stream/diagnose` 与 `/diagnose`。
  source:
    file: cloudfunctions/diagnose-http/app.js
    symbol: main
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: code_logic_diagnosis_engine_entry
  type: fact
  statement: 诊断主链执行函数位于 `cloudfunctions/diagnose-http/domain/diagnosis-engine.js` 的 `main` 导出链路，并与 `app/http-router` 的业务处理器组合形成请求闭环。
  source:
    file: cloudfunctions/diagnose-http/domain/diagnosis-engine.js
    symbol: module.exports.main
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: code_logic_output_contract
  type: fact
  statement: 输出口径优先使用 `visibleOutcomes` / `visibleOutcomeKeys`；`buildPublicRouteFinalResult` 会将旧 `primaryOutcome`/`secondaryOutcomes` 与新可见字段合并并优先保留可显示结果。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: buildPublicRouteFinalResult
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: code_logic_weather_cache
  type: fact
  statement: 天气上下文读取使用 `weather_cache` 表（`cache_scope=user` 或 null）并要求 `expires_at > CURRENT_TIMESTAMP`，返回 `source: 'weather_cache'`。
  source:
    file: cloudfunctions/diagnose-http/repositories/weather-repository.js
    symbol: getFreshCachedWeatherContext
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: code_logic_storage_validation
  type: fact
  statement: `storage-http/app.js` 对上传数据进行格式校验（必须为 `data:image/...;base64`，并通过白名单后缀解析），通过 CloudBase 写入，后续读取返回 temp URL。
  source:
    file: cloudfunctions/storage-http/app.js
    symbol: parseImageDataUrl
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: code_logic_layer_boundary
  type: fact
  statement: 诊断链路核心服务复用 `cloudfunctions/layer` 公共能力；业务函数通过 `/opt/utils/*` 导入统一的 http/鉴权/数据库封装。
  source:
    file: cloudfunctions/diagnose-http/app/http-router.js
    symbol: require('/opt/utils/http')
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: verified

## Rules

- id: doc_sync_matrix
  type: rule
  statement: 任何主链、路由结果、接口约束或文档对齐变更，需对应更新 `docs/code-logics` 03/04/05/06/07 及 `02/07/08/10` 相关阅读链路。
  source:
    file: docs/code-logics/00_文档总索引_与阅读顺序.md
    symbol: reading chain guidance
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: provisional

- id: route_visibility
  type: rule
  statement: 非 `visibleOutcomes` 的展示字段不应作为前端公开主链口径的首选来源；必须经过主路由决策可见性合并。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: buildPublicRouteFinalResult
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: data_status_policy
  type: rule
  statement: route/question/symptom/prior 使用 `audited` 与 `partial` 的数据来源策略，必须保持兼容旧数据的 `dataStatus` 维持行为。
  source:
    file: cloudfunctions/diagnose-http/domain/diagnosis-engine.js
    symbol: runDiagnosisRound
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: provisional

## Decisions

- id: route_authority_decision
  type: decision
  statement: 通过 `isAuthoritativeRouteDecision` 判定“可权威输出”与降级路径（有 `fallbackPolicy` 时不视为权威）。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: isAuthoritativeRouteDecision
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: superseded
  superseded_by: route_contract_decision

- id: output_integration_decision
  type: decision
  statement: 路由决策优先在结果层面做收敛，非权威分支采用 `uncertain`/降级输出避免误导用户。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: buildPublicRouteFinalResult
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: superseded
  superseded_by: route_contract_decision

- id: integration_decision
  type: decision
  statement: 采用 `route-planned-followup` 与 `question-selector` 分离职责的架构，统一从 `diagnosis-engine` 与诊断 handlers 串接。
  source:
    file: cloudfunctions/diagnose-http/domain/route-planned-followup-resolver.js
    symbol: buildRoutePlannedFollowUps
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: provisional

- id: visible_outcomes_public_contract_decision
  type: decision
  adr_id: ADR-002
  statement: `visibleOutcomes` 与 `visibleOutcomeKeys` 是公开主出口，`primaryOutcome`/`secondaryOutcome` 仅用于兼容映射，前端显示不得恢复“核心/备选”分区。
  source:
    file: docs/code-logics/07_结果格式化_公开响应_前端接入契约.md
    symbol: 7.2 `visibleOutcomes` 唯一公开出口
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified
  supersedes: route_contract_decision

- id: route_contract_decision
  type: decision
  statement: route 作为唯一主收敛机制：`ranking`/`scoreGap` 仅保留审计含义，`routeDecision` 决定 follow-up 与 final，公开结果仅允许 `visibleOutcomes` 及其 keys。主链不再通过 top 排名倒推输出。
  source:
    file: docs/code-logics/06_问题排序_证据计分_输出守卫.md
    symbol: 本轮 route-only 收敛补充 / 3.1 旧 ranking 口径已废止
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: superseded
  supersedes:
    - route_authority_decision
    - output_integration_decision
  superseded_by: visible_outcomes_public_contract_decision

- id: route_reasoning_entry_decision
  type: decision
  statement: 将主逻辑从“ranking 选单问题”切为“候选 outcome + route path + gate 收敛”；route 追问与收敛必须来源于 `routeDecision` 与 `nextQuestionKeys`，不能按 top1/scoreGap 直接返回 final。
  source:
    file: docs/route规划及outcome瘦身计划/00_总览_阅读顺序.md
    symbol: 路由主链将主链从 ranking 迁移为 route path 收敛
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: superseded
  superseded_by: route_contract_decision

- id: weather_window_contract_decision
  type: decision
  adr_id: ADR-003
  statement: 诊断与养护窗口使用双时间口径：`D-10 ~ D-1` 历史窗口用于回溯分析，`D0 ~ D+14` 用于未来养护建议；`D0` 作为当天行为/建议上下文与急性事件辅助，不替代滞后症状的历史判定主证据。
  source:
    file: cloudfunctions/weather-http/services/weather-window-service.js
    symbol: buildEnvironmentWeatherWindow
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: yellowing_path_constraint_decision
  type: decision
  statement: 黄叶入口必须先完成养护/环境实证分组（浇水、光照、施肥、通风/湿度、进展速度）后再可公开 `visibleOutcomes`；单题 `yellowing_care_area_gate` 等聚合题不再作为独立闭合触发口。
  source:
    file: docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
    symbol: 黄叶养护 route 的单个上下文题不能直接闭合 outcome
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

## Observations

- id: max_questions_in_round
  type: observation
  statement: 代码中存在多处 `maxQuestions` 处理链（含高置信流程、候选问题组、follow-up），默认配置源自 `constants/scoring`，但局部路径可能传入不同上限，需要持续校验。
  source:
    file: cloudfunctions/diagnose-http/constants/scoring.js
    symbol: routeSelection.maxQuestionsPerRound
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: observation

- id: catalog_source_alignment
  type: observation
  statement: 识别服务 `identify-http/app.js` 自己实现 Baidu 识别与 `findCanonicalPlantMatch`，当前未在 `diagnose-http` 代码中直接调用同名识别流水线。
  source:
    file: cloudfunctions/diagnose-http/app.js
    symbol: cross-reference absence (no identify-http imports)
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: observation

- id: catalog_source_consistency_gap
  type: observation
  statement: “植物名录服务必须与离线基线一致”目前更偏治理约束口径，未在当前 `diagnose-http` 代码中直接读取到“单点真源比对”规则。
  source:
    file: docs/new-rules/planting_ai_diagnosis_all_in_one.md
    symbol: pending-verification
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: low
  status: observation
