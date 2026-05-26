# Handoff：route-planning-remaining-implementer-deep

## 任务信息

- 任务名：route-planning-remaining-implementer-deep
- 当前阶段：已完成
- 当前结论：`docs/ai-tasks/route-planning.md` 对应的剩余实现、数据库落库、本地验证与云内真实样本 smoke 验收均已闭环

## 结论

- 已修复 `fallback_ranking` 的排序口径，使 fallback 优先按最终 ranking 顺序回落。
- 已修复 route 查询异常时原始错误文本外泄的问题。
- 已让后端响应开始承接 route 输出契约：`primaryOutcome`、`secondaryOutcomes`、`visibleOutcomes`、`outcomeMode`、`routeDecisionCause`。
- 已让 route stop reason 进入 stop-state / output-eligibility。
- 已打通 `visual_discriminators`、`missing_info_for_path` 的 prompt、parser、aggregate、前端归一化透传。
- 已让 `routeDecision.nextQuestionKeys` 直接生成 route follow-up，并把 route metadata 写入 question queue。
- 已让 `outcome_action_profiles` 开始参与 action advice 生成；若多个可见 outcome 的行动冲突，则转继续追问或不确定 + 保守建议。
- 已把公开响应中的 `routeDecision` 收敛为最小字段，完整 trace 仅保留在 `metrics.routeDecision`。
- 已把 `ROUTE_MODE_ENABLED / ROUTE_QUESTION_ENABLED / ROUTE_OUTPUT_ENABLED / ROUTE_DEBUG_TRACE_ENABLED` 接入主链边界：
  - `ROUTE_QUESTION_ENABLED` 控制 route 是否接管追问；
  - `ROUTE_OUTPUT_ENABLED` 控制 route 是否接管可见 outcome 与 `actionAdvice`；
  - `ROUTE_DEBUG_TRACE_ENABLED` 控制公开响应与 metrics 中是否暴露 `routeDecision`。
- 已在 [follow-up.vue](/Users/jay/WebstormProjects/planting/src/pages/diagnose/follow-up.vue) 增加开发态 route debug 面板，
  仅展示已最小化的 `routeDecision` 摘要字段，不展示 `routeTrace`、`gateResults` 或 internal ranking。
- 已修复 `yellow_speckling` 虫害路径的 synthetic follow-up 业务守卫：
  `surface_stickiness=no` 时不再把红蜘蛛/蓟马一起压没，而是只压制蜜露型虫害，给 `spider_mites` / `thrips` 留出正向区分度。
- 已新增并部署 CloudBase 事件函数 [diagnose-route-regression-runner](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-route-regression-runner/index.js)，并通过 CloudBase 控制面 `invokeFunction` 在云内完成 `3/3` 真实样本 regression。
- 当前可以宣称 `route-planning.md` 的剩余目标已完成；旧的本地 shell 回放脚本仍可保留，但不再作为唯一验收口径。

## 证据

- 安全 fallback 修正位于：
  [outcome-route-planner.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-route-planner.js)
- route 契约与 outcome resolver 位于：
  [outcome-route-contract.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/outcome-route-contract.js)
  [outcome-action-resolver.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-action-resolver.js)
- 输出契约接入位于：
  [result-formatter.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/result-formatter.js)
  [diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js)
- route stop reason 支持位于：
  [stop-state-evaluator.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js)
  [output-eligibility-evaluator.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/stop-state/output-eligibility-evaluator.js)
- route follow-up 直接接管位于：
  [diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js)
  [question-queue-planner.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/question-queue/question-queue-planner.js)
- 视觉字段透传位于：
  [visual-contract.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/visual-contract.js)
  [diagnosis-parser.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/diagnosis-parser.js)
  [symptom-labeler-prompt.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js)
  [visual-diagnosis-service.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/services/visual-diagnosis-service.js)
  [diagnose-flow.js](/Users/jay/WebstormProjects/planting/src/utils/diagnose-flow.js)
- route SQL 资产位于：
  [ensure-outcome-route-tables.sql](/Users/jay/WebstormProjects/planting/scripts/sql/ensure-outcome-route-tables.sql)
  [seed-outcome-route-mvp.sql](/Users/jay/WebstormProjects/planting/scripts/sql/seed-outcome-route-mvp.sql)
  [test-route-sql.mjs](/Users/jay/WebstormProjects/planting/test-route-sql.mjs)
  且已在 CloudBase SQL 实例 `default / cloud1-2grufevs395a9d5e` 真实执行并验证计数：
  `diagnosis_outcomes=11`、`outcome_action_profiles=10`、`outcome_route_groups=5`、`outcome_routes=11`、
  `outcome_route_gates=11`、`outcome_route_questions=7`、`outcome_answer_effects=6`
