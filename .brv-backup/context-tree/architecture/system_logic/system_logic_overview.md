---
title: System Logic Overview
summary: 诊断主链按 route + mode question package 收敛；不再使用既有动态追问或每轮一题作为当前题包事实。
updatedAt: '2026-06-07'
---

## Facts

- id: system_route_package_main_chain
  type: fact
  source_kind: code
  statement: 当前系统诊断主链是 route 模式，问诊题目由 getQuestionPackageByMode(mode) 驱动的 mode question package 一次性提供。
  source:
    file: docs/code-logics/INDEX.md
    lines: 7-14
  confidence: high
  status: verified

- id: system_yellow_leaf_four_questions
  type: fact
  source_kind: code
  statement: 黄叶 mode 必须是一组 4 个问答项，并以 package 展示和 package 提交，且 package snapshot 保留包内全部问题。
  source:
    file: docs/code-logics/05_问诊系统_问题生成_过滤_停止策略.md
    lines: 23-46,67-73
  confidence: high
  status: verified

- id: system_stop_output_package_based
  type: fact
  source_kind: code
  statement: 系统停止和输出不以既有动态追问、每轮一题或 pending package question 表达，而以 package submit、答案被接受、route 最终公开响应和 stop/output condition 表达。
  source:
    file: docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
    lines: 95-121
  confidence: high
  status: verified

## Rules

- id: system_dynamic_extension_regression
  type: rule
  statement: active memory 不得把动态逐题推进口径作为当前问诊主链概念，也不得把旧快照字段写成固定题包的题数权威。
  source:
    file: docs/code-logics/10_实施规则映射_开发约束_审计清单.md
    lines: 18-33,52-61
  confidence: high
  status: verified
