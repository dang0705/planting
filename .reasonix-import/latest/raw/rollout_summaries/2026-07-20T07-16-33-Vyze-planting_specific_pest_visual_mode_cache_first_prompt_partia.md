thread_id: 019f7e62-3661-7150-b56d-6e906b630fd8
updated_at: 2026-07-21T07:32:48+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/20/rollout-2026-07-20T15-16-33-019f7e62-3661-7150-b56d-6e906b630fd8.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# 虫害视觉模式、缓存优先 Prompt 与动态题包已实现，但端上 Completion Gate 仍阻塞

Rollout context: 在 `/Users/jay/WebstormProjects/planting` 中，基于用户关于“未获知虫害/已获知虫害”两种入口、具体虫害模式、高特异性直判、最多 1–2 题、低风险任务和缓存命中优先 Prompt 的要求，完成了跨后端、前端、视觉协议、题包和小程序运行验收工作。

## Task 1: 具体虫害视觉模式与确定性路由

Outcome: partial

Preference signals:
- 用户要求“命中缓存为核心思想，不变量前置，变量后置” -> 视觉 Prompt 应保持稳定静态前缀，将 profile、轮次、器官/拍摄区域、图片和上下文放在动态尾部。
- 用户区分“未获知虫害”与“已获知虫害” -> `full` 入口可并列评估黄叶、枯萎和具体虫害；`pest` 入口只允许具体虫害候选。
- 用户要求高特异性时减少问诊，非高特异性最多 1–2 题，并优先低风险、留在屏内完成的任务；“我不敢/跳过”必须记录为未知而非阴性。
- 用户要求 C 端使用俗称和外观描述，学名仅作辅助。

Key steps:
- 读取并核对诊断链路、固定题包契约、CloudBase AI/云函数规范、uni-app/Vue 约束和 ByteRover 项目记忆。
- Implementer 完成具体虫害模式注册、确定性路由、缓存优先视觉 Prompt、动态题包、补拍授权和公共题包页衔接。
- Prompt 已约束模型只输出可见证据和模式候选，不能直接确诊或选择最终题包。
- 路由器依据正式接纳证据、置信度、同图同区域约束、同义证据去重和入口 profile 决定直达结果、方向选择、补拍或动态题包。

Reusable knowledge:
- 主要后端入口包括 `cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js`、`diagnosis-mode-registry.js`、`utils/symptom-labeler-prompt.js`、`utils/visual-prompt-cache-contract.js`。
- `full` 与 `pest`、initial 与 followup 共用 `[Dynamic Task]` 前的静态 Prompt 前缀；缓存是否命中必须由 provider usage 的缓存创建/读取字段验证，不能仅凭哈希或倒计时推断。
- 具体虫害动态题包使用 0–2 题：0 题表示直达结果，1–2 题表示正式题包；黄叶仍为 4 题，枯萎/发蔫仍为 5 题。
- 高特异性间接证据必须来自同一图片、同一 `region_ref`；低可分析度进入补拍；多项具体虫害结果可同时保留。
- `surface_glossy_residue` 只表示图片中可见的发亮/近透明残留，不能直接解释成“黏”或蜜露。

Failures and how to do differently:
- 初始 BRV 查询因沙箱权限失败，后续使用受限权限成功；未来应在任务开始按项目安装路径运行 `.agents/skills/byterover/scripts/query.mjs`，必要时提前申请权限。
- 曾发现动态题包回答可能丢失 `captureRegion` 或将未知/排除选项错误映射为正向证据；未来必须检查最终 HTTP/`wx.request` payload，并为 absent/unknown/negative 选项做显式映射测试。
- Implementer 初始 `completed` receipt 同时包含 `deviations_or_blockers`，导致 validator 拒绝；已修正为 `deviations_or_blockers: []`，未验证项放入 `qa_handoff.not_verified_by_implementer`。

References:
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js:462`：缓存优先 Prompt 和虫害黑色粪点提示。
- `cloudfunctions/diagnose-http/utils/cloudbase-ai-openai-contract.js:177-210`：静态 Prompt 与动态任务拆分及缓存控制。
- `cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js:304-413`：低质量补拍、证据准入、具体模式路由。
- `cloudfunctions/diagnose-http/app/package-answer-ownership-runtime.js`：服务端 `questionPackageSnapshot` 校验题目/选项归属。

## Task 2: 动态题包、公共页面与补拍流程

Outcome: partial

Key steps:
- 所有需要用户作答的题包统一交给 `pages/diagnose/question-package`，DiagnoseFlow 负责保存完整上下文并导航，不在弹窗内维护另一套题包流程。
- 首次题包提交统一使用 `answer_submit`，服务端根据会话持久化的 `questionPackageSnapshot` 校验 `questionKey` 与 `optionKey`。
- 支持 1 题动态虫害包；补拍授权支持倒计时、跳过为 unknown、过期终态和上下文保留。

Reusable knowledge:
- 前端关键文件：`src/components/diagnose-flow/dialog-submit.js`、`src/pages/diagnose/question-package/question-submit.js`、`src/pages/diagnose/question-package/retake-flow.js`。
- 题包客户端回传对象仅用于展示/上下文；最终授权来源是服务端会话快照。
- ByteRover 中已更新既有主题 `architecture/diagnosis/question_package_answer_submission/question_package_answer_submission.html` 和 `architecture/diagnosis/visual_recognition_boundary.html`，修正了旧的“题数必须大于 1”“仅支持黄叶/枯萎”及旧视觉角色契约。

## Task 3: 验证与 Completion Gate

Outcome: partial

Key steps:
- 12 项定向单测通过，构建、格式检查、lint、postflight 和 catalog 校验通过。
- 端上业务断言报告为 104 条通过，覆盖动态 1/2 题包、公共页面、请求 payload、补拍倒计时、跳过 unknown、过期终态、多结果和黄叶/枯萎回归。
- 观察到真实缓存创建与读取 token 证据，但最新黑色粪点 Prompt 尚未用原图重新验证真实模型改善幅度。

Failures and how to do differently:
- Completion Gate 仍为 blocked：微信开发者工具 `App.captureScreenshot` 和独立 `miniprogram-automator mp.screenshot()` 均返回 `fail to capture screenshot`，因此缺少必需的非空 PNG 运行证据。
- 另有仓库既有的 layout-only 检查问题（无关测试导入 `src`）未被修改。
- 尚未执行生产 SQL migration/deployment；真实 provider 黑色粪点识别和自然等待完整补拍过期也未完成。
- 不能把 104 条业务断言或实现者 postflight 通过表述为完整发布验收；应先恢复截图通道并重新运行 catalog leaf，再重新生成 runtime QA evidence 和 Completion Gate。

References:
- Runtime QA：`.tmp/dispatch-task/pest-question-package-submit-route-20260721-01-runtime-qa-evidence.json`，状态为 `blocked`。
- Catalog leaf：`test/e2e/automator/diagnosis/pest-mode-and-retake.mjs`，catalog id `diagnosis.pest.visual_mode_retake`。
- Completion command：`node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs ...`，当前失败原因为 screenshot/automator evidence 未通过。