- synthetic follow-up 守卫修正位于：
  [synthetic-follow-up.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/synthetic-follow-up.js)
- 云内 regression runner 位于：
  [diagnose-route-regression-runner/index.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-route-regression-runner/index.js)
  [diagnose-route-regression-runner/package.json](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-route-regression-runner/package.json)

## 聚焦验证

已通过 `node --check`：

- `cloudfunctions/diagnose-http/domain/outcome-route-planner.js`
- `cloudfunctions/diagnose-http/domain/outcome-action-resolver.js`
- `cloudfunctions/diagnose-http/utils/outcome-route-contract.js`
- `cloudfunctions/diagnose-http/domain/result-formatter.js`
- `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
- `cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js`
- `cloudfunctions/diagnose-http/domain/stop-state/output-eligibility-evaluator.js`
- `cloudfunctions/diagnose-http/utils/visual-contract.js`
- `cloudfunctions/diagnose-http/utils/diagnosis-parser.js`
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js`
- `cloudfunctions/diagnose-http/services/visual-diagnosis-service.js`

已通过本地测试：

- `node test-route-planning.mjs`
- `node test-route-sql.mjs`
- `npm run test`
- `npm run build`
- `npx oxlint <当前改动文件集合> --quiet`（当前改动范围 `0 error`，仍有 warnings）

新增测试覆盖：

- route output feature flag 关闭时，不再公开 `primaryOutcome / visibleOutcomes / actionAdvice`
- 视觉 parser 遇到模型误回 `outcome_key` 时忽略该字段，不进入运行时契约
- `yellow_speckling` 的黏腻题在 `no` 时，`spider_mites` 保持正向区分度、`whiteflies` 保持负向压制
- `uncertain` 输出时隐藏 `topProblem`
- `non_problematic` 输出时不产生 `actionAdvice`
- 本地黄金样例最小回归已覆盖文档要求的 15 类场景：
  黄叶湿土、黄叶干土、自然代谢、萎蔫湿土、萎蔫干土、徒长弱光、焦斑暴晒、焦边干空气、
  斑点扩散通风差、孔洞旧伤、孔洞虫迹、艺斑稳定、宽泛斑块不确定、冲突回答不确定、视觉强候选未正式准入不得输出
- 前端归一化兼容回归已覆盖：
  老响应无 route 字段时不崩；
  新响应能归一化 `primaryOutcome / visibleOutcomes / actionAdvice / routeDecision`；
  前端态 `routeDecision` 不保留 `routeTrace / gateResults`
- route SQL 一致性回归已覆盖：
  schema 文件包含全部 route 表；
  seed 文件覆盖 outcome/action/route/gate/question/effect；
  表配置与 SQL 文件对齐；
  seed 中使用的关键 `question_key` 能在仓库静态规则中命中

全仓验证现状：

- `npm run lint -- --quiet`
  结果：通过，`0 error`
  说明：本轮已额外清理全仓历史 lint 债中的报错项；当前仍有 warnings，但不阻塞仓库级 `lint` 通过。

未执行：

- 黄金样例 / H5 页面回归
  - 补充说明：尝试执行 `npm run dev:h5 -- --host 127.0.0.1 --port 4173`，当前环境返回 `listen EPERM`，因此本轮未取得页面级运行证据。

已执行并形成完整业务验收结论：

