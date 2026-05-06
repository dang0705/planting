# AI 诊断系统总规范入口文档（重构规范 + 最小交互协议）

> 本文档是当前项目中植物诊断系统的**唯一总规范入口**。  
> 目的：让 Codex、开发者、Review 方都只看这一份，就能明确：
>
> - 诊断系统最终目标结构
> - 新旧数据 diff / backfill / adapter 规则
> - 目录 / 文件职责边界
> - 评分算法与问诊系统参与方式
> - 商业机密保护下的最小前后端交互协议
> - 前端与后端各自该做什么、不该做什么

---

# 第一部分：重构规范（系统结构、算法、目录映射）

# AI 诊断系统重构规范文档（面向 Codex 落地）

## 0. 文档目的

本规范文档用于约束当前项目中“植物诊断”能力的最终落地方式，目标是：

1. 把前端诊断入口**强制收敛为唯一入口**：`src/components/DiagnosePopup.vue`
2. 把当前旧诊断体系升级为**以新数据体系为准**的新诊断体系
3. 把“诊断流程、字段映射、评分算法、问诊系统、结果解释层”明确写成可执行规范
4. 明确**功能 => 目录 / 文件** 的映射，避免 Codex 把逻辑写散
5. 方便后续 review：凡不符合本规范的实现，视为偏航

---

## 1. 当前项目结构理解（与诊断直接相关）

### 1.1 前端主入口与显示层

- `src/components/DiagnosePopup.vue`
- `src/components/AIStreamDialog.vue`

结论：

- **诊断主入口强制定义为** `DiagnosePopup.vue`
- `AIStreamDialog.vue` 只负责流式状态展示，不承载诊断算法

### 1.2 页面层

- `src/pages/diagnose/diagnose.vue`

结论：

- 此页面**不得继续作为主诊断入口**
- 允许存在，但只能承担：
  - 历史记录详情页
  - 诊断结果承接页
  - 从 `DiagnosePopup` 跳转后的只读页
- 禁止在这里重新实现新的诊断主流程

### 1.3 前端 API 门面层

- `src/api/plants-http.js`

结论：

- 作为前端统一诊断 API 门面
- 前端组件不得直接拼装复杂诊断算法，只能通过此层访问后端

### 1.4 前端适配层

- `src/utils/diagnose-flow.js`

结论：

- 当前文件定位为**前端结果适配层**
- 只允许放：
  - 结果归一化
  - follow-up payload 构造
  - UI 展示辅助
- 禁止把完整评分引擎继续堆进这里

### 1.5 后端云函数层

- `cloudfunctions/identify-http/app.js`
- `cloudfunctions/diagnose-http/app.js`
- `cloudfunctions/diagnosis-history-http/app.js`

结论：

- `identify-http`：识别、视觉症状提取、首轮 AI 分析
- `diagnose-http`：**唯一诊断决策中心**
- `diagnosis-history-http`：历史记录读写

### 1.6 旧知识层

- `knowledges/diagnose-rules/index.js`
- `HOW_AI_RESULT_MAPPING_SQL.md`
- `knowledges/*.md`

结论：

- 旧规则体系仍存在
- 但新系统必须以**新数据体系**为准
- 旧体系只允许做兼容适配，不再作为最终规则真源

---

## 2. 最终架构总原则

### 2.1 唯一前端诊断入口

前端诊断入口**强制唯一**：

```text
src/components/DiagnosePopup.vue
```

禁止：

- 再在其他 page / component 中复制一套首轮诊断 + follow-up + 重算逻辑
- 再在 `pages/diagnose/diagnose.vue` 中独立维护另一套主流程

### 2.2 唯一后端诊断决策中心

后端唯一诊断中心：

```text
cloudfunctions/diagnose-http/
```

禁止：

- 在 `identify-http` 中做最终诊断排序
- 在前端 `diagnose-flow.js` 中重写评分引擎
- 在 `knowledges/diagnose-rules/index.js` 中继续堆最终诊断主逻辑

### 2.3 新体系为准

新体系指以下数据资产：

- `problems`
- `symptoms`
- `symptom_problem_evidence`
- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`
- `problem_causality`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`
- `diagnosis_result_explanations`

结论：

- **新体系是最终真源**
- 旧体系必须适配成能消费新体系，而不是反过来让新体系迁就旧规则

---

## 3. 新体系的运行时分层

---

## 3.1 症状模式层（新增正式层）

> 正式术语：`symptom_class`  
> 中文名：**症状模式**

### 3.1.1 为什么必须新增这一层

当前系统如果直接走：

```text
AI visual symptom
→ problem ranking
→ question strategy
```

会出现明显问题：

- visual symptom 和 follow-up 之间缺少稳定桥梁
- 问题容易发散到和当前视觉证据无关的方向
- 高置信 visual symptom 会被同义重复题反复确认
- 黄叶、叶斑、虫害这类复杂场景很难形成正确问诊模式

因此必须新增一层：

```text
AI visual symptom
→ symptom_class
→ class-gated candidate problems
→ class-gated question groups
→ fine-grained problem ranking
```

### 3.1.2 symptom_class 的职责

`symptom_class` 不等于 `symptom_type`。

#### `symptom_type`
表示证据来源属性，例如：
- visual
- diagnostic
- environmental

#### `symptom_class`
表示：

```text
当某个 symptom 出现后，
系统后续应该进入哪一种诊断模式 / 问诊模式
```

也就是：

- 它是 visual symptom 与 follow-up 之间的中间桥梁
- 它负责先收窄“问诊方向”
- 再由 problem ranking 和 question selector 做精排

### 3.1.3 建议的首批 symptom_class

至少应先支持以下模式：

- `yellowing_mode`
- `leaf_spot_mode`
- `mite_sucking_pest_mode`
- `root_rot_wet_wilt_mode`
- `chewing_damage_mode`

随后再逐步扩展：

- `powdery_growth_mode`
- `downy_growth_mode`
- `rust_mode`
- `gray_mold_mode`
- `virus_mosaic_mode`
- `light_stress_mode`
- `temperature_stress_mode`
- `humidity_stress_mode`

### 3.1.4 与 symptom 的关系

每个 symptom 至少应有一个主 `symptom_class`，必要时允许有次级映射。

推荐新增结构之一：

#### 方案 A：新增表（推荐）
- `symptom_classes`
- `symptom_class_mapping`

#### 方案 B：先在 `symptoms` 中补字段（过渡方案）
- `primary_class_key`
- `secondary_class_key`

但最终推荐还是走独立映射表，避免后期扩展受限。

### 3.1.5 对 follow-up 的强约束

question selector 不允许只按 `problem_key` 选题，必须升级为：

```text
symptom_class + top_problem_key 双层选题
```

执行顺序：

1. visual symptom 先归到 `symptom_class`
2. 按 `symptom_class` 限制题组候选池
3. 再用 top problems 对组内题目精排

这样才能避免：
- 视觉偏虫害，却问根系题
- 视觉偏黄叶，却问无关虫害题
- 视觉偏叶斑，却没有先做病原性 vs 非病原性分流

### 3.1.6 与去重规则的关系

新增 `symptom_class` 后，follow-up 去重规则必须进一步加强：

- 高置信正式 visual symptom 不得进入同义重复确认题；只能追问区分题、排异题、上下文题等隐藏属性
- 低置信或未准入 visual candidate 可以先做存在确认，但确认题每轮也只能输出 1 个
- follow-up 必须优先问：
  - 区分题
  - 排异题
  - 上下文题
- 不允许因为当前 class 下缺少更高价值问题，就把高置信正式视觉事实重新拿出来问“是否看到”

也就是：

```text
区分题 > 排异题 > 上下文题 > 低置信候选存在确认题
```

该规则在各 class 内分别执行，而不是全局散问。

### 3.1.6.1 视觉事实到问诊的分流边界

当 visual symptom 已作为正式 evidence 进入运行时，follow-up 不得把首题用于否定该视觉事实。

必须执行：

- 已确认 `tissue_integrity` 的结构损伤，不再问“是否真的破洞/缺损”
- 已确认 `surface_residue` 或粉层事实，不再问“能否擦掉”
- 已确认斑点/斑块事实，不再问“是不是脏层”
- 首题应改问病因分流、排异线索或养护上下文

