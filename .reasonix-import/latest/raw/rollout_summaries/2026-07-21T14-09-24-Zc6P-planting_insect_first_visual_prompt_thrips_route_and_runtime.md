thread_id: 019f8502-8a6b-78e0-a12d-a7b518a6349f
updated_at: 2026-07-22T04:56:12+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T22-09-24-019f8502-8a6b-78e0-a12d-a7b518a6349f.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# 强化虫体优先视觉识别、修复蓟马直判并验证前端结果展示

Rollout context: 工作目录为 `/Users/jay/WebstormProjects/planting`。用户先要求提示词支持 8 种具体虫害，随后强调模型必须真正识别图片中的虫体，而不是仅从植物症状推断；还要求注意 prompt cache、前端打印完整 prompt，并处理结果页重复文案与真实端上验证。

## Task 1: 将 8 种虫害识别规则加入视觉提示词

Outcome: partial

Preference signals:
- 用户明确说“我认为这个提示词不够硬，我要的是让模型除了识别植物，还得识别图片的虫体。” -> 类似视觉任务应默认要求模型显式检查、描述并结构化输出虫体存在性、形态和位置，不能只列候选名称。
- 用户提醒“注意 prompt cache” -> 稳定的 schema 和识别规则必须放入 cache static prefix，动态图片上下文放入 dynamic tail；未来修改提示词时应主动检查 static-prefix hash/缓存契约。

Key steps:
- 核对发现 `symptom-labeler-prompt.js` 已包含 8 个模式、中文名称及直判门槛：`spider_mite`、`mealybug`、`scale_insect`、`whitefly`、`aphid`、`thrips`、`leaf_miner`、`fungus_gnat`。
- 在 `visual-contract.js` 的输出 schema 中新增 `visual_discriminators` 和 `missing_info_for_path`，要求输出 `insect_body_presence`、`insect_body_shape`、`insect_body_location`。
- 在 `symptom-labeler-prompt.js` 的静态规则中加入 INSECT-BODY-FIRST：每张图先检查虫体、虫群、硬壳、幼虫、飞虫和潜道；症状、蛛网、白黄点、黑点、黏液、孔洞或银斑不能冒充虫体；看不清必须标记 uncertain。
- 明确潜道是 `leaf_miner_tunnel` 形态证据，不等于“看到了虫体”。
- 更新 prompt cache 合同测试，使新 schema 字段成为预期的一部分。

Failures and how to do differently:
- 初次补丁因 apply_patch hunk 格式错误未写入；后续拆成 schema、静态规则和测试三个小补丁成功。
- 初始 cache 测试仍断言 `visual_discriminators`/`missing_info_for_path` 不应存在，导致失败；应同步更新与新契约冲突的旧断言，而不是误判实现失败。
- 定向 prompt-cache 测试最终通过；lint/fmt 无 error，但存在大量既有 `no-magic-numbers` warning。

Reusable knowledge:
- cache-first prompt 的稳定内容由 `buildCacheFirstVisualPrompt()` 的 `schemaText`、`ruleText`、`evidenceDirectoryText` 构成；`dynamicTaskText` 只放当前图片、entry profile、区域、上下文和未解决证据。
- 8 种虫害的直接门槛已被写入静态规则：蛛螨需清晰虫群或同区细网+密集白黄点；粉蚧需蜡粉椭圆虫群；介壳虫需多个固定硬壳；白粉虱需叶背成虫+椭圆若虫；蚜虫需梨形虫群；蓟马需清晰细长虫体或银斑+同区黑点；潜叶虫需连续变宽弯曲潜道；蕈蚊需盆土附近多只黑飞。

