---
title: 项目设置与规则
summary: 用于项目治理与文档联动的执行边界，事实层仅保留可验证项。
updatedAt: '2026-06-05'
tags: []
---

## Facts

- id: project_http_service_boundary
  type: fact
  statement: 本项目默认本地调试与常规运行时的 HTTP 入口包含 `diagnose-http`、`identify-http`、`storage-http`、`weather-http`、`plant-user-http`、`plant-catalog-http`、`auth-user-http`、`diagnosis-history-http`；其中 `diagnosis-history-http` 为退役迁移说明入口。
  source:
    file: scripts/dev/run-local-api-env.mjs
    symbol: DEFAULT_REQUIRED_FUNCTIONS
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: verified

- id: project_aux_service_boundary
  type: fact
  statement: 补充边界模块包含 `wechat-identity`、`wechat-phone` 与共享 `layer`（用于身份能力与公共运行时能力复用），不属于 `DEFAULT_REQUIRED_FUNCTIONS` 的 HTTP 网关默认列表。
  source:
    file: docs/code-logics/00_文档总索引_与阅读顺序.md
    symbol: 当前可确认代码主要包含 CloudBase 云函数后端
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: medium
  status: verified

- id: project_docs_chain
  type: fact
  statement: 文档联动入口基于 `docs/code-logics/00_文档总索引_与阅读顺序.md` 进行 01~11 的阅读链路组织。
  source:
    file: docs/code-logics/00_文档总索引_与阅读顺序.md
    symbol: reading chain index
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: verified

- id: project_frontend_presence_correction
  type: fact
  statement: 当前仓库包含 `src/` 前端源码（页面、路由、store、静态资源和配置），因此“完整小程序源码缺失”不构成可验证事实。
  source:
    file: src/main.js
    symbol: front-end project scaffold
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: verified

- id: project_test_entry
  type: fact
  statement: `test:ci` 作为 CI 门禁入口，实际命令定义在 `package.json`（Pinia + Tailwind）。
  source:
    file: package.json
    symbol: scripts.test:ci
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: verified

## Rules

- id: governance_rule
  type: rule
  statement: 变更同步与文档治理使用 `.brv` 与文档链路配对维护，不应把治理决策直接当作运行时代码事实。
  source:
    file: .brv/context-tree/project_management/setup_rules/project_setup_and_rules.md
    symbol: project_docs_chain
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: provisional

- id: mapping_rule
  type: rule
  statement: 主链/接口/持久化/平台变更应分别触达 `03/04/05/06/07`、`02/07`、`08`、`10` 的相关文档域。
  source:
    file: .brv/context-tree/project_management/setup_rules/project_setup_and_rules.md
    symbol: project_docs_chain
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: provisional

- id: documentation_policy
  type: rule
  statement: 采用补充、修订版本而非静默删除的方式维护文档修正痕迹；但该策略是过程约束，不应替代事实检验。
  source:
    file: .brv/context-tree/project_management/setup_rules/project_setup_and_rules.md
    symbol: project_docs_chain
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: provisional

## Decisions

- id: decision_memory_boundary
  type: decision
  statement: 将文档策略与实现事实分层保存，避免规则/治理内容污染事实层检索。
  source:
    file: .brv/context-tree/project_management/setup_rules/project_setup_and_rules.md
    symbol: governance_rule
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: superseded
  superseded_by: clickup_is_primary_fact_source_decision

- id: clickup_is_primary_fact_source_decision
  type: decision
  adr_id: ADR-004
  statement: 任务执行的硬约束与验收口径应以 ClickUp 任务/子任务/关系任务与 checklist/acceptance 为第一事实来源，dispatch-task 需优先通过 ClickUp MCP 读取并保留原文硬约束，文档和脚本仅用于实现映射。
  source:
    file: .codex/skills/dispatch-task/references/clickup-ticket-read-policy.md
    symbol: 2. ClickUp 内容保真 / 4. 链接读取
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: high
  status: superseded
  supersedes: decision_memory_boundary
  superseded_by: release_ops_thread_reuse_decision

- id: release_ops_thread_reuse_decision
  type: decision
  adr_id: ADR-005
  statement: 发布与验收优先复用同一 release_ops 或其替代线程；当 release_ops 专用角色不可用时，允许 default 线程承接该阶段，仍按“同一任务链路内统一部署、烟雾与 requestId 追踪”执行，避免跨线程断开审计链路。
  source:
    file: docs/ai-runs/2026-05-18-weather-city-cache-handoff.md
    symbol: release_ops 替代线程
  verified: 2026-06-05
  review_after: 180d
  owner: project-management
  confidence: medium
  status: verified
  supersedes: clickup_is_primary_fact_source_decision

- id: local_cloudfunctions_root_dependencies_decision
  type: decision
  statement: 本地 CloudBase HTTP 云函数依赖集中安装在项目根目录 `node_modules`；各云函数 `package.json` 的 `dependencies` 与 `scf_bootstrap` 保留给线上自动安装，本地不得重新依赖 `cloudfunctions/*/node_modules`。
  source:
    file: docs/cautions/cloudfunctions_local_root_dependencies.md
    symbol: 当前策略
  verified: 2026-06-05
  review_after: 180d
  owner: project-management
  confidence: high
  status: verified

## Observations

- id: observation_add_only
  type: observation
  statement: “add-only” 约束更多是团队流程决策，当前文档未提供强制执行器；建议继续保持治理层约束，并在变更时附最小可追溯变更说明。
  source:
    file: AGENTS.md
    symbol: project governance
  verified: 2026-06-05
  review_after: 90d
  owner: project-management
  confidence: low
  status: observation