结构损伤类的首题必须保持中性：

```text
叶片孔洞 / 叶片边缘缺口 / 叶片网状缺损
→ 虫害活动痕迹 vs 病斑干枯脱落 vs 机械/旧伤 vs 不确定
```

不得写成：

```text
虫咬孔洞 / 被咬缺口 / 虫害造成的网状缺损
```

斑点类首题优先级：

```text
水渍感 / 黄晕 / 湿软干硬 / 进展速度 / 分布范围
```

粉层类首题优先级：

```text
扩散趋势 / 分布范围 / 通风湿度背景
```

黄叶类首题优先级：

```text
最明显线索 gate / 养护方向 gate / 虫害线索 gate / 病斑霉层线索 gate / 新老叶分流 / 发黄分布模式
```

黄叶类题型约束：

```text
不得用 yes/no 表达“新叶还是老叶”“偏湿还是偏干”“强光还是弱光”。
必须使用多选项分流，并保持 option_key 与用户看到的选项同义。
```

黄叶最小分流维度：

```text
yellowing_primary_clue_gate
yellowing_care_area_gate
yellowing_disease_trace_gate
pest_trace_type
yellowing_leaf_age_pattern
yellowing_distribution_pattern
watering_frequency_context
light_change_context
fertilization_growth_context
yellowing_progression_speed
```

### 3.1.7 黄叶类的特别规则

黄叶类必须单独走 `yellowing_mode`，不能把所有黄叶 symptom 当普通 symptom 处理。

黄叶类采用“一页一题”后，不再使用旧的“最多 2 轮”作为停止条件；轮次上限不得成为黄叶分流未完成时提前输出 outcome 的理由。

黄叶类必须先完成分流，再进入该方向的上下文问题：

- 所有 gate 类问题必须在题干开头说明提问目的；例如黄叶题需先说明“黄叶原因较复杂，先确认最明显线索，后面少问无关问题”。
- 问诊问题必须在表结构中持久标记 `question_role` 与 `effect_mode`，不得只靠运行时猜测类别。当前合法角色为 `gate / differential_probe / context_metric / symptom_confirmation / visual_fact_review`，合法影响方式为 `route_gate / score_adjustment / evidence_admission / context_feature / visual_fact_review`。
- `gate` 类问题必须硬前置；同一 symptom mode 内，普通 `context_metric` 或 `score_adjustment` 问题不得排在未完成的 `gate` 前面。
- 先问 `yellowing_primary_clue_gate`，让用户选择养护/环境变化、虫子活动线索、斑点烂斑霉层线索、只有黄叶或不确定；不得让用户直接判断真菌、细菌、虫害或缺素。
- 若进入养护方向，先问 `yellowing_care_area_gate`，其选项必须采用短标题 + 描述承载基线信息；再按答案追问 `watering_frequency_context / light_change_context / fertilization_growth_context / yellowing_progression_speed`。其中浇水相关描述必须结合 `genus_care_profiles.watering_strategy_json.freq` 与新鲜 `weather_cache.humidity` 对属级基线做轻量修正，给出具体天数范围。
- 若进入虫害方向，问 `pest_trace_type`，只使用“小虫、细网、黑点、发黏”等用户可观察线索。
- 若进入病害方向，问 `yellowing_disease_trace_gate`，只使用黄晕、水渍感、粉霉层等可观察线索，不要求用户区分真菌或细菌。
- 若只有黄叶或不确定，再回退到 `yellowing_leaf_age_pattern` 与 `yellowing_distribution_pattern`，确认新老叶、脉间/整片/斑驳/灼伤样等分流线索。
- 在黄叶分流 gate 未满足前，即使 ranking top1 分数和 gap 达标，也不得直接输出 `low_light / sunburn / overwatering / underwatering / iron_deficiency / nitrogen_deficiency / nutrient_deficiency / root_stress` 等具体 outcome。
- 已回答的黄叶分流等价维度必须全链路去重；例如 `watering_frequency_context` 已答后，不得再问旧静态 `watering_context`，`light_change_context` 已答后，不得再问旧静态 `light_exposure`。

### 3.1.8 收益驱动停止策略

取消硬性轮数上限后，诊断流必须采用收益驱动停止策略，而不是恢复旧的“最多 2 轮”限制。

一页一题模式下，每次回答后必须重算：

- 必答 gate 层
- output eligibility
- 下一题高价值收益
- stop_state

只有以下问题可以阻塞 final：

- 模式入口 gate
- 输出资格 gate
- top 与 runner-up 区分 gate
- 合法 uncertain gate
- 安全 / 动作边界 gate

结论门槛已满足后，下一题只有在能够补齐 context guard、改变 output eligibility、区分 top 与 runner-up，或触发合法 uncertain 时，才允许继续追问。

以下问题默认不得阻塞 final：

- `progression`
- `distribution_scope`
- `host_confirmation`
- `underside_presence`
- 无 `directProblemAdjustments` 的问题
- 只影响解释、严重程度、护理建议的问题

edema / overwatering 已有正式形态正证据且满足输出资格时，不得继续被光照、分布、叶背、宿主确认等低增益题拖住；除非问题能补齐过湿相关 context guard、改变输出资格、区分 runner-up，或触发合法 uncertain。

至少要优先区分：

- 新叶黄 / 老叶黄
- 脉间黄化 / 整片黄化
- 湿土萎蔫 / 干土萎蔫
- 是否伴随根系异常
- 是否伴随弱光 / 温度 / 施肥历史

否则 follow-up 必然发散。

### 3.1.9 对算法的影响

`symptom_class` 本身不直接替代 problem score，但它会影响：

- question selector 候选池
- candidate problem 空间收缩
- AI symptom 的解释路径
- follow-up 的优先级顺序

推荐加入一层 class gating：

```text
ClassGatedCandidateProblems
=
problems allowed by symptom_class
∩ evidence-hit problems
∩ prior-supported problems
```

从而让 follow-up 和 ranking 都更聚焦。

### 3.1.10 对目录/文件的落地要求

建议新增：

- `cloudfunctions/diagnose-http/domain/symptom-classifier.js`
- `cloudfunctions/diagnose-http/repositories/symptom-class-repository.js`

职责：

#### `symptom-classifier.js`
- 将 visual symptom 映射到 `symptom_class`
- 输出主模式与备选模式

#### `symptom-class-repository.js`
- 读取 `symptom_classes`
- 读取 `symptom_class_mapping`
- 向 question selector / diagnosis-engine 输出标准结构

### 3.1.11 最终硬约束

任何 visual symptom 都**不得直接跳过症状模式层**去驱动 follow-up。  
最终链路必须收敛为：

```text
AI visual symptom
→ symptom_class
→ class-gated questions
→ question answers
→ problem refinement
→ final diagnosis
```


### 3.1 信号字典层

表：

- `symptoms`

职责：

- 定义 symptom_key
- 定义 symptom_type
- 定义 signal_reliability
- 提供用户可读文本与观察提示

### 3.2 主证据边层

表：

- `symptom_problem_evidence`

职责：

- 定义 `symptom -> problem` 的证据边
- 提供 `association_strength`
- 提供 `edge_reliability`

### 3.3 属级先验层

表：

- `genus_problem_profiles`

职责：

- 定义 `genus -> problem` 的先验概率/兼容度
- 提供 `genus_compatibility`

### 3.4 宿主约束层

表：

- `problem_host_profiles`
- `plant_problem_profiles`

职责：

- 对 problem 做 genus / family / category 层的合理性修正
- `plant_problem_profiles` 是物化缓存，不是知识真源

### 3.5 问诊层

表：

- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`

职责：

- 根据首轮 top problems 动态选题
- 把答案转为 diagnostic symptoms / negative evidence
- 继续参与二轮评分

### 3.6 因果增强层

表：

- `problem_causality`

职责：

- 只做第二阶段增强和解释
- 不参与首轮主排序

### 3.7 结果解释层

表：

- `diagnosis_result_explanations`
- `problems` 中的用户层字段

职责：

- 输出用户最终看到的“为什么、怎么办、下一步看什么”

---

## 4. 最终诊断流程

### 4.1 首轮流程

```text
DiagnosePopup 上传图片
→ identify-http
→ AI 提取 visual symptoms
→ diagnose-http 首轮计算
→ 返回：
   - observedSymptoms
   - rankings
   - followUps
   - explanation
