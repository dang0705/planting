thread_id: 019f841a-6083-7643-8060-cf9825376e3e
updated_at: 2026-07-21T13:34:11+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T17-55-49-019f841a-6083-7643-8060-cf9825376e3e.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# 修复具体虫害单候选结果仍显示“继续细分”的路由与前端兜底

Rollout context: 工作目录为 `/Users/jay/WebstormProjects/planting`。任务围绕青花植虫害模式、视觉 prompt、确定性路由器和具体虫害题包展开；实际执行中定位并修复了一个具体回归：单个低置信虫害候选被错误当成多候选细分任务。

## Task 1: 修复单候选虫害结果的无意义细分入口

Outcome: success

Preference signals:

- 用户要求“不要为了问诊而问诊”，并强调高特异性结果应缩短流程；这支持在已有单一可见候选时直接给出“可能是”结果，不再追加无意义题包。
- 用户重视确定性路由器和前后端契约一致性；本次修复同时覆盖后端结果生成、旧 direction_choice 请求、前端 normalizer、运行时 enrich 和 computed 展示层。

Key steps:

- 定位根因：`specific-pest-answer-resolver.js` 仅因 `provisionalModes.length > 0` 就生成 `candidateRefinementAvailable` 和 `directionChoices`，未检查可见结果数量。
- 后端改为仅当 `visibleOutcomes.length > 1` 且仍存在 provisional candidate 时，才允许虫害细分入口。
- `diagnosis-direction-choice-runtime.js` 增加旧前端/缓存强行提交 `direction_choice=pest` 时的防护：若当前已是单候选终态，直接返回最终结果，不重新生成 `specific_pest_visual` 题包。
- 前端 `normalizeDiagnosisResult`、`popup-actions.enrichDiagnosisResult` 和 `diagnose-flow/computed` 三层过滤单候选终态残留的 `directionChoices`，防止旧 raw response 重新激活入口。
- 追加 BRV Topic `architecture/diagnosis/specific_pest_refinement_outcome_contract`，记录“单个 visibleOutcomes 不得继续细分”和 specific-pest 九种答案矩阵兜底规则，并完成 readback/query 验证。

Reusable knowledge:

- 具体虫害细分题包的职责是排序、降低置信度或区分多个候选，不能让单个候选结果继续进入细分。
- 稳定规则：当最终 `visibleOutcomes.length <= 1` 且会话已完成或进入 `finalize/direct_result` 时，`directionChoices=[]`、`candidateRefinementAvailable=false`，不得生成新的 specific-pest 题包。
- specific-pest 题包不能因用户回答 `no/no`、`unknown/unknown` 等组合而整体变为 `uncertain`；应回落到 `candidateModes[0]`，输出低置信“可能是”候选。九种 yes/no/unknown 组合应由矩阵测试覆盖。
- 项目现有固定题包契约是按模式独立配置：`yellow_leaf` 4 题、`wilting_droop` 5 题，不应套用全局题数假设。

Failures and how to do differently:

- 原实现把“存在一个 provisional candidate”误当成“存在多个需要区分的候选”，导致单候选结果展示“继续细分虫害方向”。未来应始终以最终 `visibleOutcomes` 数量和状态共同判断。
- 第一次 BRV 写入未带 `--overwrite` 被拒绝；随后使用合并后的完整内容加 `--overwrite` 成功更新。更新既有 Topic 前应先 readback，再显式 overwrite。
- 工作区存在大量其他预先存在的脏改动，不能用全局 `git status` 将所有变更归因于本次任务；未来审查应依赖 baseline 和目标文件 diff。

References:

- 后端核心文件：`cloudfunctions/diagnose-http/app/specific-pest-answer-resolver.js`
- 方向选择防护：`cloudfunctions/diagnose-http/app/diagnosis-direction-choice-runtime.js`
- 前端过滤：`src/utils/diagnose-result-normalizer.js`、`src/components/diagnose-flow/popup-actions.js`、`src/components/diagnose-flow/computed.js`
- 测试：`test/unit/backend/diagnose-http/app/pest-question-package.mjs`、`test/unit/backend/diagnose-http/app/dynamic-pest-question-package-answer.mjs`、`test/unit/frontend/utils/diagnose-result-normalizer.mjs`
- 通过命令：`node test/unit/backend/diagnose-http/app/pest-question-package.mjs`、`node test/unit/backend/diagnose-http/app/dynamic-pest-question-package-answer.mjs`、`node test/unit/frontend/utils/diagnose-result-normalizer.mjs`、黄叶/枯萎/题包终态回归；精准 lint 为 0 errors，仅保留既有 warnings。
