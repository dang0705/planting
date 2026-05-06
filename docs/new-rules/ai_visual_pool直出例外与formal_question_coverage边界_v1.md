# ai_visual_pool 直出例外与 formal question coverage 边界 v1

生成时间：2026-04-13

## 1. 目的

这份规则只定义一件事：

- `ai_visual_pool=yes` 的视觉症状，并不天然等于“必须进入正式 question bridge”
- 但如果不进入正式 question bridge，必须被显式声明为 `direct-output audited exception`

否则就会把“按设计允许直出”和“题库漏建”混成一类，审计边界会失真。

## 2. formal question coverage 的正式口径

`diagnose-http` 运行时的正式 question coverage 只认三张表：

1. `question_library_v5_real`
2. `question_option_mapping_v5_real`
3. `question_strategy_v5_real`

要求：

- `data_status = audited`
- `review_status = audited`
- 带权威来源支撑
- 带 `source_batch_id / version_tag / review_note`

`question_generation_engine` 不属于 formal question coverage。
它只能算：

- `audited_generation_asset`
- `source-backed audit registry`

不能冒充正式运行时题库覆盖。

## 3. direct-output audited exception 的适用条件

只有同时满足以下条件，`ai_visual_pool=yes` 的视觉症状才允许不建 formal question bridge：

1. 该症状在产品设计上本来就是“保守直出型”，而不是“问诊桥接型”
2. 它的视觉护栏已经足够严格，能明确排除主要竞争路径
3. 它的 stop_state / output eligibility 可以直接收敛，不依赖 question_queue
4. 它被单独记录在 compare 文档与 gap manifest 中，状态为 `exception_by_design`

## 4. 当前正式例外

截至 2026-04-13，当前唯一明确记录的 `direct-output audited exception` 是：

- `normal_leaf_aging_stable`

理由：

- 该信号被定义为保守直出型非问题结论入口
- 它已有严格视觉护栏：只在底部老叶稳定黄化、新叶和生长点正常、且无明显竞争性异常时才允许输出
- 它不应再被计入“必须补 question data”的普通缺口

## 5. 审计文档必须同步记录的字段

当存在 `direct-output audited exception` 时，比对文档至少要写清：

- `runtimeCoverageDefinition`
- `remainingMustCloseSymptoms`
- `exceptionByDesignSymptoms`
- `legacyPendingAuditedUpgradeSymptoms`
- `sourceVerificationSummary`
- `verificationQueriesOrReports`

否则外部审计无法区分：

- 真正的题库漏建
- 按设计允许直出的保守例外
