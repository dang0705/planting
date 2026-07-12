---
title: 单元测试策略
summary: 单元测试基于 Node.js 脚本执行，优先内存态注入与本地资源校验，`test:ci` 为主门禁入口。
updatedAt: '2026-06-08'
tags: []
---

## Facts

- id: unit_testing_execution_mode
  type: fact
  statement: 测试入口集中在 `package.json` 的 `test:*` 脚本，执行方式统一为 `node xxx.mjs`，无必须依赖 Vitest/Jest 的框架测试路径。
  source_kind: package
  source:
    file: package.json
    lines: 10-79
    symbol: scripts.test:*
    notes: 以脚本定义为主（如 test:pinia、test:tailwind、test:route-planning、test:route-sql、test-all）
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: verified

- id: unit_testing_ci_condition
  type: fact
  statement: `npm run test:ci` 是 CI 的最小主门禁，默认只串行执行 `test:pinia` 与 `test:tailwind`。
  source_kind: package
  source:
    file: package.json
    lines: 10-11
    symbol: scripts.test:ci
    notes: "test:ci = test:pinia && test:tailwind"
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: verified

- id: unit_testing_route_plan_fast_path
  type: fact
  statement: `test-route-planning.mjs` 与 `test-route-sql.mjs` 使用 `_test` 导出并用 `Module._load` 对 `/opt/utils/cloudbase` 与 `/opt/utils/plant-knowledge` 进行内存态桩替换，减少运行时外部依赖。
  source_kind: code
  source:
    file: test-route-planning.mjs
    lines: 60-87
    symbol: Module._load, _test
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: verified

- id: unit_testing_route_sql_contract_check
  type: fact
  statement: `test-route-sql.mjs` 以本地 schema/seed/仓储源码做静态一致性校验，不依赖真实数据库实例。
  source_kind: code
  source:
    file: test-route-sql.mjs
    lines: 31-50
    symbol: testRouteSchemaAndSeed
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: verified

- id: unit_testing_full_script_suite
  type: fact
  statement: `test-all` 通过同一进程脚本链路依次执行 Pinia、Tailwind、route-planning、route-sql 与 verify route-golden。
  source_kind: code
  source:
    file: test-all.mjs
    lines: 36-43
    symbol: runAllTests
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: verified

## Rules

- id: unit-tests-execution
  type: rule
  statement: 所有单测应优先保持 Node 进程内执行，避免将运行时依赖提升为环境前置条件。
  source:
    file: .brv/context-tree/testing/unit_strategy/unit_test_strategy.md
    symbol: unit_testing_route_plan_fast_path
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: provisional

- id: unit-tests-contract
  type: rule
  statement: `test:ci` 作为默认发布门禁；新增单测需至少可通过 `test:ci` 并在必要时扩展到 `test-all` 覆盖路径。
  source:
    file: package.json
    symbol: scripts.test:ci
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: verified

## Decisions

- id: testing-strategy
  type: decision
  adr_id: ADR-006
  statement: 当前项目选择“脚本化测试 + 明确脚本门禁”作为主策略，而不是引入额外统一框架 runner 作为默认入口（可按后续需要渐进迁移）。
  source:
    file: .brv/context-tree/testing/unit_strategy/unit_test_strategy.md
    symbol: unit_testing_full_script_suite
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: provisional

## Observations

- id: status-note
  type: observation
  statement: `test:route-golden` 的 `npm run test-route-golden` 入口在当前主测试入口中未被 `test:ci` 固定覆盖，但被 `test-all` 覆盖，适合作为扩展回归项跟踪，不应误判为 CI 强制门禁。
  source:
    file: package.json
    symbol: scripts.test:route-golden,test-all
  verified: 2026-06-05
  review_after: 90d
  owner: testing
  confidence: high
  status: observation
