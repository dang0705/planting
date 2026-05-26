# diagnose-http `/diagnosis/question/start` 冷启动/首屏优化 Handoff

## 一、任务目标
- 将 `/diagnosis/question/start` 首次可见响应压缩到 1 秒以内（不改变业务语义、规则匹配与数据一致性）。
- 区分两类路径：
  - 严格真冷启动：无任何预热（无 Provisioned Concurrency、无历史实例复用、无缓存命中）场景。
  - `route settled + provisioned concurrency` 用户可见路径：以路由已 settle、函数实例可用/可复用为前提的可观测样本，记录其性能收益与边界。
- 优先保证 fast path 在“仅加速首屏提速”而非改变流程策略，不引入 route/gate/outcome 组合缓存，不破坏 follow-up/final/output 资格判断链路。

## 二、代码变更摘要
- 已变更文件（本轮需写入 handoff 证据）：
  - `cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js`
  - `cloudfunctions/diagnose-http/app/manual-symptom-question-start-fast-path.js`（新增）
  - `cloudfunctions/diagnose-http/repositories/session-runtime-write-repository.js`
  - `test-route-planning.mjs`（用于 route 规划/性能回归核验）
- `diagnosis-question-start-runner.js` 与新增 fast-path 文件配合，补齐 question/start 路径的“冷启动首屏更快分流”能力，但不触发主链逻辑绕过。
- `session-runtime-write-repository.js` 维持 runtime 快照与会话状态写回边界，保持与既有 session 生命周期一致。
- `test-route-planning.mjs` 增补/更新了本次性能回归与路径对比验证。

## 三、关键约束与防回退规则
- 保留不变边界（不得变更）：
  - `diagnosis_sessions.runtime_snapshot_json` 持久化。
  - 当前 `round` 的 `diagnosis_follow_ups` 写入链路。
  - 当前答案 mark / final snapshot 的同步边界。
- 不允许的行为：
  - 不做 route / gate / outcome 组合缓存。
  - `fast path / warm path / early return` **不得绕过** `follow-up/final/output eligibility guard`，保持主链资格判断完整。
- 任何 optimization 仅作为首屏提速手段，不能改变：
  - 问诊流程归属。
  - outcome 的最终可见性判断。
  - 会话推进 round 语义。

## 四、部署与平台证据（v14）
- 发布/验证标签：`question-start manual fast path v14 evidence timestamp fix`
- 时间：`2026-05-20 11:31:09`（create / modify）
- 路由快照：
  - route `$LATEST=0`, `14=100`
- Provisioned Concurrency（v14）：
  - allocated=1，available=1，status=Completed
- 说明：平台处于可复用执行环境状态，但不等同于严格真冷启动场景。

## 五、性能证据
- v14 下 `route settled` 后采样 12 次 `question/start` 全部 < 1s：
  - `min` 358ms
  - `median` 396ms
  - `p95 / max` 582ms
  - 第二组样本首条 `582ms`
- 刚切路由后首个用户可见样本（PC）：
  - `1240ms`，应判断为尚未覆盖“严格真冷启动全量达标”，仅代表“切路由首次样本”。
- 函数日志示例：
  - `question/start` `Duration 220ms`
  - 后续 `answer/final` 在 `约 400-553ms`
- 结论：路由 settle + PC 可用状态下，性能已显著改善；但不能将其直接等价为严苛真冷启动全量达标。

## 六、业务 Smoke 证据
### 案例 1：`diag_1779248060289_eb2fcaer`
- `start 827ms`
- `expanding_or_uncertain` 后 `often_wet`
- DB：`awaiting_follow_up`、`round_3`、`needs_follow_up=true`
- `pending light question` 保持跟随业务约定。

### 案例 2：`diag_1779248062526_lic2nu70`
- `start 409ms`
- `expanding_or_uncertain` 后 `often_dry`
- DB：`awaiting_follow_up`、`round_3`、`needs_follow_up=true`
- `pending light question`。

### 案例 3：`diag_1779248064119_to363b2j`
- `start 370ms`
- 后续链路出现 `often_wet`、`stronger_direct_light`、`recent_heavy_fertilizer_or_repot`、`with_wilting_or_drop`
- 最终 `final/problematic`，DB 为 `completed`、`round_6`
- `stop_reason`=`route_visible_outcomes_ready`
- `final_problem_cn` 暂不能稳定判断。

## 七、DB 查询与排障证据
- `diagnosis_sessions` 与 `diagnosis_follow_ups` 已通过：
  - `scripts/terminal-e2e/run-with-cloudbase-env.mjs` 进行抽样核验。
- `observed_evidence_set.last_updated_at` 已补充抽样核验，三条 smoke session 均为正常时间戳而非字符串 `null`：
  - `diag_1779248060289_eb2fcaer`：`2026-05-20T11:34:20`
  - `diag_1779248062526_lic2nu70`：`2026-05-20T11:34:22`
  - `diag_1779248064119_to363b2j`：`2026-05-20T11:34:24`
- MCP SQL / control plane 本轮返回 `AUTH_REQUIRED`，因此采用“本地 SDK 包装脚本”完成数据库链路核验（避免控制面误判）。

## 八、验证命令与记录
- 语法检查（本轮触及文件）：
  - `node --check cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js`
  - `node --check cloudfunctions/diagnose-http/app/manual-symptom-question-start-fast-path.js`
  - `node --check cloudfunctions/diagnose-http/repositories/session-runtime-write-repository.js`
  - `node --check test-route-planning.mjs`
- 路由规划回归：
  - `npm run test:route-planning`
- 静态检查：
  - `npx oxlint --quiet ...`
- CloudBase 侧核验：
  - CloudBase CLI `version/route/PC/log` 查询（用于发布、路由实例与日志一致性复核）。

## 九、未完成/风险与后续建议
- 未完成项：
  - 未能完整证明“严格无预热真冷启动”在所有用户场景下普遍 < 1s。
- 风险：
  - 刚 route 切换后的首个 PC 样本仍为 `1240ms`，说明冷起始可见性仍有峰值风险。
  - 正向 smoke 最终展示为 `暂不能稳定判断`；本轮只验证性能、主链守卫和落库状态，不将该结果解释为规则最优性背书。
- 若要形成严格真冷启动结论，需：
  - 上线独立实验：明确禁止预热/预留实例情况下的冷实例压测。
  - 或设计平台层方案（例如强制隔离启动路径）进行再验证。
- 提交完整性提醒（关键）：
  - 新增 helper 与 `test-route-planning.mjs` 必须随本轮提交，否则 runner 引用链与测试证据不完整。

## 十、handoff 处理建议
- 交付边界：本文件是本轮首屏优化的运行证据与验收交接文档，供下一环节（复测/灰度/发布）直接消费。
- 下一步建议顺序：
  1. 先补齐严格真冷启动实验链路，再与 v14 route settled 性能结果并列。
  2. 重复一次 `npm run test:route-planning` 与 CloudBase 日志快照，固化在手工验收清单。
