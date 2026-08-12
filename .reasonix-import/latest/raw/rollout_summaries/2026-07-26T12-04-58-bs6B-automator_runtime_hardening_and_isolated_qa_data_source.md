thread_id: 019f9e50-6dba-7162-a3d5-e33019b44081
updated_at: 2026-07-27T09:26:54+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/26/rollout-2026-07-26T20-04-58-019f9e50-6dba-7162-a3d5-e33019b44081.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Automator 运行面硬化、诊断路由调查与数据源隔离讨论

Rollout context: 工作目录为 `/Users/jay/WebstormProjects/planting`。用户先询问单个 `aphid`、confidence 0.95 为什么仍得到前端 outcome，以及 `visimg1_...` 是否由近期 Codex review 修复引入；随后重点转向 Automator 截图、项目识别、进程卡住和隔离 QA 运行面的系统性修复。

## Task 1: 诊断 mode_candidates 到前端 outcome 链路调查

Outcome: partial

Key steps:
- 检查了 `visual-mode-route-service.js`、`diagnosis-mode-router.js`、`pest-visual-orchestrator.js`、`frontend-response-helpers.js`、`specific-pest-answer-resolver.js` 等链路。
- 代码显示 `mode_candidates` 会被标准化并按 profile/confidence 参与路由；full profile 下候选模式可进入 `direct_result`，specific-pest 单候选最终可产生 `visibleOutcomes`，而多候选才产生 `directionChoices`。
- `visimg1_<timestamp>_<random>` 由 `cloudfunctions/diagnose-http/services/visual-diagnosis-service.js` 的 `buildImageRuntimeInput()` 通过 `buildRuntimeId('visimg1')` 生成，是本次请求的运行时图片标识，不是模型输出的 diagnosis mode，也没有证据表明它本身是 Codex review 修复造成的。
- 相关近期提交包括 `37bf16f`、`2257d06`、`e0682a5`、`5e7716e`；其中 `5e7716e` 明确修复 confidence passthrough、多 non-pest outcomes 和 outcome keys，但本 rollout 没有完成针对用户那条具体 raw log 的端到端复现或最终结论。

Reusable knowledge:
- `mode_candidates` 只是路由输入；前端展示 outcome 还经过 mode router、orchestrator、specific-pest/non-pest resolver 和 frontend response projection。不能仅根据 `[diagnosis/start] ... AI raw data` 判断最终 outcome。
- 单候选不等于一定显示追问：应同时检查 `visibleOutcomes`、`routePrimaryAction`、`questionRequired`、`directionChoices` 和 terminal state。

## Task 2: Automator/DevTools/本地运行时系统性硬化

Outcome: success

Preference signals:
- 用户明确要求“绝对安全的测试环境”，并不希望“天天耗费 token 在修一个固定的工作流上面” -> 类似任务应优先做可复用的运行时隔离、租约、硬超时、明确失败分类和证据合同，而不是依赖人工重试或临时脚本纠正。
- 用户要求排除 DevTools 崩溃、9420 被手动关闭、网络/LAN 和微信环境异常后，仍不能出现卡死、误项目、无限重试等工作流故障 -> 测试系统应快速失败并输出可解释的 contract/product/environment 分类。

Key steps:
- 修复 DevTools `projectpath` 双重 URL 编码：改为直接交给 `URLSearchParams` 编码，避免 `%252F` 导致 HTTP 200 但实际未打开目标项目。
- 为 `dist/dev/mp-weixin` 增加本地运行租约和同项目复用，避免重复启动、错误回收或误杀其他项目。
- 增加严格项目身份验证：联合检查目标路径、DevTools PID/祖先链、控制端口、9420 listener、`project.config.json` 和同 session 的 WeappLog 证据。
- 将截图捕获移到独立 worker；每次有界超时，父进程可强制结束；检查 PNG 文件头；截图故障不再卡住主 Automator 会话。
- 将正式叶子脚本限制为策略定义的 3 张截图，避免额外“最终截图”造成 watchdog 超时。
- 修复黄叶快捷入口缺失本地问诊 fixture 导致真实函数 401 的测试运行器问题。
- 修复 `Layout.vue` 返回行为缺陷，并补充 DevTools 恢复、运行租约、预检 deadline、QA 分类等合同测试。

验证证据:
- 正式 Automator r7 通过，目标项目为 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`，页面 `pages/index/index`，9420，真实小程序 `wx.request`，3 张有效 PNG。
- `validate-completion-readiness.mjs` 返回 `status: passed`。
- episode 已 `completed`，`reviewStatus: passed`、`qaStatus: passed`；trace audit 返回 `status: passed`。
- 关键文件包括：`.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs`、`devtools-session-log.mjs`、`qa-preflight-runtime.mjs`、`qa-preflight.mjs`、`automator-screenshot-worker.mjs`、`scripts/dev/run-local-api-env.mjs`、`scripts/dev/local-runtime-session.mjs`、`test/e2e/automator/diagnosis/pest-mode-and-retake.mjs`、`test/e2e/automator/catalog.json`、`src/Layout.vue`。

Failures and how to do differently:
- 之前把 HTTP 200、9420 可连接或裸跑脚本当成项目已正确打开/正式验收，实际可能是错误项目或不完整证据。以后必须先通过 catalog-backed `qa-run` 的 target project preflight，再认可 Automator 结果。
- 不要无条件 `pkill`、重启 DevTools、抢占 9420 或无限重试；先证明唯一目标项目和控制端口，再允许一次 target-only recovery。
- 不要把 provider/实现完成、裸跑 Automator 或单独 `wx.request` smoke 直接当作 Completion Gate 通过。

## Task 3: 隔离 Automator 但复用真实开发数据源的方案确认

Outcome: uncertain

Preference signals:
- 用户同意“将 automator 隔离后”并要求仍能测试“最新代码的真实数据” -> 未来方案应隔离 DevTools 本地缓存、登录态和页面栈，但不要复制或伪造构建产物、LAN gateway 或数据库。

Reusable knowledge:
- 当前本地链路是 `npm run dev:mp-weixin:local-functions:lan -> dist/dev/mp-weixin -> LAN gateway 3010 -> tcb-ff -w 本地函数 -> CloudBase development/cloud1_dev`。
- 前端本地请求使用 `VITE_API_BASE_URL`、`VITE_DEV_OPENID` 和 `x-wx-openid`/`x-openid`；本地云函数 gateway 默认使用开发环境和 `cloud1_dev`，函数运行时以 `tcb-ff -w` 监听源码变化。
- 因此隔离 DevTools 可以复用同一 `dist/dev/mp-weixin`、同一 LAN gateway、同一 CloudBase 开发环境和测试身份，同时不共享 DevTools 缓存/登录残留。
- Rollout 最后提出 Automator 专属 9421、日常 DevTools 保持 9420 的方案，但用户尚未在该 rollout 中确认或验证 9421 的实现；不能把 9421 视为已落地事实。

References:
- 正式 QA execution record：`.tmp/dispatch-task/dispatch-20260727-automator-runtime-hardening-recovery-r7/qa-runs/automator-runtime-hardening-20260727-recovery-r7-live-1.json`
- 运行报告：`.tmp/e2e/diagnosis/pest-mode-and-retake/1785143130637/pest-mode-and-retake-runtime-report.json`
- 证据截图：`00-home-diagnose-popup.png`、`03-direction-active.png`、`05-retake-skip-terminal.png`
- 启动命令：`npm run dev:mp-weixin:local-functions:lan`
