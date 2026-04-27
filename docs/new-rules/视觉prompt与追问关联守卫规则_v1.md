# 视觉 prompt 与追问关联守卫规则 v1

## 1. 目的

本规则用于约束多图植物诊断中的两类高频偏差：

1. 视觉 prompt 未利用器官槽位与多图上下文，导致模型跨器官硬映射。
2. 追问阶段未优先承接已观察到的视觉形态，导致相似但未观察到的 symptom 抢占问题入口。

本规则属于 `visual evidence -> question_queue` 之间的正式守卫层。

## 2. 视觉 prompt 约束

### 2.1 多图场景必须按单图标准化执行

每次视觉标准化只允许分析当前图片，但必须带入当前图片在整组病例中的业务语义，包括：

- `inputSlotType`
- `inputSlotLabel`
- `userDeclaredOrganType`
- `inputSlotOrder`
- `totalImageCount`
- `caseSlotSummary`

不得把其他图片可能存在的器官特征投射到当前图。

### 2.2 symptom 候选池必须按 `location_key` 收窄

当槽位器官可判定时，prompt 只允许从 `symptoms` 表中满足以下条件的 symptom 候选池中取值：

- `data_status = 'audited'`
- `symptom_type in ('visual', 'hybrid')`
- `ai_visual_pool = yes`
- `location_key` 与当前器官槽位匹配

当前正式映射：

- `leaf -> location_key = leaf`
- `stem -> location_key = stem`
- `flower -> location_key = flower`
- `root / root_crown -> location_key = soil`

若槽位无法判定，可回退到完整 `ai_visual_pool = yes` 的视觉池。

### 2.3 池外异常必须留痕，不得硬映射

若模型看到了明显异常，但该异常不在当前 `location_key` 池内：

- 必须写入 `out_of_pool_symptom_candidates`
- 不得强行映射到其他器官的 `symptom_candidates`

池外候选仅用于留痕和后续知识层完善，不得直接进入正式证据链。

## 3. 追问关联守卫

### 3.1 已观察到的视觉形态优先于相似形态

当 `observed_evidence_set` 或正式 `observedSymptoms` 中已经存在某个视觉 symptom 时：

- 其对应确认题必须优先于相似 symptom 的题目进入 `question_queue`
- 不允许因为“overlap penalty”把直接观察到的目标 symptom 题压到后面

### 3.2 同部位同形态族的替代 symptom 题必须阻断

若系统已经选中了某个已观察 symptom 的确认题，则后续问题中不得再加入满足以下条件的替代 symptom 题：

- `location_key` 相同
- `pattern_key` 相同
- `distribution_key` 相同，或其中任一侧为空
- `target_symptom_key` 不同

该规则用于阻断“黑斑扩散 -> 褐斑带黄晕”这类同形态族抢题问题，也适用于其他部位的同类偏差。

### 3.3 高特异性 zero-follow-up symptom 不得进入 question_queue

对于已被正式定义为 `zero_follow_up` 的高特异性视觉证据：

- 不得再生成对应 symptom 的 question
- 应直接走快速收敛或正式输出

当前至少包含：

- `scale_shells`
- `aphids_visible`
- `powder_white`

说明：

- `fine_webbing` 属于高特异性快速收敛，但正式层级为 `single_confirmation`，不属于 `zero_follow_up` 阻断名单。

## 4. 真实场景解释原则

追问的合理性必须满足以下要求：

1. 与当前已观察到的图像事实一致。
2. 与用户正常人类理解一致，不得跨器官、跨形态强跳。
3. 与当前 top problem 的信息增益匹配，不能只因 problem 相关而忽略 symptom 事实。
4. 若存在直接观察到的正式视觉 symptom，优先问“你是否也确认看到这个现象”，而不是先问邻近但未观察到的症状。

## 5. 实现层要求

实现层至少需要具备以下守卫：

- prompt 层：器官槽位上下文 + `location_key` 池收窄
- parser / adapter 层：`out_of_pool_symptom_candidates` 留痕
- selector 层：direct observed target 优先、相似形态题降权或阻断
- diagnosis engine 层：已选 seed question 对同形态族 sibling question 的二次阻断

## 6. 审计要求

本规则的本地 deterministic 守卫至少应覆盖：

1. `leaf` 槽位只拿 `location_key = leaf` 的 prompt 池
2. 已观察 `black_spots_spreading` 时，优先选择其自身确认题
3. `fine_webbing` 不得再进入 question 选择
