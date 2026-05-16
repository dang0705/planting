# 诊断 Replay / Zero-Model 脚本规则

## 1. 适用范围

本文件适用于 `diagnose-http` zero-model replay、DB-backed replay、诊断历史会话复盘、batch artifact / conclusion artifact 生成、需要 CloudBase 凭证与 SQL schema 对齐的本地脚本、视觉诊断证据正式分析，以及 ranking → route、outcome 瘦身、路径规划、问诊路径、gate、runtime 等诊断流改造后的回放验证。

## 2. 禁止事项

1. 不要裸跑依赖 CloudBase 凭证的本地脚本。
2. 不要在未验证项目 wrapper 路径前，把本地 replay 失败描述成“shell 缺 CloudBase secret”。
3. 不要信任 `--session-id-file` 的文件名来判断是否包含正式视觉证据。
4. 不要把低价值大字段塞进 canonical batch artifact，除非用户明确要求。
5. 不要把默认 replay 误当成历史决策点复盘。
6. 不要把 replay 命令成功误当成诊断规则正确。
7. 不要把 replay 产物中的中间字段直接视为前端可见 outcome，必须区分运行时中间态和前端展示态。
8. 不要把 `review/list`、历史 session replay 或 DB 中间态当成客户端运行时最终展示验收；它们只能作为复现入口或辅助证据。

## 3. 标准执行入口

必须使用项目 wrapper 或 npm alias。

```bash
npm run replay:diagnosis-sessions -- --session-ids=<diag_id> ...
npm run run:with-cloudbase-env -- --function=diagnose-http -- node <script> ...
```

标准 wrapper：

```text
scripts/terminal-e2e/run-with-cloudbase-env.mjs
```

## 4. 历史诊断决策点复盘

默认 replay 是“从当前 session state replay 下一步动作”。

如果需要检查“为什么那一轮做出那个决策”，必须显式传入：

```bash
--replay-round
--replay-stage
```

## 5. 视觉证据要求

从 `--session-id-file` replay 并用于视觉诊断分析时：

1. 不得信任文件名。
2. 源文件本身必须携带已验证的 `visualFinalEvidence`。
3. replay 命令必须传入 `--require-visual-final-evidence=true`。
4. 如果缺少正式视觉证据，脚本应拒绝运行。
5. 视觉证据、问诊事实、上下文事实、规则推断必须区分，不得混为同一层。

## 6. Batch Artifact 规范

每个 diagnosis replay batch 必须输出 canonical batch artifact：

```text
scripts/terminal-e2e/batch/
```

并输出成对 conclusion artifact：

```text
scripts/terminal-e2e/conclusion/
```

canonical batch results 只保留 replay audit 核心字段：

1. `sessionId`
2. `visualFinalEvidence`
3. `symptomClassReplay`
4. `round1`
5. `round2`
6. `outcome`
7. `calculationProcess`

## 7. Ranking → Route / Outcome 瘦身验证要求

涉及 ranking → route、outcome 瘦身、路径规划时，replay 审计必须额外关注：

1. 当前代码是否仍存在 ranking 作为最终决策的残留路径。
2. route 是否承接了用户处理路径、问诊推进和 outcome 收敛职责。
3. outcome 是否从运行时中间态与前端可见态分层。
4. 是否允许多 outcome 经路径推进逐步收窄到 1～3 个前端可见结果。
5. 瘦身发生在哪一层：候选生成、路径规划、前端展示、文档输出或日志产物。
6. replay 产物是否足以解释 route 决策过程。
7. batch artifact 是否保持精简，不把无关字段重新膨胀回来。
8. 历史 session 复盘必须区分观察入口和 bug 发生位置：如果用户报告的是客户端运行时或最终展示，replay 通过后仍需验证 result/read 顶层字段与前端消费路径。
