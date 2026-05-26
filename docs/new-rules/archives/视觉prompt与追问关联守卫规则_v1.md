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
4. 若只是低置信、未准入的视觉候选，可先确认是否真实存在；若已经是高置信正式视觉事实，不得再问“是否看到这个现象”，只能追问会改变分流的隐藏属性或上下文。

## 5. 单题问诊与视觉事实分层规则

### 5.1 每轮只允许一个活跃问题

正式诊断流每个 round 只允许向用户展示一个活跃问诊问题：

- 后端 `question_queue.activeItemCount` 不得超过 1
- 前端不得把同一轮多个问题并列展示
- 用户回答当前问题后，再进入下一轮重新排序和重建候选问题

该规则用于避免同一方向的问题一次性锁死用户，尤其是 `holes_in_leaf`、`chewed_edges` 等视觉形态被连续追问成单一虫害路径。

### 5.2 视觉事实不得直接等同于病因

当视觉证据已经落到某个形态 symptom 时，追问只能补充能改变分流的非视觉或半视觉属性，不得把形态事实直接写成病因事实。

示例：

- `叶片穿孔` 只能说明存在组织缺损，不直接等同于虫害。
- `叶缘缺刻` 只能说明边缘组织缺损，不直接等同于被取食。
- 若需要判断虫害方向，应追问虫体、虫粪、黏液痕迹、新鲜啃咬边缘等更直接线索。

### 5.3 环境类问题必须转成用户可回答的自然选项

浇水、光照、施肥类问题不得使用抽象比较句或不成句的问题。问题必须给出明确时间窗口和自然语言选项：

- 浇水优先使用“最近 2 周”“1-2 天一次 / 3-9 天一次 / 10 天以上一次 / 不确定”等数字区间表达。
- 光照优先使用“最近 1-2 周”“每天直晒 0-1 小时 / 3 小时以上 / 基本没变 / 不确定”等数字区间表达。
- 施肥优先使用“最近 1 个月”“近 2 个月 0 次 / 近 1 个月 1 次薄肥 / 近 1 个月 2 次以上或重肥换盆 / 不确定”等数字区间表达。

这些回答后续可与 `genus_care_profiles` 的属级养护基线联动，但问句本身必须先保证用户可理解、可选择。

## 6. 实现层要求

实现层至少需要具备以下守卫：

- prompt 层：器官槽位上下文 + `location_key` 池收窄
- parser / adapter 层：`out_of_pool_symptom_candidates` 留痕；当模型返回旧长 schema 或截断 JSON，但 `symptom_candidates` / `out_of_pool_symptom_candidates` 数组已经完整出现时，必须尽量 salvage 已完整字段，不得直接把本轮视觉证据清空
- selector 层：direct observed target 优先、相似形态题降权或阻断
- diagnosis engine 层：已选 seed question 对同形态族 sibling question 的二次阻断
- response contract 层：`questions/followUps` 输出给前端前必须裁剪为 1 个活跃问题
- frontend 层：问诊展示采用单题卡片，答案选项纵向排列

## 6.1 视觉形态到追问分流的第一轮正式维度

结构缺损、刺吸式害虫弱线索、水肿样鼓包三类视觉事实必须先进入分流追问，不得直接闭合到病因：

- `structural_cause`：适用于 `holes_in_leaf`、`chewed_edges`、`skeletonized_leaves` 等结构缺损。首问区分虫害活动痕迹、病斑干枯脱落、机械/旧伤。
- `pest_trace_type`：适用于 `yellow_speckling`、`stippling`、`silver_streaks`、`fine_webbing`、`sticky_honeydew`、`leaf_curl`、`leaf_twist` 等刺吸式害虫或非虫害可混淆线索。首问区分细网/极小活动点、银白擦伤伴黑色排泄点、蜜露/黏腻/煤灰层、无虫害痕迹。
- `edema_bump_stage`：适用于 `edema`、`blister_like_bumps` 等鼓包/水泡样线索。首问区分透明水泡、褐色木栓化结痂、平面斑点。

这三类分流题的答案可以产生 `directProblemAdjustments`，但不能把单一视觉形态直接当作病因结论。

## 6.2 `pest_trace_type` 答案必须真实分流刺吸害虫方向

`yellow_speckling`、`stippling`、`silver_streaks` 这类点状失绿 / 银白擦伤弱线索，只能说明“刺吸式害虫或非虫害可混淆方向需要分流”，不能默认等同于红蜘蛛。

`pest_trace_type` 的答案必须按语义真实约束后续 problem：

- `mite_webbing` / `fine_webbing` / 细网或极小活动点：可以强化红蜘蛛方向；
- `thrips_silver_black` / 银白擦伤伴黑色排泄点：应强化蓟马方向，并抑制红蜘蛛方向；
- `sticky_honeydew` / 蜜露、黏腻、煤灰层：应强化蜜露型刺吸害虫方向，不得自动转成红蜘蛛；
- `no_pest_trace` / 无虫害痕迹：应抑制刺吸害虫具体结论；
- `unknown` / 不确定：只能保留不确定或继续追问，不得当作红蜘蛛正向证据。

### 正式规则

```text
弱视觉点状线索 + 非红蜘蛛分流答案，
不得被视觉 yellow_speckling / stippling 强行收敛为 spider_mites。
```

只有以下情况才允许红蜘蛛进入最终输出候选：

- 视觉正式证据中存在 `fine_webbing`、`mite_webbing` 等高特异网丝证据，并已进入 `observed_evidence_set`；
- 或问诊形成了非泛化、直接指向红蜘蛛的正向答案；
- 或高特异快速收敛规则明确命中红蜘蛛方向。

若问诊答案明确指向蓟马、蜜露型虫害、无虫害痕迹或不确定，红蜘蛛不得仅凭 `yellow_speckling`、`stippling`、叶背存在性、分布范围或进展速度成为 final outcome。

## 7. 审计要求

本规则的本地 deterministic 守卫至少应覆盖：

1. `leaf` 槽位只拿 `location_key = leaf` 的 prompt 池
2. 已观察 `black_spots_spreading` 时，优先选择其自身确认题
3. `fine_webbing` 不得再进入 question 选择
4. 任意诊断 round 返回给前端的活跃问题数量不得超过 1
5. `holes_in_leaf` 等结构缺损问题不得因为“有洞”直接把虫害作为唯一问诊方向
6. `yellow_speckling/stippling` 在 `pest_trace_type` 回答为蓟马银斑黑点、蜜露、无虫害痕迹或不确定时，不得强行收敛为红蜘蛛