References:
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js:84-115,500-505`
- `cloudfunctions/diagnose-http/utils/visual-contract.js:44-89`
- `test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs:409-410`
- 验证命令：`node test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs`

## Task 2: 修复清晰虫体蓟马被解析器过滤的问题

Outcome: success

Key steps:
- implementer 修改 `cloudfunctions/diagnose-http/utils/diagnosis-parser.js`，将 `thrips_visible` 直达条件调整为：`thrips >= 0.95`，且 `insect_body_presence=present`、`insect_body_shape=slender` 均为高置信；不再要求 pest profile、固定 `leaf_upper_surface` 或高置信位置。
- 增加 full/pest 两种 profile、`other_local`/中等位置置信度以及负例测试。
- 修正断言文本为“局部区域可见清晰细长虫体”。

Reusable knowledge:
- 蓟马直判不应因拍摄部位不是叶片正面或位置置信度中等而被过滤；清晰虫体形态和高置信存在性是核心证据。
- 通过 `node test/unit/backend/diagnose-http/utils/diagnosis-parser.mjs`、定向 lint、fmt 和 `git diff --check`。

References:
- `cloudfunctions/diagnose-http/utils/diagnosis-parser.js:135-168,282-294`
- `test/unit/backend/diagnose-http/utils/diagnosis-parser.mjs:258-329`
- 实际后端/端上证据：视觉输出 `mode_candidates=[{mode:"thrips",confidence:0.95}]`，`thrips_visible` 为 strong/high/ready，三个虫体 discriminator 均为 high。

## Task 3: 清理单一结论结果页重复文案

Outcome: success

Key steps:
- `outcome-advice.js` 为 advice group 增加 `showOutcomeLabel`：单一结论隐藏重复标题，多结论保留标题分组。
- `setup.js` 透传该字段；`DiagnoseResultStage.vue` 对 action/avoid advice 均按字段显示标题。
- 新增 `test/unit/frontend/components/diagnose-flow/outcome-advice.mjs`，覆盖单结论、多结论和模板断言。

Validation:
- outcome advice 单测、结果页单测、question-package result-view 单测、lint、fmt 和 `git diff --check` 均通过。

References:
- `src/components/diagnose-flow/outcome-advice.js:237-250`
- `src/components/diagnose-flow/setup.js:54-61`
- `src/components/diagnose-flow/DiagnoseResultStage.vue:76-99`
- `test/unit/frontend/components/diagnose-flow/outcome-advice.mjs`

## Task 4: 真实小程序请求和 Automator 验收

Outcome: partial

Key steps:
- 通过 IDE 控制端口 `27021` 启用 Automator `9420`，成功连接，当前页为 `pages/index/index`。
- 使用小程序运行时 `wx.cloud.getTempFileURL` 从 CloudBase fileId 重新生成有效临时图片 URL，避免旧签名 URL 403。
- 通过小程序运行时 `wx.request` 向 LAN 本地函数发起真实 pest C3 请求，返回 HTTP 200；会话 `completed`、`current_route_primary_action=finalize`、`needs_follow_up=0`，最终问题为 `thrips`，唯一可见结论为“蓟马”。数据库记录也确认 `final_problem_key=thrips`、`final_problem_cn=蓟马`。

Failures and how to do differently:
- 旧签名 URL 导致视觉适配器 `visual_adapter_failed`，原始记录明确为“图片下载失败(403)”；未来真实图片复测应先通过小程序运行时重新获取 temp URL。
- 正式 `qa-run` 在执行测试脚本前因 `project_identity_unverified` 阻断：虽有当前 session 日志证明 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin` 与 9420，但工具没有把控制端口/9420 子进程完整关联起来。该结果只能算 failed_environment，不是产品失败。
- 直接运行 Automator fixture 脚本连接成功，但在 `scenario.fiveTabAndReuse` reLaunch 阶段超时，未产生截图或请求证据；不能宣称正式 Automator 通过。
- `diagnosis-parser.mjs` 在早期状态曾出现 `direct_result`/`question_package` 断言冲突；后续 implementer 修复后定向 parser 回归通过。当前后端真实结果使用 `finalize` 字面量但行为是直接最终结果，未来应统一路由语义命名。

Reusable knowledge:
- 正式端上验收必须经 `dispatch-gate cli.mjs qa-run`，精确 catalog id 为 `diagnosis.pest.visual_mode_retake`，projectPath 为 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`，Automator 端口为 9420；直接脚本或 curl 只能算排障证据。
- 真实小程序运行时请求成功证明了解析器和后端链路，但不替代 screenshot、入口交互、wx.request 全链路和 Completion Gate 证据。

References:
- 真实会话：`diag_1784696061974_5uogkffx`
- 视觉 batch：`visbatch_1784696061975_xgk5iqyi`
- 正式 QA 记录：`.tmp/dispatch-task/diagnosis-result-dedupe-20260722-01/qa-runs/pest-result-dedupe-live-20260722-01.json`
- QA 错误：`project_identity_unverified`
- 真实结果：`statusCode=200`, `final_problem_key=thrips`, `final_problem_cn=蓟马`, `needs_follow_up=0`

## Task 5: 前端打印完整 prompt

Outcome: uncertain

Preference signals:
- 用户要求“给我前端打印出完整的 prompt” -> 未来应在真正发起视觉诊断请求的边界打印完整 prompt，而不是只打印摘要，并默认确认日志开关、开发环境限制和是否请求 payload 实际携带 prompt。

Failures and how to do differently:
- 本 rollout 中没有完成该任务的明确代码变更或验证；不要声称前端完整 prompt 已打印。

Reusable knowledge:
- 当前前端请求层主要传递图片、profile、entrySource 和 visual trace；实际 prompt 由后端 `symptom-labeler-prompt.js` 构造，因此需要先确认前端是否真的拥有 prompt，避免在错误层添加日志。