```

### 4.2 二轮流程（问诊）

```text
用户在 DiagnosePopup 中回答 follow-up
→ 前端构造 followUpAnswers payload
→ diagnose-http 二轮计算
→ 返回：
   - 更新后的 rankings
   - final explanation
   - causality chain
```

### 4.3 历史记录流程

```text
diagnose-http 成功后
→ diagnosis-history-http 持久化
→ pages/diagnose 或 plant-detail 只读展示
```

---

## 5. 最终评分算法

## 5.1 输入

### 视觉症状输入

```json
[
  { "symptomKey": "leaf_yellowing", "confidence": 0.88 },
  { "symptomKey": "fine_webbing", "confidence": 0.79 }
]
```

### 问诊输入

```json
[
  { "questionKey": "q_spider_webbing_visible", "optionKey": "yes" },
  { "questionKey": "q_root_rot_smell", "optionKey": "no" }
]
```

### 植物上下文输入

```json
{
  "plantId": "...",
  "genus": "...",
  "family": "...",
  "category": "..."
}
```

---

## 5.2 视觉证据分

对 problem `p`：

```text
EvidenceScore_visual(p)
=
Σ [
  VisualConfidence(s)
  × association_strength(s,p)
  × signal_reliability(s)
  × edge_reliability(s,p)
]
```

字段来源：

- `VisualConfidence`：identify 输出
- `association_strength`：`symptom_problem_evidence`
- `signal_reliability`：`symptoms`
- `edge_reliability`：`symptom_problem_evidence`

---

## 5.3 问诊证据分

对问题 `q` 的答案 `a`：

```text
QuestionContribution(q,a,p)
=
AnswerValue(q,a)
× MappingStrength(q,a)
× association_strength(mapped_symptom,p)
× signal_reliability(mapped_symptom)
× edge_reliability(mapped_symptom,p)
```

字段来源：

- `AnswerValue`：`question_option_mapping_v5_real.value`
- `MappingStrength`：`question_option_mapping_v5_real.association_strength`
- `mapped_symptom`：`question_option_mapping_v5_real.maps_to_symptom_key`

问诊总分：

```text
EvidenceScore_question(p)
=
Σ QuestionContribution(q,a,p)
```

---

## 5.4 总证据分

```text
TotalEvidenceScore(p)
=
EvidenceScore_visual(p)
+ 1.25 × EvidenceScore_question(p)
```

说明：

- 问诊证据通常比纯视觉更有诊断价值
- 默认放大系数 `1.25`
- 该系数应写成配置项，不要写死魔法数

---

## 5.5 属级先验修正

```text
GenusFactor(p)
=
0.6 + 0.4 × genus_compatibility(p)
```

```text
GenusAdjustedScore(p)
=
TotalEvidenceScore(p) × GenusFactor(p)
```

说明：

- 禁止再用 0/1 的 genus candidate 代替连续值
- `genus_compatibility` 必须来自新体系

---

## 5.6 宿主合理性修正

```text
HostFactor(p)
=
0.8 + 0.2 × host_compatibility(p)
```

```text
HostAdjustedScore(p)
=
GenusAdjustedScore(p) × HostFactor(p)
```

优先来源：

1. `plant_problem_profiles`
2. `problem_host_profiles(genus)`
3. `problem_host_profiles(family)`
4. `problem_host_profiles(category/plant_type)`
5. 无命中则 `HostFactor = 1`

---

## 5.7 负证据扣分

对于明确回答 `no` 的强特征：

```text
PenaltyScore(p)
=
Σ [
  abs(negative_value)
  × MappingStrength
  × association_strength
  × signal_reliability
  × edge_reliability
]
```

注意：

- `unknown` 不加分也不减分
- `no` 必须参与扣分，不能只用来跳题

---

## 5.8 因果增强

只允许对首轮 topK 问题做二阶段增强：

```text
CausalityBoost(p)
=
Σ [ parent_score × relation_strength × relation_type_factor ]
```

推荐：

- `causes` -> 0.25
- `predisposes` -> 0.18
- `leads_to` -> 0.12
- `co_occurs` -> 0.08

说明：

- `problem_causality` 不允许首轮直接进主排序
- 它只做增强和解释

---

## 5.9 最终总分

```text
FinalScore(p)
=
HostAdjustedScore(p)
- PenaltyScore(p)
+ CausalityBoost(p)
```

---

## 5.10 最终排序规则

### 能竞争最终 top1 的 problem_role

允许：

- `root_cause`
- `secondary_issue`（若未来新增）

### 不能直接作为 top1 的 problem_role

不允许：

- `result_state`
- `aggregate_cluster`
- `predisposing_factor`

它们可以出现在：

- `contributing_factors`
- `intermediate_states`
- `explanation_chain`

但不能直接作为用户最终主结论。

---

## 6. 功能 => 目录 / 文件 映射（硬约束）

### 6.1 前端入口与 UI

#### `src/components/DiagnosePopup.vue`
负责：

- 上传图片
- 触发首轮诊断
- 展示首轮结果
- 展示 follow-up 问题
- 提交 follow-up
- 展示更新后的结果

禁止：

- 写评分算法
- 直接拼接复杂规则
- 直接读取 Excel/SQL 规则数据

#### `src/components/AIStreamDialog.vue`
负责：

- 流式文本展示
- 进度/状态 UI
- 错误提示

禁止：

- 承载诊断业务逻辑

#### `src/pages/diagnose/diagnose.vue`
负责：

- 结果页承接
- 历史记录回看
- 只读详情展示

禁止：

- 成为新的主诊断入口
- 再实现一套 follow-up 主流程

---

### 6.2 前端 API 门面层

#### `src/api/plants-http.js`
负责：

- `identifyPlantByImage`
- `computeDiagnosisDecision`
- `fetchDiagnosisHistory`
- `fetchDiagnosisDetail`

要求：

- 所有诊断调用统一经过这里
- 只做网络门面，不做评分逻辑

---

### 6.3 前端适配层

#### `src/utils/diagnose-flow.js`
负责：

- 结果 normalize
- follow-up payload 构造
- 结果显示辅助
- 因果链展示格式化

禁止：

- 实现真正评分引擎
- 实现新旧规则兼容逻辑主流程

---

### 6.4 后端诊断中心

#### `cloudfunctions/identify-http/app.js`
负责：

- 图片识别
- AI 视觉 symptom 提取
- 首轮 observedSymptoms 构建
- 返回给 diagnose-http 使用的结构化症状

禁止：

- 做最终排序
- 直接输出最终 diagnosis 排名作为唯一真相

#### `cloudfunctions/diagnose-http/app.js`
负责：

- 读取新体系数据
- 计算首轮分数
- 生成 follow-ups
- 计算二轮分数
- 融合 genus/host/question/causality
- 过滤 problem_role
- 生成 explanation payload

这是**唯一诊断决策中心**。

#### `cloudfunctions/diagnosis-history-http/app.js`
负责：

- 持久化诊断结果
- 查询历史记录
- 查询单次诊断详情

禁止：

- 重算诊断
- 在这里引入评分逻辑

---

### 6.5 新诊断规则/数据访问层（建议新增）

建议新增目录：

```text
cloudfunctions/diagnose-http/domain/
cloudfunctions/diagnose-http/repositories/
cloudfunctions/diagnose-http/services/
cloudfunctions/diagnose-http/mappers/
cloudfunctions/diagnose-http/constants/
```

推荐映射如下：

#### `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
负责：

- 评分主引擎
- 首轮/二轮总流程 orchestrator

#### `cloudfunctions/diagnose-http/domain/evidence-scoring.js`
负责：

- visual evidence score
- question evidence score
- penalty score

#### `cloudfunctions/diagnose-http/domain/prior-scorers.js`
负责：

- genus factor
- host factor

#### `cloudfunctions/diagnose-http/domain/causality-scorer.js`
负责：

- causality boost