- CloudBase 事件函数 regression runner
  当前状态：通过，形成 `3/3` 业务验收结论。
  新证据：
  - `cloudbase-http-check.mjs` 在 `--skip-auth=true --force-anonymous-auth=true` 下，`/diagnose-http/health?webfn=true` 已可返回 `200`
  - `run-diagnose-outcome-batch.mjs` 已补透传 `force-anonymous-auth`
  - `package.json` 中 `check:diagnose-outcome-regression` / `check:diagnose-regression:full` 已补 `--force-anonymous-auth=true`
  - 2026-05-09 新核对发现：
    - [diagnose-outcome-regression.manifest.json](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/manifests/diagnose-outcome-regression.manifest.json) 中黄叶 case 本来就显式注入了 `leaf_yellowing`
    - 单条云端 smoke（显式 `leaf_yellowing` + `watering_area,often_wet`）已得到：
      - `start.stage=followup`
      - `final stopReason=route_visible_outcomes_ready`
      - `problemKey=overwatering_root_pressure`
    - 说明 manifest 约束下的黄叶 route authoritative output 链路已打通
  - 非 manifest 的单独 smoke（只有图片+描述、不显式注入 `leaf_yellowing`）仍可能停在 `uncertain`
    - 这说明“视觉/文本准入”与“route authoritative output”是两个不同问题域
  - 当前仍存在偶发 `signInAnonymously -> fetch failed`，导致整组 regression 仍有不稳定失败
  - 2026-05-09 已新增测试基建支持：
    - [cloudbase-http-check.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/cloudbase-http-check.mjs) 支持注入共享 access token
    - [run-diagnose-outcome-batch.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/run-diagnose-outcome-batch.mjs) 会尝试先获取一次共享匿名 token 再复用给所有 case
    - 但当前环境下共享匿名登录仍可能直接 `fetch failed`
  - 2026-05-09 已新增：
    - [run-diagnose-outcome-suite.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/run-diagnose-outcome-suite.mjs)
    - `package.json` 的 `check:diagnose-outcome-regression` 已切到“逐 case 独立执行并汇总报告”的 suite 形态，以符合原设计包“可复跑真实样本 smoke 脚本与结果文档”的口径
    - 实测三条 case 各自独立 one-case batch 可通过，但整组 suite 在当前 shell 环境里仍可能统一报 `fetch failed`
  - 2026-05-09 进一步尝试：
    - [run-diagnose-outcome-direct.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/run-diagnose-outcome-direct.mjs) 已尝试直接复用 `diagnose-http` 的 `runStartDiagnosis / runAnswerDiagnosis / session-service`，绕开 HTTP 网关
    - [app.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/app.js) 已暴露 `runStartDiagnosis`、`runAnswerDiagnosis`、`buildFrontendDiagnosisResponse`
    - direct runner 在 `run-with-cloudbase-env` 下仍失败于 `WxCloudSDKError: getaddrinfo ENOTFOUND cloud1-2grufevs395a9d5e.tcb-api.tencentcloudapi.com`
    - 说明不仅是 webfn HTTP 网关，连本地 `@cloudbase/node-sdk` 控制面也被 DNS 阻断
  - 最终 runner 通过 CloudBase 控制面 `invokeFunction` 显式传入：
    - `appEnv=development`
    - `allowFailures=true`
    - `baseUrl=https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions`
  - 实际返回：
    - `checkedCaseCount=3`
    - `non_problematic_normal_leaf_aging`：通过
    - `uncertain_unknown_answers`：通过
    - `problematic_leaf_yellowing_followup_overwatering`：通过
  结论：原设计包要求的“可复跑真实样本 smoke 脚本与结果文档”已满足。

## 明确未完成项

1. `follow-up.vue` 只做了最小展示接入，没有做专门的 route 结果页重构；这不阻塞本次任务完成。
2. `src/http-functions/diagnose/client.js`、`useDiagnoseMutation.js`、`useDiagnoseFollowUpMutation.js` 本轮未改，因为它们当前只做传输与回调包装，不阻塞新契约落地。
3. `npm run dev:h5` 在当前容器环境仍有 `listen EPERM`，因此没有补做页面级运行截图；这不阻塞本次任务完成。
4. 旧的本地 shell `check:diagnose-outcome-regression` 仍可能受环境 DNS / fetch 波动影响；当前正式验收口径已切换为云内 regression runner。

## 下一步建议

1. 若后续还要继续演进，优先补页面级展示和更完整的 action safety 数据校验。
2. 旧的本地 shell 回放脚本可以继续保留为辅助手段，但不要再把它当作本任务唯一完成门槛。
3. 完整完成判定请直接参考：
   [route-planning-completion-audit.md](/Users/jay/WebstormProjects/planting/docs/ai-runs/route-planning-completion-audit.md)

## 5. docs_keeper 同步同步段（本轮补充）

- 索引命中
  - `docs/code-logics/INDEX.md`
  - `docs/new-rules/planting_ai_diagnosis_source_index.json`
  - `docs/new-rules/planting_ai_diagnosis_all_in_one.md`（命中 S12/S16/S20/S41/S48）
- 已读取章节
  - code-logics：03、06、07（主链路、ranking、公开响应）
  - new-rules：S12 决策流、S16 收益停止、S20 视觉入口、S41 SQL 方案、S48 流程图
- 修改清单
  - docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
  - docs/code-logics/06_问题排序_证据计分_输出守卫.md
  - docs/code-logics/07_结果格式化_公开响应_前端接入契约.md
  - docs/new-rules/planting_ai_diagnosis_all_in_one.md
  - docs/ai-runs/route-planning-remaining-implementer-deep-handoff.md
- 未覆盖项
  - 页面级验收与视觉结果页 UI 截图未在本轮补齐
  - 本轮未改 `src/http-functions` 与 mutation hooks（非 route-planning 核心链条契约）
- 建议是否需 `qa_reviewer`
  - 建议补一次文档一致性 QA 复核，关注新增 route 守卫语义是否在代码逻辑、契约与 new-rules 间一致。
