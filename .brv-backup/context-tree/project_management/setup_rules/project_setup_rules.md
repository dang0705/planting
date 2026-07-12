---
title: Project Setup Rules
summary: 项目启动与题包提交相关约束
updatedAt: '2026-06-08'
---
- `getQuestionPackageByMode` 负责黄叶模式题包元信息来源与题组边界。
- `isQuestionPackageAnswerSubmitPayload` 强制题包提交需具备 4 题完成语义。
- `buildQuestionPackageUiHints` 在前端提示中固定 `displayMode: package`、`answerSubmitMode: package`。
- `persistQuestionPackageSnapshot` 以题包为单位推进提交路径，并对非题包路径保留限流/降级约束。
