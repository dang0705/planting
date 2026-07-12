---
title: 系统逻辑总览
summary: 诊断主链结构、路由映射与公开输出收敛规则的高信任入口。
updatedAt: '2026-06-05'
---

## Facts

- id: system_route_set
  type: fact
  statement: `diagnose-http` 应用路由按路径承载诊断主链、问答链路、结果读取、review 与可视化 out-of-pool 分支。
  source:
    file: cloudfunctions/diagnose-http/app.js
    symbol: main
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: system_output_authority
  type: fact
  statement: 主公开输出由 `routeDecision` / `visibleOutcomes` 收敛，非权威分支应采用降级路径并避免强行回填历史主输出字段。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: buildPublicRouteFinalResult, mergeVisibleOutcomeEntries
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: system_question_mode
  type: fact
  statement: `route-planned` 与 `question-selector` 流中存在 `routeSelection.maxQuestionsPerRound` 的默认预算，当前配置来源为 `constants/scoring.js`（约束值为 1）。
  source:
    file: cloudfunctions/diagnose-http/constants/scoring.js
    symbol: routeSelection.maxQuestionsPerRound
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: verified

## Rules

- id: route_authority_rule
  type: rule
  statement: 非权威路径不能直接回填旧 `primary/secondary` 显示逻辑；必须走公开输出口径。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: buildPublicRouteFinalResult
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: manual_symptom_rule
  type: rule
  statement: `/diagnosis/question/start` 默认以手动症状模式切入，允许在不依赖图片视觉模型前给出初始症状链路。
  source:
    file: cloudfunctions/diagnose-http/app/manual-symptom-question-start-fast-path.js
    symbol: buildRoutePlannedFollowUps
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: verified

- id: review_rule
  type: rule
  statement: review/detail 与 out-of-pool 分支应允许片段化读取与降级展示，防止单点缺失导致整页不可用。
  source:
    file: cloudfunctions/diagnose-http/repositories/diagnosis-review/detail-loaders.js
    symbol: degradedSections
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: provisional

## Decisions

- id: architecture_decision
  type: decision
  statement: 系统在公开层面优先 route-aware 输出策略，而不是静态按单条候选问题/症状进行逐条展示。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: buildPublicRouteFinalResult
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: superseded
  superseded_by: route_only_convergence_decision

- id: route_only_convergence_decision
  type: decision
  adr_id: ADR-001
  statement: 路由主链接管最终收敛：`routeDecision` 决定追问与是否 final，`visibleOutcomes/visibleOutcomeKeys` 是权威公开出口；`ranking` 与 `scoreGap` 不再作为主判定依据。
  source:
    file: docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
    symbol: 第18a-1 visibleOutcomes 唯一出口契约
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified
  supersedes: architecture_decision

- id: followup_budget_route_decision
  type: decision
  statement: 追问预算收敛为“每轮最多 1 个问题、全局最多 2 轮”；超预算后走保守兜底，不再强补追问。
  source:
    file: docs/route规划及outcome瘦身计划/00_总览_阅读顺序.md
    symbol: 最多 2 轮问诊，每轮 1 个问题
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

## Observations

- id: status_note
  type: observation
  statement: "`system_logic_overview.md` 与 `docs/code_logics` 的细节会随路由行为迭代而变化，当前内容为 2026-06-05 的执行态快照，应按版本化变更触发重验。"
  source:
    file: .brv/context-tree/architecture/system_logic/system_logic_overview.md
    symbol: system_route_set
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: observation
