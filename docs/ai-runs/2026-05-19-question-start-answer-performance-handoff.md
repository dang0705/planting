# 2026-05-19 question/start 与 diagnosis/answer 性能优化 handoff

## 目标

优化 `diagnose-http` 的 `/diagnosis/question/start` 和 `/diagnosis/answer`：

- 冷启动目标：1 秒内。
- 热路径目标：接近 500ms。
- 约束：不得为了性能绕过 route 主链、follow-up / final 守卫、output eligibility，尤其不得让黄叶首轮浇水答案直接 final。

## 本轮代码改动

- `cloudfunctions/diagnose-http/app/static-cache-preloader.js`
  - 新增静态题库与 route repository 的预加载入口，支持启动时和请求入口异步触发。
- `cloudfunctions/diagnose-http/app.js`
  - 模块加载时预热 production / development schema 的静态 repository cache。
- `cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js`
  - 入口触发预热。
  - 当请求显式传 `plantCatalogId` 且没有 `userPlantId` 时，避免把 catalog id 兼容探测成 user plant id。
- `cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js`
  - 入口触发预热。
  - 当前答案 mark 仍同步等待；仅将 queue answered 标记等非关键持久化改为后台补写。
- `cloudfunctions/diagnose-http/app/frontend-response.js`
  - follow-up 响应瘦身，只返回下一题、基础状态和 UI hints，不返回 finalResult、visibleOutcomes、outputEligibility 等重字段。
- `cloudfunctions/diagnose-http/app/http-router.js`
  - 常规请求日志改为 debug-gated；review/out-of-pool/legacy handler 改懒加载。
