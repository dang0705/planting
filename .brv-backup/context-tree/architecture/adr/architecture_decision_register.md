---
title: 架构决策记录
summary: 用 ADR 编号串联项目关键决策、废弃链与演化史，避免 Decision 只剩散点。
updatedAt: '2026-06-05'
tags:
  - adr
  - architecture
  - decisions
---

## Facts

- id: adr_registry_policy
  type: fact
  source_kind: code
  statement: ADR 只作为决策编号与演化索引层，不替代 `decision` 结构本身；稳定做法是保留 `type: decision`，为关键条目增加 `adr_id`。
  source:
    - file: .brv/context-tree/architecture/adr/architecture_decision_register.md
      symbol: adr_registry_policy
      lines: 13-21
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: adr_supersede_policy
  type: fact
  source_kind: code
  statement: 任何新 ADR 都必须显式连接 `supersedes` / `superseded_by` 链，避免决策漂移后仍被当成当前事实。
  source:
    - file: .brv/context-tree/architecture/adr/architecture_decision_register.md
      symbol: adr_supersede_policy
      lines: 25-31
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

## Rules

- id: adr_numbering_rule
  type: rule
  statement: 关键决策进入 ADR 时应使用稳定编号，例如 `ADR-001`，并保持同一编号跨文档引用一致。
  source:
    file: .brv/context-tree/architecture/adr/architecture_decision_register.md
    symbol: adr_registry_policy
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: adr_scope_rule
  type: rule
  statement: 只有会影响主链、公开契约、鉴权边界、测试门禁、治理流程的决策才进入 ADR；局部实现细节仍留在各主题文件。
  source:
    file: .brv/context-tree/architecture/adr/architecture_decision_register.md
    symbol: adr_registry_policy
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

## Decisions

- id: adr_route_convergence_decision
  type: decision
  adr_id: ADR-001
  statement: 主链收敛为 route path 与 `visibleOutcomes` 公开出口，排序字段仅保留审计意义，不再倒推公开结果。
  source:
    file: .brv/context-tree/docs/code_logics/code_logics_and_architecture.md
    symbol: route_contract_decision
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified
  supersedes:
    - route_authority_decision
    - output_integration_decision
    - route_reasoning_entry_decision
  superseded_by: adr_visible_outcomes_contract_decision

- id: adr_visible_outcomes_contract_decision
  type: decision
  adr_id: ADR-002
  statement: `visibleOutcomes` 与 `visibleOutcomeKeys` 是公开主出口；`primaryOutcome` / `secondaryOutcome` 仅作当前映射，不再恢复核心/备选分区。
  source:
    file: .brv/context-tree/docs/code_logics/code_logics_and_architecture.md
    symbol: visible_outcomes_public_contract_decision
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified
  supersedes: adr_route_convergence_decision

- id: adr_weather_window_decision
  type: decision
  adr_id: ADR-003
  statement: 天气与养护窗口采用双时间口径，`D-10 ~ D-1` 作为历史回溯窗口，`D0 ~ D+14` 作为未来建议窗口，`D0` 只承担当天上下文辅助。
  source:
    file: .brv/context-tree/docs/code_logics/code_logics_and_architecture.md
    symbol: weather_window_contract_decision
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: adr_clickup_fact_source_decision
  type: decision
  adr_id: ADR-004
  statement: 任务执行的硬约束与验收口径以 ClickUp 为第一事实来源，dispatch-task 优先读取 ClickUp 原文并保留 checklist / acceptance 细节。
  source:
    file: .brv/context-tree/project_management/setup_rules/project_setup_and_rules.md
    symbol: clickup_is_primary_fact_source_decision
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: superseded
  superseded_by: adr_release_ops_thread_reuse_decision

- id: adr_release_ops_thread_reuse_decision
  type: decision
  adr_id: ADR-005
  statement: 发布与验收优先复用同一 release_ops 或替代线程，统一部署、烟雾与 requestId 追踪，避免审计链路断开。
  source:
    file: .brv/context-tree/project_management/setup_rules/project_setup_and_rules.md
    symbol: release_ops_thread_reuse_decision
  verified: 2026-06-05
  review_after: 180d
  owner: project-management
  confidence: medium
  status: verified
  supersedes: adr_clickup_fact_source_decision

- id: adr_scripted_testing_decision
  type: decision
  adr_id: ADR-006
  statement: 单测主策略采用脚本化执行与明确脚本门禁，Node 进程内优先，`test:ci` 作为默认门禁，必要时由 `test-all` 扩展覆盖。
  source:
    file: .brv/context-tree/testing/unit_strategy/unit_test_strategy.md
    symbol: testing-strategy
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: provisional

## Observations

- id: adr_gap_observation
  type: observation
  statement: 当前 ADR 已能覆盖主链、公开契约、天气窗口、ClickUp 事实源、release_ops 与测试门禁；后续优先补“问诊模式演化史”“养护系统演化史”“历史坑位复盘”。
  source:
    file: .brv/context-tree/architecture/adr/architecture_decision_register.md
    symbol: adr_registry_policy
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: observation
