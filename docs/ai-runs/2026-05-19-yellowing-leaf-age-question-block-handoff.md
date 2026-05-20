# 2026-05-19 黄叶新/老叶追问禁用修复 handoff

## 目标

黄叶问诊流程当前不得出现新/老叶、叶龄分流或“老叶是否均匀变黄”类问题。新/老叶信息只允许作为结果建议中的复核提示；未来若恢复，必须先经二选一 gate 或补拍视觉确认。

## 本轮代码改动

- `cloudfunctions/diagnose-http/utils/yellowing-question-policy.js`
  - 新增黄叶禁用题策略，统一拦截 `yellowing_leaf_age_pattern` 与旧静态新/老叶问题 key。
- `cloudfunctions/diagnose-http/domain/outcome-route-planner.js`
  - route planner 生成 `nextQuestionKeys` 前过滤禁用题，过滤时同时携带问题维度、目标症状和用户文案，避免 review/detail 与运行时 routeDecision 继续暴露叶龄题。
- `cloudfunctions/diagnose-http/domain/outcome-route-planner-helpers.js`
  - 构建 route evidence context 前过滤禁用题的历史答案、answerEffects 与 routeAnswerEffects，避免旧会话的 leaf-age 答案继续闭合 route gate。
- `cloudfunctions/diagnose-http/repositories/outcome-route-repository.js`
  - 读取 `outcome_route_questions` 时关联题库维度与用户文案，支持 planner 层按维度过滤残留题。
- `cloudfunctions/diagnose-http/domain/evidence-scoring.js`
  - question evidence / direct problem adjustment 计算前跳过黄叶 leaf-age/new-old 禁用题，避免旧答案继续给营养类问题加权。
- `cloudfunctions/diagnose-http/domain/route-planned-followup-resolver.js`
  - route planned follow-up 渲染前后二次过滤，覆盖 `/diagnosis/question/start` 与 `/diagnosis/answer` 的 route planned 入口。
- `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
  - `buildYellowingGateDimensionQuestion()`、forced yellowing gate、problem-scoped follow-up、最终 follow-up 合流处增加禁用题 guard。
- `cloudfunctions/diagnose-http/utils/synthetic-follow-up/dimension-priorities.js`
  - 从黄叶 synthetic fallback 优先级中移除 `YELLOWING_LEAF_AGE_PATTERN`。
- `cloudfunctions/diagnose-http/utils/synthetic-follow-up/probe-options.js`
  - 黄叶未知选项说明不再提示“新老叶位置排查”。
- `cloudfunctions/diagnose-http/utils/context-required-problem-guard.js`
  - 用户可见 guard 文案去掉“老叶先黄 / 新叶或老叶黄化模式”；新/老叶弱线索不再作为营养类上下文闭合佐证，也不再作为营养类 forced-context preferred question；历史 answerEffects 中的禁用题不参与上下文闭合。
- `cloudfunctions/diagnose-http/utils/output-eligibility.js`
  - `yellow_new_leaves`、`yellow_lower_leaves`、`uniform_yellowing` 不再作为缺铁/缺氮/营养不足的独立输出资格证据。
- `cloudfunctions/diagnose-http/domain/outcome-action-resolver.js`
  - 黄叶相关 outcome 的 action advice 增加病虫害复核与老叶自然代谢观察提示；叶斑等非黄叶 outcome 不追加。
- `test-route-planning.mjs`
  - 增加 route planned 禁用叶龄题、forced-context 不再强制叶龄题、黄叶 outcome advice、弱叶龄证据不得闭合营养类 outcome、历史 leaf-age answer/effect 不得影响证据计分或闭合 route 的回归。
- `scripts/terminal-e2e/manifests/route-planning-golden-cases.manifest.json`
  - 将旧 `yellowing_old_leaf` 正向 golden 改为 `yellowing_leaf_age_disabled` 负向 golden，确保历史新/老叶答案不再期待闭合 `normal_leaf_aging` route。

## 文档同步

- `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md`
- `docs/code-logics/05_问诊系统_问题生成_过滤_停止策略.md`
- `docs/code-logics/06_问题排序_证据计分_输出守卫.md`
- `docs/code-logics/10_实施规则映射_开发约束_审计清单.md`
- `docs/new-rules/planting_ai_diagnosis_all_in_one.md`

## 已验证

- `node -c`：本轮触及 JS / MJS 文件通过。
- `npm run test:route-planning`：通过。
- `npm run test:route-sql`：通过。
- `npm test`：通过，覆盖 Pinia、Tailwind、route planning、route SQL、route golden manifest。
- `node verify-route-golden-manifest.mjs`：通过，112 cases / 13 groups。
- `npx oxlint <本轮触及文件>`：0 errors，仍有仓库既有 warning。

## 未完成 / 风险

- 未部署 `diagnose-http`，未跑云端真实 `/diagnosis/question/start` 和 `/diagnosis/answer` smoke。
- 全量 `npm run lint` 当前仍失败，主要被仓库既有 `no-magic-numbers` / `no-console` 类问题淹没；本轮触及文件 targeted oxlint 无 error。
- SQL 中可继续保留历史新/老叶题与 route seed；当前由 runtime 统一过滤。未来若恢复二选一 gate，需要另开设计和 SQL / runtime 实现任务。
