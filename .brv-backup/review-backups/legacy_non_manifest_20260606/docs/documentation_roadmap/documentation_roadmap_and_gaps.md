---
title: 文档路线图与缺口
summary: 将文档缺口作为治理项管理，避免将“已知空档”当作代码事实长期固化。
updatedAt: '2026-06-05'
tags: []
---

## Facts

- id: docs_gap_frontend_integration
  type: fact
  statement: 当前上下文已确认前端源码存在于 `src/`，因此“无前端源码”并非当前实现事实；可否读写一致可作为后续观察项。
  source:
    file: src/main.js
    symbol: frontend presence
  verified: 2026-06-05
  review_after: 90d
  owner: documentation
  confidence: high
  status: verified

## Rules

- id: roadmap_priority_rule
  type: rule
  statement: 路线图应明确 P0/P1 项与“已证实事实”与“待验证观察项”区分，避免把未验证建议写入事实层。
  source:
    file: .brv/context-tree/docs/documentation_roadmap/documentation_roadmap_and_gaps.md
    symbol: docs_gap_frontend_integration
  verified: 2026-06-05
  review_after: 90d
  owner: documentation
  confidence: high
  status: provisional

- id: source_order_rule
  type: rule
  statement: 缺口条目应先给出可验证证据，再给出待补齐动作。
  source:
    file: .brv/context-tree/docs/documentation_roadmap/documentation_roadmap_and_gaps.md
    symbol: docs_gap_frontend_integration
  verified: 2026-06-05
  review_after: 90d
  owner: documentation
  confidence: high
  status: provisional

## Decisions

- id: doc_alignment_decision
  type: decision
  statement: 优先补齐行动建议与 route-only 显示链路文档，作为前端/审核端最易失配的区域。
  source:
    file: .brv/context-tree/docs/documentation_roadmap/documentation_roadmap_and_gaps.md
    symbol: roadmap_priority_rule
  verified: 2026-06-05
  review_after: 90d
  owner: documentation
  confidence: high
  status: provisional

## Observations

- id: docs_gap_route_contract
  type: observation
  statement: 文档路线图当前聚焦 route-only、治理与行动建议等输出语义；该文件本身更像任务清单，不是可执行代码事实。
  source:
    file: .brv/context-tree/docs/documentation_roadmap/documentation_roadmap_and_gaps.md
    symbol: docs_gap_frontend_integration
  verified: 2026-06-05
  review_after: 90d
  owner: documentation
  confidence: high
  status: observation

- id: observation_plant_catalog_alignment
  type: observation
  statement: “与植物名录基线保持一致”等表述在当前目录缺少直接仓库级证据链接，建议补充到后续治理说明后再升级为事实。
  source:
    file: .brv/context-tree/docs/documentation_roadmap/documentation_roadmap_and_gaps.md
    symbol: roadmap_priority_rule
  verified: 2026-06-05
  review_after: 90d
  owner: documentation
  confidence: medium
  status: observation
