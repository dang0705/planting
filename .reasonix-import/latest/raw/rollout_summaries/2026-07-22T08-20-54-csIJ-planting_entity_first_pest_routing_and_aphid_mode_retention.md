thread_id: 019f88e9-d874-7900-a3e9-3a4ec8fc4125
updated_at: 2026-07-22T09:58:06+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T16-20-54-019f88e9-d874-7900-a3e9-3a4ec8fc4125.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# 视觉虫害识别强化并修复高置信模式丢失

Rollout context: `/Users/jay/WebstormProjects/planting`。用户要求模型不仅识别植物症状，还必须识别图片中的虫体；随后补充真实运行证据：AI 已返回 `aphid`、confidence `0.95`，但系统因缺少重复的 `aphids_visible` 症状证据而丢弃该模式。

## Task 1: 强化虫体优先视觉提示

Outcome: success

Preference signals:
- 用户明确说“这个提示词不够硬，我要的是让模型除了识别植物，还得识别图片的虫体” -> 类似视觉任务应把虫体识别作为强制检查流程，而不是只扩充候选名称。
- 用户特别提醒“注意 prompt cache” -> 规则和 schema 必须放在稳定静态前缀，不能放进动态任务尾部。

Key steps:
- 在静态视觉 schema 增加 `visual_discriminators` 和 `missing_info_for_path`，强制输出 `insect_body_presence`、`insect_body_shape`、`insect_body_location`。
- 加入实体优先规则：先检查虫体、虫群、硬壳、幼虫、飞虫和叶内潜道；症状、蛛网、白黄点、黑点、孔洞或银斑不能冒充虫体；看不清必须标记 uncertain。
- 保留 8 种具体虫害及其直判阈值；叶潜道作为 `leaf_miner_tunnel` 独立形态，不虚报为可见虫体。
- Prompt cache 合同测试通过，四种 profile/round 静态前缀哈希一致：`b838a350206716fc4620c80a0a78784d259f2ecd`，长度 2412 字符。

Failures and how to do differently:
- 初次补丁因 apply_patch hunk 格式错误未写入；随后拆分为 schema 和静态规则两个补丁成功。
- 旧测试曾断言 schema 不得包含 `visual_discriminators` / `missing_info_for_path`，需要同步更新契约测试。

Reusable knowledge:
- 视觉提示采用稳定静态前缀 + 动态任务尾部；实体优先通用指令、输出 schema 和机器目录属于静态区。实际缓存命中只能看服务商 usage 的 `cached_tokens` / `prompt_cache_hit_tokens`，不能由 hash 或耗时推断。
- 当前项目禁止在提示词中加入逐虫形状、颜色、尺寸、身体结构或附着姿态文字来诱导模型；模型应先独立读图，再由规则映射模式和证据。

References:
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js`
- `cloudfunctions/diagnose-http/utils/visual-contract.js`
- `test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs`
- `node test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs`

## Task 2: 修复高置信 aphid mode 被系统丢弃

Outcome: partial

Preference signals:
- 用户提供运行事实“ai返回的数据中，mode_candidates 是有aphid，confidence是0.95。但到了系统层面就把他丢了” -> 调试时必须追踪模型输出经过 parser、router、orchestrator 的完整链路，不应只继续强化 prompt。
- 用户要求不能伪造症状证据 -> 保留实体候选时不得自动生成 `aphids_visible`。

Key steps:
- 定位到 `diagnosis-mode-router` 的 `supportingEvidenceForMode` 过滤：没有正式症状证据时会丢弃 mode candidate。
- 修复为：合法、器官匹配、profile 合法且 confidence >= `0.90` 的具体虫害 `mode_candidates` 可作为独立 confirmation candidate 保留；不生成 direct evidence，也不伪造症状。
- 保持低置信、非法 profile、器官不匹配候选过滤；`yellow_speckling` / `stippling` 单独不能生成 `spider_mite` 候选，细网+点状伤痕及可见螨群规则仍有效。
- 更新 parser、router、注册表、静态 prompt、回归测试及 `docs/ACTIVE_CONTRACTS.md` / `docs/CURRENT.md`。
- router、parser、prompt-cache 测试、scoped lint/fmt、`git diff --check` 均通过；实现者 result contract 通过。

Failures and how to do differently:
- 首轮实现只完成提示词和单黄点排除，未修复 mode 收敛链路；用户新证据后通过同一线程做一次 consolidated rework。
- 正式 Completion Gate 被并发工作区改动阻塞：`cloudfunctions/diagnose-http/configs/index.js` 在 baseline 后变化且不在授权范围；未擅自覆盖。未部署，也未做端上验收。

Reusable knowledge:
- `mode_candidates` 是模型提供的独立候选来源，不应强制要求同次重复的正式 symptom candidate 才能保留；但“保留候选”与“正式接纳/direct evidence”必须分开。
- 关键回归应覆盖：`aphid 0.95 + yellow_speckling` 保留 confirmation candidate、无 `aphids_visible`、directMatches 为空；`aphid 0.89` 被过滤；root/非法 profile 候选被过滤；单黄点不产生 spider mite；细网组合仍可直判。

References:
- `cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js`
- `cloudfunctions/diagnose-http/utils/diagnosis-parser.js`
- `cloudfunctions/diagnose-http/services/visual-mode-route-service.js`
- `test/unit/backend/diagnose-http/domain/diagnosis-mode-router.mjs`
- `.tmp/dispatch-task/entity-first-pest-routing-20260722-01-implementer-result.json`
- Postflight blocked error: `preexisting dirty overlap touches forbidden or non-allowed paths: cloudfunctions/diagnose-http/configs/index.js`
