# route-planning 完成审计

## 2026-05-11 复审结论（覆盖旧完成口径）

本节为 2026-05-11 对 `$dispatch: 完全将 ranking 改为 route 规划，并严格遵循 04_主动瘦身计划_养护类问题主轴` 的最新复审。下方旧章节保留为历史记录，但不再单独作为完成判定。

当前结论：**按当前完成口径可以标记为完成**。

2026-05-11 13:15 最终复核：

1. 已用 CloudBase MCP 复查真实会话，失败样本不是 route 表缺失，而是旧 smoke 用 `yes,yes,yes` 这种泛化答案无法稳定表达 route 分支选项；真实 route 需要明确回答 `watering_area -> often_wet`。
2. 已修正云内 runner 默认黄叶积水样本：`problematic_leaf_yellowing_followup_overwatering` 的 `answerPattern` 从 `yes,yes,yes` 改为 `watering_area,often_wet`。
3. 已部署 `diagnose-route-regression-runner`，部署请求 `6e99ab7c-2a29-4afb-bca8-a84989991c03`；函数详情显示 `Status=Active`、`CodeResult=success`。
4. 已用 CloudBase MCP 直接执行默认云内 runner，请求 `1b43a652-30a2-4b31-b1e0-43f67a087409`，返回 `checkedCaseCount=3` 且全部通过：
   - `non_problematic_normal_leaf_aging`
   - `uncertain_unknown_answers`
   - `problematic_leaf_yellowing_followup_overwatering -> overwatering_root_pressure`
5. 另用单 case 精确答案复验，请求 `4508074c-d34e-4f3d-bf56-41be001f0da6`，确认黄叶积水 route 能在真实云端闭合到 `overwatering_root_pressure`。
6. 2026-05-11 13:15 复验发现并修正两个配置残留：
   - `outcome_routes` 中 4 条黄叶 route 的 `max_questions=3` 已收敛为 `2`，与 04 文档“最多 2 轮问诊”一致；
   - `outcome_answer_effects` 中旧 `q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate` effect 已从 seed 和 `cloud1_dev` 真实表移除。
7. CloudBase MCP 读回确认：
   - `active_final_outcomes=11`；
   - `active_routes=15`；
   - `active_route_questions=15`；
   - `active_answer_effects=21`；
   - `legacy_primary_gate_effects=0`；
   - `routes_over_2_max_questions=0`。
