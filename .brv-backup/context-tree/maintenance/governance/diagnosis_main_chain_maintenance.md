---
title: Diagnosis Main Chain Maintenance
summary: 诊断主链变更联动规则与审计降级边界，按可执行映射管理。
updatedAt: '2026-06-05'
tags: []
---

## Facts

- id: maintenance_route_conservative
  type: fact
  statement: 非权威路径回填时，当前代码路径更倾向使用 partial/degraded 形态，避免直接覆盖主公开结果。
  source:
    file: cloudfunctions/diagnose-http/repositories/diagnosis-review/detail-loaders.js
    symbol: degradedSections
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: verified

## Rules

- id: maintenance_review_contract
  type: rule
  statement: 主链变更文档映射要求覆盖 `docs/code-logics` 的 03~07 主题范围，涉及接口、公开字段与平台约束时分流到 02/07/08/10。
  source:
    file: .brv/context-tree/project_management/setup_rules/project_setup_and_rules.md
    symbol: docs mapping guidance
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: provisional

- id: change_sync_rule
  type: rule
  statement: 与主链、公开结果、会话持久化相关修改应至少同步一份文档映射记录，不得仅改代码不改可追溯说明。
  source:
    file: .brv/context-tree/maintenance/governance/diagnosis_main_chain_maintenance.md
    symbol: maintenance_review_contract
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: provisional

- id: public_contract_rule
  type: rule
  statement: `visibleOutcomes` 与可见输出字段优先级高于历史展示字段回填逻辑。
  source:
    file: cloudfunctions/diagnose-http/services/session-result-read-service.js
    symbol: buildPublicRouteFinalResult
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: high
  status: verified

- id: review_contract_rule
  type: rule
  statement: review 分支允许局部降级片段（degraded section）返回，但应显式标记。
  source:
    file: cloudfunctions/diagnose-http/repositories/diagnosis-review/detail-loaders.js
    symbol: degradedSections
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: provisional

## Decisions

- id: governance_decision
  type: decision
  statement: 采用“变更 -> 映射文件 -> 回归检查”三段式维护流程。
  source:
    file: .brv/context-tree/maintenance/governance/diagnosis_main_chain_maintenance.md
    symbol: change_sync_rule
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: provisional

## Observations


  type: observation
  statement: `maintenance` 的“review 部分降级”细节在不同文件有实现差异（review loader 与路由处理层），建议统一为一套术语口径后再写为强事实。
  source:
    file: cloudfunctions/diagnose-http/repositories/diagnosis-review/detail-loaders.js
    symbol: degradedSections
  verified: 2026-06-05
  review_after: 90d
  owner: architecture
  confidence: medium
  status: observation
