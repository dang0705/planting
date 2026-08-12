## PR #14 第5轮：修复 6 条新评论（#13-#18）

已完成：12 个 A 类线程已 resolve；#15 + #16 已提交 `6460fc4`。

本轮处理 4 条业务逻辑评论。逐条对照 bot 原文与用户决策：

### #13 (P1): router 不透传 normalizedModeCandidates
- **bot 要求**：routed objects 带 confidence，让 direct-result path 能按候选过滤
- **用户决策**：只透传 normalizedModeCandidates（不改 confirmationCandidates/provisionalMatches 结构）
- **修复**：`diagnosis-mode-router.js:276-328` return 对象加入 `normalizedModeCandidates`（line 143 已计算好，含 `{modeKey, confidence}`）。下游 `directEvidenceLedgerForDirectResult` 和 `resolveNonPestCandidateTier` 都从它读 confidence，根因解决。

### #18 (P2): 非虫害 visibleOutcomes 缺 outcomeKey/problemKey
- **bot 要求**：visibleOutcomes 项补 outcomeKey/problemKey
- **修复**：`non-pest-direct-result.js:83-90` visibleOutcomes 每项加 `outcomeKey: modeKey` 和 `problemKey: modeKey`，与 finalResult/topProblem 一致。`resolveOutcomeIdentityKey` 不再回退到 `outcome_0` 合成 key。

### #17 (P1): 多高置信非虫害病害只输出 nonPestModes[0]
- **bot 要求**：输出全部 eligible outcome **或** 走 explicit choice（二选一）
- **用户决策**：多 outcomes + 新增细分入口（两者都做，新功能非回归）
- **修复**（3 处）：
  1. `non-pest-direct-result.js`：`buildNonPestDirectResult` 签名从单 `modeKey` 改为 `modeKeys`（数组）。visibleOutcomes 输出全部非虫害模式（每项含 #18 的 outcomeKey/problemKey）；candidateModes 输出全部；finalResult/topProblem 取置信度最高的（通过 normalizedModeCandidates 排序，#13 透传后可用）；likelyResult = 任一候选处于 0.90-<0.95。`resolveNonPestCandidateTier` 改为接受 modeKeys 数组，返回聚合 tier。
  2. `pest-visual-orchestrator.js`：`direct_result` 分支（line 147-160 + 274-293 两处）改为传全部 `nonPestModes`。当 `nonPestModes.length > 1` 时，响应附加 `directionChoices`（复用 `buildDirectionChoices`，已能为每个非虫害模式生成选项）+ `routePrimaryAction: 'choose_direction'` 作为细分入口。
  3. `diagnosis-mode-direction-choice.js`：无需改动（buildDirectionChoices 已支持非虫害）。

### #14 (P2): 非虫害 likely 结果标记 optionalFollowUp 但无实际问题
- **bot 要求**：构建问题或停止标记（二选一）
- **用户决策**：保留 optionalFollowUp 作为入口，实际问题以后设计，靠前端不渲染空问题
- **修复**：**无需代码改动**。已验证 `frontend-response.js:43-46` 当 `hasOptionalFollowUp=true` 时 `hasActiveQuestionPackage` 强制 false，走 terminal 分支渲染 finalResult/visibleOutcomes 而非空问题；`hasActiveQuestions=false`（line 232）是正确行为--无实际问题时不假装有活跃问题。回复时向 codex 说明：入口有意保留，实际问题后续设计，`hasActiveQuestions=false` 为当前正确语义。

### 测试更新（AGENTS.md §5.7）
- `test/unit/backend/diagnose-http/app/pest-visual-orchestrator-direct-result.mjs`：新增 powdery_mildew + sooty_mold 双非虫害用例，断言 visibleOutcomes 含两项、candidateModes 含两个、directionChoices 含细分入口；断言 visibleOutcomes 项含 outcomeKey/problemKey（#18）。
- `test/unit/backend/diagnose-http/domain/diagnosis-mode-router-full-profile.mjs`：新增断言 router return 含 normalizedModeCandidates（#13）。

### 提交 + 回复
- 提交修复后向 6 条评论（#13-#18）发回复，末尾加 `@codex address that feedback`。
- #15/#16 引用 `6460fc4`；#14 说明入口保留、问题后续设计。

### 风险
- #17 改 `buildNonPestDirectResult` 签名（单 modeKey → modeKeys 数组），需同步所有调用点（orchestrator 两处 + 测试）。
- #17 多 outcomes + 细分入口为新功能，端上 UX 需验收，但本轮未部署云端；先完成代码 + 单测，端上验收待后续。