#### `cloudfunctions/diagnose-http/domain/question-selector.js`
负责：

- 根据 top problems 选 follow-up
- unknown 分组切换逻辑
- observability / priority 融合

#### `cloudfunctions/diagnose-http/domain/result-formatter.js`
负责：

- 最终输出结构组装
- result explanation 映射
- role-based filtering

---

### 6.6 数据访问层

#### `cloudfunctions/diagnose-http/repositories/problem-repository.js`
读取：

- `problems`
- `diagnosis_result_explanations`

#### `cloudfunctions/diagnose-http/repositories/symptom-repository.js`
读取：

- `symptoms`
- `symptom_problem_evidence`

#### `cloudfunctions/diagnose-http/repositories/prior-repository.js`
读取：

- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`

#### `cloudfunctions/diagnose-http/repositories/question-repository.js`
读取：

- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`

#### `cloudfunctions/diagnose-http/repositories/causality-repository.js`
读取：

- `problem_causality`

---

### 6.7 旧体系适配层（必须保留但不能喧宾夺主）

建议新增：

```text
cloudfunctions/diagnose-http/mappers/legacy-rule-adapter.js
```

职责：

- 把旧规则体系映射到新体系需要的中间格式
- 只做兼容，不做主判断

禁止：

- 继续把旧规则作为最终真源
- 让旧规则直接决定最终诊断分数

---

## 7. 字段映射规范

### 7.1 identify-http 输出到 diagnose-http 输入

必须输出统一结构：

```json
{
  "plantId": "...",
  "description": "...",
  "observedSymptoms": [
    {
      "symptomKey": "leaf_yellowing",
      "symptomCn": "叶子明显发黄",
      "confidence": 0.88,
      "source": "visual_ai"
    }
  ]
}
```

### 7.2 follow-up 提交结构

```json
{
  "diagnosisId": "...",
  "plantId": "...",
  "observedSymptoms": [...],
  "followUpAnswers": [
    {
      "questionKey": "q_spider_webbing_visible",
      "optionKey": "yes"
    }
  ]
}
```

### 7.3 diagnose-http 响应结构

必须至少包含：

```json
{
  "observedSymptoms": [],
  "rankings": [],
  "topProblem": {},
  "contributingFactors": [],
  "resultStates": [],
  "followUpRequired": true,
  "followUps": [],
  "problemCausality": [],
  "resultExplanation": {}
}
```

---

## 8. 旧体系适配原则

### 8.1 旧体系允许存在，但必须被新体系消费

旧体系包括：

- `knowledges/diagnose-rules/index.js`
- 旧 prompt / 旧 mapping / 旧 symptom key 体系

允许：

- 继续存在
- 继续被读取
- 被 adapter 翻译成新体系可识别的结构

不允许：

- 旧体系直接主导最终诊断
- 新旧两套评分系统并行输出
- 新体系为了兼容旧体系而退化

### 8.2 新旧 key 兼容要求

若旧 key 与新 key 不一致，必须在 adapter 中统一：

- symptom key alias
- problem key alias
- question key alias（如需要）

禁止在业务代码中散落 `if oldKey then newKey`

---

## 9. 结果解释层规范

最终面向用户展示时，优先使用：

- `problems.display_name_cn`
- `problems.user_definition_cn`
- `problems.user_action_cn`
- `problems.user_prevention_cn`
- `diagnosis_result_explanations.*`

### 9.1 结果展示必须分层

#### 主结论
- 只能来自 `root_cause`

#### 促发因素
- 来自 `predisposing_factor`

#### 中间状态 / 表现
- 来自 `result_state`
- 来自 `aggregate_cluster`

#### 用户建议
- 使用 `first_aid_cn`
- 使用 `avoid_cn`
- 使用 `what_to_check_next_cn`

---

## 10. Codex 落地边界

### 10.1 允许 Codex 改动的区域

- `src/components/DiagnosePopup.vue`
- `src/api/plants-http.js`
- `src/utils/diagnose-flow.js`（仅适配层）
- `cloudfunctions/diagnose-http/**`
- `cloudfunctions/identify-http/**`
- `cloudfunctions/diagnosis-history-http/**`
- 新增 `domain/` `repositories/` `mappers/` `services/`

### 10.2 不允许 Codex 直接改写为主引擎的区域

- `src/pages/diagnose/diagnose.vue`
- `knowledges/diagnose-rules/index.js`
- 任意新的零散 util 文件里再堆一套评分逻辑

### 10.3 Codex 必须遵守的实现顺序

1. 确立 `DiagnosePopup` 为唯一前端入口
2. 在 `diagnose-http` 中建立新引擎骨架
3. 新建 repository 层对接新数据体系
4. 把旧规则通过 adapter 接入
5. 完成首轮评分
6. 完成 follow-up 选题与二轮评分
7. 完成 result explanation 输出
8. 再回到前端只做 UI/适配收口

---

## 11. Review 检查清单

Review 时必须逐条检查：

### 11.1 入口
- [ ] 是否只保留 `DiagnosePopup.vue` 作为前端主诊断入口
- [ ] `pages/diagnose` 是否只做只读/承接，不再承载主流程

### 11.2 引擎位置
- [ ] 最终评分逻辑是否只在 `cloudfunctions/diagnose-http` 内
- [ ] 前端是否没有偷偷重写评分算法

### 11.3 数据真源
- [ ] 是否以新体系表为准
- [ ] 旧规则是否只通过 adapter 被消费

### 11.4 算法
- [ ] 是否用了 visual + question 双证据
- [ ] 是否用了 genus factor
- [ ] 是否用了 host factor
- [ ] `no` 是否进入 penalty
- [ ] causality 是否只做二阶段增强
- [ ] `problem_role` 是否参与最终排序过滤

### 11.5 输出
- [ ] 用户结果页是否走 user-friendly 字段
- [ ] 解释层是否没有直接把 `aggregate_cluster` / `result_state` 作为 top1

---

## 12. 给 Codex 的执行提示（可直接引用）

```text
你现在要在当前 UniApp + CloudBase 项目中重构植物诊断系统。
强制要求：
1. 前端诊断入口只能是 src/components/DiagnosePopup.vue
2. 最终诊断决策中心只能在 cloudfunctions/diagnose-http
3. 新数据体系是唯一真源：
   - problems
   - symptoms
   - symptom_problem_evidence
   - genus_problem_profiles
   - problem_host_profiles
   - plant_problem_profiles
   - problem_causality
   - question_library_v5_real
   - question_option_mapping_v5_real
   - question_strategy_v5_real
   - question_generation_engine
   - diagnosis_result_explanations
4. 旧 knowledges/diagnose-rules/index.js 只能通过 adapter 兼容，不再作为主规则真源
5. 禁止把完整评分算法写回前端 utils 或 page
6. 按本规范文档的目录/文件映射创建 domain/repositories/mappers/services

最终评分公式：
FinalScore(p)
=
HostAdjustedScore(p)
- PenaltyScore(p)
+ CausalityBoost(p)

其中：
TotalEvidenceScore(p)
=
EvidenceScore_visual(p)
+ 1.25 × EvidenceScore_question(p)

请优先完成：
- repository 层
- diagnosis-engine 骨架
- question-selector
- result-formatter
- DiagnosePopup 接口对接
```

---

## 13. 最终落地目标

重构完成后，系统应达到：

```text
DiagnosePopup
→ identify-http（视觉 symptom）
→ diagnose-http（首轮评分）
→ question system（动态问诊）
→ diagnose-http（二轮评分）
→ result explanation（用户可读）
→ diagnosis-history-http（持久化）
```

并且：

- 新体系为准
- 旧体系兼容
- 入口唯一
- 评分中心唯一
- 结果解释统一


---

## 14. 新旧数据 diff 补齐与逻辑适配规范（新增硬性要求）

这一节为强制要求。  
如果 Codex 只完成“代码接新接口”，但**没有处理旧数据到新数据体系的 diff 补齐与兼容适配**，视为任务未完成。

### 14.1 总原则

新体系是唯一目标结构，旧体系不是长期真源。  
迁移策略必须遵守：

```text
旧数据/旧规则
→ 做 diff
→ 补齐到新体系目标表结构
→ 通过 adapter 兼容旧逻辑
→ 最终运行时只消费新体系
```