- `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
  - 透传 `preferCatalogPlantId` 到植物上下文解析。
- `cloudfunctions/diagnose-http/repositories/question-repository.js`
  - 静态缓存按 schema 隔离，避免 development / production cache 混用。
- `cloudfunctions/diagnose-http/repositories/outcome-route-repository.js`
  - route 静态预加载按 schema 隔离。
  - 仅 `getOutcomeAnswerEffects` 支持由单题缓存精确组合多 answer effect；不得组合 routes / gates / outcomes。
- `cloudfunctions/diagnose-http/repositories/prior-plant-context-repository.js`
  - 支持 `preferCatalogPlantId`，跳过不必要的 user plant 兼容查询。
- `cloudfunctions/diagnose-http/repositories/diagnosis-review/review-performance.js`
  - 性能日志仅在 `DIAGNOSIS_PERF_LOG=true` 或 `DEBUG_LOG=true` 时输出。
- `cloudfunctions/diagnose-http/services/session-supervision-service.js`
  - 无视觉监督信号时跳过 `visual_admission_records` 查询。
- `cloudfunctions/diagnose-http/services/session-follow-up-service.js`
  - 新 session 追问写入可跳过既有行去重查询。
  - 当 payload 已有题目元数据时，跳过额外题库 lookup。
- `cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js`
  - `diagnosis_sessions` runtime snapshot 与 `diagnosis_follow_ups` 仍同步持久化。
  - visual supervision、question_queue、stop_state、initial observed evidence / symptoms 改后台补写。
- `cloudfunctions/diagnose-http/services/session-runtime-snapshot-codec.js`
  - 运行时 snapshot 中的 `routeDecision` 改为 compact 结构。
  - active follow-up snapshot 不再持久化 review-only 的重字段：`derivedEvidenceSet`、`diagnosisDirections`、`diagnosticTrace`、`careBaselineSummary`。
  - `metrics` 置为 `null`，不再复制 routeDecision。
- `cloudfunctions/diagnose-http/utils/diagnosis-directions.js`
  - 普通方向日志改为 debug-gated。
- `cloudfunctions/diagnose-http/repositories/weather-repository.js`
  - `cache_scope IS NULL` 改为 `<=> NULL`；这是前一 weather cache 任务遗留修复，不是本轮性能主线。
- `test-route-planning.mjs`
  - 更新 runtime snapshot 测试契约：以 compact `routeDecision` 为准，`metrics` 不再承载 routeDecision。

## 已回退 / 禁止复用的做法

- 曾尝试把 route / gate / outcome 做单键缓存组合，导致黄叶完整路径缺失 `fertilizer_repot_stress` 并混入 `root_stress`。该做法已回退。
- 后续禁止在未证明等价前组合 `outcome_routes`、`outcome_route_gates`、`diagnosis_outcomes` 或 route planner 输出。
- 可保留的缓存组合仅限 answer effect 行的精确拼接，且必须用负样本和完整路径正样本验证。

## 同步持久化边界

必须同步：

- `diagnosis_sessions.runtime_snapshot_json`
- 当前 round 的 `diagnosis_follow_ups`
- 当前答案 mark / answer row 状态
- final snapshot

允许后台补写：

- `question_queue`
- `stop_state`
- `observed_evidence_set`
- `diagnosis_symptom_observations`
- `visual_supervision` / `visual_admission_records`

如果后续继续压到稳定 500ms 以下，不得直接把必须同步项异步化；应先设计新的幂等协议或批写策略。

## 已验证

- `node -c`：本轮触及 diagnose-http JS 文件通过。
- 针对性投影断言：follow-up 响应瘦身、compact routeDecision、active snapshot 重字段裁剪通过。
- `npm run test:route-planning`：通过。
- 云端真实 HTTP smoke，网关匿名登录，`appEnv=development`：
  - 负样本 `often_wet`：`diag_1779192211746_xw0p13cs`，start 769ms，answer 730ms，下一题 `q_observed_probe__leaf_yellowing__light_change_context`，无 outcomes。
  - 负样本 `often_dry`：`diag_1779192213216_g2syrnf6`，start 405ms，answer 530ms，下一题 `q_observed_probe__leaf_yellowing__light_change_context`，无 outcomes。
  - 正样本：`diag_1779192214131_fdvvf0rk`，路径 `often_wet -> stronger_direct_light -> recent_heavy_fertilizer_or_repot -> with_wilting_or_drop`，最终 outcomes 为 `fertilizer_repot_stress`、`sunburn`、`overwatering_root_pressure`。
  - warm benchmark 12 轮：`question/start` avg 425ms，min 297ms，max 872ms；`diagnosis/answer` avg 527ms，min 457ms，max 622ms。

## 文档同步

- `docs/ai-rules/diagnose-http-cloud-debugging.md`
  - 补充性能优化防复发规则：同步持久化边界、可后台补写范围、schema cache 隔离、禁止 route/gate/outcome 组合缓存、follow-up 响应白名单、必须记录的负/正样本与 benchmark。
- `docs/code-logics/08_会话持久化_历史_运行时快照.md`
  - 补充 `/diagnosis/question/start` 与 `/diagnosis/answer` 性能优化下的同步持久化边界、可后台补写范围、compact `routeDecision` 与 `metrics=null` 口径。
- `docs/code-logics/07_结果格式化_公开响应_前端接入契约.md`
  - 补充 active follow-up 响应白名单，明确禁止在 follow-up 响应返回 `finalResult`、`visibleOutcomes`、`outputEligibility` 或重型 review/debug 字段。
- `docs/new-rules/` 未更新：本轮未新增诊断业务规则、Sxx 源规则、route SQL 或 outcome 文案，只是后端性能与运行时边界实现。

## 线上状态

- 已发布到 `diagnose-http` v12。
- `$DEFAULT` alias 当前为 `$LATEST` range `[0,0)`、v12 range `[0,100)`，即 100% 走 v12。
- v12 provisioned concurrency：Allocated=1、Available=1、Status=Done。
- 已清理旧版本 7 / 9 / 10 / 11 的残留 provisioned concurrency。
- 函数配置复核：Nodejs18.15、2048MB、状态 Active / Available。

## PC 清理后复测

- 负样本 `often_wet`：`diag_1779192439692_onq89av0`，start 1412ms，answer 763ms，下一题 `q_observed_probe__leaf_yellowing__light_change_context`，无 outcomes。
- 负样本 `often_dry`：`diag_1779192441675_kvotsqin`，start 409ms，answer 552ms，下一题 `q_observed_probe__leaf_yellowing__light_change_context`，无 outcomes。
- 正样本：`diag_1779192442628_vnmuen3o`，路径仍正确，最终 outcomes 为 `fertilizer_repot_stress`、`sunburn`、`overwatering_root_pressure`。
- 8 轮 bench：`question/start` avg 391ms；`diagnosis/answer` avg 992ms，但包含一次 4076ms 离群值。
- 16 轮 warm bench：`question/start` avg 633ms，首个 3902ms 离群；排除首个后约 415ms，p50 430ms。`diagnosis/answer` avg 574ms，min 463ms，max 760ms，p50 587ms。

## DB 一致性抽查

CloudBase SQL schema：`cloud1_dev`。

- `diagnosis_sessions`
  - `diag_1779192439692_onq89av0` / `diag_1779192441675_kvotsqin`：`session_status=awaiting_follow_up`、`stop_reason=await_follow_up`、`needs_follow_up=1`、`current_round_id=round_2`、`metrics` 为 `NULL`。
  - `diag_1779192442628_vnmuen3o`：`session_status=completed`、`outcome_type=problematic`、`stop_reason=route_visible_outcomes_ready`、`needs_follow_up=0`、runtime snapshot 中 `routeDecision.visibleOutcomeKeys` 数量为 3、`metrics` 为 `NULL`。
- `diagnosis_follow_ups`
  - 负样本首题均已 `status=answered`，answer 分别为 `often_wet` / `often_dry`；下一题 `light_change_context` 已落为 pending。
  - 正样本 4 题均已 `status=answered`，answer 依次为 `often_wet`、`stronger_direct_light`、`recent_heavy_fertilizer_or_repot`、`with_wilting_or_drop`。
- `question_queue`
  - 负样本 round_1 已 exhausted，round_2 有 1 个 active item。
  - 正样本 round_1 到 round_5 均已落库，final round queue exhausted。
- `stop_state`
  - 负样本 round_2 为 `pending_follow_up`、`output_eligible=0`。
  - 正样本 round_5 为 `problematic_converged`、`output_eligible=1`、`stop_reason=route_visible_outcomes_ready`。

## 未完成 / 风险

- `diagnosis/answer` warm 均值已接近 500ms，但不是稳定小于 500ms；最后一跳 final 仍可能 700ms+，因为 final snapshot 和结果写入更重。
- 冷启动/首请求仍可能超过 1 秒；即使 v12 PC Ready，网关/DB/预热抖动仍会出现 1.4s 到 3.9s 离群。
- 未跑全量 `npm test` / `npm run build`；本轮主要验证了 route-planning 与真实云端 smoke。

## 下一步建议

1. 若只追求最安全业务口径，保留当前实现；不要继续压必须同步的 session / follow_up 写。
2. 若必须稳定低于 500ms，需要单独设计批写或轻量 session snapshot 协议，并重新走高风险 route/runtime Dispatch。
3. 若需要进一步降低首请求离群，需要结合函数日志、DB 慢查询和网关耗时拆分定位，不能只在业务代码里继续删持久化。
