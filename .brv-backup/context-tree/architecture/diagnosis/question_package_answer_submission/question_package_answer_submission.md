---
title: Question Package Answer Submission
summary: 题包提交链路的权威实现页，覆盖 `answer_submit` 验证、归属校验和终态收敛。
updatedAt: '2026-06-08'
---

## 作用域与目标

该页用于统一管理“整包提交”场景下的后端/前端约束：黄叶及其他主链路题包不再走动态追问分支，而是采用一次性提交与终态输出模型。

## 核心链路

- `cloudfunctions/diagnose-http/app/question-package-response.js` 负责处理题包提交与 `diagnosis-engine` 路径协同；
- `isQuestionPackageAnswerSubmitPayload` 统一约束提交载荷结构与当前边界；
- `buildQuestionPackageUiHints` 提供题包模式下的前端提示与 option 处理；
- `cloudfunctions/diagnose-http/app/package-answer-ownership-runtime.js` 做 submission ownership 与题包快照校验；
- `cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js` 在 `answer_submit` 成功后进入终态路由输出流。

## 关键约束

- 主链路以 route/evidence 与 package 收敛条件驱动，不再使用动态追问字段作为终态决策依据；
- `yellow_leaf` 仍保留少量 4-answer key conservative 当前，但仍按 package-count / route 收敛原则执行；
- 题包提交成功后，通过 `terminalQuestioningState` 与 stop/output 条件，禁止继续生成后续轮次问题。

## 关联

- 对应主链路约束详见：
  - [architecture/diagnosis/yellowing_diagnosis_lifecycle.md](architecture/diagnosis/yellowing_diagnosis_lifecycle.md)
  - [architecture/diagnosis/source_verified_diagnosis_facts.md](architecture/diagnosis/source_verified_diagnosis_facts.md)
  - [architecture/diagnosis/leaf_yellowing_diagnosis_logic.md](architecture/diagnosis/leaf_yellowing_diagnosis_logic.md)