禁止：

- 继续让旧规则与新规则双轨并行长期共存
- 因为旧数据不齐，就反向删减新体系字段
- 在业务代码中零散写大量 `if old then new`
- 用“前端兜底”替代后端数据补齐

---

### 14.2 哪些对象必须做 diff

必须做 diff 的对象至少包括：

1. `problems`
2. `symptoms`
3. `symptom_problem_evidence`
4. `genus_problem_profiles`
5. `problem_host_profiles`
6. `plant_problem_profiles`
7. `problem_causality`
8. `question_library_v5_real`
9. `question_option_mapping_v5_real`
10. `question_strategy_v5_real`
11. `question_generation_engine`
12. `diagnosis_result_explanations`

同时要对旧体系中的以下来源做映射：

- 旧 `knowledges/diagnose-rules/index.js`
- 旧 AI 返回字段
- 旧 symptom key / problem key
- 旧 follow-up 题目结构
- 旧结果解释格式

---

### 14.3 diff 的四种类型

每次迁移时，都必须把 diff 明确分成四类：

#### A. 缺失项（missing in old, present in new）
旧数据没有，新体系需要。

处理要求：

- **优先补齐**
- 如果能从旧数据推导，先推导
- 如果不能推导，按新体系定义生成空壳占位，但必须标记 `partial`
- 禁止因为旧数据里没有，就直接从新体系删掉

#### B. 多余项（present in old, not needed in new）
旧数据里有，但新体系不再需要或需要降级。

处理要求：

- 不要直接删库
- 先进入 `legacy adapter` 或归档层
- 确认不再被运行时消费后再决定是否物理删除

#### C. 字段不一致（shape mismatch）
例如：

- 旧字段名不同
- 旧值类型不同
- 旧枚举值不同
- 旧 key 命名不同

处理要求：

- 统一在 mapper / adapter 层消化
- 禁止在业务层散写映射分支

#### D. 语义不一致（semantic mismatch）
例如：

- 旧 `problem_key` 在旧体系里是根因，在新体系里应归类为 `aggregate_cluster`
- 旧 symptom 是泛化词，新体系要求拆成多个精准 symptom
- 旧 follow-up 题只有 yes/no，新体系要求 yes/no/unknown

处理要求：

- 必须做显式迁移规则
- 不能只做字段改名了事

---

### 14.4 数据迁移的最终目标

迁移完成后，运行时必须满足：

```text
所有诊断相关运行逻辑
只读取新体系标准结构
```

也就是：

- repository 层只读新表/新结构
- 旧表/旧规则只能通过 adapter 先转成新结构
- 评分引擎不认识旧字段名
- question selector 不认识旧 question shape
- result formatter 不认识旧 explanation shape

---

### 14.5 必须新增的迁移模块

建议强制新增以下文件：

#### `cloudfunctions/diagnose-http/mappers/legacy-rule-adapter.js`
职责：

- 旧规则到新规则中间格式映射
- 旧 symptom key / problem key alias 映射
- 旧 follow-up 结构到新 question system 的映射

#### `cloudfunctions/diagnose-http/mappers/data-diff-builder.js`
职责：

- 对比旧数据与新体系目标结构
- 输出 missing / extra / shape mismatch / semantic mismatch 报告

#### `cloudfunctions/diagnose-http/mappers/data-backfill-builder.js`
职责：

- 根据 diff 结果生成补齐数据
- 给无法完全审计的项打 `partial`
- 生成标准化 insert / upsert payload

#### `cloudfunctions/diagnose-http/constants/key-alias-map.js`
职责：

- 统一维护 old_key -> new_key 映射
- 禁止把 alias 映射散落在业务代码

---

### 14.6 diff 补齐的优先顺序

Codex 必须按这个顺序补：

#### 第一优先级：主键空间闭环
先确保：

- 所有 `problem_key` 都能落到 `problems`
- 所有 `symptom_key` 都能落到 `symptoms`

否则后面算法一定断层。

#### 第二优先级：证据边闭环
确保：

- `symptom_problem_evidence` 覆盖所有运行时会被引用的 symptom / problem
- question 映射出来的 symptom 都能进入证据层

#### 第三优先级：先验层补齐
确保：

- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`

与主问题空间保持一致，且明确哪些只是 partial/物化缓存。

#### 第四优先级：问诊层补齐
确保：

- 旧 follow-up 题可以映射到新 `question_*` 体系
- 所有 boolean 题都支持 `unknown`
- 旧 yes/no 逻辑能适配新 `yes/no/unknown`

#### 第五优先级：解释层补齐
确保：

- 旧结果解释字段可以被映射到 `diagnosis_result_explanations` 和 `problems` 用户层字段

---

### 14.7 unknown 选项的迁移适配要求

如果旧问诊体系只有 yes/no，没有 unknown，必须做以下适配：

1. 新体系题目默认都支持 `unknown`
2. 旧题映射到新题后，必须自动生成：
   - `yes`
   - `no`
   - `unknown`
3. `unknown` 的默认规则：
   - `value = 0`
   - 不加分
   - 不减分
4. 同组连续 `unknown >= 2` 时，question selector 必须切组
5. 旧代码里如果把 unanswered 当 `false`，必须改掉，禁止把 unanswered 视为 `no`

---

### 14.8 数据库补齐策略（强制约束）

文档必须约束 Codex：

#### 如果数据库里旧数据不齐
处理方式不是“删逻辑”，而是：

```text
以新体系为目标
→ 生成 diff
→ 生成 backfill 数据
→ upsert 到数据库
→ 再切换运行时逻辑
```

禁止：

- 因为表里暂时没有某列/某记录，就先把算法降级
- 因为旧数据里没有 `problem_role` / `user_definition_cn` 等，就在运行时随便拼接代替
- 因为旧 question 数据不完整，就绕过问诊系统

---

### 14.9 逻辑适配策略（强制约束）

逻辑适配必须分成三层：

#### A. key 适配
- old symptom key -> new symptom key
- old problem key -> new problem key
- old question key -> new question key

#### B. shape 适配
- 旧 identify 返回字段 -> 新 `observedSymptoms[]`
- 旧 follow-up 返回字段 -> 新 `followUps[]`
- 旧历史记录结构 -> 新结果详情结构

#### C. semantic 适配
- 旧泛化 symptom -> 新精准 symptom
- 旧泛化 problem -> 新 `problem_role`
- 旧 explanation -> 新用户层解释字段

适配必须集中在：

```text
mappers/
adapters/
repositories/
```

禁止进入：

- `DiagnosePopup.vue`
- `pages/diagnose/diagnose.vue`
- 各种零散 util

---

### 14.10 repository 层必须只消费新结构

即使底层数据库暂时还混有旧数据，repository 层对上也必须返回：

- 新体系 symptom 结构
- 新体系 problem 结构
- 新体系 question 结构
- 新体系 explanation 结构

也就是：

```text
旧数据库结构
→ repository / mapper 内部消化
→ 对诊断引擎统一输出新结构
```

评分引擎和 question selector 不允许理解旧结构。

---

### 14.11 backfill 审计要求

对于所有通过 diff 自动补齐的项，必须保留：

- `data_status`
- `audit_note`
- `data_source`

规则：

- 能明确权威来源的，标 `audited`
- 只能根据旧逻辑推导但还没做逐项权威核验的，标 `partial`
- 禁止自动补齐后统一伪装成 `audited`

---

### 14.12 Codex 执行要求（新增）

Codex 在重构时必须先产出以下中间结果，再进入主实现：

1. `data-diff report`
2. `key alias map`
3. `backfill plan`
4. `repository 输出结构定义`

没有这四项，不允许直接开始重写诊断引擎。

---

### 14.13 Review 检查项（新增）

Review 时新增检查：

- [ ] 是否先做了 diff，再做逻辑迁移
- [ ] 是否根据 diff 补齐了数据库/运行时所需数据
- [ ] 是否存在旧数据字段直接泄漏到新引擎
- [ ] 是否把旧逻辑兼容散落到了组件或 util
- [ ] 是否所有 old key -> new key 映射都集中维护
- [ ] 是否 question 的 unknown 迁移规则已落地
- [ ] repository 是否只向上暴露新结构
- [ ] backfill 的 `partial/audited` 是否真实区分



---

# 第二部分：最小交互协议（前后端边界、接口结构、最小暴露）

# AI 诊断系统最小交互接口协议（前后端）

## 0. 目标

本协议用于约束当前植物诊断系统的前后端交互边界，原则是：

1. **前端只拿当前交互所必需的最小信息**
2. **完整规则、完整权重、完整因果图、完整问诊策略只保留在后端**
3. **前端诊断唯一入口为 `src/components/DiagnosePopup.vue`**
4. **后端诊断唯一决策中心为 `cloudfunctions/diagnose-http`**
5. **新数据体系是唯一真源**
6. **旧体系只允许通过 adapter 兼容，不允许直接主导运行时输出**

---

## 1. 总体原则

### 1.1 最小暴露原则

前端允许拿到的内容仅限：

- 当前会话状态
- 当前轮要显示的题目
- 当前轮要显示的选项
- 当前结果页必须展示的摘要文案
- 用户提交所需的会话 id / 题目 id / 选项 id
- 历史记录页所必需的结果摘要

前端**不允许拿到**：

- 完整 `symptom_problem_evidence`
- 完整 `genus_problem_profiles`
- 完整 `problem_host_profiles`
- 完整 `plant_problem_profiles`
- 完整 `problem_causality`
- 完整 `question_strategy`
- 各候选 problem 的原始分数细节
- 每个 symptom / question 的权重明细
- 规则图谱和推理过程的内部结构

---

### 1.2 双模型原则

后端必须维护两套模型：

#### A. 内部模型（Internal Model）
只在后端使用，包含：

- 真正的 `problem_key`
- 真正的 `symptom_key`
- 权重
- 证据边
- 因果关系
- question strategy
- role filter
- score breakdown

#### B. 外部模型（Public Response Model）
只返回给前端，包含：

- `diagnosisSessionId`
- `questionId`
- `optionId`
- `resultId`
- `problemId`
- 用户可读文案
- 简化后的状态字段

---

### 1.3 外部 id 原则

外部接口优先暴露这些 id，而不是内部明文 key：

- `diagnosisSessionId`
- `resultId`
- `problemId`
- `questionId`
- `optionId`
- `factorId`
- `roundId`

禁止把以下内部 key 直接下发到前端作为正式协议字段：

- `problem_key`
- `symptom_key`
- `question_key`
- `association_strength`
- `relation_strength`
- `priority_score`

说明：

- 如果前端必须显示某个结果名称，应返回 `displayName`
- 如果前端必须显示某个题目，应返回 `text`
- 不要让前端用内部 key 反向推断规则体系

---

## 2. 会话模型

诊断过程必须是**会话制**，而不是一次性无状态提交。

### 2.1 诊断会话对象

```json
{
  "diagnosisSessionId": "diag_s_001",
  "plantId": "plant_xxx",
  "stage": "preliminary",
  "round": 1,
  "status": "active"
}
```

### 2.2 stage 枚举

- `preliminary`：刚完成首轮识别，可能需要追问
- `followup`：正在进行问诊
- `final`：已经形成最终诊断结果
- `closed`：本次诊断结束
- `failed`：诊断失败

### 2.3 status 枚举

- `active`
- `expired`
- `closed`
- `error`

---

## 3. 前后端接口清单

最小接口建议统一为 5 类：

1. `POST /diagnosis/start`
2. `POST /diagnosis/answer`
3. `GET /diagnosis/result`
4. `GET /diagnosis/history`
5. `POST /diagnosis/feedback`

---

## 4. 接口 1：发起诊断

## 4.1 Request

```json
{
  "plantId": "plant_xxx",
  "imageIds": ["img_001", "img_002"],
  "clientContext": {
    "source": "DiagnosePopup",
    "platform": "wechat-mini-program"
  }
}
```

### 字段说明

- `plantId`：植物实例 id
- `imageIds`：前端已上传到存储的图片资源 id
- `clientContext`：仅用于日志和兼容，不参与诊断核心算法

### 前端禁止传入

- `problem_key`
- `symptom_key`
- `question_group_key`
- 各类权重参数
- 任何算法配置

---

## 4.2 Response（需要继续问诊）

```json
{
  "diagnosisSessionId": "diag_s_001",
  "roundId": "round_1",
  "stage": "followup",
  "summaryCard": {
    "resultId": "res_prelim_001",
    "title": "更像是根部或浇水相关问题",
    "subtitle": "还需要再确认 2 个关键信息",
    "severity": "medium"
  },
  "questions": [
    {
      "questionId": "q_101",
      "type": "single_choice",
      "text": "土还是湿的，但叶子已经发蔫了吗？",
      "helpText": "刚浇过水或盆土摸上去还是潮的，再看叶子是不是已经耷拉下来了。",
      "options": [
        { "optionId": "opt_yes", "text": "是，比较确定" },
        { "optionId": "opt_no", "text": "否，基本没有" },
        { "optionId": "opt_unknown", "text": "看不出/不确定" }
      ]
    }
  ],
  "uiHints": {
    "canUploadMoreImages": true,
    "maxQuestionsThisRound": 1,
    "questionDisplayMode": "single",
    "answerSubmitMode": "per_question",
    "optionLayout": "vertical",
    "transition": "swiper"
  }
}
```

---

## 4.3 Response（直接给最终结果）

```json
{
  "diagnosisSessionId": "diag_s_002",
  "roundId": "round_1",
  "stage": "final",
  "finalResult": {
    "resultId": "res_final_002",
    "problemId": "p_001",
    "displayName": "红蜘蛛",
    "summary": "当前更像是红蜘蛛造成的叶面失绿和状态变差。",
    "severity": "medium",
    "urgency": "medium"
  },
  "contributingFactors": [],
  "nextSteps": [
    { "stepId": "step_1", "text": "先隔离，再重点检查叶背和新叶。" }
  ]
}
```

---

## 4.4 后端内部处理（不对前端暴露）

`start` 阶段后端内部必须完成：

1. 调用 `identify-http` 获取 `observedSymptoms`
2. 把 visual symptoms 转成标准 symptom 结构
3. 跑首轮 `EvidenceScore_visual`
4. 融合 genus / host 修正
5. 计算初步 top problems
6. 决定是否需要 follow-up
7. 如果需要 follow-up，则由后端 question selector 选题
8. 把内部 `question_key` / `option_key` 映射成外部 `questionId` / `optionId`

前端**看不到**这些内部步骤。

---

## 5. 接口 2：提交问诊答案

## 5.1 Request

```json
{
  "diagnosisSessionId": "diag_s_001",
  "roundId": "round_1",
  "answers": [
    {
      "questionId": "q_101",
      "optionId": "opt_yes"
    },
    {
      "questionId": "q_205",
      "optionId": "opt_unknown"
    }
  ]
}
```

### 规则

- 前端只传 `questionId` / `optionId`
- 前端不允许传：
  - `symptom_key`
  - `value`
  - `association_strength`
  - `question_group_key`

这些映射都由后端完成。

---

## 5.2 unknown 选项协议

`unknown` 是正式选项，不是缺省态。  
外部协议中必须存在：

```json
{
  "optionId": "opt_unknown",
  "text": "看不出/不确定"
}
```

### 后端语义

- `unknown -> value = 0`
- 不加分
- 不减分
- 记录入会话状态

### 连续 unknown 规则

后端必须记录：

- `unknownCountInGroup`
- `askedQuestionIds`
- `currentQuestionGroupId`

如果同一组连续 `unknown >= 2`：

- 当前组优先级下降
- question selector 自动切到下一组高价值问题

前端不需要知道切组逻辑。

---

## 5.3 Response（继续问下一轮）

```json
{
  "diagnosisSessionId": "diag_s_001",
  "roundId": "round_2",
  "stage": "followup",
  "summaryCard": {
    "resultId": "res_prelim_002",
    "title": "方向已经更接近根部问题",
    "subtitle": "还差 1 个关键信息",
    "severity": "medium"
  },
  "questions": [
    {
      "questionId": "q_301",
      "type": "single_choice",
      "text": "把植物脱盆时，根有没有发黑发软或有烂味？",
      "helpText": "如果还没脱盆，也可以先闻盆土有没有明显闷臭味。",
      "options": [
        { "optionId": "opt_yes", "text": "是，比较确定" },
        { "optionId": "opt_no", "text": "否，基本没有" },
        { "optionId": "opt_unknown", "text": "还没法判断" }
      ]
    }
  ]
}
```

---

## 5.4 Response（形成最终结果）

```json
{
  "diagnosisSessionId": "diag_s_001",
  "roundId": "round_2",
  "stage": "final",
  "finalResult": {
    "resultId": "res_final_001",
    "problemId": "p_root_rot",
    "displayName": "根腐",
    "summary": "更像是根长期过湿后已经开始出问题。",
    "severity": "high",
    "urgency": "high"
  },
  "contributingFactors": [
    {
      "factorId": "f_ow",
      "label": "浇水过多"
    },
    {
      "factorId": "f_pd",
      "label": "排水不好"
    }
  ],
  "intermediateStates": [
    {
      "stateId": "s_root_stress",
      "label": "根系状态已经变差"
    }
  ],
  "nextSteps": [
    {
      "stepId": "step_1",
      "text": "先停浇水，检查盆土和根的状态。"
    },
    {
      "stepId": "step_2",
      "text": "如果根已经发黑发软，剪掉烂根后换透气新土。"
    }
  ],
  "whatToAvoid": [
    "不要因为叶子蔫就立刻再浇一次大水",
    "先不要继续补肥"
  ],
  "needHumanReview": false
}
```

---

## 6. 接口 3：获取最终结果详情

## 6.1 Request

```http
GET /diagnosis/result?id=res_final_001
```

或：

```http
GET /diagnosis/result?sessionId=diag_s_001
```

---

## 6.2 Response

```json
{
  "resultId": "res_final_001",
  "diagnosisSessionId": "diag_s_001",
  "plantId": "plant_xxx",
  "finalResult": {
    "problemId": "p_root_rot",
    "displayName": "根腐",
    "summary": "更像是根长期过湿后已经开始出问题。",
    "severity": "high",
    "urgency": "high"
  },
  "explanation": {
    "whyItHappens": "这次更像根部长期处在太湿、缺氧的状态，根已经开始发黑发软，所以会出现湿土也发蔫、黄叶和长势变差。",
    "whatToCheckNext": "脱盆时重点看根是不是发黑发软，有没有烂味；同时看盆土是不是很久都不干。",
    "firstAid": "先停浇水，把烂根剪掉，再换成更透气的新土。",
    "avoid": "不要继续重浇水，也不要在根没缓过来前猛补肥。"
  },
  "contributingFactors": [
    { "factorId": "f_ow", "label": "浇水过多" },
    { "factorId": "f_pd", "label": "排水不好" }
  ],
  "intermediateStates": [
    { "stateId": "s_root_stress", "label": "根系状态变差" }
  ],
  "timeline": {
    "createdAt": "2026-03-29T10:00:00Z"
  }
}
```

### 不应返回的字段

- score breakdown
- raw candidate list
- causality raw edges
- genus / host exact numeric factors
- full follow-up strategy tree

---

## 7. 接口 4：历史记录

## 7.1 Request

```http
GET /diagnosis/history?plantId=plant_xxx&page=1&pageSize=20
```

---

## 7.2 Response

```json
{
  "items": [
    {
      "historyId": "hist_001",
      "resultId": "res_final_001",
      "createdAt": "2026-03-29T10:00:00Z",
      "summary": {
        "problemId": "p_root_rot",
        "displayName": "根腐",
        "severity": "high"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "hasMore": false
}
```

### 历史列表最小原则

历史列表只返回摘要：

- 时间
- 主问题显示名
- 严重度
- resultId / historyId

不要把完整 explanation 和策略树都塞进列表接口。

---

## 8. 接口 5：用户反馈

## 8.1 Request

```json
{
  "resultId": "res_final_001",
  "feedback": {
    "isHelpful": true,
    "isAccurate": false,
    "note": "最后发现更像缺铁，不是根腐"
  }
}
```

---

## 8.2 Response

```json
{
  "ok": true
}
```

### 用途

- 模型调优
- 规则校验
- 结果质量回溯

---

## 9. 前端可见字段与后端保密字段边界

## 9.1 前端允许看到的字段

### 会话字段
- `diagnosisSessionId`
- `roundId`
- `stage`
- `status`

### 题目字段
- `questionId`
- `type`
- `text`
- `helpText`
- `options[].optionId`
- `options[].text`

### 结果字段
- `resultId`
- `problemId`
- `displayName`
- `summary`
- `severity`
- `urgency`
- `nextSteps`
- `whatToAvoid`
- `contributingFactors[].label`
- `intermediateStates[].label`

---

## 9.2 后端内部保留字段

这些字段只允许在后端存在：

- `problem_key`
- `symptom_key`
- `question_key`
- `question_group_key`
- `association_strength`
- `edge_reliability`
- `genus_compatibility`
- `host_compatibility`
- `relation_strength`
- `priority_score`
- `problem_role` 的完整内部判定逻辑
- score 明细
- raw candidate list

---

## 10. 外部 id 与内部 key 映射要求

后端必须维护以下映射：

### 10.1 problem 映射

```text
problem_key (internal)
→ problemId (external)
→ displayName (public)
```

### 10.2 question 映射

```text
question_key (internal)
→ questionId (external)
→ text/helpText (public)
```

### 10.3 option 映射

```text
option_key (internal)
→ optionId (external)
→ text (public)
```

### 10.4 推荐实现

新增 mapper：

```text
cloudfunctions/diagnose-http/mappers/public-id-mapper.js
```

职责：

- 内部 key -> 外部 id
- 外部 id -> 内部 key
- 会话有效期管理
- 防止前端直接拿内部 key 反推规则

---

## 11. 推荐的后端内部处理顺序

## 11.1 `/diagnosis/start`

1. 验证 `plantId` / `imageIds`
2. 创建 `diagnosisSession`
3. 调用 `identify-http`
4. 获取 visual symptoms
5. 运行首轮诊断引擎
6. 判断是否需要 follow-up
7. 如果需要 follow-up：
   - 用 question selector 选题
   - 把内部 question 转成外部 question
8. 把最小结果响应返回前端

---

## 11.2 `/diagnosis/answer`

1. 验证 `diagnosisSessionId`
2. 校验 `questionId` / `optionId` 是否属于当前 session
3. 把外部 id 转回内部 key
4. 把问诊答案映射成 diagnostic symptoms / penalties
5. 跑二轮诊断
6. 判断是否继续问诊
7. 如果继续：
   - 返回下一轮题目
8. 如果结束：
   - 过滤 problem role
   - 组装用户结果
   - 持久化历史记录
   - 返回最终结果

---

## 12. 结果解释层最小输出规则

结果解释必须做裁剪，只返回用户级解释。

### 12.1 允许返回

- 为什么更像这个方向
- 还建议检查什么
- 先做什么
- 不要做什么

### 12.2 不允许返回

- “因为 `association_strength = 0.92`”
- “因为 genus factor = 0.84”
- “因为 causality relation_type = predisposes”
- “因为 top2 是 iron_deficiency 但被 penalty 压下去了”

所有内部推理细节都不能直吐前端。

---

## 13. role 过滤规则

后端在生成最终 `finalResult` 时必须过滤 `problem_role`：

### 可以作为主结论
- `root_cause`
- `secondary_issue`（若未来新增）

### 不可直接作为主结论
- `result_state`
- `aggregate_cluster`
- `predisposing_factor`

这些只能作为：

- `contributingFactors`
- `intermediateStates`
- `explanation`

例如：

- `general_stress`
- `chlorosis`
- `root_stress`
- `temperature_stress`
- `environmental_stress`

不能直接成为最终 top1 返回给前端。

---

## 14. DiagnosePopup 前端职责边界

`src/components/DiagnosePopup.vue` 只负责：

- 上传图片
- 调 `startDiagnosis`
- 展示当前题目
- 收集 `questionId + optionId`
- 调 `submitDiagnosisAnswers`
- 渲染结果卡片

禁止在这里：

- 自己根据 symptom 算分
- 自己决定问哪题
- 自己根据 answer 生成 mapped_symptom
- 自己根据 raw rankings 再二次排序

---

## 15. 推荐前端 API 门面

建议在 `src/api/plants-http.js` 中统一暴露：

```ts
startDiagnosis(payload)
submitDiagnosisAnswers(payload)
getDiagnosisResult(params)
getDiagnosisHistory(params)
submitDiagnosisFeedback(payload)
```

其中：

- 所有协议字段按本 md
- 页面 / 组件禁止绕过这个门面层直连底层诊断云函数

---

## 16. 安全与商业机密保护建议

### 16.1 最低要求
- 不暴露完整规则表
- 不暴露完整 question strategy
- 不暴露 score breakdown
- 不暴露内部 key

### 16.2 更高要求（可选）
- `questionId` / `optionId` 做 session 级临时 id
- `diagnosisSessionId` 设置过期时间
- 当前轮题目与上一轮题目做签名校验
- 防止前端伪造任意 `questionId` / `optionId`

### 16.3 推荐折中
项目当前阶段建议使用：

- 稳定的外部 id
- 后端 session 校验
- 后端 question ownership 校验
- 后端 stage 校验

先保证安全边界和开发效率平衡。

---

## 17. 给 Codex 的接口实现约束（可直接引用）

```text
你现在要为植物诊断系统实现最小前后端交互协议。

强制要求：
1. 前端只允许拿到当前交互必需的最小字段
2. 诊断入口唯一：src/components/DiagnosePopup.vue
3. 后端诊断中心唯一：cloudfunctions/diagnose-http
4. 前端不允许拿到完整规则、完整权重、完整因果图、完整 question strategy
5. 所有 question / option / result / problem 都必须通过外部 id 暴露，而不是直接使用内部 key
6. unknown 是正式选项，必须支持 value=0、不加分不减分、连续 unknown 切组
7. 最终结果只能由符合 role 条件的问题生成主结论
8. 所有内部 key 到外部 id 的映射必须集中在 mapper 中维护
9. 所有解释层输出必须是用户级解释，不允许把内部推理细节直接吐给前端

先实现：
- /diagnosis/start
- /diagnosis/answer
- /diagnosis/result
- /diagnosis/history
- /diagnosis/feedback

并确保：
- DiagnosePopup 只负责 UI 和提交
- 评分逻辑全部在后端
- 前端协议严格按本 md 定义
```

---

## 18. 最终目标

重构后，最小交互链路应稳定为：

```text
DiagnosePopup
→ POST /diagnosis/start
→ 返回最小首轮结果 + 当前要问的问题
→ POST /diagnosis/answer
→ 返回下一轮问题或最终结果
→ GET /diagnosis/result
→ GET /diagnosis/history
```

同时满足：

- 新体系为唯一真源
- 旧体系仅 adapter 兼容
- 前端拿最少
- 后端掌握全部
- 商业机密尽量不下发


---

# 第三部分：本项目执行优先级（最终收口版）

## P0：唯一入口与唯一评分中心

必须先确认：

1. 前端诊断唯一入口：
   - `src/components/DiagnosePopup.vue`

2. 后端诊断唯一决策中心：
   - `cloudfunctions/diagnose-http`

3. `pages/diagnose/diagnose.vue` 只能作为：
   - 承接页
   - 历史详情页
   - 只读结果页

禁止再让它成为另一套主诊断入口。

---

## P1：新体系真源与旧体系适配

必须确认：

- 新体系是唯一真源
- 旧体系只通过 adapter 兼容
- 不允许新旧双轨长期并行主导结果

必须先做：

1. `data-diff report`
2. `key alias map`
3. `backfill plan`
4. `repository 输出结构定义`

然后再进入诊断引擎改造。

---

## P2：数据库 / 运行时数据补齐

如果旧数据库不能直接满足新体系，优先顺序必须是：

```text
旧数据
→ diff
→ backfill
→ upsert
→ repository 统一输出新结构
→ 评分引擎切换到新体系
```

禁止因为旧数据不齐，就删新逻辑或让前端兜底。

---

## P3：评分引擎与问诊系统

评分引擎必须满足：

- visual evidence 参与
- question evidence 参与
- genus factor 参与
- host factor 参与
- `no` 进入 penalty
- `unknown` 是正式选项
- causality 只做二阶段增强
- `problem_role` 决定最终主结论筛选

问诊系统必须满足：

- 所有正式问题支持 `yes / no / unknown`
- 视觉症状进入问诊题干时必须使用中性事实名，不得把尚未确认的成因写进症状名；例如 `holes_in_leaf` 应写成“叶片孔洞”，不得写成“叶子被咬出了洞”，除非已由直接虫害线索确认虫害路径
- `yes` 必须表示对题干正向事实的确认，`no` 必须表示否定该事实；选项文案、`option_key`、`value`、症状映射、评分增减和 review 展示不得发生语义取反
- 对“是否真的破洞/缺损”这类结构完整性问题，`yes` 只能表示真实破洞/缺损存在，`no` 只能表示不存在真实破洞/缺损
- 问诊题生成时必须留存当时下发的选项文本快照，review 优先展示快照，避免历史答案被当前映射重新解释
- `unknown = 0`
- 同组连续 `unknown >= 2` 自动切组
- 前端不参与 question selector 策略

---

## P4：最小前后端交互

前端只允许拿：

- 当前题目
- 当前选项
- 当前会话状态
- 当前结果摘要
- 当前结果解释
- 历史摘要

前端不允许拿：

- 完整规则表
- 完整权重
- 完整 question strategy
- 完整因果图
- 原始评分细节
- 内部 key

---

## P5：用户体验与结果展示

最终对用户展示时，必须优先走 user-friendly 字段：

- `problems.display_name_cn`
- `problems.user_definition_cn`
- `problems.user_action_cn`
- `problems.user_prevention_cn`
- `diagnosis_result_explanations.*`
- `symptoms.display_text_cn`
- `question_*` 用户层字段

禁止把内部规则术语直接丢给用户。

---

# 第四部分：Codex 实施顺序建议（任务拆解）

## Step 1
锁死入口与边界：

- DiagnosePopup 为唯一主入口
- diagnose-http 为唯一评分中心
- pages/diagnose 降级为承接/只读

## Step 2
建立新诊断目录骨架：

- `domain/`
- `repositories/`
- `mappers/`
- `services/`
- `constants/`

## Step 3
完成数据侧准备：

- data diff
- key alias
- backfill builder
- repository 新结构输出

## Step 4
完成首轮诊断引擎：

- visual evidence scoring
- genus / host 修正
- preliminary result

## Step 5
完成问诊引擎：

- question selector
- unknown flow
- question answer mapping
- second-round scoring

## Step 6
完成结果解释层：

- role filter
- explanation formatter
- public response mapper

## Step 7
完成最小协议接线：

- `/diagnosis/start`
- `/diagnosis/answer`
- `/diagnosis/result`
- `/diagnosis/history`
- `/diagnosis/feedback`

## Step 8
最后再做前端 UI 收口与历史页对接

---

# 第五部分：最终 Review 主清单

Review 时必须一次性检查：

- [ ] DiagnosePopup 是否为唯一前端主诊断入口
- [ ] diagnose-http 是否为唯一后端评分中心
- [ ] 是否先做 diff/backfill，再切换新引擎
- [ ] repository 是否只向上暴露新结构
- [ ] 旧规则是否只通过 adapter 被消费
- [ ] visual/question/genus/host/penalty/causality 是否都已纳入
- [ ] unknown 是否作为正式选项落地
- [ ] problem_role 是否控制最终主结论
- [ ] 最小前后端协议是否遵守
- [ ] 前端是否没有拿到完整规则和分数细节
- [ ] 结果解释层是否使用 user-friendly 字段
- [ ] pages/diagnose 是否没有重新长出一套主流程

---

# 第六部分：一句话执行原则

```text
入口唯一、评分中心唯一、新体系为准、旧体系适配、先补数据再改引擎、前端拿最少、后端保留全部。
```
