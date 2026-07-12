---
title: 黄叶诊断逻辑
summary: 黄叶诊断链路在题包模型下的核心收敛逻辑与输出边界。
generatedAt: '2026-06-08'
---

## 逻辑归口

- 黄叶主链路采用静态题包模型，前端按固定题序收集答案，提交后一次性触发 `answer_submit`。
- 后端按 route mode 与题包元数据判定终态，不再按轮次动态继续追问。

## 关键实现文件

- `cloudfunctions/diagnose-http/domain/runtime-artifacts.js`：四题链路元信息与题包进度约束；
- `cloudfunctions/diagnose-http/app/package-answer-ownership-runtime.js`：题包快照与提交归属校验；
- `cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js`：`questionPackage` 上下文下的终态输出路由。

## 输出边界

- 对外输出集中到 `visibleOutcomes` 与 route 最终决策结果；
- 在黄叶场景，强信号问题（例如过浇/肥力/光照异常）映射到固定问题路由，不再依赖下一题/评分回路迭代。

## 关联入口

- [architecture/diagnosis/yellowing_diagnosis_lifecycle.md](architecture/diagnosis/yellowing_diagnosis_lifecycle.md)
- [architecture/diagnosis/question_package_answer_submission/question_package_answer_submission.md](architecture/diagnosis/question_package_answer_submission/question_package_answer_submission.md)
- [architecture/diagnosis/source_verified_diagnosis_facts.md](architecture/diagnosis/source_verified_diagnosis_facts.md)