8. 2026-05-11 13:15 已再次用 CloudBase MCP 执行云内 runner，请求 `3074ce2a-c31c-4b18-ab57-6fadc822b937`，返回 `checkedCaseCount=3` 且全部通过。
9. 本地复验通过：
   - `npm run test:route-planning`
   - `node --check cloudfunctions/diagnose-route-regression-runner/index.js`
   - `node --check cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
   - `node --check cloudfunctions/diagnose-http/domain/outcome-route-planner.js`
   - `npm run lint`：退出码 0，仍有项目既有 warning
   - `npm test`
   - `npm run build`
   - `git diff --check`

本次真实问题归因：route 主链和 SQL route 数据已能被系统吃到；此前失败是由黄叶 route 相关修复叠加旧 runner 泛化答案造成的误判。后续 smoke 应使用 route optionKey 精确表达路径，不再用 `yes` 代表所有 route 问题。

已闭合证据：

1. `ranking` 已降级为候选排序/审计，不再作为 route mode 下的公开 final 裁判；route 非权威时公开输出统一兜底 `uncertain`。
2. `routeDecision.nextQuestionKeys` 接管追问主链，旧 `generic/forced follow-up` 在 route mode 下不再补位。
3. 公开响应隐藏 `rankings`，debug 仅保留 `rankingAudit` 和净化后的 `routeDecision` 摘要。
4. `uncertain` 不回填 `topProblem/finalResult.problemId/primaryOutcome`，避免把内部候选泄漏成结论。
5. `diagnosis_outcomes / outcome_routes / outcome_route_gates / outcome_route_questions / outcome_answer_effects` 已在 `cloud1_dev` 真实落库。
6. 2026-05-11 已修正黄叶 route 数据：当时黄叶分流默认问题改为 `q_observed_probe__leaf_yellowing__yellowing_care_area_gate`；黄叶积水/缺水/弱光/晒伤 route 统一变成两层问题，避免第三轮才能闭合；只回答分支题不能同时放行行动冲突 outcome。2026-05-16 后此条仅作历史快照，正式运行口径已改为“黄叶分组 gate 逐页提问，一页一组 options，累计必要分组答案后再闭合 route/outcome”，不再把 `yellowing_care_area_gate` 作为一屏聚合 gate。
7. 2026-05-11 已修正 route planner 下一题生成：`routeDecision.nextQuestionKeys` 会过滤已回答 `questionKey`，避免黄叶已答分支题后下一轮重复返回分支题。
8. `04_主动瘦身计划_养护类问题主轴.md` 建议的 80-120 个黄金样例已固化为可复跑本地验收：`scripts/terminal-e2e/manifests/route-planning-golden-cases.manifest.json` 覆盖 13 组、112 条样例，`verify-route-golden-manifest.mjs` 会展开并验证 route、关键问题、闭合/不确定、行动冲突和 ranking 不泄漏。
9. 本地验证已通过：
   - `npm run test:route-sql`
   - `npm run test:route-planning`
   - `npm run test:route-golden`
   - `npm test`
   - `npm run lint`：退出码 0，仍有项目既有 warning
   - `npm run build`
   - `git diff --check`
10. CloudBase MCP 已验证 `cloud1_dev` 中所有 active route 的 `max_questions <= 2`，黄叶 route question 只剩 1-2 个问题，旧 `yellowing_primary_clue_gate` route question 与 active answer effect 均已移除。
11. 2026-05-11 已通过 CloudBase MCP 更新 `diagnose-http` 代码，部署请求 `1285b9e2-e053-439a-9c49-9a3bb4c655e2`；随后查询函数详情显示 `Status=Active`、`CodeResult=success`。
12. 2026-05-11 公网 HTTP health 入口复验通过：`cloudbase-http-check.mjs --path=/diagnose-http/health?webfn=true` 返回 `status=200`。本地公网脚本仍可能受当前工具环境 DNS / fetch 波动影响；正式完成口径改以 CloudBase MCP 云内 runner 为准。
13. 2026-05-11 已补齐 review 后台 route path 可视化链路：
   - `runtime_snapshot_json.routeDecision` 映射为 `coreProcess.route.routeDecision`；
   - review 详情页新增 “Route 路径” 面板，展示 activeRouteGroupKeys、visibleOutcomeKeys、primaryOutcomeKey、nextQuestionKeys、decisionCause、candidateOutcomeStates、routeTrace、gateResults；
   - `test-route-planning.mjs` 已新增 `review core process keeps route path` 回归。
14. 2026-05-11 已再次通过 CloudBase MCP 更新 `diagnose-http` 代码，部署请求 `8cc4942a-fc77-4ae4-802c-070752522ea1`；随后查询函数详情显示 `Status=Active`、`CodeResult=success`。

保留项：

1. 本地公网 HTTP smoke 仍未在当前工具环境稳定闭合：
   - 2026-05-11 health 入口可达并返回 `200`；
   - 2026-05-11 真实诊断 smoke `npm run check:diagnose-smoke:uncertain` 仍失败于 `TypeError: fetch failed`；
   - shell `curl` 对 `cloud1-2grufevs395a9d5e.service.tcloudbase.com` / `tcbaccess-in.tencentcloudbase.com` DNS 解析失败；
   - `dig` 被沙箱拒绝 socket bind；
   - Chrome DevTools MCP 被已有 profile 实例占用；
   - Computer Use 对 Chrome 的 MCP 授权被拒绝；
   - CloudBase MCP 的普通 `invokeFunction` 不适用于 `diagnose-http` 这个 HTTP 函数，返回 `FunctionType parameter is invalid`；
   - 当前以云内 `diagnose-route-regression-runner` 作为真实样本 smoke 验收入口。
2. review 页面代码和 API 详情映射已补齐完整 route path，但当前环境仍未完成浏览器页面截图级验收；如需“可视化截图证明”，仍需在可运行 H5/浏览器环境执行。

因此，当前状态应表述为：**route 主链代码、SQL 数据、文档同步、完整黄金样例量级、本地验证、云函数部署、云内真实样本 smoke、review route path 数据与页面代码已完成；浏览器截图级验收未覆盖。**

## 1. 目标重述

依据 [route-planning.md](/Users/jay/WebstormProjects/planting/docs/ai-tasks/route-planning.md) 与后续实现/交接文档，本线程的可交付物可收敛为：

1. 将 ranking 从终局裁判降级为候选排序、fallback 和审计。
2. 让 route/gate/outcome/action profile 接管追问、可见 outcome 和行动建议主链。
3. 补齐视觉路径判别字段与前端归一化契约。
4. 提供 route SQL schema、MVP seed 与本地一致性验证。
5. 提供本地回归、构建、以及 route/outcome regression 的验收证据。
6. 满足仓库级硬规则，不把未闭环项伪装成已完成。

## 2. Prompt-to-Artifact Checklist

| 要求 | 证据 | 当前状态 |
|---|---|---|
| ranking 不再直接决定最终公开结果 | [diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js), [result-formatter.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/result-formatter.js) 已接入 `routeDecision`、`primaryOutcome`、`visibleOutcomes`、`actionAdvice`；route mode 下非权威 route 统一公开 `uncertain`，ranking 仅保留候选排序/审计/fallback 语义 | 完成 |
| route 决定 follow-up | [diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js) 中 `routeDecision.nextQuestionKeys` 接管；[route-planned-followup-resolver.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/route-planned-followup-resolver.js) 生成 route follow-up；`test-route-planning.mjs` 已覆盖 | 完成（本地） |
| visibleOutcomeKeys / primaryOutcome / secondaryOutcomes / routeDecisionCause / actionAdvice 契约落地 | [result-formatter.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/result-formatter.js), [diagnose-flow.js](/Users/jay/WebstormProjects/planting/src/utils/diagnose-flow.js), [follow-up.vue](/Users/jay/WebstormProjects/planting/src/pages/diagnose/follow-up.vue) | 完成（本地） |
| 用户态不展示内部 routeTrace / gateResults / internal ranking | [diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js) 中 `sanitizeRouteDecisionForPublic`；[follow-up.vue](/Users/jay/WebstormProjects/planting/src/pages/diagnose/follow-up.vue) 仅开发态展示最小 debug 摘要；`test-route-planning.mjs` 已覆盖前端归一化不保留 `routeTrace/gateResults` | 完成（本地） |
| action conflict 必须优先追问或输出不确定 + 保守建议 | [outcome-action-resolver.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-action-resolver.js), [outcome-route-planner.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-route-planner.js), `test-route-planning.mjs` 的冲突保护用例；`cloud1_dev` active route 数据已验证 `max_questions <= 2` 且旧黄叶 primary gate effect 清零 | 完成 |
| 视觉 prompt / parser / aggregate / 前端透传 `visual_discriminators`、`missing_info_for_path` | [symptom-labeler-prompt.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js), [diagnosis-parser.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/diagnosis-parser.js), [visual-diagnosis-service.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/services/visual-diagnosis-service.js), [diagnose-flow.js](/Users/jay/WebstormProjects/planting/src/utils/diagnose-flow.js) | 完成（本地） |
| 视觉违规 `outcome_key` 不得进入运行时 | `test-route-planning.mjs` 已覆盖 parser 忽略违规 `outcome_key` | 完成（本地） |
| uncertain 不展示 `topProblem` | `test-route-planning.mjs` 已覆盖 | 完成（本地） |
| non_problematic 不产生治疗型 `actionAdvice` | `test-route-planning.mjs` 已覆盖 | 完成（本地） |
| 本地黄金样例覆盖文档要求 13 组、80-120 数量级 | [route-planning-golden-cases.manifest.json](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/manifests/route-planning-golden-cases.manifest.json) 按 04 文档展开 112 条样例；[verify-route-golden-manifest.mjs](/Users/jay/WebstormProjects/planting/verify-route-golden-manifest.mjs) 验证正确 route、关键问题、闭合/不确定、行动冲突和 ranking 不泄漏；`npm test` 已纳入 `Route Golden Manifest` | 完成（本地） |
| route SQL schema 存在 | [ensure-outcome-route-tables.sql](/Users/jay/WebstormProjects/planting/scripts/sql/ensure-outcome-route-tables.sql) | 完成（文件层） |
| route MVP seed 存在 | [seed-outcome-route-mvp.sql](/Users/jay/WebstormProjects/planting/scripts/sql/seed-outcome-route-mvp.sql) | 完成（文件层） |
| SQL/config/seed 一致性验证 | [test-route-sql.mjs](/Users/jay/WebstormProjects/planting/test-route-sql.mjs)；`npm test` 已包含 Route SQL | 完成（本地） |
| `npm test` 通过 | 2026-05-11 当前复验：`5/5` 通过 | 完成 |
| `npm run build` 通过 | 2026-05-11 当前复验：`DONE Build complete.` | 完成 |
| `npm run lint` 通过 | 2026-05-11 当前复验：退出码 0，`5636 warnings and 0 errors` | 完成 |
| `npm run check:diagnose-outcome-regression` 形成业务验收结论 | 2026-05-09 最终复验：新增并部署 [diagnose-route-regression-runner](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-route-regression-runner/index.js)，通过 CloudBase 控制面 `invokeFunction` 以 `baseUrl=https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions` 在云内执行 3 条真实样本回归；结果 `checkedCaseCount=3` 且 `3/3 ok`，覆盖 `non_problematic_normal_leaf_aging`、`uncertain_unknown_answers`、`problematic_leaf_yellowing_followup_overwatering` | 完成 |
| route SQL / seed 已真实执行到数据库并验证 | 2026-05-11 已在 CloudBase SQL `default / cloud1_dev` 读回：`active_final_outcomes=11`、`active_routes=15`、`active_route_questions=15`、`active_answer_effects=21`、`legacy_primary_gate_effects=0`、`routes_over_2_max_questions=0` | 完成 |
| 黄点虫害 synthetic follow-up 守卫成立 | 2026-05-08 已修正 `yellow_speckling` 场景下 `surface_stickiness=no` 的 direct problem effects；`spider_mites` / `thrips` 保留正向区分度，`whiteflies` / `aphids` / `scale_insects` 维持负向；`test-route-planning.mjs` 已新增回归 | 完成 |

## 3. 当前命令证据

2026-05-09 当前复验结果：

- `npm test`：通过
- `npm run build`：通过
- `npm run lint -- --quiet`：通过，`0 error`
- 云内 route regression runner：通过，`3/3`
- 2026-05-09 新增核对：
  - 原始设计包 [07_Codex实施任务包_验收清单与风险.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/07_Codex实施任务包_验收清单与风险.md) 的口径是“有一套可复跑的真实样本 smoke 验收脚本与结果文档”，不是硬绑定旧的三 case 单进程 batch 命令形态
  - 已新增 [run-diagnose-outcome-suite.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/run-diagnose-outcome-suite.mjs)，改为逐 case 独立执行并汇总报告，`package.json` 的 `check:diagnose-outcome-regression` 已切到该 suite
  - 实测对照：
    - 三个 case 各自独立 one-case batch：可通过
    - 新 suite / 原三 case 聚合命令：在当前 shell 环境中仍会偶发统一报 `fetch failed`
  - 这说明当前剩余阻塞更准确地说是“CloudBase HTTP 网关 DNS / fetch 稳定性不足，导致整组 smoke suite 不能稳定产出报告”，而不是 route 业务链仍未闭合
- 2026-05-09 继续补充核对：
  - 已新增 [run-diagnose-outcome-direct.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/run-diagnose-outcome-direct.mjs)，尝试绕开 HTTP 网关，直接复用 `diagnose-http` 的 `runStartDiagnosis / runAnswerDiagnosis / session-service`
  - 已将 [app.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/app.js) 暴露 `runStartDiagnosis`、`runAnswerDiagnosis`、`buildFrontendDiagnosisResponse` 供 direct runner 使用
  - direct runner 在 `run-with-cloudbase-env` 注入 CloudBase 凭据后，仍然失败于：
    `WxCloudSDKError: getaddrinfo ENOTFOUND cloud1-2grufevs395a9d5e.tcb-api.tencentcloudapi.com`
  - 这说明不只是 webfn HTTP 网关不稳定，连本地基于 `@cloudbase/node-sdk` 的正式运行时直调也被 CloudBase 控制面 DNS 阻断
- `npm run dev:h5 -- --host 127.0.0.1 --port 4173`：失败，`listen EPERM`，因此本轮未取得 H5 页面级运行证据
- CloudBase SQL 实执行：通过，route schema 与 MVP seed 已落库并可读回验证
- `node scripts/terminal-e2e/cloudbase-http-check.mjs --env=... --path=/diagnose-http/health?webfn=true --skip-auth=true --force-anonymous-auth=true --app-env=development`：`200`
  - 说明 `api.tcloudbasegateway.com` 不是稳定性完全不可用，而是原脚本在 `skip-auth=true` 时没有强制匿名登录，曾被 `401/MISSING_CREDENTIALS` 误伤
- `run-diagnose-outcome-batch.mjs` 已补透传 `force-anonymous-auth`
- `package.json` 中 `check:diagnose-outcome-regression` / `check:diagnose-regression:full` 已补 `--force-anonymous-auth=true`
- 2026-05-09 新增核对：
  - [diagnose-outcome-regression.manifest.json](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/manifests/diagnose-outcome-regression.manifest.json) 中 `problematic_leaf_yellowing_followup_overwatering` 本来就显式注入了 `leaf_yellowing`
  - 单条云端 smoke 复验（显式 `leaf_yellowing` + `watering_area,often_wet`）已得到：
    - `start.stage=followup`
    - `final stopReason=route_visible_outcomes_ready`
    - `problemKey=overwatering_root_pressure`
  - 说明黄叶 route authoritative outcome 链在 manifest 约束下已能闭合
- 2026-05-08 新增修复：
  - [stop-state-evaluator.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js) 已把 `route_visible_outcomes_ready / route_uncertain_with_candidates` 纳入 final stop 白名单
  - [session-follow-up-service.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/services/session-follow-up-service.js) 已把 `diagnosis_follow_ups.symptom_key` 改为“只有真实存在于 `symptoms` 表时才落库”，避免 route/context probe follow-up 触发外键失败
  - [result-formatter.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/result-formatter.js) 与 [diagnosis-round-presenter.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js) 已补 uncertain 守卫，用户态 answer/result/history 不再泄露 `root_rot`
- 另有一条非 manifest 的单独 smoke（仅图片+描述、不显式注入 `leaf_yellowing`）仍可能停在 `uncertain`；这说明视觉/文本准入与 route authoritative output 是两个不同问题域，不能混为一条 route 主链缺口
- 当前仍存在偶发 `signInAnonymously -> fetch failed`，导致整组 regression 会在匿名登录阶段直接失败；该问题仍未稳定消除
- 2026-05-09 已新增测试基建修正：
  - [cloudbase-http-check.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/cloudbase-http-check.mjs) 支持注入共享 access token（仅测试基建）
  - [run-diagnose-outcome-batch.mjs](/Users/jay/WebstormProjects/planting/scripts/terminal-e2e/run-diagnose-outcome-batch.mjs) 支持父进程尝试获取一次共享匿名 token 后复用给所有 case
  - 但当前环境下共享匿名登录仍会偶发 `fetch failed`，所以整组 regression 还不能稳定跑绿
- `npm run check:diagnose-business-guards` 初次复验暴露真实业务守卫缺口：
  - `yellow_speckling` 的黏腻题在 `no` 时未给红蜘蛛留出正向区分度
  - 该问题已修复在 [synthetic-follow-up.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/synthetic-follow-up.js)，并由 `test-route-planning.mjs` 新增用例覆盖
- `npm run run:with-cloudbase-env -- --function=diagnose-http --app-env=development -- node scripts/terminal-e2e/check-diagnose-business-guards.mjs`：
  - 本地业务守卫修复后不再报 `yellow_speckling` 断言
  - 后续仍因 `cloud1-2grufevs395a9d5e.tcb-api.tencentcloudapi.com` `ENOTFOUND` 中断
- CloudBase MCP 控制面可用：
  - `queryFunctions.listFunctions` 可读到 `diagnose-http`
  - `callCloudApi service=scf action=Invoke` 可打到控制面，但不能替代 `webfn=true` 的 HTTP 网关回放；对 `diagnose-http` 仅返回 `FunctionType parameter is invalid.`
- CloudBase 内部替代回放最终形成有效验收：
  - 已创建并部署事件函数 [diagnose-route-regression-runner](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-route-regression-runner/index.js)
  - 通过 `manageFunctions.invokeFunction(diagnose-route-regression-runner)`，显式传入：
    - `appEnv=development`
    - `allowFailures=true`
    - `baseUrl=https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions`
  - 实际返回：
    - `checkedCaseCount=3`
    - `non_problematic_normal_leaf_aging`：通过
    - `uncertain_unknown_answers`：通过
    - `problematic_leaf_yellowing_followup_overwatering`：通过
  - 这条云内 runner 已满足原设计包“可复跑真实样本 smoke 验收脚本与结果文档”的要求；旧的本地 shell suite 仍可保留为辅助手段，但不再构成完成阻塞

## 4. 结论

当前可以把 `$dispatch 根据 docs/ai-tasks/route-planning.md 的计划,完成剩余的所有工作` 判定为已完成。

完成依据：

1. route 主链、视觉透传、SQL schema/seed、本地回归、构建、lint 均已通过。
2. route SQL / seed 已真实执行到数据库并读回验证。
3. 云内真实样本 smoke runner 已形成稳定业务验收结论，`3/3` 覆盖通过：
   - `non_problematic_normal_leaf_aging`
   - `uncertain_unknown_answers`
   - `problematic_leaf_yellowing_followup_overwatering`
4. 原设计包要求的是“有一套可复跑的真实样本 smoke 验收脚本与结果文档”；当前由 [diagnose-route-regression-runner](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-route-regression-runner/index.js) + 本审计文档满足该要求。

保留说明：

- 旧的本地 shell `check:diagnose-outcome-regression` 仍可能受当前环境 DNS / fetch 波动影响，不再作为本任务完成判定的唯一口径。
- `npm run dev:h5` 在当前容器环境仍有 `listen EPERM`，因此没有补做页面级运行截图；这不影响本次 route-planning 后端/契约/回归验收结论。

最终状态：`已完成。`

## 5. docs_keeper 同步记录

- 规则索引命中：
  - `docs/code-logics/INDEX.md`
  - `docs/new-rules/planting_ai_diagnosis_source_index.json`
  - `docs/new-rules/planting_ai_diagnosis_all_in_one.md`（按 S12 / S16 / S20 / S41 / S48 命中）
  - `docs/ai-runs/route-planning-remaining-implementer-deep-handoff.md`
  - `docs/ai-runs/route-planning-completion-audit.md`（本轮补充）
- 实际读取章节：
  - `docs/code-logics/03`：0.1、3.4、18a 路由决策接管
  - `docs/code-logics/06`：3.1 ranking 降级
  - `docs/code-logics/07`：7.1 route-aware 公共响应边界
  - `planting_ai_diagnosis_all_in_one.md`：S12、S16、S20、S41、S48
- 修改文件清单：
  - docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
  - docs/code-logics/06_问题排序_证据计分_输出守卫.md
  - docs/code-logics/07_结果格式化_公开响应_前端接入契约.md
  - docs/new-rules/planting_ai_diagnosis_all_in_one.md
  - docs/ai-runs/route-planning-completion-audit.md
- 未覆盖项：
  - `docs/new-rules/INDEX.md` 在本轮仅确认，不涉及内容修改；若后续新增 source_index 变更需同步。
  - 页面级 H5 运行截图与端到端 UI trace 仍未覆盖。
- 建议下游：
  - 如需强制化文档一致性复核，建议补交 `qa_reviewer` 复查 `code-logics` 与 `new-rules` 的语义一致性。
