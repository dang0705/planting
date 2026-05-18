# Planting 绿植诊断系统规则 All-in-One 文档

> 生成日期：2026-05-08  
> 来源压缩包：`new-rules.zip`  
> 有效源文档：48 份 Markdown  
> 当前上下文可确认出处：上传压缩包内的源文件；未检索到可用的 planting 项目历史会话级出处。  
> 使用原则：本文先给整合后的定位与规则，再在附录保留全部源文档原文，便于 AI 快速定位与回溯。

## 0. 使用方法

1. **先查第 1 章“AI 快速定位索引”**，找到对应章节和源 ID。  
2. **实现或审查时先看 A 类正式基线**，再看同主题的补充规则。  
3. **遇到冲突时按第 2 章优先级处理**：硬约束与开发收口版优先，旧草案只作追溯。  
4. **需要原文时跳到附录 A**，每份源文件都有 `Sxx` 编号、状态、标题和完整文本。  
5. **不要根据旧文件名猜职责**；本文已经修复压缩包文件名乱码，并标出了文件名/标题不一致的问题。

## 1. AI 快速定位索引

| 要找的问题 | 先看章节 | 源ID | 关键词 |
| --- | --- | --- | --- |
| 当前到底该以哪些文档为准？ | 2 版本与来源治理 | S01, S02, S06, S07 | A类正式基线, 开发收口, 文件名/标题不一致 |
| 前端/后端唯一入口在哪里？ | 3 架构入口与唯一真源 | S03, S04 | DiagnosePopup.vue, cloudfunctions/diagnose-http |
| 系统最高红线是什么？ | 4 宪法级硬约束 | S05 | evidence, hypothesis, outcome, P0/P1/P2 |
| problem、outcome、非问题性、不确定怎么分？ | 5 核心对象与分层 | S08, S09, S10 | problem_taxonomy, outcome_layer, 三类结论 |
| 一次诊断运行时有哪些对象？ | 6 运行时模型与决策流 | S11, S12 | diagnostic_session, observed_evidence_set, hypothesis_pool, stop_state |
| 什么时候继续问，什么时候 final？ | 9 追问、停止与输出资格 | S16, S17, S22 | gate_required_layer, output eligibility, low gain question |
| 视觉入口怎么把图片变成证据？ | 7 AI 视觉入口层 | S20, S21, S22, S23, S24 | inputSlotType, location_key, formally_admitted, out_of_pool |
| 高特异视觉证据能不能直接出结论？ | 7.5 高特异快速收敛 | S25, S26 | 不能越级直出, observed_evidence_set, fast convergence |
| symptom_class 是什么，和 pattern_key 有何区别？ | 8 症状模式层 | S31, S32, S33, S34, S35, S36 | location_key, pattern_key, distribution_key, symptom_type, symptom_class |
| 黄叶、红蜘蛛、虫咬等具体问题怎么避免过度输出？ | 9.4 具体问题正向证据门槛 | S17, S22, S25 | leaf_yellowing, spider_mites, holes_in_leaf, positive evidence |
| 植物身份主表、命名归一、Taxonomy 怎么做？ | 10 Taxonomy 与植物身份 | S37, S38, S39 | plant_identity_entities, aliases, family_name_canonical |
| SQL 最终应该按哪批表建？ | 11 SQL 与导入落地 | S40, S41, S42, S43, S44 | 最终_SQL, CREATE TABLE, visual_call_batches |
| 属级养护基线怎么落表？ | 10.4 属级养护基线 | S45, S46, S47 | genus_care_profiles, watering_strategy_json, light_strategy_json |
| HF AutoTrain、双模型、shadow compare 怎么接？ | 12 模型接入与灰度 | S27, S29, S30 | HF, label mapping, shadow_compare, adapter |
| batch/report 状态、问诊文案数据层怎么治理？ | 13 状态与文案治理 | S18, S19 | await_follow_up, question copy, 黄叶 gate |
| 想看原文，不想只看整合摘要 | 附录 A 原始源文档汇编 | S01-S48 | 每份源文档已按 ID 下沉标题层级 |


## 2. 版本、来源与优先级治理

### 2.1 当前可确认来源

本轮可确认的来源是上传的 `new-rules.zip`。系统尝试检索 planting 项目的历史会话级出处，但未找到可用记录。因此本文不伪造“来自哪个会话”的出处，只在源文件级别建立可回溯索引。

### 2.2 A 类正式基线

`当前正式基线文档清单 v1.2` 明确把 A 类文件作为当前正式基线，并规定 linked / additive / review / draft 文件不得直接当作实现基线。压缩包中 A 类 Markdown 基线文件基本齐全，但清单中引用的流程图 SVG 不在压缩包内。

### 2.3 推荐优先级

1. **宪法级硬约束**：诊断系统硬约束、中文主权、证据-假设-结论主轴。  
2. **当前正式基线 A 类文件**：以 `当前正式基线文档清单 v1.2` 为准。  
3. **开发收口版 / 最终 SQL / 标题版本已统一文件**：用于落库和 Codex 实现。  
4. **窄域补充规则**：高特异视觉快路径、收益驱动停止、问诊文案治理等，仅在其作用域内补充。  
5. **review / final_candidate / 草案 / 旧版**：只能作历史追溯、动机说明或待验证材料。

### 2.4 本轮发现的关键异常

| 发现 | 影响 | 处理 |
| --- | --- | --- |
| 未找到会话级出处 | 无法把每份文档回填到 planting 项目的具体历史会话。 | 成品只声明源文件级出处；不伪造会话名。 |
| 基线清单引用 SVG，但压缩包中缺少 SVG | 流程图图像本体不可整合，只能整合流程图说明文档。 | 在缺口清单中标记；如需图像版需补传 SVG。 |
| S07 文件名与正文标题不一致 | 文件名像“新增属级养护基线联动后总审查报告”，正文却是“第一版 SQL 表结构草案 v1”。 | 作为异常源保留；实现时不得仅按文件名理解职责。 |
| A 类基线清单与 AI_DIAGNOSIS_MASTER/CODEX 自称“唯一入口”存在口径差异 | 可能造成“看 A 类”还是“看 Codex 摘要”的入口冲突。 | 本文把 A 类作为正式基线判定，把 Codex/Master 作为实现导航；若内容冲突，以 A 类与开发收口版优先。 |
| SQL 文档存在 v1、v1.1、最终 v1.3 多版本 | 旧版草案可能覆盖开发收口字段。 | 建表优先 S41 最终 SQL v1.3，其次 S42 v1.1 开发收口；S43/S07 只作历史追溯。 |
| 部分 final_candidate 数据文件未在压缩包内 | 症状模式配套 CSV/XLSX 无法实际审查字段和值。 | 本文只整合说明与规则；实际落库仍需补齐数据文件。 |


## 3. 架构入口与唯一真源

### 3.1 唯一入口

实现层应把前端主诊断入口收敛到 `src/components/DiagnosePopup.vue`，后端诊断决策中心收敛到 `cloudfunctions/diagnose-http`。其他页面、工具函数或组件不得长出第二套主诊断流程。`identify-http` 可以提供身份候选，但不得输出最终排序结论。

### 3.2 新体系真源

运行时必须以新体系数据对象为准，包括 `problems`、`symptoms`、`symptom_problem_evidence`、`genus_problem_profiles`、`problem_host_profiles`、`plant_problem_profiles`、`problem_causality`、题库/选项/策略/生成引擎，以及 `diagnosis_result_explanations`。旧体系只能通过 adapter 兼容，不得继续主导最终诊断。

### 3.3 推荐代码结构

在 `cloudfunctions/diagnose-http/` 下推荐拆出：`domain/`、`repositories/`、`mappers/`、`services/`、`constants/`。最小核心包括 diagnosis engine、evidence scoring、prior scorers、causality scorer、question selector、result formatter，以及 problem/symptom/prior/question/causality repositories。

### 3.4 迁移顺序

正确顺序是：旧数据 → data-diff → key alias map → backfill/upsert → repository 输出统一新结构 → 切换新引擎。不得因为旧数据不齐就删除新逻辑或把前端变成诊断兜底层。

来源：S03, S04。

## 4. 宪法级硬约束

系统不是“症状系统”、不是“规则打分表”、也不是“AI 直接诊断流”。它的正式定位是：**受严格约束治理的、基于证据、诊断假设与诊断结论收敛的诊断系统**。所有输入必须进入证据层，所有排序必须围绕诊断假设池，最终输出必须落在诊断结论层。


| 规则 | 含义 | 源ID |
| --- | --- | --- |
| 输入必须先转成证据。 | 图片、用户回答、taxonomy prior、派生规则都不得直接改 outcome。 | S05, S11, S12 |
| 必须维护诊断假设池。 | 不能由 top1 symptom 或单一视觉候选直接驱动整条诊断流。 | S05, S11 |
| 最终输出必须支持三类 outcome。 | 问题性、非问题性、不确定都必须有正式出口。 | S05, S09, S10 |
| problem taxonomy 只管问题性诊断对象。 | 正常特征、不确定结论、动作建议不得混入 problem。 | S08, S10 |
| 视觉层不是最终裁判。 | AI symptom 是候选视觉证据，不等于 canonical symptom、problem 或 outcome。 | S20, S25 |
| formally_admitted 必须先落 observed_evidence_set。 | 高特异证据也不能跳过接纳判定与证据落位。 | S25, S12 |
| symptom_class 是问诊/诊断模式桥梁。 | pattern_key 描述形态，symptom_type 描述来源，symptom_class 才控制分流。 | S31, S32 |
| 一页一题不是无限追问。 | 继续问必须有 gate、输出资格或高边际收益。 | S16, S22 |
| 具体 problem 输出必须有正向问题级证据。 | 泛化视觉症状、prior、属级 baseline 不能包装成确定病因。 | S17 |
| 中文是一等公民。 | 中文主名是定义语言，英文只作代码键名和索引辅助。 | S05, S13 |

### 4.1 概率语言禁用

评分只能表达相对支持强度，不能伪装成真实概率。外部输出不得使用“100% 确定”“毫无疑问”“已完全确认”等语言。即使高特异视觉证据成立，也只能表达为“更像”“高度提示”“当前证据非常支持”“可优先按某方向处理”。

### 4.2 中文主权

中文是定义语言。英文只能作为键名、字段名、索引或兼容标记。任何专业术语应先有中文主名，再有英文辅助名。

来源：S05, S13, S25。

## 5. 核心对象与分层

### 5.1 静态核心对象

系统的静态知识骨架应由七类对象组成：

1. **诊断目标分层（problem_taxonomy）**：只定义问题性诊断对象。  
2. **证据目录（evidence_catalog）**：定义系统能消费的标准证据。  
3. **证据派生规则（evidence_derivation_rules）**：从原始证据派生模式证据。  
4. **证据到诊断问题规则（evidence_problem_rules）**：定义证据如何 support / oppose / exclude / gate 问题。  
5. **诊断提问（diagnostic_questions）**：补充证据、分流与确认输出资格。  
6. **行动策略（action_policy）**：在不同结论和确定性下输出动作建议。  
7. **诊断结论层（outcome_layer）**：定义最终可输出的完整结果空间。

### 5.2 problem 与 outcome 的边界

`problem_taxonomy` 只负责“问题性诊断对象”。它不负责正常特征、不确定结论，也不承载动作建议。`outcome_layer` 比 problem 更高一层，负责三类最终输出：问题性结论、非问题性结论、不确定结论。

### 5.3 evidence 的最低要求

证据至少要有 evidence_key、evidence_type、source_type、evidence_role、observability、reliability、independence_group 等字段。证据状态必须支持 present、absent_confirmed、unknown。派生证据默认只允许一层，且要可追溯父证据，避免重复叠加。

来源：S05, S08, S09, S10。

## 6. 运行时模型与决策流

### 6.1 八个运行时会话对象

一次真实诊断会话至少应包含：`diagnostic_session`、`normalized_input`、`observed_evidence_set`、`hypothesis_pool`、`outcome_pool`、`question_queue`、`stop_state`、`diagnostic_trace`。运行时只保存当前会话状态，不复制长期知识库。

### 6.2 九阶段主流程

决策流分为：会话创建、输入归一化、初始证据生成、初始解释对象生成、首轮结论收敛、提问决策、回答回流与重算、停止判定、最终输出。主轴必须是：

```text
输入 → 证据 → 解释对象竞争 → 结论收敛 → 动作输出
```

在 `route` 模式下，主轴还收敛为：
- `routeDecision.nextQuestionKeys` 接管追问主链；
- `primaryOutcome`、`visibleOutcomes`、`actionAdvice` 接管公开结果主链；
- `actionAdvice` 是 route outcome 的行动建议权威来源；旧 `treatment`、`prevention`、`explanation.firstAid`、`explanation.avoid` 只能作为兼容 fallback 或审计字段，不能覆盖 route 建议；
- 2026-05-17 起，`ranking` 不再作为候选排序、fallback 或审计输出依据；非权威 route 统一回退为 `uncertain`，活跃主链只消费候选 outcome、路径 gate 与回答影响值。

> 全文历史章节中出现的 `ranking`、`rankings`、`scoreDelta`、`finalScore`、`baseScore`、`topScoreGap` 仅表示旧架构背景或迁移前描述；若与本条冲突，以本条 route-only 口径为准。

禁止路径包括：输入 → top1 symptom → 直接动作；输入 → 直接选 problem；输入 → 直接拍脑袋选择问题/正常/不确定。

### 6.3 不确定结论

不确定不是默认起点，但可以是合法早停终点。常见合法触发包括输入质量不足、关键主体缺失、强证据冲突无法解除、可获得高价值信息耗尽、用户无法回答关键问题。

来源：S11, S12。

## 7. AI 视觉入口层

视觉入口层的核心任务不是“让模型直接诊断”，而是把图像转成可审计、可准入、可回放的视觉证据候选。


| 节点 | 规则 | 源ID |
| --- | --- | --- |
| 输入/槽位 | 多图按单图标准化，但每张图带入 inputSlotType、slot label、userDeclaredOrganType、slot order、totalImageCount 等业务语义。 | S20, S21, S22 |
| 候选池 | 有器官槽位时，symptom 候选池按 location_key 收窄；池外异常进入 out_of_pool_symptom_candidates，不硬映射。 | S22, S24 |
| AI symptom | AI 输出只是候选视觉异常，不是 canonical symptom。必须经过器官、质量、映射、准入 gate。 | S20 |
| 准入出口 | direct_admit、followup_required、reject_or_hold 同为入口层正式出口。 | S20 |
| 高特异快路径 | 仅 formally_admitted visual evidence → observed_evidence_set 后，才能进入 high_specificity_fast_convergence_gate。 | S25 |
| 问诊承接 | 已观察视觉形态优先；相同 location/pattern/distribution 的替代题应阻断；每轮只展示一个活跃问题。 | S22, S23 |

### 7.1 多图与器官槽位

用户可按叶片、茎、根/根颈、全株、花果/其他特写等槽位上传图片。槽位语义是结构化输入提示，地位高于模型无提示猜测，但低于后续人工纠正和高置信反复一致的会话级证据。它可用于 prompt 约束、器官字段预填、symptom 映射约束和 follow-up 优先级提示，但不能跳过图像质量判断、症状映射和准入。

### 7.2 池外候选与证据隔离

当模型看到明显异常，但不在当前 `location_key` 候选池内，必须写入 `out_of_pool_symptom_candidates`。池外候选只能用于留痕、知识完善或后续追问依据，不得直接进入正式证据链。formal evidence 与 proxy evidence 必须隔离。

### 7.3 高特异快速收敛

高特异视觉证据可以缩短诊断内部收敛路径，但不能让视觉层越级直出最终结论。合法入口只能是：

```text
formally_admitted visual evidence
→ observed_evidence_set
→ high_specificity_fast_convergence_gate
→ diagnosis outcome eligibility
```

白名单方向应保持窄口，例如红蜘蛛典型网丝 + 取食痕、介壳虫壳体群聚、蚜虫虫群群聚、白粉病典型大片粉层、黑飞成虫且盆土场景一致。黄叶、卷叶、干尖、失绿、轻微斑点、萎蔫等低特异症状不得触发快收敛。

来源：S20-S28。

## 8. 症状模式层（symptom_class）

症状模式层是当前体系从“能跑”升级到“稳定收敛”的关键桥梁。它把 AI visual symptom 到 problem / question 的直连，改造成：

```text
AI visual symptom
→ symptom_class
→ class-gated candidate problems
→ class-gated question groups
→ route-gated candidate outcomes
```

### 8.1 五层症状结构

| 维度 | 回答的问题 | 例子 | 不能替代 |
| --- | --- | --- | --- |
| location_key | 症状长在哪里 | leaf, root, stem, flower, soil | symptom_class |
| pattern_key | 外观看起来是什么形态 | spots, mold, odor, blister, chew, insects_visible | symptom_class |
| distribution_key | 症状如何分布 | random, edges, base, clustered, vein_limited | symptom_class |
| symptom_type | 证据来源/属性分类 | visual, diagnostic, environmental | symptom_class |
| symptom_class | 后续进入哪种诊断/问诊模式 | yellowing_mode 等模式类 | canonical symptom 或 final outcome |

### 8.2 知识放数据库，策略放运行时

最终不采用纯 SQL 决策，也不采用纯硬编码 if/else。数据库保存分流知识、映射、基础优先级和审计状态；运行时代码负责分流裁决、状态机、重排、去重、切组、切 class 和低置信兜底。

### 8.3 黄叶等复杂模式

黄叶类必须走独立 `yellowing_mode`。`leaf_yellowing` 只代表黄化方向成立，不代表低光、缺水、积水、肥害、缺氮、缺铁、根压等具体养护病因成立。具体结论必须有对应正向上下文或高特异事实。

来源：S31-S36, S17。

## 9. 追问、停止与输出资格

### 9.1 一页一题

正式诊断流每轮只允许一个活跃问题：后端 `question_queue.activeItemCount` 不得超过 1，前端不得并列展示多个问题。用户回答后必须重新计算 evidence、hypothesis、outcome、gate_required_layer、output eligibility、下一题收益和 stop_state。

### 9.2 gate_required_layer

`gate_required_layer` 是当前会话唯一可以阻塞 final 的必答层。只有模式入口 gate、输出资格 gate、top/runner-up 区分 gate、合法 uncertain gate、安全/动作边界 gate 可以进入必答层。`progression`、`distribution_scope`、`host_confirmation`、`underside_presence` 等泛化问题默认不得阻塞 final，除非正式规则显式标为某个 outcome 的输出资格 gate。

### 9.3 下一题高价值判定

下一题必须能补齐 context guard、改变 output eligibility、区分 top 与 runner-up、触发合法 uncertain，或影响安全/动作边界，才算高价值题。无有效 `directProblemAdjustments`、无 context_guard、无 output_eligibility、无 uncertain_legality、无安全边界影响的问题，即使文案相关，也应作为低价值题。

### 9.4 具体 problem 的正向证据门槛

视觉症状可以形成方向，但具体问题结论必须有问题级正向证据或高特异正式视觉事实支撑。禁止只凭泛化视觉症状、最高 prior、属级养护基线或泛化 observed_probe 输出具体病因。

典型边界：

- `holes_in_leaf`、`chewed_edges` 等结构缺损，如果只是单张宽泛图或模型泛化描述，应保留为 visual_candidate，先问兜底确认。  
- `leaf_yellowing` 不能单独输出 low_light / underwatering / overwatering / nutrient_deficiency 等具体养护结论。  
- `yellow_speckling`、`stippling`、叶背存在、分布范围或进展速度不能单独输出 spider_mites；红蜘蛛至少需要正式高特异网丝/活动螨迹、直接问诊正证据或快收敛规则命中。

来源：S16, S17, S22, S25。

## 10. Taxonomy、植物身份与属级养护基线

### 10.1 Taxonomy 不是 Diagnosis

Taxonomy 主数据层不等于 Diagnosis 业务层。二者之间只能通过受限挂接连接，不能无限透传。身份精确挂接优先于属级、科级、弱背景挂接。

### 10.2 植物身份主表

正式主表是 `plant_identity_entities`，用于承载植物身份对象。命名归一应区分 `canonical_identity_name`、中文/英文主名、展示名、identity_level、family/genus/species/scientific_name 等。别名、商业名、历史名、百度命中名、搜索兼容名应放入别名/匹配规则相关表。

### 10.3 Taxonomy 静态层与运行时身份解析

`identity_resolution_status` 不属于 Taxonomy 静态主数据字段，只属于运行时身份解析记录。Taxonomy 静态层承载稳定身份与命名，运行时层承载当前会话的匹配状态、弱匹配、未解析、当前主身份等。

### 10.4 属级养护基线

`genus_care_profiles` 应正式归入 Taxonomy 侧属级养护基线主表，不是 Diagnosis 问题表。它提供浇水、施肥、光照、通风、温湿度、毒性等级等属级背景，不得直接包装成具体诊断结论。它可用于追问文案、context guard、行动策略和解释层。

来源：S37-S40, S45-S47。

## 11. SQL 与导入落地

### 11.1 SQL 分层

| 层 | 代表表 | 职责 | 源ID |
| --- | --- | --- | --- |
| Taxonomy 主数据层 | plant_identity_entities, plant_identity_aliases, plant_identity_match_rules, plant_identity_merge_history, genus_care_profiles | 身份、命名、属级养护基线与 taxonomy 主数据。 | S37, S38, S40, S41, S42, S45 |
| Diagnosis 静态业务层 | problems, symptoms, question_library_v5_real, question_option_mapping_v5_real, question_strategy_v5_real, diagnosis_result_explanations, plant_problem_profiles | 诊断问题、症状、题库、解释与植物问题画像。 | S03, S40, S41, S42, S44 |
| Taxonomy → Diagnosis 挂接层 | plant_identity_diagnosis_links | 身份/属/科到诊断业务对象的受限连接，不做无限透传。 | S39, S40, S41 |
| 运行时与监督层 | visual_call_batches, plant_identity_resolution_records, visual_raw_image_records, visual_normalized_image_results, visual_admission_records, visual_call_aggregate_results, visual_supervision_records | 会话视觉调用、身份解析、接纳判定、监督回放与灰度审计。 | S11, S20, S41, S42 |

### 11.2 建表优先级

建表优先使用 `最终 SQL 制表方案 v1.3（开发收口版）`，其次使用 `第一版 SQL 表结构草案 v1.1（开发收口版）`。`第一版 SQL 表结构草案 v1` 与文件名/标题不一致的 S07 只作历史追溯。

### 11.3 导入素材职责

- `plant_catalog.csv`：Taxonomy 身份主数据侧，形成 plant identity、alias、match rule。  
- `plants_v13_user_friendly_full_v7.xlsx`：Diagnosis 侧，形成 problems、symptoms、题库、选项、策略、解释与 plant_problem_profiles。  
- `genus_care_profile.csv`：Taxonomy 侧属级养护基线，形成 genus_care_profiles。

导入脚本应拆分 load、map、normalize、validate、import、report，不应直接“把文件塞进数据库”。

来源：S40-S44。

## 12. 模型接入、HF 与 shadow_compare

HF AutoTrain 可以作为真实推理链路接入，但必须通过适配层完成标签映射和灰度。主链与对照链必须隔离，`shadow_compare` 数据只能用于留痕、评估和灰度，不得污染正式 diagnosis 主链。双模型、多图聚合、origin/supersede、visual batch 追溯都要进入运行时和审计记录。

模型输出的标签或文本仍然只是候选证据来源。无论来自百度、混元、HF AutoTrain 或双模型融合，都不能替代接纳判定、证据落位、诊断假设竞争和 outcome eligibility。

来源：S27, S29, S30。

## 13. 状态字段、问诊文案与审计

`await_follow_up` 必须表示系统已正式进入等待用户追问回答的状态，不应与 report 或 batch 的中间状态混用。问诊文案必须来自正式数据层，运行时负责选择、快照、填充和审计，不得临时生成含义反转或语义不一致的问题。

问诊选项的用户可见文本、内部 `option_key`、`value`、`maps_to_symptom_key`、评分增减和 review 展示必须保持同一语义。`yes` 表示正向确认题干事实，`no` 表示否定题干事实，`unknown` 不加分不减分；同组连续 unknown 可触发切组。

来源：S04, S18, S19。

## 14. 实现验收清单

- 前端只有一个主诊断入口，后端只有一个主诊断决策中心。  
- 所有输入先进入 evidence，不允许视觉、Taxonomy、route hint 直接写 final outcome。  
- Runtime 同时维护 hypothesis_pool 与 outcome_pool。  
- `problem_taxonomy` 不混入正常特征、不确定结论、行动建议。  
- 视觉正式证据必须经过 admission，再落 `observed_evidence_set`。  
- 高特异快路径不新增 route_primary_action，不新增 outcome_type，不输出 100% 确定。  
- route 接管下追问不超过 2 轮且每轮 1 题；不再补位 generic/forced follow-up。
- 黄叶养护 route 必须两层内可闭合：分支题用于区分水/光/老叶，第二题补齐干湿或光照变化等关键事实；分支题本身不得让冲突 outcome 同时通过。
- route 接管下生成下一题必须排除已回答 `questionKey`；已答分支题不能再次作为 `nextQuestionKeys` 返回，必须推进到未答关键事实或停止。
- 诊断 review 后台是审计界面，必须能看到完整 route path：`coreProcess.route.routeDecision` 至少包含候选 outcome 状态、routeTrace、gateResults、下一题、决策原因和行动冲突组；用户端公开响应不得因此暴露内部 gate 明细。
- route 权威且输出问题性结论时，review 治理建议必须优先使用运行时快照中的 `actionAdvice`；历史 `treatment/prevention` 若与 route outcome 冲突，只能保留为审计线索。
- 旧 ranking 回放审计已废止；route 非权威（`fallbackPolicy` 非空）统一公开为 `uncertain`，review 仅保留 route path、gate、候选 outcome 与证据说明。
- 每轮只有一个活跃追问；回答后重算 evidence/hypothesis/outcome/stop_state。  
- 低收益问题不得阻塞已满足门槛的 final。  
- 具体病因输出必须有问题级正向证据或高特异正式视觉事实。  
- SQL 建表按 final SQL v1.3 与 v1.1 开发收口版执行；旧草案不覆盖新方案。  
- `genus_care_profiles` 作为 Taxonomy 侧属级基线，不直接充当具体病因。  
- shadow_compare/HF 灰度结果不得污染主链。

## 15. 源文档总索引

| ID | 状态 | 类别 | 标题/文件 | 用途 | 关键词 |
| --- | --- | --- | --- | --- | --- |
| S01 | A类正式基线 | 版本/来源治理 | 当前正式基线文档清单 v1.2（修正版，完整最终版） 当前正式基线文档清单_v1_2_修正版.md | 当前唯一正式基线索引；定义 A/B 类与 Codex 直接使用规则 | 基线清单, A类, B类, Codex, 文件优先级 |
| S02 | A类正式基线 | 版本/来源治理 | 开发前阻断问题一次性收口裁决 v1（完整最终版） 开发前阻断问题一次性收口裁决_v1.md | 开发前阻断项一次性裁决；非阻断项降级 | 开发收口, 阻断问题, identity_resolution_status, family_name_canonical |
| S03 | 非A类/补充或过程文件 | 总入口/Codex | AI 诊断系统总规范入口文档（重构规范 + 最小交互协议） AI_DIAGNOSIS_MASTER_SPEC_v2.md | 系统重构总规范；前端/后端唯一入口、评分公式、目录建议 | DiagnosePopup, diagnose-http, 新体系真源, 评分公式, adapter |
| S04 | 非A类/补充或过程文件 | 总入口/Codex | AI Diagnosis Codex 极简执行摘要 AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md | 给 Codex 的极简执行摘要；锁定唯一入口、真源、symptom_class 与迁移顺序 | Codex, 唯一入口, symptom_class, data-diff, backfill |
| S05 | A类正式基线 | 宪法/硬约束 | 诊断系统硬约束清单 v2.4（完整最终版，基于可用前版只增不减） diagnosis_hard_constraints_v2_4_20260404_121000.md | 诊断系统最高硬约束；证据-假设-结论主轴，P0/P1/P2 约束 | P0, evidence, hypothesis, outcome, 三态, 概率禁用 |
| S06 | A类正式基线 | 审查/一致性 | 当前全部文档最高规格联动一致性总审查报告（完整最终版） 当前全部文档最高规格联动一致性总审查报告.md | 全体系联动审查；识别 P0 问题与文档一致性缺口 | 一致性审查, P0, 主链闭环, Taxonomy/Diagnosis 分家 |
| S07 | A类正式基线 | 异常/SQL源 | 第一版 SQL 表结构草案 v1（完整最终版） 新增属级养护基线联动后文档体系最高规格一致性总审查报告_重新生成版.md | 文件名像总审查报告，但正文标题为“第一版 SQL 表结构草案 v1”；需作为命名异常处理 | 文件名标题不一致, SQL 草案, 建表分层 |
| S08 | A类正式基线 | 诊断主链 | 诊断目标分层 v1.4（完整最终版，基于可用前版只增不减） problem_taxonomy_v1_4_full_final.md | 诊断问题层；只定义问题性诊断对象，不覆盖最终输出全集 | problem taxonomy, 问题性结论, 问题簇, 诊断问题 |
| S09 | A类正式基线 | 诊断主链 | 诊断结论层 v1.2（完整最终版，基于 v1.1 只增不减） diagnosis_outcome_layer_v1_2_full_final.md | 诊断结论层；定义问题性/非问题性/不确定三类最终结果空间 | outcome_layer, problematic, non_problematic, uncertain |
| S10 | A类正式基线 | 诊断主链 | 核心数据结构 v1.6（完整最终版） 核心数据结构_v1_6_完整最终版_标题版本已统一.md | 七大静态核心对象：问题、证据、派生、规则、提问、行动、结论 | 核心数据结构, evidence_catalog, action_policy, outcome_layer |
| S11 | A类正式基线 | 诊断主链 | 运行时模型 v1.5（完整最终版） 运行时模型_v1_5_完整最终版_标题版本已统一.md | 一次真实诊断会话的运行时对象、状态与可回放轨迹 | diagnostic_session, observed_evidence_set, hypothesis_pool, question_queue, trace |
| S12 | A类正式基线 | 诊断主链 | 决策流 v1.4（完整最终版） 决策流_v1_4_完整最终版_标题版本已统一.md | 九阶段决策流；输入→证据→解释竞争→结论收敛→动作输出 | 决策流, 停止判定, final, uncertain, 证据优先 |
| S13 | A类正式基线 | 术语/受控词 | 统一术语表 v1.4（完整最终版） 统一术语表_v1_4_完整最终版_标题版本已统一.md | 受控词汇基线；中文主名优先，英文作为辅助键名 | 术语, controlled vocabulary, 中文一等公民, 禁止混用 |
| S14 | A类正式基线 | 知识库/MVP | 最小可用知识库 v1.3（完整最终版） 最小可用知识库_v1_3_完整最终版_标题版本已统一.md | 第一版知识库闭环边界；不追求全覆盖，追求高价值闭环 | 最小知识库, MVP, v1, 覆盖范围 |
| S15 | A类正式基线 | 治理/准入退役 | 准入与退役规则 v1.3（完整最终版） 准入与退役规则_v1_3_完整最终版_标题版本已统一.md | 对象是否进入或退出系统的治理规则；默认拒绝，证据驱动 | 准入, 退役, 默认拒绝, evidence, 审查状态 |
| S16 | A类正式基线 | 追问/停止 | 收益驱动停止策略 v1 收益驱动停止策略_v1.md | 取消固定轮数后的收益驱动停止规则；gate、输出资格、边际收益 | 一页一题, gate_required_layer, output eligibility, low gain question |
| S17 | 非A类/补充或过程文件 | 追问/停止 | 具体问题结论正向证据门槛规则 v1 具体问题结论正向证据门槛规则_v1.md | 具体 problem 输出必须有问题级正向证据或高特异视觉事实 | 正向证据门槛, 泛化症状, 黄叶, 红蜘蛛, uncertain |
| S18 | 非A类/补充或过程文件 | 状态/字段治理 | 诊断 batch / report 状态字段标注规则 2026-04-29 diagnosis_batch_report_state_labeling_rule_20260429.md | batch/report 状态字段标注；await_follow_up 语义与审计 | await_follow_up, batch, report, 状态字段 |
| S19 | 非A类/补充或过程文件 | 问诊/文案治理 | 问诊文案数据层治理规则 2026-04-29 question_copy_data_layer_governance_20260429.md | 问诊文案来源、运行时职责、黄叶 gate 与必备字段 | question copy, question_library, 黄叶 gate, 文案治理 |
| S20 | A类正式基线 | AI视觉入口 | AI视觉诊断入口层数据结构与留存规范 v1.4（器官识别与产品辅助输入增补版） ai_visual_entry_data_structure_and_retention_spec_v1_4_full_consolidated.md | 视觉入口层数据结构与留存；器官槽位、AI symptom/canonical symptom 边界 | AI visual, organ slot, inputSlot, direct_admit, followup_required |
| S21 | 非A类/补充或过程文件 | AI视觉入口 | 视觉多图业务融合改造计划 v1 视觉多图业务融合改造计划_v1.md | 多图业务融合改造目标、范围、聚合与留痕 | 多图, 业务融合, image batch, 证据聚合 |
| S22 | 非A类/补充或过程文件 | AI视觉入口/追问 | 视觉 prompt 与追问关联守卫规则 v1 视觉prompt与追问关联守卫规则_v1.md | 多图 prompt、location_key 池收窄、追问承接、单题问诊守卫 | prompt, location_key, out_of_pool, question_queue, 一页一题 |
| S23 | 非A类/补充或过程文件 | AI视觉入口/追问 | 视觉候选症状追问承接与兜底确认规则 v1 视觉候选症状追问承接与兜底确认规则_v1.md | candidate_retained 与兜底确认问题；question_queue 优先于 no_visual_symptoms_detected | candidate_retained, 兜底确认, no_visual_symptoms_detected |
| S24 | 非A类/补充或过程文件 | AI视觉入口/审计 | 视觉症状池外候选留痕与代理证据规范 v2 视觉症状池外候选留痕与证据隔离规范_v1.md | 池外视觉候选的留痕与证据隔离；formal/proxy 角色 | out_of_pool_symptom_candidates, proxy evidence, evidence isolation |
| S25 | 非A类/补充或过程文件 | AI视觉入口/快路径 | 高特异性视觉证据快速收敛规则 v1（完整最终版，给 Codex） 高特异性视觉证据快速收敛规则_v1_1_review增补修正版_给Codex.md | 高特异视觉证据可快速收敛但不得视觉层越级直出 | fast convergence, formally_admitted, observed_evidence_set, zero_follow_up |
| S26 | 非A类/补充或过程文件 | AI视觉入口/例外 | ai_visual_pool 直出例外与 formal question coverage 边界 v1 ai_visual_pool直出例外与formal_question_coverage边界_v1.md | ai_visual_pool 直出例外与 formal_question_coverage 边界 | direct-output audited exception, formal_question_coverage |
| S27 | 非A类/补充或过程文件 | AI视觉/代码落地 | 视觉模型适配层与双模型多图融合代码落地审查_v1 视觉模型适配层与双模型多图融合代码落地审查_v1.md | 双模型适配、多图融合、origin/supersede、observed_evidence_set 代码审查 | dual model, adapter, multi-image, observed_evidence_set |
| S28 | 非A类/补充或过程文件 | AI视觉/运行时示例 | AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1（分支场景增补版，完整最终版） ai_visual_to_diagnosis_runtime_linkage_example_v1_1_full_reviewed_final_标题版本已统一.md | AI视觉入口到 Diagnosis 运行时挂接示例 | visual runtime linkage, identity, evidence, outcome |
| S29 | 非A类/补充或过程文件 | 模型/HF | HF_AutoTrain真实推理接入与标签映射规范_v1 HF_AutoTrain真实推理接入与标签映射规范_v1.md | HF AutoTrain 真实推理入口、标签空间与映射 | HF AutoTrain, health, predict, label mapping |
| S30 | 非A类/补充或过程文件 | 模型/HF/灰度 | shadow_compare数据留痕与HF灰度接入边界_v1 shadow_compare数据留痕与HF灰度接入边界_v1.md | shadow_compare 数据留痕与 HF 灰度接入边界；主链与对照链隔离 | shadow_compare, HF, 灰度, 主链隔离 |
| S31 | 非A类/补充或过程文件 | 症状模式 | 症状模式分流机制与运行时流程规范（最终完整版） 症状模式分流机制与运行时流程规范_最终完整版.md | symptom_class 分流机制最终版；知识入库、策略运行时 | symptom_class, location_key, pattern_key, distribution_key, class gate |
| S32 | 非A类/补充或过程文件 | 症状模式/审查 | 症状模式（symptom_class）更新专项 Review SYMPTOM_CLASS_REVIEW_AND_UPDATE.md | symptom_class 更新专项 review；缺口与修正要求 | symptom_class, pattern_key, parent_class_key, review |
| S33 | 非A类/补充或过程文件 | 症状模式/开发前置 | 症状模式落代码前提条件审查结论 v1 症状模式落代码前提条件审查结论_v1.md | 症状模式落代码前必须满足的条件与硬缺口 | 落代码, pseudo-symptom, class_question_group_strategy |
| S34 | 非A类/补充或过程文件 | 症状模式/数据 | 症状模式配套数据 final_candidate 说明 症状模式配套数据_final_candidate说明.md | 症状模式配套 final_candidate 数据说明 | final_candidate, class_question_group_strategy, symptom_class_row_review |
| S35 | 非A类/补充或过程文件 | 症状模式/收口 | 症状模式剩余 block 收口说明（v3） 症状模式剩余block收口说明_v3.md | 症状模式剩余 block 收口说明 | context_only, parent_class_key, block 收口 |
| S36 | 非A类/补充或过程文件 | 症状模式/schema | parent_class_key schema 决策说明（v1） parent_class_key_schema_decision_v1.md | parent_class_key schema 裁决 | parent_class_key, schema, symptom_class |
| S37 | A类正式基线 | Taxonomy/身份 | 植物身份主表与命名归一规则 v1（完整最终版） plant_identity_master_and_name_normalization_rules_v1.md | 植物身份主表与命名归一规则 | plant_identity_entities, aliases, canonical_identity_name |
| S38 | A类正式基线 | Taxonomy/身份 | 植物 Taxonomy 体系定义 v1.3（完整最终版，开发收口版） 植物_Taxonomy_体系定义_v1_3_完整最终版_开发收口版.md | Taxonomy 静态层与运行时身份解析边界 | Taxonomy, identity_resolution_status, family_name_canonical |
| S39 | A类正式基线 | Taxonomy/Diagnosis桥接 | Taxonomy 与 Diagnosis 挂接规则 v1（完整最终版） taxonomy_diagnosis_linkage_rules_v1.md | Taxonomy 到 Diagnosis 的受限挂接规则与优先级 | plant_identity_diagnosis_links, identity/genus/family linkage |
| S40 | A类正式基线 | SQL/字段映射 | Taxonomy / Diagnosis SQL 字段映射表 v1.1（完整最终版） Taxonomy_Diagnosis_SQL_字段映射表_v1_1_完整最终版_标题版本已统一.md | Taxonomy/Diagnosis SQL 字段映射与素材源职责 | 字段映射, plant_catalog, plants_v13, genus_care_profile |
| S41 | A类正式基线 | SQL/开发收口 | 最终 SQL 制表方案 v1.3（完整最终版，开发收口版） 最终_SQL_制表方案_v1_3_完整最终版_开发收口版.md | 最终 SQL 制表方案 v1.3；分层、字段裁决、枚举与落表边界 | 最终SQL, 开发收口, visual_call_batches, route_primary_action |
| S42 | A类正式基线 | SQL/开发收口 | 第一版 SQL 表结构草案 v1.1（完整最终版，开发收口版） 第一版_SQL_表结构草案_v1_1_开发收口版.md | 第一版 SQL 表结构草案 v1.1 开发收口版 | CREATE TABLE, plant_identity_entities, visual_admission_records |
| S43 | 非A类/补充或过程文件 | SQL/旧草案 | 第一版 SQL 表结构草案 v1（完整最终版） 第一版_SQL_表结构草案_v1.md | 第一版 SQL 表结构草案 v1；被 v1.1/最终方案覆盖时不应优先使用 | SQL v1, 草案, 历史追溯 |
| S44 | A类正式基线 | SQL/导入 | 第一版数据映射 / 导入脚本方案 v1（完整最终版） 第一版_数据映射_导入脚本方案_v1.md | 三份素材源的数据映射与导入脚本方案 | 导入脚本, plant_catalog, diagnosis_v7, genus_care_profiles |
| S45 | A类正式基线 | 属级养护基线 | 属级养护基线表设计 v1.1（review 增补修正版，完整最终版） 属级养护基线表设计_v1_1_full_reviewed_final_标题版本已统一.md | genus_care_profiles 表设计、字段、JSON 策略与枚举 | genus_care_profiles, watering_strategy_json, toxicity_level |
| S46 | A类正式基线 | 属级养护基线/联动 | 属级养护基线概念联动分析与文档增补建议 v1 属级养护基线概念联动分析与文档增补建议_v1_重新生成版.md | 属级养护基线与 Taxonomy、SQL、运行时、行动建议的联动分析 | genus care, Taxonomy, action policy, 联动 |
| S47 | A类正式基线 | 属级养护基线/审查 | 《genus_care_profile.csv》最高规格审查报告（属级养护策略数据） genus_care_profile_review_report.md | genus_care_profile.csv 审查报告与正式定位判断 | genus_care_profile.csv, 主数据候选表, 审查 |
| S48 | A类正式基线 | 流程图说明 | 绿植诊断系统完整流程图说明（终极版，中文主导，v1.1 开发收口版） 绿植诊断系统完整流程图说明_终极版_中文主导_v1_1_开发收口版.md | 完整流程图文字说明；上游并行链、停止与输出资格、route hint 落位 | 流程图, route hint, 停止条件, observed_evidence_set |


# 附录 A：原始源文档汇编（标题层级已下沉，正文保留）

> 说明：本附录将 48 份源文档全部收入同一文件。为避免源文档的一级标题冲掉本文主目录，原文标题层级统一下沉两级；代码块内内容不改。


## [S01] 当前正式基线文档清单 v1.2（修正版，完整最终版）

- 文件名：`当前正式基线文档清单_v1_2_修正版.md`
- 状态：A类正式基线
- 类别：版本/来源治理
- 用途：当前唯一正式基线索引；定义 A/B 类与 Codex 直接使用规则
- SHA-256 前 16 位：`4bf3c6ecc221565e`

---

### 当前正式基线文档清单 v1.2（修正版，完整最终版）

> 说明：
> 
> -   本文档是当前唯一正式基线索引。
>     
> -   后续实现、审查、联动增补，都必须优先引用本清单中的 A 类文件。
>     
> -   linked / additive / review / draft 文件不得再直接当作正式基线。
>     
> -   本修正版的唯一目标是：
>     
> 
> # **把 A 类正式基线文件全部收口为当前真实存在的文件名**
> 
> # **移除悬空引用**
> 
> # **让 Codex 能直接按本清单开工**

---

### 一、A 类：当前正式基线文件

#### 1. 宪法与总裁决

1.  `开发前阻断问题一次性收口裁决_v1.md`
2.  `当前正式基线文档清单_v1_2_修正版.md`
3.  `当前全部文档最高规格联动一致性总审查报告.md`
4.  `新增属级养护基线联动后文档体系最高规格一致性总审查报告_重新生成版.md`

---

#### 2. AI 视觉入口层

5.  `ai_visual_entry_data_structure_and_retention_spec_v1_4_full_consolidated.md`

---

#### 3. 诊断主链

6.  `diagnosis_hard_constraints_v2_4_20260404_121000.md`
7.  `diagnosis_outcome_layer_v1_2_full_final.md`
8.  `problem_taxonomy_v1_4_full_final.md`
9.  `核心数据结构_v1_6_完整最终版_标题版本已统一.md`
10.  `运行时模型_v1_5_完整最终版_标题版本已统一.md`
11.  `决策流_v1_4_完整最终版_标题版本已统一.md`
12.  `统一术语表_v1_4_完整最终版_标题版本已统一.md`
13.  `最小可用知识库_v1_3_完整最终版_标题版本已统一.md`
14.  `准入与退役规则_v1_3_完整最终版_标题版本已统一.md`
15.  `收益驱动停止策略_v1.md`

---

#### 4. Taxonomy 与桥接

16.  `植物_Taxonomy_体系定义_v1_3_完整最终版_开发收口版.md`
17.  `plant_identity_master_and_name_normalization_rules_v1.md`
18.  `taxonomy_diagnosis_linkage_rules_v1.md`
19.  `Taxonomy_Diagnosis_SQL_字段映射表_v1_1_完整最终版_标题版本已统一.md`

---

#### 5. SQL / 流程 / 开发

20.  `最终_SQL_制表方案_v1_3_完整最终版_开发收口版.md`
21.  `第一版_SQL_表结构草案_v1_1_开发收口版.md`
22.  `第一版_数据映射_导入脚本方案_v1.md`
23.  `绿植诊断系统完整流程图_终极版_中文主导_v1_1_开发收口版.svg`
24.  `绿植诊断系统完整流程图说明_终极版_中文主导_v1_1_开发收口版.md`

---

#### 6. 属级养护基线

25.  `属级养护基线表设计_v1_1_full_reviewed_final_标题版本已统一.md`
26.  `属级养护基线概念联动分析与文档增补建议_v1_重新生成版.md`
27.  `genus_care_profile_review_report.md`

---

### 二、B 类：中间过程文件（不得当正式基线）

以下文件只允许用于历史追溯、内容来源、审查说明，不得直接作为实现基线：

-   所有 linked / additive / aligned / review / draft 文件
-   所有仅作历史追溯的旧版文件
-   所有已被“开发收口版”或“标题版本已统一”文件覆盖的旧文件

##### 说明

如果某文件不在 A 类清单中，即使内容看起来更新，也不得直接作为 Codex 的实现依据。

---

### 三、Codex 的直接使用规则

#### 3.1 必看

Codex 开发至少应优先查看以下文件：

1.  `开发前阻断问题一次性收口裁决_v1.md`
2.  `当前正式基线文档清单_v1_2_修正版.md`
3.  `最终_SQL_制表方案_v1_3_完整最终版_开发收口版.md`
4.  `第一版_SQL_表结构草案_v1_1_开发收口版.md`
5.  `第一版_数据映射_导入脚本方案_v1.md`
6.  `绿植诊断系统完整流程图_终极版_中文主导_v1_1_开发收口版.svg`
7.  `收益驱动停止策略_v1.md`

#### 3.2 必要时补充查看

-   `植物_Taxonomy_体系定义_v1_3_完整最终版_开发收口版.md`
-   `plant_identity_master_and_name_normalization_rules_v1.md`
-   `taxonomy_diagnosis_linkage_rules_v1.md`
-   `ai_visual_entry_data_structure_and_retention_spec_v1_4_full_consolidated.md`

#### 3.3 禁止

-   不得再直接引用 linked / additive / draft 文件
-   不得把历史 review 报告当作实现基线
-   不得把未列入 A 类清单的文件当正式基线

---

### 四、一句话规则

### **Codex 开发只看 A 类文件。**

### **B 类文件不得再作为实现基线。**

### **本修正版之后，正式基线清单应视为当前唯一可信入口。**



## [S02] 开发前阻断问题一次性收口裁决 v1（完整最终版）

- 文件名：`开发前阻断问题一次性收口裁决_v1.md`
- 状态：A类正式基线
- 类别：版本/来源治理
- 用途：开发前阻断项一次性裁决；非阻断项降级
- SHA-256 前 16 位：`39b8429d83bf32cd`

---

### 开发前阻断问题一次性收口裁决 v1（完整最终版）

> 目标：
>
> - 只处理当前**真正阻断 Codex 开工**的问题
> - 不再继续扩概念树
> - 不再继续新增大批文档
> - 以“一人维护可控”为最高现实约束
>
> 当前裁决仅覆盖：
>
> 1. 正式基线文件收口
> 2. Taxonomy 静态 / 运行时状态边界
> 3. 属级养护基线第一阶段挂接键
> 4. route hint 与事实层落位顺序
> 5. 运行时对象最小持久化策略
> 6. 视觉调用批次主记录方案
> 7. AI 入口新增治理字段正式冻结
> 8. `taxonomy_match_status` 与 `identity_resolution_status` 边界
> 9. `hold_for_review` 枚举处理

---

### 一、总裁决

### **这次只修真正阻断开发的点。**
### **修完后，Codex 可直接进入开发阶段。**
### **其余非阻断项全部降级，不再阻塞第一版开发。**

---

### 二、正式裁决

#### 2.1 正式基线文件
以《当前正式基线文档清单 v1.2》为唯一正式引用入口。  
今后不得再直接把 linked / additive / draft 文件当作正式基线。

---

#### 2.2 Taxonomy 静态对象不得承载会话态身份状态
正式裁决：

### **`identity_resolution_status` 不属于 Taxonomy 静态主数据字段。**
### **它只属于运行时身份解析记录。**

Taxonomy 静态主数据只承载：
- identity 主对象
- 命名归一
- 分类路径
- 宿主背景
- 属级养护基线

不承载：
- matched / weak_matched / unresolved 这类会话态裁定结果

---

#### 2.3 属级养护基线第一阶段挂接键
正式裁决：

### **第一阶段正式挂接键 = `genus_name + family_name_canonical`**

##### 说明
- `family_name_canonical` 为第一阶段正式归一科名字段
- 展示层仍可保留：
  - `family_name_cn`
  - `family_name_en`
- 但业务 join key 不再模糊使用 `family_name_cn / family_name_en / family_name`

##### 原因
- 继续模糊会导致 Codex 临时拍板
- 第一阶段必须有唯一、稳定、明确的 join key

---

#### 2.4 route hint 与事实层落位顺序
正式裁决：

### **只要条目已经 `formally_admitted`，就先进入 `observed_evidence_set`。**
### **route hint 只改变后续流程优先级，不改变事实层先落位。**

这意味着：
- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

都不能绕过：
- 正式证据集合的建立

---

#### 2.5 运行时对象最小持久化策略
当前只做最小裁决，不再展开复杂哲学。

##### 必须持久化到 SQL
- `plant_identity_resolution_record`
- `visual_call_batch`
- `visual_raw_image_record`
- `visual_normalized_image_result`
- `visual_admission_record`
- `visual_call_aggregate_result`（建议）
- `visual_supervision_record`（建议）

##### 默认不强制持久化到 SQL，可先放内存 / cache / trace
- `normalized_input`
- `observed_evidence_set`
- `hypothesis_pool`
- `outcome_pool`
- `question_queue`
- `stop_state`
- `diagnostic_trace`

##### 说明
第一版以“能跑通 dev 链路”为目标。  
不强行把全部运行时对象都建成 SQL 表。

---

#### 2.6 视觉调用批次主记录方案
正式裁决：

### **第一版必须新增 `visual_call_batches` 主记录表。**

##### 原因
- `visual_call_batch_id` 已经被定义成正式对象标识
- 只有 ID 没主记录，会让批次级上下文断裂

##### 第一版最小字段
- `visual_call_batch_id`
- `session_id`
- `trigger_source`
- `round_id`
- `batch_status`
- `image_count`
- `created_at`
- `updated_at`

---

#### 2.7 AI 入口新增治理字段正式冻结
第一版正式冻结到 SQL / 代码基线中的关键字段包括：

##### `visual_normalized_image_results`
- `route_primary_action`
- `top1_stability_score`
- `top3_stability_score`
- `long_tail_noise_flag`
- `pattern_derivation_status`

##### `plant_identity_resolution_records`
- `taxonomy_match_status`
- `identity_resolution_status`
- `is_current_primary_identity`
- `superseded_by_resolution_id`
- `superseded_reason`
- `superseded_at`

##### `visual_supervision_records`
- `question_correction_scope`

这些字段不再只停留在草案思路里，  
而是正式进入第一版可编码基线。

---

#### 2.8 `taxonomy_match_status` 与 `identity_resolution_status` 的边界
正式裁决：

##### `taxonomy_match_status`
只表达：

### **某条原始识别名对 taxonomy 的命中结果**

典型值：
- `matched`
- `weak_matched`
- `unresolved`

##### `identity_resolution_status`
表达：

### **该解析记录在进入当前会话身份裁定后的最终状态**

例如：
- 是否成为当前主身份结果
- 是否被后续更优结果覆盖
- 是否仍只停留在弱候选层

##### 结论
二者不再视为同义字段。

---

#### 2.9 `hold_for_review` 枚举处理
正式裁决：

### **第一版删除 `hold_for_review`。**

##### 原因
- 当前系统没有人工审核状态机
- 一人维护阶段不应引入额外人工流程复杂度
- 它当前没有流程出口，保留只会污染状态机

##### 第一版 route_primary_action 正式枚举
- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

---

### 三、哪些问题这次不再阻塞开发

以下内容暂不阻塞第一版开发：

- 更完整的运行时持久化哲学
- species / identity / variant 级养护覆盖详细方案
- 更复杂的治理 UI / 审查面板
- 更完整的测试矩阵文档
- 更复杂的 draft 清理工程

它们全部降级为：
### **开发后续迭代项**

---

### 四、执行顺序

本裁决之后，只需要同步修这几份核心基线文件：

1. 《当前正式基线文档清单 v1.2》
2. 《植物 Taxonomy 体系定义 v1.3》
3. 《最终 SQL 制表方案 v1.3》
4. 《第一版 SQL 表结构草案 v1.1》
5. 《绿植诊断系统完整流程图（终极版，中文主导）v1.1》

修完后即可进入：
### **Codex 开发阶段**

---

### 五、一句话总裁决

**这次收口后，第一版开发不再被“概念未定”阻塞。Codex 可以直接按收口后的正式基线开始写代码。**



## [S03] AI 诊断系统总规范入口文档（重构规范 + 最小交互协议）

- 文件名：`AI_DIAGNOSIS_MASTER_SPEC_v2.md`
- 状态：非A类/补充或过程文件
- 类别：总入口/Codex
- 用途：系统重构总规范；前端/后端唯一入口、评分公式、目录建议
- SHA-256 前 16 位：`7d701cc0d4cc05a7`

---

### AI 诊断系统总规范入口文档（重构规范 + 最小交互协议）

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

### 第一部分：重构规范（系统结构、算法、目录映射）

### AI 诊断系统重构规范文档（面向 Codex 落地）

#### 0. 文档目的

本规范文档用于约束当前项目中“植物诊断”能力的最终落地方式，目标是：

1. 把前端诊断入口**强制收敛为唯一入口**：`src/components/DiagnosePopup.vue`
2. 把当前旧诊断体系升级为**以新数据体系为准**的新诊断体系
3. 把“诊断流程、字段映射、评分算法、问诊系统、结果解释层”明确写成可执行规范
4. 明确**功能 => 目录 / 文件** 的映射，避免 Codex 把逻辑写散
5. 方便后续 review：凡不符合本规范的实现，视为偏航

---

#### 1. 当前项目结构理解（与诊断直接相关）

##### 1.1 前端主入口与显示层

- `src/components/DiagnosePopup.vue`
- `src/components/AIStreamDialog.vue`

结论：

- **诊断主入口强制定义为** `DiagnosePopup.vue`
- `AIStreamDialog.vue` 只负责流式状态展示，不承载诊断算法

##### 1.2 页面层

- `src/pages/diagnose/diagnose.vue`

结论：

- 此页面**不得继续作为主诊断入口**
- 允许存在，但只能承担：
  - 历史记录详情页
  - 诊断结果承接页
  - 从 `DiagnosePopup` 跳转后的只读页
- 禁止在这里重新实现新的诊断主流程

##### 1.3 前端 API 门面层

- `src/api/plants-http.js`

结论：

- 作为前端统一诊断 API 门面
- 前端组件不得直接拼装复杂诊断算法，只能通过此层访问后端

##### 1.4 前端适配层

- `src/utils/diagnose-flow.js`

结论：

- 当前文件定位为**前端结果适配层**
- 只允许放：
  - 结果归一化
  - follow-up payload 构造
  - UI 展示辅助
- 禁止把完整评分引擎继续堆进这里

##### 1.5 后端云函数层

- `cloudfunctions/identify-http/app.js`
- `cloudfunctions/diagnose-http/app.js`
- `cloudfunctions/diagnosis-history-http/app.js`

结论：

- `identify-http`：识别、视觉症状提取、首轮 AI 分析
- `diagnose-http`：**唯一诊断决策中心**
- `diagnosis-history-http`：历史记录读写

##### 1.6 旧知识层

- `knowledges/diagnose-rules/index.js`
- `HOW_AI_RESULT_MAPPING_SQL.md`
- `knowledges/*.md`

结论：

- 旧规则体系仍存在
- 但新系统必须以**新数据体系**为准
- 旧体系只允许做兼容适配，不再作为最终规则真源

---

#### 2. 最终架构总原则

##### 2.1 唯一前端诊断入口

前端诊断入口**强制唯一**：

```text
src/components/DiagnosePopup.vue
```

禁止：

- 再在其他 page / component 中复制一套首轮诊断 + follow-up + 重算逻辑
- 再在 `pages/diagnose/diagnose.vue` 中独立维护另一套主流程

##### 2.2 唯一后端诊断决策中心

后端唯一诊断中心：

```text
cloudfunctions/diagnose-http/
```

禁止：

- 在 `identify-http` 中做最终诊断排序
- 在前端 `diagnose-flow.js` 中重写评分引擎
- 在 `knowledges/diagnose-rules/index.js` 中继续堆最终诊断主逻辑

##### 2.3 新体系为准

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

#### 3. 新体系的运行时分层

---

#### 3.1 症状模式层（新增正式层）

> 正式术语：`symptom_class`  
> 中文名：**症状模式**

##### 3.1.1 为什么必须新增这一层

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

##### 3.1.2 symptom_class 的职责

`symptom_class` 不等于 `symptom_type`。

###### `symptom_type`
表示证据来源属性，例如：
- visual
- diagnostic
- environmental

###### `symptom_class`
表示：

```text
当某个 symptom 出现后，
系统后续应该进入哪一种诊断模式 / 问诊模式
```

也就是：

- 它是 visual symptom 与 follow-up 之间的中间桥梁
- 它负责先收窄“问诊方向”
- 再由 problem ranking 和 question selector 做精排

##### 3.1.3 建议的首批 symptom_class

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

##### 3.1.4 与 symptom 的关系

每个 symptom 至少应有一个主 `symptom_class`，必要时允许有次级映射。

推荐新增结构之一：

###### 方案 A：新增表（推荐）
- `symptom_classes`
- `symptom_class_mapping`

###### 方案 B：先在 `symptoms` 中补字段（过渡方案）
- `primary_class_key`
- `secondary_class_key`

但最终推荐还是走独立映射表，避免后期扩展受限。

##### 3.1.5 对 follow-up 的强约束

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

##### 3.1.6 与去重规则的关系

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

##### 3.1.6.1 视觉事实到问诊的分流边界

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

##### 3.1.7 黄叶类的特别规则

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

##### 3.1.8 收益驱动停止策略

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

##### 3.1.9 对算法的影响

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

##### 3.1.10 对目录/文件的落地要求

建议新增：

- `cloudfunctions/diagnose-http/domain/symptom-classifier.js`
- `cloudfunctions/diagnose-http/repositories/symptom-class-repository.js`

职责：

###### `symptom-classifier.js`
- 将 visual symptom 映射到 `symptom_class`
- 输出主模式与备选模式

###### `symptom-class-repository.js`
- 读取 `symptom_classes`
- 读取 `symptom_class_mapping`
- 向 question selector / diagnosis-engine 输出标准结构

##### 3.1.11 最终硬约束

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


##### 3.1 信号字典层

表：

- `symptoms`

职责：

- 定义 symptom_key
- 定义 symptom_type
- 定义 signal_reliability
- 提供用户可读文本与观察提示

##### 3.2 主证据边层

表：

- `symptom_problem_evidence`

职责：

- 定义 `symptom -> problem` 的证据边
- 提供 `association_strength`
- 提供 `edge_reliability`

##### 3.3 属级先验层

表：

- `genus_problem_profiles`

职责：

- 定义 `genus -> problem` 的先验概率/兼容度
- 提供 `genus_compatibility`

##### 3.4 宿主约束层

表：

- `problem_host_profiles`
- `plant_problem_profiles`

职责：

- 对 problem 做 genus / family / category 层的合理性修正
- `plant_problem_profiles` 是物化缓存，不是知识真源

##### 3.5 问诊层

表：

- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`

职责：

- 根据首轮 top problems 动态选题
- 把答案转为 diagnostic symptoms / negative evidence
- 继续参与二轮评分

##### 3.6 因果增强层

表：

- `problem_causality`

职责：

- 只做第二阶段增强和解释
- 不参与首轮主排序

##### 3.7 结果解释层

表：

- `diagnosis_result_explanations`
- `problems` 中的用户层字段

职责：

- 输出用户最终看到的“为什么、怎么办、下一步看什么”

---

#### 4. 最终诊断流程

##### 4.1 首轮流程

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

##### 4.2 二轮流程（问诊）

```text
用户在 DiagnosePopup 中回答 follow-up
→ 前端构造 followUpAnswers payload
→ diagnose-http 二轮计算
→ 返回：
   - 更新后的 rankings
   - final explanation
   - causality chain
```

##### 4.3 历史记录流程

```text
diagnose-http 成功后
→ diagnosis-history-http 持久化
→ pages/diagnose 或 plant-detail 只读展示
```

---

#### 5. 最终评分算法

#### 5.1 输入

##### 视觉症状输入

```json
[
  { "symptomKey": "leaf_yellowing", "confidence": 0.88 },
  { "symptomKey": "fine_webbing", "confidence": 0.79 }
]
```

##### 问诊输入

```json
[
  { "questionKey": "q_spider_webbing_visible", "optionKey": "yes" },
  { "questionKey": "q_root_rot_smell", "optionKey": "no" }
]
```

##### 植物上下文输入

```json
{
  "plantId": "...",
  "genus": "...",
  "family": "...",
  "category": "..."
}
```

---

#### 5.2 视觉证据分

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

#### 5.3 问诊证据分

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

#### 5.4 总证据分

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

#### 5.5 属级先验修正

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

#### 5.6 宿主合理性修正

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

#### 5.7 负证据扣分

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

#### 5.8 因果增强

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

#### 5.9 最终总分

```text
FinalScore(p)
=
HostAdjustedScore(p)
- PenaltyScore(p)
+ CausalityBoost(p)
```

---

#### 5.10 最终排序规则

##### 能竞争最终 top1 的 problem_role

允许：

- `root_cause`
- `secondary_issue`（若未来新增）

##### 不能直接作为 top1 的 problem_role

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

#### 6. 功能 => 目录 / 文件 映射（硬约束）

##### 6.1 前端入口与 UI

###### `src/components/DiagnosePopup.vue`
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

###### `src/components/AIStreamDialog.vue`
负责：

- 流式文本展示
- 进度/状态 UI
- 错误提示

禁止：

- 承载诊断业务逻辑

###### `src/pages/diagnose/diagnose.vue`
负责：

- 结果页承接
- 历史记录回看
- 只读详情展示

禁止：

- 成为新的主诊断入口
- 再实现一套 follow-up 主流程

---

##### 6.2 前端 API 门面层

###### `src/api/plants-http.js`
负责：

- `identifyPlantByImage`
- `computeDiagnosisDecision`
- `fetchDiagnosisHistory`
- `fetchDiagnosisDetail`

要求：

- 所有诊断调用统一经过这里
- 只做网络门面，不做评分逻辑

---

##### 6.3 前端适配层

###### `src/utils/diagnose-flow.js`
负责：

- 结果 normalize
- follow-up payload 构造
- 结果显示辅助
- 因果链展示格式化

禁止：

- 实现真正评分引擎
- 实现新旧规则兼容逻辑主流程

---

##### 6.4 后端诊断中心

###### `cloudfunctions/identify-http/app.js`
负责：

- 图片识别
- AI 视觉 symptom 提取
- 首轮 observedSymptoms 构建
- 返回给 diagnose-http 使用的结构化症状

禁止：

- 做最终排序
- 直接输出最终 diagnosis 排名作为唯一真相

###### `cloudfunctions/diagnose-http/app.js`
负责：

- 读取新体系数据
- 计算首轮分数
- 生成 follow-ups
- 计算二轮分数
- 融合 genus/host/question/causality
- 过滤 problem_role
- 生成 explanation payload

这是**唯一诊断决策中心**。

###### `cloudfunctions/diagnosis-history-http/app.js`
负责：

- 持久化诊断结果
- 查询历史记录
- 查询单次诊断详情

禁止：

- 重算诊断
- 在这里引入评分逻辑

---

##### 6.5 新诊断规则/数据访问层（建议新增）

建议新增目录：

```text
cloudfunctions/diagnose-http/domain/
cloudfunctions/diagnose-http/repositories/
cloudfunctions/diagnose-http/services/
cloudfunctions/diagnose-http/mappers/
cloudfunctions/diagnose-http/constants/
```

推荐映射如下：

###### `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
负责：

- 评分主引擎
- 首轮/二轮总流程 orchestrator

###### `cloudfunctions/diagnose-http/domain/evidence-scoring.js`
负责：

- visual evidence score
- question evidence score
- penalty score

###### `cloudfunctions/diagnose-http/domain/prior-scorers.js`
负责：

- genus factor
- host factor

###### `cloudfunctions/diagnose-http/domain/causality-scorer.js`
负责：

- causality boost

###### `cloudfunctions/diagnose-http/domain/question-selector.js`
负责：

- 根据 top problems 选 follow-up
- unknown 分组切换逻辑
- observability / priority 融合

###### `cloudfunctions/diagnose-http/domain/result-formatter.js`
负责：

- 最终输出结构组装
- result explanation 映射
- role-based filtering

---

##### 6.6 数据访问层

###### `cloudfunctions/diagnose-http/repositories/problem-repository.js`
读取：

- `problems`
- `diagnosis_result_explanations`

###### `cloudfunctions/diagnose-http/repositories/symptom-repository.js`
读取：

- `symptoms`
- `symptom_problem_evidence`

###### `cloudfunctions/diagnose-http/repositories/prior-repository.js`
读取：

- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`

###### `cloudfunctions/diagnose-http/repositories/question-repository.js`
读取：

- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`

###### `cloudfunctions/diagnose-http/repositories/causality-repository.js`
读取：

- `problem_causality`

---

##### 6.7 旧体系适配层（必须保留但不能喧宾夺主）

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

#### 7. 字段映射规范

##### 7.1 identify-http 输出到 diagnose-http 输入

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

##### 7.2 follow-up 提交结构

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

##### 7.3 diagnose-http 响应结构

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

#### 8. 旧体系适配原则

##### 8.1 旧体系允许存在，但必须被新体系消费

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

##### 8.2 新旧 key 兼容要求

若旧 key 与新 key 不一致，必须在 adapter 中统一：

- symptom key alias
- problem key alias
- question key alias（如需要）

禁止在业务代码中散落 `if oldKey then newKey`

---

#### 9. 结果解释层规范

最终面向用户展示时，优先使用：

- `problems.display_name_cn`
- `problems.user_definition_cn`
- `problems.user_action_cn`
- `problems.user_prevention_cn`
- `diagnosis_result_explanations.*`

##### 9.1 结果展示必须分层

###### 主结论
- 只能来自 `root_cause`

###### 促发因素
- 来自 `predisposing_factor`

###### 中间状态 / 表现
- 来自 `result_state`
- 来自 `aggregate_cluster`

###### 用户建议
- 使用 `first_aid_cn`
- 使用 `avoid_cn`
- 使用 `what_to_check_next_cn`

---

#### 10. Codex 落地边界

##### 10.1 允许 Codex 改动的区域

- `src/components/DiagnosePopup.vue`
- `src/api/plants-http.js`
- `src/utils/diagnose-flow.js`（仅适配层）
- `cloudfunctions/diagnose-http/**`
- `cloudfunctions/identify-http/**`
- `cloudfunctions/diagnosis-history-http/**`
- 新增 `domain/` `repositories/` `mappers/` `services/`

##### 10.2 不允许 Codex 直接改写为主引擎的区域

- `src/pages/diagnose/diagnose.vue`
- `knowledges/diagnose-rules/index.js`
- 任意新的零散 util 文件里再堆一套评分逻辑

##### 10.3 Codex 必须遵守的实现顺序

1. 确立 `DiagnosePopup` 为唯一前端入口
2. 在 `diagnose-http` 中建立新引擎骨架
3. 新建 repository 层对接新数据体系
4. 把旧规则通过 adapter 接入
5. 完成首轮评分
6. 完成 follow-up 选题与二轮评分
7. 完成 result explanation 输出
8. 再回到前端只做 UI/适配收口

---

#### 11. Review 检查清单

Review 时必须逐条检查：

##### 11.1 入口
- [ ] 是否只保留 `DiagnosePopup.vue` 作为前端主诊断入口
- [ ] `pages/diagnose` 是否只做只读/承接，不再承载主流程

##### 11.2 引擎位置
- [ ] 最终评分逻辑是否只在 `cloudfunctions/diagnose-http` 内
- [ ] 前端是否没有偷偷重写评分算法

##### 11.3 数据真源
- [ ] 是否以新体系表为准
- [ ] 旧规则是否只通过 adapter 被消费

##### 11.4 算法
- [ ] 是否用了 visual + question 双证据
- [ ] 是否用了 genus factor
- [ ] 是否用了 host factor
- [ ] `no` 是否进入 penalty
- [ ] causality 是否只做二阶段增强
- [ ] `problem_role` 是否参与最终排序过滤

##### 11.5 输出
- [ ] 用户结果页是否走 user-friendly 字段
- [ ] 解释层是否没有直接把 `aggregate_cluster` / `result_state` 作为 top1

---

#### 12. 给 Codex 的执行提示（可直接引用）

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

#### 13. 最终落地目标

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

#### 14. 新旧数据 diff 补齐与逻辑适配规范（新增硬性要求）

这一节为强制要求。  
如果 Codex 只完成“代码接新接口”，但**没有处理旧数据到新数据体系的 diff 补齐与兼容适配**，视为任务未完成。

##### 14.1 总原则

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

##### 14.2 哪些对象必须做 diff

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

##### 14.3 diff 的四种类型

每次迁移时，都必须把 diff 明确分成四类：

###### A. 缺失项（missing in old, present in new）
旧数据没有，新体系需要。

处理要求：

- **优先补齐**
- 如果能从旧数据推导，先推导
- 如果不能推导，按新体系定义生成空壳占位，但必须标记 `partial`
- 禁止因为旧数据里没有，就直接从新体系删掉

###### B. 多余项（present in old, not needed in new）
旧数据里有，但新体系不再需要或需要降级。

处理要求：

- 不要直接删库
- 先进入 `legacy adapter` 或归档层
- 确认不再被运行时消费后再决定是否物理删除

###### C. 字段不一致（shape mismatch）
例如：

- 旧字段名不同
- 旧值类型不同
- 旧枚举值不同
- 旧 key 命名不同

处理要求：

- 统一在 mapper / adapter 层消化
- 禁止在业务层散写映射分支

###### D. 语义不一致（semantic mismatch）
例如：

- 旧 `problem_key` 在旧体系里是根因，在新体系里应归类为 `aggregate_cluster`
- 旧 symptom 是泛化词，新体系要求拆成多个精准 symptom
- 旧 follow-up 题只有 yes/no，新体系要求 yes/no/unknown

处理要求：

- 必须做显式迁移规则
- 不能只做字段改名了事

---

##### 14.4 数据迁移的最终目标

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

##### 14.5 必须新增的迁移模块

建议强制新增以下文件：

###### `cloudfunctions/diagnose-http/mappers/legacy-rule-adapter.js`
职责：

- 旧规则到新规则中间格式映射
- 旧 symptom key / problem key alias 映射
- 旧 follow-up 结构到新 question system 的映射

###### `cloudfunctions/diagnose-http/mappers/data-diff-builder.js`
职责：

- 对比旧数据与新体系目标结构
- 输出 missing / extra / shape mismatch / semantic mismatch 报告

###### `cloudfunctions/diagnose-http/mappers/data-backfill-builder.js`
职责：

- 根据 diff 结果生成补齐数据
- 给无法完全审计的项打 `partial`
- 生成标准化 insert / upsert payload

###### `cloudfunctions/diagnose-http/constants/key-alias-map.js`
职责：

- 统一维护 old_key -> new_key 映射
- 禁止把 alias 映射散落在业务代码

---

##### 14.6 diff 补齐的优先顺序

Codex 必须按这个顺序补：

###### 第一优先级：主键空间闭环
先确保：

- 所有 `problem_key` 都能落到 `problems`
- 所有 `symptom_key` 都能落到 `symptoms`

否则后面算法一定断层。

###### 第二优先级：证据边闭环
确保：

- `symptom_problem_evidence` 覆盖所有运行时会被引用的 symptom / problem
- question 映射出来的 symptom 都能进入证据层

###### 第三优先级：先验层补齐
确保：

- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`

与主问题空间保持一致，且明确哪些只是 partial/物化缓存。

###### 第四优先级：问诊层补齐
确保：

- 旧 follow-up 题可以映射到新 `question_*` 体系
- 所有 boolean 题都支持 `unknown`
- 旧 yes/no 逻辑能适配新 `yes/no/unknown`

###### 第五优先级：解释层补齐
确保：

- 旧结果解释字段可以被映射到 `diagnosis_result_explanations` 和 `problems` 用户层字段

---

##### 14.7 unknown 选项的迁移适配要求

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

##### 14.8 数据库补齐策略（强制约束）

文档必须约束 Codex：

###### 如果数据库里旧数据不齐
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

##### 14.9 逻辑适配策略（强制约束）

逻辑适配必须分成三层：

###### A. key 适配
- old symptom key -> new symptom key
- old problem key -> new problem key
- old question key -> new question key

###### B. shape 适配
- 旧 identify 返回字段 -> 新 `observedSymptoms[]`
- 旧 follow-up 返回字段 -> 新 `followUps[]`
- 旧历史记录结构 -> 新结果详情结构

###### C. semantic 适配
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

##### 14.10 repository 层必须只消费新结构

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

##### 14.11 backfill 审计要求

对于所有通过 diff 自动补齐的项，必须保留：

- `data_status`
- `audit_note`
- `data_source`

规则：

- 能明确权威来源的，标 `audited`
- 只能根据旧逻辑推导但还没做逐项权威核验的，标 `partial`
- 禁止自动补齐后统一伪装成 `audited`

---

##### 14.12 Codex 执行要求（新增）

Codex 在重构时必须先产出以下中间结果，再进入主实现：

1. `data-diff report`
2. `key alias map`
3. `backfill plan`
4. `repository 输出结构定义`

没有这四项，不允许直接开始重写诊断引擎。

---

##### 14.13 Review 检查项（新增）

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

### 第二部分：最小交互协议（前后端边界、接口结构、最小暴露）

### AI 诊断系统最小交互接口协议（前后端）

#### 0. 目标

本协议用于约束当前植物诊断系统的前后端交互边界，原则是：

1. **前端只拿当前交互所必需的最小信息**
2. **完整规则、完整权重、完整因果图、完整问诊策略只保留在后端**
3. **前端诊断唯一入口为 `src/components/DiagnosePopup.vue`**
4. **后端诊断唯一决策中心为 `cloudfunctions/diagnose-http`**
5. **新数据体系是唯一真源**
6. **旧体系只允许通过 adapter 兼容，不允许直接主导运行时输出**

---

#### 1. 总体原则

##### 1.1 最小暴露原则

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

##### 1.2 双模型原则

后端必须维护两套模型：

###### A. 内部模型（Internal Model）
只在后端使用，包含：

- 真正的 `problem_key`
- 真正的 `symptom_key`
- 权重
- 证据边
- 因果关系
- question strategy
- role filter
- score breakdown

###### B. 外部模型（Public Response Model）
只返回给前端，包含：

- `diagnosisSessionId`
- `questionId`
- `optionId`
- `resultId`
- `problemId`
- 用户可读文案
- 简化后的状态字段

---

##### 1.3 外部 id 原则

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

#### 2. 会话模型

诊断过程必须是**会话制**，而不是一次性无状态提交。

##### 2.1 诊断会话对象

```json
{
  "diagnosisSessionId": "diag_s_001",
  "plantId": "plant_xxx",
  "stage": "preliminary",
  "round": 1,
  "status": "active"
}
```

##### 2.2 stage 枚举

- `preliminary`：刚完成首轮识别，可能需要追问
- `followup`：正在进行问诊
- `final`：已经形成最终诊断结果
- `closed`：本次诊断结束
- `failed`：诊断失败

##### 2.3 status 枚举

- `active`
- `expired`
- `closed`
- `error`

---

#### 3. 前后端接口清单

最小接口建议统一为 5 类：

1. `POST /diagnosis/start`
2. `POST /diagnosis/answer`
3. `GET /diagnosis/result`
4. `GET /diagnosis/history`
5. `POST /diagnosis/feedback`

---

#### 4. 接口 1：发起诊断

#### 4.1 Request

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

##### 字段说明

- `plantId`：植物实例 id
- `imageIds`：前端已上传到存储的图片资源 id
- `clientContext`：仅用于日志和兼容，不参与诊断核心算法

##### 前端禁止传入

- `problem_key`
- `symptom_key`
- `question_group_key`
- 各类权重参数
- 任何算法配置

---

#### 4.2 Response（需要继续问诊）

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

#### 4.3 Response（直接给最终结果）

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

#### 4.4 后端内部处理（不对前端暴露）

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

#### 5. 接口 2：提交问诊答案

#### 5.1 Request

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

##### 规则

- 前端只传 `questionId` / `optionId`
- 前端不允许传：
  - `symptom_key`
  - `value`
  - `association_strength`
  - `question_group_key`

这些映射都由后端完成。

---

#### 5.2 unknown 选项协议

`unknown` 是正式选项，不是缺省态。  
外部协议中必须存在：

```json
{
  "optionId": "opt_unknown",
  "text": "看不出/不确定"
}
```

##### 后端语义

- `unknown -> value = 0`
- 不加分
- 不减分
- 记录入会话状态

##### 连续 unknown 规则

后端必须记录：

- `unknownCountInGroup`
- `askedQuestionIds`
- `currentQuestionGroupId`

如果同一组连续 `unknown >= 2`：

- 当前组优先级下降
- question selector 自动切到下一组高价值问题

前端不需要知道切组逻辑。

---

#### 5.3 Response（继续问下一轮）

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

#### 5.4 Response（形成最终结果）

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

#### 6. 接口 3：获取最终结果详情

#### 6.1 Request

```http
GET /diagnosis/result?id=res_final_001
```

或：

```http
GET /diagnosis/result?sessionId=diag_s_001
```

---

#### 6.2 Response

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

##### 不应返回的字段

- score breakdown
- raw candidate list
- causality raw edges
- genus / host exact numeric factors
- full follow-up strategy tree

---

#### 7. 接口 4：历史记录

#### 7.1 Request

```http
GET /diagnosis/history?plantId=plant_xxx&page=1&pageSize=20
```

---

#### 7.2 Response

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

##### 历史列表最小原则

历史列表只返回摘要：

- 时间
- 主问题显示名
- 严重度
- resultId / historyId

不要把完整 explanation 和策略树都塞进列表接口。

---

#### 8. 接口 5：用户反馈

#### 8.1 Request

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

#### 8.2 Response

```json
{
  "ok": true
}
```

##### 用途

- 模型调优
- 规则校验
- 结果质量回溯

---

#### 9. 前端可见字段与后端保密字段边界

#### 9.1 前端允许看到的字段

##### 会话字段
- `diagnosisSessionId`
- `roundId`
- `stage`
- `status`

##### 题目字段
- `questionId`
- `type`
- `text`
- `helpText`
- `options[].optionId`
- `options[].text`

##### 结果字段
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

#### 9.2 后端内部保留字段

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

#### 10. 外部 id 与内部 key 映射要求

后端必须维护以下映射：

##### 10.1 problem 映射

```text
problem_key (internal)
→ problemId (external)
→ displayName (public)
```

##### 10.2 question 映射

```text
question_key (internal)
→ questionId (external)
→ text/helpText (public)
```

##### 10.3 option 映射

```text
option_key (internal)
→ optionId (external)
→ text (public)
```

##### 10.4 推荐实现

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

#### 11. 推荐的后端内部处理顺序

#### 11.1 `/diagnosis/start`

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

#### 11.2 `/diagnosis/answer`

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

#### 12. 结果解释层最小输出规则

结果解释必须做裁剪，只返回用户级解释。

##### 12.1 允许返回

- 为什么更像这个方向
- 还建议检查什么
- 先做什么
- 不要做什么

##### 12.2 不允许返回

- “因为 `association_strength = 0.92`”
- “因为 genus factor = 0.84”
- “因为 causality relation_type = predisposes”
- “因为 top2 是 iron_deficiency 但被 penalty 压下去了”

所有内部推理细节都不能直吐前端。

---

#### 13. role 过滤规则

后端在生成最终 `finalResult` 时必须过滤 `problem_role`：

##### 可以作为主结论
- `root_cause`
- `secondary_issue`（若未来新增）

##### 不可直接作为主结论
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

#### 14. DiagnosePopup 前端职责边界

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

#### 15. 推荐前端 API 门面

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

#### 16. 安全与商业机密保护建议

##### 16.1 最低要求
- 不暴露完整规则表
- 不暴露完整 question strategy
- 不暴露 score breakdown
- 不暴露内部 key

##### 16.2 更高要求（可选）
- `questionId` / `optionId` 做 session 级临时 id
- `diagnosisSessionId` 设置过期时间
- 当前轮题目与上一轮题目做签名校验
- 防止前端伪造任意 `questionId` / `optionId`

##### 16.3 推荐折中
项目当前阶段建议使用：

- 稳定的外部 id
- 后端 session 校验
- 后端 question ownership 校验
- 后端 stage 校验

先保证安全边界和开发效率平衡。

---

#### 17. 给 Codex 的接口实现约束（可直接引用）

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

#### 18. 最终目标

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

### 第三部分：本项目执行优先级（最终收口版）

#### P0：唯一入口与唯一评分中心

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

#### P1：新体系真源与旧体系适配

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

#### P2：数据库 / 运行时数据补齐

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

#### P3：评分引擎与问诊系统

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

#### P4：最小前后端交互

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

#### P5：用户体验与结果展示

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

### 第四部分：Codex 实施顺序建议（任务拆解）

#### Step 1
锁死入口与边界：

- DiagnosePopup 为唯一主入口
- diagnose-http 为唯一评分中心
- pages/diagnose 降级为承接/只读

#### Step 2
建立新诊断目录骨架：

- `domain/`
- `repositories/`
- `mappers/`
- `services/`
- `constants/`

#### Step 3
完成数据侧准备：

- data diff
- key alias
- backfill builder
- repository 新结构输出

#### Step 4
完成首轮诊断引擎：

- visual evidence scoring
- genus / host 修正
- preliminary result

#### Step 5
完成问诊引擎：

- question selector
- unknown flow
- question answer mapping
- second-round scoring

#### Step 6
完成结果解释层：

- role filter
- explanation formatter
- public response mapper

#### Step 7
完成最小协议接线：

- `/diagnosis/start`
- `/diagnosis/answer`
- `/diagnosis/result`
- `/diagnosis/history`
- `/diagnosis/feedback`

#### Step 8
最后再做前端 UI 收口与历史页对接

---

### 第五部分：最终 Review 主清单

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

### 第六部分：一句话执行原则

```text
入口唯一、评分中心唯一、新体系为准、旧体系适配、先补数据再改引擎、前端拿最少、后端保留全部。
```



## [S04] AI Diagnosis Codex 极简执行摘要

- 文件名：`AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md`
- 状态：非A类/补充或过程文件
- 类别：总入口/Codex
- 用途：给 Codex 的极简执行摘要；锁定唯一入口、真源、symptom_class 与迁移顺序
- SHA-256 前 16 位：`48661bf05ef0c23c`

---

### AI Diagnosis Codex 极简执行摘要

> 只给 Codex 读这一份。  
> 目标：用最少阅读量，锁死诊断系统改造边界，避免跑偏。

---

#### 1. 唯一入口 / 唯一中心

##### 前端唯一诊断入口
```text
src/components/DiagnosePopup.vue
```

##### 后端唯一诊断决策中心
```text
cloudfunctions/diagnose-http
```

##### 禁止
- `pages/diagnose/diagnose.vue` 再长出一套主诊断流程
- 前端 `utils` 或 `components` 内重写评分引擎
- `identify-http` 输出最终排序结论

---

#### 2. 新体系是唯一真源

运行时必须以新体系为准：

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

##### 旧体系处理原则
旧体系只能通过 adapter 兼容。  
禁止旧规则继续主导最终诊断。

---


#### 2.1 新增：symptom_class（症状模式）层

AI visual symptom 不得直接跳到 problem / question。  
必须先经过：

```text
AI visual symptom
→ symptom_class
→ class-gated candidate problems
→ class-gated question groups
→ fine-grained ranking
```

##### 最少要求
- 新增 `symptom_class` / `症状模式` 概念
- question selector 必须先按 class 收敛，再按 problem 精排
- 黄叶类必须单独走 `yellowing_mode`
- follow-up 不能跨 class 发散乱问


#### 3. 先做 diff，再改引擎

改代码前，必须先完成：

1. `data-diff report`
2. `key alias map`
3. `backfill plan`
4. `repository 输出结构定义`

##### 迁移顺序
```text
旧数据
→ diff
→ backfill / upsert
→ repository 对上统一输出新结构
→ 再切换新引擎
```

禁止因为旧数据不齐，就删新逻辑或让前端兜底。

---

#### 4. 推荐新增目录

在 `cloudfunctions/diagnose-http/` 下新增：

```text
domain/
repositories/
mappers/
services/
constants/
```

##### 最少需要这些文件

- `domain/diagnosis-engine.js`
- `domain/evidence-scoring.js`
- `domain/prior-scorers.js`
- `domain/causality-scorer.js`
- `domain/question-selector.js`
- `domain/result-formatter.js`

- `repositories/problem-repository.js`
- `repositories/symptom-repository.js`
- `repositories/prior-repository.js`
- `repositories/question-repository.js`
- `repositories/causality-repository.js`

- `mappers/legacy-rule-adapter.js`
- `mappers/data-diff-builder.js`
- `mappers/data-backfill-builder.js`
- `mappers/public-id-mapper.js`

- `constants/key-alias-map.js`

---

#### 5. 最终评分公式

##### 视觉证据分
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

##### 问诊证据分
```text
EvidenceScore_question(p)
=
Σ [
  AnswerValue(q,a)
  × MappingStrength(q,a)
  × association_strength(mapped_symptom,p)
  × signal_reliability(mapped_symptom)
  × edge_reliability(mapped_symptom,p)
]
```

##### 总证据分
```text
TotalEvidenceScore(p)
=
EvidenceScore_visual(p)
+ 1.25 × EvidenceScore_question(p)
```

##### genus 修正
```text
GenusFactor(p) = 0.6 + 0.4 × genus_compatibility
```

##### host 修正
```text
HostFactor(p) = 0.8 + 0.2 × host_compatibility
```

##### penalty
- `no` 必须扣分
- `unknown` 不加分不减分

##### causality
- 只做二阶段增强
- 不参与首轮主排序

##### 最终总分
```text
FinalScore(p)
=
HostAdjustedScore(p)
- PenaltyScore(p)
+ CausalityBoost(p)
```

---

#### 6. question system 必须参与主链路

问诊不是外挂，必须进入总分。

##### 必须支持
- `yes`
- `no`
- `unknown`

##### 选项语义规则
- 视觉症状进入问诊题干时必须使用中性事实名，不得把尚未确认的成因写进症状名；例如 `holes_in_leaf` 应写成“叶片孔洞”，不得写成“叶子被咬出了洞”，除非已由直接虫害线索确认虫害路径。
- `yes` 必须表示对题干正向事实的确认，`no` 必须表示否定该事实；不得让 `yes` 表示题干的反向事实。
- 如果题干是“这些位置是否真的破洞/缺损”，则 `yes` 只能表示真实破洞/缺损存在，`no` 只能表示不存在真实破洞/缺损。
- 用户看到的选项文本、内部 `option_key`、`value`、`maps_to_symptom_key`、直接评分增减和 review 展示必须保持同一语义，不得分层取反。
- 生成问诊题时必须留存当时下发的选项文本快照，review 优先展示快照，避免后续映射调整导致历史答案被重新解释。

##### unknown 规则
- `value = 0`
- 不加分
- 不减分
- 同组连续 `unknown >= 2` 自动切组

##### follow-up 去重规则
如果 AI 已高置信识别某 visual symptom：

```text
区分题 > 排异题 > 上下文题 > 重复确认题
```

高置信 symptom 的同义重复题，不得排第一优先级。

##### 视觉事实到问诊的病因分流规则
- 正式视觉证据已经覆盖的事实维度，不得再作为首题复问；例如 `holes_in_leaf` 不再问“是否真的有洞”，`powder_white` 不再问“能否擦掉”，`black_spots_spreading` 不再问“是不是脏层”。
- 首题必须优先进入病因分流或上下文分流，而不是重新确认视觉事实。
- 结构损伤类 `holes_in_leaf / chewed_edges / skeletonized_leaves` 只表示组织缺损，不得默认等同虫害；首题应区分虫害活动痕迹、病斑干枯脱落、机械/旧伤或不确定。
- `tunnels_in_leaf` 应优先区分叶肉内部弯曲浅白隧道与表面划痕/旧伤/反光，不应混入普通咀嚼损伤确认题。
- 斑点类应优先问黄晕、水渍感、湿软/干硬、进展速度等病因分流线索，不应通过擦拭或脏层问题否定已进入 evidence 的视觉事实。
- 黄叶类是低特异事实，应先完成黄叶分流，再进入具体方向问题；一页一题模式下不再使用“最多 2 轮”作为停止条件。
- 问诊问题类别必须落表到 `question_role`，答案影响方式必须落表到 `effect_mode`；不得只在运行时临时判断 gate、增益题或上下文题。
- 黄叶分流 gate 未满足前，即使 ranking top1 分数和 gap 达标，也不得直接输出低光、日灼、缺水、过湿、缺铁、缺氮、综合缺素或根区压力等具体 outcome。
- 所有 gate 类问题必须在题干开头说明提问目的，让用户知道为什么先做分流；不得像普通问诊题一样直接抛选项。
- 黄叶类第一层应先问“最明显线索” gate：养护/环境变化、虫子活动线索、斑点烂斑霉层线索、只有黄叶、不确定；不得让用户直接判断真菌、细菌、虫害或缺素。
- 黄叶第一层 gate 后再进入对应方向：养护方向先问带短标题和 description 的养护项 gate，再按答案问浇水频率、直射时长、施肥次数或通风湿度；虫害方向问可见虫痕；病害方向问黄晕、水渍感、霉层/粉层；只有黄叶或不确定时再回退到新老叶与分布模式。
- 养护类 gate 选项必须尽量结合 `genus_care_profiles` 的属级基线和新鲜天气湿度缓存形成具体范围；例如浇水选项 description 应展示“该属常见基线 + 湿度修正后的参考范围”，而不是只问“最近浇水是否有变化”。
- 黄叶等价维度必须去重；已回答 `watering_frequency_context` 后不得再问旧静态 `watering_context`，已回答 `light_change_context` 后不得再问旧静态 `light_exposure`。

##### 收益驱动停止策略

- 不恢复旧的“最多 2 轮”硬限制；一页一题后，每答一题都必须重算 `gate_required_layer / output eligibility / next question gain / stop_state`。
- 只有必答 gate 可以阻塞 final：模式入口 gate、输出资格 gate、top 与 runner-up 区分 gate、合法 uncertain gate、安全/动作边界 gate。
- 结论门槛已满足且无未完成必答 gate 时，只有下一题能补齐 context guard、改变 output eligibility、区分 top 与 runner-up，或触发合法 uncertain，才允许继续问。
- `progression / distribution_scope / host_confirmation / underside_presence`、无 `directProblemAdjustments`、只影响解释/严重程度/护理建议的问题，默认不得阻塞 final。
- edema / overwatering 已有正式形态正证据并满足输出资格时，不得继续被光照、分布、叶背、宿主确认等低增益题拖住；除非该题能补齐过湿相关 context guard、区分 runner-up、改变输出资格或触发合法 uncertain。

---

#### 7. 候选空间规则

首轮候选不能只来自 `plant_problem_profiles`。

必须来自：

```text
evidence 命中的 problem
∪ genus prior problem
∪ host prior problem
∪ 必要的 causal-linked problem（仅二阶段）
```

`plant_problem_profiles` 只能作为 prior cache，不是唯一白名单。

---

#### 8. problem_role 过滤规则

##### 允许作为最终 top1
- `root_cause`
- `secondary_issue`（若有）

##### 不允许直接作为 top1
- `result_state`
- `aggregate_cluster`
- `predisposing_factor`

##### 输出层拆分
- `finalResult`：只放 root cause
- `contributingFactors`：放 predisposing_factor
- `intermediateStates`：放 result_state / aggregate_cluster

---

#### 9. 最小前后端交互

前端只拿当前交互所需最小字段。

##### 必做接口
- `POST /diagnosis/start`
- `POST /diagnosis/answer`
- `GET /diagnosis/result`
- `GET /diagnosis/history`
- `POST /diagnosis/feedback`

##### 前端允许拿
- `diagnosisSessionId`
- `roundId`
- 当前 `questions`
- 当前 `options`
- 当前结果摘要
- 用户级 explanation
- 历史摘要

##### 前端禁止拿
- 完整规则表
- 完整 question strategy
- score 明细
- raw candidate list
- 内部 key / 权重 / 图谱

##### 协议原则
- 外部只暴露 `questionId / optionId / problemId / resultId`
- 内部 `problem_key / symptom_key / question_key` 不直接下发

---

#### 10. 会话与安全边界

##### `/diagnosis/answer` 必须校验
- `diagnosisSessionId` 有效
- `roundId` 匹配当前轮
- `questionId` 属于当前 session / 当前轮
- `optionId` 属于该 `questionId`

##### 禁止
- 旧轮答案重放
- 同一题重复累加得分
- 跨 session 提交题目

##### 植物上下文锁定
创建 session 后锁定：
- `plantId`
- `genus`
- `family`
- `category`

中途切植物必须新建 session。

---

#### 11. 补图规则

follow-up 阶段必须二选一：

##### 模式 A
禁止补图，只允许答题

##### 模式 B
允许补图，但必须：
- 重跑 identify
- 重建 visual symptoms
- 清空旧 follow-up 题组
- 重新开本轮诊断

禁止把：
```text
旧 visual + 新图 + 已答 follow-up
```
直接混算。

---

#### 12. 历史结果必须快照化

最终结果落库时，必须保存：

- final result
- contributing factors
- intermediate states
- explanation
- asked questions
- chosen answers
- version metadata

历史详情页只读快照，不重新跑引擎。

---

#### 13. 版本元数据必存

每次 final result 持久化时，至少保存：

- `diagnosis_engine_version`
- `data_bundle_version`
- `question_system_version`
- `result_explanation_version`
- `legacy_adapter_version`（若有）

---

#### 14. 前端职责边界

##### `DiagnosePopup.vue` 只负责
- 上传图片
- 调 start
- 展示题目
- 提交 `questionId + optionId`
- 展示结果

##### 禁止
- 自己算分
- 自己选题
- 自己做 symptom 映射
- 自己二次排序

---

#### 15. 实施顺序（Codex 按此执行）

##### Step 1
锁死入口与评分中心

##### Step 2
建立 `domain / repositories / mappers / services / constants`

##### Step 3
完成：
- data diff
- alias map
- backfill builder
- repository 新结构输出

##### Step 4
实现首轮评分：
- visual evidence
- genus / host 修正
- preliminary result

##### Step 5
实现问诊：
- question selector
- yes/no/unknown
- 去重规则
- 二轮评分

##### Step 6
实现结果解释与 role filter

##### Step 7
接好最小前后端协议接口

##### Step 8
最后再收口前端 UI 和历史页

---

#### 16. 最终 Review 只检查这些

- [ ] DiagnosePopup 是否唯一主入口
- [ ] diagnose-http 是否唯一评分中心
- [ ] 是否先做 diff/backfill 再切引擎
- [ ] repository 是否只向上暴露新结构
- [ ] 旧规则是否只通过 adapter 被消费
- [ ] visual/question/genus/host/penalty/causality 是否都纳入
- [ ] unknown 是否落地
- [ ] follow-up 去重规则是否落地
- [ ] candidate space 是否没被 plant_problem_profiles 截断
- [ ] role filter 时机是否正确
- [ ] 历史是否快照化
- [ ] 前端是否没拿到完整规则和分数细节

---

#### 17. 一句话执行原则

```text
入口唯一、评分中心唯一、新体系为准、先补数据再改引擎、问诊正式入链、前端拿最少、后端保留全部。
```



## [S05] 诊断系统硬约束清单 v2.4（完整最终版，基于可用前版只增不减）

- 文件名：`diagnosis_hard_constraints_v2_4_20260404_121000.md`
- 状态：A类正式基线
- 类别：宪法/硬约束
- 用途：诊断系统最高硬约束；证据-假设-结论主轴，P0/P1/P2 约束
- SHA-256 前 16 位：`16ad2fe0055d6e98`

---

### 诊断系统硬约束清单 v2.4（完整最终版，基于可用前版只增不减）

> 版本说明：
>
> - 本文件为**完整可交付的最终文件**，不是纯补丁。
> - 本文件完整保留基线文件正文，并在其后按“只增不减”原则追加后续有效增补内容。
> - 本文件的版本责任链为：
>   - v2.1：当前可用完整基线正文
>   - v2.3：诊断结论层深度 review 联动增补
>   - v2.4：AI视觉入口层 / Taxonomy / 身份主链路联动增补
>
> - 阅读顺序：
>   1. 先读本文件顶部版本说明
>   2. 再读“完整保留的基线正文”
>   3. 最后读后续新增附录
>
> - 说明：
>   - 为避免再次出现“只有补丁、没有完整正文”的问题，本文件采用“封面说明 + 基线正文原样保留 + 后续附录追加”的最终文件形态。
>   - 基线正文不删不改，后续版本内容只做新增。

---

### 【完整保留的基线正文开始】
### 诊断系统硬约束清单 v2.1（纳入诊断结论层修正版）

> 目标：作为后续《诊断目标分层 v1.2》《核心数据结构 v1.2》《运行时模型 v1》《决策流 v1》《准入与退役规则 v1》的最高约束文档。

---

### 0. 文档定位

本系统的最终定位不是：

- 症状系统
- 规则打分表
- AI 诊断流

而是：

**受严格约束治理的、基于证据、诊断假设与诊断结论收敛的诊断系统**

英文辅助名：

**Constraint-governed Evidence-Hypothesis-Outcome Diagnosis System**

其中：

- **受约束治理（constraint-governed）**：系统演化必须被明确规则约束，不能自由膨胀。
- **证据（evidence）**：所有可被诊断引擎消费的信息单位。
- **诊断假设（hypothesis）**：当前仍在竞争的候选诊断对象。
- **诊断结论（outcome）**：系统最终可对外输出的结果空间。
- **诊断（diagnosis）**：基于证据与诊断假设收敛得到的排序过程，而非伪概率输出。

#### 0.1 文档语言主权规则

- **中文是一等公民，是主定义语言。**
- 英文术语只能作为辅助键名、辅助索引、代码字段名、或兼容标记存在。
- 任何专业术语，必须先给出中文主名，再给出英文辅助名。
- 若两个英文术语在系统中语义不同，则中文主名也必须强制区分。

默认表达顺序统一为：

**中文主名（英文辅助名）**

例如：

- 诊断问题（problem）
- 诊断提问（diagnostic question）
- 诊断假设（hypothesis）
- 诊断结论（outcome）
- 证据目录（evidence catalog）

#### 0.2 约束分级

##### P0：架构硬约束
##### P1：数据治理硬约束
##### P2：产品与交互策略约束

---

### 1. P0：架构硬约束

#### P0-1. 系统主轴必须是证据（evidence）

- 所有输入必须先转成证据。
- 不允许任何模块绕过证据层直接修改诊断排序或诊断结论。
- 症状（symptom）只能作为证据的一个子类存在。
- 模式证据（pattern）只能作为派生证据存在，不能作为一级诊断目标。
- 只有会影响诊断排序、诊断提问选择、或诊断结论输出的信息，才允许进入证据层。

#### P0-2. 系统必须维护诊断假设（hypothesis）

- 每次诊断会话必须存在一组活跃诊断假设。
- 所有评分、追问、排除、收敛，必须围绕这组诊断假设进行。
- 不允许由单一 top1 症状直接驱动整条诊断流。

#### P0-3. 系统本质是诊断排序系统（diagnostic ranking system）

- 评分（score）只能表示相对支持强度。
- 置信表达（confidence）不能伪装成真实概率。
- 输出层禁止使用看似精确但无统计依据的百分比概率。

#### P0-4. 系统最终输出必须支持诊断结论层（outcome layer）

系统最终输出必须正式支持以下三类结果：

1. **问题性结论**
2. **非问题性结论**
3. **不确定结论**

禁止默认：

- “观察到异常 = 必有问题”
- “除少数特例外，其余全部归入问题性结论”

补充说明：

- 诊断问题（problem）只属于“问题性结论”空间的一部分。
- 诊断问题不是系统最终输出空间的全集。

#### P0-5. 必须先定义诊断目标分层（problem taxonomy）

- 先定诊断问题（problem），再定证据（evidence）。
- 不允许把不同粒度的诊断问题平铺在同一竞争层中。
- 不允许把症状描述伪装成诊断问题。
- 不允许把处理建议混入诊断问题定义。
- problem taxonomy 只定义“问题性诊断对象”。
- 非问题性结论与不确定结论不属于 problem taxonomy。

#### P0-6. 诊断问题（problem）必须是可行动的诊断对象

一个诊断问题只有在满足以下条件时才允许存在：

- 能被证据支持、削弱或排除。
- 能与其他诊断问题形成可区分关系。
- 对后续行动建议有实际意义。
- 不是纯描述性标签。

#### P0-7. 证据状态（evidence state）必须支持三态

- 已存在（present）
- 已确认不存在（absent_confirmed）
- 未知（unknown）

#### P0-8. 必须显式控制证据独立性（evidence independence）

- 父子证据关系必须可追溯。
- 派生证据不得与其父证据无约束叠加。
- 高相关证据必须定义独立性分组或冲突规则。

#### P0-9. 模式证据（pattern）只能作为派生证据（derived evidence）

- 模式证据不是一级诊断目标。
- 模式证据不是 AI 一级输出主轴。
- 模式证据只能由规则层从原始证据派生得到。

#### P0-10. 派生深度（derivation depth）默认只允许一层

- 数据层派生默认只允许：原始证据 → 派生证据。
- 不允许在通用规则层持续构建多层派生树。

#### P0-11. 证据到诊断问题规则（evidence → problem）必须显式区分作用类型

最低作用类型：

- 支持（support）
- 削弱 / 反驳（oppose）
- 排除（exclude）
- 门控条件（gate）

#### P0-12. 宿主先验（host prior）只能用于候选裁剪和轻偏置

- 宿主先验优先用于候选裁剪（candidate pruning）。
- 进入候选池后，只允许轻量加权。
- 不允许先验压倒高置信观察证据。

#### P0-13. 诊断（diagnosis）与行动策略（action policy）必须分层

- 不允许把动作建议硬编码进诊断问题定义中。
- 不允许由单条证据直接跳到动作建议，绕过诊断层。
- 行动策略必须同时支持：
  - 问题性结论
  - 非问题性结论
  - 不确定结论

---

### 2. P1：数据治理硬约束

#### P1-1. 每条证据（evidence）必须带完整语义字段

- 证据键（evidence_key）
- 证据类型（evidence_type）
- 来源类型（source_type）
- 证据角色（evidence_role）
- 可观察性（observability）
- 可靠性（reliability）
- 独立性分组（independence_group）

#### P1-2. 必须区分来源类型（source type），不得混算

最低来源类型建议：

- 图像识别证据（image_ai）
- 用户回答证据（user_answer）
- 规则派生证据（derived_rule）
- 植物先验证据（taxonomy_prior）

#### P1-3. 模式证据（pattern）必须稀缺且受配额约束

- 比单个原子证据更有诊断分流能力。
- 跨多个诊断问题具有区分价值。
- 不是父证据的简单同义改写。
- 具备复用性。

#### P1-4. 新增对象前，必须先证明不能复用旧对象

适用对象：

- 诊断问题（problem）
- 证据（evidence）
- 模式证据（pattern）
- 诊断提问（question）
- 诊断结论（outcome）

#### P1-5. 必须有准入政策（admission policy）

必须为以下对象分别定义准入规则：

- 诊断问题
- 证据
- 模式证据
- 诊断提问
- 诊断结论

#### P1-6. 必须有退役规则（retirement policy）

适用对象：

- 证据（evidence）
- 模式证据（pattern）
- 诊断提问（question）
- 诊断结论（outcome）
- 规则（rule）

#### P1-7. 解释性（explanation）必须至少达到“必要级”

必要级解释要求：

- 为什么当前 top1 / top2 排在前面。
- 哪些关键证据支持它们。
- 哪些关键证据缺失或削弱了竞争项。
- 为什么最终落入“问题性 / 非问题性 / 不确定”中的哪一类结论。

#### P1-8. 简化优先偏置（simplicity bias）必须作为元规则存在

默认优先：

- 更少的对象数量
- 更短的派生路径
- 更低的维护成本
- 更强的可解释性

#### P1-9. 系统必须优先做小而强系统（small high-value system）

- 先做高频诊断问题。
- 先做高价值证据。
- 先做高分流价值提问。
- 先做高价值非问题性结论。

---

### 3. P2：产品与交互策略约束

#### P2-1. 诊断提问只能服务于诊断假设分流

- 每个诊断提问都必须能回答：它要区分哪几个候选对象？
- 如果一个诊断提问不能显著影响当前假设排序，就不该问。
- 候选对象可同时包含问题性方向、非问题性方向、以及不确定保留方向。

#### P2-2. 每个诊断提问必须带完整评估字段

- 可观察性
- 回答可靠性
- 歧义等级
- 提问成本

#### P2-3. 不重复追问高置信、低歧义的视觉事实

但允许追问高诊断价值、低视觉稳定性的事实。

#### P2-4. 诊断提问路由目标必须是有效信息增益

- 区分能力
- 回答可靠性
- 可观察性
- 提问成本
- 用户疲劳

#### P2-5. 行动策略必须感知不确定性

必须支持：

##### 针对非问题性结论
- 无需处理
- 属正常特征
- 暂不建议按病害处理
- 仅观察

##### 针对不确定结论
- 补图
- 补问
- 继续观察
- 暂不建议过度处理

#### P2-6. 输出必须包含竞争关系解释

最终结果最少应包含：

- 前几候选对象（top candidates）
- 支持证据（supporting evidence）
- 削弱 / 缺失证据（opposing / missing evidence）
- 下一步最值得确认的点（next-best clarification）
- 当前为什么落入问题性 / 非问题性 / 不确定中的哪一类

---

### 4. 终局元规则

#### M-1. 中文是一等公民，英文仅为辅助标记

- 后续所有文档统一以中文为主定义语言。
- 任何专业术语，必须先给出中文主名，再给出英文辅助名。

#### M-2. 后续每一步必须沉淀为 Markdown 文档

建议后续文档顺序：

1. 硬约束清单 v2.1
2. 诊断结论层 v1
3. 诊断目标分层 v1.2
4. 核心数据结构 v1.2
5. 运行时模型 v1

---

### 5. 最终裁决

后续所有设计必须满足五个总原则：

- 证据优先（evidence first）
- 假设驱动（hypothesis driven）
- 约束治理（constraint governed）
- 感知不确定性（uncertainty aware）
- **支持完整结论空间（full outcome support）**


### 【完整保留的基线正文结束】
### 诊断系统硬约束清单 v2.3（联动增补版，基于 v2.2 只增不减）

> 说明：
>
> - 本文档基于《诊断系统硬约束清单 v2.2（增补修正版，基于 v2 只增不减）》继续增补。
> - 本次增补来源：**《诊断结论层 v1.1（review 增补修正版）》**
> - 目标：把 outcome layer 深度 review 后新增的关键边界，正式纳入系统级硬约束。

---

### 附录 B：诊断结论层 v1.1 联动增补（本次新增，不替换原文与附录 A）

#### B-1. 非问题性结论对象的准入边界

新增系统级硬规则：

### **非问题性结论对象，必须是可稳定对外表达、对用户有独立认知价值、且能承接动作策略的结果对象。**

因此，以下对象通常不应直接成为非问题性结论对象：

- 边界清晰
- 无扩展性
- 长期存在
- 单片叶受影响
- 某个碎片化的局部轻微色差

这些更适合作为：

- 证据
- 或非问题性结论的支持依据

补充说明：

- 不是所有“看起来不像问题”的内容，都有资格升格为 outcome 对象。
- outcome 层不得膨胀成第二个 evidence 层。

---

#### B-2. 非问题性结论不等于永远完全无需观察

新增系统级硬规则：

### **非问题性结论只表示当前不构成问题性诊断结论，不等于永远完全不需要后续观察。**

因此，action policy 必须允许以下合法输出：

- 无需处理
- 仅观察
- 条件性复查提示
- 若后续扩展则重新诊断

典型场景例如：

- 老叶自然退化
- 稳定斑锦 / 稳定花纹
- 非病理性旧伤痕

这些结果通常不应按问题性结论处理，但仍可携带轻量观察建议。

---

#### B-3. 不确定结论的合法触发条件

新增系统级硬规则：

### **不确定结论只有在满足“继续推理收益不足，或关键输入缺失无法补齐，或证据冲突无法在当前轮次解决”时，才允许作为正式收敛结果。**

最低合法触发类型包括：

##### B-3.1 输入不足型
- 图片太差
- 主体缺失
- 关键部位没拍到
- 非植物图像疑似
- 文本描述不足以支撑判断

##### B-3.2 证据冲突型
- 问题性方向与非问题性方向证据强冲突
- 当前轮次无法解除冲突
- 用户前后回答冲突，无法在当前会话内澄清

##### B-3.3 继续提问收益过低型
- 继续提问也无法显著提升结论质量
- 用户已中断
- 当前高价值信息已基本耗尽

补充说明：

- 不确定不是兜底垃圾桶
- 不确定不是“系统没设计好”的替代词
- 不确定不是默认安全垫

---

#### B-4. outcome layer 与 hypothesis layer 的主从关系

新增系统级硬规则：

### **上游是候选解释对象竞争，下游才是结论类型收敛。**

因此：

- hypothesis layer 是解释过程层
- outcome layer 是最终输出层

禁止：

- 直接绕过解释对象竞争，在 outcome 类型里拍脑袋做最终判断
- 把 outcome layer 视为 hypothesis layer 的镜像复制

---

#### B-5. 非问题性结论是一整类结果空间，不得收缩为少数特例集合

将此前提醒升级为正式系统级规则：

### **系统必须原生支持“非问题性结论”这一整类结果空间，不得把正常结论收缩为少数特例集合。**

至少应覆盖：

- 先天 / 稳定特征
- 生长阶段正常现象
- 非病理性旧痕
- 暂时可接受状态

补充说明：

- “艺斑”只是例子，不是唯一正常结论
- 正常结论空间必须是结构性存在，而不是补丁式存在

---

#### B-6. outcome 对象必须支持输出保守度

新增结构性约束方向：

后续 schema / runtime / action policy 中，outcome 对象应可表达：

- 明确输出
- 保守输出
- 仅观察型输出
- 需补充信息后再输出

这样才能承接：

- 非问题性但仍建议观察
- 不确定但可以稳定对外说明
- 问题性但当前动作需保守

---

#### B-7. outcome 对象可分为宿主通用与宿主受限

新增边界说明：

### **非问题性结论对象可以是通用结论，也可以是宿主受限结论；是否宿主受限必须在后续 schema 或规则层可表达。**

否则会出现：

- 把特定植物才成立的正常特征，误当成全植物通用 outcome

---

#### B-8. 允许存在“背景非问题性特征 + 局部问题性变化”的复合场景

新增边界说明：

### **诊断结论层的主输出应有主导结论，但不排除存在“背景非问题性特征 + 局部问题性变化”这类复合场景。**

这条用于防止系统误以为：

- 非问题性 与 问题性 永远完全互斥

当前版本不要求完整实现复合输出，但必须承认其合法存在。

---

#### B-9. 用户视角最小输出模板约束

新增设计约束：

##### 问题性结论
- 当前更像什么问题
- 为什么这样判断
- 建议做什么

##### 非问题性结论
- 当前更像什么正常 / 非病理性情况
- 为什么不更像问题
- 是否需要观察

##### 不确定结论
- 当前为什么不能安全判断
- 缺什么
- 下一步要补什么

补充说明：

- 不能稳定用以上模板表达的 outcome，不应轻易入库。




### 【v2.4 新增附录开始】

### 附录 C：AI视觉入口层联动增补（本次新增，不替换原文与既有附录）

#### C-1. AI视觉诊断入口层是正式上游入口

新增系统级硬规则：

### **AI视觉诊断入口层是当前诊断系统的正式上游入口层。**

在冷启动阶段，它承担：

- 首批视觉结构化观察
- 图像质量约束
- 症状识别主入口
- 路由建议生成
- 未来训练蒸馏的数据上游

因此后续实现不得把它视为：

- 外围增强模块
- 自由文本插件
- 与正式诊断流断开的附属能力

---

#### C-2. 视觉入口层不得越层直写 final outcome

新增系统级硬规则：

### **视觉入口层不得直接越层写入 final outcome。**

视觉入口层最多只能输出：

- 视觉候选
- route hint（路由建议）
- outcome 初始倾向
- 不确定路径建议

真正的最终结论仍必须经过：

- evidence 接纳
- hypothesis 竞争
- outcome 收敛
- stop_state / output eligibility 判定

---

#### C-3. 视觉结果必须经过接纳判定链

新增系统级硬规则：

### **任何视觉结果在进入正式推理层之前，都必须经过接纳判定链。**

最小接纳链为：

1. 原始候选层
2. 标准化候选层
3. 接纳判定层
4. 正式接入层

禁止：

- 模型高分字段直接裸写 observed_evidence_set
- 未经标准化的身份结果直接写入宿主先验
- 未经接纳判定的 pattern candidate 直接写正式 pattern evidence

---

#### C-4. 图像质量对其他视觉任务具有入口限权作用

新增系统级硬规则：

### **图像质量任务对其他视觉子任务具有入口限权作用。**

若图像质量为：

- 勉强可分析
- 或不足以分析

则系统必须优先限制以下能力的正式接纳权限：

- 高置信症状直入 evidence
- 高置信身份直入宿主先验
- pattern candidate 直入派生链

---

#### C-5. route hint 只能影响流程，不得反写事实层

新增系统级硬规则：

### **route hint 只能影响流程与优先级，不得反写事实层。**

route hint 允许影响：

- question_queue 的优先级
- 补图路径优先级
- 不确定路径优先级

禁止影响：

- symptom 真值
- evidence state
- plant identity 真值

---

#### C-6. 视觉入口层最多只能输出不确定路径建议

新增系统级硬规则：

### **视觉入口层最多只能输出不确定路径建议或不确定初始倾向，不得直接锁定最终不确定结论。**

真正的不确定结论成立仍需：

- runtime
- question_queue
- stop_state

共同裁定。

---

#### C-7. 视觉入口层必须三层留存

新增系统级硬规则：

视觉入口相关数据，必须至少分为三层留存：

1. 原始层
2. 标准化层
3. 监督层

禁止以下坏留存方式：

- 只留自然语言总回复
- 只留最终 evidence，不留原始输出
- 只留 top1，不留 topK
- 不记录模型版本 / prompt 版本
- 不记录后续被系统否定 / 修正的结果

---

#### C-8. 视觉入口层必须具备错误治理与版本治理能力

新增系统级硬规则：

系统必须能回看以下链条：

### **模型版本 / prompt 版本 → 原始输出 → 标准化结果 → 接纳判定 → 最终 outcome / stop reason**

并至少支持：

- 错误归因标签
- 版本指标对比
- 限制使用 / 暂停直入 evidence / 候选保留 等治理动作

---

### 附录 D：taxonomy 与身份主链路联动增补（本次新增，不替换原文与既有附录）

#### D-1. 植物身份主链路必须与症状识别主链路分离

新增系统级硬规则：

### **植物身份主链路与症状识别主链路必须在入口层分离，在 runtime 中汇合。**

禁止把二者混写成：

- 一个大一统自由视觉输出
- 一个模型同时自由决定身份与最终症状事实
- 一个结果对象同时承载身份、症状、结论、question 建议

---

#### D-2. 当前植物身份主链路正式定义

新增系统级硬规则：

当前植物身份主链路正式定义为：

### **百度植物识别输出 → taxonomy 匹配 → 命中直取 plant identity entity**

其中：

- 百度植物识别承担：身份入口识别器
- taxonomy 承担：植物身份正式主数据源
- 命中后，系统直接取出正式植物结构化信息

---

#### D-3. 混元不承担植物身份主识别职责

新增系统级硬规则：

### **混元当前不承担植物身份主识别职责。**

混元当前主职责应锁定为：

- 图像质量评估
- topK 视觉症状提取
- pattern candidate 候选生成
- route hint 生成

因此以下旧理解必须废止：

- 混元承担身份候选主任务
- 通用视觉模型以混元为主同时负责身份与症状主链路
- 混元参与植物身份主链路竞争

---

#### D-4. taxonomy 是植物身份正式主数据源，不是普通背景表

新增系统级硬规则：

### **plants taxonomy 是植物身份正式主数据源。**

taxonomy 当前正式承担：

- canonical identity 承载
- alias / common_name / commercial_name 归一
- family / genus / species 分类承载
- 基础宿主标签承载
- 宿主先验挂点承载
- 身份主结果直取承载

因此 taxonomy 不得继续被理解为：

- 普通植物资料表
- 被动背景数据库
- 纯展示字段容器

---

#### D-5. `plant_catalog.csv` 是 taxonomy baseline 数据源

新增系统级硬规则：

### **`plant_catalog.csv` 当前应正式视为 taxonomy baseline 数据源。**

它可作为：

- plant identity entity 的 baseline 来源
- canonical identity / family / genus / species / display name 的初始来源
- taxonomy 归一重构的底稿

但它不能未经适配就直接等于终版 taxonomy。

---

#### D-6. `plants_v13_user_friendly_full_v7.xlsx` 是 diagnosis baseline 数据源

新增系统级硬规则：

### **`plants_v13_user_friendly_full_v7.xlsx` 当前应正式视为 diagnosis baseline 数据源。**

它主要承载：

- problem
- symptom
- question
- explanation
- plant_problem_profiles 等 diagnosis 侧对象

其中与植物宿主最相关的部分，是：

- `plant_problem_profiles`

它可以作为 taxonomy 命中后的 diagnosis 挂接 baseline，  
但它不是 taxonomy 主数据源本体。

---

#### D-7. taxonomy 与宿主先验不得推翻高置信症状

新增系统级硬规则：

### **taxonomy 与宿主先验不得推翻高置信症状证据。**

taxonomy 提供的是：

- 植物身份
- 分类归属
- 基础宿主标签
- 弱宿主先验

它不是：

- 最终 diagnosis
- outcome 直写器
- 高置信症状的覆盖层

---

#### D-8. taxonomy 命中后可形成身份主结果，但不得直接锁定 diagnosis

新增系统级硬规则：

taxonomy 命中后可形成：

- 当前会话植物身份主结果
- 当前会话宿主先验挂点
- explanation 用植物基础信息

但不得直接强推：

- problem top1
- final outcome lock
- final diagnosis

---

#### D-9. taxonomy 未命中时不得伪造 plant identity

新增系统级硬规则：

若百度识别结果未命中 taxonomy，则系统必须显式保留：

- `identity_resolution_status = unresolved`

禁止：

- 自动伪造 canonical identity
- 把未归一名称直接写成正式 plant identity entity
- 把 unresolved 状态当作正式植物身份结果

---

#### D-10. 身份链与症状链必须分别治理，不能套用同一口径

新增系统级硬规则：

### **身份主链路治理规则，不得简单套用症状链治理规则。**

因为：

- 身份链处理的是命名归一与 taxonomy 命中
- 症状链处理的是 topK 症状与 evidence 接纳

二者的：
- 漂移方式
- 接纳门槛
- 退役原因
- 治理动作
都不相同。

---

### 附录 E：收益驱动停止策略硬约束（本次新增，不替换原文与既有附录）

#### E-1. 不得恢复硬性 2 轮停止

新增系统级硬规则：

### **一页一题模式下不得恢复“最多 2 轮”作为常规 final 停止条件。**

轮次只能用于：

- 审计
- 用户体验保护
- 系统资源保护
- 异常兜底

轮次不得替代：

- 必答 gate 判定
- output eligibility 判定
- 下一题高价值收益判定
- stop_state 判定

#### E-2. 只有必答 gate 可以阻塞 final

新增系统级硬规则：

### **只有进入 `gate_required_layer` 的问题或守卫，才允许阻塞 final。**

必答 gate 只能来自：

1. 模式入口 gate
2. 输出资格 gate
3. top 与 runner-up 区分 gate
4. 合法 uncertain gate
5. 安全 / 动作边界 gate

禁止把普通背景题、解释题、严重程度题、护理建议题包装成 gate。

#### E-3. 结论门槛满足后必须执行下一题收益判定

新增系统级硬规则：

### **当 top outcome 已满足输出资格时，系统必须先证明下一题仍有高价值收益，才能继续 follow-up。**

下一题高价值必须至少满足一项：

- 能补齐 context guard
- 能改变 output eligibility
- 能区分 top 与 runner-up
- 能触发合法 uncertain

并且必须具备可审计影响：

- 非空有效 `directProblemAdjustments`
- 或显式 `context_guard`
- 或显式 `output_eligibility`
- 或显式 `uncertain_legality`
- 或显式安全 / 动作边界影响

#### E-4. 低价值题不得阻塞 final

新增系统级硬规则：

### **低价值题不得作为继续阻塞 final 的理由。**

以下问题在结论门槛满足后默认属于低价值题：

- `progression`
- `distribution_scope`
- `host_confirmation`
- `underside_presence`
- 无 `directProblemAdjustments` 且没有显式 gate / eligibility / uncertain 影响的问题
- 只影响解释、严重程度、护理建议、观察提示的问题

这些问题可以进入 final 后建议或 trace，不得延长 follow-up。

#### E-5. edema / overwatering 形态正证据不得被低增益题拖住

新增系统级硬规则：

### **edema / overwatering 已有正式形态正证据且满足输出资格时，不得继续被光照、分布、叶背、宿主确认等低增益题拖住。**

允许继续追问的例外仅限于：

- 补齐该 outcome 必需的浇水、土壤湿度、排水、盆土状态 context guard
- 实质区分 edema / overwatering 与当前 runner-up
- 确认关键反证并改变 output eligibility
- 触发合法 uncertain

否则必须进入 stop_state 与 final。



## [S06] 当前全部文档最高规格联动一致性总审查报告（完整最终版）

- 文件名：`当前全部文档最高规格联动一致性总审查报告.md`
- 状态：A类正式基线
- 类别：审查/一致性
- 用途：全体系联动审查；识别 P0 问题与文档一致性缺口
- SHA-256 前 16 位：`f90e8a3db70b25a6`

---

### 当前全部文档最高规格联动一致性总审查报告（完整最终版）

> 审查目标：
>
> - 对当前全部主线文档、桥接文档、SQL 方案、运行时示例、属级养护基线设计文档做一次**最高规格的联动一致性总审查**
> - 不只审概念，还审：
>   - 文件版本控制
>   - 完整文件 / 纯补丁问题
>   - 标题与版本号一致性
>   - 新概念是否真正联动进既有体系
>   - 是否还存在阻碍正式落代码的结构性缺口
>
> 审查范围（当前目录内可确认文件）包括：
>
> - 《AI视觉诊断入口层数据结构与留存规范 v1.4（最终完整增补版，基于 v1.1 只增不减）》
> - 《诊断系统硬约束清单 v2.4》
> - 《诊断结论层 v1.2（完整最终版）》
> - 《诊断目标分层 v1.4（完整最终版）》
> - 《核心数据结构》当前可见版本
> - 《运行时模型》当前可见版本
> - 《决策流》当前可见版本
> - 《统一术语表》当前可见版本
> - 《准入与退役规则》当前可见版本
> - 《最小可用知识库》当前可见版本
> - 《植物 Taxonomy 体系定义》当前可见版本
> - 三份桥接文档
> - 《最终 SQL 制表方案》
> - 《AI视觉入口层到 Diagnosis 运行时挂接示例》
> - 《属级养护基线表设计》
>
> 审查结论先行：
>
> # **概念主链路整体已经成型。**
> # **但当前文件体系仍然存在严重的“交付物一致性问题”。**
>
> 更准确地说：
>
> - 业务架构主干：大体成立
> - 概念边界：大体成立
> - SQL 前置桥接：已经基本齐备
> - 可以进入正式落代码：是
>
> 但是：
>
> # **当前仍存在 4 个 P0 级问题**
> # **以及 10 个 P1 级问题**
>
> 当前最准确的裁决是：
>
> # **体系已经接近可落代码状态**
> # **但文件系统层面的“完整最终文件一致性”还没有真正收口**
>
> 也就是说：
>
> # **现在的问题已经不主要是“概念没想清楚”**
> # **而是“哪些文档真正已完成联动、哪些只是口头说补过但当前文件并未体现”**

---

### 一、总评价：当前体系已经做对了什么

#### 1.1 主链路已经形成闭环

当前从概念上看，主链路已经能闭成一圈：

- AI视觉入口层
- 植物身份主链路
- 症状识别主链路
- 接纳判定
- Taxonomy → Diagnosis 挂接
- problem competition
- question 回流
- outcome 收敛

这一点已经明显成立。

---

#### 1.2 Taxonomy 侧与 Diagnosis 侧已经基本分家

当前文档体系已经明确：

- Taxonomy 负责身份、归一、宿主结构
- Diagnosis 负责 problem / symptom / question / explanation / outcome
- 运行时层负责会话状态与接纳、监督
- route hint / identity / 图像质量 / 器官结果都不能越层

这条主边界已经比早期稳很多。

---

#### 1.3 SQL 前的桥接文档已经成型

当前已经有：

- 字段映射表
- 植物身份主表与命名归一规则
- Taxonomy 与 Diagnosis 挂接规则
- 最终 SQL 制表方案
- 运行时挂接示例

这说明体系确实已经从纯概念阶段进入了落代码前夜。

---

#### 1.4 属级养护基线概念方向是对的

当前《属级养护基线表设计 v1.1》把这件事定位为：

- Taxonomy 侧主数据
- genus baseline
- future overrides 的上位默认值
- 行动建议系统的重要上游

这个方向是对的，没有走偏。

---

### 二、P0 级问题：必须先收口

#### P0-1. 当前目录里实际存在的“完整最终文件”并不等于口头上宣称已经补完的版本

这是当前最大的问题。

从当前目录内**实际存在的文件**看，很多你前面要求“已经补成完整最终版”的文档，现在并没有以那个完整最终版文件稳定存在。  
当前能直接看到的，很多仍然是：

- `...linked.md`
- `...additive.md`
- `...outcome_aligned.md`
- `...identity_split_linked.md`

也就是说：

### **文档口头状态**
和
### **当前目录中的真实交付物状态**

并不一致。

##### 这意味着什么
这意味着你现在不能简单地认为：
- “这份已经联动补过了”
就等于
- “当前目录中确实存在该完整最终文件”

这是严重问题，因为你已经把：

### **后续版本必须是完整可交付最终文件**
### **严禁纯补丁**
钉成了宪法。

##### 结论
这不是小问题，而是**文件交付一致性 P0**。

---

#### P0-2. 多份“完整最终版 / review 后版本”文件，标题行仍然停留在旧版本号

这是第二个 P0。

当前至少能确认这些情况：

##### 《AI视觉诊断入口层数据结构与留存规范 v1.4（最终完整增补版）》
当前文件的第一行仍然是：

- `v1.1`

而不是：
- `v1.4`

##### 《植物 Taxonomy 体系定义 v1.1（review 增补修正版）》
当前文件第一行仍然是：

- `v1`

而不是：
- `v1.1`

##### 《最终 SQL 制表方案 v1.1（范围收口修正版）》
当前文件第一行仍然是：

- `v1`

##### 《AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1》
当前文件第一行仍然是：

- `v1`

##### 《属级养护基线表设计 v1.1》
当前文件第一行仍然是：

- `v1`

##### 为什么这是严重问题
因为你现在要求的是：

### **完整最终文件**
而完整最终文件的首页标题、版本号、文件内容必须自洽。

如果文件名叫：
- `...v1.1_full_reviewed_final`

但正文第一页还是：
- `v1`

那它在版本控制上就是不自洽。

这属于：
- 明显错误
- 明显不自洽
- 会污染后续引用、实现、审查记录

必须修。

---

#### P0-3. “属级养护基线”概念虽然已经单独建了设计文档，但当前并没有真正联动进多数应增补的文档里

这是第三个 P0。

我检查当前目录内可见文件内容后，结论很明确：

### **“属级养护基线”目前主要存在于它自己的设计文档与分析文档里**
### **并没有真正写进多数既有主文档当前目录版本中**

也就是说，当前目录里：

- 《植物 Taxonomy 体系定义》**没有**出现“属级养护基线”概念联动
- 《最终 SQL 制表方案》**没有**出现 `genus_care_profiles`
- 《Taxonomy / Diagnosis SQL 字段映射表》**没有**出现 `genus_care_profile.csv` 的字段映射
- 《核心数据结构》当前可见文件**没有**该对象
- 《统一术语表》当前可见文件**没有**该术语
- 《最小可用知识库》当前可见文件**没有**该概念
- 《准入与退役规则》当前可见文件**没有**该治理对象

也就是说：

### **分析结论已经写出来了**
但：
### **联动后的完整最终文件当前并未全部真实存在**

这不是概念问题，而是执行落地问题。

---

#### P0-4. 当前“可作为正式基线使用的文档集合”没有被再次收口成一份明确清单

这是第四个 P0。

现在体系里已经有：

- 原始版
- 增补版
- review 报告
- linked 版
- supposedly full final 版
- 重新整理版
- 中文重写版
- 合规增补版
- full reviewed final 版

如果不再把“**当前哪一份才是正式基线**”写成一张清单，后续继续实现时会很危险。

##### 为什么严重
因为现在不是“没有文件”，而是：

### **文件太多**
### **版本名太多**
### **实际存在状态和口头状态还有偏差**

这时如果没有一张：
- 当前正式基线文档清单
- 当前作废 / 不再引用文档清单

实现阶段一定会选错文件。

---

### 三、P1 级问题：建议强补

#### P1-1. 《诊断系统硬约束清单 v2.4》标题里仍有 `taxonomy` 小写英文主导感

这不是最大问题，但与你“中文一等公民”的宪法不完全一致。  
后续应统一成：

- 中文主概念优先
- 英文只在必要处辅助

---

#### P1-2. 《核心数据结构》《运行时模型》《决策流》当前目录内可见版本仍更像“linked 版”而不是收口后的完整最终版

这会导致：
- 虽然内容方向对
- 但文件形态仍不够稳

尤其在你已经把“完整最终文件”钉死后，这种状态不该长期存在。

---

#### P1-3. 《统一术语表》《准入与退役规则》《最小可用知识库》当前目录内仍主要可见旧版 + linked 增补版

这再次说明：
- 口头说已补
- 当前目录里却未见稳定完整最终版

这会持续削弱体系可信度。

---

#### P1-4. 《最终 SQL 制表方案 v1.1》虽然内容已经 review 收口，但当前目录版本还没把 `genus_care_profiles` 正式纳入

这意味着：
- SQL 方案层面还没真正接住养护基线表
- 你如果现在直接开始建表，仍有遗漏风险

---

#### P1-5. 《Taxonomy / Diagnosis SQL 字段映射表 v1》还没纳入 `genus_care_profile.csv`

这意味着：
- 三份原始 / 新增素材源并没有被同一份映射文档统一收口
- 导入脚本阶段一定还要补

---

#### P1-6. 《植物 Taxonomy 体系定义 v1.1》还没把 genus care baseline 并入主数据定义

这会让 Taxonomy 侧出现“身份主数据”和“养护主数据”割裂。

---

#### P1-7. 《统一术语表》未纳入 genus care baseline 相关术语

后面你一旦开始写代码、写 SQL、写实现说明，会再次出现：
- 属级养护基线
- 养护基线
- genus care baseline
- care baseline
- care profile

多种叫法并行的问题。

---

#### P1-8. 《最小可用知识库》仍然更偏 diagnosis 侧

如果不补 genus care baseline，它会继续给人一种错觉：
- “最小可用知识库 = diagnosis 表”
而不是：
- “最小可用知识库 = identity 主数据 + diagnosis 静态业务 + care baseline”

---

#### P1-9. 《准入与退役规则》还没明确治理 `genus_care_profiles`

而 care baseline 表后续同样会经历：
- 审核
- 替代
- 停用
- 退役

不补这条，治理体系会断。

---

#### P1-10. 《AI视觉入口层到 Diagnosis 运行时挂接示例》还没把“诊断后动作建议如何接 genus baseline”补成扩展示例

这个不是必须立刻补，但如果后面你要演示完整产品链路，它迟早要出现。

---

### 四、概念联动层面的总判断

#### 4.1 当前概念是否自洽？

答案：

### **大体自洽。**

主要链路没有明显互相打架：

- identity 不是 outcome
- route hint 不是 outcome
- taxonomy 不属于 problem taxonomy
- AI视觉入口层不是最终 diagnosis
- genus care baseline 不是 problem / outcome

这些边界当前是清楚的。

---

#### 4.2 当前最大的风险是什么？

不是“某个概念错了”，而是：

### **文件落地层面没有真正把最新共识联动进全部该联动的完整文档里**

也就是说，当前风险更偏：

- 文档执行层
- 文件交付层
- 版本控制层

而不是纯概念层。

---

### 五、按最高规格标准，当前文档体系的最终裁决

如果你问我：

> 当前全部文档，概念上能不能支撑正式落代码？

答案：

### **能。**

如果你问我：

> 当前全部文档，文件交付状态上能不能说已经彻底收口？

答案：

### **还不能。**

原因非常明确：

1. 多份完整最终版标题行版本号不自洽
2. 多份应该联动补“属级养护基线”的文档，当前目录里尚未真实体现
3. 多条版本线仍停留在 linked / base / old full 混杂状态
4. 缺一张“当前正式基线文档清单”

---

### 六、下一步最合理的动作顺序

#### 第一步：先收口“当前正式基线文档清单”
必须列一份清单，写死：
- 哪些文档是当前正式基线
- 哪些旧文档不再引用
- 哪些 linked 文件只是中间件，不可再当最终文件

---

#### 第二步：把“属级养护基线”补进必须联动的 7 份完整文档
按你前面已经钉死的优先级：

##### 第一优先级
1. 《植物 Taxonomy 体系定义》
2. 《最终 SQL 制表方案》
3. 《Taxonomy / Diagnosis SQL 字段映射表》

##### 第二优先级
4. 《核心数据结构》
5. 《统一术语表》
6. 《最小可用知识库》
7. 《准入与退役规则》

并且全部必须输出为：

### **完整最终文件**
不是补丁。

---

#### 第三步：统一修正文档首页标题与版本号
把这些“文件名是 v1.1 / v1.4，正文首页还是 v1 / v1.1”的问题全部修掉。

---

#### 第四步：再做一次最终联动一致性总审查
也就是在文件真正都收口后，再做一次你现在要的这种总审查，才有资格说“体系真的收口了”。

---

### 七、一句话总结

**当前体系的概念主链路已经基本站住了，但文档交付层面仍然没有真正收口；最大问题不是概念冲突，而是“当前目录里真实存在的完整最终文件状态”与“你口头要求已经补完的状态”还不一致。**



## [S07] 第一版 SQL 表结构草案 v1（完整最终版）

- 文件名：`新增属级养护基线联动后文档体系最高规格一致性总审查报告_重新生成版.md`
- 状态：A类正式基线
- 类别：异常/SQL源
- 用途：文件名像总审查报告，但正文标题为“第一版 SQL 表结构草案 v1”；需作为命名异常处理
- SHA-256 前 16 位：`4596cbd46af10328`

---

### 第一版 SQL 表结构草案 v1（完整最终版）

> 说明：
> 
> -   本文档是基于当前全部正式基线文档收束出来的**第一版 SQL 表结构草案**。
>     
> -   目标不是一次性给出最终生产级 schema，而是给出：
>     
>     -   可进入 dev 验证的正式建表草案
>     -   可支撑第一轮数据导入 / 映射 / 联调的表结构基础
> -   本文档遵循：
>     
> 
> # **中文是一等公民**
> 
> # **完整最终文件优先**
> 
> # **当前以 dev 落地为第一目标**

---

### 一、当前建表分层

#### 1. Taxonomy 主数据层

-   `plant_identity_entities`
-   `plant_identity_aliases`
-   `plant_identity_match_rules`
-   `plant_identity_merge_history`
-   `genus_care_profiles`

#### 2. Diagnosis 静态业务层

-   `problems`
-   `symptoms`
-   `question_templates`
-   `question_option_sets`
-   `diagnosis_result_explanations`
-   `plant_problem_profiles`

#### 3. Taxonomy 到 Diagnosis 挂接层

-   `plant_identity_diagnosis_links`

#### 4. 运行时与监督层

-   `plant_identity_resolution_records`
-   `visual_raw_image_records`
-   `visual_normalized_image_results`
-   `visual_admission_records`
-   `visual_call_aggregate_results`（建议落）
-   `visual_supervision_records`（建议落）

---

### 二、Taxonomy 主数据层表结构草案

#### 2.1 `plant_identity_entities`（植物身份主表）

```sql
CREATE TABLE plant_identity_entities (
  plant_identity_id            VARCHAR(64) PRIMARY KEY COMMENT '植物身份对象ID',
  legacy_plant_id             VARCHAR(64) NULL COMMENT '历史植物ID',
  canonical_identity_name     VARCHAR(255) NOT NULL COMMENT '主身份主名',
  canonical_identity_name_cn  VARCHAR(255) NULL COMMENT '中文主身份主名',
  canonical_identity_name_en  VARCHAR(255) NULL COMMENT '英文主身份主名',
  primary_display_name        VARCHAR(255) NOT NULL COMMENT '主展示名',
  identity_level              VARCHAR(64) NOT NULL COMMENT '身份层级：genus/species/horticultural_variant/unknown',
  family_name_cn              VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en              VARCHAR(255) NULL COMMENT '科英文名',
  genus_name                  VARCHAR(255) NULL COMMENT '属名',
  species_name                VARCHAR(255) NULL COMMENT '种名',
  scientific_name             VARCHAR(255) NULL COMMENT '学名',
  category_name_cn            VARCHAR(255) NULL COMMENT '分类中文名',
  category_name_en            VARCHAR(255) NULL COMMENT '分类英文名',
  basic_description           TEXT NULL COMMENT '基础描述',
  cover_image_ref             TEXT NULL COMMENT '封面图引用',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_identity_id     VARCHAR(64) NULL COMMENT '替代对象ID',
  UNIQUE KEY uk_identity_name_level (canonical_identity_name, identity_level)
) COMMENT='植物身份主表';
```

---

#### 2.2 `plant_identity_aliases`（植物身份别名表）

```sql
CREATE TABLE plant_identity_aliases (
  alias_id                    VARCHAR(64) PRIMARY KEY COMMENT '别名ID',
  plant_identity_id           VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  alias_name                  VARCHAR(255) NOT NULL COMMENT '别名内容',
  alias_type                  VARCHAR(64) NOT NULL COMMENT '别名类型',
  is_preferred_search_alias   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否优先搜索别名',
  source_name                 VARCHAR(128) NULL COMMENT '来源',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  UNIQUE KEY uk_identity_alias_type (plant_identity_id, alias_name, alias_type),
  KEY idx_alias_name (alias_name),
  CONSTRAINT fk_alias_identity
    FOREIGN KEY (plant_identity_id) REFERENCES plant_identity_entities(plant_identity_id)
) COMMENT='植物身份别名表';
```

---

#### 2.3 `plant_identity_match_rules`（植物身份命中规则表）

```sql
CREATE TABLE plant_identity_match_rules (
  match_rule_id               VARCHAR(64) PRIMARY KEY COMMENT '命中规则ID',
  plant_identity_id           VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  match_key                   VARCHAR(255) NOT NULL COMMENT '命中键',
  match_rule_type             VARCHAR(64) NOT NULL COMMENT '命中规则类型',
  match_strength              VARCHAR(32) NOT NULL COMMENT '命中强度',
  source_name                 VARCHAR(128) NULL COMMENT '来源',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_identity_match (plant_identity_id, match_key, match_rule_type),
  KEY idx_match_key (match_key),
  CONSTRAINT fk_match_identity
    FOREIGN KEY (plant_identity_id) REFERENCES plant_identity_entities(plant_identity_id)
) COMMENT='植物身份命中规则表';
```

---

#### 2.4 `plant_identity_merge_history`（植物身份合并历史表）

```sql
CREATE TABLE plant_identity_merge_history (
  merge_history_id            VARCHAR(64) PRIMARY KEY COMMENT '合并历史ID',
  source_identity_id          VARCHAR(64) NOT NULL COMMENT '源身份对象ID',
  target_identity_id          VARCHAR(64) NOT NULL COMMENT '目标身份对象ID',
  merge_reason                TEXT NULL COMMENT '合并原因',
  merged_at                   DATETIME NULL COMMENT '合并时间'
) COMMENT='植物身份合并历史表';
```

---

#### 2.5 `genus_care_profiles`（属级养护基线表）

```sql
CREATE TABLE genus_care_profiles (
  genus_care_profile_id       VARCHAR(64) PRIMARY KEY COMMENT '属级养护基线ID',
  genus_name                  VARCHAR(255) NOT NULL COMMENT '属名',
  family_name                 VARCHAR(255) NOT NULL COMMENT '科名',
  genus_id                    VARCHAR(64) NULL COMMENT '属ID（预留升级位）',
  genus_identity_id           VARCHAR(64) NULL COMMENT '属级身份对象ID（预留升级位）',
  plant_category              VARCHAR(64) NOT NULL COMMENT '植物类别',
  watering_strategy_json      JSON NOT NULL COMMENT '浇水策略JSON',
  fertilizing_strategy_json   JSON NOT NULL COMMENT '施肥策略JSON',
  light_strategy_json         JSON NOT NULL COMMENT '光照策略JSON',
  airflow_strategy_json       JSON NOT NULL COMMENT '通风策略JSON',
  temp_min_c                  DECIMAL(5,2) NULL COMMENT '最低适宜温度（℃）',
  temp_max_c                  DECIMAL(5,2) NULL COMMENT '最高适宜温度（℃）',
  humidity_min                DECIMAL(5,2) NULL COMMENT '最低适宜湿度',
  humidity_max                DECIMAL(5,2) NULL COMMENT '最高适宜湿度',
  toxicity_level              VARCHAR(64) NOT NULL COMMENT '毒性等级',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  source_evidence             TEXT NULL COMMENT '证据来源',
  baseline_note               TEXT NULL COMMENT '基线说明',
  evidence_level              VARCHAR(64) NOT NULL COMMENT '证据层级',
  evidence_strategy           VARCHAR(64) NOT NULL COMMENT '证据策略',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_profile_id      VARCHAR(64) NULL COMMENT '替代基线ID',
  UNIQUE KEY uk_genus_family (genus_name, family_name),
  KEY idx_genus_name (genus_name)
) COMMENT='属级养护基线表';
```

---

### 三、Diagnosis 静态业务层表结构草案

#### 3.1 `problems`（问题主表）

```sql
CREATE TABLE problems (
  problem_id                  VARCHAR(64) PRIMARY KEY COMMENT '问题ID',
  problem_key                 VARCHAR(128) NOT NULL COMMENT '问题键',
  problem_name_cn             VARCHAR(255) NOT NULL COMMENT '问题中文名',
  problem_name_en             VARCHAR(255) NULL COMMENT '问题英文名',
  problem_category            VARCHAR(64) NULL COMMENT '问题类别',
  severity_default            VARCHAR(64) NULL COMMENT '默认严重度',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  UNIQUE KEY uk_problem_key (problem_key)
) COMMENT='问题主表';
```

---

#### 3.2 `symptoms`（症状主表）

```sql
CREATE TABLE symptoms (
  symptom_id                  VARCHAR(64) PRIMARY KEY COMMENT '症状ID',
  symptom_key                 VARCHAR(128) NOT NULL COMMENT '症状键',
  symptom_name_cn             VARCHAR(255) NOT NULL COMMENT '症状中文名',
  symptom_name_en             VARCHAR(255) NULL COMMENT '症状英文名',
  symptom_type                VARCHAR(64) NULL COMMENT '症状类型',
  evidence_reliability        DECIMAL(5,2) NULL COMMENT '证据可靠性',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  UNIQUE KEY uk_symptom_key (symptom_key)
) COMMENT='症状主表';
```

---

#### 3.3 `question_templates`（问题模板表）

```sql
CREATE TABLE question_templates (
  question_template_id        VARCHAR(64) PRIMARY KEY COMMENT '问题模板ID',
  question_key                VARCHAR(128) NOT NULL COMMENT '问题键',
  question_text_cn            TEXT NOT NULL COMMENT '问题中文文本',
  question_type               VARCHAR(64) NULL COMMENT '问题类型',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  UNIQUE KEY uk_question_key (question_key)
) COMMENT='问题模板表';
```

---

#### 3.4 `question_option_sets`（问题选项集表）

```sql
CREATE TABLE question_option_sets (
  question_option_id          VARCHAR(64) PRIMARY KEY COMMENT '问题选项ID',
  question_key                VARCHAR(128) NOT NULL COMMENT '问题键',
  option_key                  VARCHAR(128) NOT NULL COMMENT '选项键',
  option_text_cn              VARCHAR(255) NOT NULL COMMENT '选项中文文本',
  option_order                INT NULL COMMENT '选项顺序',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_question_option (question_key, option_key)
) COMMENT='问题选项集表';
```

---

#### 3.5 `diagnosis_result_explanations`（诊断结果解释表）

```sql
CREATE TABLE diagnosis_result_explanations (
  explanation_id              VARCHAR(64) PRIMARY KEY COMMENT '解释ID',
  target_type                 VARCHAR(64) NOT NULL COMMENT '目标类型',
  target_key                  VARCHAR(128) NOT NULL COMMENT '目标键',
  explanation_text_cn         TEXT NOT NULL COMMENT '解释中文文本',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_target_expl (target_type, target_key)
) COMMENT='诊断结果解释表';
```

---

#### 3.6 `plant_problem_profiles`（植物问题画像表）

```sql
CREATE TABLE plant_problem_profiles (
  plant_problem_profile_id    VARCHAR(64) PRIMARY KEY COMMENT '植物问题画像ID',
  profile_key                 VARCHAR(128) NOT NULL COMMENT '画像键',
  plant_identity_id           VARCHAR(64) NULL COMMENT '植物身份对象ID',
  genus_name                  VARCHAR(255) NULL COMMENT '属名',
  family_name                 VARCHAR(255) NULL COMMENT '科名',
  problem_key                 VARCHAR(128) NOT NULL COMMENT '问题键',
  prior_score                 DECIMAL(6,3) NULL COMMENT '先验分数',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  KEY idx_profile_problem (profile_key, problem_key)
) COMMENT='植物问题画像表';
```

---

### 四、Taxonomy 到 Diagnosis 挂接层表结构草案

#### 4.1 `plant_identity_diagnosis_links`（植物身份到诊断挂接表）

```sql
CREATE TABLE plant_identity_diagnosis_links (
  link_id                     VARCHAR(64) PRIMARY KEY COMMENT '挂接ID',
  plant_identity_id           VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  link_level                  VARCHAR(32) NOT NULL COMMENT '挂接层级：identity/genus/family',
  target_table_name           VARCHAR(128) NOT NULL COMMENT '目标表名',
  target_record_key           VARCHAR(128) NOT NULL COMMENT '目标记录键',
  link_strength               VARCHAR(32) NOT NULL COMMENT '挂接强度：exact/downgraded/weak_background',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_identity_link (plant_identity_id, link_level, target_table_name, target_record_key)
) COMMENT='植物身份到诊断挂接表';
```

---

### 五、运行时与监督层表结构草案

#### 5.1 `plant_identity_resolution_records`（植物身份解析记录表）

```sql
CREATE TABLE plant_identity_resolution_records (
  identity_resolution_record_id VARCHAR(64) PRIMARY KEY COMMENT '身份解析记录ID',
  session_id                    VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id          VARCHAR(64) NULL COMMENT '视觉调用批次ID',
  raw_recognition_name          VARCHAR(255) NULL COMMENT '原始识别名',
  taxonomy_match_status         VARCHAR(64) NOT NULL COMMENT 'Taxonomy匹配状态',
  identity_resolution_status    VARCHAR(64) NOT NULL COMMENT '身份解析状态',
  matched_plant_identity_id     VARCHAR(64) NULL COMMENT '命中植物身份对象ID',
  is_current_primary_identity   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前主身份结果',
  match_rule                    VARCHAR(64) NULL COMMENT '命中规则',
  match_score                   DECIMAL(6,3) NULL COMMENT '命中分数',
  match_reason                  TEXT NULL COMMENT '命中原因',
  superseded_by_resolution_id   VARCHAR(64) NULL COMMENT '被哪个解析记录覆盖',
  superseded_reason             TEXT NULL COMMENT '覆盖原因',
  superseded_at                 DATETIME NULL COMMENT '覆盖时间',
  created_at                    DATETIME NULL COMMENT '创建时间',
  updated_at                    DATETIME NULL COMMENT '更新时间'
) COMMENT='植物身份解析记录表';
```

---

#### 5.2 `visual_raw_image_records`（单图视觉原始记录表）

```sql
CREATE TABLE visual_raw_image_records (
  visual_raw_image_record_id  VARCHAR(64) PRIMARY KEY COMMENT '单图视觉原始记录ID',
  session_id                  VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id        VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  image_ref                   TEXT NULL COMMENT '图片引用',
  input_slot_type             VARCHAR(64) NULL COMMENT '输入槽位类型',
  model_name                  VARCHAR(128) NULL COMMENT '模型名称',
  model_version               VARCHAR(128) NULL COMMENT '模型版本',
  prompt_version              VARCHAR(128) NULL COMMENT '提示词版本',
  raw_text_output             LONGTEXT NULL COMMENT '原始文本输出',
  raw_structured_output       LONGTEXT NULL COMMENT '原始结构化输出',
  call_status                 VARCHAR(64) NULL COMMENT '调用状态',
  latency_ms                  INT NULL COMMENT '延迟毫秒数',
  error_code                  VARCHAR(64) NULL COMMENT '错误码',
  created_at                  DATETIME NULL COMMENT '创建时间'
) COMMENT='单图视觉原始记录表';
```

---

#### 5.3 `visual_normalized_image_results`（单图视觉标准化结果表）

```sql
CREATE TABLE visual_normalized_image_results (
  visual_normalized_image_result_id VARCHAR(64) PRIMARY KEY COMMENT '单图视觉标准化结果ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_raw_image_record_id        VARCHAR(64) NOT NULL COMMENT '单图视觉原始记录ID',
  analyzability_level               VARCHAR(64) NULL COMMENT '可分析等级',
  clarity_level                     VARCHAR(64) NULL COMMENT '清晰度等级',
  subject_completeness_level        VARCHAR(64) NULL COMMENT '主体完整性等级',
  primary_organ_type                VARCHAR(64) NULL COMMENT '主器官类型',
  organ_source                      VARCHAR(64) NULL COMMENT '器官来源',
  topk_symptoms_json                JSON NULL COMMENT '前K症状JSON',
  pattern_candidates_json           JSON NULL COMMENT '模式候选JSON',
  route_hints_json                  JSON NULL COMMENT '路由建议JSON',
  top1_stability_score              DECIMAL(6,3) NULL COMMENT 'Top1稳定性分数',
  top3_stability_score              DECIMAL(6,3) NULL COMMENT 'Top3稳定性分数',
  long_tail_noise_flag              TINYINT(1) NULL COMMENT '长尾噪声标记',
  created_at                        DATETIME NULL COMMENT '创建时间'
) COMMENT='单图视觉标准化结果表';
```

---

#### 5.4 `visual_admission_records`（视觉接纳判定记录表）

```sql
CREATE TABLE visual_admission_records (
  visual_admission_record_id   VARCHAR(64) PRIMARY KEY COMMENT '视觉接纳判定记录ID',
  session_id                   VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id         VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_normalized_image_result_id VARCHAR(64) NOT NULL COMMENT '单图视觉标准化结果ID',
  object_type                  VARCHAR(64) NOT NULL COMMENT '对象类型',
  object_key                   VARCHAR(255) NULL COMMENT '对象键',
  admission_result             VARCHAR(64) NOT NULL COMMENT '接纳结果',
  admission_reason             TEXT NULL COMMENT '接纳理由',
  entered_runtime              TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否进入运行时正式层',
  target_layer                 VARCHAR(64) NULL COMMENT '进入目标层级',
  created_at                   DATETIME NULL COMMENT '创建时间'
) COMMENT='视觉接纳判定记录表';
```

---

#### 5.5 `visual_call_aggregate_results`（视觉调用聚合结果表，建议落）

```sql
CREATE TABLE visual_call_aggregate_results (
  visual_call_aggregate_result_id VARCHAR(64) PRIMARY KEY COMMENT '视觉调用聚合结果ID',
  session_id                      VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id            VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  aggregate_analyzability_level   VARCHAR(64) NULL COMMENT '聚合可分析等级',
  aggregate_summary_json          JSON NULL COMMENT '聚合摘要JSON',
  created_at                      DATETIME NULL COMMENT '创建时间'
) COMMENT='视觉调用聚合结果表';
```

---

#### 5.6 `visual_supervision_records`（视觉监督记录表，建议落）

```sql
CREATE TABLE visual_supervision_records (
  visual_supervision_record_id      VARCHAR(64) PRIMARY KEY COMMENT '视觉监督记录ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_admission_record_id        VARCHAR(64) NOT NULL COMMENT '视觉接纳判定记录ID',
  adopted_by_evidence               TINYINT(1) NULL COMMENT '后续是否被正式证据采纳',
  corrected_by_question             TINYINT(1) NULL COMMENT '后续是否被追问修正',
  denied_by_runtime                 TINYINT(1) NULL COMMENT '后续是否被运行时否定',
  denied_by_outcome_competition     TINYINT(1) NULL COMMENT '后续是否被结论竞争否定',
  question_correction_scope         VARCHAR(64) NULL COMMENT '问题回流纠正作用域',
  final_outcome_type                VARCHAR(64) NULL COMMENT '最终结论类型',
  final_stop_reason                 VARCHAR(128) NULL COMMENT '最终停止原因',
  updated_at                        DATETIME NULL COMMENT '更新时间'
) COMMENT='视觉监督记录表';
```

---

### 六、当前建表顺序建议

#### 第一阶段：先建主数据与 diagnosis 静态表

1.  `plant_identity_entities`
2.  `plant_identity_aliases`
3.  `plant_identity_match_rules`
4.  `plant_identity_merge_history`
5.  `genus_care_profiles`
6.  `problems`
7.  `symptoms`
8.  `question_templates`
9.  `question_option_sets`
10.  `diagnosis_result_explanations`
11.  `plant_problem_profiles`

#### 第二阶段：再建挂接表

12.  `plant_identity_diagnosis_links`

#### 第三阶段：再建运行时骨架表

13.  `plant_identity_resolution_records`
14.  `visual_raw_image_records`
15.  `visual_normalized_image_results`
16.  `visual_admission_records`

#### 第四阶段：补建议落表

17.  `visual_call_aggregate_results`
18.  `visual_supervision_records`

---

### 七、一句话总裁决

**这份第一版 SQL 表结构草案 v1，已经足以支撑进入 dev 建表与联调阶段。**



## [S08] 诊断目标分层 v1.4（完整最终版，基于可用前版只增不减）

- 文件名：`problem_taxonomy_v1_4_full_final.md`
- 状态：A类正式基线
- 类别：诊断主链
- 用途：诊断问题层；只定义问题性诊断对象，不覆盖最终输出全集
- SHA-256 前 16 位：`cebcb16e41883a5f`

---

### 诊断目标分层 v1.4（完整最终版，基于可用前版只增不减）

> 版本说明：
> 
> -   本文件为**完整可交付的最终文件**，不是纯补丁。
>     
> -   本文件完整保留基线文件正文，并在其后按“只增不减”原则追加后续有效增补内容。
>     
> -   本文件的版本责任链为：
>     
>     -   v1.2：当前可用完整基线正文
>     -   v1.3：诊断结论层联动增补
>     -   v1.4：AI视觉入口层 / Taxonomy / 身份主链路联动增补
> -   阅读顺序：
>     
>     1.  先读本文件顶部版本说明
>     2.  再读“完整保留的基线正文”
>     3.  最后读后续新增附录
> -   说明：
>     
>     -   为避免再次出现“只有补丁、没有完整正文”的问题，本文件采用“封面说明 + 基线正文原样保留 + 后续附录追加”的最终文件形态。
>     -   基线正文不删不改，后续版本内容只做新增。

---

### 【完整保留的基线正文开始】

### 诊断目标分层 v1.2（纳入诊断结论层修正版）

> 目标：在《诊断目标分层 v1.1（review 修正版）》基础上，正式纳入《诊断结论层 v1》的边界结论，明确诊断问题层只覆盖“问题性结论空间”，不再被误解为系统全部最终结果空间。

---

### 0. 文档定位

在本系统中，**诊断问题（problem）** 必须是：

> **一个可被证据支持、削弱、排除，能够与其他候选对象形成竞争关系，并且能承接后续诊断提问与行动策略的可行动诊断对象。**

但必须补充一条更高层边界：

### **诊断问题层只定义“问题性结论空间”，不定义系统全部最终结果空间。**

也就是说：

-   诊断问题层负责“有什么问题”
-   但系统最终还必须支持：
    -   非问题性结论
    -   不确定结论

#### 0.1 文档语言规则

-   中文是一等公民，是主定义语言。
-   英文只作为辅助键名、辅助字段名、代码实现映射名。
-   文档默认表达顺序统一为：**中文主名（英文辅助名）**。

---

### 1. 本次修订要解决的核心问题

#### 1.1 明确诊断问题不是系统最终输出空间的全集

必须正式写死：

-   诊断问题（problem）只属于问题性结论
-   非问题性结论不属于 problem taxonomy
-   不确定结论也不属于 problem taxonomy

#### 1.2 明确 problem taxonomy 与 outcome layer 的关系

本文件只负责定义：

-   问题性结论中的诊断对象

不负责定义：

-   正常特征类结论
-   生长阶段正常现象类结论
-   非病理性旧痕类结论
-   不确定结论

#### 1.3 防止后续把“正常结论”误塞进 problem 层

例如以下对象：

-   艺斑 / 稳定斑驳特征
-   品种固有花纹
-   老叶自然退化
-   非扩展性旧伤痕
-   可接受轻微色差

都不应写进 problem taxonomy。

---

### 2. 总体原则

#### 2.1 诊断问题（problem）必须是问题性诊断对象，不是现象描述

允许作为诊断问题的对象，应当满足：

-   能被证据支持、削弱、排除
-   能与其他诊断问题形成竞争关系
-   能触发后续诊断提问路由
-   能承接后续行动策略
-   明确属于问题性结论空间

不允许作为诊断问题的对象，包括但不限于：

-   纯症状词
-   纯视觉模式词
-   纯处理动作词
-   纯结果描述词
-   非问题性正常特征对象
-   不确定性保留对象

#### 2.2 第 2 层诊断问题必须统一为“可行动的机制 / 原因层”

允许进入第 2 层的示例：

-   真菌性叶斑类问题
-   细菌性叶斑类问题
-   刺吸式虫害问题
-   咀嚼型虫害问题
-   过浇胁迫问题
-   缺水胁迫问题
-   日灼损伤问题

不允许进入第 2 层的示例：

-   穿孔型叶斑
-   叶斑伴黄晕
-   银斑卷曲型损伤
-   弥漫性黄化型问题
-   艺斑 / 稳定斑驳特征
-   老叶自然退化
-   旧机械伤但无扩展性

#### 2.3 “样问题”可以存在，但必须受严格限制

只有当一个“样问题”同时满足以下条件时，才允许进入诊断问题层：

1.  指向的是**可行动的机制方向**
2.  能与其他诊断问题形成稳定分流
3.  不是单纯视觉现象改写
4.  能承接后续诊断提问与行动策略
5.  明确属于问题性结论，而不是正常特征或不确定保留

---

### 3. 诊断目标三层结构

本系统 v1.2 采用三层问题结构：

1.  **问题簇（problem cluster）**
2.  **诊断问题（problem）**
3.  **问题变体（problem variant）**

其中：

-   第 2 层是 v1.2 真正的主竞争层
-   第 1 层用于组织和治理
-   第 3 层仅作研究预留与未来升级候选层

但必须补充：

-   这三层共同只覆盖“问题性结论空间”
-   不覆盖非问题性结论与不确定结论

#### 3.1 第 1 层：问题簇（problem cluster）

问题簇只负责：

-   组织知识库
-   约束模式证据数量
-   约束诊断提问数量
-   辅助候选裁剪
-   辅助系统范围管理

问题簇**不负责**：

-   最终主排序
-   直接输出给用户作为主诊断
-   替代诊断问题
-   表达非问题性结论

##### 是否互斥

### **问题簇不是互斥层。**

#### 3.2 第 2 层：诊断问题（problem）

诊断问题统一采用：

### **可行动的机制 / 原因层**

并且必须明确：

### **它只属于问题性结论。**

#### 3.3 第 3 层：问题变体（problem variant）

问题变体层在 v1.2 禁止：

-   参与主竞争池
-   大规模进入主规则表
-   直接绑定首发行动策略
-   直接暴露给用户
-   用来承载非问题性结论或不确定结论

---

### 4. 什么不能作为诊断问题

#### 4.1 不能把症状当诊断问题

#### 4.2 不能把模式证据当诊断问题

#### 4.3 不能把行动建议当诊断问题

#### 4.4 不能把模糊状态词当诊断问题

#### 4.5 不能把非问题性结论当诊断问题

以下对象不允许直接作为诊断问题：

-   艺斑 / 稳定斑驳特征
-   品种固有花纹
-   老叶自然退化
-   旧机械伤但无扩展性
-   正常阶段性浅色新叶
-   可接受轻微色差

#### 4.6 不能把不确定结论当诊断问题

以下对象不允许直接作为诊断问题：

-   信息不足
-   需要补图
-   需要补问
-   需要观察扩展情况
-   暂无法安全判断

---

### 5. 命名规则

#### 5.1 命名必须优先表达“诊断对象”，而不是“观察现象”

#### 5.2 命名允许使用“样问题”，但必须服从准入规则

#### 5.3 命名必须同时具备中英文语义

#### 5.4 命名不得偷渡非问题性结论

即使一个对象容易命名，只要它本质上属于：

-   正常特征
-   正常阶段现象
-   非病理性旧痕
-   不确定保留项

都不得因为“可以命名”而混入 problem taxonomy。

---

### 6. 层级竞争规则

#### 6.1 同一竞争池只允许同层级对象竞争

v1.2 主竞争池只允许第 2 层“诊断问题”进入。

禁止：

-   问题簇与诊断问题同池竞争
-   诊断问题与问题变体同池竞争
-   症状与诊断问题同池竞争
-   模式证据与诊断问题同池竞争
-   非问题性结论与诊断问题同池竞争
-   不确定结论与诊断问题同池竞争

---

### 7. v1.2 的最小可闭环建议

建议优先形成闭环的第一批问题簇：

1.  叶斑类问题簇
2.  刺吸式虫害问题簇
3.  浇水胁迫问题簇
4.  光照胁迫问题簇
5.  表面附着 / 表面生长类问题簇

同时必须保证：

-   至少存在一批高价值非问题性结论对象
-   至少存在不确定结论出口

---

### 8. 最终裁决

本系统的诊断目标分层在 v1.2 阶段，采用：

-   第 1 层：问题簇（problem cluster）
-   第 2 层：诊断问题（problem）
-   第 3 层：问题变体（problem variant）

其中：

-   第 2 层统一为“可行动的机制 / 原因层”
-   第 2 层只属于问题性结论空间
-   纯表现型、组合型、形态型对象，默认归入证据层或模式证据层
-   非问题性结论与不确定结论不属于 problem taxonomy
-   第 1 层是组织层，不是互斥单选层
-   第 3 层只作研究预留与未来升级候选层，不进入首发核心竞争

### 【完整保留的基线正文结束】

### 诊断目标分层 v1.3（联动增补版，基于 v1.2 只增不减）

> 说明：
> 
> -   本文档基于《诊断目标分层 v1.2（增补修正版，基于 v1.1 只增不减）》继续增补。
> -   本次增补来源：**《诊断结论层 v1.1（review 增补修正版）》**
> -   目标：进一步锁死 problem taxonomy 与 outcome layer 的边界。

---

### 附录 B：诊断结论层 v1.1 联动增补（本次新增，不替换原文与附录 A）

#### B-1. problem taxonomy 与非问题性结论的边界进一步锁死

新增边界规则：

### **problem taxonomy 只定义“问题性诊断对象”，不定义非问题性结论对象，也不定义不确定结论对象。**

即使一个对象：

-   看起来容易命名
-   看起来也能被描述
-   看起来不是问题

也不代表它可以进入 problem taxonomy。

---

#### B-2. 某些“正常判断依据”仍只是证据，不是 outcome 对象，更不是 problem 对象

新增边界规则：

以下类型对象通常更适合作为：

-   证据
-   或结论支持依据

而不是独立的 problem / outcome 对象：

-   无扩展性
-   边界清晰
-   长期存在
-   单片叶受影响
-   某种细碎局部轻微色差

补充说明：

-   这些内容常常对“正常性判断”很有价值
-   但它们的层级应是 evidence 或 support rationale
-   不得因为“有解释价值”就直接写进 problem taxonomy

---

#### B-3. 新增“不能作为诊断问题”的对象类型补充

在原有基础上，新增明确不允许进入 problem taxonomy 的类型：

##### 正常判断依据类

-   边界清晰
-   无扩展性
-   长期稳定存在
-   单叶局部轻微差异

##### 结论触发条件类

-   输入不足
-   继续提问收益过低
-   当前轮次证据冲突未解

这些不是 problem，它们属于：

-   证据
-   停止条件依据
-   不确定结论触发依据

---

#### B-4. 问题性诊断对象的准入边界追加

新增准入边界：

一个对象若本质上属于以下任意一种情况，则不得进入诊断问题层：

-   只是正常性判断依据
-   只是非问题性结论支持依据
-   只是“不确定结论”的触发条件
-   只是观察事实而非可行动解释对象

---

#### B-5. 对复合场景的边界承认

新增边界说明：

### **problem taxonomy 只定义问题性诊断对象，但现实中允许存在“背景非问题性特征 + 局部问题性变化”的复合场景。**

这意味着：

-   背景正常特征不应进入 problem taxonomy
-   但局部新出现的问题性变化仍然可以进入 problem taxonomy
-   后续 runtime / outcome 层必须允许二者在解释上共存

---

#### B-6. 最小闭环要求补充

在原有首批问题簇闭环基础上，再补充一条：

-   problem taxonomy 的首批闭环设计，不仅要考虑“能否判断问题”
-   还要确保后续能与 outcome layer 正确分工
-   即：problem 负责问题性对象，非问题性与不确定交给 outcome layer

### 诊断目标分层 v1.4（AI视觉入口层 / Taxonomy / 身份主链路联动增补版，基于 v1.3 只增不减）

> 说明：
> 
> -   本文档基于《诊断目标分层 v1.3（联动增补版，基于 v1.2 只增不减）》继续增补。
>     
> -   本次增补目标：
>     
>     -   把 AI视觉入口层、Taxonomy、植物身份主链路正式联动进目标分层边界
>     -   明确哪些对象属于 problem taxonomy，哪些对象绝不属于
>     -   防止身份链、症状链、流程链重新污染问题层
> -   本文档继续遵循：
>     
> 
> # **基于上一版更新只能新增不可减少**
> 
> -   本版继续坚持：
> 
> # **中文是一等公民**
> 
> # **中文主名优先**
> 
> # **英文仅作辅助标记**

---

### 附录 A：AI视觉入口层 / Taxonomy / 身份主链路联动增补（本次新增，不替换原文）

#### A-1. 植物身份对象（plant identity entity）不属于诊断问题分层

新增正式边界：

### **植物身份对象不属于诊断问题分层。**

植物身份对象承载的是：

-   植物身份归一
-   canonical identity（主身份主名）
-   family / genus / species
-   aliases / common names
-   宿主基础标签
-   宿主先验挂点

它属于：

-   身份层
-   Taxonomy 主数据层
-   宿主结构层

而不属于：

-   问题簇
-   problem
-   problem variant
-   problem family

---

#### A-2. Taxonomy 不属于 problem taxonomy

新增正式边界：

### **Taxonomy 不属于 problem taxonomy。**

Taxonomy 的职责是：

-   定义植物身份
-   组织 family / genus / species
-   承接百度识别命中直取
-   提供宿主背景与基础标签

它不是：

-   问题对象集合
-   问题解释层
-   问题层级树
-   症状到问题的映射层

这条必须写死，否则后续会再次把植物分类和问题分类混成一套“taxonomy”。

---

#### A-3. 植物身份主链路不属于诊断问题分层

新增正式边界：

当前植物身份主链路：

### **百度植物识别 → Taxonomy 匹配 → 命中直取**

这条链路产出的是：

-   当前会话植物身份主结果
-   身份未命中状态
-   宿主先验挂点
-   explanation 用身份信息

它不产出：

-   problem
-   problem cluster
-   problem hypothesis
-   outcome object

因此：

### **身份主链路是上游输入链，不是问题分层的一部分。**

---

#### A-4. AI symptom 候选不属于 problem taxonomy

新增正式边界：

### **AI symptom 候选不属于 problem taxonomy。**

AI symptom 候选是：

-   原始视觉异常候选
-   候选观察层结果
-   canonical symptom 映射的上游输入

它不是：

-   problem
-   problem variant
-   problem cluster

如果不写死这一条，后面很容易把“模型看起来像什么问题”直接误写成 problem taxonomy 的对象。

---

#### A-5. canonical symptom 也不属于 problem taxonomy

新增正式边界：

### **canonical symptom 也不属于 problem taxonomy。**

canonical symptom 属于：

-   symptom 业务规范层
-   正式证据层
-   diagnosis 输入层

它可以影响：

-   problem competition
-   outcome competition
-   question selection

但它本身不是：

-   problem
-   problem variant
-   problem family

---

#### A-6. route hint 不属于 problem taxonomy

新增正式边界：

### **route hint（路由建议）不属于 problem taxonomy。**

例如：

-   优先补图
-   优先问稳定性
-   优先问宿主确认
-   优先不确定预备

这些都属于：

-   流程层
-   调度层
-   follow-up 设计层

它们不是 problem。

---

#### A-7. 图像质量结果、器官提示、器官识别结果都不属于 problem taxonomy

新增正式边界：

以下对象都不属于问题分层：

-   图像质量结果
-   结构化器官槽位提示
-   器官识别结果
-   区域候选结果
-   TopK 排名位次
-   质量 / 冲突 / 漂移风险状态

它们属于：

-   输入质量层
-   症状链内部层
-   流程提示层
-   数据治理层

而不是 problem layer。

---

#### A-8. 宿主先验不属于 problem taxonomy

新增正式边界：

### **宿主先验不属于 problem taxonomy。**

宿主先验的作用是：

-   弱偏置
-   question 优先级微调
-   explanation 辅助
-   非问题性候选排序微调

它不能被视为：

-   problem 本体
-   problem 层级
-   problem 的替代物

---

#### A-9. problem taxonomy 的核心职责进一步明确

为避免上游对象继续侵蚀问题层，现进一步明确：

### **problem taxonomy 的职责只包括“问题性解释对象”的组织与分层。**

它关注的仍然是：

-   哪类问题对象存在
-   这些对象之间如何分层
-   它们如何与 symptom / evidence / prior / question 发生关系
-   它们如何进入 hypothesis / outcome competition

它不负责定义：

-   植物身份
-   图像质量
-   器官结果
-   AI symptom 候选
-   Taxonomy 分类树
-   流程路由建议

---

#### A-10. 身份链与问题层的关系总裁决

新增正式裁决：

### **身份链给的是宿主侧结构，不是问题层对象。**

也就是说：

##### 身份链提供

-   plant identity
-   family / genus / species
-   宿主标签
-   宿主先验挂点
-   explanation 用植物名

##### 问题层负责

-   问题性对象定义
-   问题层级组织
-   问题竞争与收敛

二者关系是：

### **在运行时汇合**

而不是：

### **在目标分层里混成同一种对象**

---

#### A-11. 症状链与问题层的关系总裁决

新增正式裁决：

### **症状链给的是候选证据，不是问题层对象。**

也就是说：

##### 症状链提供

-   AI symptom 候选
-   canonical symptom
-   pattern candidate
-   图像质量
-   route hint
-   器官提示与器官结果

##### 问题层负责

-   根据正式证据与宿主结构，组织问题竞争对象

这意味着：

-   症状链低于问题层
-   症状链不能越层改写 problem taxonomy
-   症状链不能把“模型看起来像某问题”直接注入 problem 对象池

---

#### A-12. 当前问题层不得吸收的对象清单

为防止后续继续混层，现新增一份“问题层禁止吸收对象清单”：

##### 明确禁止吸收进 problem taxonomy 的对象

-   植物身份对象
-   identity unresolved
-   Taxonomy 分类路径
-   百度返回植物名
-   器官槽位提示
-   器官识别结果
-   图像质量状态
-   AI symptom 候选
-   canonical symptom
-   pattern candidate
-   route hint
-   宿主先验本身

##### 说明

这些对象可以：

-   影响 problem 竞争
-   影响 explanation
-   影响 question
-   影响 outcome

但它们本身都不是 problem taxonomy 的正式成员。

---

#### A-13. 当前文档链的含义

本附录补入后，应统一理解：

-   Taxonomy / 身份链 = 宿主侧正式结构层
-   AI symptom / canonical symptom / pattern = 证据侧层
-   route hint / 图像质量 / 器官提示 = 流程与输入约束层
-   problem taxonomy = 问题性解释对象层

这些层级不得重新打平。



## [S09] 诊断结论层 v1.2（完整最终版，基于 v1.1 只增不减）

- 文件名：`diagnosis_outcome_layer_v1_2_full_final.md`
- 状态：A类正式基线
- 类别：诊断主链
- 用途：诊断结论层；定义问题性/非问题性/不确定三类最终结果空间
- SHA-256 前 16 位：`e6056fdbc6c9d610`

---

### 诊断结论层 v1.2（完整最终版，基于 v1.1 只增不减）

> 版本说明：
>
> - 本文件为**完整可交付的最终文件**，不是纯补丁。
> - 本文件完整保留基线文件正文，并在其后按“只增不减”原则追加后续有效增补内容。
> - 本文件的版本责任链为：
>   - v1：基线正文
>   - v1.1：review 增补修正版（完整基线）
>   - v1.2：AI视觉入口层 / Taxonomy / 身份主链路联动增补
>
> - 阅读顺序：
>   1. 先读本文件顶部版本说明
>   2. 再读“完整保留的基线正文”
>   3. 最后读后续新增附录
>
> - 说明：
>   - 为避免再次出现“只有补丁、没有完整正文”的问题，本文件采用“封面说明 + 基线正文原样保留 + 后续附录追加”的最终文件形态。
>   - 基线正文不删不改，后续版本内容只做新增。

---

### 【完整保留的基线正文开始】
### 诊断结论层 v1.1（review 增补修正版，基于 v1 只增不减）

> 说明：
>
> - 本文档遵循“**基于上一版更新只能新增不可减少**”的规则。
> - 因此，本版不是压缩重写版，而是**在《诊断结论层 v1》基础上做增补修订**。
> - 本次增补的核心目的，是把深度 review 中指出的关键边界问题补齐：
>   - 非问题性结论 vs 证据边界
>   - 不确定结论的合法触发条件
>   - hypothesis layer 与 outcome layer 的主从关系
>   - 非问题性结论不等于永远无需观察
> - 本文档应与以下文档配套阅读：
>   - 《诊断系统硬约束清单 v2.2（增补修正版，基于 v2 只增不减）》
>   - 《诊断目标分层 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《核心数据结构 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《运行时模型 v1.1（review 增补修正版，基于 v1 只增不减）》

---

### 诊断结论层 v1

> 目标：正式定义本系统最终可输出的“结论空间”，明确系统不只支持“问题性结论”，还必须支持“非问题性结论”和“不确定结论”。
>
> 本文档用于修正此前默认“系统最终一定在诊断问题（problem）层内收敛”的隐含前提。

---

### 0. 文档定位

在本系统中，**诊断问题（problem）** 只表示：

- 病
- 虫
- 胁迫
- 营养失衡
- 损伤机制问题

也就是说，诊断问题只是：

### **问题性结论空间的一部分**

但真实用户场景中，系统必须回答的不只是：

- 这是什么问题？

还包括：

- 这根本不是问题，是正常特征吗？
- 这是正常生长阶段现象吗？
- 这是旧痕迹但当前不构成问题吗？
- 现在信息不足，能不能先别硬判？

因此，本系统必须引入：

### **诊断结论层（outcome layer）**

它比“诊断问题层”更高一层，负责定义系统最终可以输出的完整结果空间。

---

#### 0.1 文档语言规则

本文件继续严格执行：

- 中文是一等公民，是主定义语言。
- 英文只作为辅助键名、辅助字段名、代码实现映射名。
- 若两个英文概念不同，则中文主名也必须不同。
- 文档默认表达顺序统一为：**中文主名（英文辅助名）**。

---

### 1. 为什么必须有诊断结论层

#### 1.1 防止系统天然过诊断

如果系统最终只能在诊断问题（problem）里选一个结果，就会天然产生一个偏置：

> 只要观察到了异常，就必须把它解释成某种问题。

这会导致：

- 正常特征被误判成问题
- 生长阶段正常变化被误判成问题
- 历史旧伤痕被误判成当前问题
- 可接受波动被误判成需要处理的问题

因此，系统必须允许：

> **当前观察结果并不构成诊断问题**

成为正式合法结论。

---

#### 1.2 用户真实需求不只是“查病”

真实用户经常问的不是：

- 这是什么病？

而是：

- 这是病吗？
- 这是天生的吗？
- 这是正常的吗？
- 这是老叶自然变化吗？
- 这个斑是不是本来就有？

这说明系统必须原生支持：

- 问题性结论
- 非问题性结论
- 不确定结论

而不是只支持诊断问题。

---

### 2. 诊断结论层的三大结论类型

本系统 v1 采用三类最终结论：

#### A. 问题性结论（problematic outcome）

中文定义：当前更像真实问题，需要进入诊断、分流、处理或观察策略。

这类结论通常落在：

- 真菌性叶斑类问题
- 细菌性叶斑类问题
- 刺吸式虫害问题
- 咀嚼型虫害问题
- 过浇胁迫问题
- 缺水胁迫问题
- 日灼损伤问题
- 营养失衡问题

注意：

- 诊断问题（problem）属于问题性结论
- 但问题性结论不等于系统全部结论空间

---

#### B. 非问题性结论（non-problematic outcome）

中文定义：当前更像正常特征、正常阶段现象、非病理性痕迹、或可接受状态，不应被默认解释成诊断问题。

这类结论不是单个特例集合，而是一整类正式结果空间。

##### v1 建议至少包含以下 4 类非问题性结论

##### B1. 先天 / 稳定特征类

例如：

- 斑锦 / 锦化特征
- 艺斑 / 稳定斑驳特征
- 品种固有花纹
- 品种固有色带
- 稳定白边、黄边、色块差异

##### B2. 生长阶段正常现象类

例如：

- 老叶自然退化
- 新叶暂时偏浅
- 新叶未完全展开时的暂时形变
- 转色过程中的暂时差异
- 花后 / 换季期可接受变化

##### B3. 非病理性轻微损伤类

例如：

- 旧机械伤
- 已愈合擦伤
- 单次摩擦痕
- 非扩展性旧晒痕
- 已停止发展的历史损伤

##### B4. 可接受波动 / 暂不构成问题类

例如：

- 轻微色差
- 个别叶片小范围瑕疵
- 暂时性轻度应激但整体长势正常
- 局部轻微损耗但无扩展性
- 可观察、暂不处理的状态

---

#### C. 不确定结论（uncertain outcome）

中文定义：当前不能安全判为问题性结论，也不能安全判为非问题性结论。

这类结论必须合法存在，不能被系统硬塞进某个问题性结果。

典型情况包括：

- 信息不足
- 图片质量不足
- 关键证据缺失
- 正常特征与问题特征混杂
- 需要补图
- 需要补问
- 需要继续观察

---

### 3. 诊断问题层与诊断结论层的关系

#### 3.1 诊断问题不是最终输出空间的全集

这是本文件最重要的一条边界。

必须明确：

- 诊断问题（problem）只覆盖“问题性结论”
- 非问题性结论不属于 problem taxonomy
- 不确定结论也不属于 problem taxonomy

也就是说：

### **诊断问题层 ⊂ 诊断结论层**

而不是：

### **诊断问题层 = 系统全部结果空间**

---

#### 3.2 诊断问题层仍然保留原职责

引入诊断结论层后，并不意味着诊断问题层失效。

诊断问题层仍负责：

- 问题性结果的竞争
- 问题性结果的排序
- 问题性结果的分流
- 问题性结果的行动建议承接

只是现在系统最终输出时，可以不落在 problem 上。

---

### 4. 非问题性结论不等于“完全没有异常”

这是一个必须写清的边界。

非问题性结论不代表：

- 完美无任何痕迹
- 完全无任何异常视觉
- 必然无任何变化

它只表示：

> **当前观察结果更像正常特征、正常阶段变化、非病理性旧痕，或暂不构成诊断问题。**

所以：

- 有斑驳，不一定是病
- 有伤痕，不一定是当前问题
- 有黄叶，不一定是病理结论
- 有颜色变化，不一定需要进入问题层

---

### 5. 不确定结论不等于系统失败

另一条必须写清楚的边界是：

> **不确定结论是合法结果，不是系统失败。**

如果当前证据不足，系统最正确的行为不是乱判，而是输出：

- 暂无法安全判断
- 需要补图
- 需要补问
- 需要观察是否扩展

这比“为了给答案而硬判一个诊断问题”更可靠。

---

### 6. 诊断结论层的最小结构建议

虽然本文件主要定义概念层，而不是完整 schema，但为了后续《核心数据结构》修订，先给出最小结构建议。

#### 主对象：诊断结论（outcome）

最少应包含：

- `outcome_key`：结论键
- `中文名`
- `英文辅助名`
- `结论类型`
  - 问题性结论
  - 非问题性结论
  - 不确定结论
- `关联对象类型`
  - 诊断问题
  - 非问题性对象
  - 不确定性原因
- `关联对象键`
- `是否允许对外输出`
- `是否进入 v1`
- `说明`
- `状态`

---

### 7. 诊断提问与诊断结论层的关系

引入诊断结论层之后，诊断提问的职责要更清楚：

诊断提问不只是为了证明“是什么问题”，还要支持：

- 证明它可能根本不是问题
- 证明它更像稳定特征
- 证明它更像旧痕 / 非扩展性痕迹
- 证明当前信息仍不足以下病理结论

所以诊断提问后面服务的，不应该只是问题性结论，还包括：

- 问题性结论分流
- 非问题性结论确认
- 不确定结论保留

---

### 8. 行动策略与诊断结论层的关系

引入诊断结论层后，行动策略不能只支持：

- 明确处理
- 保守处理
- 继续观察
- 补图补问

还必须正式支持：

#### 针对非问题性结论的动作

例如：

- 无需处理
- 属正常特征
- 暂不建议按病害处理
- 正常阶段现象，仅继续观察
- 非病理性旧痕，无需额外干预

#### 针对不确定结论的动作

例如：

- 补拍更多部位
- 补充环境信息
- 观察 3–7 天是否扩展
- 暂不建议过度处理

---

### 9. 与现有文档的关系

本文件将反向影响至少 3 份已有文档：

#### 9.1 《诊断系统硬约束清单 v2》

必须补充：

- 系统必须支持非问题性结论这一整类结果
- 不得默认“除少数特例外，其余全部归入问题性结论”
- 行动策略必须支持“无需处理 / 仅观察 / 正常特征”类输出

---

#### 9.2 《诊断目标分层 v1.1》

必须补充：

- 诊断问题层只定义“问题性结论空间”
- 它不是系统全部最终结果空间
- 非问题性结论与不确定结论不属于 problem taxonomy

---

#### 9.3 《核心数据结构 v1.1》

必须补充：

- 在六大主对象之外，新增“诊断结论层（outcome layer）”
- 或将其提升为正式主对象

否则“非问题性结论”仍然没有正式归宿。

---

### 10. 最终裁决

本系统未来不应只回答：

- 这是什么问题？

还必须能回答：

- 这不是问题，是正常特征
- 这更像正常阶段现象
- 这更像旧痕，不构成当前问题
- 现在还不能安全下结论

因此，系统最终输出空间必须正式分成：

1. **问题性结论**
2. **非问题性结论**
3. **不确定结论**

这三类共同构成：

### **诊断结论层（outcome layer）**

而诊断问题（problem）只是其中一部分。

---

### 11. 下一步

下一步不应直接继续写新模块，而应先做一轮回改：

1. 回改《诊断系统硬约束清单 v2》
2. 回改《诊断目标分层 v1.1》
3. 回改《核心数据结构 v1.1》

确保三份基础文档与本文件保持一致。 

然后再进入：

**《运行时模型 v1》**

否则运行时模型会继续建立在旧的、只支持 problem 收敛的前提上。 

---

### 12. 备注

“艺斑”只是一个例子，不代表“只有艺斑属于正常结论，其他全部都是问题”。

本文件的正式立场是：

> **系统必须原生支持“非问题性结论”这一整类结果空间。**

而不是把正常结果收缩成少数特例。 

---

### 13. 下载与版本说明

本文档为当前诊断架构的新增基础文档之一，应与以下文档配套阅读：

- 《诊断系统硬约束清单 v2（中文主名优先修正版）》
- 《诊断目标分层 v1.1（review 修正版）》
- 《核心数据结构 v1.1（review 修正版）》

后续若本文件升级版本，应同步回改上述文档中的相关边界说明。

---

**版本：v1**
**状态：待回改上游文档后进入联动版**
**建议下一动作：回改 3 份基础文档**

---

### 附录 A：review 后的关键边界增补（本次新增，不替换上文）

> 本附录为 v1.1 相比 v1 的**纯新增内容**，用于补齐深度 review 中识别出的核心边界问题。

#### A-1. 非问题性结论对象 vs 证据 的边界必须锁死

新增硬规则：

### **非问题性结论对象，必须是可稳定对外表达、对用户有独立认知价值、且能承接动作策略的结果对象。**

因此，并不是所有“看起来不是问题”的内容，都有资格直接成为 outcome 对象。

##### 可以成为非问题性结论对象的例子
- 稳定斑锦 / 锦化特征
- 品种固有花纹
- 老叶自然退化
- 非病理性旧机械伤
- 正常阶段性浅色新叶

##### 通常不应直接成为非问题性结论对象的例子
- 无扩展性
- 边界清晰
- 长期存在
- 单片叶受影响
- 某个很细碎的局部轻微色差（若不足以独立对外表达）

这些更适合作为：
- 证据
- 或非问题性结论的支持依据

##### 补充原则
如果一个对象：

- 不能稳定复用
- 对用户没有独立表达价值
- 不能稳定承接动作策略
- 只是某种判断依据

则它默认不应进入 outcome 层。

---

#### A-2. 非问题性结论建议细分为“稳定正常”与“暂时可接受”

为了增强后续 action policy 与 runtime 承接能力，新增建议分类：

##### A-2.1 稳定正常类
本质上是正常特征或正常阶段现象，例如：

- 品种固有花纹
- 稳定斑锦
- 老叶自然退化
- 稳定色带
- 已知正常叶色差异

##### A-2.2 暂时可接受类
当前不构成问题，但可能需要轻量观察，例如：

- 轻微应激但整体长势正常
- 局部轻微损耗
- 暂时性波动
- 已停止发展的旧痕，但仍建议观察后续是否继发变化

这不是要求当前立刻把 schema 拆成两张表，而是要求：

- 在 outcome 设计时保留这个语义分层
- 避免后续把所有非问题性结论混成同一种动作强度

---

#### A-3. 不确定结论的合法触发条件必须写死

新增硬规则：

### **不确定结论只有在满足“继续推理收益不足，或关键输入缺失无法补齐，或证据冲突无法在当前轮次解决”时，才允许作为正式收敛结果。**

换句话说：

- 不确定不是偷懒出口
- 不确定不是默认安全垫
- 不确定不是“系统没想好”的替代词

##### 合法触发类型建议至少包括：

###### A-3.1 输入不足型
- 图片太差
- 主体缺失
- 关键部位没拍到
- 非植物图像疑似
- 文字描述不足以支撑判断

###### A-3.2 证据冲突型
- 问题性方向与非问题性方向证据强冲突
- 用户前后回答冲突
- 当前轮次无法解除冲突

###### A-3.3 继续提问收益过低型
- 继续追问也无法显著提升结论质量
- 用户已中断
- 当前能收集到的高价值信息已耗尽

---

#### A-4. hypothesis layer 与 outcome layer 的主从关系必须明确

新增架构边界：

### **上游是候选解释对象竞争，下游才是结论类型收敛。**

也就是说：

- hypothesis layer 是解释过程层
- outcome layer 是最终输出层

因此：

- outcome layer 不替代 hypothesis layer
- outcome layer 也不是简单复制 hypothesis 排序
- outcome 收敛，必须受解释对象竞争驱动

##### 这一条的直接后果
后续所有运行时与决策流文档都必须遵守：

- 先有解释对象竞争
- 再有结论类型收敛

而不是一开始就直接在“问题性 / 非问题性 / 不确定”三类里拍脑袋选一个。

---

#### A-5. 非问题性结论不等于永远完全无需观察

新增边界说明：

### **非问题性结论不等于“永远完全不需要后续观察”，它只表示当前不构成问题性诊断结论。**

这意味着：

- 非问题性结论可以无需处理
- 但不代表永远不需要任何提示或复核

例如：

- 老叶自然退化：通常无需处理，但可提示观察新叶是否正常
- 稳定斑锦特征：通常无需按病害处理，但可提示若后续快速扩展则再复查
- 非病理性旧伤：无需处理，但可提示观察是否继发感染

因此 action policy 后续必须支持：

- 无需处理
- 仅观察
- 条件性复查提示

而不能把所有非问题性结论粗暴归为同一输出模板。

---

#### A-6. outcome 对象字段建议增强

在 v1 最小字段基础上，新增建议字段方向：

##### 建议新增
- `输出保守度`
  - 明确输出
  - 保守输出
  - 仅观察型输出
  - 需补充信息后再输出

这个字段的价值在于：

- 更好承接 action policy
- 支持“非问题性但仍建议轻量观察”
- 支持“不确定但已足够对外说明”的场景

---

#### A-7. outcome 的宿主适用范围需要可表达

新增边界说明：

### **非问题性结论对象可以是通用结论，也可以是宿主受限结论；是否宿主受限必须在后续 schema 或规则层可表达。**

例如：

##### 通用型 outcome
- 老叶自然退化
- 非病理性旧机械伤

##### 宿主受限型 outcome
- 某些特定属 / 种常见的固有花纹
- 某些特定品种的稳定色带特征

这样可以避免后续误把：

- 特定植物才成立的正常特征
- 当成所有植物通用 outcome

---

#### A-8. 允许存在“背景非问题性特征 + 局部问题性变化”的复合场景

新增边界说明：

### **诊断结论层的主输出应有主导结论，但不排除存在“背景非问题性特征 + 局部问题性变化”这类复合场景。**

典型例子：

- 原本有稳定斑锦，但局部新出现病斑
- 原本有旧机械伤，但当前局部继发感染

这条边界的意义是：

- 防止系统误以为非问题性与问题性永远完全互斥
- 为未来多层解释或复合输出预留合法空间

注意：
- 这不要求 v1.1 立刻支持完整复合输出
- 但必须先在文档中承认这类场景合法存在

---

#### A-9. 增加用户视角最小输出模板约束

为防止 outcome 设计脱离用户感知，新增最小模板建议：

##### A-9.1 问题性结论输出模板
- 当前更像什么问题
- 为什么这样判断
- 建议做什么

##### A-9.2 非问题性结论输出模板
- 当前更像什么正常 / 非病理性情况
- 为什么不更像问题
- 是否需要观察

##### A-9.3 不确定结论输出模板
- 当前为什么不能安全判断
- 缺什么
- 下一步要补什么

这条模板不是前端文案定稿，而是对 outcome 设计提出反向约束：

- 不能稳定对外表达的 outcome，不应轻易入库

---

#### A-10. “非问题性结论是一整类结果空间”升级为正式规则

将原文中偏备注性质的提醒，升级为正式规则：

### **系统必须原生支持“非问题性结论”这一整类结果空间，不得把正常结论收缩为少数特例集合。**

补充说明：

- “艺斑”只是举例，不是唯一正常结论
- 非问题性结论应覆盖：
  - 先天 / 稳定特征
  - 生长阶段正常现象
  - 非病理性旧痕
  - 暂时可接受状态

---

#### A-11. 本次增补对其他文件的联动要求

若采用本 v1.1 增补版，则至少需要同步增补以下文档：

##### A-11.1 《诊断系统硬约束清单 v2.2》
需补：
- 非问题性结论对象的准入边界
- 不确定结论的合法触发边界
- 非问题性结论不等于完全无需观察

##### A-11.2 《诊断目标分层 v1.2》
需补：
- problem taxonomy 与非问题性结论的边界更硬
- 明确某些“正常判断依据”仍只是证据，不是 outcome 对象

##### A-11.3 《核心数据结构 v1.2》
需补：
- outcome_layer 字段增强
- 至少考虑补入：
  - 输出保守度
  - 宿主适用范围
  - 结论子类型

##### A-11.4 《运行时模型 v1.1》
需补：
- outcome_pool 中不确定结论的触发条件
- outcome_item 的保守输出 / 观察输出边界
- 复合场景是否允许双层解释的边界说明

---

### 本版状态说明

- 本版保留 v1 正文主体
- 仅通过“附录 A”增补深度 review 后的关键边界
- 未对原有适用条款做删减


### 【完整保留的基线正文结束】
### 诊断结论层 v1.2（AI视觉入口层 / Taxonomy / 身份主链路联动增补版，基于 v1.1 只增不减）

> 说明：
>
> - 本文档基于《诊断结论层 v1.1（review 增补修正版）》继续增补。
> - 本次增补目标：
>   - 把 AI视觉入口层、Taxonomy、植物身份主链路正式联动进结论层边界
>   - 明确哪些对象**不是**诊断结论对象（outcome object）
>   - 防止入口层状态、身份链状态、流程建议层重新污染结论层
>
> - 本文档继续遵循：
>
> # **基于上一版更新只能新增不可减少**
>
> - 本版继续坚持：
>
> # **中文是一等公民**
> # **中文主名优先**
> # **英文仅作辅助标记**

---

### 附录 A：AI视觉入口层 / Taxonomy / 身份主链路联动增补（本次新增，不替换原文）

#### A-1. 植物身份主结果不是诊断结论对象

新增正式边界：

### **植物身份主结果不是诊断结论对象。**

当前植物身份主链路为：

### **百度植物识别 → Taxonomy 匹配 → 命中直取**

命中后产生的是：

- 当前会话植物身份主结果
- 宿主基础信息
- 宿主先验挂点
- explanation 用植物主名与分类信息

这些对象的层级属于：

- 身份层
- 输入归一层
- 宿主侧结构层

而不属于：

- 问题性结论对象
- 非问题性结论对象
- 不确定结论对象

---

#### A-2. 身份未命中（identity unresolved）不是诊断结论对象

新增正式边界：

### **身份未命中不是诊断结论对象。**

`identity unresolved` 表示的是：

- 植物身份主链路当前未稳定命中
- 上游输入仍处于身份未归一状态
- 宿主先验信息不足或降级

它不是：

- 不确定结论对象
- 诊断问题对象
- 非问题性结论对象

##### 解释
“身份未命中”可能会提高：
- 补图优先级
- explanation 中的保守表达
- 对宿主先验的降权

但它本身不应被系统输出为一个正式 outcome object。

---

#### A-3. route hint（路由建议）不是诊断结论对象

新增正式边界：

### **路由建议不是诊断结论对象。**

例如：

- 优先补图
- 优先问稳定性
- 优先问扩展性
- 优先进入不确定预备
- 优先问宿主确认

这些都是：

- 流程层建议
- 问题层优先级提示
- 运行时调度信息

而不是：

- 问题性结论
- 非问题性结论
- 不确定结论

---

#### A-4. 图像质量状态不是诊断结论对象

新增正式边界：

### **图像质量状态不是诊断结论对象。**

例如：

- 可分析
- 勉强可分析
- 不足以分析
- 关键区域不可见
- 主体完整性不足

这些都属于：

- 上游输入质量状态
- 证据可用性状态
- 不确定路径触发条件

它们可以影响 outcome，但不应自己变成 outcome。

---

#### A-5. 器官槽位提示与器官识别结果不是诊断结论对象

新增正式边界：

### **器官槽位提示与器官识别结果都不是诊断结论对象。**

例如：

- 图1 是叶片图
- 当前图主要器官为茎
- 当前图疑似根 / 根颈部位

这些属于：

- 结构化输入提示
- 器官识别层结果
- 症状映射约束条件

它们可以影响：
- canonical symptom 映射
- follow-up 设计
- route hint 选择

但它们本身不是 outcome object。

---

#### A-6. AI symptom 候选不是诊断结论对象

新增正式边界：

### **AI symptom 候选不是诊断结论对象。**

AI symptom 候选属于：

- 原始视觉证据层
- 候选观察层
- symptom 映射上游层

它最多只能进入：

- 标准化候选层
- 接纳判定层
- observed evidence 链

它不能直接进入：

- outcome layer
- final output layer

---

#### A-7. canonical symptom 也不是诊断结论对象

新增正式边界：

### **canonical symptom 也不是诊断结论对象。**

这一条必须强调，因为系统后续很容易再次混层。

canonical symptom 属于：

- 正式证据层
- symptom 业务规范层
- problem / outcome 竞争的输入层

它不是：
- problem
- outcome
- action policy

---

#### A-8. Taxonomy 与宿主先验不是诊断结论对象

新增正式边界：

### **Taxonomy 与宿主先验都不是诊断结论对象。**

Taxonomy 提供的是：

- 植物身份
- family / genus / species
- 主名 / 别名归一
- 宿主基础标签
- 宿主先验挂点

宿主先验提供的是：

- 弱偏置
- question 优先级调整
- explanation 辅助
- 某些非问题性候选排序微调

二者都不能直接被当作 outcome。

---

#### A-9. 不确定结论对象的边界进一步收紧

新增正式约束：

### **不确定结论对象只能来自诊断结论层允许的合法触发原因，不得吸收上游任意状态词。**

也就是说：

##### 可以作为不确定结论对象来源的
- 输入不足型不确定
- 证据冲突型不确定
- 继续提问收益过低型不确定

##### 不可以直接当作不确定结论对象的
- 身份未命中
- route hint 建议不确定预备
- 图像质量差
- 器官未明
- TopK 漂移大

这些都可能是**触发条件、支持理由、解释说明**，但不应直接提升为新的不确定 outcome object。

---

#### A-10. 非问题性结论对象的边界进一步收紧

新增正式约束：

非问题性结论对象仍然必须满足：

- 是结果对象
- 能对外稳定表达
- 有独立认知价值
- 能承接动作策略

因此以下对象依然不得误入非问题性 outcome：

- identity matched
- 常见斑锦植物背景
- 当前图像更像叶片
- 长期存在性线索
- 无扩展性线索
- 单叶受影响线索

这些可以支持非问题性 outcome，但不等于非问题性 outcome 本身。

---

#### A-11. 结论层与入口层、身份层、流程层的关系总裁决

新增总裁决：

### **诊断结论层只接收“经过竞争、收敛、合法输出资格判定后”的结果对象。**

它不直接承接以下上游对象：

- 植物身份主结果
- 身份未命中
- 图像质量状态
- 器官提示
- 器官识别结果
- AI symptom 候选
- canonical symptom
- route hint
- 宿主先验
- Taxonomy 分类字段

这些对象只能通过：

- evidence
- hypothesis
- question
- outcome competition
- stop_state / output eligibility

间接影响结论层。

---

#### A-12. 当前文档链的含义

本附录补入后，应统一理解：

- 入口层 = 上游观察与流程提示
- 身份层 = 植物身份与宿主结构
- symptom / evidence 层 = 正式可消费证据
- problem 层 = 问题性解释对象
- outcome 层 = 最终可对外表达结果对象

这几层不得重新混写。



## [S10] 核心数据结构 v1.6（完整最终版）

- 文件名：`核心数据结构_v1_6_完整最终版_标题版本已统一.md`
- 状态：A类正式基线
- 类别：诊断主链
- 用途：七大静态核心对象：问题、证据、派生、规则、提问、行动、结论
- SHA-256 前 16 位：`3d7c7035107ad42c`

---

### 核心数据结构 v1.6（完整最终版）

> 说明：
>
> - 本文件为完整最终文件，不是纯补丁。
> - 本文件完整保留当前可确认有效的前版正文与联动增补内容，并在其后追加新的联动附录。
> - 本文件当前用于正式承接“属级养护基线”概念进入核心静态主数据对象体系。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **只增不减**

---

### 核心数据结构 v1.2（纳入诊断结论层修正版）

> 目标：在《核心数据结构 v1.1（review 修正版）》基础上，正式纳入《诊断结论层 v1》的结构性要求，确保系统不再默认“最终一定在诊断问题（problem）层内收敛”。

---

### 0. 文档定位

本文件的作用是把系统真正的核心主对象定成稳定的数据骨架，并确保它们和当前最新三份上位文档保持一致：

1. 《诊断系统硬约束清单 v2.1（纳入诊断结论层修正版）》
2. 《诊断结论层 v1》
3. 《诊断目标分层 v1.2（纳入诊断结论层修正版）》

#### 0.1 文档语言规则

- 中文是一等公民，是主定义语言。
- 英文只作为辅助键名、辅助字段名、代码实现映射名。
- 文档默认表达顺序统一为：**中文主名（英文辅助名）**。

---

### 1. 设计总原则

#### 1.1 主对象必须少，但最终输出空间必须完整

> **主对象可以少，最终结论空间不能残缺。**

因此，不能为了保持对象数量少，而省略“非问题性结论”和“不确定结论”的正式归宿。

#### 1.2 数据层只做“稳定知识”，不做“会话瞬时状态”

#### 1.3 先定义对象边界，再定义字段细节

#### 1.4 所有 schema 必须服从“诊断问题粒度统一 + 诊断结论空间完整”

系统最终输出必须支持：

- 问题性结论
- 非问题性结论
- 不确定结论

---

### 2. 核心对象总览

本系统 v1.2 的核心数据结构分为 7 张主表 / 主对象：

#### A. 诊断目标分层（problem_taxonomy）
定义系统要判断的“问题性诊断对象”与层级关系。

#### B. 证据目录（evidence_catalog）
定义所有可被诊断引擎消费的标准化证据。

#### C. 证据派生规则（evidence_derivation_rules）
定义原始证据如何派生出模式证据。

#### D. 证据到诊断问题规则（evidence_problem_rules）
定义某条证据如何支持、削弱、排除某个诊断问题。

#### E. 诊断提问（diagnostic_questions）
定义系统可以向用户发出的标准化诊断提问。

#### F. 行动策略（action_policy）
定义在不同结论确定性下，应输出什么动作级建议。

#### G. 诊断结论层（outcome_layer）
定义系统最终可输出的完整结果空间。

---

### 3. 诊断目标分层（problem_taxonomy）

problem_taxonomy 只负责问题性诊断对象，不负责定义非问题性结论与不确定结论。

##### 主表：`problem_taxonomy`

最小字段：

- `problem_key`
- `中文名`
- `英文辅助名`
- `层级类型`
- `问题层语义类型`
- `父级问题键`
- `所属问题簇`
- `是否进入 v1.2 主竞争池`
- `是否允许对外输出`
- `问题确认层级`
- `问题说明`
- `准入说明`
- `停用原因`
- `最后审查版本`
- `状态`

#### 3.1 硬约束说明

- 纯表现型对象不得作为主竞争层诊断问题入库
- 正常特征类对象不得进入 problem taxonomy
- 不确定保留项不得进入 problem taxonomy

---

### 4. 证据目录（evidence_catalog）

##### 主表：`evidence_catalog`

最小字段：

- `evidence_key`
- `中文名`
- `英文辅助名`
- `证据类型`
- `来源类型`
- `证据角色`
- `默认状态类型`
- `可观察性`
- `可靠性`
- `独立性分组`
- `父证据键列表`
- `是否进入 v1.2`
- `准入说明`
- `停用原因`
- `最后审查版本`
- `说明`
- `状态`

#### 4.1 边界规则

以下对象默认归入证据层或模式证据层，不得作为诊断问题入库：

- 纯形态型对象
- 纯表现型对象
- 纯组合视觉对象

---

### 5. 证据派生规则（evidence_derivation_rules）

##### 主表：`evidence_derivation_rules`

最小字段：

- `rule_key`
- `输出证据键`
- `输入证据键列表`
- `必需输入列表`
- `可选输入列表`
- `禁止输入列表`
- `匹配逻辑类型`
- `最小命中数`
- `派生说明`
- `是否进入 v1.2`
- `准入说明`
- `停用原因`
- `最后审查版本`
- `状态`

---

### 6. 证据到诊断问题规则（evidence_problem_rules）

##### 主表：`evidence_problem_rules`

最小字段：

- `rule_key`
- `diagnosis_problem_key`
- `evidence_key`
- `作用类型`
- `作用强度`
- `适用范围说明`
- `是否关键证据`
- `规则说明`
- `是否进入 v1.2`
- `准入说明`
- `停用原因`
- `最后审查版本`
- `状态`

#### 6.1 合法目标约束

只允许引用：

- 已在 `problem_taxonomy` 中登记
- 且 `层级类型 = 诊断问题`
- 且 `问题层语义类型 = 机制 / 原因层`
- 且 `是否进入 v1.2 主竞争池 = 是`

的对象作为合法规则目标。

---

### 7. 诊断提问（diagnostic_questions）

诊断提问不只服务于问题性结论，也要服务于：

- 非问题性结论确认
- 不确定结论保留

##### 主表：`diagnostic_questions`

最小字段：

- `question_key`
- `中文提问文本`
- `英文辅助名`
- `提问类型`
- `目标维度`
- `分流作用范围`
- `可观察性`
- `回答可靠性`
- `歧义等级`
- `提问成本`
- `是否进入 v1.2`
- `准入说明`
- `停用原因`
- `最后审查版本`
- `状态`

##### 子表：`diagnostic_question_options`

- `option_key`
- `question_key`
- `中文选项文本`
- `映射证据键列表`
- `状态`

---

### 8. 行动策略（action_policy）

行动策略用于回答：

> 当系统当前更像某个结论，且确定性处于某个等级时，应该给出什么级别的行动建议。

##### 主表：`action_policy`

最小字段：

- `action_policy_key`
- `关联结论类型`
- `关联对象键`
- `确定性等级`
- `行动级别`
- `中文动作说明`
- `风险说明`
- `是否进入 v1.2`
- `准入说明`
- `停用原因`
- `最后审查版本`
- `状态`

---

### 9. 诊断结论层（outcome_layer）

#### 9.1 对象职责

诊断结论层用于定义系统最终可输出的完整结果空间。

它回答：

- 当前最终更像哪一类结论
- 这个结论属于问题性、非问题性还是不确定
- 它对外是否可直接输出
- 它与后续行动策略如何连接

#### 9.2 结论类型

v1.2 必须正式支持三类结论：

1. 问题性结论
2. 非问题性结论
3. 不确定结论

#### 9.3 最小字段建议

##### 主表：`outcome_layer`

最小字段：

- `outcome_key`
- `中文名`
- `英文辅助名`
- `结论类型`
- `关联对象类型`
- `关联对象键`
- `是否允许对外输出`
- `是否进入 v1.2`
- `准入说明`
- `停用原因`
- `最后审查版本`
- `说明`
- `状态`

---

### 10. 受控枚举附录（controlled vocabulary / enums）

当前建议纳入的受控枚举对象包括：

- 层级类型
- 问题层语义类型
- 问题确认层级
- 来源类型
- 证据角色
- 作用类型
- 提问类型
- 分流作用范围
- 确定性等级
- 行动级别
- 结论类型
- 关联对象类型
- 状态

---

### 11. 七大主对象之间的关系

1. **诊断目标分层** 定义“问题性诊断对象是什么”
2. **证据目录** 定义“系统能看懂什么”
3. **证据派生规则** 定义“能从哪些原始证据提炼模式证据”
4. **证据到诊断问题规则** 定义“这些证据会如何影响问题性诊断排序”
5. **诊断提问** 定义“还能向用户问什么来补证据”
6. **行动策略** 定义“当前像什么、确定性如何时该怎么建议”
7. **诊断结论层** 定义“系统最终可以输出什么”

---

### 12. v1.2 最小闭环要求

至少必须形成一个完整闭环：

- 有一批问题性诊断问题
- 有一批证据
- 有一批模式证据派生规则
- 有一批证据到诊断问题规则
- 有一批诊断提问
- 有一批非问题性结论对象
- 有一批不确定结论出口
- 有一批行动策略

---

### 13. 最终裁决

核心数据结构 v1.2 的真正目标不是“做出更多表”，而是：

> **把系统真正的主对象拆清楚，并把完整诊断结论空间正式压进 schema。**

因此，v1.2 采用 7 个核心对象：

1. 诊断目标分层
2. 证据目录
3. 证据派生规则
4. 证据到诊断问题规则
5. 诊断提问
6. 行动策略
7. 诊断结论层


### 核心数据结构 v1.3（联动增补版，基于 v1.2 只增不减）

> 说明：
>
> - 本文档基于《核心数据结构 v1.2（增补修正版，基于 v1.1 只增不减）》继续增补。
> - 本次增补来源：**《诊断结论层 v1.1（review 增补修正版）》**
> - 目标：增强 outcome_layer 的结构表达力，并把 outcome 准入边界正式压进 schema 语义。

---

### 附录 B：诊断结论层 v1.1 联动增补（本次新增，不替换原文与附录 A）

#### B-1. outcome_layer 字段增强：输出保守度

在原有 `outcome_layer` 最小字段建议基础上，新增建议字段：

- `输出保守度`
  - 明确输出
  - 保守输出
  - 仅观察型输出
  - 需补充信息后再输出

作用：

- 承接 action policy
- 支持“非问题性但仍建议观察”
- 支持“不确定但可以稳定对外说明”

---

#### B-2. outcome_layer 字段增强：宿主适用范围

新增建议字段：

- `宿主适用范围类型`
  - 通用
  - 宿主受限
- `宿主适用说明`

作用：

- 区分跨植物普适结论与特定植物限定结论
- 防止把特定植物才成立的正常特征误当成全局通用 outcome

---

#### B-3. outcome_layer 字段增强：结论子类型

新增建议字段：

- `结论子类型`

建议支持至少以下语义层级：

##### 对非问题性结论
- 稳定正常
- 暂时可接受

##### 对不确定结论
- 输入不足
- 证据冲突
- 继续提问收益过低

作用：

- 提升 action policy 与 runtime 的可承接性
- 避免三大结论类型过粗，难以稳定驱动后续动作

---

#### B-4. outcome_layer 的准入边界补充

新增 schema 语义约束：

### **不是所有“看起来不像问题”的对象都允许进入 outcome_layer。**

一个 outcome 对象若满足以下任一情况，则默认不应入库：

- 只是某条证据
- 只是正常性判断依据
- 不能稳定对外表达
- 对用户没有独立认知价值
- 不能稳定承接动作策略

---

#### B-5. evidence_catalog 与 outcome_layer 的边界补充

新增边界说明：

以下类型对象默认更适合作为 evidence 或 evidence support，而不是 outcome：

- 无扩展性
- 边界清晰
- 长期存在
- 单叶局部受影响
- 细碎观察性差异

因此，后续 schema / 数据录入时，不能因为某条“正常依据”有判断价值，就把它直接升格到 outcome_layer。

---

#### B-6. action_policy 与 outcome_layer 的联动增强

在原有 action policy 基础上，新增联动要求：

action policy 后续应可同时读取：

- `结论类型`
- `结论子类型`
- `输出保守度`

从而支持更细的动作差异：

##### 非问题性结论
- 稳定正常 → 无需处理 / 正常提示
- 暂时可接受 → 仅观察 / 条件性复查

##### 不确定结论
- 输入不足 → 优先补图
- 证据冲突 → 优先补关键辨别信息
- 收益过低 → 输出保守说明 + 观察建议

---

#### B-7. 受控枚举附录补充

在原有受控枚举对象基础上，新增：

- 输出保守度
- 宿主适用范围类型
- 结论子类型

---

#### B-8. 复合场景的结构预留

新增边界说明：

### **当前 outcome_layer 仍以主导结论为主，但 schema 应允许未来扩展到复合场景表达。**

典型复合场景：

- 背景非问题性特征 + 局部问题性变化

当前版本不要求完整实现复合输出，但建议在 schema 设计时不要把这条路彻底堵死。


### 核心数据结构 v1.5（身份主链路拆分联动版，基于 v1.4 只增不减）

> 说明：
>
> - 本文档基于《核心数据结构 v1.4（AI视觉入口层联动增补版）》继续增补。
> - 本次增补目标：
>   - 正式承接 taxonomy 主数据源
>   - 把身份链与症状链在数据结构层拆开

---

### 附录 D：身份主链路拆分联动增补（本次新增，不替换原文）

#### D-1. 新增正式静态主对象：植物身份对象（plant_identity_entity）

建议新增正式对象：

- `plant_identity_entity`

其定位为：
- taxonomy 正式主对象
- 植物身份主链路命中后的正式承载对象
- 宿主先验与 explanation 的正式挂点

##### 建议最小字段
- `plant_identity_id`
- `canonical_identity_name`
- `canonical_identity_name_cn`
- `canonical_identity_name_en`
- `identity_level`
- `family_name`
- `genus_name`
- `species_name`
- `primary_display_name`
- `common_names`
- `aliases`
- `commercial_names`
- `search_keys`
- `host_prior_profile_key`
- `is_active`

---

#### D-2. 新增正式对象：植物身份匹配记录（plant_identity_resolution_record）

建议新增对象：

- `plant_identity_resolution_record`

##### 作用
记录：
- 百度植物识别原始返回
- taxonomy 命中结果
- 主身份结果
- 是否 unresolved

##### 建议最小字段
- `plant_identity_resolution_record_id`
- `session_id`
- `source_name`（如 baidu_plant_recognition）
- `raw_identity_name`
- `match_status`
  - matched
  - weak_matched
  - unresolved
- `matched_plant_identity_id`
- `match_rule`
- `match_confidence`
- `resolution_time`

---

#### D-3. taxonomy baseline 数据源挂接说明

当前建议把：

- `plant_catalog.csv`

作为 `plant_identity_entity` 的 baseline 来源。

在正式重构后，至少需完成：
- 旧植物 ID → `plant_identity_id` 映射
- 中文展示名 / 学名 / family / genus 映射
- alias / common_names / commercial_names 重组

---

#### D-4. diagnosis baseline 挂接说明

当前建议把：

- `plants_v13_user_friendly_full_v7.xlsx` 中的 `plant_problem_profiles`

视为 diagnosis baseline 宿主挂接层。

后续需通过：
- `plant_identity_id`
- 或 genus / family
完成与 diagnosis 侧的稳定挂接。

---

#### D-5. 视觉对象域与身份对象域的关系

新增边界：

##### 身份链对象
- plant_identity_entity
- plant_identity_resolution_record

##### 症状链对象
- visual_raw_record
- visual_normalized_result
- visual_admission_record
- visual_supervision_record

二者在结构层必须分开定义，不得混成“一个视觉总结果对象”。




### ================================
### v1.6 新增附录开始（基于现有有效内容只增不减）
### ================================

> 说明：
>
> - 以下内容为当前《核心数据结构》有效完整内容基础上继续新增的联动附录。
> - 本次新增目标：
>   - 正式把“属级养护基线表”纳入核心静态主数据对象体系

---

### 附录：属级养护基线对象增补（本次新增，不替换上文）

#### 1. 新增正式静态主数据对象：属级养护基线对象

当前正式新增一个静态主数据对象：

### **属级养护基线对象**

英文辅助名：

- `genus_care_profile`

---

#### 2. 对象职责

该对象用于承载 genus level 的：

- 浇水基线
- 施肥基线
- 光照基线
- 通风基线
- 温度范围
- 湿度范围
- 毒性等级
- 基线说明
- 证据层级 / 证据策略

它不承载：

- 单次会话状态
- problem / symptom / outcome
- route hint
- question_queue 状态

---

#### 3. 与其他对象的关系

##### 与 `plant_identity_entity`
- `plant_identity_entity` 负责“它是谁”
- `genus_care_profile` 负责“该属级默认如何养护”

##### 与 Diagnosis 侧对象
- 可为 explanation 与行动建议提供背景输入
- 但不是 diagnosis 业务对象本体

##### 与 future overrides
- 作为 genus baseline 上位默认值
- 允许后续被 species / identity / variant 覆盖

---

#### 4. 当前最小字段集合

建议最小字段包括：

- `genus_care_profile_id`
- `genus_name`
- `family_name`
- `plant_category`
- `watering_strategy_json`
- `fertilizing_strategy_json`
- `light_strategy_json`
- `airflow_strategy_json`
- `temp_min_c`
- `temp_max_c`
- `humidity_min`
- `humidity_max`
- `toxicity_level`
- `review_status`
- `source_evidence`
- `baseline_note`
- `evidence_level`
- `evidence_strategy`
- `is_active`
- `created_at`
- `updated_at`

---

#### 5. 当前挂接边界

第一阶段正式业务挂接键为：

- `genus_name + family_name`

后续可升级到：

- `genus_id`
或
- `genus_identity_id`

但当前阶段不强依赖升级键。



## [S11] 运行时模型 v1.5（完整最终版）

- 文件名：`运行时模型_v1_5_完整最终版_标题版本已统一.md`
- 状态：A类正式基线
- 类别：诊断主链
- 用途：一次真实诊断会话的运行时对象、状态与可回放轨迹
- SHA-256 前 16 位：`2c687832fd3b675f`

---

### 运行时模型 v1.5（完整最终版）

> 说明：
>
> - 本文件为完整最终文件，不是纯补丁。
> - 本文件完整保留当前可确认有效的前版正文与联动增补内容，并在其后追加新的联动附录。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **只增不减**

---

### 运行时模型 v1（基于增补版基础文档）

> 说明：
>
> - 本文档基于以下文档继续向下推进：
>   - 《诊断系统硬约束清单 v2.2（增补修正版，基于 v2 只增不减）》
>   - 《诊断目标分层 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《核心数据结构 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《诊断结论层 v1》
> - 本文档目标不是定义静态知识库，而是定义：**一次真实诊断会话在运行时到底长什么样。**
> - 本文档仍遵循“中文主名优先、英文仅作辅助标记”的规则。

---

### 0. 文档定位

如果说：

- 《诊断目标分层》定义的是“系统在问题性结论空间里到底判断什么”
- 《核心数据结构》定义的是“系统有哪些长期稳定的知识对象”

那么《运行时模型》定义的就是：

> **这些静态对象在一次真实诊断会话中，如何组成一个可运行的状态系统。**

也就是说，本文件回答的是：

1. 用户发起一次诊断时，系统内部会创建哪些运行时对象
2. 这些对象之间如何流转
3. 哪些对象是会话级状态，哪些只是静态知识引用
4. 系统如何从“原始输入”走到“最终结论”
5. 系统如何同时支持：
   - 问题性结论
   - 非问题性结论
   - 不确定结论

---

#### 0.1 本文档不负责什么

本文档**不负责**：

- 定义长期知识表字段
- 定义完整 SQL schema
- 定义最终评分公式细节
- 定义前端页面流程
- 定义具体 prompt 文本

这些分别属于：

- 核心数据结构
- 决策流
- 前端交互层
- AI 输入输出层

---

#### 0.2 本文档负责什么

本文档负责定义：

- 会话开始时创建哪些运行时对象
- 会话中证据如何沉淀
- 诊断假设如何维护
- 诊断结论如何维护
- 诊断提问如何入队与出队
- 什么时候停止
- 什么时候进入不确定结论
- 什么时候输出“不是问题”

---

### 1. 运行时模型的总原则

#### 1.1 运行时对象只保存“当前会话状态”

运行时模型中的对象必须只保存：

- 当前会话所需状态
- 当前会话所见证据
- 当前会话的排序结果
- 当前会话的待追问队列
- 当前会话的最终输出

不应把长期知识直接复制一份到运行时。

正确方式是：

- 运行时对象引用静态知识对象
- 不复制整份知识库内容

---

#### 1.2 运行时状态必须可解释、可回放

系统每次诊断都必须允许后续解释：

- 输入了什么
- 获得了哪些证据
- 为什么某些诊断假设上升
- 为什么某些诊断假设下降
- 为什么进入非问题性结论
- 为什么进入不确定结论
- 为什么问了这些问题
- 为什么在这里停止

也就是说，运行时对象必须支持：

### **诊断轨迹（diagnostic trace）**

虽然轨迹文档会单独写，但运行时模型必须提前给它留位置。

---

#### 1.3 运行时模型必须同时维护“诊断假设层”和“诊断结论层”

这是 v1 里最关键的一条。

过去容易犯的错误是：

- 只维护 `problem（诊断问题）` 排序
- 最后硬从 problem 里选一个结果

但现在系统必须支持：

- 问题性结论
- 非问题性结论
- 不确定结论

所以运行时必须同时维护两层：

#### A. 诊断假设层（hypothesis layer）
用于维护当前在竞争的候选解释对象。

#### B. 诊断结论层（outcome layer）
用于维护当前最终更可能落入哪一类结果。

两者不能混成一个。

---

### 2. 运行时对象总览

本系统 v1 的运行时模型，建议至少包含以下 8 个核心会话对象：

1. **诊断会话（diagnostic_session）**
2. **输入归一化结果（normalized_input）**
3. **已观察证据集（observed_evidence_set）**
4. **诊断假设池（hypothesis_pool）**
5. **结论候选池（outcome_pool）**
6. **诊断提问队列（question_queue）**
7. **会话停止状态（stop_state）**
8. **诊断轨迹（diagnostic_trace）**

下面逐一展开。

---

### 3. 诊断会话（diagnostic_session）

#### 3.1 对象职责

诊断会话是整个运行时系统的根对象。

它负责承载：

- 当前会话唯一标识
- 会话生命周期状态
- 当前阶段
- 关联的运行时子对象
- 最终输出结果引用

可以把它理解为：

> **一次诊断过程的运行时容器。**

---

#### 3.2 最小字段建议

##### 运行时对象：`diagnostic_session`

最小字段建议：

- `session_id`：会话唯一键
- `用户输入类型`
  - 图片
  - 图片 + 植物名
  - 图片 + 历史描述
  - 纯提问补充
- `当前阶段`
  - 输入归一化中
  - 初始分析中
  - 诊断假设竞争中
  - 诊断提问中
  - 结论收敛中
  - 已结束
- `会话状态`
  - 活跃
  - 等待用户回答
  - 已完成
  - 已中断
- `关联植物上下文`
- `主图像引用`
- `当前结论引用`
- `当前停止状态引用`
- `创建时间`
- `更新时间`

---

#### 3.3 为什么必须有单独 session 根对象

因为如果没有会话根对象，后面这些都会散掉：

- 当前证据属于哪次诊断
- 当前提问队列属于哪次诊断
- 当前诊断假设属于哪次诊断
- 当前最终结论属于哪次诊断

所以 session 是必须的。

---

### 4. 输入归一化结果（normalized_input）

#### 4.1 对象职责

输入归一化结果用于回答：

> 用户原始输入进入系统后，第一层可消费的统一表示是什么？

因为用户的输入可能是：

- 一张植物图
- 多张图
- 图 + 植物名
- 图 + 用户口述
- 只有追问回答

这些输入形式很乱，不能直接进入诊断排序。

所以必须先做：

### **输入归一化（input normalization）**

---

#### 4.2 最小字段建议

##### 运行时对象：`normalized_input`

最小字段建议：

- `normalized_input_id`
- `session_id`
- `图像列表`
- `植物身份输入`
  - 未知
  - 属级
  - 种级
  - 用户自报但未确认
- `受影响部位初判`
  - 叶
  - 茎
  - 根
  - 花
  - 果
  - 未知
- `可见严重度初判`
  - 轻
  - 中
  - 重
  - 未知
- `原始文本描述`
- `归一化补充标签`
- `是否已生成初始证据`

---

#### 4.3 归一化对象不等于证据对象

这一点必须明确。

输入归一化结果只是：

- 统一整理输入
- 为后续提取证据做准备

它本身**不是最终证据层**。

证据层必须是更严格、可被规则系统消费的标准化对象。

---

### 5. 已观察证据集（observed_evidence_set）

#### 5.1 对象职责

这是运行时最核心的对象之一。

它负责承载：

- 当前会话已经获得的所有证据
- 每条证据的来源
- 每条证据当前状态
- 每条证据的获得方式
- 每条证据的可信度修正
- 每条证据是否已被消费 / 解释

可以理解成：

> **当前会话真正拥有了哪些可用于推理的东西。**

---

#### 5.2 为什么必须用“证据集”而不是单条变量拼接

因为一次会话中的证据来源非常多：

- 图像识别
- 用户回答
- 派生模式证据
- 宿主先验
- 负证据
- 历史上下文

如果不用统一证据集承载，后面很容易变成：

- 视觉结果一套
- 提问回答一套
- 先验一套
- 派生证据又一套

最终无法统一排序。

---

#### 5.3 最小字段建议

##### 运行时对象：`observed_evidence_set`

最小字段建议：

- `observed_evidence_set_id`
- `session_id`
- `evidence_items`

其中每条 `evidence_item` 建议包含：

- `evidence_key`
- `中文名`
- `来源类型`
  - 图像识别
  - 用户回答
  - 规则派生
  - 先验
- `当前状态`
  - 已存在
  - 已确认不存在
  - 未知
- `会话内可信度修正`
- `父证据引用`
- `首次出现阶段`
- `最近更新时间`
- `是否为关键证据`
- `是否已进入解释层`

---

#### 5.4 会话内可信度修正为什么存在

因为同一个静态证据，在不同会话里可信度可以不同。

例如：

- 图像模糊时，视觉证据可信度应下降
- 用户自述非常明确时，某些回答证据可信度可上升
- 用户前后回答冲突时，回答证据可信度应下降

所以：

- 静态知识里的 `reliability（可靠性）` 是基准值
- 运行时对象里的“会话内可信度修正”是会话态调整值

---

### 6. 诊断假设池（hypothesis_pool）

#### 6.1 对象职责

诊断假设池用于维护：

> 当前仍在竞争的候选解释对象。

注意，这里不只是一堆分数。

它至少要维护：

- 候选问题性假设
- 候选非问题性方向
- 候选不确定保留方向

但为了避免概念混乱，我建议这里的 hypothesis 仍主要指：

### **候选解释方向**
而不是最终输出对象本身。

---

#### 6.2 为什么还需要 hypothesis，而不是直接 outcome 排序

因为：

- outcome 是最终结论层
- hypothesis 是推理过程层

例如：

当前会话可能同时存在这些假设：

- 真菌性叶斑类问题
- 刺吸式虫害问题
- 稳定斑锦特征
- 旧机械伤痕
- 信息不足

这些对象都可以是“候选解释方向”。

但系统最终要输出的，是：

- 更像问题性结论
- 更像非问题性结论
- 或进入不确定结论

所以 hypothesis 是过程竞争池，outcome 是最终收敛层。

---

#### 6.3 最小字段建议

##### 运行时对象：`hypothesis_pool`

最小字段建议：

- `hypothesis_pool_id`
- `session_id`
- `hypothesis_items`

每条 `hypothesis_item` 建议包含：

- `hypothesis_id`
- `候选对象类型`
  - 诊断问题
  - 非问题性候选对象
  - 不确定保留候选
- `关联对象键`
- `当前支持强度`
- `当前削弱强度`
- `当前排除状态`
- `关键支持证据列表`
- `关键缺失证据列表`
- `当前排序位次`
- `是否仍活跃`
- `最近更新时间`

---

#### 6.4 这里的“不确定保留候选”为什么不是多余的

因为“不确定”不应该只在最后突然冒出来。

很多时候，系统在中途就应该显式维护：

- 当前信息不足
- 当前证据冲突
- 当前图像不够支撑明确归类

所以“不确定”应是运行时显式候选，而不是最后兜底补丁。

---

### 7. 结论候选池（outcome_pool）

#### 7.1 对象职责

这是引入诊断结论层之后，运行时模型最重要的新对象。

它负责维护：

> 当前最终更可能落入哪一类结论。

与 hypothesis_pool 不同，它不是维护大量解释方向，而是维护：

- 问题性结论倾向
- 非问题性结论倾向
- 不确定结论倾向

以及这些倾向下的具体候选。

---

#### 7.2 outcome_pool 与 hypothesis_pool 的区别

##### hypothesis_pool
更细，更偏解释过程层  
关注：
- 当前有哪些候选解释对象在竞争

##### outcome_pool
更高一层，更偏输出收敛层  
关注：
- 当前最终更像哪一类结论
- 哪个具体结论最适合对外输出

---

#### 7.3 最小字段建议

##### 运行时对象：`outcome_pool`

最小字段建议：

- `outcome_pool_id`
- `session_id`
- `outcome_items`

每条 `outcome_item` 建议包含：

- `outcome_id`
- `结论类型`
  - 问题性结论
  - 非问题性结论
  - 不确定结论
- `关联对象键`
- `当前支持强度`
- `当前主要依据`
- `当前主要风险`
- `当前排序位次`
- `是否允许立即输出`
- `是否仍活跃`

---

#### 7.4 为什么必须单独维护 outcome_pool

因为如果没有 outcome_pool，系统最后仍会默认：

- 从 problem 里选一个 top1 就完事

这会导致：

- “不是问题”的结论没有正式竞争位置
- “不确定”只能被临时拼接出来
- 非问题性结论无法和问题性结论公平竞争

所以 outcome_pool 是必须的。

---

### 8. 诊断提问队列（question_queue）

#### 8.1 对象职责

诊断提问队列用于维护：

> 当前最值得问的那些问题，以及它们的出队顺序。

它不是知识库里的 question 表本身，而是：

- 会话里当前待问的问题列表
- 按当前价值排序的动态提问队列

---

#### 8.2 为什么必须是“队列”，不是“当前问题单值”

因为现实中系统不该只知道“下一题是什么”，还应该知道：

- 下一题是谁
- 第二优先题是谁
- 如果用户跳过当前题，替代题是谁
- 当前题为什么比别的题更值得问

所以必须有 question_queue。

---

#### 8.3 最小字段建议

##### 运行时对象：`question_queue`

最小字段建议：

- `question_queue_id`
- `session_id`
- `question_items`

每条 `question_item` 建议包含：

- `question_key`
- `当前优先级`
- `当前信息增益估计`
- `主要服务对象`
  - 问题性候选分流
  - 非问题性结论确认
  - 不确定结论解除
- `当前适用条件`
- `是否已提问`
- `是否已回答`
- `是否已失效`

---

#### 8.4 question_queue 的失效机制必须存在

因为某些问题一旦：

- 关键证据已获得
- 用户已跳过
- 候选对象被淘汰
- 当前结论已经足够收敛

它就应该失效，而不是继续挂在队列里。

---

### 9. 会话停止状态（stop_state）

#### 9.1 对象职责

停止状态用于回答：

> 这次诊断为什么可以在这里停下？

这是很多系统最容易缺的一层。

没有 stop_state，系统会出现两种坏状态：

- 该停不停，问太多
- 不该停时乱停，结论过早

---

#### 9.2 停止不是单一条件

会话停止可能因为很多原因：

##### A. 问题性结论已足够收敛
##### B. 非问题性结论已足够收敛
##### C. 不确定结论已成为最安全输出
##### D. 用户中断

---

#### 9.3 最小字段建议

##### 运行时对象：`stop_state`

最小字段建议：

- `stop_state_id`
- `session_id`
- `是否已停止`
- `停止原因类型`
  - 问题性收敛
  - 非问题性收敛
  - 不确定收敛
  - 用户中断
  - 系统超限
- `停止说明`
- `最终输出引用`
- `是否允许继续追问`

---

### 10. 诊断轨迹（diagnostic_trace）

#### 10.1 对象职责

诊断轨迹用于保存：

> 这次诊断过程到底是怎么走出来的。

它是解释性、debug 能力、后续审核能力的基础。

---

#### 10.2 至少记录什么

最少要能记录：

- 什么时候加入了哪条证据
- 哪条证据导致哪个假设上升 / 下降
- 哪个问题为什么入队
- 哪个问题为什么失效
- 为什么 outcome 从问题性转向非问题性
- 为什么最终停在这里

---

#### 10.3 最小字段建议

##### 运行时对象：`diagnostic_trace`

最小字段建议：

- `trace_id`
- `session_id`
- `trace_events`

每条 `trace_event` 建议包含：

- `事件时间`
- `事件类型`
  - 证据加入
  - 派生证据生成
  - 假设升高
  - 假设降低
  - 提问入队
  - 提问出队
  - 结论切换
  - 会话停止
- `关联对象`
- `事件说明`

---

### 11. 运行时对象之间的关系

一次会话大致按以下关系运行：

1. 用户进入系统，创建 **诊断会话**
2. 原始输入进入 **输入归一化结果**
3. 系统提取并沉淀为 **已观察证据集**
4. 证据驱动 **诊断假设池** 更新
5. 假设池驱动 **结论候选池** 更新
6. 当前不够收敛时，系统生成 **诊断提问队列**
7. 用户回答再次回流到 **已观察证据集**
8. 当达到停止条件时，写入 **会话停止状态**
9. 全过程都沉淀到 **诊断轨迹**

---

### 12. 一个最小示例流程

以“用户上传一张带斑驳叶片图片”为例：

#### 第一步：创建会话
创建 `diagnostic_session`

#### 第二步：输入归一化
系统识别：
- 有图像
- 部位更像叶片
- 植物身份未知或部分已知

#### 第三步：初始证据进入 evidence set
例如加入：

- 叶片存在斑驳
- 斑块边界较清晰
- 无明显扩展性证据
- 无明显坏死中心证据

#### 第四步：更新 hypothesis_pool
候选可能包括：

- 真菌性叶斑类问题
- 稳定斑锦特征
- 信息不足

#### 第五步：更新 outcome_pool
当前可能出现：

- 非问题性结论上升
- 问题性结论仍保留
- 不确定结论仍活跃

#### 第六步：生成 question_queue
例如追问：

- 这些斑驳是不是一直都有？
- 新叶是否也保持类似花纹？
- 是否最近才突然出现并扩大？

#### 第七步：用户回答回流
回答再次转成证据，更新 evidence set

#### 第八步：重新排序
如果证据更支持稳定特征，则：
- 非问题性 outcome 上升
- 问题性 hypothesis 下降

#### 第九步：触发 stop_state
若非问题性结论已足够收敛，则输出：
- 更像正常特征
- 暂不建议按病害处理

---

### 13. 运行时模型的关键边界

#### 13.1 不允许把静态知识复制成大块运行时状态
#### 13.2 不允许把 question_queue 当成固定问卷
#### 13.3 不允许把 outcome_pool 简化成 problem top1
#### 13.4 不允许把 stop_state 省略

---

### 14. 最终裁决

运行时模型 v1 的核心目的不是“多造几个状态对象”，而是：

> **让一次诊断过程，从输入、证据、假设、结论、提问、停止，到轨迹，都有清晰的运行时归宿。**

因此，v1 运行时模型至少应包含这 8 个对象：

1. 诊断会话
2. 输入归一化结果
3. 已观察证据集
4. 诊断假设池
5. 结论候选池
6. 诊断提问队列
7. 会话停止状态
8. 诊断轨迹

并且必须同时支持：

- 问题性结论收敛
- 非问题性结论收敛
- 不确定结论收敛

---

### 15. 下一步

下一份文档应进入：

### 《决策流 v1》

重点要定义：

- 输入归一化顺序
- 候选生成顺序
- 证据到假设更新顺序
- 假设到结论更新顺序
- 诊断提问路由顺序
- 停止条件判定顺序

也就是把“运行时有哪些对象”进一步推进到：

> **这些对象在时间顺序上到底如何流动。**


### 运行时模型 v1.1（review 增补修正版，基于 v1 只增不减）

> 说明：
>
> - 本文档遵循“**基于上一版更新只能新增不可减少**”的规则。
> - 因此，本版不是压缩重写版，而是**在《运行时模型 v1》基础上做增补修订**。
> - 本次增补的核心目的，是把上一轮 review 中指出的运行时状态机边界问题补齐。
> - 本文档应与以下文档配套阅读：
>   - 《诊断系统硬约束清单 v2.2（增补修正版，基于 v2 只增不减）》
>   - 《诊断目标分层 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《核心数据结构 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《诊断结论层 v1》
>   - 《运行时模型 v1》

---

### 运行时模型 v1（基于增补版基础文档）

> 说明：
>
> - 本文档基于以下文档继续向下推进：
>   - 《诊断系统硬约束清单 v2.2（增补修正版，基于 v2 只增不减）》
>   - 《诊断目标分层 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《核心数据结构 v1.2（增补修正版，基于 v1.1 只增不减）》
>   - 《诊断结论层 v1》
> - 本文档目标不是定义静态知识库，而是定义：**一次真实诊断会话在运行时到底长什么样。**
> - 本文档仍遵循“中文主名优先、英文仅作辅助标记”的规则。

---

### 0. 文档定位

如果说：

- 《诊断目标分层》定义的是“系统在问题性结论空间里到底判断什么”
- 《核心数据结构》定义的是“系统有哪些长期稳定的知识对象”

那么《运行时模型》定义的就是：

> **这些静态对象在一次真实诊断会话中，如何组成一个可运行的状态系统。**

也就是说，本文件回答的是：

1. 用户发起一次诊断时，系统内部会创建哪些运行时对象
2. 这些对象之间如何流转
3. 哪些对象是会话级状态，哪些只是静态知识引用
4. 系统如何从“原始输入”走到“最终结论”
5. 系统如何同时支持：
   - 问题性结论
   - 非问题性结论
   - 不确定结论

---

#### 0.1 本文档不负责什么

本文档**不负责**：

- 定义长期知识表字段
- 定义完整 SQL schema
- 定义最终评分公式细节
- 定义前端页面流程
- 定义具体 prompt 文本

这些分别属于：

- 核心数据结构
- 决策流
- 前端交互层
- AI 输入输出层

---

#### 0.2 本文档负责什么

本文档负责定义：

- 会话开始时创建哪些运行时对象
- 会话中证据如何沉淀
- 诊断假设如何维护
- 诊断结论如何维护
- 诊断提问如何入队与出队
- 什么时候停止
- 什么时候进入不确定结论
- 什么时候输出“不是问题”

---

### 1. 运行时模型的总原则

#### 1.1 运行时对象只保存“当前会话状态”

运行时模型中的对象必须只保存：

- 当前会话所需状态
- 当前会话所见证据
- 当前会话的排序结果
- 当前会话的待追问队列
- 当前会话的最终输出

不应把长期知识直接复制一份到运行时。

正确方式是：

- 运行时对象引用静态知识对象
- 不复制整份知识库内容

---

#### 1.2 运行时状态必须可解释、可回放

系统每次诊断都必须允许后续解释：

- 输入了什么
- 获得了哪些证据
- 为什么某些诊断假设上升
- 为什么某些诊断假设下降
- 为什么进入非问题性结论
- 为什么进入不确定结论
- 为什么问了这些问题
- 为什么在这里停止

也就是说，运行时对象必须支持：

### **诊断轨迹（diagnostic trace）**

虽然轨迹文档会单独写，但运行时模型必须提前给它留位置。

---

#### 1.3 运行时模型必须同时维护“诊断假设层”和“诊断结论层”

这是 v1 里最关键的一条。

过去容易犯的错误是：

- 只维护 `problem（诊断问题）` 排序
- 最后硬从 problem 里选一个结果

但现在系统必须支持：

- 问题性结论
- 非问题性结论
- 不确定结论

所以运行时必须同时维护两层：

#### A. 诊断假设层（hypothesis layer）
用于维护当前在竞争的候选解释对象。

#### B. 诊断结论层（outcome layer）
用于维护当前最终更可能落入哪一类结果。

两者不能混成一个。

---

### 2. 运行时对象总览

本系统 v1 的运行时模型，建议至少包含以下 8 个核心会话对象：

1. **诊断会话（diagnostic_session）**
2. **输入归一化结果（normalized_input）**
3. **已观察证据集（observed_evidence_set）**
4. **诊断假设池（hypothesis_pool）**
5. **结论候选池（outcome_pool）**
6. **诊断提问队列（question_queue）**
7. **会话停止状态（stop_state）**
8. **诊断轨迹（diagnostic_trace）**

下面逐一展开。

---

### 3. 诊断会话（diagnostic_session）

#### 3.1 对象职责

诊断会话是整个运行时系统的根对象。

它负责承载：

- 当前会话唯一标识
- 会话生命周期状态
- 当前阶段
- 关联的运行时子对象
- 最终输出结果引用

可以把它理解为：

> **一次诊断过程的运行时容器。**

---

#### 3.2 最小字段建议

##### 运行时对象：`diagnostic_session`

最小字段建议：

- `session_id`：会话唯一键
- `用户输入类型`
  - 图片
  - 图片 + 植物名
  - 图片 + 历史描述
  - 纯提问补充
- `当前阶段`
  - 输入归一化中
  - 初始分析中
  - 诊断假设竞争中
  - 诊断提问中
  - 结论收敛中
  - 已结束
- `会话状态`
  - 活跃
  - 等待用户回答
  - 已完成
  - 已中断
- `关联植物上下文`
- `主图像引用`
- `当前结论引用`
- `当前停止状态引用`
- `创建时间`
- `更新时间`

---

#### 3.3 为什么必须有单独 session 根对象

因为如果没有会话根对象，后面这些都会散掉：

- 当前证据属于哪次诊断
- 当前提问队列属于哪次诊断
- 当前诊断假设属于哪次诊断
- 当前最终结论属于哪次诊断

所以 session 是必须的。

---

### 4. 输入归一化结果（normalized_input）

#### 4.1 对象职责

输入归一化结果用于回答：

> 用户原始输入进入系统后，第一层可消费的统一表示是什么？

因为用户的输入可能是：

- 一张植物图
- 多张图
- 图 + 植物名
- 图 + 用户口述
- 只有追问回答

这些输入形式很乱，不能直接进入诊断排序。

所以必须先做：

### **输入归一化（input normalization）**

---

#### 4.2 最小字段建议

##### 运行时对象：`normalized_input`

最小字段建议：

- `normalized_input_id`
- `session_id`
- `图像列表`
- `植物身份输入`
  - 未知
  - 属级
  - 种级
  - 用户自报但未确认
- `受影响部位初判`
  - 叶
  - 茎
  - 根
  - 花
  - 果
  - 未知
- `可见严重度初判`
  - 轻
  - 中
  - 重
  - 未知
- `原始文本描述`
- `归一化补充标签`
- `是否已生成初始证据`

---

#### 4.3 归一化对象不等于证据对象

这一点必须明确。

输入归一化结果只是：

- 统一整理输入
- 为后续提取证据做准备

它本身**不是最终证据层**。

证据层必须是更严格、可被规则系统消费的标准化对象。

---

### 5. 已观察证据集（observed_evidence_set）

#### 5.1 对象职责

这是运行时最核心的对象之一。

它负责承载：

- 当前会话已经获得的所有证据
- 每条证据的来源
- 每条证据当前状态
- 每条证据的获得方式
- 每条证据的可信度修正
- 每条证据是否已被消费 / 解释

可以理解成：

> **当前会话真正拥有了哪些可用于推理的东西。**

---

#### 5.2 为什么必须用“证据集”而不是单条变量拼接

因为一次会话中的证据来源非常多：

- 图像识别
- 用户回答
- 派生模式证据
- 宿主先验
- 负证据
- 历史上下文

如果不用统一证据集承载，后面很容易变成：

- 视觉结果一套
- 提问回答一套
- 先验一套
- 派生证据又一套

最终无法统一排序。

---

#### 5.3 最小字段建议

##### 运行时对象：`observed_evidence_set`

最小字段建议：

- `observed_evidence_set_id`
- `session_id`
- `evidence_items`

其中每条 `evidence_item` 建议包含：

- `evidence_key`
- `中文名`
- `来源类型`
  - 图像识别
  - 用户回答
  - 规则派生
  - 先验
- `当前状态`
  - 已存在
  - 已确认不存在
  - 未知
- `会话内可信度修正`
- `父证据引用`
- `首次出现阶段`
- `最近更新时间`
- `是否为关键证据`
- `是否已进入解释层`

---

#### 5.4 会话内可信度修正为什么存在

因为同一个静态证据，在不同会话里可信度可以不同。

例如：

- 图像模糊时，视觉证据可信度应下降
- 用户自述非常明确时，某些回答证据可信度可上升
- 用户前后回答冲突时，回答证据可信度应下降

所以：

- 静态知识里的 `reliability（可靠性）` 是基准值
- 运行时对象里的“会话内可信度修正”是会话态调整值

---

### 6. 诊断假设池（hypothesis_pool）

#### 6.1 对象职责

诊断假设池用于维护：

> 当前仍在竞争的候选解释对象。

注意，这里不只是一堆分数。

它至少要维护：

- 候选问题性假设
- 候选非问题性方向
- 候选不确定保留方向

但为了避免概念混乱，我建议这里的 hypothesis 仍主要指：

### **候选解释方向**
而不是最终输出对象本身。

---

#### 6.2 为什么还需要 hypothesis，而不是直接 outcome 排序

因为：

- outcome 是最终结论层
- hypothesis 是推理过程层

例如：

当前会话可能同时存在这些假设：

- 真菌性叶斑类问题
- 刺吸式虫害问题
- 稳定斑锦特征
- 旧机械伤痕
- 信息不足

这些对象都可以是“候选解释方向”。

但系统最终要输出的，是：

- 更像问题性结论
- 更像非问题性结论
- 或进入不确定结论

所以 hypothesis 是过程竞争池，outcome 是最终收敛层。

---

#### 6.3 最小字段建议

##### 运行时对象：`hypothesis_pool`

最小字段建议：

- `hypothesis_pool_id`
- `session_id`
- `hypothesis_items`

每条 `hypothesis_item` 建议包含：

- `hypothesis_id`
- `候选对象类型`
  - 诊断问题
  - 非问题性候选对象
  - 不确定保留候选
- `关联对象键`
- `当前支持强度`
- `当前削弱强度`
- `当前排除状态`
- `关键支持证据列表`
- `关键缺失证据列表`
- `当前排序位次`
- `是否仍活跃`
- `最近更新时间`

---

#### 6.4 这里的“不确定保留候选”为什么不是多余的

因为“不确定”不应该只在最后突然冒出来。

很多时候，系统在中途就应该显式维护：

- 当前信息不足
- 当前证据冲突
- 当前图像不够支撑明确归类

所以“不确定”应是运行时显式候选，而不是最后兜底补丁。

---

### 7. 结论候选池（outcome_pool）

#### 7.1 对象职责

这是引入诊断结论层之后，运行时模型最重要的新对象。

它负责维护：

> 当前最终更可能落入哪一类结论。

与 hypothesis_pool 不同，它不是维护大量解释方向，而是维护：

- 问题性结论倾向
- 非问题性结论倾向
- 不确定结论倾向

以及这些倾向下的具体候选。

---

#### 7.2 outcome_pool 与 hypothesis_pool 的区别

##### hypothesis_pool
更细，更偏解释过程层  
关注：
- 当前有哪些候选解释对象在竞争

##### outcome_pool
更高一层，更偏输出收敛层  
关注：
- 当前最终更像哪一类结论
- 哪个具体结论最适合对外输出

---

#### 7.3 最小字段建议

##### 运行时对象：`outcome_pool`

最小字段建议：

- `outcome_pool_id`
- `session_id`
- `outcome_items`

每条 `outcome_item` 建议包含：

- `outcome_id`
- `结论类型`
  - 问题性结论
  - 非问题性结论
  - 不确定结论
- `关联对象键`
- `当前支持强度`
- `当前主要依据`
- `当前主要风险`
- `当前排序位次`
- `是否允许立即输出`
- `是否仍活跃`

---

#### 7.4 为什么必须单独维护 outcome_pool

因为如果没有 outcome_pool，系统最后仍会默认：

- 从 problem 里选一个 top1 就完事

这会导致：

- “不是问题”的结论没有正式竞争位置
- “不确定”只能被临时拼接出来
- 非问题性结论无法和问题性结论公平竞争

所以 outcome_pool 是必须的。

---

### 8. 诊断提问队列（question_queue）

#### 8.1 对象职责

诊断提问队列用于维护：

> 当前最值得问的那些问题，以及它们的出队顺序。

它不是知识库里的 question 表本身，而是：

- 会话里当前待问的问题列表
- 按当前价值排序的动态提问队列

---

#### 8.2 为什么必须是“队列”，不是“当前问题单值”

因为现实中系统不该只知道“下一题是什么”，还应该知道：

- 下一题是谁
- 第二优先题是谁
- 如果用户跳过当前题，替代题是谁
- 当前题为什么比别的题更值得问

所以必须有 question_queue。

---

#### 8.3 最小字段建议

##### 运行时对象：`question_queue`

最小字段建议：

- `question_queue_id`
- `session_id`
- `question_items`

每条 `question_item` 建议包含：

- `question_key`
- `当前优先级`
- `当前信息增益估计`
- `主要服务对象`
  - 问题性候选分流
  - 非问题性结论确认
  - 不确定结论解除
- `当前适用条件`
- `是否已提问`
- `是否已回答`
- `是否已失效`

---

#### 8.4 question_queue 的失效机制必须存在

因为某些问题一旦：

- 关键证据已获得
- 用户已跳过
- 候选对象被淘汰
- 当前结论已经足够收敛

它就应该失效，而不是继续挂在队列里。

---

### 9. 会话停止状态（stop_state）

#### 9.1 对象职责

停止状态用于回答：

> 这次诊断为什么可以在这里停下？

这是很多系统最容易缺的一层。

没有 stop_state，系统会出现两种坏状态：

- 该停不停，问太多
- 不该停时乱停，结论过早

---

#### 9.2 停止不是单一条件

会话停止可能因为很多原因：

##### A. 问题性结论已足够收敛
例如：
- 某问题性结论优势明显
- 关键反证缺失
- 再问收益很低

##### B. 非问题性结论已足够收敛
例如：
- 更像稳定特征
- 没有扩展性
- 没有问题性支持证据

##### C. 不确定结论已成为最安全输出
例如：
- 证据不足
- 图像质量差
- 继续问收益过低
- 当前不适合硬判

##### D. 用户中断
例如：
- 用户不再回答
- 用户主动结束

---

#### 9.3 最小字段建议

##### 运行时对象：`stop_state`

最小字段建议：

- `stop_state_id`
- `session_id`
- `是否已停止`
- `停止原因类型`
  - 问题性收敛
  - 非问题性收敛
  - 不确定收敛
  - 用户中断
  - 系统超限
- `停止说明`
- `最终输出引用`
- `是否允许继续追问`

---

### 10. 诊断轨迹（diagnostic_trace）

#### 10.1 对象职责

诊断轨迹用于保存：

> 这次诊断过程到底是怎么走出来的。

它是解释性、debug 能力、后续审核能力的基础。

---

#### 10.2 至少记录什么

最少要能记录：

- 什么时候加入了哪条证据
- 哪条证据导致哪个假设上升 / 下降
- 哪个问题为什么入队
- 哪个问题为什么失效
- 为什么 outcome 从问题性转向非问题性
- 为什么最终停在这里

---

#### 10.3 最小字段建议

##### 运行时对象：`diagnostic_trace`

最小字段建议：

- `trace_id`
- `session_id`
- `trace_events`

每条 `trace_event` 建议包含：

- `事件时间`
- `事件类型`
  - 证据加入
  - 派生证据生成
  - 假设升高
  - 假设降低
  - 提问入队
  - 提问出队
  - 结论切换
  - 会话停止
- `关联对象`
- `事件说明`

---

### 11. 运行时对象之间的关系

一次会话大致按以下关系运行：

1. 用户进入系统，创建 **诊断会话**
2. 原始输入进入 **输入归一化结果**
3. 系统提取并沉淀为 **已观察证据集**
4. 证据驱动 **诊断假设池** 更新
5. 假设池驱动 **结论候选池** 更新
6. 当前不够收敛时，系统生成 **诊断提问队列**
7. 用户回答再次回流到 **已观察证据集**
8. 当达到停止条件时，写入 **会话停止状态**
9. 全过程都沉淀到 **诊断轨迹**

---

### 12. 一个最小示例流程

以“用户上传一张带斑驳叶片图片”为例：

#### 第一步：创建会话
创建 `diagnostic_session`

#### 第二步：输入归一化
系统识别：
- 有图像
- 部位更像叶片
- 植物身份未知或部分已知

#### 第三步：初始证据进入 evidence set
例如加入：

- 叶片存在斑驳
- 斑块边界较清晰
- 无明显扩展性证据
- 无明显坏死中心证据

#### 第四步：更新 hypothesis_pool
候选可能包括：

- 真菌性叶斑类问题
- 稳定斑锦特征
- 信息不足

#### 第五步：更新 outcome_pool
当前可能出现：

- 非问题性结论上升
- 问题性结论仍保留
- 不确定结论仍活跃

#### 第六步：生成 question_queue
例如追问：

- 这些斑驳是不是一直都有？
- 新叶是否也保持类似花纹？
- 是否最近才突然出现并扩大？

#### 第七步：用户回答回流
回答再次转成证据，更新 evidence set

#### 第八步：重新排序
如果证据更支持稳定特征，则：
- 非问题性 outcome 上升
- 问题性 hypothesis 下降

#### 第九步：触发 stop_state
若非问题性结论已足够收敛，则输出：
- 更像正常特征
- 暂不建议按病害处理

---

### 13. 运行时模型的关键边界

#### 13.1 不允许把静态知识复制成大块运行时状态
#### 13.2 不允许把 question_queue 当成固定问卷
#### 13.3 不允许把 outcome_pool 简化成 problem top1
#### 13.4 不允许把 stop_state 省略

---

### 14. 最终裁决

运行时模型 v1 的核心目的不是“多造几个状态对象”，而是：

> **让一次诊断过程，从输入、证据、假设、结论、提问、停止，到轨迹，都有清晰的运行时归宿。**

因此，v1 运行时模型至少应包含这 8 个对象：

1. 诊断会话
2. 输入归一化结果
3. 已观察证据集
4. 诊断假设池
5. 结论候选池
6. 诊断提问队列
7. 会话停止状态
8. 诊断轨迹

并且必须同时支持：

- 问题性结论收敛
- 非问题性结论收敛
- 不确定结论收敛

---

### 15. 下一步

下一份文档应进入：

### 《决策流 v1》

重点要定义：

- 输入归一化顺序
- 候选生成顺序
- 证据到假设更新顺序
- 假设到结论更新顺序
- 诊断提问路由顺序
- 停止条件判定顺序

也就是把“运行时有哪些对象”进一步推进到：

> **这些对象在时间顺序上到底如何流动。**

---

### 附录 A：运行时状态机强化增补（本次新增，不替换上文）

> 本附录为 v1.1 相比 v1 的**纯新增内容**，用于补齐上一轮 review 指出的状态机边界问题。

#### A-1. hypothesis_pool 与 outcome_pool 的硬边界补充

##### A-1.1 hypothesis_pool 的职责收窄

新增运行时约束：

`hypothesis_pool` 的职责是维护：

### **候选解释对象**

它主要承载：

- 问题性诊断对象
- 非问题性解释对象

不建议继续把“**不确定保留候选**”视为与普通 hypothesis 完全同层的常规候选项。

更准确地说：

- “不确定”更接近 **outcome 层状态**
- 而不是普通解释对象

因此，后续实现中默认应优先采用以下边界：

- `hypothesis_pool`：维护“可解释对象竞争”
- `outcome_pool`：维护“当前落到问题性 / 非问题性 / 不确定哪类结果”

##### A-1.2 outcome_pool 不是 hypothesis_pool 的镜像复制

新增运行时约束：

`outcome_pool` 不能退化成“把 hypothesis_pool 排序结果换个名字再抄一遍”。

它必须承担独立职责：

- 维护结论类型竞争
- 维护输出资格判断
- 维护最终结论锁定状态

---

#### A-2. outcome_pool 必须具备结论状态机字段

为避免 `outcome_pool` 退化成简单结果列表，新增字段建议：

##### 对每条 `outcome_item` 增补：
- `结论状态`
  - 候选中
  - 暂时领先
  - 待确认
  - 可输出
  - 已锁定
  - 已淘汰

补充说明：

- 原有 `是否允许立即输出` 可以保留
- 但它不应再是唯一的输出资格表达方式
- `结论状态` 才是更强的运行时状态机字段

---

#### A-3. stop_state 必须由 outcome 状态驱动，不允许自由停止

新增运行时硬约束：

`stop_state` 不能成为任意模块都可自由写入的状态对象。

`stop_state` 的成立，必须依赖以下至少一项：

1. 某个 `outcome_item` 进入：
   - 可输出
   - 或已锁定
2. 所有 active outcome 都不足以继续提升，且继续提问收益过低
3. 用户中断
4. 系统资源 / 轮次上限触发

也就是说：

- `stop_state` 是停止判定对象
- 但不是自由来源状态

---

#### A-4. question_queue 必须具备“重复确认阻断”能力

为防止系统反复确认同一事实，新增运行时字段建议：

##### 对每条 `question_item` 增补：
- `覆盖证据键列表`
- `覆盖事实维度`
- `是否与已确认事实重复`
- `重复确认阻断原因`

新增运行时约束：

如果某一事实已经满足以下条件之一：

- 已有高置信视觉证据支持
- 已有高可信用户回答支持
- 已被近期问题确认过
- 当前候选对象竞争已不再依赖该事实

则后续相似问题应默认失效或降权，而不是继续进入高优先级。

---

#### A-5. normalized_input 必须补充输入质量判断

为避免系统在输入入口就明显不足时仍假装正常分析，新增字段建议：

##### 对 `normalized_input` 增补：
- `输入质量等级`
  - 可分析
  - 勉强可分析
  - 不足以分析
- `主要质量问题`
  - 模糊
  - 过暗
  - 过曝
  - 主体缺失
  - 部位不明确
  - 非植物图像疑似

新增运行时约束：

若 `输入质量等级 = 不足以分析`，则系统应允许：

- 快速进入不确定结论路径
- 或强制优先进入补图 / 重新上传路径

而不是继续执行完整问题性竞争流程。

---

#### A-6. observed_evidence_set 必须补充证据冲突状态

为支持“不确定结论”的中途形成，新增字段建议：

##### 对每条 `evidence_item` 增补：
- `冲突证据键列表`
- `冲突等级`
- `是否已解决冲突`

补充说明：

当系统出现以下情况时，应显式记录冲突，而不是只在 outcome 层含糊兜底：

- 图像像病斑，但历史描述像长期稳定特征
- 用户前后回答冲突
- 视觉结果与宿主先验显著冲突

---

#### A-7. diagnostic_trace 必须补充决策快照摘要

为避免 trace 只像日志而不像审计轨迹，新增字段建议：

##### 对每条 `trace_event` 可选增补：
- `决策快照摘要`

建议至少可记录：

- 当时 top3 hypotheses
- 当时 top2 outcomes
- 当时 question_queue 前两项
- 当时 stop risk / 停止风险提示

补充说明：

这样后续不只知道“发生了什么”，还知道“当时系统为什么会那样判断”。

---

#### A-8. 运行时应引入轮次（round / turn）概念

为支持多轮追问与多轮回流，新增建议：

##### 方案 A：新增轻量运行时对象
- `diagnostic_round`

##### 方案 B：在现有运行时对象中统一增加字段
- `round_index`

默认建议：

- 若实现阶段希望控制对象数量，可先采用 `round_index`
- 但无论如何，运行时必须能区分“第几轮获得的证据 / 第几轮形成的结论变化”

否则后续：

- 提问收益比较
- 轨迹回放
- 停止条件解释

都会变弱。

---

#### A-9. 补充两个必要的失败 / 不收敛示例分支

原文已有一个“成功收敛到非问题性结论”的示例。为使运行时模型完整，新增两个最小示例分支。

##### 示例 B：输入质量不足，进入不确定结论

###### 场景
用户上传图片严重模糊，只能看出大致绿色轮廓，无法看清具体斑点和叶形。

###### 运行时路径
1. 创建 `diagnostic_session`
2. 进入 `normalized_input`
3. 标记：
   - `输入质量等级 = 不足以分析`
   - `主要质量问题 = 模糊 / 主体缺失`
4. 仅生成少量低可信证据
5. `hypothesis_pool` 不足以形成稳定竞争
6. `outcome_pool` 中“不确定结论”迅速上升
7. `question_queue` 优先生成“请补拍清晰近景图”类问题
8. 若用户未补图，则 `stop_state` 可因“不确定收敛”停止
9. 输出：
   - 当前无法安全判断
   - 请补拍清晰图片

---

##### 示例 C：证据冲突，继续追问收益过低，进入不确定结论

###### 场景
图像看起来像病斑，但用户多次说明“这块花纹一直都有”，同时图像中又缺少足够长期稳定特征证据。

###### 运行时路径
1. 初始 evidence set 支持问题性方向
2. 用户回答生成另一组支持非问题性方向的证据
3. `observed_evidence_set` 中形成冲突记录
4. `hypothesis_pool` 中问题性与非问题性方向都未被充分排除
5. `outcome_pool` 中“不确定结论”逐步上升
6. `question_queue` 评估后发现剩余问题信息增益有限
7. `stop_state` 以“不确定收敛”成立
8. 输出：
   - 当前不能安全判断为问题或正常特征
   - 建议继续观察是否扩展，或补充更多历史图像

---

#### A-10. 本轮增补后的实现优先级建议

在进入《决策流 v1》之前，运行时模型建议优先锁死以下实现边界：

##### P0 级优先落地
1. hypothesis_pool / outcome_pool 边界
2. outcome_item 的 `结论状态`
3. stop_state 的 outcome 驱动约束
4. question_queue 的重复确认阻断能力

##### P1 级优先落地
5. normalized_input 的输入质量等级
6. evidence_item 的冲突状态
7. trace_event 的决策快照摘要
8. round / turn 轮次标记

---

### 本版状态说明

- 本版保留 v1 正文主体
- 仅通过“附录 A”增补运行时状态机边界
- 未对原有适用条款做删减


### 运行时模型 v1.2（联动增补版，基于 v1.1 只增不减）

> 说明：
>
> - 本文档基于《运行时模型 v1.1（review 增补修正版，基于 v1 只增不减）》继续增补。
> - 本次增补来源：**《诊断结论层 v1.1（review 增补修正版）》**
> - 目标：把 outcome layer 深度 review 后新增的边界，正式压入 runtime 行为层。

---

### 附录 B：诊断结论层 v1.1 联动增补（本次新增，不替换原文与附录 A）

#### B-1. outcome_pool 中不确定结论的触发条件必须显式化

新增运行时约束：

`outcome_pool` 中“不确定结论”不得因为“系统暂时没想好”而自动上升。

它的合法上升路径必须来自以下至少一类信号：

##### B-1.1 输入不足型
- `normalized_input.输入质量等级 = 不足以分析`
- 或关键主体 / 关键部位缺失

##### B-1.2 证据冲突型
- `observed_evidence_set` 中存在高等级冲突
- 且当前轮次内无法解除

##### B-1.3 继续提问收益过低型
- `question_queue` 剩余高价值问题不足
- 或用户已中断 / 无法继续补充关键数据

因此，runtime 中的不确定结论必须是：

- 由条件驱动
- 可解释
- 可追踪

而不是兜底默认项。

---

#### B-2. outcome_item 的保守输出 / 观察输出边界

新增运行时约束：

即使 `outcome_item` 进入“可输出”状态，也不代表一定应进入“明确处理”或“完全无需观察”两端。

后续 runtime 在输出 decision summary 时，应允许参考：

- `输出保守度`
- `结论子类型`
- `结论状态`

从而形成以下差异：

##### 非问题性结论
- 稳定正常 → 可直接输出“无需处理”
- 暂时可接受 → 更适合输出“当前不构成问题，但建议观察”

##### 不确定结论
- 输入不足 → 输出“无法安全判断，请补图”
- 证据冲突 → 输出“当前存在冲突信息，建议补关键辨别信息”
- 收益过低 → 输出“当前无法明显提升判断质量，建议观察变化”

---

#### B-3. outcome_pool 与 hypothesis_pool 的关系进一步澄清

新增运行时约束：

- `hypothesis_pool` 仍负责上游解释对象竞争
- `outcome_pool` 负责最终输出类型与具体结论收敛

因此：

- runtime 不得直接把“正常判断依据”放入 hypothesis_pool 作为完整 outcome 替代物
- runtime 也不得把 outcome_pool 降格为 hypothesis 排序镜像

---

#### B-4. 非问题性结论不等于终止所有观察

新增运行时边界：

### **非问题性结论只表示当前不构成问题性诊断结论，不等于后续永远无需观察。**

因此，当 outcome 属于以下类型时，runtime 应允许：

- 输出“当前更像正常 / 非病理性情况”
- 同时附带“若后续扩展 / 恶化，请重新诊断”的条件性提示

这尤其适用于：

- 暂时可接受状态
- 已停止发展的旧痕
- 某些阶段性变化

---

#### B-5. 复合场景的运行时承认

新增边界说明：

当系统遇到如下场景时：

- 背景存在非问题性特征
- 局部又出现新问题性变化

runtime 不应被迫把整个会话粗暴压成“纯正常”或“纯问题”。

当前版本可先采用：

- 主导结论 + 风险备注

的方式承接。

也就是说，至少要允许：

- 主输出是问题性结论
- 但 trace / explanation 中承认背景非问题性特征存在

这条为后续复合输出能力预留合法空间。

---

#### B-6. diagnostic_trace 必须记录 outcome 触发依据

新增 trace 要求：

当 runtime 中某个 outcome_item 明显上升、切换或锁定时，trace 中应可记录：

- 触发类型
  - 输入不足
  - 证据冲突
  - 非问题性支持增强
  - 问题性支持增强
  - 提问收益下降
- 对应关键依据摘要

这样才能在后续解释中回答：

- 为什么不是问题
- 为什么是不确定
- 为什么当前虽不是问题，但仍建议观察

---

#### B-7. stop_state 与 outcome 子类型联动

新增运行时约束：

`stop_state` 在成立时，不仅要记录：

- 问题性收敛
- 非问题性收敛
- 不确定收敛

还应允许后续 explanation 读取：

- 结论子类型
- 输出保守度

从而避免：

- 所有非问题性收敛都被解释成“完全结束，无需再管”
- 所有不确定收敛都被解释成同一种“没法判断”


### 运行时模型 v1.4（身份主链路拆分联动版，基于 v1.3 只增不减）

> 说明：
>
> - 本文档基于《运行时模型 v1.3（AI视觉入口层联动增补版）》继续增补。
> - 本次增补目标：
>   - 把植物身份主链路与症状主链路在 runtime 中正式拆开

---

### 附录 D：身份主链路拆分联动增补（本次新增，不替换原文）

#### D-1. normalized_input 中的植物身份部分应来自 identity resolution

新增运行时边界：

`normalized_input.植物身份主结果` 不应来自混元视觉候选，而应来自：

### **百度植物识别 → taxonomy 匹配 → plant_identity_resolution_record**

也就是说：
- 身份主结果是 identity resolution 的产物
- 不是症状链的副产物

---

#### D-2. 身份链与症状链在 runtime 的并行上游

新增运行时结构关系：

##### 身份链上游
- baidu 植物识别结果
- taxonomy 命中结果
- plant_identity_resolution_record

##### 症状链上游
- 混元症状输出
- visual_normalized_result
- visual_admission_record

##### 汇合点
- normalized_input
- 宿主先验挂点
- observed_evidence_set（仅症状链）
- question_queue（二者共同影响）

---

#### D-3. taxonomy 命中后的会话身份状态

新增运行时语义：

当 taxonomy 命中时，当前会话可获得：

- `当前会话植物身份主结果`
- `当前会话宿主先验挂点`

但这不等于：
- final diagnosis
- final outcome

---

#### D-4. unresolved 身份状态

新增运行时状态要求：

若百度识别未命中 taxonomy，则应显式保留：

- `identity_resolution_status = unresolved`

并允许：
- explanation 提示身份未稳定命中
- question 继续围绕症状主链运行
- 宿主先验部分降级或缺省

禁止：
- 自动伪造 plant identity
- 把未归一名称当正式主身份结果




### ================================
### v1.5 新增附录开始（基于现有有效内容只增不减）
### ================================

### 附录：属级养护基线与运行时关系增补（本次新增，不替换上文）

#### 1. 属级养护基线不是诊断运行时核心竞争对象

新增运行时边界：

### **属级养护基线不是 problem competition 的核心竞争对象。**

它不直接进入：
- outcome_pool
- problem top1 竞争
- symptom 真值竞争

---

#### 2. 它在运行时中的合法作用

属级养护基线可在运行时中作为：

- 宿主环境背景
- explanation 辅助
- 行动建议生成输入
- 环境偏离判断参考

但不得直接改写：

- evidence state
- symptom 真值
- outcome object

---

#### 3. 建议进入的运行时阶段

它更适合进入：

- explanation 组织阶段
- action policy / 行动建议阶段
- 环境偏离判断阶段

而不是：
- 早期视觉接纳阶段
- problem taxonomy 主竞争阶段




### ================================
### v1.6 新增附录开始（基于现有有效内容只增不减）
### ================================

### 附录：收益驱动停止策略运行时增补（本次新增，不替换上文）

#### 1. stop_state 必须增加收益判定依据

新增运行时边界：

### **stop_state 不得只记录“已到轮次”或“还有题”，必须记录为什么继续追问没有足够收益。**

推荐最小字段增补：

- `required_gate_ids`
- `unmet_required_gate_ids`
- `output_eligibility_state`
- `next_question_gain_class`
  - `high`
  - `low`
  - `none`
- `next_question_gain_reason`
- `suppressed_low_gain_question_ids`
- `stop_reason_detail`
- `final_allowed_after_gain_check`

#### 2. 必答 gate 层是 final 的唯一追问阻断层

运行时必须显式计算 `gate_required_layer`。

只有以下对象允许进入该层：

1. 模式入口 gate
2. 输出资格 gate
3. top 与 runner-up 区分 gate
4. 合法 uncertain gate
5. 安全 / 动作边界 gate

普通背景题、解释题、严重程度题、护理建议题不得进入 `gate_required_layer`。

#### 3. 下一题收益判定顺序

每次 evidence / outcome 更新后，运行时必须按以下顺序判断：

1. 更新 `observed_evidence_set`
2. 更新 `hypothesis_pool`
3. 更新 `outcome_pool`
4. 计算 `gate_required_layer`
5. 计算 `output_eligibility_state`
6. 计算下一题收益
7. 若无高价值题，则进入 stop_state

下一题只有满足以下至少一项，才能标记为 `high`：

- 补齐 context guard
- 改变 output eligibility
- 区分 top 与 runner-up
- 触发合法 uncertain

若问题无 `directProblemAdjustments`，且没有显式 `context_guard / output_eligibility / uncertain_legality / safety_boundary` 影响，则必须标记为 `low`。

#### 4. 一页一题后的总收益停止

一页一题只改变交互颗粒度，不改变诊断停止原则。

运行时不得：

- 用“最多 2 轮”硬截断常规 final
- 因为一页一题而无限追问
- 因低价值题未问完而阻塞 final

运行时必须：

- 每答一题就重算收益
- 只在有高价值题时继续问
- 在输出资格满足且无高价值题时停止
- 在输出资格不满足但无高价值题且满足合法条件时进入 uncertain

#### 5. edema / overwatering 路径的运行时裁决

当 edema / overwatering 已具备正式形态正证据，且 top outcome 已满足输出资格：

- `progression`
- `distribution_scope`
- `host_confirmation`
- `underside_presence`
- 光照变化泛问
- 无 `directProblemAdjustments` 的背景题

必须进入 `suppressed_low_gain_question_ids`，不得继续占用 follow-up。

只有能补齐浇水 / 土壤湿度 / 排水 / 盆土状态 context guard，或能实质区分当前 top 与 runner-up 的问题，才允许继续作为高价值题。



## [S12] 决策流 v1.4（完整最终版）

- 文件名：`决策流_v1_4_完整最终版_标题版本已统一.md`
- 状态：A类正式基线
- 类别：诊断主链
- 用途：九阶段决策流；输入→证据→解释竞争→结论收敛→动作输出
- SHA-256 前 16 位：`42c89a37b150b957`

---

### 决策流 v1.4（完整最终版）

> 说明：
>
> - 本文件为完整最终文件，不是纯补丁。
> - 本文件完整保留当前可确认有效的前版正文与联动增补内容，并在其后追加新的联动附录。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **只增不减**

---

### 决策流 v1

> 说明：
>
> - 本文档基于当前最新文档体系继续向下推进：
>   - 《诊断系统硬约束清单 v2.3（联动增补版，基于 v2.2 只增不减）》
>   - 《诊断结论层 v1.1（review 增补修正版，基于 v1 只增不减）》
>   - 《诊断目标分层 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《核心数据结构 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《运行时模型 v1.2（联动增补版，基于 v1.1 只增不减）》
>   - 《统一术语表 v1.1（review 修正版）》
> - 本文档目标不是新增静态对象，而是定义：
>
> # **这些对象在时间顺序上到底如何流动。**
>
> - 本文档仍遵循：
>   - 中文主名优先
>   - 英文仅作辅助标记
>   - 过程层与输出层不得混层

---

### 0. 文档定位

如果说：

- 《核心数据结构》定义的是“系统有哪些静态主对象”
- 《运行时模型》定义的是“会话中有哪些运行时状态对象”

那么《决策流》定义的就是：

> **这些对象在一次真实诊断中，按什么顺序被创建、更新、淘汰、收敛与停止。**

换句话说，本文件回答的是：

1. 一次诊断从哪里开始
2. 第一批证据如何进入系统
3. 候选解释对象如何生成
4. 结论类型如何更新
5. 什么时候问问题
6. 什么时候不该再问
7. 什么时候可以输出
8. 什么时候必须停在不确定
9. 什么时候允许输出“当前不是问题”

---

#### 0.1 本文档不负责什么

本文档不负责：

- 长期知识字段定义
- 具体权重公式
- 具体 SQL 设计
- 前端页面样式
- 大模型 prompt 细节

这些分别属于：

- 核心数据结构
- 评分与规则实现层
- 前端交互层
- AI 输入输出实现层

---

#### 0.2 本文档负责什么

本文档负责定义：

- 决策顺序
- 更新顺序
- 禁止绕过的环节
- 停止条件判定顺序
- 输出判定顺序
- 不确定结论的合法进入顺序

---

### 1. 决策流总原则

#### 1.1 决策流必须遵守“证据优先，解释驱动，结论收敛”

整个流程的基本主轴必须是：

### **输入 → 证据 → 解释对象竞争 → 结论收敛 → 动作输出**

禁止走成：

- 输入 → top1 symptom → 直接动作
- 输入 → 直接选一个 problem
- 输入 → 直接在“问题 / 正常 / 不确定”里拍脑袋选一个

---

#### 1.2 结论层不能绕过解释层

新增流程硬规则：

### **结论收敛必须由解释对象竞争驱动。**

因此，问题性 / 非问题性 / 不确定结论的形成，必须来自：

- 证据状态
- 解释对象竞争状态
- 提问收益状态
- 输入质量状态
- 证据冲突状态

而不是直接由某个 UI 分支或某个单条规则硬写 outcome。

---

#### 1.3 不确定结论必须后置判断，但允许早期触发

“不确定”不能在系统一开始就被当成默认答案。

但若出现明确触发条件，例如：

- 输入质量不足
- 关键主体缺失
- 非植物图像疑似

则系统可以：

- 提前进入“不确定路径”
- 或优先进入“补图 / 重新输入路径”

因此：

### **不确定结论不是默认起点，但可以是合法早停终点。**

---

#### 1.4 问题性与非问题性都必须经过竞争，不允许单边默认获胜

系统不得默认：

- 观察到异常就一定是问题
- 只要像艺斑就一定是非问题
- 只要像旧伤就一定不追问

而应当通过：

- 证据
- 历史稳定性
- 扩展性
- 输入质量
- 冲突状态
- 提问收益

共同决定主导结论。

---

### 2. 决策流主阶段总览

本系统 v1 的主流程，建议分为 9 个阶段：

1. **会话创建阶段**
2. **输入归一化阶段**
3. **初始证据生成阶段**
4. **初始解释对象生成阶段**
5. **首轮结论收敛阶段**
6. **提问决策阶段**
7. **回答回流与重算阶段**
8. **停止判定阶段**
9. **最终输出阶段**

后面逐一展开。

---

### 3. 会话创建阶段

#### 3.1 目标

建立一次诊断的最小运行时容器。

#### 3.2 输入

用户可能提供：

- 图片
- 图片 + 植物名
- 图片 + 文本描述
- 仅回答上一轮追问

#### 3.3 输出

创建：

- `诊断会话（diagnostic_session）`

并初始化：

- 会话状态 = 活跃
- 当前阶段 = 输入归一化中
- 当前轮次 = 0 或 1（按实现约定）

#### 3.4 本阶段禁止事项

- 禁止直接生成最终结论
- 禁止直接写 stop_state
- 禁止直接问问题
- 禁止直接修改 action policy

---

### 4. 输入归一化阶段

#### 4.1 目标

把用户原始输入整理成统一可消费表示。

#### 4.2 处理内容

系统应在此阶段尽量确定：

- 图像是否存在
- 主体是否像植物
- 主体部位更像哪里
- 植物身份是否已有输入
- 原始文本描述是否可用
- 输入质量等级如何

#### 4.3 输出对象

更新 / 创建：

- `输入归一化结果（normalized_input）`

至少写入：

- 图像列表
- 植物身份输入
- 受影响部位初判
- 原始文本描述
- 输入质量等级
- 主要质量问题

#### 4.4 关键分支：输入质量不足

若出现以下情况之一：

- 图片严重模糊
- 主体缺失
- 关键部位缺失
- 非植物图像疑似

则流程不必强行进入完整问题性竞争。

此时应优先进入：

- 初始低可信证据生成
- 不确定路径评估
- 补图优先问题生成

即：

### **输入质量不足时，决策流应缩短，不应假装完整诊断。**

---

### 5. 初始证据生成阶段

#### 5.1 目标

把归一化输入转成第一批可被系统消费的证据。

#### 5.2 证据来源

初始证据可来自：

- 图像识别
- 用户原始文本
- 植物身份输入
- 静态宿主先验
- 规则派生

#### 5.3 输出对象

更新：

- `已观察证据集（observed_evidence_set）`

#### 5.4 关键规则

##### 5.4.1 先记录原始证据，再派生模式证据
不允许直接只记模式证据而丢失原始证据来源。

##### 5.4.2 必须保留证据来源类型
因为图像识别证据、用户回答证据、先验证据不能同权裸混。

##### 5.4.3 若已有明显冲突，必须显式记录
例如：

- 图像像病斑
- 用户文本说“这块一直都有”

此时应写入：
- 证据冲突状态
- 冲突证据引用

而不是等到 outcome 层再含糊处理。

---

### 6. 初始解释对象生成阶段

#### 6.1 目标

根据当前证据集，生成第一批候选解释对象。

#### 6.2 解释对象来源

解释对象可包括：

- 问题性诊断对象
- 非问题性解释对象

当前统一裁决下：

### **不确定结论不作为常规 hypothesis item 生成。**

不确定应来自：

- 输入质量
- 证据冲突
- 提问收益
- 停止条件

这些运行时条件，而不是作为普通解释对象与病虫害同层竞争。

#### 6.3 输出对象

更新：

- `诊断假设池（hypothesis_pool）`

每个 hypothesis item 至少应有：

- 对象类型
- 关联对象键
- 支持强度
- 削弱强度
- 排除状态
- 活跃状态

#### 6.4 关键规则

##### 6.4.1 problem taxonomy 只进入问题性对象
##### 6.4.2 非问题性对象必须是 outcome-ready 的解释对象
不得把“边界清晰”“无扩展性”这种正常判断依据直接升格成 hypothesis object。

##### 6.4.3 宿主先验只能轻偏置，不可压倒高置信观察证据

---

### 7. 首轮结论收敛阶段

#### 7.1 目标

将当前解释对象竞争状态，映射到结论层收敛状态。

#### 7.2 输出对象

更新：

- `结论候选池（outcome_pool）`

#### 7.3 本阶段必须完成的事情

##### A. 判断当前更像哪类结论
- 问题性结论
- 非问题性结论
- 不确定结论

##### B. 给每个 outcome item 赋予：
- 结论类型
- 结论对象
- 结论状态
- 输出保守度（若已可判断）
- 主要依据
- 主要风险

#### 7.4 结论状态推进规则

建议按以下顺序推进：

- 候选中
- 暂时领先
- 待确认
- 可输出
- 已锁定

并允许：

- 已淘汰

#### 7.5 本阶段关键判断

##### 7.5.1 若输入不足明显成立
则“不确定结论”可以快速进入：
- 暂时领先
- 甚至待确认

##### 7.5.2 若问题性与非问题性证据同时强，但冲突未解
则不确定结论应上升，但不应立即锁定，除非：
- 当前轮次已无高价值问题可问
- 或用户无法继续补充信息

##### 7.5.3 若非问题性方向明显领先
也不代表自动“完全结束”
还应结合：
- 输出保守度
- 是否需观察
- 是否需条件性复查提示

---

### 8. 提问决策阶段

#### 8.1 目标

判断当前是否还值得继续提问，以及问什么最值。

#### 8.2 决策前提

只有在以下条件同时满足时，才应继续提问：

1. 当前尚未达到可稳定输出
2. 至少存在一个高价值待确认分歧
3. 至少存在一个问题，其信息增益仍显著
4. 当前问题不与已确认事实重复

#### 8.3 输出对象

更新：

- `诊断提问队列（question_queue）`

#### 8.4 提问生成优先级

推荐顺序：

##### 第一优先
解除主导分歧的问题  
例如：
- 这块斑是不是一直都有？
- 最近是否明显扩展？

##### 第二优先
解除高等级证据冲突的问题

##### 第三优先
提升动作策略稳定性的问题

##### 不应优先
- 重复确认已被高置信视觉支持的事实
- 与当前主导分歧无关的背景闲问

#### 8.5 重复确认阻断

若某事实已满足以下任一条件：

- 已有高置信视觉证据支持
- 已有高可信用户回答支持
- 已在本会话近期被确认
- 当前结论竞争已不再依赖该事实

则相似问题应：

- 直接失效
- 或显著降权

---

### 9. 回答回流与重算阶段

#### 9.1 目标

把用户对提问的回答重新注入系统，并触发局部重算。

#### 9.2 回流原则

回答不能直接改 outcome。  
必须先转成：

- 新证据
- 或证据状态修正

然后再依次更新：

1. `observed_evidence_set`
2. `hypothesis_pool`
3. `outcome_pool`
4. `question_queue`
5. `stop_state`（如满足）

#### 9.3 禁止事项

- 禁止“回答 A → 某 outcome 直接 +1”
- 禁止绕过 evidence set
- 禁止跳过 hypothesis_pool 直接改 outcome_pool

#### 9.4 局部重算优先级

##### 第一层：证据更新
##### 第二层：解释对象更新
##### 第三层：结论状态更新
##### 第四层：提问收益重估
##### 第五层：停止条件重判

---

### 10. 停止判定阶段

#### 10.1 目标

判断本次会话是否可以合法停下。

#### 10.2 停止必须后置判断

stop_state 不能在流程中自由出现。  
它必须在以下对象更新后再判断：

- observed_evidence_set
- hypothesis_pool
- outcome_pool
- question_queue

#### 10.3 合法停止条件

##### A. 问题性结论已可输出
满足示意：
- 主导问题性结论已明显领先
- 关键反证不足以推翻
- 继续提问收益低

##### B. 非问题性结论已可输出
满足示意：
- 非问题性方向领先
- 问题性证据不足
- 继续提问收益低
- 输出保守度允许对外表达

##### C. 不确定结论合法收敛
满足至少一种：
- 输入不足无法补齐
- 高等级证据冲突未解
- 继续提问收益过低
- 用户中断导致关键问题无法再验证

##### D. 用户中断 / 系统超限
- 用户终止
- 系统资源保护上限（不得等同硬性 2 轮）
- 系统资源保护

#### 10.4 停止不等于明确输出

这条必须写死：

### **会话可以停止，不代表一定能给出高确定性的明确输出。**

例如：
- 不确定结论也可以是合法停止终点
- 非问题性结论也可以以“保守输出 + 观察提示”作为停止终点

---

### 11. 最终输出阶段

#### 11.1 目标

把当前会话内部状态转成对用户可表达的最终结果。

#### 11.2 决定最终输出所需的联合条件

最终输出应至少联合以下因素：

- 主导结论
- 结论类型
- 结论状态
- 输出保守度
- 停止状态
- 行动策略

#### 11.3 输出模板

##### A. 问题性结论
应说明：
- 当前更像什么问题
- 为什么这样判断
- 建议做什么

##### B. 非问题性结论
应说明：
- 当前更像什么正常 / 非病理性情况
- 为什么不更像问题
- 是否需要观察

##### C. 不确定结论
应说明：
- 当前为什么不能安全判断
- 缺什么
- 下一步补什么

#### 11.4 复合场景的当前承接方式

当前版本可采用：

### **主导结论 + 背景说明 / 风险备注**

例如：
- 主输出：局部问题性变化更值得处理
- 备注：背景存在稳定非问题性特征，不建议把整株都当成病害

---

### 12. 三条典型主流程

#### 12.1 主流程 A：问题性结论收敛

1. 创建会话
2. 输入归一化
3. 生成初始证据
4. 生成问题性与非问题性解释对象
5. 问题性方向明显领先
6. 必要提问进一步确认
7. 问题性 outcome 进入可输出 / 已锁定
8. stop_state 成立
9. 输出问题性结论 + 动作建议

---

#### 12.2 主流程 B：非问题性结论收敛

1. 创建会话
2. 输入归一化
3. 发现斑驳 / 色差等表象
4. 证据支持稳定特征 / 正常阶段现象
5. 问题性方向竞争不足
6. 如有必要，追问稳定性 / 扩展性
7. 非问题性 outcome 进入可输出
8. stop_state 成立
9. 输出：
   - 当前更像非问题性情况
   - 暂不建议按病害处理
   - 若后续扩展再复查

---

#### 12.3 主流程 C：不确定结论合法收敛

1. 创建会话
2. 输入归一化
3. 发现输入质量不足，或证据冲突明显
4. 初始 evidence / hypothesis 无法形成稳定优势
5. outcome_pool 中不确定方向上升
6. question_queue 评估后：
   - 要么优先补图
   - 要么发现继续追问收益过低
7. 若关键信息无法补齐，则不确定 outcome 进入可输出
8. stop_state 成立
9. 输出：
   - 当前不能安全判断
   - 明确缺口
   - 明确下一步

---

### 13. 决策流中的禁止跳步清单

为了防止后续实现回退，以下跳步一律禁止：

#### 13.1 输入 → 直接 problem
禁止。

#### 13.2 symptom → 直接 action
禁止。

#### 13.3 回答 → 直接改 outcome
禁止。

#### 13.4 question_queue 空 → 自动 stop
禁止。  
还必须检查：
- outcome 状态
- 不确定触发条件
- 用户中断情况

#### 13.5 主导结论出现 → 自动 final output
禁止。  
还必须检查：
- 结论状态
- 输出保守度
- stop_state

---

### 14. 当前版本仍未完全解决但已预留的点

#### 14.1 复合场景的完整双层输出
当前仅预留：
- 主导结论 + 背景备注

未来可扩展更完整表达。

#### 14.2 提问收益的数值化阈值
当前文档定义了流程位置，但未冻结公式。

#### 14.3 不同来源证据的精细权重融合
当前仅定义顺序与边界，不定义精算公式。

---

### 15. 最终裁决

《决策流 v1》的核心目的不是“把流程画复杂”，而是：

> **把输入、证据、解释对象、结论、提问、停止、输出之间的时间顺序和主从关系锁死。**

因此，本系统当前的正确主流程应固定为：

### **会话创建 → 输入归一化 → 初始证据生成 → 初始解释对象生成 → 首轮结论收敛 → 提问决策 → 回答回流与重算 → 停止判定 → 最终输出**

并且必须固定以下主轴：

- 证据优先
- 解释驱动
- 结论收敛
- 停止后置
- 输出受保守度与状态约束

---

### 16. 下一步建议

在《决策流 v1》之后，更合理的下一步有两个方向：

#### 方向 A：治理侧
### 《准入与退役规则 v1》

把：
- problem
- evidence
- outcome
- question
的入库与退役标准彻底写死。

#### 方向 B：产品落地侧
### 《最小可用知识库 v1》

基于当前架构，定义第一批真正要做的：
- 问题簇
- outcome 对象
- evidence
- question
- action policy

若以落地优先，我更建议先进入：

### **《准入与退役规则 v1》**


### 决策流 v1.1（review 增补修正版，基于 v1 只增不减）

> 说明：
>
> - 本文档遵循“**基于上一版更新只能新增不可减少**”的规则。
> - 因此，本版不是压缩重写版，而是**在《决策流 v1》基础上做增补修订**。
> - 本次增补的核心目的，是把上一轮 review 中指出的关键状态机边界补齐：
>   - 各阶段的进入条件 / 完成条件 / 失败出口
>   - “首轮结论收敛阶段”更名为“初始结论评估阶段”
>   - 不确定结论的延迟锁定机制
>   - 阶段回跳规则
>   - 无提问直出条件
>   - 输出资格判定的显式化
> - 本文档应与以下文档配套阅读：
>   - 《诊断系统硬约束清单 v2.3（联动增补版，基于 v2.2 只增不减）》
>   - 《诊断结论层 v1.1（review 增补修正版，基于 v1 只增不减）》
>   - 《诊断目标分层 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《核心数据结构 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《运行时模型 v1.2（联动增补版，基于 v1.1 只增不减）》
>   - 《统一术语表 v1.1（review 修正版）》
>   - 《决策流 v1》

---

### 决策流 v1

> 说明：
>
> - 本文档基于当前最新文档体系继续向下推进：
>   - 《诊断系统硬约束清单 v2.3（联动增补版，基于 v2.2 只增不减）》
>   - 《诊断结论层 v1.1（review 增补修正版，基于 v1 只增不减）》
>   - 《诊断目标分层 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《核心数据结构 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《运行时模型 v1.2（联动增补版，基于 v1.1 只增不减）》
>   - 《统一术语表 v1.1（review 修正版）》
> - 本文档目标不是新增静态对象，而是定义：
>
> # **这些对象在时间顺序上到底如何流动。**
>
> - 本文档仍遵循：
>   - 中文主名优先
>   - 英文仅作辅助标记
>   - 过程层与输出层不得混层

---

### 0. 文档定位

如果说：

- 《核心数据结构》定义的是“系统有哪些静态主对象”
- 《运行时模型》定义的是“会话中有哪些运行时状态对象”

那么《决策流》定义的就是：

> **这些对象在一次真实诊断中，按什么顺序被创建、更新、淘汰、收敛与停止。**

换句话说，本文件回答的是：

1. 一次诊断从哪里开始
2. 第一批证据如何进入系统
3. 候选解释对象如何生成
4. 结论类型如何更新
5. 什么时候问问题
6. 什么时候不该再问
7. 什么时候可以输出
8. 什么时候必须停在不确定
9. 什么时候允许输出“当前不是问题”

---

#### 0.1 本文档不负责什么

本文档不负责：

- 长期知识字段定义
- 具体权重公式
- 具体 SQL 设计
- 前端页面样式
- 大模型 prompt 细节

这些分别属于：

- 核心数据结构
- 评分与规则实现层
- 前端交互层
- AI 输入输出实现层

---

#### 0.2 本文档负责什么

本文档负责定义：

- 决策顺序
- 更新顺序
- 禁止绕过的环节
- 停止条件判定顺序
- 输出判定顺序
- 不确定结论的合法进入顺序

---

### 1. 决策流总原则

#### 1.1 决策流必须遵守“证据优先，解释驱动，结论收敛”

整个流程的基本主轴必须是：

### **输入 → 证据 → 解释对象竞争 → 结论收敛 → 动作输出**

禁止走成：

- 输入 → top1 symptom → 直接动作
- 输入 → 直接选一个 problem
- 输入 → 直接在“问题 / 正常 / 不确定”里拍脑袋选一个

---

#### 1.2 结论层不能绕过解释层

新增流程硬规则：

### **结论收敛必须由解释对象竞争驱动。**

因此，问题性 / 非问题性 / 不确定结论的形成，必须来自：

- 证据状态
- 解释对象竞争状态
- 提问收益状态
- 输入质量状态
- 证据冲突状态

而不是直接由某个 UI 分支或某个单条规则硬写 outcome。

---

#### 1.3 不确定结论必须后置判断，但允许早期触发

“不确定”不能在系统一开始就被当成默认答案。

但若出现明确触发条件，例如：

- 输入质量不足
- 关键主体缺失
- 非植物图像疑似

则系统可以：

- 提前进入“不确定路径”
- 或优先进入“补图 / 重新输入路径”

因此：

### **不确定结论不是默认起点，但可以是合法早停终点。**

---

#### 1.4 问题性与非问题性都必须经过竞争，不允许单边默认获胜

系统不得默认：

- 观察到异常就一定是问题
- 只要像艺斑就一定是非问题
- 只要像旧伤就一定不追问

而应当通过：

- 证据
- 历史稳定性
- 扩展性
- 输入质量
- 冲突状态
- 提问收益

共同决定主导结论。

---

### 2. 决策流主阶段总览

本系统 v1 的主流程，建议分为 9 个阶段：

1. **会话创建阶段**
2. **输入归一化阶段**
3. **初始证据生成阶段**
4. **初始解释对象生成阶段**
5. **首轮结论收敛阶段**
6. **提问决策阶段**
7. **回答回流与重算阶段**
8. **停止判定阶段**
9. **最终输出阶段**

后面逐一展开。

---

### 3. 会话创建阶段

#### 3.1 目标

建立一次诊断的最小运行时容器。

#### 3.2 输入

用户可能提供：

- 图片
- 图片 + 植物名
- 图片 + 文本描述
- 仅回答上一轮追问

#### 3.3 输出

创建：

- `诊断会话（diagnostic_session）`

并初始化：

- 会话状态 = 活跃
- 当前阶段 = 输入归一化中
- 当前轮次 = 0 或 1（按实现约定）

#### 3.4 本阶段禁止事项

- 禁止直接生成最终结论
- 禁止直接写 stop_state
- 禁止直接问问题
- 禁止直接修改 action policy

---

### 4. 输入归一化阶段

#### 4.1 目标

把用户原始输入整理成统一可消费表示。

#### 4.2 处理内容

系统应在此阶段尽量确定：

- 图像是否存在
- 主体是否像植物
- 主体部位更像哪里
- 植物身份是否已有输入
- 原始文本描述是否可用
- 输入质量等级如何

#### 4.3 输出对象

更新 / 创建：

- `输入归一化结果（normalized_input）`

至少写入：

- 图像列表
- 植物身份输入
- 受影响部位初判
- 原始文本描述
- 输入质量等级
- 主要质量问题

#### 4.4 关键分支：输入质量不足

若出现以下情况之一：

- 图片严重模糊
- 主体缺失
- 关键部位缺失
- 非植物图像疑似

则流程不必强行进入完整问题性竞争。

此时应优先进入：

- 初始低可信证据生成
- 不确定路径评估
- 补图优先问题生成

即：

### **输入质量不足时，决策流应缩短，不应假装完整诊断。**

---

### 5. 初始证据生成阶段

#### 5.1 目标

把归一化输入转成第一批可被系统消费的证据。

#### 5.2 证据来源

初始证据可来自：

- 图像识别
- 用户原始文本
- 植物身份输入
- 静态宿主先验
- 规则派生

#### 5.3 输出对象

更新：

- `已观察证据集（observed_evidence_set）`

#### 5.4 关键规则

##### 5.4.1 先记录原始证据，再派生模式证据
不允许直接只记模式证据而丢失原始证据来源。

##### 5.4.2 必须保留证据来源类型
因为图像识别证据、用户回答证据、先验证据不能同权裸混。

##### 5.4.3 若已有明显冲突，必须显式记录
例如：

- 图像像病斑
- 用户文本说“这块一直都有”

此时应写入：
- 证据冲突状态
- 冲突证据引用

而不是等到 outcome 层再含糊处理。

---

### 6. 初始解释对象生成阶段

#### 6.1 目标

根据当前证据集，生成第一批候选解释对象。

#### 6.2 解释对象来源

解释对象可包括：

- 问题性诊断对象
- 非问题性解释对象

当前统一裁决下：

### **不确定结论不作为常规 hypothesis item 生成。**

不确定应来自：

- 输入质量
- 证据冲突
- 提问收益
- 停止条件

这些运行时条件，而不是作为普通解释对象与病虫害同层竞争。

#### 6.3 输出对象

更新：

- `诊断假设池（hypothesis_pool）`

每个 hypothesis item 至少应有：

- 对象类型
- 关联对象键
- 支持强度
- 削弱强度
- 排除状态
- 活跃状态

#### 6.4 关键规则

##### 6.4.1 problem taxonomy 只进入问题性对象
##### 6.4.2 非问题性对象必须是 outcome-ready 的解释对象
不得把“边界清晰”“无扩展性”这种正常判断依据直接升格成 hypothesis object。

##### 6.4.3 宿主先验只能轻偏置，不可压倒高置信观察证据

---

### 7. 首轮结论收敛阶段

#### 7.1 目标

将当前解释对象竞争状态，映射到结论层收敛状态。

#### 7.2 输出对象

更新：

- `结论候选池（outcome_pool）`

#### 7.3 本阶段必须完成的事情

##### A. 判断当前更像哪类结论
- 问题性结论
- 非问题性结论
- 不确定结论

##### B. 给每个 outcome item 赋予：
- 结论类型
- 结论对象
- 结论状态
- 输出保守度（若已可判断）
- 主要依据
- 主要风险

#### 7.4 结论状态推进规则

建议按以下顺序推进：

- 候选中
- 暂时领先
- 待确认
- 可输出
- 已锁定

并允许：

- 已淘汰

#### 7.5 本阶段关键判断

##### 7.5.1 若输入不足明显成立
则“不确定结论”可以快速进入：
- 暂时领先
- 甚至待确认

##### 7.5.2 若问题性与非问题性证据同时强，但冲突未解
则不确定结论应上升，但不应立即锁定，除非：
- 当前轮次已无高价值问题可问
- 或用户无法继续补充信息

##### 7.5.3 若非问题性方向明显领先
也不代表自动“完全结束”
还应结合：
- 输出保守度
- 是否需观察
- 是否需条件性复查提示

---

### 8. 提问决策阶段

#### 8.1 目标

判断当前是否还值得继续提问，以及问什么最值。

#### 8.2 决策前提

只有在以下条件同时满足时，才应继续提问：

1. 当前尚未达到可稳定输出
2. 至少存在一个高价值待确认分歧
3. 至少存在一个问题，其信息增益仍显著
4. 当前问题不与已确认事实重复

#### 8.3 输出对象

更新：

- `诊断提问队列（question_queue）`

#### 8.4 提问生成优先级

推荐顺序：

##### 第一优先
解除主导分歧的问题  
例如：
- 这块斑是不是一直都有？
- 最近是否明显扩展？

##### 第二优先
解除高等级证据冲突的问题

##### 第三优先
提升动作策略稳定性的问题

##### 不应优先
- 重复确认已被高置信视觉支持的事实
- 与当前主导分歧无关的背景闲问

#### 8.5 重复确认阻断

若某事实已满足以下任一条件：

- 已有高置信视觉证据支持
- 已有高可信用户回答支持
- 已在本会话近期被确认
- 当前结论竞争已不再依赖该事实

则相似问题应：

- 直接失效
- 或显著降权

---

### 9. 回答回流与重算阶段

#### 9.1 目标

把用户对提问的回答重新注入系统，并触发局部重算。

#### 9.2 回流原则

回答不能直接改 outcome。  
必须先转成：

- 新证据
- 或证据状态修正

然后再依次更新：

1. `observed_evidence_set`
2. `hypothesis_pool`
3. `outcome_pool`
4. `question_queue`
5. `stop_state`（如满足）

#### 9.3 禁止事项

- 禁止“回答 A → 某 outcome 直接 +1”
- 禁止绕过 evidence set
- 禁止跳过 hypothesis_pool 直接改 outcome_pool

#### 9.4 局部重算优先级

##### 第一层：证据更新
##### 第二层：解释对象更新
##### 第三层：结论状态更新
##### 第四层：提问收益重估
##### 第五层：停止条件重判

---

### 10. 停止判定阶段

#### 10.1 目标

判断本次会话是否可以合法停下。

#### 10.2 停止必须后置判断

stop_state 不能在流程中自由出现。  
它必须在以下对象更新后再判断：

- observed_evidence_set
- hypothesis_pool
- outcome_pool
- question_queue

#### 10.3 合法停止条件

##### A. 问题性结论已可输出
满足示意：
- 主导问题性结论已明显领先
- 关键反证不足以推翻
- 继续提问收益低

##### B. 非问题性结论已可输出
满足示意：
- 非问题性方向领先
- 问题性证据不足
- 继续提问收益低
- 输出保守度允许对外表达

##### C. 不确定结论合法收敛
满足至少一种：
- 输入不足无法补齐
- 高等级证据冲突未解
- 继续提问收益过低
- 用户中断导致关键问题无法再验证

##### D. 用户中断 / 系统超限
- 用户终止
- 系统资源保护上限（不得等同硬性 2 轮）
- 系统资源保护

#### 10.4 停止不等于明确输出

这条必须写死：

### **会话可以停止，不代表一定能给出高确定性的明确输出。**

例如：
- 不确定结论也可以是合法停止终点
- 非问题性结论也可以以“保守输出 + 观察提示”作为停止终点

---

### 11. 最终输出阶段

#### 11.1 目标

把当前会话内部状态转成对用户可表达的最终结果。

#### 11.2 决定最终输出所需的联合条件

最终输出应至少联合以下因素：

- 主导结论
- 结论类型
- 结论状态
- 输出保守度
- 停止状态
- 行动策略

#### 11.3 输出模板

##### A. 问题性结论
应说明：
- 当前更像什么问题
- 为什么这样判断
- 建议做什么

##### B. 非问题性结论
应说明：
- 当前更像什么正常 / 非病理性情况
- 为什么不更像问题
- 是否需要观察

##### C. 不确定结论
应说明：
- 当前为什么不能安全判断
- 缺什么
- 下一步补什么

#### 11.4 复合场景的当前承接方式

当前版本可采用：

### **主导结论 + 背景说明 / 风险备注**

例如：
- 主输出：局部问题性变化更值得处理
- 备注：背景存在稳定非问题性特征，不建议把整株都当成病害

---

### 12. 三条典型主流程

#### 12.1 主流程 A：问题性结论收敛

1. 创建会话
2. 输入归一化
3. 生成初始证据
4. 生成问题性与非问题性解释对象
5. 问题性方向明显领先
6. 必要提问进一步确认
7. 问题性 outcome 进入可输出 / 已锁定
8. stop_state 成立
9. 输出问题性结论 + 动作建议

---

#### 12.2 主流程 B：非问题性结论收敛

1. 创建会话
2. 输入归一化
3. 发现斑驳 / 色差等表象
4. 证据支持稳定特征 / 正常阶段现象
5. 问题性方向竞争不足
6. 如有必要，追问稳定性 / 扩展性
7. 非问题性 outcome 进入可输出
8. stop_state 成立
9. 输出：
   - 当前更像非问题性情况
   - 暂不建议按病害处理
   - 若后续扩展再复查

---

#### 12.3 主流程 C：不确定结论合法收敛

1. 创建会话
2. 输入归一化
3. 发现输入质量不足，或证据冲突明显
4. 初始 evidence / hypothesis 无法形成稳定优势
5. outcome_pool 中不确定方向上升
6. question_queue 评估后：
   - 要么优先补图
   - 要么发现继续追问收益过低
7. 若关键信息无法补齐，则不确定 outcome 进入可输出
8. stop_state 成立
9. 输出：
   - 当前不能安全判断
   - 明确缺口
   - 明确下一步

---

### 13. 决策流中的禁止跳步清单

为了防止后续实现回退，以下跳步一律禁止：

#### 13.1 输入 → 直接 problem
禁止。

#### 13.2 symptom → 直接 action
禁止。

#### 13.3 回答 → 直接改 outcome
禁止。

#### 13.4 question_queue 空 → 自动 stop
禁止。  
还必须检查：
- outcome 状态
- 不确定触发条件
- 用户中断情况

#### 13.5 主导结论出现 → 自动 final output
禁止。  
还必须检查：
- 结论状态
- 输出保守度
- stop_state

---

### 14. 当前版本仍未完全解决但已预留的点

#### 14.1 复合场景的完整双层输出
当前仅预留：
- 主导结论 + 背景备注

未来可扩展更完整表达。

#### 14.2 提问收益的数值化阈值
当前文档定义了流程位置，但未冻结公式。

#### 14.3 不同来源证据的精细权重融合
当前仅定义顺序与边界，不定义精算公式。

---

### 15. 最终裁决

《决策流 v1》的核心目的不是“把流程画复杂”，而是：

> **把输入、证据、解释对象、结论、提问、停止、输出之间的时间顺序和主从关系锁死。**

因此，本系统当前的正确主流程应固定为：

### **会话创建 → 输入归一化 → 初始证据生成 → 初始解释对象生成 → 首轮结论收敛 → 提问决策 → 回答回流与重算 → 停止判定 → 最终输出**

并且必须固定以下主轴：

- 证据优先
- 解释驱动
- 结论收敛
- 停止后置
- 输出受保守度与状态约束

---

### 16. 下一步建议

在《决策流 v1》之后，更合理的下一步有两个方向：

#### 方向 A：治理侧
### 《准入与退役规则 v1》

把：
- problem
- evidence
- outcome
- question
的入库与退役标准彻底写死。

#### 方向 B：产品落地侧
### 《最小可用知识库 v1》

基于当前架构，定义第一批真正要做的：
- 问题簇
- outcome 对象
- evidence
- question
- action policy

若以落地优先，我更建议先进入：

### **《准入与退役规则 v1》**

---

### 附录 A：review 后的状态机增补（本次新增，不替换上文）

> 本附录为 v1.1 相比 v1 的**纯新增内容**，用于把上一轮 review 中指出的状态机缺口补齐。

#### A-1. 九大阶段必须统一具备 7 个要素

从本版开始，后续所有阶段说明默认应补齐以下 7 个要素：

1. 阶段目标
2. 进入条件
3. 处理动作
4. 产出对象
5. 完成条件
6. 失败出口 / 旁路出口
7. 禁止事项

补充说明：

- v1 正文已给出各阶段的大体顺序与职责
- 本附录的作用，是把它们提升为更接近状态机文档的结构要求

---

#### A-2. 会话创建阶段增补

##### A-2.1 进入条件
- 用户提交了新的诊断请求
- 或用户在已有会话中发起新的完整诊断入口，而非单纯补答旧问题

##### A-2.2 完成条件
- `diagnostic_session` 已创建
- 会话状态已初始化
- 当前阶段已指向“输入归一化阶段”

##### A-2.3 失败出口
- 若系统无法创建 session（例如系统级错误），则流程直接中止，不进入后续决策流

---

#### A-3. 输入归一化阶段增补

##### A-3.1 进入条件
- 已存在有效 session
- 当前输入载体至少存在一种可解析来源（图像 / 文本 / 回答）

##### A-3.2 完成条件
- `normalized_input` 已生成
- 输入质量等级已赋值
- 已决定后续进入：
  - 正常初始证据生成路径
  - 或输入不足优先路径

##### A-3.3 失败出口 / 旁路出口
- 若输入完全不可解析，则直接进入：
  - 不确定路径预备
  - 或要求重新上传路径

---

#### A-4. 初始证据生成阶段增补

##### A-4.1 进入条件
- `normalized_input` 已完成
- 输入载体已被判定为至少“可尝试生成证据”

##### A-4.2 完成条件
- 第一批 raw evidence 已进入 `observed_evidence_set`
- 若满足派生条件，则第一批 derived evidence 也已生成
- 已记录关键证据来源类型
- 已记录显著证据冲突（若存在）

##### A-4.3 失败出口
- 若无法生成任何有效证据，则直接进入：
  - 初始不确定路径评估
  - 或补图 / 重新输入路径

---

#### A-5. 初始解释对象生成阶段增补

##### A-5.1 进入条件
- 已存在最小可用证据集
- 至少有一条证据可用于驱动解释对象生成

##### A-5.2 完成条件
- `hypothesis_pool` 已生成首批活跃解释对象
- 已完成问题性方向与非问题性方向的初始竞争准备

##### A-5.3 失败出口
- 若证据不足以生成任何稳定解释对象，则不直接硬造 hypothesis
- 应转入：
  - 不确定路径评估
  - 或补图 / 补问优先路径

---

#### A-6. “首轮结论收敛阶段”更名为“初始结论评估阶段”

从术语准确性与实现导向考虑，新增正式裁决：

### **原“首轮结论收敛阶段”更推荐命名为：初始结论评估阶段。**

原因：

- 这一阶段的本质是：
  - 初始 outcome 排位
  - 初始输出资格判断
  - 初始提问必要性判断
- 它不必然意味着：
  - 已真正收敛
  - 已可以锁定结论

因此，后续新文档与统一快照版中，建议优先采用：

### **初始结论评估阶段**

原“首轮结论收敛阶段”可作为历史兼容写法，但不再推荐继续扩散。

---

#### A-7. 初始结论评估阶段增补

##### A-7.1 进入条件
- hypothesis_pool 已有初始活跃解释对象
- observed_evidence_set 已达到首轮评估最低要求

##### A-7.2 完成条件
- `outcome_pool` 已生成首批 active outcome items
- 已完成：
  - 结论类型初判
  - 结论状态初判
  - 输出保守度初判（若条件足够）
- 已决定后续进入：
  - 提问决策阶段
  - 或停止判定阶段

##### A-7.3 失败出口
- 若当前 outcome 仍无法稳定成型，但存在补图或关键提问价值，则进入提问决策阶段
- 若既无稳定 outcome，又无高价值问题可问，则进入停止判定阶段并倾向不确定路径

---

#### A-8. 不确定结论必须采用“延迟锁定机制”

新增状态机硬规则：

### **不确定结论可以上升，但不应过早锁定。**

##### A-8.1 允许的早期状态
在初始结论评估阶段，不确定结论允许进入：
- 候选中
- 暂时领先

##### A-8.2 不应过早进入的状态
除非满足明确条件，否则不确定结论不应直接进入：
- 待确认
- 可输出
- 已锁定

##### A-8.3 允许进入“待确认 / 可输出 / 已锁定”的合法条件
至少满足以下之一：

1. 输入不足明确且当前无法补齐
2. 高等级证据冲突当前轮次无法解除
3. question_queue 已证明继续提问收益过低
4. 用户中断导致关键验证无法继续

补充说明：

- “不确定”不是默认终点
- 它必须经过延迟锁定判断

---

#### A-9. 提问决策阶段增补

##### A-9.1 进入条件
- 至少一个 active outcome 尚未达到稳定可输出
- 且至少存在一个高价值待确认分歧

##### A-9.2 完成条件
- 已生成当前轮次的 `question_queue`
- 或已确认“本轮无高价值问题可问”

##### A-9.3 失败出口 / 旁路出口
- 若无题可问，则直接进入停止判定阶段
- 若有题可问但用户无法作答 / 当前不值得问，也进入停止判定阶段

---

#### A-10. 回答回流与重算阶段增补

##### A-10.1 进入条件
- 当前轮次存在已回答问题
- 回答已可转化为标准化 evidence 或 evidence state 修正

##### A-10.2 完成条件
按以下顺序完成局部重算：

1. observed_evidence_set 更新
2. hypothesis_pool 更新
3. outcome_pool 更新
4. question_queue 重排
5. stop_state 重判

##### A-10.3 失败出口
- 若回答无效、冲突严重或无法解析，则应：
  - 写入 trace
  - 并回到提问决策阶段或停止判定阶段
- 不允许直接把“回答无效”当成某个 problem / outcome 的加分项

---

#### A-11. 停止判定阶段增补

##### A-11.1 进入条件
满足以下任一情况即可进入停止判定：

- 当前已有至少一个 outcome 进入可稳定输出边界
- 当前 question_queue 已无高价值问题可问
- 用户中断
- 系统资源保护上限触发（不得等同硬性 2 轮）

##### A-11.2 完成条件
必须同时完成两件事：

1. **停止合法性判定**
2. **输出资格判定**

##### A-11.3 失败出口
- 若停止合法性不成立，则必须回到：
  - 提问决策阶段
  - 或回答回流与重算阶段
- 不允许只因为当前“看起来差不多”就进入 final output

---

#### A-12. 新增显式概念：输出资格判定

为避免“停止”和“输出”继续混在一起，新增显式概念：

### **输出资格判定（output eligibility judgment）**

其作用是判断：

- 当前主导结论是否允许对外表达
- 应以何种保守度表达
- 是否需要附带观察 / 补图 / 条件性复查提示

补充说明：

- 停止合法 ≠ 具备高确定性明确输出资格
- 不确定结论也可以具备合法输出资格
- 非问题性结论也可以只具备“保守输出资格”

---

#### A-13. 最终输出阶段增补

##### A-13.1 进入条件
- 停止合法性判定已成立
- 输出资格判定已完成

##### A-13.2 最小输出结构模板
无论哪类结论，最终输出至少应能生成：

- `主导结论`
- `结论类型`
- `结论状态`
- `输出保守度`
- `关键依据摘要`
- `关键风险 / 未决点`
- `下一步建议`

##### A-13.3 复合场景承接补充
复合场景不改变主流程顺序，但会影响最终输出结构。  
当前可采用：

- 主导结论
- 背景说明
- 风险备注

三段式承接。

---

#### A-14. 阶段回跳规则

新增标准回跳规则如下：

##### A-14.1 补图回跳
当系统因输入不足进入不确定路径后，若用户补图，则流程应回跳到：

### **输入归一化阶段**

而不是只在现有 evidence set 上硬补一条图像证据。

##### A-14.2 追问回答回跳
当用户回答标准化诊断提问后，流程应回跳到：

### **已观察证据集更新 → hypothesis 更新 → outcome 更新**

而不是直接改 final output。

---

#### A-15. 无提问直出条件

新增合法“无提问直出”清单。  
以下场景允许不再进入提问决策，而直接走停止判定与最终输出：

##### A-15.1 输入不足直出不确定
例如：
- 图片严重模糊
- 主体缺失
- 当前无法生成足够可用证据

##### A-15.2 高稳定非问题性直出
例如：
- 稳定正常特征证据非常强
- 问题性方向缺乏关键支持
- 当前无高价值分歧需要再问

##### A-15.3 高确定性问题性直出
例如：
- 问题性方向优势显著
- 关键反证缺失
- 当前继续提问收益极低

补充说明：

- “无提问直出”是合法能力，不是偷懒能力
- 必须仍经过 stop_state 与 output eligibility judgment

---

#### A-16. 用词统一补充

新增统一用词建议：

- **初始**：专指会话开始后的第一批状态
- **当前轮次**：专指当前 round 内状态
- **首轮**：不再推荐作为核心主名继续扩散

因此，后续文档更推荐使用：

- 初始证据
- 初始解释对象
- 初始结论评估
- 当前轮次提问
- 当前轮次重算

而少用“首轮结论收敛”这类容易误导的说法

---

### 本版状态说明

- 本版保留 v1 正文主体
- 仅通过“附录 A”增补状态机边界
- 未对原有适用条款做删减


### 决策流 v1.3（身份主链路拆分联动版，基于 v1.2 只增不减）

> 说明：
>
> - 本文档基于《决策流 v1.2（AI视觉入口层联动增补版）》继续增补。
> - 本次增补目标：
>   - 在视觉解析阶段内部正式拆分：
>     - 身份主链路解析
>     - 症状主链路解析

---

### 附录 C：身份主链路拆分联动增补（本次新增，不替换原文）

#### C-1. 视觉解析阶段内部应拆成两个并行子阶段

正式建议将“视觉解析阶段”再拆成：

##### C-1.1 植物身份解析子阶段
链路：
- 百度植物识别
- taxonomy 匹配
- 命中直取 plant identity

##### C-1.2 症状解析子阶段
链路：
- 混元
- 图像质量评估
- topK 症状
- pattern candidate
- route hint

---

#### C-2. 植物身份解析子阶段的完成条件

- 已得到原始识别名
- 已完成 taxonomy 命中判定
- 已写入 plant_identity_resolution_record
- 已决定：
  - matched
  - weak_matched
  - unresolved

---

#### C-3. 症状解析子阶段的完成条件

- 已得到 visual_raw_record
- 已得到 visual_normalized_result
- 已完成 visual_admission_record
- 已决定症状链是否可进入正式 evidence / route hint 流程

---

#### C-4. 两条链的先后关系

当前推荐：

- 二者可以并行触发
- 但在输入归一化阶段汇合

也就是说：
- 不要求身份链先于症状链完成
- 也不要求症状链先于身份链完成
- 但 normalized_input 必须吸收二者的正式受控结果

---

#### C-5. 补图回跳时的处理

用户补图后：

- 症状解析子阶段必须重新执行
- 植物身份解析子阶段是否重跑，可按实现策略决定

##### 推荐原则
若补图显著提升主体完整性或更接近全株，则身份链也可重新执行；
否则至少应保证症状链重跑。




### ================================
### v1.4 新增附录开始（基于现有有效内容只增不减）
### ================================

### 附录：属级养护基线在决策流中的位置增补（本次新增，不替换上文）

#### 1. 属级养护基线不前置进入诊断主决策流

新增正式边界：

### **属级养护基线不作为诊断主决策流的最前置输入竞争对象。**

它不应替代：
- 视觉解析阶段
- 输入归一阶段
- symptom / evidence 组织阶段

---

#### 2. 它在决策流中的更合适位置

它更适合在以下阶段被消费：

- explanation 组织阶段
- 行动建议生成阶段
- 环境偏离判断阶段
- 诊断后建议阶段

---

#### 3. 它影响什么，不影响什么

##### 允许影响
- 后续行动建议方向
- 用户环境偏离说明
- 养护背景解释

##### 不允许影响
- route hint 真值
- symptom 真值
- identity 真值
- outcome 主竞争排序




### ================================
### v1.5 新增附录开始（基于现有有效内容只增不减）
### ================================

### 附录：收益驱动停止策略在决策流中的位置增补（本次新增，不替换上文）

#### 1. 停止判定前必须先做收益判定

新增流程硬规则：

### **提问决策阶段不能只看 question_queue 是否还有题，必须先判断下一题是否仍有高价值收益。**

决策顺序固定为：

1. 回答回流或视觉证据更新
2. evidence / hypothesis / outcome 重算
3. 必答 gate 层计算
4. output eligibility 判定
5. 下一题高价值收益判定
6. stop_state 判定
7. final output 或继续一页一题

#### 2. 必答 gate 未完成时才允许阻塞 final

若 `gate_required_layer` 存在未完成项，流程可以继续追问。

若不存在未完成必答 gate，且当前 top outcome 已满足输出资格，则系统必须证明下一题属于高价值题，否则不得继续 follow-up。

#### 3. 高价值题进入下一页一题的条件

下一题必须至少命中以下一项，才允许进入下一页：

- 补齐 context guard
- 改变 output eligibility
- 区分 top 与 runner-up
- 触发合法 uncertain

仅用于解释补充、严重程度、护理建议、观察建议的问题，不得进入下一页阻塞 final。

#### 4. 低价值题的流程出口

以下问题在结论门槛满足后必须从当前提问流失效：

- `progression`
- `distribution_scope`
- `host_confirmation`
- `underside_presence`
- 无 `directProblemAdjustments` 的问题
- 只影响解释 / 严重程度 / 护理建议的问题

它们可以进入：

- final 后观察提示
- care suggestion 条件说明
- diagnostic_trace 的未问低价值候选

它们不得继续占用 `question_queue` 的下一页。

#### 5. 不按轮数硬截断，但必须总收益停止

流程不得恢复“最多 2 轮”作为常规截断条件。

但当以下条件同时满足时，必须停止：

1. 当前结论已满足输出资格，或已满足合法 uncertain 条件。
2. 必答 gate 层无未完成项。
3. 下一题没有高价值收益。

#### 6. edema / overwatering 流程裁决

当 edema / overwatering 已有正式形态正证据，并已满足输出资格时：

- 不得因为光照变化泛问继续 follow-up
- 不得因为分布范围泛问继续 follow-up
- 不得因为叶背存在性泛问继续 follow-up
- 不得因为宿主确认泛问继续 follow-up
- 不得因为无 `directProblemAdjustments` 的背景题继续 follow-up

只有能补齐过湿相关 context guard、改变输出资格、区分 runner-up，或触发合法 uncertain 的问题，才允许继续进入下一页一题。



## [S13] 统一术语表 v1.4（完整最终版）

- 文件名：`统一术语表_v1_4_完整最终版_标题版本已统一.md`
- 状态：A类正式基线
- 类别：术语/受控词
- 用途：受控词汇基线；中文主名优先，英文作为辅助键名
- SHA-256 前 16 位：`b98c73bc5980caba`

---

### 统一术语表 v1.4（完整最终版）

> 说明：
>
> - 本文件为完整最终文件，不是纯补丁。
> - 本文件完整保留当前可确认有效的前版正文与联动增补内容，并在其后追加新的联动附录。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **中文主名优先**
> # **只增不减**

---

### 统一术语表 v1

> 目标：
>
> - 为当前诊断系统文档集建立统一术语基线
> - 解决“同一概念多种叫法”“不同层级概念混用”“中文主名虽有但定义不够硬”的问题
> - 为后续《决策流 v1》以及未来统一快照版文档提供稳定词汇锚点
>
> 适用范围：
>
> - 《诊断系统硬约束清单》
> - 《诊断结论层》
> - 《诊断目标分层》
> - 《核心数据结构》
> - 《运行时模型》
> - 后续《决策流》《准入与退役规则》《最小可用知识库》《诊断轨迹》等文档
>
> 强制原则：
>
> # **中文是一等公民，英文仅为辅助标记。**
>
> 默认表达顺序统一为：
>
> # **中文主名（英文辅助名）**

---

### 0. 使用规则

#### 0.1 本文档的地位

本文档不是普通参考说明，而是：

### **受控词汇总表（controlled vocabulary baseline）**

后续文档若出现以下情况，应以本术语表为准：

- 同一概念出现多个中文名
- 同一概念英文辅助名漂移
- 不同层级对象被误用同一中文名
- 某个旧写法与本表冲突

---

#### 0.2 术语冲突时的处理规则

当某个术语在旧文档中存在多个写法时，处理优先级如下：

1. **本术语表中的中文主名**
2. 本术语表中的英文辅助名
3. 旧文档中的历史写法

也就是说：

- 后续新文档必须采用本表主名
- 旧文档中的其他叫法可视为“历史兼容叫法”
- 不允许继续新增新的同义词写法

---

#### 0.3 本文档不做什么

本文档不负责：

- 完整业务规则说明
- 完整 schema 定义
- 完整运行时流程说明

它只负责：

- 术语定义
- 层级归属
- 允许含义
- 禁止混用
- 推荐替代写法

---

### 1. 顶层术语

#### 1.1 诊断系统（diagnosis system）

##### 中文主名
诊断系统

##### 英文辅助名
diagnosis system

##### 定义
整个植物问题判断体系的总称。  
它不是单一模型、单一规则表、单一问答器，而是由：

- 静态知识层
- 运行时状态层
- 结论输出层
- 动作建议层

共同组成的系统。

##### 所属层级
系统总层级

##### 禁止混用
不要把“诊断系统”简化成：

- symptom 系统
- 规则打分系统
- AI 识别流

---

#### 1.2 诊断结论层（outcome layer）

##### 中文主名
诊断结论层

##### 英文辅助名
outcome layer

##### 定义
系统最终可输出的完整结果空间。  
它负责承载：

- 问题性结论
- 非问题性结论
- 不确定结论

##### 所属层级
最终输出层

##### 禁止混用
不要把“诊断结论层”与以下概念混用：

- 诊断问题层
- 诊断假设层
- 证据层

##### 备注
诊断结论层不是 problem taxonomy 的别名。  
它比 problem taxonomy 更高一层。

---

#### 1.3 诊断问题层（problem layer）

##### 中文主名
诊断问题层

##### 英文辅助名
problem layer

##### 定义
问题性诊断对象所在的层。  
它只覆盖：

- 病
- 虫
- 胁迫
- 营养失衡
- 损伤机制问题

##### 所属层级
问题性解释层 / 问题性对象层

##### 禁止混用
不要把诊断问题层误当成：

- 整个 outcome layer
- 正常特征层
- 信息不足层

---

### 2. 结论相关术语

#### 2.1 诊断结论（outcome）

##### 中文主名
诊断结论

##### 英文辅助名
outcome

##### 定义
系统最终对外输出的结果对象。  
它必须属于以下三类之一：

- 问题性结论
- 非问题性结论
- 不确定结论

##### 所属层级
outcome layer

##### 禁止混用
不要把“诊断结论”与以下概念混用：

- 诊断问题
- 证据
- 诊断假设
- 动作建议

---

#### 2.2 问题性结论（problematic outcome）

##### 中文主名
问题性结论

##### 英文辅助名
problematic outcome

##### 定义
当前更像真实问题，需要进入诊断、分流、处理或观察策略的结论类型。

##### 典型例子
- 真菌性叶斑类问题
- 细菌性叶斑类问题
- 刺吸式虫害问题
- 过浇胁迫问题

##### 所属层级
outcome layer

##### 禁止混用
不要把“问题性结论”缩写成“problem”，二者不是完全同义：

- problem 更偏对象
- problematic outcome 更偏最终结果类型

---

#### 2.3 非问题性结论（non-problematic outcome）

##### 中文主名
非问题性结论

##### 英文辅助名
non-problematic outcome

##### 定义
当前更像正常特征、正常阶段现象、非病理性痕迹、或当前可接受状态的结论类型。  
它表示：

### **当前不构成问题性诊断结论**

但不自动等于：

### **永远完全无需观察**

##### 所属层级
outcome layer

##### 禁止混用
不要把非问题性结论混同为：

- 正常证据
- 正常判断依据
- “绝对没问题”

##### 正确理解
它是结果对象，不是单条依据。

---

#### 2.4 不确定结论（uncertain outcome）

##### 中文主名
不确定结论

##### 英文辅助名
uncertain outcome

##### 定义
当前不能安全判为问题性结论，也不能安全判为非问题性结论的结果类型。

##### 所属层级
outcome layer

##### 合法触发条件
至少包括：

- 输入不足
- 证据冲突
- 继续提问收益过低

##### 禁止混用
不要把不确定结论混成：

- 偷懒出口
- 默认安全垫
- 系统失败

---

#### 2.5 非问题性结论对象（non-problematic outcome object）

##### 中文主名
非问题性结论对象

##### 英文辅助名
non-problematic outcome object

##### 定义
进入 outcome layer 的、可稳定对外表达的非问题性结果对象。  
它必须：

- 有独立用户认知价值
- 能稳定复用
- 能承接动作策略
- 不是单纯判断依据

##### 典型例子
- 稳定斑锦 / 锦化特征
- 品种固有花纹
- 老叶自然退化
- 非病理性旧机械伤

##### 禁止混用
不要和以下概念混用：

- 正常判断依据
- 正常证据
- 正常特征片段

---

#### 2.6 正常判断依据（normality support rationale）

##### 中文主名
正常判断依据

##### 英文辅助名
normality support rationale

##### 定义
用于支持“更像非问题性结论”的判断依据。  
它通常是：

- 证据
- 或证据组合
- 或观察事实

但它本身未必有资格升格成 outcome 对象。

##### 典型例子
- 边界清晰
- 无扩展性
- 长期存在
- 单片叶受影响

##### 所属层级
证据层 / 解释依据层

##### 禁止混用
不要把它当成：

- 非问题性结论对象
- 诊断问题对象

---

#### 2.7 输出保守度（output conservativeness）

##### 中文主名
输出保守度

##### 英文辅助名
output conservativeness

##### 定义
当前结论对外表达时的保守程度。  
它反映的不是“像不像”，而是：

- 当前是否适合直接明确表达
- 是否更适合保守表达
- 是否更适合仅观察型表达
- 是否需要更多信息后再输出

##### 建议枚举
- 明确输出
- 保守输出
- 仅观察型输出
- 需补充信息后再输出

##### 所属层级
outcome / action policy 联动字段

##### 禁止混用
不要把它等同于：

- 结论类型
- 置信度
- 停止状态

---

#### 2.8 结论子类型（outcome subtype）

##### 中文主名
结论子类型

##### 英文辅助名
outcome subtype

##### 定义
对结论类型的进一步细分，用于提升运行时和动作策略的可承接性。

##### 建议示例

###### 对非问题性结论
- 稳定正常
- 暂时可接受

###### 对不确定结论
- 输入不足
- 证据冲突
- 继续提问收益过低

##### 所属层级
outcome layer

##### 禁止混用
不要把“结论子类型”和“结论类型”混为一谈。

---

#### 2.9 主导结论（dominant outcome）

##### 中文主名
主导结论

##### 英文辅助名
dominant outcome

##### 定义
在一次会话中，当前最适合作为主输出的结论。

##### 所属层级
runtime / output

##### 备注
承认存在主导结论，不代表否认复合场景存在。

---

#### 2.10 复合场景（composite scenario）

##### 中文主名
复合场景

##### 英文辅助名
composite scenario

##### 定义
同一次会话中，背景存在非问题性特征，同时局部又出现问题性变化的场景。

##### 典型例子
- 原本有稳定斑锦，但局部新出现病斑
- 原本有旧机械伤，但局部继发感染

##### 所属层级
cross-layer 边界场景

##### 禁止混用
不要把复合场景粗暴理解成：

- 必须只能输出一个纯问题性结论
- 或必须只能输出一个纯非问题性结论

---

### 3. 问题层相关术语

#### 3.1 诊断问题（problem）

##### 中文主名
诊断问题

##### 英文辅助名
problem

##### 定义
可被证据支持、削弱、排除，能够与其他候选对象竞争，并能承接后续诊断提问与动作策略的可行动问题性对象。

##### 所属层级
problem taxonomy / 问题性对象层

##### 禁止混用
不要把 problem 当成：

- symptom
- pattern
- outcome
- action

---

#### 3.2 问题簇（problem cluster）

##### 中文主名
问题簇

##### 英文辅助名
problem cluster

##### 定义
比诊断问题更高一层的大类分组。  
用于组织知识库，而不是直接作为最终输出结论。

##### 所属层级
problem taxonomy

##### 禁止混用
不要把问题簇当成：

- 最终诊断结果
- 互斥单选层
- outcome 类型

---

#### 3.3 问题变体（problem variant）

##### 中文主名
问题变体

##### 英文辅助名
problem variant

##### 定义
诊断问题之下更细粒度的子型，用于研究预留和未来升级候选。

##### 所属层级
problem taxonomy

##### 禁止混用
不要把问题变体当成：

- 当前主竞争层
- 当前首发直接输出对象
- 非问题性结论对象

---

#### 3.4 问题性诊断对象（problematic diagnostic object）

##### 中文主名
问题性诊断对象

##### 英文辅助名
problematic diagnostic object

##### 定义
属于 problem taxonomy、可进入问题性竞争池的对象。

##### 所属层级
problem layer

##### 备注
problematic outcome 是结果类型；  
problematic diagnostic object 更偏对象本体。

---

### 4. 证据层相关术语

#### 4.1 证据（evidence）

##### 中文主名
证据

##### 英文辅助名
evidence

##### 定义
所有可被诊断引擎消费的信息单位。  
是系统推理的基本输入。

##### 所属层级
evidence layer

##### 禁止混用
不要把证据混成：

- 诊断问题
- 诊断结论
- 行动策略

---

#### 4.2 症状（symptom）

##### 中文主名
症状

##### 英文辅助名
symptom

##### 定义
视觉或用户可感知表现中的一类证据子类。  
它只是 evidence 的子类之一。

##### 所属层级
evidence layer

##### 禁止混用
不要把 symptom 当成：

- problem
- outcome
- pattern 的完整替代

---

#### 4.3 模式证据（pattern）

##### 中文主名
模式证据

##### 英文辅助名
pattern

##### 定义
由多个原始证据组合而成的中层证据。  
它属于派生证据，而不是一级诊断目标。

##### 所属层级
evidence layer / derived evidence

##### 禁止混用
不要把 pattern 当成：

- 诊断问题
- 非问题性结论对象

---

#### 4.4 派生证据（derived evidence）

##### 中文主名
派生证据

##### 英文辅助名
derived evidence

##### 定义
由原始证据通过规则生成的证据对象。

##### 所属层级
evidence layer

##### 备注
pattern 是 derived evidence 的一种，不是另一个平行顶层。

---

#### 4.5 证据状态（evidence state）

##### 中文主名
证据状态

##### 英文辅助名
evidence state

##### 定义
某条证据在当前会话中的存在状态。

##### 标准三态
- 已存在
- 已确认不存在
- 未知

##### 禁止混用
不要退回 true / false 二元表达。

---

#### 4.6 证据冲突（evidence conflict）

##### 中文主名
证据冲突

##### 英文辅助名
evidence conflict

##### 定义
当前会话中，不同证据之间对解释方向产生显著冲突的状态。

##### 所属层级
runtime evidence state

##### 备注
证据冲突是：
- 不确定结论的重要触发条件之一
- 不是 outcome 本身

---

### 5. 假设层与运行时相关术语

#### 5.1 诊断假设（hypothesis）

##### 中文主名
诊断假设

##### 英文辅助名
hypothesis

##### 定义
当前仍在竞争的候选解释方向。

##### 所属层级
runtime process layer

##### 禁止混用
不要把 hypothesis 直接当成：

- outcome
- final answer

---

#### 5.2 诊断假设池（hypothesis pool）

##### 中文主名
诊断假设池

##### 英文辅助名
hypothesis pool

##### 定义
运行时中维护候选解释对象竞争的状态池。

##### 推荐职责
优先承载：

- 问题性诊断对象
- 非问题性解释对象

##### 当前统一裁决
### **不确定结论不应再作为常规 hypothesis item 使用。**

它更应属于：

- outcome 收敛类型
- 停止依据
- 运行时状态结果

##### 禁止混用
不要继续把“不确定保留候选”当成常规 hypothesis 主名使用。

---

#### 5.3 结论候选池（outcome pool）

##### 中文主名
结论候选池

##### 英文辅助名
outcome pool

##### 定义
运行时中维护最终结论类型与具体结论对象收敛情况的状态池。

##### 所属层级
runtime output convergence layer

##### 禁止混用
不要把 outcome pool 降格成：

- hypothesis 排序镜像
- problem top1 列表

---

#### 5.4 结论状态（outcome status）

##### 中文主名
结论状态

##### 英文辅助名
outcome status

##### 定义
某个 outcome item 在运行时的状态机位置。

##### 建议枚举
- 候选中
- 暂时领先
- 待确认
- 可输出
- 已锁定
- 已淘汰

##### 所属层级
runtime outcome state machine

##### 禁止混用
不要和以下概念混用：

- 结论类型
- 输出保守度
- 停止状态

---

#### 5.5 会话停止状态（stop state）

##### 中文主名
会话停止状态

##### 英文辅助名
stop state

##### 定义
当前诊断会话为什么可以在这里停下的运行时状态对象。

##### 所属层级
runtime control layer

##### 备注
stop state 必须受 outcome 收敛驱动，不是自由状态。

---

#### 5.6 轮次（round）

##### 中文主名
轮次

##### 英文辅助名
round

##### 定义
多轮提问、多轮证据回流、多轮结论更新中的阶段性回合单位。

##### 所属层级
runtime progression layer

##### 禁止混用
不要和：
- 阶段
- 会话
混为一谈。

---

### 6. 提问与动作相关术语

#### 6.1 诊断提问（diagnostic question）

##### 中文主名
诊断提问

##### 英文辅助名
diagnostic question

##### 定义
系统为了采集新证据、区分候选解释方向而向用户发出的标准化问题。

##### 所属层级
knowledge + runtime interaction

##### 禁止混用
不要把诊断提问当成：

- 证据
- 结论
- 固定问卷项

---

#### 6.2 诊断提问队列（question queue）

##### 中文主名
诊断提问队列

##### 英文辅助名
question queue

##### 定义
运行时中当前待问问题的动态排序队列。

##### 所属层级
runtime interaction layer

##### 禁止混用
不要把它当成：

- 固定问卷
- 当前问题单值

---

#### 6.3 重复确认阻断（duplicate confirmation blocking）

##### 中文主名
重复确认阻断

##### 英文辅助名
duplicate confirmation blocking

##### 定义
对已被高置信证据或高可信回答覆盖的事实，阻止系统继续重复提问的运行时约束。

##### 所属层级
runtime question governance

---

#### 6.4 行动策略（action policy）

##### 中文主名
行动策略

##### 英文辅助名
action policy

##### 定义
根据当前结论类型、结论状态、输出保守度与确定性，决定系统应给出什么动作建议。

##### 所属层级
output action layer

##### 禁止混用
不要把 action policy 当成：

- problem 定义的一部分
- outcome 本身

---

### 7. 质量与约束相关术语

#### 7.1 输入归一化（input normalization）

##### 中文主名
输入归一化

##### 英文辅助名
input normalization

##### 定义
将用户原始输入整理为系统可统一消费表示的过程。

##### 所属层级
runtime input layer

---

#### 7.2 输入质量等级（input quality level）

##### 中文主名
输入质量等级

##### 英文辅助名
input quality level

##### 定义
用户当前输入是否足以支撑可靠初始分析的质量判定。

##### 建议枚举
- 可分析
- 勉强可分析
- 不足以分析

##### 所属层级
runtime input assessment

---

#### 7.3 继续提问收益过低（insufficient marginal questioning gain）

##### 中文主名
继续提问收益过低

##### 英文辅助名
insufficient marginal questioning gain

##### 定义
继续发问已难以显著提升结论质量的状态。  
它是“不确定结论”的合法触发条件之一。

##### 所属层级
runtime stop rationale

##### 禁止混用
不要把它直接写成：
- 不确定结论本身
- 某条证据本身

---

#### 7.3A 必答 gate 层（gate required layer）

##### 中文主名
必答 gate 层

##### 英文辅助名
gate required layer

##### 定义
当前会话中唯一可以阻塞 final 的必答问题或守卫集合。

##### 合法来源
- 模式入口 gate
- 输出资格 gate
- top 与 runner-up 区分 gate
- 合法 uncertain gate
- 安全 / 动作边界 gate

##### 禁止混用
不要把普通背景题、解释题、严重程度题、护理建议题写成必答 gate。

---

#### 7.3B 下一题高价值收益（high-value next-question gain）

##### 中文主名
下一题高价值收益

##### 英文辅助名
high-value next-question gain

##### 定义
下一题能显著改变诊断收敛状态的边际收益。

##### 最小成立条件
至少能做到以下之一：
- 补齐 context guard
- 改变 output eligibility
- 区分 top 与 runner-up
- 触发合法 uncertain

##### 所属层级
runtime questioning policy

---

#### 7.3C 低价值非阻断题（low-value non-blocking question）

##### 中文主名
低价值非阻断题

##### 英文辅助名
low-value non-blocking question

##### 定义
不能显著改变诊断收敛状态、不得阻塞 final 的问题。

##### 典型类型
- `progression`
- `distribution_scope`
- `host_confirmation`
- `underside_presence`
- 无 `directProblemAdjustments` 且没有显式 gate / eligibility / uncertain 影响的问题
- 只影响解释、严重程度、护理建议、观察提示的问题

##### 禁止混用
低价值非阻断题可以成为 final 后提示或 trace 项，不能成为继续 follow-up 的理由。

---

#### 7.4 宿主适用范围（host applicability scope）

##### 中文主名
宿主适用范围

##### 英文辅助名
host applicability scope

##### 定义
某个结论对象是否适用于所有植物，还是仅适用于特定宿主范围。

##### 建议枚举
- 通用
- 宿主受限

##### 所属层级
outcome / schema governance

---

### 8. 建议废弃或限制使用的漂移叫法

以下写法建议从后续新文档中停止使用或严格限制使用：

#### 8.1 “不确定保留候选”
##### 处理建议
停止作为常规正式主名使用。  
改用：

- 不确定结论
- 不确定触发条件
- 不确定收敛依据

---

#### 8.2 “正常对象”
##### 处理建议
这个说法太粗，建议改成更精确的：

- 非问题性结论对象
- 正常判断依据
- 稳定正常类结论
- 暂时可接受类结论

---

#### 8.3 “正常特征”
##### 处理建议
可以保留，但只能作描述语，不应默认等于正式对象名。  
正式语境下应区分：

- 正常判断依据
- 非问题性结论对象
- 稳定正常类结论

---

#### 8.4 “不是问题”
##### 处理建议
这是用户表达，不是系统正式术语。  
正式文档中建议替换为：

- 非问题性结论
- 当前不构成问题性诊断结论

---

### 9. 当前统一裁决清单

为了让后续文档不再漂，当前先给出若干“统一裁决”。

#### 9.1 outcome 不等于 problem
必须固定。

#### 9.2 non-problematic outcome 不等于 证据
必须固定。

#### 9.3 uncertain outcome 不等于 默认兜底
必须固定。

#### 9.4 hypothesis 是过程层，outcome 是输出层
必须固定。

#### 9.5 非问题性结论不等于永远完全无需观察
必须固定。

#### 9.6 结论对象必须有独立对外表达价值
必须固定。

---

### 10. 建议下一步联动

本术语表落地后，后续文档应优先检查以下内容是否统一：

- 《运行时模型》里“不确定保留候选”的旧说法
- 《核心数据结构》里 outcome 增强字段是否正式化
- 《硬约束清单》里 outcome 准入与触发条件是否用本表主名重写
- 《决策流 v1》所有新术语是否强制引用本表

---

### 11. 最终裁决

这份《统一术语表 v1》的作用不是增加新理论，而是：

> **把当前已经形成的诊断架构语言钉死，防止后续文档继续在关键概念上漂移。**

如果后续文档和本表冲突，默认以本表为准。

---

### 12. 附：建议最优先冻结的术语

若你想最先检查后续文档是否违规，先盯这 12 个词：

1. 诊断结论
2. 问题性结论
3. 非问题性结论
4. 不确定结论
5. 非问题性结论对象
6. 正常判断依据
7. 诊断问题
8. 诊断假设
9. 诊断假设池
10. 结论候选池
11. 输出保守度
12. 结论子类型


### 统一术语表 v1.3（身份主链路拆分联动版，基于 v1.2 只增不减）

> 说明：
>
> - 本文档基于《统一术语表 v1.2（AI视觉入口层联动增补版）》继续增补。
> - 本次增补目标：
>   - 正式纳入 taxonomy 与身份主链路的关键术语

---

### 附录 B：taxonomy 与身份主链路术语增补（本次新增，不替换原文）

#### B-1. 植物身份对象（plant identity entity）

##### 中文主名
植物身份对象

##### 英文辅助名
plant identity entity

##### 定义
系统内部对一个植物身份单位的正式归一对象。  
它是 taxonomy 主数据源中的最小正式单位。

---

#### B-2. canonical identity（主身份主名）

##### 中文主名
主身份主名

##### 英文辅助名
canonical identity

##### 定义
系统内部对植物身份对象采用的唯一主名。  
外部识别名、俗名、别名都应尽量归一到它。

---

#### B-3. 植物身份主链路（plant identity primary chain）

##### 中文主名
植物身份主链路

##### 英文辅助名
plant identity primary chain

##### 定义
当前正式的植物身份链路：

- 百度植物识别输出
- taxonomy 匹配
- 命中直取 plant identity entity

---

#### B-4. taxonomy 命中直取（taxonomy matched fetch）

##### 中文主名
taxonomy 命中直取

##### 英文辅助名
taxonomy matched fetch

##### 定义
外部识别名命中 taxonomy 后，系统直接取出正式 plant identity entity 及其基础结构信息的过程。

---

#### B-5. 身份主结果（primary identity result）

##### 中文主名
身份主结果

##### 英文辅助名
primary identity result

##### 定义
当前会话中，经身份主链路解析后得到的正式植物身份结果。

---

#### B-6. 身份未命中（identity unresolved）

##### 中文主名
身份未命中

##### 英文辅助名
identity unresolved

##### 定义
百度识别返回名未命中 taxonomy，当前会话尚未获得正式 plant identity entity 的状态。

---

#### B-7. 症状识别主链路（symptom recognition primary chain）

##### 中文主名
症状识别主链路

##### 英文辅助名
symptom recognition primary chain

##### 定义
当前由混元承担主职责的视觉症状识别链路，包括：
- 图像质量
- topK 症状
- pattern candidate
- route hint




### ================================
### v1.4 新增附录开始（基于现有有效内容只增不减）
### ================================

### 附录：属级养护基线相关术语增补（本次新增，不替换上文）

#### 1. 属级养护基线（genus care baseline）

##### 中文主名
属级养护基线

##### 英文辅助名
genus care baseline

##### 定义
某个属级对象在常规养护上的基线偏好与长期稳定环境要求。

---

#### 2. 属级养护基线表（genus_care_profiles）

##### 中文主名
属级养护基线表

##### 英文辅助名
genus_care_profiles

##### 定义
Taxonomy 侧承载 genus level 养护默认值的正式主表。

---

#### 3. 养护建议规则输入层

##### 中文主名
养护建议规则输入层

##### 定义
介于主数据基线与最终行动建议之间的规则输入层。  
它消费：
- genus care baseline
- 用户环境
- 当前问题路径
- 当前阶段 / 季节
并生成可执行的建议输入。

---

#### 4. species care overrides

##### 中文主名
种级养护覆盖

##### 英文辅助名
species care overrides

##### 定义
当 species 层存在足够稳定且显著的养护差异时，对 genus baseline 的种级覆盖。

---

#### 5. plant identity care overrides

##### 中文主名
植物身份级养护覆盖

##### 英文辅助名
plant identity care overrides

##### 定义
当某个 plant identity 在产品层面具备足够独立价值时，对 genus baseline 的 identity 级覆盖。

---

#### 6. horticultural variant overrides

##### 中文主名
园艺变体养护覆盖

##### 英文辅助名
horticultural variant overrides

##### 定义
当园艺变体具备长期稳定且显著的养护差异时，对 genus baseline 的变体级覆盖。



## [S14] 最小可用知识库 v1.3（完整最终版）

- 文件名：`最小可用知识库_v1_3_完整最终版_标题版本已统一.md`
- 状态：A类正式基线
- 类别：知识库/MVP
- 用途：第一版知识库闭环边界；不追求全覆盖，追求高价值闭环
- SHA-256 前 16 位：`db32bf4b539fd646`

---

### 最小可用知识库 v1.3（完整最终版）

> 说明：
>
> - 本文件为完整最终文件，不是纯补丁。
> - 本文件完整保留当前可确认有效的前版正文与联动增补内容，并在其后追加新的联动附录。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **只增不减**

---

### 最小可用知识库 v1

> 说明：
>
> - 本文档基于当前最新文档体系继续向下推进：
>   - 《诊断系统硬约束清单 v2.3（联动增补版，基于 v2.2 只增不减）》
>   - 《诊断结论层 v1.1（review 增补修正版，基于 v1 只增不减）》
>   - 《诊断目标分层 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《核心数据结构 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《运行时模型 v1.2（联动增补版，基于 v1.1 只增不减）》
>   - 《统一术语表 v1.1（review 修正版）》
>   - 《决策流 v1.1（review 增补修正版，基于 v1 只增不减）》
>   - 《准入与退役规则 v1》
> - 本文档目标不是列出“完整知识库”，而是定义：
>
> # **第一批真正值得做、能形成闭环、能上线验证、维护成本仍可控的知识库范围。**
>
> - 本文档不是“全量梦想版”，而是：
>
> # **最小闭环版**
>
> - 这意味着它必须同时兼顾：
>   - 诊断能力
>   - 非问题性结论能力
>   - 不确定结论能力
>   - 提问能力
>   - 动作承接能力

---

### 0. 文档定位

到当前阶段，架构层已经基本成型。  
真正的问题不再是“还能不能继续抽象”，而是：

> **第一批到底做哪些对象，才能形成一个小而强、真正可跑通的知识闭环？**

如果第一批范围选错，后面会出现两种坏结果：

#### 坏结果 A：范围过大
- 数据录不完
- review 不完
- 规则写不完
- 一人维护直接崩

#### 坏结果 B：范围过小但结构残缺
- 只能判断 problem
- 不能判断非问题性结论
- 不能处理不确定
- 不能形成提问闭环
- 不能稳定对外输出

因此《最小可用知识库 v1》的作用就是：

### **在“尽量小”和“必须闭环”之间找到第一版平衡点。**

---

### 1. 设计总原则

#### 1.1 不追求全覆盖，追求首批高价值闭环

v1 的目标不是覆盖所有植物问题，  
而是优先覆盖：

- 高频
- 高视觉显著性
- 高用户困惑度
- 高动作价值
- 高表达价值

---

#### 1.2 必须原生支持三类结论

即使是最小知识库，也必须支持：

- 问题性结论
- 非问题性结论
- 不确定结论

否则它仍然会天然过诊断。

---

#### 1.3 必须同时包含对象层与流程承接层

也就是说，v1 不能只列：

- problem
- evidence

还必须同时有：

- outcome object
- diagnostic question
- action policy

否则只是半套知识库。

---

#### 1.4 优先做“叶片视觉主战场”

第一版知识库建议把重点放在：

### **叶片可见异常 / 叶片可见非异常 / 叶片可见不确定**

原因很现实：

- 图像识别最容易先落到叶片
- 用户上传叶片图最多
- 高频问题与高频误判都集中在叶片
- 对首批小程序体验影响最大

这并不代表茎、根、花永远不做，  
而是第一版必须先收敛战场。

---

### 2. v1 的最小闭环范围

本版建议最少包含以下 6 类对象：

1. **第一批问题簇**
2. **第一批诊断问题**
3. **第一批证据**
4. **第一批非问题性结论对象**
5. **第一批不确定结论对象**
6. **第一批提问与动作策略**

---

### 3. 第一批问题簇（problem cluster）建议范围

v1 建议只做以下 5 个问题簇：

#### 3.1 叶斑类问题簇

原因：
- 高频
- 视觉显著
- 用户最容易困惑
- 最容易和非问题性斑驳特征混淆

---

#### 3.2 刺吸式虫害问题簇

原因：
- 高频
- 与叶片斑点、褪色、卷曲等表现高度相关
- 用户有明显处理需求

---

#### 3.3 浇水胁迫问题簇

原因：
- 高频
- 用户可行动价值极高
- 容易与自然退叶、轻微阶段变化混淆

---

#### 3.4 光照胁迫问题簇

原因：
- 高频
- 与“日灼 / 晒伤 / 浅色变化 / 非病理性损伤”高度相关
- 非问题性与问题性边界都很值得做

---

#### 3.5 表面附着 / 表面生长类问题簇

原因：
- 用户看到表面异常时直觉很强
- 白粉、煤污这类对象有较强对外表达价值
- 易形成相对清晰的动作承接

---

### 4. 第一批诊断问题（problem）建议范围

本版建议 problem 数量控制在：

### **12–18 个之间**

更合理的目标是：

### **先做 14 个左右**

---

#### 4.1 叶斑类问题簇下

建议首批 problem：

1. 真菌性叶斑类问题
2. 细菌性叶斑类问题
3. 损伤后继发坏死斑问题

##### 说明
第一版不要再细拆到：
- 具体病原体
- 更细病斑亚型
否则维护负担会暴涨。

---

#### 4.2 刺吸式虫害问题簇下

建议首批 problem：

4. 刺吸式虫害问题
5. 蜜露相关虫害问题

##### 说明
第一版不必细拆具体虫种，  
优先做“动作上可区分”的层级。

---

#### 4.3 浇水胁迫问题簇下

建议首批 problem：

6. 过浇胁迫问题
7. 缺水胁迫问题
8. 根系胁迫相关浇水问题

---

#### 4.4 光照胁迫问题簇下

建议首批 problem：

9. 日灼损伤问题
10. 光照不足胁迫问题

---

#### 4.5 表面附着 / 表面生长类问题簇下

建议首批 problem：

11. 白粉样问题
12. 煤污样问题
13. 表面真菌样生长问题

---

#### 4.6 预留一个通用弱收口对象

为了避免第一版过度硬判，建议保留少量 problem 弱收口对象，例如：

14. 通用营养失衡问题

##### 说明
第一版不建议同时做：
- 缺氮样
- 缺钾样
- 缺镁样
多个营养 problem 主层对象。  
这会明显增加问题层复杂度。  
第一版更稳的做法是先以“通用营养失衡问题”作为弱收口对象。

---

### 5. 第一批证据（evidence）建议范围

本版建议 evidence 总数控制在：

### **25–40 个之间**

更合理目标：

### **30 个左右**

并分为 4 组：

1. 视觉原子证据
2. 视觉模式证据
3. 用户回答证据
4. 宿主 / 背景证据

---

#### 5.1 第一批视觉原子证据

建议首批优先包括：

1. 坏死斑存在
2. 坏死中心存在
3. 斑点周围黄晕
4. 穿孔存在
5. 斑块边界清晰
6. 斑块边界模糊
7. 表面粉状覆盖
8. 表面煤污样附着
9. 叶片局部发黄
10. 整体褪绿 / 发浅
11. 叶缘焦枯
12. 叶尖焦枯
13. 局部灼伤样漂白 / 发白
14. 卷曲存在
15. 新叶异常变形
16. 银斑 / 失绿小点存在
17. 蜜露 / 黏性痕迹疑似
18. 单片叶局部受影响
19. 多片叶重复出现
20. 新旧叶分布差异明显

---

#### 5.2 第一批模式证据

模式证据数量必须克制。  
建议首批只做 6–8 个。

建议优先：

1. 带黄晕的坏死斑模式
2. 穿孔型叶斑模式
3. 表面粉状覆盖模式
4. 表面煤污附着模式
5. 单侧 / 局部灼伤模式
6. 刺吸式失绿斑驳模式
7. 长期稳定斑驳模式（谨慎，仅当你确认它确实比原子证据更有分流价值）

##### 说明
第 7 个是否纳入，要谨慎。  
因为它容易与“正常判断依据”和“非问题性 outcome”混层。  
若第一版觉得边界还不够稳，可以先不做。

---

#### 5.3 第一批用户回答证据

建议优先：

1. 最近才出现
2. 一直都有
3. 最近明显扩展
4. 长期稳定无变化
5. 只影响老叶
6. 新叶也持续出现
7. 最近暴晒后出现
8. 最近浇水明显偏多
9. 最近明显缺水
10. 擦拭后能去掉 / 不能去掉

---

#### 5.4 第一批宿主 / 背景证据

第一版只做最必要的，不要过多。

建议优先：

1. 室内观叶植物背景
2. 多肉 / 易日灼背景
3. 常见斑锦植物背景
4. 高湿环境背景
5. 近期换环境背景

##### 说明
宿主先验在第一版必须克制，  
否则容易压倒视觉证据。

---

### 6. 第一批非问题性结论对象（non-problematic outcome object）

这是第一版非常关键的一组。  
建议数量控制在：

### **5–8 个之间**

更合理目标：

### **6 个左右**

---

#### 6.1 建议首批对象

1. 稳定斑锦 / 锦化特征
2. 品种固有花纹 / 色带特征
3. 老叶自然退化
4. 正常阶段性浅色新叶
5. 非病理性旧机械伤
6. 暂时可接受的轻微应激状态

---

#### 6.2 为什么是这 6 个

##### A. 它们都是真正的“结果对象”
不是判断依据碎片。

##### B. 它们都能稳定对外表达
可以直接对用户说得清。

##### C. 它们都有动作承接价值
例如：
- 暂不按病害处理
- 观察新叶
- 若扩展再复查

##### D. 它们能明显减少过诊断
这是最重要的价值。

---

#### 6.3 当前不建议首批纳入的“假 outcome”

以下内容默认不纳入首批 outcome object：

- 边界清晰
- 无扩展性
- 单片叶受影响
- 长期存在
- 某个细碎色差

这些属于：

- 正常判断依据
- 证据支持依据

---

### 7. 第一批不确定结论对象（uncertain outcome object）

第一版必须正式做不确定对象，  
否则系统仍会天然硬判。

建议数量控制在：

### **3 个**

正好对应当前最稳定的三种合法不确定来源。

---

#### 7.1 建议首批对象

1. 输入不足型不确定结论
2. 证据冲突型不确定结论
3. 继续提问收益过低型不确定结论

---

#### 7.2 为什么第一版只做这 3 个

因为这是当前最清晰、最稳、最容易承接 action policy 的不确定子类型。

如果第一版再扩很多不确定对象，会让系统：

- 显得复杂
- 实际却没有更多用户价值

---

### 8. 第一批诊断提问（diagnostic question）建议范围

第一版提问数量建议控制在：

### **12–18 个之间**

更合理目标：

### **14 个左右**

---

#### 8.1 建议优先的提问主题

##### A. 稳定性相关
1. 这些斑 / 花纹是不是一直都有？
2. 最近有没有明显扩大？
3. 以前的新叶是否也一直这样？

##### B. 分布相关
4. 只是一两片叶，还是很多叶都有？
5. 主要影响老叶，还是新叶也有？
6. 受影响区域是否集中在朝光一侧？

##### C. 可去除性 / 表面性相关
7. 表面异常擦得掉吗？
8. 是否有黏黏的感觉 / 蜜露感？

##### D. 环境触发相关
9. 最近是否暴晒过？
10. 最近是否明显浇水偏多？
11. 最近是否明显缺水？
12. 最近是否换过环境 / 换盆 / 搬动位置？

##### E. 动作价值相关
13. 当前有没有持续恶化？
14. 观察 3–7 天后是否仍在扩展？

---

#### 8.2 第一版不建议做太多的问题

先不做这些：

- 太细的背景偏好问答
- 用户很难稳定回答的问题
- 对 outcome 几乎无帮助的问题
- 主要为了“显得专业”的问题

---

### 9. 第一批动作策略（action policy）建议范围

第一版动作策略不需要做成很大表，  
但必须覆盖三类结果空间。

建议至少覆盖以下 8 类动作：

---

#### 9.1 针对问题性结论

1. 明确处理建议
2. 保守处理建议
3. 继续观察建议

---

#### 9.2 针对非问题性结论

4. 无需处理
5. 暂不建议按病害处理
6. 观察变化，必要时复查

---

#### 9.3 针对不确定结论

7. 补图 / 补关键信息
8. 暂不建议过度处理，先观察变化

---

### 10. 第一版最小闭环示意

为了确保这不是“列对象清单”，而是真正闭环，  
v1 至少应能跑通以下 3 类典型闭环。

---

#### 10.1 闭环 A：问题性路径

示例：
- 图像显示坏死斑 + 黄晕 + 多叶重复出现
- 支持真菌性叶斑类问题
- 追问扩展性后进一步确认
- 输出问题性结论 + 处理建议

---

#### 10.2 闭环 B：非问题性路径

示例：
- 图像显示稳定斑驳
- 用户回答“一直都有，新叶也这样”
- 问题性方向下降
- 输出稳定斑锦 / 固有特征类非问题性结论
- 给出“暂不按病害处理，若扩展再复查”

---

#### 10.3 闭环 C：不确定路径

示例：
- 图片模糊
- 主体不完整
- 关键部位看不清
- 无法稳定形成 hypothesis
- 输出输入不足型不确定结论
- 给出“请补拍清晰近景图”

---

### 11. 第一版不做什么

为了控制范围，v1 明确不做以下内容：

#### 11.1 不做全植物部位全覆盖
先聚焦叶片主战场。

#### 11.2 不做病原体级细拆
先停留在可行动机制 / 原因层。

#### 11.3 不做虫种级全面细分
先以动作可区分层为主。

#### 11.4 不做大规模营养问题细分
先用少量通用弱收口对象。

#### 11.5 不做大规模宿主特化规则
先做少量高价值背景先验。

#### 11.6 不做几十个非问题性 outcome
第一版只做最容易减少过诊断、最有对外表达价值的少数对象。

---

### 12. 第一版录入优先级建议

若你开始真正录入知识库，建议顺序如下：

#### 第一优先级
- 非问题性 outcome object
- 不确定 outcome object
- 叶斑类 problem
- 稳定性 / 扩展性 question

##### 原因
这是最能减少误判、最能立即提升用户体验的一批。

---

#### 第二优先级
- 刺吸式虫害 problem
- 表面附着 / 表面生长 problem
- 相关 evidence 与 question

---

#### 第三优先级
- 浇水胁迫 problem
- 光照胁迫 problem
- 背景先验与动作策略补全

---

### 13. 第一版质量门槛

v1 不是“列出来就算完成”。  
首批知识库至少要达到以下门槛：

#### 13.1 每个 problem 都至少有：
- 关键支持 evidence
- 关键反证 / 削弱 evidence
- 至少一个分流 question
- 至少一种 action policy

#### 13.2 每个非问题性 outcome 都至少有：
- 支持它成立的 evidence / rationale
- 至少一个和 problem 竞争的关键分歧点
- 至少一种动作策略

#### 13.3 每个不确定 outcome 都至少有：
- 合法触发条件
- 停止合法性解释
- 明确下一步建议

#### 13.4 每个 question 都至少有：
- 目标分歧
- evidence 映射
- 用户可答性说明

---

### 14. 最终裁决

《最小可用知识库 v1》的核心目标不是：

- 看起来全
- 看起来专业
- 看起来像完整诊断百科

而是：

> **在当前一人开发、首批上线验证的约束下，构建一个小而强、能真正减少过诊断、能真正跑通三类结果空间的知识闭环。**

因此，本版建议把第一批范围收敛为：

- **5 个问题簇**
- **约 14 个 problem**
- **约 30 个 evidence**
- **6 个非问题性 outcome object**
- **3 个不确定 outcome object**
- **约 14 个 diagnostic question**
- **8 类 action policy**

这是目前最接近：

### **可做、可审、可维护、可上线验证**

的第一版范围。

---

### 15. 下一步建议

在《最小可用知识库 v1》之后，最合理的下一步有两个方向：

#### 方向 A：继续规划层
### 《首批知识对象清单 v1》

把上面提到的：
- 14 个 problem
- 30 个 evidence
- 6 个非问题性 outcome
- 3 个不确定 outcome
- 14 个 question
- 8 类 action policy

正式一条条列成首批录入清单。

#### 方向 B：直接落数据层
开始把首批对象按表结构录入。

如果你还希望继续先把文档做稳，  
我更建议下一步先做：

### **《首批知识对象清单 v1》**


### 最小可用知识库 v1.2（taxonomy 与身份主链路联动版，基于 v1.1 只增不减）

> 说明：
>
> - 本文档基于《最小可用知识库 v1.1（AI视觉入口层联动增补版）》继续增补。
> - 本次增补目标：
>   - 把 taxonomy baseline 与 diagnosis baseline 的分工写清楚

---

### 附录 B：taxonomy 与身份主链路联动增补（本次新增，不替换原文）

#### B-1. taxonomy baseline 与 diagnosis baseline 的分工

当前首批体系中，应正式区分：

##### taxonomy baseline
来源：
- `plant_catalog.csv`

职责：
- 植物身份主数据
- family / genus / species
- canonical identity / aliases
- 基础宿主标签
- 身份主链路承接

##### diagnosis baseline
来源：
- `plants_v13_user_friendly_full_v7.xlsx`

职责：
- problem
- symptom
- question
- explanation
- plant_problem_profiles 等 diagnosis 对象

---

#### B-2. 首批知识库不要求把所有植物都精确到 species

当前首批知识库允许：

- genus 级主身份结果
- species 级主身份结果并存

原因：
- 诊断并不总要求 species 才能工作
- genus 层已具有较高宿主先验价值

---

#### B-3. taxonomy 命中结果如何服务首批知识库

taxonomy 命中后，首批知识库至少应能利用其提供：

- 当前会话植物主名
- family / genus / species
- 宿主先验挂点
- explanation 用的植物基础信息
- diagnosis baseline 中 plant_problem_profiles 的挂接线索

---

#### B-4. plant_problem_profiles 的当前定位

`plant_problem_profiles` 当前应视为：

### **taxonomy 命中后通往 diagnosis 侧 problem prior 的挂接 baseline**

它不是 taxonomy 本体。  
它更像：

- 植物宿主 → diagnosis 问题画像层

---

#### B-5. 首批知识库阶段不做什么（身份链补充）

当前首批阶段明确不做：

- 不把百度返回名直接当 canonical identity
- 不让混元承担身份主链路
- 不把 diagnosis baseline 反向当 taxonomy 主表




### ================================
### v1.3 新增附录开始（基于现有有效内容只增不减）
### ================================

### 附录：属级养护基线纳入最小可用知识库增补（本次新增，不替换上文）

#### 1. 最小可用知识库不应只包含 diagnosis 侧知识

新增正式规则：

### **当前最小可用知识库不应只包含 diagnosis 侧知识。**

除 diagnosis 静态业务知识外，至少还应包括：

- 植物身份主数据
- Taxonomy 命名归一
- 属级养护基线

---

#### 2. 新增最小可用知识对象：属级养护基线

当前正式新增：

- `genus_care_profiles`

作为最小可用知识库的一部分。

##### 原因
它将直接服务于：
- 养护背景解释
- 行动建议生成
- 宿主环境基线判断

---

#### 3. 当前最小可用知识库应统一理解为

##### Taxonomy 侧最小主数据
- plant identity entity
- aliases / match rules
- genus care baseline

##### Diagnosis 侧最小业务知识
- problems
- symptoms
- question_templates
- diagnosis_result_explanations
- plant_problem_profiles

这两部分共同构成当前最小可用知识库。



## [S15] 准入与退役规则 v1.3（完整最终版）

- 文件名：`准入与退役规则_v1_3_完整最终版_标题版本已统一.md`
- 状态：A类正式基线
- 类别：治理/准入退役
- 用途：对象是否进入或退出系统的治理规则；默认拒绝，证据驱动
- SHA-256 前 16 位：`89bc4cc46957890c`

---

### 准入与退役规则 v1.3（完整最终版）

> 说明：
>
> - 本文件为完整最终文件，不是纯补丁。
> - 本文件完整保留当前可确认有效的前版正文与联动增补内容，并在其后追加新的联动附录。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **只增不减**

---

### 准入与退役规则 v1

> 说明：
>
> - 本文档基于当前最新文档体系继续向下推进：
>   - 《诊断系统硬约束清单 v2.3（联动增补版，基于 v2.2 只增不减）》
>   - 《诊断结论层 v1.1（review 增补修正版，基于 v1 只增不减）》
>   - 《诊断目标分层 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《核心数据结构 v1.3（联动增补版，基于 v1.2 只增不减）》
>   - 《运行时模型 v1.2（联动增补版，基于 v1.1 只增不减）》
>   - 《统一术语表 v1.1（review 修正版）》
>   - 《决策流 v1.1（review 增补修正版，基于 v1 只增不减）》
> - 本文档目标是：
>
> # **把 problem / evidence / outcome / question / rule 的入库标准、拒绝标准、合并标准、停用标准彻底写死。**
>
> - 本文档不是“可选治理建议”，而是知识库扩张时的硬治理基线。
> - 本文档继续遵循：
>   - 中文主名优先
>   - 英文仅作辅助标记
>   - 不同层级对象不得混用同一主名
>   - 能不新增就不新增
>   - 只要无法证明有独立价值，就默认不准入

---

### 0. 文档定位

到当前为止，我们已经有了：

- 《硬约束清单》：定义系统不能越过的总边界
- 《诊断结论层》：定义最终结果空间
- 《诊断目标分层》：定义问题性对象空间
- 《核心数据结构》：定义静态主对象
- 《运行时模型》：定义运行时状态对象
- 《决策流》：定义对象如何在时间顺序中流动

但仅有这些还不够。

因为只要开始真正录入知识库，就会立刻遇到一类更现实的问题：

- 这个 problem 值不值得新增？
- 这个 evidence 是不是只是旧 evidence 的换皮？
- 这个 outcome 是结果对象，还是只是判断依据？
- 这个 question 有没有真实分流价值？
- 某条规则长期不产生价值，删不删？
- 某个对象误导性太强，是合并、停用、还是退役？

如果这些问题没有统一规则，系统会很快退化成：

- 表越来越多
- 字段越来越杂
- 术语越来越漂
- 规则越来越长
- 解释越来越弱
- 维护成本越来越高

因此，本文件的职责是：

> **为知识库所有核心对象建立准入、拒绝、合并、停用、退役的统一治理机制。**

---

#### 0.1 本文档管什么对象

本文件至少覆盖以下 6 类对象：

1. **诊断问题（problem）**
2. **证据（evidence）**
3. **模式证据 / 派生证据（pattern / derived evidence）**
4. **诊断结论对象（outcome object）**
5. **诊断提问（diagnostic question）**
6. **规则（rule）**
   - 证据派生规则
   - 证据到问题规则
   - 其他受控规则对象

---

#### 0.2 本文档不管什么

本文件不直接负责：

- 运行时是否命中某个对象
- 某次会话里某个对象得分高低
- UI 如何展示对象
- 具体 SQL 或代码实现

这些属于：

- 运行时模型
- 决策流
- 前端层
- 实现层

本文件只负责一个核心问题：

### **这个对象配不配存在于系统里。**

---

### 1. 总治理原则

#### 1.1 默认拒绝原则

新增任何对象时，默认立场不是“先收进去再说”，而是：

### **默认拒绝，除非证明值得进入。**

这条原则非常重要。

因为大多数知识系统不是死于“不够丰富”，而是死于：

- 过量新增
- 同义膨胀
- 轻微差异对象泛滥
- 无治理扩表

---

#### 1.2 独立价值原则

任何对象要准入，必须证明它具有：

### **独立价值（independent value）**

独立价值至少包括以下之一：

- 显著提升分流能力
- 显著提升表达能力
- 显著提升动作承接能力
- 显著提升解释能力
- 显著减少误判风险
- 显著减少“全靠自由文本兜底”的情况

若一个对象无法带来这些价值之一，则默认不准入。

---

#### 1.3 可复用原则

准入对象应优先具备：

### **跨会话复用价值**

一个对象如果只能在极少数边缘情况下成立，且不可复用，则要高度警惕。

这不代表系统永远不能承载小众对象，  
而是说：

- 复用性越弱
- 准入门槛就必须越高

---

#### 1.4 可解释原则

任何准入对象都必须可解释。

也就是说，后续系统至少要能解释：

- 为什么这个对象存在
- 为什么它不是另一个旧对象
- 为什么它应该在这个层级，而不是别的层级
- 为什么它值得维护

不能解释的对象，默认不准入。

---

#### 1.5 不混层原则

任何对象在准入时，必须先回答：

### **它属于哪一层？**

至少要明确是：

- 问题性对象
- 证据
- 模式证据
- 结论对象
- 判断依据
- 提问
- 规则

如果层级答不清，说明对象语义未成熟，默认不准入。

---

#### 1.6 小而强原则

本系统优先做：

### **小而强知识库**

而不是百科全书式全覆盖。

也就是说，优先新增：

- 高频
- 高价值
- 高分流力
- 高解释价值
- 高动作承接价值

而不是：

- 看起来“完整”
- 看起来“很专业”
- 但几乎不影响实际诊断路径

---

### 2. 对象生命周期统一模型

为避免不同对象各自一套治理逻辑，本系统统一采用以下生命周期：

1. **候选（candidate）**
2. **准入通过（admitted）**
3. **启用（active）**
4. **观察中（observed）**
5. **限制使用（restricted）**
6. **停用（inactive）**
7. **退役（retired）**
8. **合并归档（merged / archived）**

---

#### 2.1 候选（candidate）

尚未正式进入生产知识库，只处于评估名单中。

适用场景：

- 新发现的潜在对象
- 需要进一步证明价值
- 需要进一步证明不与旧对象重复

---

#### 2.2 准入通过（admitted）

已通过准入审查，允许进入系统正式表结构或知识对象清单，但未必立刻大规模使用。

---

#### 2.3 启用（active）

已经作为正式对象参与：

- 知识录入
- 规则关联
- 运行时使用
- 输出解释

---

#### 2.4 观察中（observed）

已准入，但存在以下情况之一：

- 价值尚未完全稳定
- 误导风险需要继续观察
- 与邻近对象边界尚需验证
- 实际命中数据太少，需要继续收集

---

#### 2.5 限制使用（restricted）

对象本身未被完全否定，但应限制其使用范围。

例如：

- 只对特定宿主范围开放
- 不允许作为首发主输出
- 不允许作为高优先级提问驱动对象
- 仅允许在研究分支 / 内部验证中使用

---

#### 2.6 停用（inactive）

对象不再参与正常新增、默认规则生成或主流程输出，但仍保留历史可追溯性。

适用场景：

- 已被更优对象替代
- 长期价值过低
- 误导性较高
- 层级定义错误但仍需保留历史兼容

---

#### 2.7 退役（retired）

对象正式退出可用知识库，不再作为当前系统对象使用。

但仍需保留：

- 历史引用关系
- 退役原因
- 替代对象（若有）

---

#### 2.8 合并归档（merged / archived）

两个或多个对象被确认高度重复，合并为一个标准对象。  
旧对象归档，不再独立维护。

---

### 3. 诊断问题（problem）准入与退役规则

#### 3.1 诊断问题准入的前提问题

新增一个 problem 之前，必须先回答 6 个问题：

1. 它是不是**问题性对象**？
2. 它是不是**可行动解释对象**？
3. 它是不是**机制 / 原因层**，而不是表现型层？
4. 它能不能和已有 problem 稳定区分？
5. 它能不能承接提问与动作？
6. 它的价值是否高于新增维护成本？

这 6 个问题只要有 2 个答不清，默认不准入。

---

#### 3.2 诊断问题的准入标准

一个 problem 必须同时满足以下条件，才允许准入：

##### A. 层级正确
必须属于：

- 问题性对象
- problem taxonomy
- 可行动的机制 / 原因层

##### B. 可被证据支持 / 削弱 / 排除
也就是说，后续必须能建立：

- evidence → support
- evidence → oppose
- evidence → exclude
- evidence → gate

至少一种稳定关系。

##### C. 可形成竞争
它不能是一个孤立对象。  
必须能与至少一个现有 problem 形成有效竞争或分流关系。

##### D. 能承接动作策略
如果系统输出它，后续必须知道：

- 要不要处理
- 要不要观察
- 要不要补图 / 补问
- 风险是什么

##### E. 不是纯表现型换皮
若只是把“黄叶 / 黑斑 / 穿孔 / 黄晕”之类观察事实换个名字，不准入。

##### F. 不是过细粒度研究对象
若只是更具体的虫种级、病原体级、且当前不提升动作价值，则默认不准入 problem 主层。

---

#### 3.3 诊断问题的拒绝标准

以下情况默认拒绝准入：

- 只是 symptom 换皮
- 只是 pattern 换皮
- 只是 action 换皮
- 只是更精细但无新增价值的变体
- 只是某个稀有边缘场景的临时命名
- 只是结果描述词，如“状态差”“长势不好”
- 只是“像什么”的模糊词，但不能稳定承接动作

---

#### 3.4 诊断问题的合并标准

若两个 problem 满足以下条件，应优先考虑合并：

- 支持证据高度重叠
- 关键反证高度重叠
- 提问路径高度重叠
- 动作策略高度重叠
- 用户表达价值差异极小

换句话说：

### **如果两个 problem 的主要区别只剩命名，而不是诊断行为差异，就应优先合并。**

---

#### 3.5 诊断问题的停用 / 退役标准

一个 problem 应进入停用或退役评估，若满足以下任一情况：

- 长期几乎不进入高价值竞争路径
- 与另一个对象高度重复
- 误导率高
- 经常把用户引向错误动作
- 后续发现其层级本来就错了（例如应是 pattern 或 outcome）

##### 处理优先级建议
1. 能合并则优先合并
2. 不能合并但仍需历史兼容，则停用
3. 无复用价值且保留只会误导，则退役

---

### 4. 证据（evidence）准入与退役规则

#### 4.1 证据准入的核心判断

新增 evidence 前，先问：

1. 它是不是系统真正可消费的信息单位？
2. 它是否独立于已有 evidence？
3. 它是否能影响解释对象竞争或结论收敛？
4. 它是不是只是另一个 evidence 的同义改写？

---

#### 4.2 证据的准入标准

一个 evidence 至少要满足以下条件：

##### A. 可观察或可确认
来源可以是：

- 图像
- 用户回答
- 规则派生
- 宿主先验

但必须能被系统明确持有，而不是纯抽象概念。

##### B. 对竞争有价值
它必须能影响至少一项：

- hypothesis 排序
- outcome 收敛
- question 选择
- stop 判断

##### C. 可定义标准状态
至少能落在：

- 已存在
- 已确认不存在
- 未知

##### D. 可区分来源类型
必须能说明是：

- 图像识别
- 用户回答
- 规则派生
- 先验

---

#### 4.3 证据的拒绝标准

以下对象通常不应准入 evidence：

- 纯动作建议
- 纯解释结论
- 太模糊而无法标准化持有的描述
- 与已有 evidence 只是文字同义变形

---

#### 4.4 证据的合并标准

若两个 evidence 满足以下条件，应优先合并：

- 可观察事实几乎相同
- 来源类型相同或兼容
- 对 hypothesis / outcome 的作用几乎相同
- 用户理解差异极小

---

#### 4.5 证据的停用 / 退役标准

满足以下任一情况时，应评估停用或退役：

- 长期不参与关键路径
- 与其他 evidence 高度重复
- 误导性高
- 观察歧义过大，长期无法稳定使用
- 本质上更适合作为：
  - pattern
  - 正常判断依据
  - outcome 支持依据

---

### 5. 模式证据 / 派生证据（pattern / derived evidence）准入与退役规则

#### 5.1 模式证据准入的关键前提

pattern 的存在，必须证明：

### **它比单个原始 evidence 更有诊断价值。**

如果一个 pattern 只是把父证据换个中间名字，不准入。

---

#### 5.2 模式证据准入标准

##### A. 至少整合两条及以上原始证据
##### B. 比单条 evidence 更有分流价值
##### C. 跨多个 problem 或 outcome 有复用价值
##### D. 不只是对父证据做语义复述
##### E. 不会导致重复计分失控

---

#### 5.3 模式证据拒绝标准

以下情况默认拒绝：

- 父证据的简单拼接重命名
- 只服务单一极小众对象
- 对决策流没有新增价值
- 只会让 evidence layer 更臃肿

---

#### 5.4 模式证据停用 / 退役标准

- 长期没有形成高价值分流
- 经常和父证据重复计分
- 对解释帮助很弱
- 维护成本高于收益

---

### 6. 诊断结论对象（outcome object）准入与退役规则

#### 6.1 outcome object 准入前的核心判断

这是当前最关键的一类治理对象。  
新增 outcome object 前，必须先问：

1. 它是**结果对象**，还是只是**判断依据**？
2. 它能否稳定对外表达？
3. 它对用户是否有独立认知价值？
4. 它能否稳定承接动作策略？
5. 它是否真的配进入 outcome layer，而不是 evidence layer？

---

#### 6.2 outcome object 的准入标准

##### A. 必须属于三类 outcome type 之一
- 问题性结论对象
- 非问题性结论对象
- 不确定结论对象

##### B. 必须可稳定对外表达
系统至少应能用一句明确的话向用户表达它。

##### C. 必须有独立认知价值
用户看到它，应能理解这是一个“结果”，而不是一条琐碎观察。

##### D. 必须可承接动作策略
它必须能稳定接到：

- 处理
- 观察
- 补图
- 补问
- 条件性复查

至少一种动作策略。

##### E. 必须不是单纯判断依据
这条尤其重要。  
例如：

- 边界清晰
- 无扩展性
- 长期存在

这些通常不是 outcome object，而是：

- 正常判断依据
- 或证据支持依据

---

#### 6.3 非问题性结论对象的额外准入标准

##### A. 必须是结果对象，而非正常判断依据
##### B. 必须可复用
##### C. 必须能对用户形成独立表达
##### D. 必须不是“只是看起来不严重”

##### 可准入例子
- 稳定斑锦 / 锦化特征
- 品种固有花纹
- 老叶自然退化
- 非病理性旧机械伤
- 正常阶段性浅色新叶

##### 默认不准入例子
- 无扩展性
- 边界清晰
- 长期存在
- 单片叶受影响
- 某个局部轻微色差碎片

---

#### 6.4 不确定结论对象的额外准入标准

不确定对象不是“所有说不清的都塞进来”。  
必须属于明确的不确定子类型，例如：

- 输入不足
- 证据冲突
- 继续提问收益过低

如果只是“系统暂时没想好”，不准入为标准不确定 outcome object。

---

#### 6.5 outcome object 的合并标准

若两个 outcome object 满足以下条件，应优先考虑合并：

- 对外表达高度重复
- 动作策略基本一致
- 用户感知差异极小
- 主要只在措辞上不同

---

#### 6.6 outcome object 的停用 / 退役标准

以下情况应评估停用或退役：

- 长期不进入有效输出路径
- 经常和 evidence / rationale 混层
- 用户几乎无法理解
- 难以承接动作策略
- 和其他 outcome object 高度重复

---

### 7. 诊断提问（diagnostic question）准入与退役规则

#### 7.1 question 准入前的核心判断

新增 question 前，必须先问：

1. 它区分谁？
2. 不问它会损失什么？
3. 用户能答清吗？
4. 它会不会只是重复确认已经很清楚的事实？
5. 它会不会带来超过收益的疲劳？

---

#### 7.2 question 的准入标准

##### A. 必须有明确分流目标
至少能区分：
- 两个以上 hypothesis
- 或两个以上 outcome 方向

##### B. 必须能映射成 evidence
question 的答案应先变成证据，而不是直接改结论。

##### C. 必须具有可观察性或可回答性
用户有现实可能给出稳定回答。

##### D. 必须有实际信息增益
不允许为了“显得像在认真问”而新增无用问题。

---

#### 7.3 question 的拒绝标准

以下情况默认拒绝：

- 固定问卷式背景闲问
- 重复确认高置信视觉事实
- 不能映射成 evidence 的问题
- 对当前分歧无实质作用的问题

---

#### 7.4 question 的合并标准

若两个 question 满足以下条件，应优先合并：

- 询问的核心事实相同
- 映射 evidence 高度重叠
- 用户回答负担差异很小
- 仅是措辞略有不同

---

#### 7.5 question 的停用 / 退役标准

- 长期信息增益低
- 用户高频答不清
- 与其他问题高度重复
- 经常触发重复确认阻断
- 对实际 outcome 收敛几乎没有价值

---

### 8. 规则（rule）准入与退役规则

本节覆盖：

- 证据派生规则
- 证据到问题规则
- 其他受控规则对象

---

#### 8.1 rule 准入前的核心判断

新增 rule 前，必须先问：

1. 现有规则真的无法表达吗？
2. 这是新规则，还是旧规则换写法？
3. 它是提升清晰度，还是提升复杂度？
4. 它带来的是新增价值，还是新增维护负担？

---

#### 8.2 rule 的准入标准

##### A. 作用明确
必须能清楚回答：
- 这条规则影响什么对象？
- 作用方向是什么？
- 为什么需要它？

##### B. 不是旧规则重复展开
##### C. 能被解释
##### D. 能被停用 / 替换

---

#### 8.3 rule 的拒绝标准

默认拒绝以下规则：

- 解释不清的“玄学规则”
- 明显和旧规则语义重复的规则
- 只增加复杂度，不增加解释力的规则
- 本质上应靠对象治理解决，而不是靠新增规则兜底的情况

---

#### 8.4 rule 的停用 / 退役标准

- 长期不起作用
- 与新规则冲突
- 误导率高
- 解释成本过高
- 只为历史兼容而存在，但已无实际价值

---

### 9. 统一审查清单

为了让后续所有新增对象都能按统一方式审查，本系统统一采用以下审查模板。

---

#### 9.1 problem 审查清单

- 它是不是问题性对象？
- 它是不是机制 / 原因层？
- 它能否被 evidence 支持 / 削弱 / 排除？
- 它能否与现有 problem 稳定区分？
- 它能否承接提问和动作？
- 它是否只是表现型换皮？
- 它的收益是否大于新增成本？

---

#### 9.2 evidence 审查清单

- 它是不是系统可消费的信息单位？
- 它是否独立于已有 evidence？
- 它会不会只是同义改写？
- 它是否影响 hypothesis / outcome / question / stop？
- 它是否能标准化持有状态？
- 它是否能说明来源类型？

---

#### 9.3 outcome object 审查清单

- 它是结果对象，还是判断依据？
- 它能否稳定对外表达？
- 它对用户有独立认知价值吗？
- 它能承接动作策略吗？
- 它是否与已有 outcome 重复？
- 它是否本应属于 evidence / rationale 层？

---

#### 9.4 question 审查清单

- 它区分谁？
- 它的答案映射到什么 evidence？
- 用户能否稳定回答？
- 它是否会重复确认已有高置信事实？
- 不问它会失去什么？

---

#### 9.5 rule 审查清单

- 这条规则影响哪个对象？
- 作用方向是什么？
- 它为何不能由现有规则表达？
- 它是否只是在增加复杂度？
- 它是否可解释、可停用、可替换？

---

### 10. 统一决策优先级

当一个对象同时面临多种处理选择时，优先级建议如下：

#### 10.1 对新增对象
1. 能复用旧对象 → 复用
2. 能合并入旧对象 → 合并
3. 仅在确有独立价值时 → 准入新增

#### 10.2 对低价值对象
1. 能限制使用 → 限制使用
2. 能停用保留兼容 → 停用
3. 保留只会误导 → 退役

#### 10.3 对重复对象
1. 优先合并
2. 保留主对象
3. 旧对象归档并写清替代关系

---

### 11. 治理证据要求

为了避免知识库治理流于口头，本系统建议任何准入 / 停用 / 退役决策都至少记录：

- 对象名称
- 对象类型
- 当前状态
- 本次决策类型
  - 准入
  - 拒绝
  - 合并
  - 限制使用
  - 停用
  - 退役
- 核心理由
- 替代对象（若有）
- 决策日期
- 审查版本

---

### 12. 最终裁决

《准入与退役规则 v1》的核心目的不是“让治理看起来规范”，而是：

> **从制度上阻止知识库膨胀、混层、漂移和无休止打补丁。**

因此，本系统今后新增任何核心对象时，默认都必须先过三道关：

1. **层级关**
   - 它到底属于哪一层？

2. **独立价值关**
   - 它是不是只是旧对象换皮？

3. **维护收益关**
   - 它带来的收益，是否大于它带来的长期维护成本？

只要这三关有一关答不清，默认不准入。

---

### 13. 下一步建议

在《准入与退役规则 v1》之后，更合理的下一步是：

### 《最小可用知识库 v1》

因为现在：

- 架构边界已基本成型
- 运行时与决策流已基本成型
- 对象治理规则也已落地

下一步就该把第一批真正要做的：

- problem
- evidence
- outcome object
- question
- action policy

范围收敛出来，形成首批可落地知识库。


### 准入与退役规则 v1.2（taxonomy 与身份主链路联动版，基于 v1.1 只增不减）

> 说明：
>
> - 本文档基于《准入与退役规则 v1.1（AI视觉入口层联动增补版）》继续增补。
> - 本次增补目标：
>   - 给 taxonomy / plant identity entity 增加专门治理规则
>   - 明确 alias vs identity 的治理边界

---

### 附录 B：taxonomy 与身份主链路治理增补（本次新增，不替换原文）

#### B-1. taxonomy 对象的正式治理目标

taxonomy 对象不是普通展示数据，而是：

- 植物身份主数据源
- 命名归一层
- 宿主基础信息层
- 未来训练标签层

因此其治理强度应高于普通展示字段。

---

#### B-2. plant identity entity 的准入标准

一个新植物身份对象进入 taxonomy，至少应满足：

1. 有独立身份价值
2. 不是旧对象别名换皮
3. 能稳定归一到当前体系
4. 能为身份主链路或宿主先验提供价值
5. 不会引入高歧义 alias 污染

---

#### B-3. alias 与 identity 的治理边界

##### 原则
- 高概率只是不同叫法 → 优先作为 alias
- 具备独立稳定身份意义 → 才考虑新建 identity

##### 默认不应新建 identity 的情况
- 商品名变体
- 俗名变体
- 简繁 / 标点 / 写法差异
- 旧名 / 兼容名

这些优先进入：
- aliases
- common_names
- commercial_names
- legacy_names

---

#### B-4. taxonomy 对象的合并规则

若两个 plant identity entity 满足以下条件，应优先考虑合并：

- 实际指向同一植物身份
- 分类路径可归一
- 宿主先验价值无独立差异
- 主要差异只是叫法

合并后应保留：
- replacement_identity_id
- 历史 alias 映射
- 合并原因

---

#### B-5. taxonomy 对象的停用 / 退役规则

若某 taxonomy 对象：

- 长期无实际命中价值
- 被确认只是重复对象
- 命名高度误导
- 已被更稳定主对象替代

则可进入：
- 停用
- 合并归档
- 退役

但必须保留：
- replacement_identity_id
- 历史别名映射
- 退役原因

---

#### B-6. 身份链与症状链不得套用同一治理口径

新增正式边界：

### **身份主链路治理规则，不得简单套用症状链治理规则。**

因为：

- 身份链处理的是命名归一与 taxonomy 命中
- 症状链处理的是 topK 症状与 evidence 接纳

二者治理对象不同、漂移方式不同、退役原因也不同。




### ================================
### v1.3 新增附录开始（基于现有有效内容只增不减）
### ================================

### 附录：属级养护基线准入与退役规则增补（本次新增，不替换上文）

#### 1. 属级养护基线表属于正式治理对象

新增正式规则：

### **`genus_care_profiles` 属于正式治理对象。**

因此它也必须服从：

- 准入
- 审核
- 停用
- 替代
- 退役

等治理规则。

---

#### 2. 准入最小条件

一条属级养护基线若要正式进入主表，至少应满足：

1. `genus_name + family_name` 可稳定归属
2. 四类核心 JSON 字段可解析
3. 温湿度数值范围合法
4. `review_status` 合法
5. `evidence_level` / `evidence_strategy` 合法
6. 具备基本来源说明

---

#### 3. 可暂停 / 限制使用的情况

若出现以下情况，允许进入：

- 限制使用
- 暂停启用
- 待复审状态

典型原因包括：

- JSON schema 不稳定
- evidence 说明不足
- baseline_note 与结构化字段严重冲突
- genus_name / family_name 归属存疑
- 与更高质量记录发生冲突

---

#### 4. 退役与替代规则

若某条属级养护基线：

- 被更高质量记录替代
- 被确认属级归属错误
- 长期不再适用
- 结构已被正式 overrides / 新基线替代

则允许：

- `retired_at` 标记
- `replacement_profile_id` 挂接
- 保留历史留痕，不直接硬删



## [S16] 收益驱动停止策略 v1

- 文件名：`收益驱动停止策略_v1.md`
- 状态：A类正式基线
- 类别：追问/停止
- 用途：取消固定轮数后的收益驱动停止规则；gate、输出资格、边际收益
- SHA-256 前 16 位：`66e4fdd84a56861e`

---

### 收益驱动停止策略 v1

> 本文档用于补齐取消硬性轮数上限后的总停止策略。
>
> 核心裁决：
>
> # **一页一题不等于无限追问；停止必须由必答 gate、输出资格、下一题边际收益共同驱动。**
>
> 本文档不恢复旧的“最多 2 轮”硬限制。轮次只能用于审计、资源保护和用户体验控制，不得作为常规诊断 final 的主停止条件。

---

### 1. 适用范围

本规则适用于诊断主链中所有需要在 `followup` 与 `final` 之间决策的路径，包括：

- 视觉证据已进入正式 evidence 后是否继续追问
- 一页一题模式下是否进入下一题
- 已满足结论门槛后是否允许 final
- 无法形成明确结论时是否允许合法 uncertain
- edema / overwatering 等已有形态正证据但被低增益题拖住的路径

---

### 2. 必答 gate 层

#### 2.1 定义

`gate_required_layer` 是当前会话中唯一可以阻塞 final 的必答层。

只有满足以下任一条件的问题或守卫，才允许进入必答 gate 层：

1. **模式入口 gate**
   - 用于决定当前症状模式的主分流方向。
   - 例如黄叶类的第一层分流 gate。
2. **输出资格 gate**
   - 缺失后会导致当前 top outcome 不具备合法 `output eligibility`。
   - 例如某个 outcome 明确要求的 context guard 尚未满足。
3. **top 与 runner-up 区分 gate**
   - 当前 top 与 runner-up 分差接近，且该问题的答案能实质改变两者排序或输出资格。
4. **合法 uncertain gate**
   - 用于确认关键输入缺失、强证据冲突或无法补齐的事实，从而触发合法 uncertain。
5. **安全/动作边界 gate**
   - 不回答会导致用户动作建议明显不安全或方向相反。

#### 2.2 非 gate 问题

以下问题默认不得进入必答 gate 层，也不得阻塞 final：

- `progression`
- `distribution_scope`
- `host_confirmation`
- `underside_presence`
- 无 `directProblemAdjustments` 且没有显式 `output_eligibility` / `context_guard` / `uncertain_legality` 影响的问题
- 只影响解释、严重程度、护理建议、观察提示的问题

例外仅限于：该问题被正式规则显式标记为某个 outcome 的输出资格 gate，或能实质区分当前 top 与 runner-up。例外必须写入 trace，不能由运行时临时猜测。

---

### 3. 结论门槛满足后可停止

#### 3.1 问题性结论可停止条件

当同时满足以下条件时，允许停止并进入 final：

1. top problem / outcome 已有正式正证据支撑。
2. `gate_required_layer` 中没有未完成的必答 gate。
3. 当前 top 相对 runner-up 已达到稳定输出边界，或剩余问题无法实质改变 top / runner-up 竞争关系。
4. 不存在尚未解决的高等级反证或强冲突。
5. `output eligibility judgment` 已完成。
6. 下一题没有高价值收益。

满足以上条件后，低价值题不得继续阻塞 final。

#### 3.2 非问题性结论可停止条件

当非问题性方向已满足正式输出资格，且继续提问只能影响解释、观察建议或护理建议时，允许停止并给出保守 final。

#### 3.3 不确定结论可停止条件

当无法满足明确问题性或非问题性输出资格，但当前已无高价值问题可问，且满足以下任一合法 uncertain 触发条件时，允许停止：

- 关键输入缺失无法补齐
- 高等级证据冲突无法在当前会话内解除
- 当前能获得的高价值信息已耗尽
- 用户无法继续回答关键问题

此时应使用 `stop_reason_detail = insufficient_marginal_questioning_gain` 或更具体的合法 uncertain 原因。

---

### 4. 下一题高价值判定

#### 4.1 高价值问题必须命中至少一项

下一题只有满足以下至少一项，才是高价值题：

1. **补齐 context guard**
   - 答案能补齐当前 top outcome 输出资格所需的 context guard。
2. **改变 output eligibility**
   - 答案可能让当前结论从不可输出变为可输出，或从明确输出降级为保守/uncertain。
3. **区分 top 与 runner-up**
   - 答案对当前 top 与 runner-up 有直接、实质、方向相反或差异化影响。
4. **触发合法 uncertain**
   - 答案能确认输入不足、证据冲突或关键事实不可补齐，从而使 uncertain 合法成立。

#### 4.2 高价值问题的最小数据要求

高价值题必须至少具备以下一种可审计影响：

- 非空且有效的 `directProblemAdjustments`
- 显式 `context_guard` 影响
- 显式 `output_eligibility` 影响
- 显式 `uncertain_legality` 影响
- 显式安全/动作边界影响

如果一个问题没有以上任何影响，即使它的文案看起来相关，也只能作为低价值题处理。

---

### 5. 低价值题不得阻塞 final

#### 5.1 低价值题定义

以下问题在结论门槛已满足后必须降级为低价值题：

- 只问是否扩散、变多、变快的 `progression`
- 只问局部/全株/新老叶范围的 `distribution_scope`
- 只确认植物是否属于某宿主范围的 `host_confirmation`
- 只确认叶背是否存在某现象的 `underside_presence`
- 无 `directProblemAdjustments` 的问题
- 只影响解释文案、严重程度描述、护理建议、观察提醒的问题

#### 5.2 低价值题的处理

低价值题可以：

- 作为 final 后的观察建议
- 作为护理建议的条件说明
- 作为审计 trace 中的未问候选

低价值题不得：

- 阻塞 final
- 延长 followup
- 被包装成必答 gate
- 作为不输出明确结论的理由

---

### 6. 一页一题后的总收益停止

一页一题模式下，每回答一题必须立即重算：

1. evidence / hypothesis / outcome
2. `gate_required_layer`
3. `output eligibility`
4. 下一题高价值收益
5. stop_state

禁止用固定轮数硬截断常规诊断；也禁止因为没有固定轮数就无限追问。

推荐停止原因：

- `outcome_converged_no_high_gain_question`
- `non_problematic_converged_no_high_gain_question`
- `uncertain_insufficient_marginal_gain`
- `input_insufficient_no_recoverable_gain`
- `conflict_unresolved_no_high_gain_question`

---

### 7. edema / overwatering 路径裁决

#### 7.1 已有形态正证据时不得被低增益题拖住

当 edema / overwatering 路径已经具备正式形态正证据，例如：

- 水肿样疱状 / 隆起 / 半透明水渍样斑
- 木栓化、结痂样水肿后痕迹
- 与过湿相关的稳定视觉正证据
- 已进入正式 evidence 的过湿 / 水分压力形态线索

且当前 top outcome 已满足输出资格时，不得继续被以下低增益题拖住：

- 光照变化类泛问
- 分布范围泛问
- 宿主确认泛问
- 叶背存在性泛问
- 无 `directProblemAdjustments` 的背景题

#### 7.2 edema / overwatering 可继续追问的例外

只有以下问题仍可作为高价值题：

- 能补齐该 outcome 必需的浇水、土壤湿度、排水、盆土状态 context guard
- 能实质区分 edema / overwatering 与当前 runner-up
- 能确认关键反证并改变 output eligibility
- 能触发合法 uncertain，而不是只是补充解释

若不存在上述高价值题，应直接进入停止判定与 final。

---

### 8. trace 与审计要求

每次决定继续问或停止时，trace 至少应能解释：

- `required_gate_ids`
- `unmet_required_gate_ids`
- `output_eligibility_state`
- `next_question_gain_class = high | low | none`
- `next_question_gain_reason`
- `suppressed_low_gain_question_ids`
- `stop_reason_detail`
- `why_final_not_blocked_by_low_gain_questions`

若 edema / overwatering 因已有形态正证据停止，trace 必须明确记录：

- `morphological_positive_evidence = true`
- `low_gain_questions_suppressed`
- `final_allowed_after_gain_check = true`

---

### 9. 已回答路径约束

收益驱动停止必须同时尊重用户已经给出的分支答案。候选问题出队前必须先经过路径约束过滤。

#### 9.1 黄叶 gate 约束

黄叶、黄斑、黄化营养相关模式必须先问 primary clue gate。

若用户已选择：

- `pest_trace`：后续只能进入虫害痕迹细分，不得继续问叶龄黄化分布。
- `disease_trace`：后续只能进入斑点、烂斑、霉粉、水渍等病害细分，不得继续问叶龄黄化分布。
- `care_context`：后续只能进入养护维度分流，不得直接跳到虫害或病斑细分。
- `yellowing_only` 或 `unknown`：才允许继续问新老叶、上下部、分布范围等泛黄化题。

#### 9.2 孔洞 / 结构缺损约束

叶片孔洞或结构缺损分支中，若用户没有确认虫害痕迹，后续应在以下方向内收敛：

- 虫害痕迹不足，进入保守 uncertain。
- 病斑干枯后脱落。
- 机械损伤、旧伤、摩擦或焦边裂开。

不得无桥接地跳到根腐、黑根、烂根、根团臭味或过湿问诊。

#### 9.3 缺水否定后的根区约束

缺水分支中，若用户否定“干土时明显萎蔫”，不得立刻追问根部臭味、黑根、糊根。

必须先有过湿或湿土萎蔫桥接事实，例如：

- 盆土长期偏湿
- 盆土还湿时仍发蔫
- 排水明显异常

只有桥接事实成立，才允许进入根区细节题。

#### 9.4 根区细节题收敛

根腐、软腐、冠腐等路径可以问根区细节，但不应连续拆成过多题。

以下题属于同一证据簇：

- 根部或根团臭味
- 根系发黑
- 根系发软、发糊、易断

同一轮路径中，若已问过两个根区细节题，后续根区细节题默认视为低增益，应停止或进入保守输出，而不是继续展开。

---

### 10. 最终守门结论

1. 只有必答 gate 可以阻塞 final。
2. 结论门槛满足后，若下一题没有高价值收益，必须允许停止。
3. 高价值题必须能补齐 context guard、改变 output eligibility、区分 top 与 runner-up，或触发合法 uncertain。
4. `progression / distribution_scope / host_confirmation / underside_presence`、无 `directProblemAdjustments`、只影响解释/严重程度/护理建议的问题，默认不得阻塞 final。
5. 一页一题后不按轮数硬截断，但必须有总收益停止。
6. edema / overwatering 已有形态正证据且满足输出资格时，不得被光照、分布、叶背、宿主确认等低增益题拖住。
7. 已回答路径约束优先于通用 ranking；不得在用户否定某一方向后无桥接地跳到不相关问题簇。



## [S17] 具体问题结论正向证据门槛规则 v1

- 文件名：`具体问题结论正向证据门槛规则_v1.md`
- 状态：非A类/补充或过程文件
- 类别：追问/停止
- 用途：具体 problem 输出必须有问题级正向证据或高特异视觉事实
- SHA-256 前 16 位：`b78470e0a38a9a8d`

---

### 具体问题结论正向证据门槛规则 v1

#### 1. 目标

本规则用于约束诊断流从“视觉方向”进入“具体问题结论”的最后一跳，避免出现：

- 视觉只看到泛化症状，却输出具体病因；
- 某个方向被追问排除后，系统在无正向证据时跳到另一个具体方向；
- 只凭 priors / genus baseline / 泛化视觉症状给出过度确定的结论。

一句话：

> 视觉症状可以形成诊断方向，但具体问题结论必须有正向问题级证据或高特异视觉事实支撑。

#### 2. 结构性虫害候选门槛

适用症状：

- `holes_in_leaf`
- `chewed_edges`
- `skeletonized_leaves`
- `tunnels_in_leaf`

若满足以下条件：

- 只来自单张全株图、未知部位图或其他宽泛图；
- 模型描述仅为“洞口 / 缺损 / 疑似被咬”这类泛化文本；
- 缺少叶缘啃食、穿透背景、骨架化、潜道等高特异细节；

则必须处理为：

- `admission_result = candidate_retained`
- `entered_runtime = 0`
- `target_layer = visual_candidate`

该候选不得直接进入：

- `observed_evidence_set`
- `observedSymptoms`
- `problem ranking`
- final outcome

必须先通过正式题库或兜底确认题询问用户，例如：

- “叶片上有被咬穿的洞，而不是病斑干掉后的穿孔吗？”

用户回答 `yes` 后，只能通过 follow-up answer effect 回流为正式证据，不得回写原始视觉 admission。

#### 3. 黄叶类具体养护结论门槛

`leaf_yellowing` 只代表黄化方向成立，不代表具体养护病因成立。

以下具体结论必须有对应正向上下文或更高特异事实：

| problem_key | 需要的正向事实示例 |
| --- | --- |
| `low_light` | `low_light_context`、徒长、新生长变弱 |
| `underwatering` | `watering_deficit_background`、干土萎蔫、叶片卷曲干脆 |
| `overwatering` | `watering_excess_background`、排水差、湿土仍萎 |
| `sunburn` | `recent_direct_sun_increase`、`sunburn_patch`、`leaf_bleaching` |
| `nitrogen_deficiency` | `fertilization_gap`、老叶先黄；整体均匀黄化只能作为弱线索，不能单独放行缺氮 |
| `iron_deficiency` | `yellow_new_leaves`、叶脉间失绿、长期缺肥/介质问题 |
| `nutrient_deficiency` | `fertilization_gap`、新叶/老叶黄化模式；整体均匀黄化只能作为弱线索，不能单独放行营养不足 |
| `root_stress` | 浇水异常、排水差、湿土仍萎、根区异常 |

如果只有 `leaf_yellowing`，且追问没有形成上述正向事实：

- 不允许硬输出某个具体养护结论；
- 若已无高价值问题可问，可以合法进入 `uncertain_output_ready`；
- `uncertain` 的原因应指向“缺少正向上下文证据”，而不是模型失败。

#### 4. 与最多两轮问询硬指标的关系

一页一题后，不再把“最多两轮问询”机械理解为硬截断。

新的停止条件应以诊断收益和证据门槛为准：

- 高价值问题已经耗尽；
- 正向问题级证据门槛已经满足；
- 高特异视觉事实已经按正式链路进入证据集合并满足快速收敛门；
- 继续提问只会重复确认、低价值泛化或增加误导；
- 已满足合法 `uncertain_output_ready` 的收口条件。

因此：

- 若已形成正向问题级证据，可输出最高分且满足门槛的具体结论；
- 若只有泛化视觉方向，没有正向上下文或高特异事实，应继续问高价值问题；
- 若高价值问题已耗尽，输出 `uncertain` 是合法收口；
- 不允许为了规避 `uncertain`，把最高 prior、genus baseline 或泛化 probe 候选包装成确定结论。

#### 4.1 收益驱动停止策略

一页一题后，系统不得再用“固定 2 轮”或“只要还有题就继续问”作为停止策略。

运行时必须先判断下一题是否仍有诊断收益，再决定是否继续进入 `await_follow_up`。

##### 4.1.1 必问层

以下问题属于 gate / 必问层，未覆盖前通常不得直接跳过：

- 当前症状模式的首要分流 gate；
- 可补齐 context guard 的问题；
- 能决定某个具体 problem 是否进入 output-eligible pool 的问题；
- 能把候选从一个 problem family 切到另一个 problem family 的问题。

##### 4.1.2 可停止层

若满足以下条件之一，允许停止追问：

- 具体 problem 已满足正向问题级证据门槛；
- context guard 已满足，且 top problem 有非泛化直接正向证据；
- 高特异视觉事实已通过正式链路进入 `observed_evidence_set` 并命中快速收敛；
- 剩余问题都无法改变 output eligibility、无法补齐 context guard、无法区分 top 与 runner-up。

##### 4.1.3 高价值下一题定义

下一题只有在至少满足以下一项时，才算高价值：

- 能补齐当前 top problem 的 context guard；
- 能改变某个候选 problem 的 output eligibility；
- 能显著区分 top problem 与 runner-up；
- 能把当前路径导向合法 `uncertain_output_ready`；
- 能确认或否定一个尚未进入正式证据集合的高价值视觉候选。

##### 4.1.4 低价值题不得阻塞 final

以下问题不得继续阻塞最终输出：

- 只问 `progression`、`distribution_scope`、`host_confirmation`、`underside_presence` 等泛化维度；
- 选项没有 `directProblemAdjustments`，也不会通过 `maps_to_symptom_key + value` 改变证据；
- 只影响解释、严重程度、护理建议、范围描述；
- 只是重复确认已经由视觉或问诊覆盖的事实。

若当前已满足结论门槛，遇到上述低价值题应直接 final；若尚未满足结论门槛且剩余问题都低价值，应进入合法 `uncertain_output_ready`，而不是继续问低收益问题。

##### 4.1.5 水肿 / 过湿样例

当视觉事实为 `edema`，且用户已确认水泡 / 鼓包形态后：

- 该答案可作为 `edema` 与 `overwatering` 的非泛化正向证据；
- 若后续候选题只是光照、分布、进展、叶背位置等低收益题，不应继续阻塞 final；
- 若需要继续追问，应优先问盆土久湿、浇水频率、根部异味 / 黑软根这类能直接补齐过湿或根腐上下文的问题。

#### 4.2 泛化 observed_probe 不构成具体结论正向证据

以下 observed probe 属于低特异、泛化观察维度：

- `distribution_scope`
- `progression`
- `host_confirmation`
- `underside_presence`
- 其他分布范围、进展速度、宿主确认、叶背/部位存在性等上下文确认

这些字段可以用于：

- 支持当前视觉方向继续追问；
- 帮助同 family 内候选排序；
- 判断某个问题是否值得继续问；
- 在 explanation 中解释不确定性。

但它们不能单独作为具体 problem 的正向证据门槛。

##### 禁止推理

- `underside_presence=yes` 不能单独推出红蜘蛛、蚜虫、介壳虫；
- `progression=spreading` 不能单独推出真菌或细菌病害；
- `host_confirmation=yes` 不能单独推出该植物常见问题；
- `distribution_scope=many_leaves` 不能单独推出浇水、光照、肥害或病害结论。

##### 正式规则

```text
泛化 observed_probe 只能低权重支持当前方向或触发继续追问；
具体 problem 进入 output-eligible pool 必须另有问题级正向证据或高特异正式视觉事实。
```

#### 4.3 红蜘蛛结论不得由黄白细点强行闭合

`yellow_speckling`、`stippling`、轻微黄白细点、点状失绿等视觉事实属于低特异线索。它们可以让系统进入刺吸式害虫分流，但不能单独形成 `spider_mites` 最终结论。

##### 红蜘蛛允许输出的正向门槛

`spider_mites` 进入 output-eligible pool 至少需要满足以下之一：

- 正式视觉证据中存在 `fine_webbing`、`mite_webbing` 或等价的高特异网丝 / 活动螨迹，并已通过 `formally_admitted -> observed_evidence_set`；
- 问诊答案形成非泛化、直接指向红蜘蛛的正向证据，例如 `pest_trace_type = mite_webbing`；
- 高特异性快速收敛规则已命中红蜘蛛方向。

##### 必须抑制红蜘蛛的分流答案

如果 `pest_trace_type` 或等价分流题回答为以下任一情况：

- 蓟马银白擦伤伴黑色排泄点；
- 蜜露 / 黏腻 / 煤灰层；
- 无虫害痕迹；
- 不确定 / 看不出；

则该回答不得被解释成红蜘蛛正向证据。若没有其他红蜘蛛高特异证据，系统应：

- 降低或抑制 `spider_mites`；
- 转向蓟马、蜜露型刺吸害虫、继续追问或合法 `uncertain`；
- 不得只凭 `yellow_speckling`、`stippling`、`underside_presence`、`distribution_scope`、`progression` 输出红蜘蛛。

#### 5. 验收样例

##### 5.1 宽泛虫咬候选被否定

输入：

- 单张全株图；
- AI 候选含 `holes_in_leaf`；
- admission 为 `candidate_retained`；
- 用户回答“没有被咬穿的洞”。

期望：

- `holes_in_leaf` 不进入正式证据；
- 不输出 `snails_slugs / caterpillars / chewing_insects`；
- 若无其他正向上下文证据，允许 `uncertain_output_ready`。

##### 5.2 黄叶但环境追问无正向证据

输入：

- 正式视觉证据只有 `leaf_yellowing`；
- 用户回答光照无明显变化、浇水无明显变化、非长期缺肥。

期望：

- 不输出 `low_light / nutrient_deficiency / root_stress` 等具体养护结论；
- 若没有其他高价值问题可问，允许 `uncertain_output_ready`。

##### 5.3 黄叶且低光背景成立

输入：

- 正式视觉证据含 `leaf_yellowing`；
- 用户回答最近位置更阴或光照明显变弱；
- 回流事实含 `low_light_context`。

期望：

- `low_light` 可以进入 output-eligible pool；
- 若评分最高，可输出 `low_light`。

##### 5.4 否认当前方向后不能无证据跳到其他 family

输入：

- 视觉方向为咀嚼损伤类；
- 用户否认“有被咬穿的洞”；
- 没有白粉、虫体、叶背虫群、浇水异常、光照骤变等其他正向证据；
- 仅存在 `distribution_scope=many_leaves` 或 `progression=spreading` 这类泛化 probe。

期望：

- 咀嚼损伤方向被真实抑制；
- 不自动跳到病害、刺吸害虫、光照或浇水 family；
- 若还有高价值问题，应继续追问；
- 若高价值问题已耗尽，允许 `uncertain_output_ready`。

##### 5.5 黄白细点但追问指向非红蜘蛛

输入：

- 正式视觉证据含 `yellow_speckling` 或 `stippling`；
- 无 `fine_webbing` / `mite_webbing` / 活动螨等高特异红蜘蛛证据；
- `pest_trace_type` 回答为蓟马银白擦伤伴黑色排泄点、蜜露/黏腻/煤灰层、无虫害痕迹或不确定。

期望：

- 不输出 `spider_mites`；
- 若答案指向蓟马或蜜露型虫害，可在有对应正向证据时进入相应方向；
- 若答案为无虫害痕迹或不确定，允许继续追问或 `uncertain_output_ready`；
- 不允许用视觉黄白细点覆盖用户的非红蜘蛛分流答案。

##### 5.6 黄叶蜜露分支不得重复复用泛化虫害类型题

输入：

- 正式视觉证据含 `yellow_speckling` 或 `leaf_yellowing`；
- 黄叶首问进入虫害线索；
- 用户先否定细网和蓟马银白擦伤；
- 后续仅确认或不确定是否有蜜露 / 黏腻。

期望：

- `sticky_honeydew` 分支只围绕黏腻、叶背或范围等与蜜露相关的可观察事实继续；
- 不得再次用 `pest_trace_type` 把 `mite_webbing / thrips_silver_black` 等已被否定或已分流过的答案重新拿回来；
- 如果蜜露相关事实也被否定或不确定，允许 `uncertain_output_ready`，不得强行输出红蜘蛛、蓟马、蚜虫或白粉虱。



## [S18] 诊断 batch / report 状态字段标注规则 2026-04-29

- 文件名：`diagnosis_batch_report_state_labeling_rule_20260429.md`
- 状态：非A类/补充或过程文件
- 类别：状态/字段治理
- 用途：batch/report 状态字段标注；await_follow_up 语义与审计
- SHA-256 前 16 位：`853a4a12bb9afa86`

---

### 诊断 batch / report 状态字段标注规则 2026-04-29

#### 1. 目标

本规则用于约束诊断 replay、batch、report、conclusion 等离线审计产物中的状态字段，避免把仍在问诊中的中间态误写成最终结论。

核心原则：

```text
await_follow_up 是中间态，不是 final outcome。
```

#### 2. `await_follow_up` 字段语义

当某条诊断结果仍处于 `await_follow_up`、`followup_required`、`question_pending` 或等价状态时：

- 可以记录当前 ranking 的最高候选；
- 可以记录当前 UI 应展示的候选方向；
- 可以记录下一题和继续追问原因；
- 不得把当前候选写入 `finalTitle`、`finalResult.displayName` 或任何表达“最终结论已形成”的字段。

#### 3. 字段命名边界

##### 允许字段

中间态允许使用：

- `pendingTopLabel`
- `currentTopLabel`
- `currentTopProblemKey`
- `pendingTopProblemKey`
- `currentRankingTopLabel`
- `awaitingFollowUpReason`
- `nextQuestionKey`

这些字段只表达“当前最高候选 / 待追问方向”，不是最终结论。

##### 禁止字段

中间态不得写：

- `finalTitle`
- `finalProblemKey`
- `finalOutcomeType`
- `finalResult`
- `finalDisplayName`

除非该条记录已经满足最终输出资格，并且状态已经进入 `final`、`closed` 或等价的终局状态。

#### 4. 正式规则

```text
只有 final-ready / final / closed 状态才能写 finalTitle。
await_follow_up 只能写 pendingTopLabel 或 currentTopLabel。
```

如果 batch/report 需要同时展示“当前 top1”和“最终结论”，必须拆成两个字段：

- `currentTopLabel`：当前 ranking top1，可出现在中间态；
- `finalTitle`：最终结论标题，只能出现在终局态。

#### 5. 审计要求

本地 replay / batch / report 生成逻辑至少应保证：

1. `await_follow_up` 记录中 `finalTitle` 为空、缺省或明确标注为未形成；
2. `await_follow_up` 的当前候选写入 `pendingTopLabel` 或 `currentTopLabel`；
3. conclusion 汇总不得把 `await_follow_up` 的当前 top1 统计为最终命中；
4. UI 或人工审计页面展示中间态时，文案必须区分“待追问方向”和“最终结论”。



## [S19] 问诊文案数据层治理规则 2026-04-29

- 文件名：`question_copy_data_layer_governance_20260429.md`
- 状态：非A类/补充或过程文件
- 类别：问诊/文案治理
- 用途：问诊文案来源、运行时职责、黄叶 gate 与必备字段
- SHA-256 前 16 位：`e5d0f876445bd9dd`

---

### 问诊文案数据层治理规则 2026-04-29

#### 结论

运行时不得把用户可见问诊题干、帮助文案、选项标题、选项说明作为主要来源硬编码在代码中。

静态文案必须来自数据层；动态文案必须来自数据层模板，并由运行时只负责填充变量。

#### 正式数据来源

- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_generation_engine` 仅作为模板审计资产和变量协议登记，不计入 formal runtime coverage。

#### 运行时职责

- 选择 `question_key` 或 `template_engine_rule_key`
- 构造模板变量上下文
- 渲染 `{{variable}}` 模板
- 保存渲染后的题干、选项和变量快照，供 review 回放

运行时不得新增完整中文题干或完整中文选项文案作为常规路径。

#### 必备字段

`question_library_v5_real`：

- `default_option_key`
- `ui_variant`
- `render_mode`
- `template_engine_rule_key`

`question_option_mapping_v5_real`：

- `option_description_user_cn`
- `display_order`
- `is_default`

`question_generation_engine`：

- `help_template_user_cn`
- `template_variables_json`
- `fallback_values_json`
- `render_policy`
- `option_template_json`

#### 黄叶 gate 规则

- 黄叶首层 gate 必须声明问题目的：黄叶原因复杂，需要先分流，避免后续问题跑偏。
- 黄叶首层 gate 的默认选项为 `care_context`。
- 黄叶养护 gate 使用 `single_select_accordion`。
- 黄叶养护 gate 选项必须覆盖浇水、光照、施肥、通风湿度。
- 养护选项的具体解释放在 `option_description_user_cn`，不塞进题干。
- 浇水等动态范围使用 `{{watering_reference}}`、`{{watering_help}}` 等变量，由属级养护数据和天气湿度上下文渲染。

#### 本次落地 SQL

`scripts/sql/question-data-layer-template-governance-20260429.sql`



## [S20] AI视觉诊断入口层数据结构与留存规范 v1.4（器官识别与产品辅助输入增补版）

- 文件名：`ai_visual_entry_data_structure_and_retention_spec_v1_4_full_consolidated.md`
- 状态：A类正式基线
- 类别：AI视觉入口
- 用途：视觉入口层数据结构与留存；器官槽位、AI symptom/canonical symptom 边界
- SHA-256 前 16 位：`a0a7451d898f585b`

---

### AI视觉诊断入口层数据结构与留存规范 v1.4（器官识别与产品辅助输入增补版）

> 说明：
>
> - 本文档基于《AI视觉诊断入口层数据结构与留存规范 v1》继续增补。
> - 本次增补目标：
>   - 吸收《植物症状识别系统架构 v1》中对症状链内部分层的启发
>   - 正式补入器官识别相关字段与结构
>   - 正式补入“产品侧输入设计辅助 AI 识别”的机制
>   - 将“用户按槽位上传不同器官图片”的做法，提升为入口层正式约束之一
>
> - 本文档继续遵循：
>
> # **基于上一版更新只能新增不可减少**

---

### 附录 A：症状链内部分层增补（本次新增，不替换原文）

#### A-1. 症状识别主链路内部应进一步拆层

在此前已明确：

- 植物身份主链路：百度植物识别 → taxonomy 命中直取
- 症状识别主链路：混元

的基础上，现进一步明确：

### **症状识别主链路内部也必须分层，不得把整图直接粗暴映射为最终 canonical symptom。**

当前推荐的内部层次为：

1. 图像质量层
2. 器官 / 部位识别层
3. 异常区域层（当前可弱实现）
4. AI symptom 候选层
5. canonical symptom 映射层
6. 准入 / follow-up / reject 层

补充说明：

- 这不是要求当前实现一步到位做检测 / 分割模型
- 而是要求数据结构和提示设计必须为这个方向预留接口
- 后续即使仍使用通用模型，也应尽量按这个层次组织输入与输出

---

#### A-2. AI symptom 与 canonical symptom 的边界进一步强化

新增正式说明：

### **AI symptom 仍然只是原始视觉证据层对象，不等于 canonical symptom。**

因此：

- 混元输出的只是候选视觉异常
- 不能把“模型看起来像什么”直接写成系统 symptom 真值
- 必须经过：
  - 器官约束
  - 图像质量约束
  - 映射规则
  - 准入 gate
  才能进入正式 evidence

---

#### A-3. follow-up 是准入层合法出口，不是补丁功能

新增正式说明：

对高歧义症状类型，follow-up 应被视为：

### **准入层的正式出口之一**

而不是：

- 模型没想好时的临时补丁
- 或 diagnosis 后面才追加的附属流程

也就是说：

- direct_admit
- followup_required
- reject_or_hold

这三者在入口层应当具有同等正式地位。

---

### 附录 B：器官识别与产品辅助输入增补（本次新增，不替换原文）

#### B-1. 产品侧输入设计是器官识别的正式辅助机制

新增正式裁决：

### **器官识别不只依赖模型视觉判断，也允许并鼓励由产品侧输入设计提供显式器官提示。**

这意味着：

- 器官识别既可以来自模型判断
- 也可以来自产品 UI 的上传槽位语义
- 在当前冷启动阶段，产品侧结构化输入提示可以显著提高识别稳定性

这不是“作弊”，而是：

### **把产品交互优势转化为 AI 识别稳定性的正当手段。**

---

#### B-2. 推荐的器官槽位上传设计

产品层可采用如下推荐结构：

##### 图 1
- 叶片图（leaf image）

##### 图 2
- 茎图（stem image）

##### 图 3
- 根 / 根颈图（root or stem-base image）

##### 图 4
- 全株图（whole-plant image）

##### 图 5（可选）
- 花 / 果 / 其他特写图

补充说明：

- 不要求每次都必须填满
- 但若用户按槽位上传，系统应视其为**强器官提示**
- 该提示可进入症状识别主链路的器官层，作为正式上游条件

---

#### B-3. 器官槽位提示的法律地位

新增正式边界：

### **产品侧器官槽位提示属于“结构化输入提示”，不是最终事实真值。**

它的地位高于：

- 模型在无提示情况下的自由猜测

但仍低于：

- 后续明确的人工纠正
- 高置信、反复一致的会话级证据

因此：

##### 允许
- 用作 prompt 约束
- 用作器官字段预填
- 用作 symptom 映射的约束条件
- 用作 follow-up 优先级提示

##### 不允许
- 直接跳过图像质量判断
- 直接跳过症状映射与准入
- 直接把某器官槽位上传等同于器官事实绝对真值

---

#### B-4. 器官提示优先级建议

当前推荐优先级如下：

##### 第一优先级
- 明确人工结构化输入提示（如上传槽位语义）

##### 第二优先级
- 模型对器官的高置信识别

##### 第三优先级
- 症状与器官的弱推断关系

这意味着：

### **在冷启动阶段，“图2是茎图”这种产品结构提示，应优先于模型自己猜“这更像叶片还是茎”。**

这是当前最务实也最稳的方案。

---

### 附录 C：字段级增补（本次新增，不替换原文）

#### C-1. 单图原始记录增加器官输入提示字段

在 `visual_raw_image_records` 中，建议新增：

- `input_slot_type`
  - leaf
  - stem
  - root
  - stem_base
  - whole_plant
  - flower
  - fruit
  - unknown
- `input_slot_order`
- `user_declared_organ_type`
- `user_declared_organ_confidence`
- `input_slot_label`

##### 说明
这些字段用于承接产品侧的器官槽位语义。  
它们不是模型输出，而是：

### **结构化用户输入提示**

---

#### C-2. 单图标准化结果增加器官字段组

在 `visual_normalized_image_results` 中，建议新增正式器官字段组：

- `primary_organ_type`
- `primary_organ_confidence`
- `organ_source`
  - ui_hint
  - model_detected
  - merged
  - unknown
- `multi_organ_detected`
- `organ_conflict_flag`
- `organ_resolution_reason`

##### 说明
这组字段用于明确回答：

- 这一张图当前主要按哪个器官解释
- 这个器官判断来自哪里
- 是否存在器官冲突

---

#### C-3. 增加异常区域可升级接口

在当前不强制检测 / 分割模型落地的前提下，仍建议在 `visual_normalized_image_results` 或未来独立区域表中预留：

- `region_count`
- `region_candidates_json`

其中每个 region candidate 建议最少包含：

- `region_id`
- `organ_binding`
- `bbox_json`（可空）
- `salience_score`
- `visibility_score`
- `region_note`

##### 说明
当前阶段即使只做“轻区域化”，也应给未来检测 / 分割能力留接口。  
否则后面升级时，数据结构会被迫大改。

---

#### C-4. topK symptom item 增加器官绑定字段

在 `topk_symptoms_json` 的每个 symptom item 中，建议新增 / 强化以下字段：

- `organ_type`
- `organ_binding_confidence`
- `organ_binding_source`
  - ui_hint
  - model_detected
  - merged
- `requires_organ_confirmation`

##### 说明
某些 symptom 的语义高度依赖器官。  
因此后续 canonical symptom 映射不得忽略器官绑定。

---

### 附录 D：接纳门槛矩阵增补（本次新增，不替换原文）

#### D-1. 症状接纳必须纳入器官约束

此前 v1 已写明 topK symptom 的最小接纳门槛。  
现在进一步补充：

##### topK symptom 若要进入 `formally_admitted` 或高质量 `candidate_retained`
除原有条件外，建议再满足至少其一：

1. `primary_organ_type` 已可靠确定
2. `organ_binding_confidence` 达标
3. 该 symptom 本身对器官不敏感
4. 该 symptom 被标记为允许弱器官条件准入

也就是说：

### **对器官敏感型 symptom，器官未明时应更保守。**

---

#### D-2. 高歧义症状类型默认更偏向 follow-up

新增正式建议：

以下症状类型默认更适合：
- `candidate_retained`
- `follow-up first`

而不是直接 `formally_admitted`：

- 黄叶类
- 轻微褪绿 / 发浅类
- 轻微斑点类
- 萎蔫 / 下垂类
- 泛褐化类
- 需要区分自然老化 / 环境应激 / 病理问题的类型

这一步是为了吸收此前“植物症状识别架构稿”中非常正确的一点：

### **不是所有 symptom 都应使用同样的准入策略。**

---

#### D-3. 器官槽位提示可降低 follow-up 成本，但不能取消 follow-up

若用户已通过产品槽位提供明确器官提示，则系统可以：

- 降低器官确认型 follow-up 的优先级
- 提高与该器官高度匹配 symptom 的映射稳定性

但不能因此：

- 跳过高歧义 symptom 的 follow-up
- 直接锁定 final outcome
- 忽略图像质量与冲突检查

---

### 附录 E：prompt 约束增补（本次新增，不替换原文）

#### E-1. prompt 应显式利用产品槽位语义

当前 prompt 设计必须吸收产品输入结构。  
例如当输入槽位已知时，应明确告诉模型：

- 这是叶片图，请优先从叶片 symptom 语义解释
- 这是茎图，请优先从茎 / 茎基部 symptom 语义解释
- 这是根 / 根颈图，请优先从根部相关异常语义解释
- 这是全株图，请优先用于整体状态、分布与补充判断

这可以显著降低：

- 器官串位
- symptom key 漂移
- 相邻类别误判

---

#### E-2. prompt 约束不等于结果越权

即使 prompt 已明确：
- 这是叶片图
- 这是茎图

模型仍然只能输出：

- 候选 symptom
- 图像质量
- pattern candidate
- route hint

不能因此越权输出：

- 最终 diagnosis
- 最终 outcome
- 最终 action policy

---

### 附录 F：对后续文档的启发性影响（本次新增，不替换原文）

本轮增补后，后续若继续推进文档链，应吸收以下变化：

#### F-1. 《AI视觉诊断入口层》主文档
后续版本应更明确写入：
- 症状链内部分层
- 产品侧器官提示是正式辅助机制

#### F-2. 《诊断结论层》
后续联动增补时，应明确：
- 器官槽位提示不是 outcome
- 器官识别结果不是 outcome
- route hint 与器官提示都属于入口层 / 流程层条件

#### F-3. 《诊断目标分层》
后续联动增补时，应明确：
- 器官提示与 identity entity 都不属于 problem taxonomy
- AI symptom 候选仍低于 canonical symptom 与 problem 层

---

### 本版状态说明

- 本版保留 v1 正文主体
- 仅通过附录 A～F 做只增不减增补
- 未对原有适用条款做删减




### ================================
### v1.4 新增附录开始（基于 v1.1 只增不减）
### ================================

> 说明：
>
> - 以下内容为《AI视觉诊断入口层数据结构与留存规范》在 **完整保留 v1.1 原文与附录 A～F** 的前提下，继续新增的附录内容。
> - 这些新增附录共同构成：
>
> # **《AI视觉诊断入口层数据结构与留存规范 v1.4（最终完整增补版，基于 v1.1 只增不减）》**
>
> - 也就是说：
>   - 上文全部内容 = v1.1 原文，原样保留
>   - 下文附录 G～N = 在 v1.1 基础上的新增增补
>
> - 本段以下内容不替换上文，不删改上文，不重排上文，只做新增。

---

### 附录 G：中文一等公民规则增补（本次新增，不替换上文）

#### G-1. 中文是一等公民

从本附录开始，本文件线及其后续增补统一执行：

### **中文是一等公民**
### **中文主名优先**
### **英文仅作辅助标记**
### **字段名不等于概念主名**

---

#### G-2. 中文主名优先解释规则

上文 v1.1 原文与附录中若存在以下情况：

- 英文概念在语义上占主导
- 章节标题偏英文思维
- 字段名被误读为正式概念名

则从本附录开始，一律按：

### **中文主名优先解释**
### **英文只用于辅助映射、实现标识、字段名说明**

---

#### G-3. 核心概念中文主名对照

以下核心概念，从本附录开始统一按中文主名表达：

- `AI symptom` → **AI症状候选**
- `canonical symptom` → **规范症状**
- `follow-up` → **追问**
- `reject_or_hold` → **拒绝或暂缓**
- `visual_raw_image_records` → **单图视觉原始记录**
- `visual_normalized_image_results` → **单图视觉标准化结果**
- `primary_organ_type` → **主器官类型**
- `organ_source` → **器官来源**
- `pattern candidate` → **模式候选**
- `route hint` → **路由建议**
- `formally_admitted` → **正式接纳**
- `candidate_retained` → **候选保留**
- `explanation_only` / `explanation_retained` → **仅解释保留**
- `prompt` → **提示词**

---

#### G-4. 章节与表述的阅读规则

阅读上文 v1.1 原文时，应统一采用以下理解方式：

##### 规则 1
先读中文含义，再看英文标记。

##### 规则 2
若中文与英文在直觉上产生主从冲突，以中文主名为准。

##### 规则 3
英文字段名仅服务于：
- SQL 制表
- 程序实现
- JSON 结构
- API / 模型输出映射

不得把英文字段名反向提升为业务概念主名。

---

#### G-5. 后续版本写作规则

从本附录开始，本文件线后续所有版本必须遵守：

##### 必须
- 章节标题中文优先
- 概念定义中文优先
- 结论表达中文优先

##### 允许
- 括号中保留英文辅助名
- 保留英文字段名
- 保留英文枚举值

##### 不允许
- 再出现英文概念压过中文主表达
- 再出现用英文术语代替正式业务概念主名
- 再出现“文档叙述语言像字段名说明书”这种写法

---

### 附录 H：视觉调用批次定义增补（本次新增，不替换上文）

#### H-1. 必须新增正式对象：视觉调用批次

##### 中文主名
视觉调用批次

##### 英文辅助名
visual call batch

##### 定义
同一轮次内、由一次用户提交或一次系统触发所形成的、用于生成一组视觉入口结果的统一处理单元。

---

#### H-2. 视觉调用批次的最小规则

##### 规则 1
一次用户提交多张图，默认产生一个新的视觉调用批次。

##### 规则 2
一个视觉调用批次下可以包含：
- 多条单图原始记录
- 多条单图标准化结果
- 一个调用聚合结果
- 一组接纳判定记录

##### 规则 3
身份链与症状链可以共享同一个视觉调用批次 ID，  
但必须保留各自独立的子结果对象。

##### 规则 4
用户补图后，必须产生新的视觉调用批次。  
不得把补图结果回写为旧批次结果。

##### 规则 5
同一轮次内允许存在多个视觉调用批次。

---

#### H-3. 推荐新增字段

建议在相关对象中统一增加：

- `visual_call_batch_id`

##### 适用对象
- 植物身份解析记录
- 单图视觉原始记录
- 单图视觉标准化结果
- 视觉调用聚合结果
- 视觉接纳判定记录
- 视觉监督记录

---

### 附录 I：当前会话主身份结果裁定规则增补（本次新增，不替换上文）

#### I-1. 必须新增正式裁定规则：当前会话主身份结果状态机

上文 v1.1 已有：
- `taxonomy_match_status`
- `identity_resolution_status`
- `is_current_primary_identity`

但此前仍缺正式状态机。  
本附录新增：

### **当前会话主身份结果裁定规则**

---

#### I-2. 裁定优先级

多条身份解析记录并存时，优先级必须按以下顺序裁定：

### `matched` > `weak_matched` > `unresolved`

##### 含义
- `matched` 可以覆盖 `weak_matched` 与 `unresolved`
- `weak_matched` 可以覆盖 `unresolved`
- `unresolved` 不得覆盖 `matched` 或 `weak_matched`

---

#### I-3. 同等级覆盖规则

当两条身份解析记录等级相同，是否覆盖应按以下顺序判断：

##### 第一判断
图像质量 / 主体完整性 / 全株可见性更高者优先

##### 第二判断
更晚的视觉调用批次可覆盖更早批次，但必须记录覆盖原因

##### 第三判断
若两者质量相近且无显著优势，则保持旧主身份结果，避免频繁抖动

---

#### I-4. 人工修正优先级

### **人工确认后的主身份结果优先级最高。**

一旦某条身份解析记录被人工确认，则：

- 其优先级高于自动 `matched`
- 后续自动 `weak_matched` / `unresolved` 不得覆盖
- 后续自动 `matched` 若想覆盖，也必须进入人工复核或特殊治理路径

---

#### I-5. 被覆盖记录的留痕规则

旧主身份结果被覆盖后：

- 必须保留历史记录
- `is_current_primary_identity` 改为 false
- 必须记录：
  - 覆盖批次
  - 覆盖原因
  - 覆盖时间

##### 建议新增字段
- `superseded_by_resolution_id`
- `superseded_reason`
- `superseded_at`

---

#### I-6. 弱身份主结果的用途边界

### **弱身份主结果默认不参与 diagnosis baseline 的精细宿主挂接。**

##### 允许
- explanation
- question 辅助
- 弱宿主背景提示
- 宿主先验轻微偏置（仅在风险可控时）

##### 不允许
- 直接精确挂接 `plant_problem_profiles`
- 直接强推问题先验
- 直接锁定 diagnosis baseline 中的细粒度宿主对象

---

### 附录 J：问题回流纠正作用域增补（本次新增，不替换上文）

#### J-1. 问题回流纠正不能再只写成一个笼统字段

上文 v1.1 仅有：
- `was_question_corrected`

这还不够。  
本附录新增：

### **问题回流纠正作用域**

---

#### J-2. 建议新增字段：`question_correction_scope`

##### 中文主名
问题回流纠正作用域

##### 推荐字段名
`question_correction_scope`

##### 推荐枚举值
- `organ`
- `symptom`
- `pattern`
- `route`
- `admission`
- `identity_hint_only`
- `multiple`
- `none`

---

#### J-3. 建议增加更细粒度的监督字段

在 `visual_supervision_records` 中，建议新增：

- `question_corrected_organ`
- `question_corrected_symptom_key`
- `question_corrected_pattern_candidate`
- `question_corrected_route_hint`
- `question_corrected_admission_result`
- `question_corrected_identity_hint_only`

---

#### J-4. 问题回流纠正的边界

##### 问题回流可以纠正
- 器官绑定解释
- 规范症状映射
- 模式候选合法性
- 路由建议合理性
- 接纳结果是否过宽 / 过窄
- 身份链的弱提示解释

##### 问题回流不能直接做
- 伪造新的 Taxonomy 主对象
- 直接越层写 final outcome
- 直接把 AI症状候选 改写成 problem taxonomy 对象

---

### 附录 K：路由建议主动作字段增补（本次新增，不替换上文）

#### K-1. 路由建议不能只是一组并列布尔值

上文 v1.1 已有：

- `prefer_retake_path`
- `prefer_uncertain_path`
- `prefer_question_stability`
- `prefer_question_progression`
- `prefer_question_host_confirmation`

这些都保留。  
但为了实现不散，本附录新增一个总字段：

### **路由建议主动作**

---

#### K-2. 推荐新增字段：`route_primary_action`

##### 中文主名
路由建议主动作

##### 推荐字段名
`route_primary_action`

##### 推荐枚举值
- `retake_first`：优先补图
- `ask_first`：优先提问
- `uncertain_prepare`：优先进入不确定预备
- `standard_flow`：进入标准流程
- `hold_for_review`：暂缓并等待审查（可选）

---

#### K-3. 主动作字段的意义

它的作用是：

- 在多个 route hint 同时为 true 时，提供统一主动作
- 避免实现层对多个并列布尔值各自解释
- 把路由建议真正收成可执行的流程排序结果

补充说明：

- `route_primary_action` 仍然只是流程层主动作
- 它不是 diagnosis
- 不是 outcome
- 不是 final output

---

### 附录 L：TopK 稳定性与模式派生状态增补（本次新增，不替换上文）

#### L-1. TopK 稳定性应正式进入结构层

TopK 不只是模型输出，还应成为治理对象。  
建议在单图标准化结果或聚合结果中新增：

- `top1_stability_score`
- `top3_stability_score`
- `long_tail_noise_flag`

##### 含义
- `top1_stability_score`：Top1 稳定性分数
- `top3_stability_score`：Top3 覆盖稳定性分数
- `long_tail_noise_flag`：长尾候选噪声标记

---

#### L-2. 模式候选与正式模式派生链的接口进一步显式化

建议增加字段：

- `pattern_derivation_status`

##### 推荐枚举值
- `not_eligible`
- `eligible`
- `derived`
- `rejected_after_check`

---

### 附录 M：全株图职责与 SQL 映射责任增补（本次新增，不替换上文）

#### M-1. 全株图职责进一步写死

### **全株图默认更适合承担“整体状态、分布、扩展性、身份链增稳”职责，而不是承担精细局部症状主判。**

##### 全株图优先支持
- 身份链稳定命中
- 病变分布判断
- 新旧叶覆盖范围判断
- 是否多器官受影响判断
- 是否需要补局部图判断

##### 全株图默认不优先承担
- 微小局部病斑的精细主判
- 细粒度局部 symptom key 锁定

---

#### M-2. 最终 SQL 制表素材必须经过映射、归一、审查

上文 v1.1 已写死：

### **`plant_catalog.csv` + `plants_v13_user_friendly_full_v7.xlsx` 是最终 SQL 制表的素材来源**

本附录进一步补充：

### **这两份素材不是直接入库真值，而是必须经过映射、归一、审查后进入最终 SQL 制表。**

---

### 附录 N：核心字段中文对照增补（本次新增，不替换上文）

#### N-1. 建议后续补一份字段中文对照表

为继续强化“中文是一等公民”，建议后续在本规范或附录中补充一张正式对照表：

| 字段名 | 中文主名 | 说明 |
|---|---|---|
| visual_call_batch_id | 视觉调用批次 ID | 统一一批视觉处理结果 |
| route_primary_action | 路由建议主动作 | 流程层主动作 |
| question_correction_scope | 问题回流纠正作用域 | 问题回流影响哪一层 |
| identity_resolution_status | 身份解析状态 | 身份链状态，不是 outcome |
| pattern_derivation_status | 模式派生状态 | 候选进入正式模式链的状态 |

---

### 本文件版本状态说明

- 上文全部内容 = 你上传并指定为基准的 v1.1 原文，原样保留 fileciteturn3file0
- 本文件新增内容 = 附录 G～N
- 二者合并后，共同构成：

### **《AI视觉诊断入口层数据结构与留存规范 v1.4（最终完整增补版，基于 v1.1 只增不减）》**



## [S21] 视觉多图业务融合改造计划 v1

- 文件名：`视觉多图业务融合改造计划_v1.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉入口
- 用途：多图业务融合改造目标、范围、聚合与留痕
- SHA-256 前 16 位：`9009324dfce9af40`

---

### 视觉多图业务融合改造计划 v1

> 状态：执行计划草案  
> 适用范围：`diagnose-http` 视觉诊断链、视觉运行时持久化链、双模型适配层、聚合层、接纳层、诊断桥接层  
> 依据文档：
> - 《多图业务融合与当前阶段自有模型技术路线裁决_v1_完整最终版》
> - 《多图业务融合与双模型路线联动增补规范_v1_完整最终版》
> - 当前正式基线文档清单 v1.2 修正版

---

#### 1. 计划目标

本计划的目标不是继续在当前“单图 symptoms 直喂 diagnosis”的实现上做补丁，而是把视觉诊断链正式改造成符合新基线的运行时结构：

`单次提交 -> visual_call_batch -> 单图模型适配 -> visual_normalized_image_result -> visual_call_aggregate_result -> admission -> evidence -> diagnosis`

本轮改造的核心要求如下：

1. 多图能力必须成为业务层正式能力，而不是 prompt 层偶然能力。
2. 混元与后续 HF AutoTrain 必须共享统一输出 contract。
3. diagnosis 只能消费 admitted visual evidence，不直接消费模型 raw output。
4. 必须支持重复视角抑制、跨器官主从、质量不足优先补图、跨批次显式 supersede。
5. 在工程实现上优先复用现有 `identify-http` 已落地的视觉批次写链，而不是另起一套平行体系。

---

#### 2. 当前状态判断

当前项目已经具备以下可复用基础：

1. 已有 `visual_call_batches / visual_raw_image_records / visual_normalized_image_results / visual_admission_records` 相关表与落库先例。
2. `identify-http` 已经形成视觉批次写链原型。
3. `diagnose-http` 已经具备视觉症状抽取、会话持久化、规则诊断主链、保守 uncertain 降级逻辑。
4. 下游 diagnosis engine 本身不需要推翻，只需要改造其输入来源和桥接逻辑。

当前主要缺口如下：

1. `diagnose-http` 仍是单图直连式视觉入口。
2. 当前视觉输出 contract 过窄，只覆盖 `symptoms / uncertain_symptoms / image_quality`。
3. 诊断链没有正式的聚合层。
4. 诊断链没有正式的 admission 判定层。
5. `latestVisualCallBatchId` 已经存在于 session，但诊断链尚未真实创建和维护 visual batch。
6. 尚未建立面向双模型的统一视觉适配层。

---

#### 3. 改造范围

##### 3.1 本轮纳入改造

1. `cloudfunctions/diagnose-http`
2. 诊断侧视觉运行时持久化逻辑
3. 视觉模型适配层
4. 多图聚合层
5. admission / evidence 桥接层
6. 诊断侧自动化 smoke 与样本验证脚本
7. 相关 README / 落地文档 / 执行记录

##### 3.2 本轮明确不做

1. 不在本轮直接上线 HF AutoTrain 主模型接管。
2. 不做原生多图训练。
3. 不在本轮引入复杂训练闭环中枢。
4. 不把视觉模型改造成最终 diagnosis 生成器。
5. 不在本轮扩写前端大规模视觉交互重设计。

---

#### 4. 目标架构

##### 4.1 统一分层

本轮改造后，视觉链路应拆成以下层：

1. **请求层**
   - 接收单次提交、多图、器官槽位、补图意图、图像顺序等输入。

2. **批次层**
   - 创建 `visual_call_batch`
   - 记录 session、round、trigger_source、image_count、batch_status

3. **模型适配层**
   - `hunyuan_visual_adapter`
   - 后续预留 `hf_autotrain_visual_adapter`
   - 输出统一 raw result 与 normalized result

4. **单图标准化层**
   - 统一产出 `visual_normalized_image_result`
   - 冻结器官、质量、可分析性、症状候选、route hints、suggested followup capture、admission readiness

5. **多图聚合层**
   - 生成 `visual_call_aggregate_result`
   - 执行重复视角归并、跨器官支持整理、质量汇总、补图建议汇总

6. **接纳层**
   - 按 admitted / retain_only / cautious 规则决定哪些对象可以进入 diagnosis 主链

7. **诊断桥接层**
   - 把 admitted 结果投影成 diagnosis 可消费的 visual evidence / observed symptoms 输入

8. **diagnosis 层**
   - 保留现有规则诊断主链

##### 4.2 统一对象

本轮必须冻结的对象：

1. `visual_call_batch`
2. `visual_raw_image_record`
3. `visual_normalized_image_result`
4. `visual_call_aggregate_result`
5. `visual_admission_record`
6. diagnosis 可消费的 admitted visual evidence 映射

---

#### 5. 执行阶段

#### 阶段 A：冻结 contract 与诊断侧视觉运行时入口

##### 目标

先把诊断侧视觉入口从“直接拿 symptoms”升级成“先形成 batch，再处理视觉结果”。

##### 任务

1. 定义诊断侧统一 `visual_normalized_image_result` 字段 contract。
2. 定义诊断侧统一 `visual_call_aggregate_result` 字段 contract。
3. 明确 `observedSymptoms` 在诊断链中的新语义：
   - 不再等于 raw model output
   - 改为 admitted 后的视觉输入事实
4. 抽离 `hunyuan_visual_adapter`。
5. 停止在 `app.js` 中直接调用“图片 -> symptoms”旧桥。

##### 输出物

1. 视觉模型适配层代码骨架
2. 统一 normalized / aggregate 对象定义
3. 诊断视觉入口改造说明文档

##### 验收口径

1. 诊断入口能够创建真实 `visual_call_batch_id`
2. 单图与多图输入都先进入统一批次流程
3. 旧的单图直连入口不再是主路径

---

#### 阶段 B：复用现有视觉批次写链，补齐诊断侧逐图落库

##### 目标

让 `diagnose-http` 与 `identify-http` 共享同一类视觉运行时留痕结构。

##### 任务

1. 复用或抽共用 `visual_call_batches` 写入逻辑。
2. 在诊断链写入 `visual_raw_image_records`。
3. 在诊断链写入 `visual_normalized_image_results`。
4. 在诊断链写入 `visual_admission_records`。
5. 把 session 的 `latest_visual_call_batch_id` 与真实 visual batch 挂上。

##### 输出物

1. 诊断侧视觉运行时持久化模块
2. 统一的 batch / raw / normalized / admission 落库实现
3. 诊断链与 session 的 batch 关联闭环

##### 验收口径

1. 任意一次诊断 start 都可在数据库里追到对应 visual batch
2. 每张图都存在 raw / normalized 记录
3. session 上的 `latest_visual_call_batch_id` 不再是空挂字段

---

#### 阶段 C：实现多图聚合层

##### 目标

将“多张图上传”正式升级为“多图业务融合”，而不是简单把第一张图送模型。

##### 任务

1. 新增聚合器，生成 `visual_call_aggregate_result`
2. 落地以下规则：
   - 重复视角抑制
   - 同器官多点支持有限增强
   - 跨器官主从
   - 聚合质量与 analyzability 汇总
   - 建议补图合并
   - route hints 聚合
3. 写入 `visual_call_aggregate_results`
4. 为后续 supersede 预留批次覆盖字段

##### 输出物

1. 视觉聚合器模块
2. 聚合结果落库逻辑
3. 多图规则单元测试 / smoke 样本验证

##### 验收口径

1. 多图输入不再只取第一张
2. 同批次能输出聚合结果对象
3. 相同局部重复视角不会线性累加支持度
4. 关键器官缺失时优先补图或保守降级

---

#### 阶段 D：实现 admission 与 diagnosis 桥接

##### 目标

把聚合候选层与 diagnosis 主链解耦，保证 diagnosis 只吃 admitted 结果。

##### 任务

1. 新增 admission 判定器。
2. 明确以下边界：
   - admitted
   - cautious
   - retain_only
3. route hints 只进流程层，不进入事实层。
4. 由 admission 结果生成 diagnosis 可消费的 visual evidence 输入。
5. 调整 `runDiagnosisRound()` 上游输入，不再直接消费 raw model symptoms。

##### 输出物

1. admission 判定模块
2. diagnosis 桥接层
3. 新版 `observedSymptoms` / admitted visual evidence 映射逻辑

##### 验收口径

1. diagnosis engine 不再直接吃模型原始输出
2. retained 候选不会污染 diagnosis
3. admitted 视觉事实可解释、可追溯到 batch 与 image

---

#### 阶段 E：补图与跨批次 supersede 机制

##### 目标

让“补图”变成正式增量能力，而不是“重新开始诊断”的临时替代。

##### 任务

1. 允许 follow-up 或新一轮视觉提交形成新的 batch。
2. 记录 supersede target、superseded_by_batch_id、supersede reason。
3. 支持局部器官覆盖，不做整批无差别抹除。
4. 保持旧批次可追溯。

##### 输出物

1. 补图批次机制
2. supersede 规则实现
3. 跨批次视觉证据追溯说明

##### 验收口径

1. 新批次覆盖行为可追溯
2. 非目标器官旧证据不会被误删
3. 结果层能说明当前采用的是哪个视觉批次

---

#### 阶段 F：双模型过渡预留与 shadow compare

##### 目标

在不影响主链稳定性的前提下，为后续 HF 接入做好适配层准备。

##### 任务

1. 定义 `source_model_provider / source_model_name` 统一字段。
2. 预留 `hf_autotrain_visual_adapter` 接口。
3. 允许 shadow compare，但不允许污染主链。
4. 形成混元主链、HF 对照链的离线比对口径。

##### 输出物

1. 双模型适配接口约束
2. shadow compare 数据留痕方案
3. 后续 HF 接入说明

##### 验收口径

1. 切换模型来源不需要重写 diagnosis 主链
2. shadow 结果不会影响 admitted 主结果

---

#### 6. 代码改造落点

##### 6.1 必改模块

1. `cloudfunctions/diagnose-http/app.js`
2. `cloudfunctions/diagnose-http/utils/llm.js`
3. `cloudfunctions/diagnose-http/utils/diagnosis-parser.js`
4. `cloudfunctions/diagnose-http/services/session-service.js`
5. 诊断侧新增视觉 runtime / aggregate / admission 模块
6. 终端 smoke 与视觉样本验证脚本

##### 6.2 可复用模块

1. `cloudfunctions/layer/utils/identify-runtime.js`
2. 现有 diagnosis engine 主体
3. 现有 uncertain 保守降级逻辑
4. 现有 session / ranking / result 对外接口框架

---

#### 7. 数据与表使用原则

本轮以新基线表为准，优先使用或对齐以下对象：

1. `visual_call_batches`
2. `visual_raw_image_records`
3. `visual_normalized_image_results`
4. `visual_call_aggregate_results`
5. `visual_admission_records`
6. `diagnosis_sessions.latest_visual_call_batch_id`

执行原则：

1. 不新造平行表。
2. 不为混元和 HF 分两套业务表。
3. 统一通过 `visual_call_batch_id` 做主追踪锚点。
4. diagnosis 侧事实输入必须可回溯到 batch、image、provider。

---

#### 8. 测试与验收计划

##### 8.1 单元与集成

1. 单图输入
2. 多图同器官重复视角
3. 多图跨器官支持
4. 质量不足 / analyzability 低
5. 无稳定可见症状
6. retain_only 候选不进入 diagnosis
7. admitted 结果进入 diagnosis
8. 补图 supersede

##### 8.2 样本 smoke

样本维度至少覆盖：

1. `healthy`
2. `yellowing`
3. `brown_spots`
4. `chewing_damage`
5. 同株多图、同器官重复角度、多器官混合图

##### 8.3 数据验收

每次 smoke 后必须检查：

1. 是否生成 `visual_call_batch`
2. 是否写入逐图 raw / normalized
3. 是否生成 aggregate
4. admission 结果是否与 diagnosis 输入一致
5. session 上的 latest batch 是否正确

---

#### 9. 风险与控制

##### 9.1 主要风险

1. 在旧 `observedSymptoms` 语义上继续叠功能，导致后续重复拆改。
2. 聚合规则写进 diagnosis engine，导致视觉层与诊断层耦合过深。
3. 混元输出过于自由，导致标准化映射层不稳定。
4. batch 落库不完整，后续无法做 review / supersede / compare。
5. 过早引入 HF 主链切换，扩大变量面。

##### 9.2 控制策略

1. 先冻结 contract，再改主链。
2. 聚合与 admission 必须放在 diagnosis 前。
3. 统一复用现有视觉 runtime 落库模式。
4. 先保证混元主链稳定，再做 HF shadow。
5. 每阶段都用真实图片 smoke 验证，不只做静态代码通过。

---

#### 10. 最终执行顺序

建议严格按以下顺序推进：

1. 冻结诊断侧视觉 contract
2. 抽视觉模型适配层
3. 接入诊断侧 batch / raw / normalized 落库
4. 实现 aggregate
5. 实现 admission
6. 重接 diagnosis 桥
7. 打通补图 supersede
8. 接入双模型 shadow compare

---

#### 11. 本计划的执行口径

本计划采用以下总口径：

1. 以新文档为准，不继续维护旧的单图直连诊断思路。
2. 以最小化改动原则保留 diagnosis 主链，但明确重构诊断视觉入口与中间层。
3. 以现有表和现有 runtime 原型为基础推进，不做平行体系。
4. 以混元为当前主识别源，HF 只做后续适配预留和灰度比对准备。
5. 所有阶段性输出都继续文档化到 `docs` 目录。

---

#### 12. 计划完成定义

当满足以下条件时，本计划视为完成：

1. 诊断侧单图 / 多图都统一进入 visual batch 主线。
2. 诊断侧拥有真实的 normalized / aggregate / admission 三层对象。
3. diagnosis 只消费 admitted visual evidence。
4. 多图重复视角、跨器官主从、质量不足补图、跨批次 supersede 已有正式实现。
5. 混元与 HF 可以通过统一适配层接入，而不改 diagnosis 主链。
6. 有一套可复跑的真实样本 smoke 验收脚本与结果文档。




## [S22] 视觉 prompt 与追问关联守卫规则 v1

- 文件名：`视觉prompt与追问关联守卫规则_v1.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉入口/追问
- 用途：多图 prompt、location_key 池收窄、追问承接、单题问诊守卫
- SHA-256 前 16 位：`c75a158e521a5beb`

---

### 视觉 prompt 与追问关联守卫规则 v1

#### 1. 目的

本规则用于约束多图植物诊断中的两类高频偏差：

1. 视觉 prompt 未利用器官槽位与多图上下文，导致模型跨器官硬映射。
2. 追问阶段未优先承接已观察到的视觉形态，导致相似但未观察到的 symptom 抢占问题入口。

本规则属于 `visual evidence -> question_queue` 之间的正式守卫层。

#### 2. 视觉 prompt 约束

##### 2.1 多图场景必须按单图标准化执行

每次视觉标准化只允许分析当前图片，但必须带入当前图片在整组病例中的业务语义，包括：

- `inputSlotType`
- `inputSlotLabel`
- `userDeclaredOrganType`
- `inputSlotOrder`
- `totalImageCount`
- `caseSlotSummary`

不得把其他图片可能存在的器官特征投射到当前图。

##### 2.2 symptom 候选池必须按 `location_key` 收窄

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

##### 2.3 池外异常必须留痕，不得硬映射

若模型看到了明显异常，但该异常不在当前 `location_key` 池内：

- 必须写入 `out_of_pool_symptom_candidates`
- 不得强行映射到其他器官的 `symptom_candidates`

池外候选仅用于留痕和后续知识层完善，不得直接进入正式证据链。

#### 3. 追问关联守卫

##### 3.1 已观察到的视觉形态优先于相似形态

当 `observed_evidence_set` 或正式 `observedSymptoms` 中已经存在某个视觉 symptom 时：

- 其对应确认题必须优先于相似 symptom 的题目进入 `question_queue`
- 不允许因为“overlap penalty”把直接观察到的目标 symptom 题压到后面

##### 3.2 同部位同形态族的替代 symptom 题必须阻断

若系统已经选中了某个已观察 symptom 的确认题，则后续问题中不得再加入满足以下条件的替代 symptom 题：

- `location_key` 相同
- `pattern_key` 相同
- `distribution_key` 相同，或其中任一侧为空
- `target_symptom_key` 不同

该规则用于阻断“黑斑扩散 -> 褐斑带黄晕”这类同形态族抢题问题，也适用于其他部位的同类偏差。

##### 3.3 高特异性 zero-follow-up symptom 不得进入 question_queue

对于已被正式定义为 `zero_follow_up` 的高特异性视觉证据：

- 不得再生成对应 symptom 的 question
- 应直接走快速收敛或正式输出

当前至少包含：

- `scale_shells`
- `aphids_visible`
- `powder_white`

说明：

- `fine_webbing` 属于高特异性快速收敛，但正式层级为 `single_confirmation`，不属于 `zero_follow_up` 阻断名单。

#### 4. 真实场景解释原则

追问的合理性必须满足以下要求：

1. 与当前已观察到的图像事实一致。
2. 与用户正常人类理解一致，不得跨器官、跨形态强跳。
3. 与当前 top problem 的信息增益匹配，不能只因 problem 相关而忽略 symptom 事实。
4. 若只是低置信、未准入的视觉候选，可先确认是否真实存在；若已经是高置信正式视觉事实，不得再问“是否看到这个现象”，只能追问会改变分流的隐藏属性或上下文。

#### 5. 单题问诊与视觉事实分层规则

##### 5.1 每轮只允许一个活跃问题

正式诊断流每个 round 只允许向用户展示一个活跃问诊问题：

- 后端 `question_queue.activeItemCount` 不得超过 1
- 前端不得把同一轮多个问题并列展示
- 用户回答当前问题后，再进入下一轮重新排序和重建候选问题

该规则用于避免同一方向的问题一次性锁死用户，尤其是 `holes_in_leaf`、`chewed_edges` 等视觉形态被连续追问成单一虫害路径。

##### 5.2 视觉事实不得直接等同于病因

当视觉证据已经落到某个形态 symptom 时，追问只能补充能改变分流的非视觉或半视觉属性，不得把形态事实直接写成病因事实。

示例：

- `叶片穿孔` 只能说明存在组织缺损，不直接等同于虫害。
- `叶缘缺刻` 只能说明边缘组织缺损，不直接等同于被取食。
- 若需要判断虫害方向，应追问虫体、虫粪、黏液痕迹、新鲜啃咬边缘等更直接线索。

##### 5.3 环境类问题必须转成用户可回答的自然选项

浇水、光照、施肥类问题不得使用抽象比较句或不成句的问题。问题必须给出明确时间窗口和自然语言选项：

- 浇水优先使用“最近 2 周”“1-2 天一次 / 3-9 天一次 / 10 天以上一次 / 不确定”等数字区间表达。
- 光照优先使用“最近 1-2 周”“每天直晒 0-1 小时 / 3 小时以上 / 基本没变 / 不确定”等数字区间表达。
- 施肥优先使用“最近 1 个月”“近 2 个月 0 次 / 近 1 个月 1 次薄肥 / 近 1 个月 2 次以上或重肥换盆 / 不确定”等数字区间表达。

这些回答后续可与 `genus_care_profiles` 的属级养护基线联动，但问句本身必须先保证用户可理解、可选择。

#### 6. 实现层要求

实现层至少需要具备以下守卫：

- prompt 层：器官槽位上下文 + `location_key` 池收窄
- parser / adapter 层：`out_of_pool_symptom_candidates` 留痕；当模型返回旧长 schema 或截断 JSON，但 `symptom_candidates` / `out_of_pool_symptom_candidates` 数组已经完整出现时，必须尽量 salvage 已完整字段，不得直接把本轮视觉证据清空
- selector 层：direct observed target 优先、相似形态题降权或阻断
- diagnosis engine 层：已选 seed question 对同形态族 sibling question 的二次阻断
- response contract 层：`questions/followUps` 输出给前端前必须裁剪为 1 个活跃问题
- frontend 层：问诊展示采用单题卡片，答案选项纵向排列

#### 6.1 视觉形态到追问分流的第一轮正式维度

结构缺损、刺吸式害虫弱线索、水肿样鼓包三类视觉事实必须先进入分流追问，不得直接闭合到病因：

- `structural_cause`：适用于 `holes_in_leaf`、`chewed_edges`、`skeletonized_leaves` 等结构缺损。首问区分虫害活动痕迹、病斑干枯脱落、机械/旧伤。
- `pest_trace_type`：适用于 `yellow_speckling`、`stippling`、`silver_streaks`、`fine_webbing`、`sticky_honeydew`、`leaf_curl`、`leaf_twist` 等刺吸式害虫或非虫害可混淆线索。首问区分细网/极小活动点、银白擦伤伴黑色排泄点、蜜露/黏腻/煤灰层、无虫害痕迹。
- `edema_bump_stage`：适用于 `edema`、`blister_like_bumps` 等鼓包/水泡样线索。首问区分透明水泡、褐色木栓化结痂、平面斑点。

这三类分流题的答案可以产生 `directProblemAdjustments`，但不能把单一视觉形态直接当作病因结论。

#### 6.2 `pest_trace_type` 答案必须真实分流刺吸害虫方向

`yellow_speckling`、`stippling`、`silver_streaks` 这类点状失绿 / 银白擦伤弱线索，只能说明“刺吸式害虫或非虫害可混淆方向需要分流”，不能默认等同于红蜘蛛。

`pest_trace_type` 的答案必须按语义真实约束后续 problem：

- `mite_webbing` / `fine_webbing` / 细网或极小活动点：可以强化红蜘蛛方向；
- `thrips_silver_black` / 银白擦伤伴黑色排泄点：应强化蓟马方向，并抑制红蜘蛛方向；
- `sticky_honeydew` / 蜜露、黏腻、煤灰层：应强化蜜露型刺吸害虫方向，不得自动转成红蜘蛛；
- `no_pest_trace` / 无虫害痕迹：应抑制刺吸害虫具体结论；
- `unknown` / 不确定：只能保留不确定或继续追问，不得当作红蜘蛛正向证据。

##### 正式规则

```text
弱视觉点状线索 + 非红蜘蛛分流答案，
不得被视觉 yellow_speckling / stippling 强行收敛为 spider_mites。
```

只有以下情况才允许红蜘蛛进入最终输出候选：

- 视觉正式证据中存在 `fine_webbing`、`mite_webbing` 等高特异网丝证据，并已进入 `observed_evidence_set`；
- 或问诊形成了非泛化、直接指向红蜘蛛的正向答案；
- 或高特异快速收敛规则明确命中红蜘蛛方向。

若问诊答案明确指向蓟马、蜜露型虫害、无虫害痕迹或不确定，红蜘蛛不得仅凭 `yellow_speckling`、`stippling`、叶背存在性、分布范围或进展速度成为 final outcome。

#### 7. 审计要求

本规则的本地 deterministic 守卫至少应覆盖：

1. `leaf` 槽位只拿 `location_key = leaf` 的 prompt 池
2. 已观察 `black_spots_spreading` 时，优先选择其自身确认题
3. `fine_webbing` 不得再进入 question 选择
4. 任意诊断 round 返回给前端的活跃问题数量不得超过 1
5. `holes_in_leaf` 等结构缺损问题不得因为“有洞”直接把虫害作为唯一问诊方向
6. `yellow_speckling/stippling` 在 `pest_trace_type` 回答为蓟马银斑黑点、蜜露、无虫害痕迹或不确定时，不得强行收敛为红蜘蛛



## [S23] 视觉候选症状追问承接与兜底确认规则 v1

- 文件名：`视觉候选症状追问承接与兜底确认规则_v1.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉入口/追问
- 用途：candidate_retained 与兜底确认问题；question_queue 优先于 no_visual_symptoms_detected
- SHA-256 前 16 位：`d1f4f98235bc911b`

---

### 视觉候选症状追问承接与兜底确认规则 v1

#### 1. 适用范围

本规则适用于以下运行时场景：

- AI 视觉链路已经在 `visual_call_aggregate_results` 中产出 `aggregated_symptom_candidates`
- 某些候选症状被保留为 `admission_result = candidate_retained`
- 这些候选尚未进入 `observed_evidence_set`
- 当前轮次仍需要通过 `question_queue` 决定是否继续追问

#### 2. 正式边界

##### 2.1 candidate_retained 不是正式视觉证据

- `candidate_retained` 不得直接写入 `observed_evidence_set`
- `candidate_retained` 不得直接计入正式 `observedSymptoms`
- `candidate_retained` 可以作为 `question_queue` 的 seed 使用

##### 2.2 question_queue 必须先于 no_visual_symptoms_detected

当满足以下条件时：

- 当前为首轮 `preliminary`
- 正式 `observed_evidence_set` 为空
- 视觉 aggregate 中存在 `candidate_retained` 症状

系统不得直接进入 `stop_reason = no_visual_symptoms_detected`。

必须先评估这些候选是否存在高价值追问路径：

- 若存在正式 question data，则优先生成正式问题
- 若不存在正式 question data，则生成运行时兜底确认问题
- 仅在确认“当前轮无高价值问题可问”后，才允许进入停止判定

#### 3. 兜底确认问题

##### 3.1 触发条件

当某个 `candidate_retained` 症状满足以下条件时，可触发兜底确认问题：

- 该症状来自 `symptoms.ai_visual_pool = yes`
- 当前没有 audited question data 能覆盖该 `target_symptom_key`
- 当前轮次尚未问过该症状对应问题组

##### 3.2 问题形式

兜底确认问题必须围绕该症状的 `display_text_cn / symptom_cn` 构造，例如：

- 图片里疑似出现“褐斑带黄晕”，你复看后是否也能确认？

答案选项固定为：

- `yes`
- `no`
- `unknown`

##### 3.3 回流约束

- `yes` 可以把该 symptom 作为正向 follow-up answer effect 回流
- `no` 可以把该 symptom 作为负向 follow-up answer effect 回流
- `unknown` 只影响 question queue，不得强行加分或减分

##### 3.4 仍然不等于正式视觉 admit

即便用户回答 `yes`，其进入后续步骤的路径也应是：

- 通过 follow-up answer effect 回流
- 再进入后续重算

而不是把原始 `candidate_retained` 直接改写成 `formally_admitted`

#### 4. 记录要求

- 所有 `ai_visual_pool = yes` 但尚未建立 audited question data 的症状，必须有明确缺口清单
- 缺口清单应作为仓库内可见资产保存，便于后续补齐正式题库
- 在正式题库补齐前，运行时兜底确认问题必须保持可用



## [S24] 视觉症状池外候选留痕与代理证据规范 v2

- 文件名：`视觉症状池外候选留痕与证据隔离规范_v1.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉入口/审计
- 用途：池外视觉候选的留痕与证据隔离；formal/proxy 角色
- SHA-256 前 16 位：`97c0201bcf77d36e`

---

### 视觉症状池外候选留痕与代理证据规范 v2

#### 1. 目标

本规范补齐视觉症状入口层的一条正式边界：

- prompt 候选池只允许使用 `symptoms.ai_visual_pool = yes` 的正式视觉 symptom；
- 模型若识别到“清晰可见、但不在当前视觉池中”的异常，不得硬映射；
- 该类结果必须记录在案；
- 当模型给出有效 `closest_symptom_key_hint` 时，可生成受限的 `out_of_pool_proxy` 候选，复用现有问诊链；
- `out_of_pool_proxy` 不是正式视觉证据，不能单独支撑最终诊断结论。

---

#### 2. prompt 候选池正式来源

Hunyuan 视觉 symptom prompt 的正式候选集合必须同时满足：

1. `symptom_type in ('visual', 'hybrid')`
2. `ai_visual_pool = yes`
3. `data_status = audited`

说明：

- `ai_visual_pool` 是“是否允许进入 AI 视觉 symptom prompt”的正式开关；
- 不在视觉池中的 symptom，即使存在于 `symptoms` 表，也不应进入 `symptom_candidates` 候选清单。

---

#### 3. 池外候选的正式定义

当模型观察到图片中存在明显视觉异常，但该异常：

- 不在当前可选 `symptom_key` 列表中；
- 或无法在当前池中找到足够稳定的 canonical symptom；

模型必须把它输出到：

`out_of_pool_symptom_candidates`

推荐结构：

```json
[
  {
    "raw_visual_name_cn": "叶面细小银白点状失绿",
    "raw_visual_name_en": "",
    "closest_symptom_key_hint": "leaf_yellowing",
    "reason": "not_in_ai_visual_pool"
  }
]
```

边界：

- `closest_symptom_key_hint` 只是提示，不是正式映射；
- 不允许把池外候选强行塞进 `symptom_candidates`；
- 不允许把池外候选直接转成 `observed_evidence_set`。
- 不允许服务端通过无治理的关键词或散落硬编码规则猜测 `closest_symptom_key_hint`。
- 允许使用数据库/后台治理数据中 `reviewStatus = audited` 的 proxy 映射，把特定池外对象派生到 closest symptom。
- 运行时代码不得内置具体池外词表或具体 closest symptom 映射。

若模型没有给出 `closest_symptom_key_hint`，且没有命中已审计 proxy 映射，则该池外候选只能作为 `audit` 留痕。

当本轮没有正式 `symptom_candidates`，且只存在未映射的池外候选时，诊断流应跳过常规诊断，不应继续问诊，也不应输出 `non_problematic`。

---

#### 4. 持久化落位

池外候选必须进入单图标准化结果层留痕。

正式落位：

- `visual_raw_image_records.raw_structured_output`
- `visual_normalized_image_results.pattern_candidates_json.out_of_pool_symptom_candidates`

可选补充：

- `visual_normalized_image_results.pattern_candidates_json.normalization_notes`

说明：

- 原始池外对象属于“视觉审计补充层”，不是正式 symptom evidence；
- 当 `closest_symptom_key_hint` 有效时，可以派生出 `out_of_pool_proxy`；
- `out_of_pool_proxy` 的存在是为了阻止过早 `non_problematic` 闭合，并复用现有问诊链做确认；
- 未经问诊确认，`out_of_pool_proxy` 不得升级为正式诊断证据。

---

#### 5. 证据角色定义

视觉入口的候选必须区分三种角色。

##### 5.1 formal

来源：

- `symptom_candidates`

允许用途：

- 进入正式视觉候选；
- 进入 admission / evidence / ranking；
- 驱动常规 follow-up；
- 在满足输出条件时支撑最终诊断。

##### 5.2 proxy

来源：

- `out_of_pool_symptom_candidates[].closest_symptom_key_hint`
- 已审计 proxy 映射表
- 派生候选来源必须标记为 `candidateSource = out_of_pool_proxy`

允许用途：

- 阻止 `non_problematic` 过早闭合；
- 以低权重进入现有 follow-up 选择；
- 用于确认与该 closest symptom 相关的症状方向；
- 在 review/detail 中明确显示其池外来源。

限制：

- 不得伪装成普通 `visual` 来源；
- 不得直接写入 `observed_evidence_set`；
- 不得在没有问诊确认时单独支撑最终诊断；
- 不得覆盖或抢占正式 `symptom_candidates`。
- proxy 映射必须在数据库/后台治理数据中维护，并保留 `mappingId`、`reviewStatus`、`rationale`。

##### 5.3 audit

来源：

- 没有有效 `closest_symptom_key_hint` 的池外候选；
- closest key 无效或不在当前症状字典中的池外候选。

允许用途：

- 审计与回放；
- 视觉 symptom 池扩容候选；
- 标注/映射缺口分析；
- prompt 质量评估。

限制：

- 不进入 follow-up；
- 不进入 ranking；
- 不进入 `observed_evidence_set`；
- 不影响正式问题性诊断结论。

输出规则：

- 如果存在正式视觉候选或 proxy 候选，audit 只作为旁路留痕；
- 如果没有正式视觉候选，也没有 proxy 候选，但存在 audit 池外候选，应输出通用池外结果；
- 通用池外结果必须使用保守文案，只说明“发现当前诊断范围外的可见异常”；
- 行动建议必须保持通用，不得根据池外原始名称推断具体类型、处理方法或用药方向。

---

#### 6. 与 evidence 主链的隔离规则

`out_of_pool_symptom_candidates` 必须满足以下隔离：

1. 不进入 `topk_symptoms_json`
2. 不进入 `visual_admission_records`
3. 不进入 `observed_evidence_set`
4. 不以原始池外对象身份参与 `problem ranking`
5. 不以原始池外对象身份直接驱动 `follow-up question queue`

也就是说：

> 池外候选本体只留痕；只有有效 closest hint 可以派生为 `out_of_pool_proxy`，且必须降权、标源、经问诊确认。

---

#### 7. 允许的后续用途

池外候选本体允许用于：

1. 审计与回放
2. 视觉 symptom 池扩容候选
3. 标注/映射缺口分析
4. prompt 质量评估

`out_of_pool_proxy` 允许用于：

1. 复用现有问诊链进行确认
2. 作为低权重候选参与追问选择
3. 阻止无正式视觉候选时直接闭合为 `non_problematic`
4. 在 review/detail 中提示 closest symptom 方向

未映射的池外候选允许用于：

1. 阻止 `non_problematic` 输出
2. 输出通用池外结果
3. 在后台 review/detail 中展示原始池外描述
4. 进入映射治理流程
5. 在用户侧以“非诊断观察/模型原始观察”形式展示原始池外描述，前提是同时明确说明它不是正式诊断结论，不得作为 canonical symptom、问题结论或行动建议依据。

所有阶段均不允许：

1. 直接展示池外候选为正式诊断事实
2. 直接替代 canonical symptom
3. 绕过确认流程进入最终结论
4. 通过服务端代码硬编码关键词生成 closest symptom
5. 在用户侧行动建议中根据未映射池外名称给出具体处理倾向
6. 在用户侧把池外原始名称渲染成确定性问题名称、治疗对象或用药对象。

---

#### 8. 一句话裁决

> `ai_visual_pool = yes` 决定正式视觉候选池；池外可见异常必须留痕，有效 closest hint 可派生为 `out_of_pool_proxy` 复用问诊链；无映射池外候选应输出通用保守的池外结果，不得伪装成正式视觉证据、不得输出 non-problematic，也不得给出具体处理倾向。



## [S25] 高特异性视觉证据快速收敛规则 v1（完整最终版，给 Codex）

- 文件名：`高特异性视觉证据快速收敛规则_v1_1_review增补修正版_给Codex.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉入口/快路径
- 用途：高特异视觉证据可快速收敛但不得视觉层越级直出
- SHA-256 前 16 位：`35dcc9d1dd091b6d`

---

### 高特异性视觉证据快速收敛规则 v1（完整最终版，给 Codex）

> 适用对象：
>
> - Codex
> - 第一版 dev 开发阶段
> - 诊断系统内部实现
>
> 目标：
>
> - 在**不打破当前全部宪法、分层、定义、边界**的前提下，
> - 为“红蜘蛛网、介壳虫壳体、蚜虫群聚、白粉病典型粉层、黑飞成虫明显可见”等少数**高特异性视觉证据**，
> - 提供一条**更短但仍然合规**的诊断收敛路径。
>
> 本文档不是为了给视觉层“越权”。
> 本文档的核心任务是：
>
> # **允许少数强正证据更快收敛**
> # **但不得绕过诊断系统**
> # **不得违反当前所有宪法与定义**
>
> 使用原则：
>
> - 当前正式基线仍然有效
> - 本文档只定义一个**受限的、窄口的、内部快速收敛规则**
> - 该规则不能改变：
>   - Taxonomy / Diagnosis / Runtime 分层
>   - route hint 的边界
>   - outcome 三类结构
>   - formally_admitted → observed_evidence_set 的落位顺序
>   - “模型不是最终裁判”这一现实裁决

---

### 一、先给总裁决

#### 1.1 正式结论

### **高特异性视觉证据可以触发“快速收敛”**
但：
### **不能触发“视觉层越级直出最终结论”**

也就是说，允许的是：

- 在诊断系统内部，基于极少数高特异性强正证据
- 缩短候选竞争、补图、追问、反复回流的长度
- 更快进入问题性结论收敛

不允许的是：

- 视觉层直接等于 outcome 层
- 视觉模型直接等于最终裁判
- 一张图一调用模型，立刻跳过 diagnosis 主链全部阶段

---

#### 1.2 一句话规则

### **高特异性快速收敛，是诊断系统内部的一条窄口快路径。**
### **它不是视觉层对诊断层的越权。**

---

### 二、必须遵守的宪法级红线

本规则在任何情况下，都不得突破以下红线。

#### 2.1 不得破坏分层

##### 不得改写为
- 视觉层直接输出最终结论
- Taxonomy 结果直接充当 outcome
- route hint 直接充当 outcome

##### 必须保持
- 视觉层 = 候选生成与证据输入层
- Diagnosis 层 = 收敛与裁决层
- Outcome 层 = 最终输出层

---

#### 2.2 不得跳过 formally_admitted → observed_evidence_set

正式裁决继续有效：

### **只要条目被 formally_admitted，就必须先进入 observed_evidence_set。**

这条不能因为“证据很强”而跳过。

##### 含义
即使是：
- 红蜘蛛网
- 介壳虫壳体
- 白粉病粉层
- 黑飞成虫

也必须先经过：

1. 视觉标准化
2. 接纳判定
3. 正式证据集合落位

之后才能进入快速收敛门。

##### 代码守门要求

运行时代码不得用以下输入直接触发最终结论：

- 视觉模型原始文本；
- visual raw record；
- normalized candidate 但尚未 admission 的候选；
- `candidate_retained`；
- route hint；
- prompt 输出中的 problem-like 描述。

快速收敛的唯一合法入口是：

```text
formally_admitted visual evidence
→ observed_evidence_set
→ high_specificity_fast_convergence_gate
→ diagnosis outcome eligibility
```

如果某条视觉证据没有进入 `observed_evidence_set`，即使模型描述非常确定，也只能保留为候选、审计信息或追问依据，不能参与最终 problem 直出。

---

#### 2.3 不得新增 route_primary_action 主枚举

当前第一版正式枚举仍然只有：

- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

##### 正式裁决
### **高特异性快速收敛不是新的 route_primary_action。**

它只能是：
- `standard_flow` 内部
或
- `ask_first` 内部的一条提前收敛判定规则

不能新增：
- `fast_converge`
- `visual_direct_final`
- `high_confidence_final`

##### 原因
否则会破坏当前已经冻结的枚举体系，并污染流程定义。

---

#### 2.4 不得新增新的 outcome_type

当前 outcome_type 仍然只有三类：

- `problematic`（问题性）
- `uncertain`（不确定）
- `non_problematic`（非问题性）

##### 正式裁决
### **高特异性快速收敛最终仍只能收敛到现有三类 outcome 之一。**

它不能新增：
- `direct_problematic`
- `visual_certainty`
- `high_confidence_problem`

---

#### 2.5 不得突破“模型不是最终裁判”

当前第一版现实可落地裁决继续有效：

- 百度植物识别 = 名称候选输入
- 混元 = 候选生成器 + 粗筛器
- 系统 = 接纳、分层、裁决

##### 正式裁决
高特异性快速收敛不能被解释成：

### **“模型一眼看出来了，所以系统直接承认”**

正确解释只能是：

### **模型给出了高特异性强正证据候选**
### **系统基于接纳规则与收敛门规则，允许更快完成裁决**

---

#### 2.6 不得输出“100%确定”类语言

##### 正式裁决
第一版无论内部证据多强，外部文案都不得使用：

- 100% 确定
- 已完全确认
- 毫无疑问
- 无需复查

##### 允许表达
- 更像
- 高度提示
- 当前证据非常支持
- 当前更接近
- 可优先按……处理
- 若后续出现反向证据，再复查

##### 原因
第一版是实际产品系统，不是法医学鉴定系统。  
即使强特异视觉证据也仍有：
- 拍摄伪影
- 误把灰尘 / 网丝 / 反光当异常
- 低质量图误读
- 不同问题外观相似

---

### 三、什么叫“高特异性视觉证据”

#### 3.1 正式定义

高特异性视觉证据，指的是：

### **问题本体或高度特异性问题痕迹，在图像中被直接、清晰、正向地看到**
并且：
### **该证据对其他常见候选问题具有明显区分力**

---

#### 3.2 必须满足的 4 条必要条件

只有四条都满足，才能进入“高特异性快速收敛门”。

##### 条件 A：看到的是“正证据”
必须看到：

- 问题本体
或
- 高特异性问题痕迹

而不是仅仅看到一个弱症状。

###### 正例
- 红蜘蛛网丝 + 典型吸汁点
- 介壳虫壳体清晰附着
- 蚜虫群体清晰可见
- 白粉病典型大片粉层
- 黑飞成虫在土表 / 盆面附近清晰可见，且图像主体明确

###### 反例
- 黄叶
- 卷叶
- 轻微斑点
- 失绿
- 干尖
- 萎蔫

这些都只是低特异性症状，不能触发快速收敛。

---

##### 条件 B：图像质量必须足够高
至少满足：

- 主体清晰
- 目标区域可辨认
- 非远景猜测
- 非模糊轮廓
- 非严重遮挡
- 非强反光伪影

如果图像质量不足，即使“看起来很像”，也不能进入快速收敛。

---

##### 条件 C：器官 / 部位上下文合理
要能判断异常出现在哪个真实部位，例如：

- 叶背
- 叶面
- 茎节
- 叶柄连接处
- 土表 / 基质表面

##### 原因
很多“像虫”或“像网”的东西，如果脱离器官上下文，误判概率会明显上升。

---

##### 条件 D：该证据必须对主要混淆项有明显排他性
例如：

- 红蜘蛛网 + 吸汁点，能显著区别于单纯缺水黄叶
- 介壳虫壳体，能显著区别于一般叶斑
- 白粉病粉层，能显著区别于普通失绿或尘土感

如果仍然只是“看起来像，但也很像别的”，不能进入快速收敛。

---

#### 3.3 第一版建议允许的高特异性白名单

第一版只允许极少数白名单对象触发快速收敛。

##### 第一组：典型虫害方向
- 红蜘蛛典型网丝 + 取食痕
- 介壳虫壳体群聚
- 蚜虫虫群群聚
- 黑飞成虫明显可见，且与盆土 / 基质场景一致

##### 第二组：典型病害方向
- 白粉病典型大片粉层

##### 说明
第一版不要把白名单铺太大。  
宁可保守，也不要为了“聪明”而把模糊对象也纳进来。

---

### 四、什么绝不能触发快速收敛

以下内容第一版明确禁止触发高特异性快速收敛。

#### 4.1 低特异性症状
例如：

- 黄叶
- 卷叶
- 干尖
- 萎蔫
- 局部褐斑
- 失绿
- 斑驳
- 稀疏小点
- 叶片发软

##### 原因
这些都可能对应：
- 缺水
- 积水
- 肥害
- 光照应激
- 老叶退化
- 虫害
- 病害

它们只能进入正常诊断竞争链，不能快收敛。

---

#### 4.2 通过“排除法”猜出来的异常
例如：

- “不像缺水，所以可能是虫害”
- “不像病斑，所以更像肥害”
- “像应激也像虫害，那就先按虫害”

这些都不行。

##### 正式裁决
### **快速收敛只允许基于强正证据，不允许基于排除式推断。**

---

#### 4.3 仅基于宿主先验
例如：

- 这类植物常见红蜘蛛，所以看到黄叶就快收敛为虫害

这不允许。

##### 正式裁决
Taxonomy / 宿主背景可以：

- 保留候选
- 提高候选不被过早淘汰的概率

但不能单独触发快速收敛门。

---

#### 4.4 仅基于用户槽位提示
例如：

- 用户说这是叶背图，所以系统就认定叶背虫害成立

不允许。

槽位只能是：
- 强提示
不是：
- 事实真值

---

### 五、快速收敛不等于跳过诊断系统

这是本规则最重要的部分。

#### 5.1 正确流程

高特异性快速收敛的正确路径应当是：

1. 用户上传图片  
2. 视觉原始记录  
3. 视觉标准化结果  
4. 接纳判定  
5. `formally_admitted` 进入 `observed_evidence_set`  
6. 进入“高特异性快速收敛门”判定  
7. 若通过，缩短候选竞争 / 追问 / 补图链路  
8. 进入问题性结论收敛  
9. 输出 explanation 与软建议

---

#### 5.2 错误流程（禁止）

以下都是错误实现：

##### 错误 A
图片 → 模型说“红蜘蛛” → 直接返回最终结论

##### 错误 B
图片 → 视觉层直接写 outcome

##### 错误 C
图片 → 跳过 `observed_evidence_set` → 直接进入结果页

##### 错误 D
图片 → 不做接纳判定 → 直接按高置信规则输出

---

#### 5.3 第一版中它在代码里的地位

##### 正式裁决
高特异性快速收敛在代码中只能是：

### **诊断系统内部的一个收敛门规则**
不是：
### **视觉服务的直接返回模式**

也就是说，它应该出现在：

- diagnosis 调度层
- outcome 收敛层

而不是：
- identify-http 的直接返回层
- 纯视觉服务层

---

### 六、与 route hint、追问、补图的关系

#### 6.1 与 route hint 的关系

##### 正式裁决
高特异性快速收敛不是新的 `route_primary_action`。  
它只是对现有路由执行时的一个内部加速条件。

##### 推荐理解
- 若当前已经 `formally_admitted`
- 且命中高特异性快速收敛门
- 则当前轮可以减少或跳过低收益追问
- 更快进入结果收敛

---

#### 6.2 与追问的关系

##### 正式裁决
高特异性快速收敛**可以减少追问**，但不意味着“永远零追问”。

##### 第一版建议
分两层处理：

###### 层 1：极强场景
例如：
- 介壳虫壳体清晰群聚
- 蚜虫群体清晰可见
- 白粉病大片典型粉层

这类可以：
- 0 轮追问直接收敛

###### 层 2：较强但仍可能存在混淆
例如：
- 红蜘蛛网丝可见，但图像仍一般
- 黑飞可见，但场景不够完整

这类可以：
- 1 个高收益确认问题
- 然后再收敛

##### 原则
### **快速收敛是“少问”，不是“绝不问”。**

---

#### 6.3 与补图的关系

##### 正式裁决
高特异性快速收敛**可以降低补图概率**，但不能无视图像质量不足。

##### 规则
如果：
- 证据看起来很特异
但
- 图像质量不够高

那么仍应优先：

- `retake_first`
或
- 进入 1 次补图

不能因为“像”就直接快收敛。

---

### 七、与 Taxonomy、宿主背景、属级养护基线的关系

#### 7.1 与 Taxonomy 的关系

高特异性快速收敛可以在：

- matched
- weak_matched
- unresolved

三种身份状态下都存在。

##### 原因
某些问题本体是可以跨身份直接看到的，例如：
- 虫体
- 壳体
- 白粉层

##### 正式裁决
高特异性快速收敛不依赖：
- Taxonomy 稳定命中
但它仍然不能破坏：
- Taxonomy 主链路本身

即：
- 身份解析该走还是要走
- 只是问题收敛不必强依赖稳定宿主先验

---

#### 7.2 与宿主先验的关系

宿主先验可以：

- 增强解释
- 补充背景
- 提升合理性说明

但它不能作为高特异性快速收敛的触发条件。

---

#### 7.3 与属级养护基线的关系

##### 正式裁决
属级养护基线不得参与高特异性快速收敛门判定。

##### 原因
它属于：
- explanation
- 环境偏离判断
- 动作建议

不属于：
- 问题主竞争链
更不属于：
- 视觉强证据收敛门

---

### 八、输出规则：即使快速收敛，也必须保守表达

#### 8.1 outcome_type 仍然是现有三类之一

高特异性快速收敛第一版几乎都应该收敛到：

- `problematic`

但它仍然必须通过现有 outcome 结构输出。

---

#### 8.2 外部文案必须软化

##### 允许表达
- 当前证据非常支持红蜘蛛方向
- 当前更像介壳虫问题
- 目前高度提示为白粉病方向
- 当前可优先按虫害方向处理

##### 不允许表达
- 已 100% 确定
- 一定是红蜘蛛
- 无需复查
- 已完全确认

---

#### 8.3 动作建议仍然是软建议

即使高特异性快速收敛成立，动作建议也仍应是：

- 软建议
- 分步建议
- 优先检查建议
- 风险提醒

不得因为“证据很特异”就输出硬处方。

---

### 九、实现建议（给 Codex）

#### 9.1 第一版不要新增表
本规则第一版不要求新增新表。

##### 原因
它只是：
- 现有 diagnosis 调度内部的一条快收敛门规则

不值得为它新建一套复杂对象体系。

---

#### 9.2 第一版建议新增的只是内部判定函数
可以实现为一个内部函数，例如：

- `is_high_specificity_visual_evidence(...)`
- `should_fast_converge_from_visual(...)`

##### 输入
- 视觉标准化结果
- 接纳判定结果
- 图像质量等级
- 器官 / 部位信息
- outcome 白名单
- 现有 route_primary_action

##### 输出
- 是否进入快速收敛
- 是否允许 0 轮追问
- 是否允许跳过补图
- 允许收敛到哪个问题方向白名单

---

#### 9.3 第一版必须保留审计信息
即使快速收敛，也建议记录：

- 触发原因
- 命中的高特异性对象
- 是否零追问
- 是否跳过补图
- 最终 outcome_type

##### 说明
不一定要新表。  
可以先挂在：
- `visual_supervision_records`
或
- diagnosis session trace / debug payload

用于后续复盘。

---

### 十、第一版允许的“高特异性快速收敛”最小白名单

这是当前建议的第一版最小白名单。

#### 10.1 问题方向白名单
- `spider_mite_direction`（红蜘蛛方向）
- `scale_insect_direction`（介壳虫方向）
- `aphid_direction`（蚜虫方向）
- `fungus_gnat_direction`（黑飞方向）
- `powdery_mildew_direction`（白粉病方向）

##### 说明
第一版更推荐先收敛到“问题方向”，而不是“虫种 / 病原最终精确名”。

---

#### 10.2 第一版更稳的实现建议
例如：

##### 红蜘蛛
若：
- 网丝明显
- 叶背 / 节间场景合理
- 伴随典型吸汁点
则：
- 可快速收敛到“红蜘蛛方向”
而不一定直接锁死“红蜘蛛已完全确认”

##### 黑飞
若：
- 土表 / 基质附近成虫明显可见
- 场景清楚
则：
- 可快速收敛到“黑飞方向”
而不要把“黑飞幼虫根害程度”也一并强行锁定

---

### 十一、第一版不建议做的事

#### 11.1 不要把白名单铺大
第一版宁可窄，也不要广。

#### 11.2 不要把它做成新的大状态机
本规则是“窄口快门”，不是新中枢。

#### 11.3 不要为了它做多次模型采样
第一版禁止为了触发快速收敛而重复调用模型做“稳定性确认”。

#### 11.4 不要让它污染非问题性结论
高特异性快速收敛主要是针对：
- 问题性方向强证据

不要把“正常斑纹很像很确定”也纳入同一快门规则。

---

### 十二、最终裁决

#### 12.1 最终结论

### **允许建立“高特异性视觉证据快速收敛”规则。**
但必须同时满足：

1. 不新增新的 outcome_type  
2. 不新增新的 route_primary_action  
3. 不跳过 formally_admitted → observed_evidence_set  
4. 不让视觉层越级直出最终结论  
5. 不输出“100%确定”类语言  
6. 不让属级养护基线、宿主先验、槽位提示成为快收敛触发器  
7. 第一版只对极少数白名单对象生效

---

#### 12.2 一句话总裁决

**高特异性快速收敛，是诊断系统内部的一条“窄口、强约束、可审计”的快路径；它的作用是减少低收益追问与补图，不是授权视觉层打破当前全部宪法、分层与定义。**




### ================================
### v1.1 新增附录开始（基于 v1 只增不减）
### ================================

> 说明：
>
> - 以下内容为《高特异性视觉证据快速收敛规则 v1（给 Codex）》在**完整保留上文全部有效内容**的前提下，继续新增的 review 增补修正规则。
> - 本次新增目标：
>   - 收口 `direction key` 与正式 `problem_key` 的关系
>   - 写死快收敛门在 diagnosis 调度中的精确插入点
>   - 收紧黑飞场景的因果边界
>   - 防止 Codex 在实现时自行发明半正式对象体系
>
> - 本次新增只做补充，不删改上文，不重排上文，不替换上文。

---

### 附录 A：v1.1 review 增补修正规则（本次新增，不替换上文）

#### A-1. 快收敛门最终必须收敛到正式 `problem_key`

##### 正式裁决
### **第一版高特异性快速收敛，不得引入新的半正式问题对象体系。**
### **最终输出前，必须收敛到正式 `problem_key` 白名单。**

##### 说明
上文中出现的：

- `spider_mite_direction`
- `scale_insect_direction`
- `aphid_direction`
- `fungus_gnat_direction`
- `powdery_mildew_direction`

在第一版里只能理解为：

### **运行时内部的方向性中间语义**
不是：
### **正式问题主表对象键**

##### 第一版实现要求
- 运行时内部允许短暂使用“方向性中间语义”做快收敛门判断
- 但在进入最终 outcome 输出前，必须完成：
  - 方向语义 → 正式 `problem_key`
  的映射

##### 若映射失败
### **不得输出半正式 direction key**
### **不得把 direction key 伪装成正式 `problem_key`**
### **应回退为 `uncertain`，或回到标准竞争链**

---

#### A-2. 第一版正式 `problem_key` 白名单映射规则

##### 正式裁决
高特异性快收敛第一版只允许映射到：
### **当前正式问题主表中已存在、已审核、已启用的 `problem_key` 白名单**

##### 不允许
- 运行时临时拼接 `problem_key`
- 模型自由生成新 `problem_key`
- 代码启发式扩展新问题对象

##### 推荐实现方式
第一版应采用：
- 静态常量映射表
或
- 受控配置文件映射表

例如：

- `spider_mite_direction` → `problem_key = spider_mite_infestation`
- `scale_insect_direction` → `problem_key = scale_insect_infestation`
- `aphid_direction` → `problem_key = aphid_infestation`
- `fungus_gnat_direction` → `problem_key = fungus_gnat_infestation`
- `powdery_mildew_direction` → `problem_key = powdery_mildew`

##### 注意
以上仅为映射形式示意。  
正式映射值必须以当前 `problems` 表中真实存在的白名单为准。

---

#### A-3. 快收敛门的正式插入点

##### 正式裁决
### **快收敛门的正式插入点 =**
### **`observed_evidence_set` 建立之后**
### **`question_queue` 生成之前**
### **`outcome` 收敛之前**

##### 这意味着
它不是：

- visual service 的直接返回逻辑
- 接纳判定逻辑
- route_primary_action 的重定义
- 结果页的最终后处理逻辑

它只能是：

### **diagnosis 调度层中的“结果收敛前拦截门”**

---

#### A-4. 快收敛门不会改写已记录的 `route_primary_action`

##### 正式裁决
### **快收敛门不会改写已记录的 `route_primary_action` 字段值。**

##### 含义
- 记录层中，`route_primary_action` 保持原始判定值
- 调度层中，允许基于快收敛门减少低收益追问 / 补图
- 但不得反向把：
  - `ask_first`
  - `retake_first`
  - `uncertain_prepare`
  - `standard_flow`
  改写成新的 route 值

##### 原因
否则会污染当前已经冻结的 route 字段语义。

---

#### A-5. 高特异性快收敛主要只服务于 `problematic`

##### 正式裁决
### **第一版高特异性快速收敛主要只允许服务于 `problematic` outcome。**

##### 不允许
- 用同一套快收敛门去判定“看起来很像正常特征”
- 用高特异性快门去扩张非问题性白名单
- 把“正常斑纹很像”也纳入这套规则

##### 原因
高特异性快收敛的本质是：
- 对少数问题性强正证据缩短路径

不是：
- 为非问题性结论建立快速直达通道

---

#### A-6. 高特异性白名单必须静态配置

##### 正式裁决
### **第一版高特异性快收敛白名单必须以静态配置方式存在。**
### **不得由模型自由扩展。**
### **不得由运行时启发式自动追加。**

##### 推荐实现
白名单应集中定义在：
- constants 文件
或
- 明确版本化的配置文件

##### 不允许
- 模型说“这也像高特异性对象”，系统就临时纳入
- 根据运行时统计自动扩白名单
- 在云函数里散落魔法字符串判断

---

#### A-7. 失败回退规则

##### 正式裁决
若任一必要条件不成立，则：

### **立即回退到标准诊断竞争链**
不得保留：
- 半快收敛态
- 待快收敛态
- 快收敛挂起态

##### 说明
快收敛门只有两种结果：

1. 命中 → 进入快收敛路径
2. 不命中 → 立即回退到标准竞争链

第一版不允许引入第三种中间状态。

---

#### A-8. 黑飞场景的特别边界

##### 正式裁决
### **“黑飞成虫明显可见”只强支持“黑飞问题方向存在”。**
### **它不自动证明“当前全部症状主因已锁定为黑飞”。**

##### 说明
第一版中，黑飞方向快收敛应被理解为：

- 可快速收敛到“黑飞问题方向成立”
- 可输出问题性结论方向
- 可减少低收益追问

但若当前主症状与黑飞因果链仍不稳定，则：

### **最终输出必须保守**
例如：
- 问题性结论 + 因果保守说明
或
- `uncertain`

##### 不允许
- 只要看到黑飞成虫，就自动锁定“当前黄叶主因 = 黑飞”
- 把“有黑飞”直接等同于“当前全部可见损伤均由黑飞导致”

---

#### A-9. 红蜘蛛、介壳虫、蚜虫、白粉病的第一版口径

##### 正式裁决
对于以下对象：

- 红蜘蛛
- 介壳虫
- 蚜虫
- 白粉病

第一版仍然推荐优先收敛到：
### **正式 `problem_key`**
而不是停在 runtime direction key。

##### 但即便如此
外部输出文案仍然必须保持：
- 软口径
- 可复查
- 可回退

##### 不允许
- 使用“100%确定”“无需复查”等话术

---

#### A-10. Codex 实现优先级说明

##### 第一版实现顺序建议
1. 先建立高特异性白名单静态配置
2. 再建立 direction → `problem_key` 的静态映射
3. 再把快收敛门插入到 diagnosis 调度层规定位置
4. 最后补 trace / debug 留痕

##### 不建议的实现顺序
- 先做一套新状态机
- 先新建一堆表
- 先让模型自由决定哪些对象可快收敛

---

#### A-11. 当前 v1.1 的最终裁决

本附录补入后，当前规则应统一理解为：

### **高特异性快速收敛 =**
### **诊断系统内部**
### **基于静态白名单**
### **经正式接纳与正式证据落位后**
### **在 diagnosis 调度层中触发的**
### **问题性结果快速收敛门**

它不是：
- 视觉层越权
- route 重定义
- outcome_type 扩展
- 新状态机中枢



## [S26] ai_visual_pool 直出例外与 formal question coverage 边界 v1

- 文件名：`ai_visual_pool直出例外与formal_question_coverage边界_v1.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉入口/例外
- 用途：ai_visual_pool 直出例外与 formal_question_coverage 边界
- SHA-256 前 16 位：`7dd04756734d3765`

---

### ai_visual_pool 直出例外与 formal question coverage 边界 v1

生成时间：2026-04-13

#### 1. 目的

这份规则只定义一件事：

- `ai_visual_pool=yes` 的视觉症状，并不天然等于“必须进入正式 question bridge”
- 但如果不进入正式 question bridge，必须被显式声明为 `direct-output audited exception`

否则就会把“按设计允许直出”和“题库漏建”混成一类，审计边界会失真。

#### 2. formal question coverage 的正式口径

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

#### 3. direct-output audited exception 的适用条件

只有同时满足以下条件，`ai_visual_pool=yes` 的视觉症状才允许不建 formal question bridge：

1. 该症状在产品设计上本来就是“保守直出型”，而不是“问诊桥接型”
2. 它的视觉护栏已经足够严格，能明确排除主要竞争路径
3. 它的 stop_state / output eligibility 可以直接收敛，不依赖 question_queue
4. 它被单独记录在 compare 文档与 gap manifest 中，状态为 `exception_by_design`

#### 4. 当前正式例外

截至 2026-04-13，当前唯一明确记录的 `direct-output audited exception` 是：

- `normal_leaf_aging_stable`

理由：

- 该信号被定义为保守直出型非问题结论入口
- 它已有严格视觉护栏：只在底部老叶稳定黄化、新叶和生长点正常、且无明显竞争性异常时才允许输出
- 它不应再被计入“必须补 question data”的普通缺口

#### 5. 审计文档必须同步记录的字段

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



## [S27] 视觉模型适配层与双模型多图融合代码落地审查_v1

- 文件名：`视觉模型适配层与双模型多图融合代码落地审查_v1.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉/代码落地
- 用途：双模型适配、多图融合、origin/supersede、observed_evidence_set 代码审查
- SHA-256 前 16 位：`d4d398d5576608d2`

---

### 视觉模型适配层与双模型多图融合代码落地审查_v1

#### 1. 审查范围

本次审查与整改，按以下文档作为基线核对：

- `docs/new-rules/ai_visual_entry_data_structure_and_retention_spec_v1_4_full_consolidated.md`
- `docs/new-rules/运行时模型_v1_5_完整最终版_标题版本已统一.md`
- `docs/new-rules/核心数据结构_v1_6_完整最终版_标题版本已统一.md`
- `docs/new-rules/diagnosis_hard_constraints_v2_4_20260404_121000.md`
- `docs/new-rules/决策流_v1_4_完整最终版_标题版本已统一.md`
- `docs/多图业务融合与当前阶段自有模型技术路线裁决_v1_完整最终版.md`
- `docs/多图业务融合与双模型路线联动增补规范_v1_完整最终版.md`

本轮目标不是只做“文档映射”，而是把当前代码从“部分贴近规范”推进到“后端主链基本按规范运行”。

---

#### 2. 本轮已落地的关键整改

##### 2.1 双模型适配层已显式成型

已新增/收口：

- `hunyuan_visual_adapter`
- `hf_autotrain_visual_adapter`
- `getVisualAdapter()` 统一入口

当前主链不再把某个供应商的原始输出直接耦合到后续业务逻辑。下游统一消费标准化后的 `visual_normalized_image_result` 语义。

说明：

- 当前仍以混元为主识别源。
- `hf_autotrain_visual_adapter` 已不再只是契约级适配器：
  - 可接入预计算分类结果
  - 也可直接调用 `AI-training` 提供的真实 HF inference service

---

##### 2.2 多图聚合已加入重复视角抑制

已完成：

- `duplicate_view_groups` 实际生成
- `support_count` 改为按独立支持组计算，而不是按图片线性累加
- `organ_support_summary` 同时保留独立支持数和原始图片数

这直接对应规范中的：

- 重复视角不得线性叠加支持度
- 多图聚合结果必须保留重复视角分组

---

##### 2.3 器官槽位提示已改成“强提示 + 冲突留痕”

已完成：

- 输入槽位器官提示进入标准化结果
- 当 UI 槽位与模型识别冲突时，优先保留 UI hint 作为 `normalized_organ`
- 同时记录：
  - `model_detected_organ`
  - `organ_source`
  - `organ_conflict_flag`
  - `organ_resolution_reason`
  - `normalization_notes`

这对应规范中的：

- `input_organ_hint` 只是一种强提示
- 不得把输入槽位直接伪装成视觉事实
- 冲突必须显式留痕

---

##### 2.4 visual batch 的 origin / supersede 追溯已进入运行时

已完成：

- `visual_batch_trace`
- `origin_visual_call_batch_id`
- `supersede_target_batch_id`
- `supersede_applied`
- `supersede_reason`
- `supersede_scope`
- `supersede_source`
- `supersede_time`

这使得“新批次显式覆盖旧批次”的规范，至少在运行时对象和快照层已经成立。

---

##### 2.5 `observed_evidence_set` 已成为运行时主轴

这是本轮最关键的实质整改。

已完成：

- 新增 `domain/observed-evidence.js`
- admitted 视觉候选先进入 `observed_evidence_set`
- `diagnosis-engine` 内部改为优先消费 `observedEvidenceSet`
- 以下模块已改为支持证据集：
  - `evidence-scoring`
  - `question-selector`
  - `non-problematic-resolver`
  - `diagnosis-engine`

当前运行时链路已变为：

`visual aggregate`  
→ `admission_records`  
→ `observed_evidence_set`  
→ `observedSymptoms` 兼容投影  
→ scoring / follow-up / non-problematic / final diagnosis

这基本对齐了文档中“diagnosis 只能消费 evidence，不直接消费模型 raw output”的要求。

---

##### 2.6 会话恢复与 HTTP 输出已同步到证据集语义

已完成：

- `session-service` 的 snapshot / runtime snapshot 已纳入 `observedEvidenceSet`
- follow-up 轮次已优先从会话快照恢复 `observedEvidenceSet`
- HTTP 公共返回对象已增加：
  - `observedSymptoms`
  - `observedEvidenceSet`
  - `visualBatchTrace`

这避免了第一轮按新规范运行、后续轮次又退回旧症状数组语义的问题。

---

##### 2.7 shadow compare 已具备离线评估能力

已完成：

- `shadow compare` 逐图留痕
- 批次级 `shadow_compare_summary`
- 离线报表脚本：
  - `scripts/terminal-e2e/report-shadow-compare.mjs`
- `package.json` 新增：
  - `npm run report:shadow-compare`

当前可以把诊断结果 JSON / 结果详情导出目录直接送入脚本，生成：

- case 级 compare 状态
- provider / model 统计
- compared / succeeded / skipped / failed 图像计数

这意味着灰度期已经不再只有“留痕”，而是具备了正式的离线 compare 口径。

---

##### 2.8 前端多图上传协议已切到结构化 `images[]`

已完成：

- `DiagnosePopup` 不再只发 `imageIds`
- 当前开始发送结构化 `images[]`
- 每张图包含：
  - `imageRef`
  - `orderIndex`
  - `inputSlotOrder`
  - `inputSlotLabel`
  - `inputSlotType`
  - `userDeclaredOrganType`
  - `userDeclaredOrganConfidence`
  - `fileId`
- `buildDiagnosePayload()` 已以 `images[]` 作为正式前端主口径，并继续保留 `imageIds / image` 兼容字段

说明：

- 首页诊断弹窗已新增器官槽位显式选择 UI
- 首轮上传时每张图都会带出：
  - `inputSlotType`
  - `inputSlotLabel`
  - `userDeclaredOrganType`
  - `userDeclaredOrganConfidence`
- 当前前端主口径已不再只是“多张 URL”，而是带槽位语义的结构化 `images[]`

---

##### 2.9 历史详情与结果回放已补入多图摘要

已完成：

- 最终快照与 runtime snapshot 已保存：
  - `visualBatchTrace`
  - `visualAggregateSummary`
  - `shadowCompareSummary`
- `/diagnosis/start`
- `/diagnosis/answer`
- `/diagnosis/result`
  返回对象现在都可以带出上述摘要字段
- 前端归一层已接住：
  - `observedEvidenceSet`
  - `visualBatchTrace`
  - `visualAggregateSummary`
  - `shadowCompareSummary`

这意味着多图融合不再只存在于首轮内存态，后续详情回放和诊断历史扩展都已有正式数据出口。

---

##### 2.10 follow-up 阶段补图回跳已接入后端主链

本轮新增修正：

- `/diagnosis/answer` 不再一律拒绝补图
- follow-up 阶段现在允许“答题”与“补图”二选一
- 若用户补图：
  - 重新创建新的 `visual_call_batch`
  - 通过 `origin_visual_call_batch_id` 形成 supersede trace
  - 症状解析重新执行
  - 当前轮旧 follow-up 约束上下文不再直接参与新一轮问诊选题
  - 旧 visual evidence 不再与新图结果硬混算

这次修正对应正式基线中的：

- 补图回跳应回到输入归一化阶段
- 用户补图后必须产生新的视觉调用批次
- 不得把补图结果回写为旧批次结果
- 质量不足优先补图，不得强推 diagnosis

说明：

- 当前前端已显式消费：
  - `uiHints.canUploadMoreImages`
  - `visualAggregateSummary.suggestedFollowupCapture`
  - `visualBatchTrace`
- follow-up 界面现在已经提供：
  - 补图入口
  - 补图槽位选择
  - “答题 / 补图”分开提交的正式交互
- 后端同时增加了“补图最多 1 次”的硬约束：
  - 若 `visualBatchTrace` 已显示发生过 supersede
  - 后续 `/diagnosis/answer` 会拒绝再次补图

这意味着“补图是正式出口”现在已不只是后端 contract 成立，而是前后端端到端打通。

---

##### 2.11 前端多图交互已完成端到端收口

本轮新增修正：

- 首轮上传已支持显式器官槽位选择
- follow-up 已支持补图入口、补图建议展示与补图槽位选择
- 前端提交补图时会携带：
  - `images[]`
  - `imageIds`
  - `latestVisualCallBatchId`
  - `visualBatchTrace`
- 问诊答案与补图在前端交互层已被强制拆分，不再允许混发

这对应正式基线中的：

- 视觉入口必须接收结构化器官槽位
- follow-up 补图必须是正式路径，而不是重新开始诊断
- 新批次 supersede 必须可追溯
- 多图融合 contract 要从上传协议开始成立

---

#### 3. 当前结论

##### 3.1 可以确认已基本符合的部分

当前代码在后端主链上，已经不再明显违背以下核心规范：

- 多图融合属于平台级能力，而不是模型内黑盒能力
- 聚合结果不是 evidence，必须经过 admission
- 重复视角不线性加分
- route hint 不反写事实层
- 模型上游与 diagnosis 下游已做隔离
- 运行时已具备 `observed_evidence_set` 主轴
- 新旧视觉批次已具备显式 trace

---

##### 3.2 仍不能宣称“严格 100% 完整遵循”的部分

以下项目前仍是剩余缺口：

###### A. HF 真实推理链路已在仓库成立，但云端 deployment 仍未完成

当前状态：

- `AI-training` 内已新增真实推理服务
- `hf_autotrain_visual_adapter` 已接入真实 HTTP inference client
- 本地 `/health`、`/predict` 与 Node adapter smoke 已验证通过
- 但仓库中仍没有正式回填到运行环境的 CloudRun endpoint / token / deployment 结果

结论：

- 双模型 contract、灰度 compare、离线报表、真实推理 client 已经成立
- 但“正式云端可用的 HF endpoint”仍属于外部部署未完成项

###### B. `source_model_provider` / `source_model_name` 已落为独立关系型字段

当前状态：

- 已写入 `visual_raw_image_records`
- 已写入 `visual_normalized_image_results`
- `raw_structured_output` / `pattern_candidates_json` 继续保留为审计补充
- 不再借 `model_version` 承担 provider 语义

结论：

- 运行时、关系型字段、JSON 留痕三层已对齐
- 当前已满足多图规范对统一视觉来源字段的要求

###### C. `observed_evidence_set` 已独立持久化成专表

当前状态：

- 已新增独立 `observed_evidence_set` 表
- `persistRoundResult()` 已把 admitted evidence 写入专表
- `getSessionState()` / `getResultById()` 已优先从专表恢复
- runtime snapshot JSON 继续保留，作为兼容回退

结论：

- 运行时主轴与事实层已正式打通
- 后续重点不再是“是否建表”，而是继续丰富 conflict / explanation 等 evidence 属性

---

#### 4. 本轮涉及的主要代码文件

- `cloudfunctions/diagnose-http/services/visual-diagnosis-service.js`
- `cloudfunctions/diagnose-http/services/visual-adapters/index.js`
- `cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js`
- `cloudfunctions/diagnose-http/services/visual-adapters/hf-autotrain-visual-adapter.js`
- `cloudfunctions/diagnose-http/utils/visual-contract.js`
- `cloudfunctions/diagnose-http/domain/observed-evidence.js`
- `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
- `cloudfunctions/diagnose-http/domain/evidence-scoring.js`
- `cloudfunctions/diagnose-http/domain/question-selector.js`
- `cloudfunctions/diagnose-http/domain/non-problematic-resolver.js`
- `cloudfunctions/diagnose-http/app.js`
- `cloudfunctions/diagnose-http/services/session-service.js`
- `src/components/DiagnosePopup.vue`
- `src/composables/useImageUploader.js`

---

#### 5. 验证结论

本轮已完成以下静态语法检查：

- `node --check cloudfunctions/diagnose-http/domain/observed-evidence.js`
- `node --check cloudfunctions/diagnose-http/domain/evidence-scoring.js`
- `node --check cloudfunctions/diagnose-http/domain/question-selector.js`
- `node --check cloudfunctions/diagnose-http/domain/non-problematic-resolver.js`
- `node --check cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
- `node --check cloudfunctions/diagnose-http/app.js`
- `node --check cloudfunctions/diagnose-http/services/session-service.js`
- `node --check cloudfunctions/diagnose-http/services/visual-diagnosis-service.js`
- `node --check cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js`
- `node --check cloudfunctions/diagnose-http/services/visual-adapters/hf-autotrain-visual-adapter.js`
- `node --check src/composables/useImageUploader.js`
- `@vue/compiler-sfc` 编译 `src/components/DiagnosePopup.vue`

结论：

- 当前提交在语法层面可加载
- 但“严格完全遵循全部文档”的结论仍不能直接下，因为 HF 云端部署、独立关系型字段与独立持久化仍未全部收口

---

#### 6. 最终判断

如果判断口径是：

- “当前后端主链是否已经按多图融合规范进入可继续开发状态”

结论是：**可以**

如果判断口径是：

- “当前项目是否已经严格完整实现 new-rules 与双模型多图文档中的全部条款”

结论是：**还没有**

但如果判断口径明确限定为：

- “当前项目是否已经完成多图业务融合相关文档所要求的前后端主链、补图回跳、结构化上传与批次追溯”

结论是：**已经完成**

当前最准确的状态应表述为：

> 多图业务融合相关的前后端主链已经按规范收口完成；当前剩余事项主要属于 HF 云端部署、独立字段治理与 evidence 专表持久化，不再是多图融合能力本身的阻塞项。



## [S28] AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1（分支场景增补版，完整最终版）

- 文件名：`ai_visual_to_diagnosis_runtime_linkage_example_v1_1_full_reviewed_final_标题版本已统一.md`
- 状态：非A类/补充或过程文件
- 类别：AI视觉/运行时示例
- 用途：AI视觉入口到 Diagnosis 运行时挂接示例
- SHA-256 前 16 位：`532dd5078b18910e`

---

### AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1（分支场景增补版，完整最终版）

> 说明：
>
> - 本文档用一个完整示例，演示：
>   - 用户图片输入
>   - 植物身份主链路
>   - 症状识别主链路
>   - 接纳判定
>   - Taxonomy → Diagnosis 挂接
>   - problem 竞争
>   - outcome 收敛
>
> - 本文档目标不是定义新规则，而是：
>
> # **把前面所有文档链真正串起来**
>
> - 本文档遵循：
>
> # **中文是一等公民**
> # **中文主名优先**
> # **只给完整最终文件**

---

### 一、示例前提

#### 1.1 用户提交内容

用户提交 4 张图：

- 图1：叶片图
- 图2：茎图
- 图3：全株图
- 图4：叶片特写图

产品层已提供槽位语义，因此这些图天然带有：

- `input_slot_type = leaf`
- `input_slot_type = stem`
- `input_slot_type = whole_plant`

等结构化输入提示。

---

#### 1.2 当前目标

目标不是直接让 AI 给出最终诊断，  
而是演示：

### **AI视觉入口层如何把上游观察转成系统可消费对象**
### **再由 Diagnosis 运行时完成问题竞争与结论收敛**

---

### 二、第一段：植物身份主链路

#### 2.1 百度植物识别

系统先走植物身份主链路：

### **百度植物识别 → Taxonomy 匹配 → 命中直取**

假设百度返回：

- 原始返回名：龟背竹

---

#### 2.2 Taxonomy 匹配

Taxonomy 命中到：

- `plant_identity_id = PI_MONSTERA_001`
- `canonical_identity_name = Monstera deliciosa`
- `primary_display_name = 龟背竹`
- `identity_level = species`
- `family = Araceae`
- `genus = Monstera`

同时生成：

- `taxonomy_match_status = matched`
- `identity_resolution_status = matched`
- `is_current_primary_identity = true`

---

#### 2.3 当前会话身份主结果

运行时此时获得：

- 当前会话植物身份主结果 = 龟背竹
- 当前宿主先验挂点 = Monstera / 天南星科背景
- 允许后续按 identity 精确挂 diagnosis baseline

注意：

### **这还不是 diagnosis**
### **只是宿主侧正式结构进入了运行时**

---

### 三、第二段：症状识别主链路

#### 3.1 视觉调用批次

用户本轮 4 张图形成一个：

- `visual_call_batch_id = VCB_001`

---

#### 3.2 单图视觉原始记录

每张图都会生成一条：

- `visual_raw_image_record`

例如：

##### 图1（叶片图）
- `input_slot_type = leaf`
- 模型：混元
- prompt 版本：当前版本
- 原始输出包含：
  - 图像质量结果
  - TopK 症状候选
  - pattern candidate
  - route hint

---

#### 3.3 单图视觉标准化结果

系统把图1标准化为：

##### 图像质量
- 可分析等级：可分析
- 清晰度：正常
- 主体完整性：局部但足够
- 关键区域可见

##### 主器官类型
- `primary_organ_type = leaf`
- `organ_source = ui_hint`

##### TopK 症状（示例）
1. 叶片局部发黄
2. 叶缘焦枯
3. 斑点周围轻微黄晕

##### 模式候选
- 黄叶 + 叶缘干焦模式候选

##### 路由建议
- 可进入标准流程
- 建议优先问：
  - 最近是否暴晒
  - 浇水是否异常
  - 是否只影响老叶

---

#### 3.4 多图聚合

4 张图聚合后，系统形成：

- `visual_call_aggregate_result`

聚合结果示例：

##### 聚合质量
- 整体可分析
- 全株图可见性良好

##### 聚合症状
- 高重复观察到：
  - 叶片局部发黄
  - 叶缘焦枯
- 斑点黄晕仅在一张局部图弱出现

##### 聚合路由建议
- 进入标准流程
- 优先问环境与分布问题
- 不优先走不确定预备
- 不优先补图

---

### 四、第三段：视觉接纳判定

#### 4.1 图像质量结果

图像质量解析成功：

- 正式接纳

因为它是限权条件，不是竞争对象。

---

#### 4.2 症状候选接纳

##### 症状 1：叶片局部发黄
满足：
- 图像可分析
- 主器官已确定为 leaf
- 症状键归一成功
- 多图重复出现

→ 判定：
- `formally_admitted`

##### 症状 2：叶缘焦枯
满足：
- 器官明确
- 图像可分析
- 多图支持

→ 判定：
- `formally_admitted`

##### 症状 3：斑点周围轻微黄晕
问题：
- 仅单图弱出现
- 稳定性不足
- 存在长尾噪声风险

→ 判定：
- `candidate_retained`

---

#### 4.3 route hint 接纳

route hint 解析成功且不越权：

→ 正式进入流程层  
但：

### **只影响 question_queue**
### **不反写事实层**

---

### 五、第四段：进入 Diagnosis 运行时

#### 5.1 evidence 层

正式进入 evidence 的对象：

- 叶片局部发黄
- 叶缘焦枯

候选保留对象：

- 斑点周围轻微黄晕

---

#### 5.2 Taxonomy → Diagnosis 挂接

因为当前主身份结果为：

- `matched`
- `plant_identity_id` 明确

所以按挂接优先级走：

### **identity 精确挂接**

进入 diagnosis baseline 时，可稳定挂到：

- `plant_problem_profiles`
- 龟背竹对应宿主问题画像

---

#### 5.3 宿主先验作用

运行时此时可使用：

- 龟背竹宿主背景
- Monstera 常见问题背景
- explanation 用植物名与属科背景

但必须继续遵守：

### **宿主先验不得推翻高置信症状**
### **identity 结果不是 outcome**

---

### 六、第五段：problem 竞争

#### 6.1 形成问题候选池

根据：

- 正式已接纳症状
- identity 精确挂接
- 宿主背景
- route hint 触发的问题优先级

形成 problem 候选池，例如：

- 光照灼伤 / 暴晒应激
- 浇水失衡
- 肥害 / 盐害
- 自然老叶老化

---

#### 6.2 question_queue 生成

由于 route hint 建议优先问环境和分布问题，  
question_queue 可优先生成：

1. 最近是否暴晒过？
2. 主要影响老叶，还是新叶也有？
3. 最近浇水是否明显偏多或偏少？
4. 是一两片叶，还是很多叶都有？

---

### 七、第六段：问题回流与纠正

#### 7.1 用户回答示例

用户回答：

- 最近搬到阳台，太阳直晒明显变强
- 主要是朝外侧叶片受影响
- 新叶基本正常
- 浇水没有明显变化

---

#### 7.2 运行时纠正

这些回答会进一步：

- 强化暴晒 / 光照灼伤路径
- 降低浇水失衡路径
- 降低病理性叶斑路径
- 否定弱黄晕斑点候选的重要性

监督层可记录：

- `question_correction_scope = multiple`
- `question_corrected_symptom_key = false`
- `question_corrected_route_hint = true`
- `question_corrected_admission_result = true`

这意味着：
- 不是原始高置信症状错了
- 而是弱候选与流程建议被进一步收口了

---

### 八、第七段：outcome 收敛

#### 8.1 最终结论方向

此时更可能收敛到：

- 问题性结论对象：光照灼伤 / 暴晒应激

而不是：
- identity 结果本身
- route hint
- 图像质量
- 器官结果

---

#### 8.2 最终输出

系统对外输出的应是：

- 一个正式 outcome
- explanation
- 对应动作建议

而不是输出：

- “matched”
- “route hint = ask_first”
- “identity unresolved”
- “leaf image”

因为这些都不是 outcome。

---

### 九、这个示例真正证明了什么

本示例证明：

### **AI视觉入口层不是在做最终诊断**
### **它是在做上游受控观察、接纳与流程引导**

而 Diagnosis 运行时负责：

- evidence 组织
- problem 竞争
- question 回流
- outcome 收敛

同时，Taxonomy 负责：

- 身份主结果
- 宿主结构
- diagnosis 挂接基础

---

### 十、最终总裁决

这个链路应统一理解为：

### **图片输入**
### **→ 植物身份主链路**
### **→ 症状识别主链路**
### **→ 接纳判定**
### **→ Taxonomy → Diagnosis 挂接**
### **→ problem 竞争**
### **→ question 回流**
### **→ outcome 收敛**

这条链路一旦打通，后续正式落代码就不再是“概念实现”，而是：

### **把已经定义清楚的对象与规则真实落成系统**




### ================================
### v1.1 新增附录开始（基于 v1 只增不减）
### ================================

> 说明：
>
> - 以下内容为《AI视觉入口层到 Diagnosis 运行时挂接示例 v1》在**完整保留 v1 原文**的前提下，继续新增的 review 收口附录。
> - 上文全部内容 = v1 原文，原样保留。
> - 下文附录 A～B = 基于最高规格审查结果新增的分支场景示例。
> - 本次新增只做补充，不删改上文，不重排上文，不替换上文。

---

### 附录 A：异常分支示例——身份未命中（unresolved）路径（本次新增，不替换上文）

#### A-1. 场景前提

用户提交 3 张图：

- 图1：叶片图
- 图2：局部叶片特写图
- 图3：全株图（但较远、主体不够清晰）

产品仍提供槽位语义，但本轮图片对植物整体特征支撑不足。

---

#### A-2. 身份主链路

百度植物识别返回一个名称，但在当前 Taxonomy 中：

- 无稳定命中对象
- alias 规则也无法稳定归并
- 学名命中失败
- 人工映射规则当前不存在

因此生成：

- `taxonomy_match_status = unresolved`
- `identity_resolution_status = unresolved`
- `is_current_primary_identity = false`

##### 结果
运行时当前只能得到：

- 身份未命中状态
- explanation 中的保守表述
- “需补宿主确认 / 更清晰全株图”的流程倾向

##### 不允许发生的事
- 不得伪造 `plant_identity_id`
- 不得假装已有主身份对象
- 不得进入 diagnosis baseline 的精细挂接

---

#### A-3. 症状主链路

混元仍可完成症状观察，例如：

- 图1：叶片局部发黄
- 图2：轻微焦边
- 图3：全株图质量一般，仅能支持“可能存在多片叶受影响”

这些结果可正常进入：

- 原始层
- 标准化层
- 接纳判定层

---

#### A-4. 接纳判定

##### 正式接纳
- 叶片局部发黄
- 轻微焦边（若质量与器官条件满足）

##### 候选保留
- 多片叶受影响（若全株图质量不够高）
- 其他弱模式候选

##### route hint
当前更可能产生：

- `route_primary_action = ask_first`
或
- `route_primary_action = retake_first`

取决于：
- 当前图像质量
- 身份未命中的严重程度
- 是否还能从 question 中先获得高收益信息

---

#### A-5. Taxonomy → Diagnosis 挂接

由于当前主身份结果为：

- `unresolved`

因此必须执行：

### **不得进入 diagnosis baseline 的精细挂接**

##### 允许
- explanation 提示身份未稳定
- question 优先生成：
  - 这是什么植物？
  - 是否可补一张更清晰全株图？
  - 是否有叶片正反面 / 茎部图？

##### 不允许
- 直接挂 `plant_problem_profiles`
- 直接使用 species / genus 宿主先验强推问题排序

---

#### A-6. problem 竞争与 outcome 倾向

这时系统更可能处于：

- 症状已部分可用
- 宿主信息不足
- diagnosis 可继续，但可信度有限

因此 outcome 方向更可能走向：

- 输入不足型不确定路径
或
- 继续提问收益较高，暂不停止

---

#### A-7. 这个分支证明了什么

这个分支证明：

### **身份主链路失败，不等于整个诊断流失败**
### **但它会限制 diagnosis baseline 的精细挂接能力**
### **并抬高补图 / 宿主确认 / 保守 explanation 的优先级**

---

### 附录 B：异常分支示例——图像质量不足路径（本次新增，不替换上文）

#### B-1. 场景前提

用户提交 2 张图：

- 图1：叶片图，但明显模糊
- 图2：全株图，但距离远、主体过小

虽然槽位语义存在，但图片质量不足。

---

#### B-2. 图像质量标准化结果

系统生成：

##### 图1
- 可分析等级：`marginal`
- 清晰度：`blurry`
- 主体完整性：局部可见
- 关键区域可见性：部分可见

##### 图2
- 可分析等级：`insufficient`
- 清晰度：一般
- 主体完整性：主体过小
- 关键区域可见性：不足

聚合后得出：

- `aggregate_analyzability_level = marginal`
- 关键图对精细症状支持不足

---

#### B-3. 症状候选与接纳

混元可能仍给出若干症状候选，例如：

- 叶片局部发黄
- 疑似边缘干枯
- 疑似斑点

但由于图像质量限制：

##### 更合理的接纳结果
- `candidate_retained`
- `explanation_retained`

而不是大面积：
- `formally_admitted`

因为当前缺少足够稳定的视觉支撑。

---

#### B-4. route hint 主动作

此时应更倾向：

- `route_primary_action = retake_first`

##### 对应策略
- 先补拍更清晰叶片图
- 先补拍更近的全株图
- 必要时补茎图 / 根颈图

##### 不应发生的事
- 直接依据低质量图锁定高置信 outcome
- 把弱视觉候选大面积写入正式 evidence
- 用低质量全株图强推 identity 结果

---

#### B-5. 后续 question_queue

question_queue 此时应优先生成补图问题，而不是过早进入细分 diagnosis 问题。

例如：

1. 请补一张更清晰的叶片近照
2. 请补一张主体更大的全株图
3. 如可行，请补一张茎部图

---

#### B-6. 这个分支证明了什么

这个分支证明：

### **图像质量不足时，系统的正确动作不是“硬判”，而是“降级、保留、补图优先”**

也就是说：

- 图像质量是限权条件
- route hint 只影响流程
- candidate_retained 不等于正式 evidence
- retake_first 是合法且必要的主动作

---

### 本文件版本状态说明

- 上文全部内容 = 《AI视觉入口层到 Diagnosis 运行时挂接示例 v1》原文，原样保留
- 下文附录 A～B = 本次最高规格 review 后新增的异常 / 降级分支示例
- 二者合并后，共同构成：

### **《AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1（分支场景增补版，完整最终版）》**



## [S29] HF_AutoTrain真实推理接入与标签映射规范_v1

- 文件名：`HF_AutoTrain真实推理接入与标签映射规范_v1.md`
- 状态：非A类/补充或过程文件
- 类别：模型/HF
- 用途：HF AutoTrain 真实推理入口、标签空间与映射
- SHA-256 前 16 位：`6adfd30d3dae94a8`

---

### HF_AutoTrain真实推理接入与标签映射规范_v1

#### 1. 目标

本文件用于冻结当前仓库里 HF AutoTrain 真实推理链路的实现口径，使其与以下基线保持一致：

- `docs/多图业务融合与当前阶段自有模型技术路线裁决_v1_完整最终版.md`
- `docs/多图业务融合与双模型路线联动增补规范_v1_完整最终版.md`
- `docs/new-rules/视觉模型适配层与双模型多图融合代码落地审查_v1.md`

本轮不是再讨论“HF 要不要接”，而是明确：

1. HF 真实推理如何进入当前运行时
2. HF 原始标签如何映射到标准 `symptom_key`
3. 哪些标签只允许进入流程层，不允许进入事实层

---

#### 2. 当前真实推理入口

当前仓库内已新增：

- `AI-training/inference.py`
- `AI-training/app.py`
- `AI-training/Dockerfile`
- `AI-training/requirements.txt`

当前模型来源：

- `henglidadi/symptoms`

当前服务输出为 HF 原始分类结果，不直接输出 diagnosis，不直接输出 outcome。

当前 HTTP 接口：

##### 2.1 健康检查

`GET /health`

返回：

- `provider`
- `model_name`
- `service_version`
- `labels`

##### 2.2 单图预测

`POST /predict`

输入 JSON：

```json
{
  "image_url": "https://...",
  "image_base64": "data:image/jpeg;base64,...",
  "top_k": 3,
  "input_organ_hint": "leaf"
}
```

说明：

1. `image_url` 与 `image_base64` 二选一
2. `input_organ_hint` 仅作为服务层补图提示的辅助输入，不构成事实

输出 JSON：

```json
{
  "provider": "hf_autotrain",
  "model_name": "henglidadi/symptoms",
  "service_version": "hf_inference_service_v1",
  "top_label": "yellowing",
  "predictions": [
    { "label": "yellowing", "score": 0.69 }
  ],
  "image_quality_grade": "medium",
  "analyzability": "medium",
  "suggested_followup_capture": [],
  "normalization_notes": [],
  "image_meta": {
    "width": 640,
    "height": 419,
    "mode": "RGB"
  }
}
```

注意：

1. 这是 HF 原始推理输出，不是最终业务 contract
2. 标准化仍由 `hf_autotrain_visual_adapter` 完成

---

#### 3. 当前标签空间

当前模型配置已验证标签共有 4 个：

1. `yellowing`
2. `brown_spots`
3. `healthy`
4. `bacterium`

当前标签空间明显小于正式视觉症状标准化字典，因此必须通过映射层进入统一 contract。

---

#### 4. 当前正式映射口径

当前映射文件：

- `cloudfunctions/diagnose-http/constants/hf-autotrain-label-map.js`

##### 4.1 yellowing

映射为：

- `symptom_key = leaf_yellowing`

口径：

1. 这是直接映射
2. 允许进入候选层
3. readiness 按分数带状转换

##### 4.2 brown_spots

当前映射为：

- `symptom_key = brown_spots_halo`

但必须明确：

1. 这是一个**保守降级映射**
2. `brown_spots` 原标签颗粒度比 `brown_spots_halo` 更宽
3. 因此当前实现会：
   - 降低置信
   - 将 readiness 上限压到 `cautious`
   - 写入 `normalization_notes`

当前备注固定写入：

- `hf_label_brown_spots_mapped_to_brown_spots_halo`

这意味着：

> 当前 `brown_spots` 不是“无条件 admitted 的标准事实”，而是“受约束映射后的视觉候选”。

##### 4.3 healthy

`healthy` 当前**不允许**直接进入 evidence。

当前实现口径：

1. 不生成正式症状 candidate
2. 只在高分时写入流程层 `route_hints`
3. 固定写入备注：
   - `hf_label_healthy_not_written_to_evidence`

对应原因：

1. `healthy` 不是视觉症状键
2. 第一版非问题性结论必须更保守
3. route hint 不能反写事实层

因此当前行为是：

> `healthy` 只作为“可能的非问题性信号”，不能直接作为 diagnosis 事实输入。

##### 4.4 bacterium

`bacterium` 当前同样**不允许**直接进入 evidence。

当前实现口径：

1. 不生成正式症状 candidate
2. 只在高分时写入流程层 `route_hints`
3. 固定写入备注：
   - `hf_label_bacterium_not_written_to_evidence`

对应原因：

1. `bacterium` 属于解释型 / 病因型标签，不是视觉症状键
2. 当前正式基线要求 HF 与混元都统一停留在“视觉症状层”
3. 这类标签只能触发更保守的 follow-up 或交给混元 / 业务层继续判定

因此当前行为是：

> `bacterium` 只作为“模型输出了超颗粒度解释型标签”的流程提示，不能直接作为 diagnosis 事实输入。

---

#### 5. 运行时接入位置

当前 HF 真实链路已进入：

- `cloudfunctions/diagnose-http/services/visual-adapters/hf-autotrain-visual-adapter.js`

当前 adapter 支持两种输入模式：

##### 5.1 真实 endpoint 模式

当配置：

- `HF_AUTOTRAIN_ENDPOINT`

时，adapter 会直接调用：

- `POST {endpoint}/predict`

##### 5.2 预计算结果兼容模式

当图片输入中自带：

- `hfStructuredOutput`
- `hfClassificationResult`
- `precomputedClassification`

时，adapter 会直接吃预计算结构，不强依赖 endpoint。

这保证：

1. 新的真实链路可用
2. 旧的 shadow compare 预计算输入不会被改坏

---

#### 6. 当前配置口径

当前配置文件：

- `cloudfunctions/diagnose-http/configs/index.js`

已新增：

```js
llm: {
  hfAutotrain: {
    endpoint: process.env.HF_AUTOTRAIN_ENDPOINT,
    apiKey: process.env.HF_AUTOTRAIN_API_KEY,
    timeoutMs: process.env.HF_AUTOTRAIN_TIMEOUT_MS,
    topK: process.env.HF_AUTOTRAIN_TOP_K,
    modelName: process.env.HF_AUTOTRAIN_MODEL_NAME
  }
}
```

说明：

1. HF endpoint 不再硬编码进业务逻辑
2. 主链与 shadow compare 都可复用同一 HF service
3. 是否启用仍由：
   - `LLM_SERVICE`
   - `LLM_SHADOW_SERVICE`
   控制
4. 若服务端启用鉴权，则：
   - Python service 使用 `HF_SERVICE_API_KEY`
   - Node adapter 使用 `HF_AUTOTRAIN_API_KEY`
5. 当前默认 `HF_AUTOTRAIN_TIMEOUT_MS` 已提升到 `60000`，用于覆盖首次冷启动拉取权重的耗时

---

#### 7. 当前与多图规范的关系

当前实现已经满足：

1. HF 仍然是**单图识别器**
2. 多图融合仍由业务层完成
3. HF 不直接写 diagnosis
4. HF 不单独分叉业务流
5. HF 输出仍进入统一 `visual_normalized_image_result`

因此当前落地是：

> HF 真实推理已经接通到统一适配层，但多图 contract、聚合、admission、evidence 主链仍然只有一套。

---

#### 8. 已验证事项

当前已完成本地验证：

1. `AI-training/main.py` 单图 CLI smoke
2. `AI-training/app.py` 本地 `/health`
3. `AI-training/app.py` 本地 `/predict`
4. Node 侧 `hf_autotrain_visual_adapter` 真实 endpoint 调用
5. Node 侧 `hf_autotrain_visual_adapter` 预计算结果兼容调用
6. 首次冷启动下载权重后，Node 侧在 `60000ms` 默认超时下可正常完成真实 endpoint 调用

---

#### 9. 当前仍保留的边界

虽然 HF 真实推理链路已经在仓库中成立，但仍有以下边界未闭合：

1. 还没有正式部署到 CloudBase CloudRun
2. 还没有把正式 endpoint 回填到云端运行环境变量
3. `brown_spots -> brown_spots_halo` 仍属于过渡映射，不是颗粒度完全一致的最终解

因此当前最准确结论是：

> HF 已不再只是“契约级空壳适配器”，而是已经具备真实推理服务与真实 adapter 调用链；但正式云端 endpoint 和更细粒度标签体系仍属于下一阶段工作。



## [S30] shadow_compare数据留痕与HF灰度接入边界_v1

- 文件名：`shadow_compare数据留痕与HF灰度接入边界_v1.md`
- 状态：非A类/补充或过程文件
- 类别：模型/HF/灰度
- 用途：shadow_compare 数据留痕与 HF 灰度接入边界；主链与对照链隔离
- SHA-256 前 16 位：`b0d1b9141983c015`

---

### shadow_compare数据留痕与HF灰度接入边界_v1

#### 1. 本轮目的

本文件用于说明当前仓库中已经落地的 `shadow compare` 能力，以及当前 HF 接入仍然受限的边界。

适用对象：

- `cloudfunctions/diagnose-http`
- 多图视觉入口
- 双模型灰度过渡

---

#### 2. 当前已落地能力

##### 2.1 主链与对照链已隔离

当前代码已经保证：

- 主链仍由主模型适配器输出驱动
- shadow compare 只做对照留痕
- shadow 结果不进入：
  - `admission_records`
  - `observed_evidence_set`
  - `diagnosis` 排序

因此当前已满足：

> 允许 shadow compare，但不允许污染主链。

---

##### 2.2 当前已实现的配置入口

文件：

- `cloudfunctions/diagnose-http/configs/index.js`

当前支持配置：

```js
llm: {
  service: 'hunyuan',
  model: 'hunyuan-t1-vision-20250916',
  shadowService: '',
  shadowModel: ''
}
```

说明：

- `service/model` 定义主识别源
- `shadowService/shadowModel` 定义对照链来源
- 当 `shadowService` 为空时，shadow compare 关闭

---

##### 2.3 当前已实现的适配器层

文件：

- `cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js`
- `cloudfunctions/diagnose-http/services/visual-adapters/hf-autotrain-visual-adapter.js`
- `cloudfunctions/diagnose-http/services/visual-adapters/index.js`

当前状态：

- 混元适配器可直接调用现有视觉主链
- HF 适配器已支持两种输入：
  - 预计算分类结果
  - 真实 HTTP inference service
- 适配器已支持 `adapterMetaOverride`

这意味着：

- 切换上游来源不需要改 diagnosis 主链
- 主链与对照链都能投影到统一标准化对象

---

##### 2.4 当前已实现的 shadow 留痕位置

文件：

- `cloudfunctions/diagnose-http/services/visual-diagnosis-service.js`

shadow compare 结果当前会进入：

1. `visual_raw_image_records.raw_structured_output.shadow_compare`
2. `visual_normalized_image_results.pattern_candidates_json` 中的：
   - `shadow_compare_enabled`
   - `shadow_compare_status`
   - `shadow_compare_provider`
   - `shadow_compare_model_name`
   - `shadow_compare_adapter_name`
3. `visual_call_aggregate_result.aggregate_summary_json.shadow_compare_summary`

因此当前已经具备：

- 逐图留痕
- 单图标准化层留痕
- 批次级汇总留痕

##### 2.5 当前已实现的公开结果出口

当前以下对外结果对象已可带出 shadow 相关摘要：

1. `/diagnosis/start`
2. `/diagnosis/answer`
3. `/diagnosis/result`
4. 最终快照与 runtime snapshot

当前公开字段包括：

- `visualBatchTrace`
- `visualAggregateSummary`
- `shadowCompareSummary`

说明：

- 公开结果只暴露批次摘要与 compare 摘要
- 不直接把内部 candidate 层和 shadow 原始结构整包暴露到客户端

---

#### 3. 当前 shadow compare 状态定义

##### 3.1 单图级状态

当前支持以下状态：

- `disabled`
- `succeeded`
- `failed`
- `skipped_no_shadow_input`

说明：

- 当配置未开启 shadow compare 时，状态为 `disabled`
- 当配置开启但当前图片没有可用 HF 输入时，状态为 `skipped_no_shadow_input`
- 这样不会把“没提供 shadow 输入”误记成模型失败

##### 3.2 批次级状态

当前 `shadow_compare_summary.compare_status` 可能为：

- `disabled`
- `partial_or_succeeded`
- `skipped`
- `failed`

并同时记录：

- `compared_image_count`
- `succeeded_image_count`
- `skipped_image_count`
- `failed_image_count`
- `providers`
- `model_names`

---

#### 4. 当前 HF 接入边界

##### 4.1 已具备的部分

当前已经具备：

- HF 统一适配器接口
- HF 结果标准化出口
- HF 作为 shadow compare 源的运行时接线

##### 4.2 尚未具备的部分

当前仓库内已经具备：

- `AI-training/app.py` 真实推理服务
- `AI-training/inference.py` 模型加载与预测逻辑
- `hf_autotrain_visual_adapter` 的真实 HTTP inference client

但当前仍未具备：

- 已部署并固定的 CloudRun endpoint
- 已写入云端环境变量的正式地址与密钥

因此当前最准确的表述应更新为：

> HF 真实推理链路已经在仓库内成立，并已本地验证通过；但正式云端 deployment 与运行环境配置仍未完成。

---

#### 5. 当前可用接入方式

如果后续要在不改主链的前提下启用 HF shadow compare，当前最短路径是：

1. 保持主链 `service = hunyuan`
2. 打开 `shadowService = hf_autotrain`
3. 二选一：
   - 配置 `HF_AUTOTRAIN_ENDPOINT`
   - 或继续在每张图片输入里补充预计算分类结果

预计算兼容格式例如：

```json
{
  "imageRef": "xxx",
  "inputSlotType": "leaf",
  "shadowStructuredOutput": {
    "predictions": [
      {
        "label": "leaf_yellowing",
        "score": 0.91,
        "display_name_cn": "叶片黄化"
      }
    ]
  }
}
```

配置真实 endpoint 时：

- 混元仍负责主链
- HF 会在 shadow compare 中直接调用真实推理服务
- 主 diagnosis 不受影响

配置预计算结构时：

- 混元仍负责主链
- HF 仅作为对照链被记录
- 主 diagnosis 不受影响

---

#### 6. 下一阶段建议

若继续推进，优先级建议如下：

1. 把 HF service 部署到 CloudRun
2. 回填正式 `HF_AUTOTRAIN_ENDPOINT`
3. 用现有离线脚本持续形成 compare 数据基线
4. 再决定是否把 HF 从 shadow 提升到某些稳定症状的主识别源

当前已新增离线评估脚本：

- `scripts/terminal-e2e/report-shadow-compare.mjs`

运行方式：

```bash
npm run report:shadow-compare -- --input path/to/json-or-dir
```

脚本输入支持：

- 单个诊断结果 JSON
- 结果详情导出目录
- JSON 数组

脚本输出包括：

- case 级 compare 状态
- compare 图像数汇总
- provider / model 分布
- 批次 ID 与 route primary action 对照信息

当前不建议直接跳到“HF 主链切换”，因为：

- 真实推理链路还没接通
- compare 数据还没形成稳定评估闭环

---

#### 7. 结论

当前 shadow compare 已从“文档要求”变成“代码中存在的灰度留痕能力”。  
它已经满足最关键的规范要求：

- 可以开启双模型对照
- 主链仍保持单一
- shadow 结果不会污染 admitted 主结果
- 已具备离线 compare 报表能力

但当前仍不能宣称“HF 已正式接入上线”，因为在线推理链路和正式部署配置仍未具备。



## [S31] 症状模式分流机制与运行时流程规范（最终完整版）

- 文件名：`症状模式分流机制与运行时流程规范_最终完整版.md`
- 状态：非A类/补充或过程文件
- 类别：症状模式
- 用途：symptom_class 分流机制最终版；知识入库、策略运行时
- SHA-256 前 16 位：`c848ab0538092e8c`

---

### 症状模式分流机制与运行时流程规范（最终完整版）

> 本文档是在以下两份文档基础上，经过再次完整 review、去重、合并、收紧、补漏洞后形成的**最终完整版**：
>
> - 《症状模式分流机制与运行时流程规范.md》
> - 《症状模式机制高规格Review_v1.md》
>
> 本文档的定位不是“讨论稿”，而是后续数据设计、诊断引擎实现、问诊分流实现、Codex 落地、Review 审查的统一依据。  
> 本文档坚持**中文一等公民**：中文名称、中文解释、中文规则优先；英文仅作为技术键名或补充术语。

---

### 0. 文档目标

本文档用于正式落地“**症状模式**”这一层，使植物诊断系统从：

```text
AI symptom
→ 直接 problem ranking
→ 直接问诊
```

升级为：

```text
AI symptom
→ 症状模式（symptom_class）
→ 模式约束下的候选问题 / 候选题组
→ 精排 follow-up
→ 二轮评分
→ 最终诊断
```

本文档要解决的核心问题是：

1. 为什么当前问诊会发散
2. 为什么 `pattern_key` 不能替代“症状模式”
3. 为什么不应该用纯 SQL 或纯硬编码实现分流
4. 哪些知识应该入库
5. 哪些裁决必须在运行时完成
6. 运行时应如何稳定地做 class 计算、切组、切 class、低置信兜底
7. 当前 review 发现了哪些漏洞，最终怎么收紧

---

### 1. 最终结论

#### 1.1 大方向结论

结论已经足够明确：

```text
症状模式这条路线是对的，而且是当前 Diagnose-process 从“能跑”升级到“稳定收敛”所必需的一层。
```

没有这一层，系统会持续出现：

- 视觉证据在 A 方向，问诊却跑去问 B 方向
- 高置信 AI symptom 被重复确认题复读
- 黄叶、叶斑、虫害等复杂模式无法形成稳定的问诊路径
- `problem` 和 `question` 之间缺少可靠桥梁

---

#### 1.2 架构结论

最终不采用：

- **纯 SQL 决策**
- **纯硬编码 if/else 决策**

最终采用：

```text
数据库 / 数据表：存分流知识、映射、基础优先级、审计状态
运行时代码：做分流裁决、状态机、重排、去重、切组、切 class、低置信兜底
```

一句话就是：

```text
知识放数据库，策略放运行时。
```

---

#### 1.3 review 结论

对原两版文档再次审查后的最终结论是：

```text
原始方向正确，但原文还不够“可直接无风险交给 Codex 落库实现”。
```

主要问题集中在：

- 症状模式的定义虽对，但硬约束不够
- 运行时切组 / 切 class / soft gate / hard gate 没有完全钉死
- pseudo-symptom（上下文伪症状）和真正视觉症状没有彻底分层
- 当前 `class_question_group_strategy` 的 role / priority / class 边界仍需收紧
- `symptom_class` 的“权威性”需要用正确方式理解，不可伪装成逐行外部同名权威词典

因此，本最终版已经把这些问题全部吸收并收紧。

---

### 2. 先把概念钉死：五层症状结构

为了避免后续再次混淆，这里把症状相关的五个维度一次性钉死。

#### 2.1 `location_key`：发生部位

回答：

```text
症状长在哪
```

例如：

- `leaf`
- `root`
- `stem`
- `flower`
- `soil`

---

#### 2.2 `pattern_key`：表象形态

回答：

```text
这个症状从外观看起来是什么形态
```

例如：

- `spots`
- `mold`
- `odor`
- `blister`
- `drop`
- `chew`
- `insects_visible`

##### 关键判断
`pattern_key` 是**形态标签**，不是诊断分流模式。  
它描述“长什么样”，不描述“后面该怎么问”。

---

#### 2.3 `distribution_key`：分布方式

回答：

```text
这个症状怎么分布
```

例如：

- `random`
- `edges`
- `base`
- `clustered`
- `vein_limited`

---

#### 2.4 `symptom_type`：证据属性

回答：

```text
这个 symptom 属于哪类证据来源
```

例如：

- `visual`
- `diagnostic`
- `environmental`

##### 关键判断
`symptom_type` 是证据来源分类，不是问诊模式。

---

#### 2.5 `symptom_class`：症状模式

正式中文名：**症状模式**  
英文技术键名：`symptom_class`

它回答：

```text
当前 symptom 一旦出现，
系统后续应该进入哪一种诊断模式 / 问诊模式
```

##### 最关键判断

```text
pattern_key ≠ symptom_class
symptom_type ≠ symptom_class
```

- `pattern_key` 是底层外观
- `symptom_type` 是证据属性
- `symptom_class` 是分流桥梁

---

### 3. 为什么必须新增症状模式层

#### 3.1 当前系统的结构性缺口

如果直接走：

```text
AI visual symptom
→ problem ranking
→ question strategy
```

问题会非常明显：

1. visual symptom 和 follow-up 之间没有稳定桥梁
2. 问题会发散到与当前视觉证据无关的方向
3. AI 已高置信识别的 symptom 会被同义重复题反复确认
4. 黄叶、叶斑、虫害、根腐等复杂场景没有进入“正确模式”的过程
5. question selector 容易只看 `top problem`，忽略视觉模式本身

---

#### 3.2 症状模式层的价值

引入症状模式后，链路变为：

```text
AI visual symptom
→ 症状模式
→ 症状模式约束下的候选题组
→ 题组内精排
→ 二轮评分
→ 最终诊断
```

它带来的收益是：

- 先收窄方向，再做精排
- 先限制题组，再选问题
- 先让 follow-up 问“这类问题该问的”，再问“具体是哪一个”
- 让 AI symptom 和 follow-up 之间建立稳定桥梁

---

### 4. 首批应支持的症状模式

当前建议先正式落地以下主模式。

#### 4.1 `yellowing_mode`：黄叶模式

适用症状示例：

- `leaf_yellowing`
- `interveinal_chlorosis`
- `yellow_new_leaves`
- `yellow_lower_leaves`
- `uniform_yellowing`

目标：

- 先区分新叶黄 / 老叶黄
- 先区分脉间黄化 / 整片黄化
- 先区分湿土萎蔫 / 干土萎蔫
- 再细分缺铁、缺氮、缺镁、弱光、根系问题等

##### 硬规则
黄叶类必须单独走 `yellowing_mode`，不得与通用 symptom 混流。

---

#### 4.2 `fungal_leaf_spot_mode`：真菌叶斑模式

适用症状示例：

- `brown_spots_halo`
- `black_spots_spreading`
- `necrotic_leaf_spots`

目标：

- 优先判断是否为病原性扩展型叶斑
- 在真菌叶斑方向做分流

---

#### 4.3 `bacterial_leaf_spot_mode`：细菌叶斑模式

适用症状示例：

- `angular_spots`
- `water_soaked_spots`
- `vein_limited_spots`

目标：

- 优先识别角形斑、水浸状斑、叶脉限制等细菌性特征
- 与真菌叶斑、非病原性褐斑拉开差距

---

#### 4.4 `sap_sucking_honeydew_pest_mode`：刺吸蜜露型虫害模式

适用症状示例：

- `sticky_honeydew`
- `sooty_mold`
- `white_flies`
- `aphids_visible`
- `scale_shells`
- `mealybugs_visible`

目标：

- 先收敛到“蜜露型刺吸害虫”
- 再在蚜虫、白粉虱、介壳虫、粉蚧之间做内部细分

---

#### 4.5 `mite_damage_mode`：螨害模式

适用症状示例：

- `fine_webbing`
- `yellow_speckling`
- `stippling`
- `tiny_red_dots`

目标：

- 优先确认是否是红蜘蛛/螨类方向
- 避免跳到与螨害无关的问题

---

#### 4.6 `root_rot_wet_wilt_mode`：湿土萎蔫/根腐模式

适用症状示例：

- `wilting_wet_soil`
- `bad_root_smell`
- `roots_black`
- `roots_mushy`

目标：

- 把“湿土也发蔫”优先收敛到根区问题
- 在根腐、根系胁迫、冠腐、过湿背景之间分流

---

#### 4.7 `soil_moisture_pest_mode`：盆土过湿相关模式

适用症状示例：

- `small_flies_soil`
- `mold_on_soil`
- `soil_stays_wet`
- `soil_smell`

目标：

- 收敛真菌蚊、盆土长期过湿、介质状态异常等问题

---

#### 4.8 `soft_rot_mode`：软腐/茎腐模式

适用症状示例：

- `soft_stem`
- `water_soaked_stem`
- `stem_collapse`

目标：

- 在软腐、细菌性腐烂、湿度过高背景中快速确认高风险方向

---

#### 4.9 `chewing_pest_mode`：咀嚼损伤模式

适用症状示例：

- `holes_in_leaf`
- `chewed_edges`
- `skeletonized_leaves`
- `slime_trails`

目标：

- 在毛虫、甲虫、蜗牛/蛞蝓等方向中做内部细分

---

#### 4.10 `powdery_growth_mode`、`gray_mold_mode`、`rust_mode`、`virus_mosaic_mode`

这些模式的特异性较强，可作为较高特异度模式保留。

##### 注意
即便这些模式特异性较强，也不意味着运行时一定使用硬白名单。  
默认仍应先作为 **strong soft gate**，而不是一上来就做绝对硬排除。

---

### 5. 数据层与运行时的最终分工

#### 5.1 必须数据化落库的内容

这些是“知识”，必须进入数据库或等价的数据包。

##### A. `symptom -> symptom_class` 映射
例如：

- `brown_spots_halo -> fungal_leaf_spot_mode`
- `angular_spots -> bacterial_leaf_spot_mode`
- `interveinal_chlorosis -> yellowing_mode`

---

##### B. `symptom_class -> question_group` 映射
例如：

- `yellowing_mode -> yellowing_confirm_group`
- `yellowing_mode -> yellowing_split_group`
- `fungal_leaf_spot_mode -> fungal_leaf_spot_confirm_group`

---

##### C. `question_group -> question` 候选与基础优先级
例如：

- 该组有哪些题
- 每题基础优先级
- 该题的角色（确认 / 分叉 / 排异 / 背景）

---

##### D. `question -> mapped symptom`
依然走现有 `question_option_mapping` 体系。

---

##### E. 数据审计元信息
包括：

- `data_status`
- `data_source`
- `audit_note`

---

#### 5.2 必须在运行时完成的内容

这些是“策略”，不适合纯 SQL。

##### A. class 计算
输入：

- visual symptoms
- confidence
- plant context

输出：

- `primaryClass`
- `secondaryClasses`
- `classScores`

---

##### B. question selector
必须动态处理：

- class-gating
- top problems
- 已问问题去重
- overlap penalty
- observability
- unknown 切组
- class 切换
- 低置信兜底

---

##### C. 会话状态机
必须管理：

- 当前轮次
- 当前 class
- 当前 group
- `unknownCountInGroup`
- `askedQuestionIds`
- `answeredQuestionIds`

---

##### D. 低置信收尾
例如：

- 补图建议
- 看根 / 看叶背 / 看盆土建议
- 低置信 final 输出
- 重新开始诊断建议

---

### 6. 建议新增的数据表

#### 6.1 `symptom_classes`

定义症状模式本身。

##### 字段建议
- `class_key`
- `class_name_cn`
- `description`
- `question_mode`
- `class_level`
- `parent_class_key`
- `data_status`
- `data_source`
- `audit_note`

---

#### 6.2 `symptom_class_mapping`

定义 symptom 到 class 的映射。

##### 字段建议
- `symptom_key`
- `class_key`
- `mapping_strength`
- `is_primary`
- `data_status`
- `data_source`
- `audit_note`

##### 规则
一个 symptom 可以映射多个 class，但必须存在：

- 一个主 class
- 零个或多个次级 class

---

#### 6.3 `class_question_group_strategy`

定义某个 class 下优先用哪些 question group。

##### 字段建议
- `class_key`
- `group_key`
- `group_role`
- `base_priority`
- `allow_when_ai_locked`
- `max_questions_per_round`
- `activation_condition`
- `data_status`
- `data_source`
- `audit_note`

##### `group_role` 枚举
- `confirm`
- `differentiate`
- `exclude`
- `context`

---

### 7. 当前 review 后必须新增的硬约束

以下内容在原始规范里不够硬，这里统一补成正式约束。

#### 7.1 必须定义 `primaryClass / secondaryClasses / classScores`

运行时**不得**只返回一个裸 `class_key`。

必须至少有：

- `primaryClass`
- `secondaryClasses[]`
- `classScores[]`

否则后续：

- 切组
- 切 class
- 低置信判断
- 题组候选池

都会失控。

---

#### 7.2 必须明确：默认 `soft gate > hard gate`

##### 正式规则

```text
症状模式默认只做 soft gate，
只有极高特异模式才允许 hard gate。
```

##### 原因
如果过早用 hard gate，会把跨模式但仍合理的问题直接截断。

##### 默认建议
- `yellowing_mode`：soft gate
- `fungal_leaf_spot_mode`：soft gate
- `bacterial_leaf_spot_mode`：soft gate
- `sap_sucking_honeydew_pest_mode`：soft gate
- `root_rot_wet_wilt_mode`：soft gate
- `virus_mosaic_mode`：可做 stronger soft gate
- `powdery_growth_mode`：可做 stronger soft gate

##### 最终要求
如果要使用 hard gate，必须有显式理由和审计依据。

---

#### 7.3 必须明确：问答后 class 是否允许更新

##### 正式规则
允许更新，但必须是：

```text
有边界的 class score 微调
```

而不是任意跳模式。

##### 允许发生的事
- `primaryClass` 稳定，但 score 上下浮动
- `secondaryClass` 升为 primary
- 当前 class 下的问题问尽后切到 secondary class

##### 不允许发生的事
- 每答一题就大幅随机改 class
- 没有切换条件就自由换模式

---

#### 7.3.1 视觉 `symptom_class` / problem family 必须作为 sticky soft gate

视觉层形成的 `primaryClass`、`secondaryClasses` 以及它们对应的 problem family，默认不是最终结论，但必须作为问诊与 ranking 的 **soft gate / sticky priority**。

##### 正式规则

```text
当前视觉方向成立后，问诊选题与 problem ranking 默认留在该方向及其相邻竞争方向内；
只有出现明确反证，或另一个 family 形成更强正向证据时，才允许切换主方向。
```

##### 必须遵守

- `primaryClass` 决定当前轮的默认问诊方向；
- `secondaryClasses` 只能作为有边界的备选方向，不能覆盖 primary 的 sticky priority；
- problem ranking 可以保留跨 family 候选，但跨 family 候选不得只凭 prior、属级背景或泛化 probe 升为主结论；
- class 切换必须写入审计字段，至少记录切换前后 class、触发证据、反证来源和正向证据来源。

##### 不允许发生

- 视觉方向是 A，用户只否认了 A 的某个细节后，系统无正向证据跳到无关 B；
- 每答一题就让 question selector 重新随机选 family；
- 用宿主常见问题、genus baseline 或历史 prior 推翻当前已接纳的视觉方向；
- 把 `symptom_class` 当成一次性提示，用完后 ranking 完全不受约束。

---

#### 7.3.2 负向回答必须真实抑制对应方向

用户对某个方向的否认，必须降低该方向中对应候选、证据假设或问题分支的权重。

##### 正式规则

```text
否认 A 只能抑制 A 或 A 内部的具体子分支；
否认 A 不能在没有正向证据的情况下，把 B 自动抬成具体结论。
```

##### 例外条件

只有当 B 同时满足以下条件时，才允许从 A 切到 B：

- B 有独立正向证据；
- B 与当前视觉 class 是相邻竞争方向，或已经成为 `secondaryClass`；
- A 的关键证据被明确反证削弱；
- 切换原因可审计。

如果只是“排除了 A，但 B 没有正向证据”，系统应继续追问高价值问题，或在问题耗尽后进入合法 `uncertain`，不得包装成 B 的确定结论。

---

#### 7.3.3 泛化 observed probe 只能低权重支持当前方向

以下这类 observed probe 属于泛化观察维度：

- `distribution_scope`
- `progression`
- `host_confirmation`
- `underside_presence`
- 同类的分布、进展、宿主、部位存在性确认

它们可以帮助系统判断是否继续追问、是否维持当前方向、是否降低某个混淆项，但不能单独形成具体 problem 结论。

##### 正式规则

```text
泛化 observed_probe 只能作为当前方向的低权重支持或继续追问依据；
不能单独把某个具体 problem 推入 output-eligible pool。
```

##### 允许用途

- 维持当前 `primaryClass` 的 sticky priority；
- 在同一 family 内排序高价值问题；
- 判断是否还有继续追问收益；
- 与正式正向证据一起增强解释完整性。

##### 禁止用途

- 只有 `underside_presence=yes` 就输出红蜘蛛、蚜虫或介壳虫；
- 只有 `progression=spreading` 就输出病害；
- 只有 `host_confirmation` 就输出该宿主常见问题；
- 只有 `distribution_scope=many_leaves` 就输出具体养护问题。

---

#### 7.4 pseudo-symptom 必须与视觉主证据隔离

当前数据中这类条目只能作为：

- 上下文补充
- 问诊背景
- explanation 辅助

##### 典型示例
- `watering_excess_background`
- `watering_deficit_background`
- `low_light_context`
- `recent_direct_sun_increase`

##### 正式规则

```text
pseudo-symptom 可以参与 question / context / explanation，
但不得进入 AI visual 主证据分。
```

否则会把“问出来的背景事实”混成“视觉模型识别到的症状”。

---

#### 7.5 必须定义 class 冲突解决规则

当前最明显的冲突区包括：

- `leaf_edge_necrosis_mode`
- `salt_dry_edge_mode`
- `water_stress_mode`

这些模式边界高度重叠。  
如果不钉死冲突规则，运行时会出现：

- 同一症状同时点亮多个 class
- follow-up 题组互相污染
- selector 频繁跳类

##### 正式规则
冲突类之间必须定义：

- 优先级
- 并存条件
- 切换条件
- 是否允许只保留 secondary

---

#### 7.6 必须收紧 `group_role` 的语义

当前原始数据里最大的问题之一，就是：

- `exclude` 被误用成 `differentiate`
- `context` 被误用成 `exclude`
- `confirm` 题太多且与 AI 高置信重复

##### 正式语义

###### `confirm`
用于确认当前模式的核心方向。  
**但当 AI 已高置信锁定时，不应总排第一。**

###### `differentiate`
用于在当前模式内部拉开高价值分叉。  
这是当前最应该前置的一类题。

###### `exclude`
用于排除与当前模式高度相似但不属于本方向的误判。

###### `context`
用于补充环境、养护、背景信息。  
不能长期压过 `differentiate`。

---

#### 7.7 必须加入 telemetry / backtest 设计

如果后续不记录这些，症状模式层很难持续优化：

- 当前 visual symptoms
- 当前 `primaryClass / secondaryClasses`
- 当前选择的 question groups
- 当前选择的问题
- 用户答案
- 最终 top1
- 用户反馈是否准确

##### 正式结论
症状模式不是“一次定完”的层，必须可回测、可修正。

---

#### 7.8 必须正确理解 `audited`

`symptom_class` 与 `class_question_group_strategy` 都属于产品级抽象。  
它们的 `audited` 不应伪装成：

```text
外部资料逐行存在同名表项
```

更合理的定义是：

```text
该抽象与权威症状模式一致，逻辑自洽，可审计，可复盘。
```

这点必须写死，否则后面会出现“假 audited”。

---

### 8. 当前 symptoms 映射的最终 review 结论

#### 8.1 总体结论
当前 `symptom -> symptom_class` 映射整体已经达到：

```text
可用于原型和 v1 级落地
```

但还不是“完全收紧、边界无歧义”的最终版。

---

#### 8.2 高价值且基本正确的方向

##### A. 叶斑类
- `brown_spots_halo -> fungal_leaf_spot_mode`
- `black_spots_spreading -> fungal_leaf_spot_mode`
- `angular_spots -> bacterial_leaf_spot_mode`
- `water_soaked_spots -> bacterial_leaf_spot_mode`

##### B. 蜜露型刺吸害虫类
- `sticky_honeydew -> sap_sucking_honeydew_pest_mode`
- `sooty_mold -> sap_sucking_honeydew_pest_mode`
- `white_flies -> sap_sucking_honeydew_pest_mode`
- `scale_shells -> sap_sucking_honeydew_pest_mode`

##### C. 根腐/湿土萎蔫类
- `wilting_wet_soil -> root_rot_wet_wilt_mode`
- `bad_root_smell -> root_rot_wet_wilt_mode`
- `roots_black -> root_rot_wet_wilt_mode`
- `roots_mushy -> root_rot_wet_wilt_mode`

##### D. 咀嚼损伤类
- `holes_in_leaf -> chewing_pest_mode`
- `chewed_edges -> chewing_pest_mode`
- `skeletonized_leaves -> chewing_pest_mode`
- `slime_trails -> chewing_pest_mode`

这些模式与权威园艺资料中的常见症状模式基本一致。([rhs.org.uk](https://www.rhs.org.uk/problems/chlorosis?utm_source=chatgpt.com))

---

#### 8.3 需要重点收紧的映射

##### 1. `purple_leaves`
不应默认归入黄叶模式。  
更像：

- 缺磷
- 低温
- 广义胁迫
- 花青素积累

建议：
- 改入 `nutrient_stress_mode`
- 或作为 `temperature_stress_mode / general_stress_mode` 的次级映射

##### 2. `vein_darkening`
不宜直接放进黄叶主模式。  
更像伴随征象，应降级。

##### 3. `leaf_curl`
过于泛化。  
只能作为 `general_stress_mode` 低优先级兜底，不应前置。

##### 4. `small_leaves`
仅归 `light_stress_mode` 过窄。  
应允许：

- `light_stress_mode`
- `nutrient_stress_mode`
- `general_stress_mode`

的多重可能。

##### 5. `leaf_margin_necrosis`
与：
- `salt_dry_edge_mode`
- `water_stress_mode`

高度重叠。  
如果保留独立 mode，必须写明冲突处理规则。

##### 6. `edema / blister_like_bumps`
可以保留在 `root_rot_wet_wilt_mode` 邻域，但必须明确：

```text
它们是过湿/高湿的生理反应，
不等于根腐本体。
```

所以不能直接给根腐强加分。

##### 7. pseudo-symptom
保留合理，但必须与视觉主证据隔离。

---

### 9. 当前 class_question_group_strategy 的最终 review 结论

#### 9.1 总体结论
当前初版表已经能作为：

```text
class -> question_group 候选池
```

的 v1 数据基础。  
但不能原样视为最终版。

---

#### 9.2 高优先级必须调整的组

##### 1. `bacterial_leaf_spot_mode / leaf_margin_necrosis_context_group`
当前标成 `exclude` 不合理。  
更应是 `differentiate`。

##### 2. `sap_sucking_honeydew_pest_mode / black_mold_growth_confirm_group`
更适合 `context`，不是 `exclude`。

##### 3. `soil_moisture_pest_mode / stem_collapse_context_group`
更适合 `context`，不应标成 `exclude`。

##### 4. `soft_rot_mode / water_soaked_stem_confirm_group`
与另一个 confirm 组重复过高，应调整为 `differentiate`。

##### 5. `virus_mosaic_mode / leaf_twist_confirm_group`
更适合作为 `context`，而不是强 differentiate。

---

#### 9.3 中优先级需要调整的组

包括但不限于原 review 中指出的若干行：

- 部分 confirm 组重复度太高
- 部分 differentiate 组仍不够强
- fallback 模式优先级偏高
- 与 AI 已高置信 visual evidence 存在重复

##### 最关键原则
不能让 selector 出现：

```text
AI 已高置信看到了它，
系统又先问一遍“有没有这个”
```

---

### 10. 最终运行时流程规范

#### 10.1 首轮流程

```text
DiagnosePopup 上传图片
→ identify-http
→ 产出 visual symptoms
→ 规范化 visual symptoms
→ symptom-classifier 计算 primary/secondary class
→ class-gated candidate problems
→ 首轮评分
→ class-gated question groups
→ question selector 选出当前轮 follow-up
```

---

#### 10.2 二轮流程

```text
用户回答 follow-up
→ option mapping 转成 diagnostic symptoms / penalties
→ 更新 class score（必要时可切组 / 切 class）
→ 二轮评分
→ 生成下一轮 follow-up 或最终结果
```

---

#### 10.3 最终输出

```text
finalResult
= 只允许 root cause

contributingFactors
= predisposing_factor

intermediateStates
= result_state / aggregate_cluster
```

---

### 11. question selector 的最终规则

#### 11.1 选题目标
question selector 的目标不是“问最像的一题”，而是：

```text
在当前症状模式下，
优先问最能区分 top problems、
且不重复 visual evidence、
且用户最容易判断的问题。
```

---

#### 11.2 建议公式

```text
QuestionPriority
=
Distinguishability
× ObservabilityFactor
× PriorityFactor
× NonRedundancyFactor
× ClassFitFactor
```

##### 说明
- `Distinguishability`：区分价值
- `ObservabilityFactor`：用户容易判断程度
- `PriorityFactor`：基础优先级
- `NonRedundancyFactor`：与视觉症状/已问题的重复惩罚
- `ClassFitFactor`：与当前症状模式的契合度

---

#### 11.3 follow-up 去重硬规则

```text
区分题 > 排异题 > 上下文题 > 重复确认题
```

##### 强制规则
如果 AI 已高置信识别某 symptom：

- 同义重复确认题不得排第一优先级

---

### 12. unknown 机制最终规则

#### 12.1 正式语义
- `unknown = 0`
- 不加分
- 不减分

#### 12.2 必须记录的状态
- `currentClassKey`
- `currentGroupKey`
- `unknownCountInGroup`
- `askedQuestionIds`
- `answeredQuestionIds`

#### 12.3 切组规则
同一组连续 `unknown >= 2`：

- 当前组优先级下降
- 切到当前 class 下下一组高价值问题

#### 12.4 切 class 规则
只有满足下列条件之一才允许切到 secondary class：

- 当前 class 下高价值问题已问尽
- 当前 class 下大量 unknown
- 当前 class 与 top problems 明显冲突
- 低置信兜底触发

---

### 13. 低置信兜底规范

如果出现：

- top1 分数低
- top1 与 top2 差距小
- 用户大量 `unknown`
- 当前 class 下问题问尽

则必须进入低置信兜底，而不是继续凑题数。

##### 允许的兜底结果
- 输出低置信 final
- 建议补拍特定部位
- 建议看根、叶背、盆土
- 建议重新开始诊断

---

### 14. 推荐目录 / 文件落点

建议在：

```text
cloudfunctions/diagnose-http/
```

新增：

#### 14.1 `domain/symptom-classifier.js`
职责：
- 计算 `primaryClass / secondaryClasses / classScores`

#### 14.2 `repositories/symptom-class-repository.js`
职责：
- 读取 `symptom_classes`
- 读取 `symptom_class_mapping`
- 读取 `class_question_group_strategy`

#### 14.3 `domain/question-selector.js`
职责：
- class 内选组
- 组内选题
- 去重
- unknown 流转
- 切组 / 切 class
- 低置信兜底

#### 14.4 `constants/class-switch-rules.js`
职责：
- 切组 / 切 class 阈值
- soft gate / hard gate 边界
- fallback 规则

---

### 15. 最终落地建议

#### 15.1 先做什么
1. 明确 `symptom_class` 的最终字段与审计语义
2. 收紧 `symptom -> class` 映射中的风险项
3. 把 `class_question_group_strategy` 做成 v2
4. 再实现 `symptom-classifier + question-selector`

#### 15.2 暂时不要做什么
- 不要直接把 initial 表原样上线
- 不要在没有 classScore / switchRule 的情况下开始写运行时代码
- 不要把 pseudo-symptom 混进 visual 主证据分
- 不要把 `pattern_key` 当作 `symptom_class`

---

### 16. 最终一句话结论

```text
症状模式分流机制的最终正确落地方式是：
把“模式知识”做成可审计的数据层，
把“模式裁决”做成可控的运行时引擎，
并且用收紧后的 v2 数据而不是 initial 草稿直接驱动 Diagnose-process。
```



## [S32] 症状模式（symptom_class）更新专项 Review

- 文件名：`SYMPTOM_CLASS_REVIEW_AND_UPDATE.md`
- 状态：非A类/补充或过程文件
- 类别：症状模式/审查
- 用途：symptom_class 更新专项 review；缺口与修正要求
- SHA-256 前 16 位：`bcfa25c1dec62ec9`

---

### 症状模式（symptom_class）更新专项 Review

#### 结论

对这次写入的两份文档：

- `AI_DIAGNOSIS_MASTER_SPEC_v2.md`
- `AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md`

我的高规格 review 结论是：

```text
方向正确，而且必须保留；
但当前文档仍有 8 个会影响 Diagnose-process 稳定落地的缺口，
如果不补，Codex 很容易把 symptom_class 做成“概念存在、运行时失效”的半成品。
```

---

#### 一、已成立的部分

##### 1. 已正确区分 symptom_type 与 symptom_class
这是正确的，必须保留。

- `symptom_type` 负责证据来源属性
- `symptom_class` 负责诊断分流模式

这是当前系统从“症状词典”升级为“可收敛问诊系统”的关键一步。

##### 2. 已把 symptom_class 放入运行时分层
这点也是对的。

因为 symptom_class 不是 question selector 的微调参数，而是：

```text
AI symptom → follow-up 之间的中间桥梁层
```

所以放进 MASTER SPEC 主体而不是只写进 addendum，是正确决策。

##### 3. 已把 symptom_class 写进 Codex 极简摘要
这也对。

因为如果只写在 MASTER SPEC，不写进极简摘要，Codex 很容易继续按旧链路：

```text
AI symptom → problem → question
```

---

#### 二、当前文档的关键缺口

#### 缺口 1：没有写死 symptom_class 与 pattern_key / location_key / distribution_key 的关系

##### 问题
现在文档说了：

- `symptom_class != symptom_type`

但还没有正式写死：

```text
symptom_class 不是 pattern_key 的替代品，
而是建立在 location / pattern / distribution 等底层属性之上的上层分流维度
```

##### 风险
Codex 很可能直接把：

- `pattern_key`
- `symptom_class`

做成二选一，甚至拿 `pattern_key` 直接顶掉 `symptom_class`。

##### 建议
在 MASTER SPEC 里补一条硬规则：

```text
location_key / pattern_key / distribution_key 保留为“表象描述层”；
symptom_class 作为“问诊分流层”新增；
两者不得互相替代。
```

---

#### 缺口 2：没有写死一个 symptom 是否允许多 class 映射

##### 问题
当前文档写了“主 class + 次级映射”的方向，但没有明确成硬结构。

##### 风险
Codex 可能直接偷懒：
- 每个 symptom 只给一个 class
- 不支持 secondary class
- 以后复杂 symptom 无法扩展

例如：
- `leaf_twist`
- `patchy_browning`
- `distorted_growth`

这类都可能跨多个模式。

##### 建议
正式规定：

- 每个 symptom 必须有 `primary_class_key`
- 允许 0~N 个 secondary class
- secondary 必须有 `mapping_strength`

推荐结构：

- `symptom_classes`
- `symptom_class_mapping`
  - `symptom_key`
  - `class_key`
  - `mapping_strength`
  - `is_primary`

---

#### 缺口 3：没有写死 class 判断的输入来源优先级

##### 问题
当前文档只说“visual symptom 先归到 symptom_class”，但没规定到底依据什么归类。

##### 风险
Codex 可能：
- 只按 symptom_key 写硬编码
- 或只按 pattern_key 粗暴分类
- 或把 note/data_source 忽略掉

##### 建议
补硬规则：

class 判定优先级应为：

1. `symptom_class_mapping` 显式映射
2. symptom 的强特异 note / source-backed alias
3. `location_key + pattern_key + distribution_key`
4. 仅在无明确映射时才做 fallback heuristics

---

#### 缺口 4：没有写死 class-gated 只是“收窄”，不能“截断”

##### 问题
当前文档写了：

```text
ClassGatedCandidateProblems
=
problems allowed by symptom_class
∩ evidence-hit problems
∩ prior-supported problems
```

这个表达有价值，但如果按“交集”硬做，风险很大。

##### 风险
一旦 class 误判或 mapping 不全，候选问题会被过早截断，直接漏诊。

##### 建议
改成更稳的规则：

```text
symptom_class 用于候选加权和优先级收缩，
默认不作为首轮硬白名单截断；
只有高置信特异 class 才允许更强 gating。
```

也就是说：

- `symptom_class` 优先做 soft gate
- 不要默认做 hard gate

---

#### 缺口 5：没有写死 class 切换规则

##### 问题
现在文档强调了“先按 class 收敛”，但没明确何时允许从一个 class 切到另一个 class。

##### 风险
问诊过程中会卡死在错误模式，或者反过来太容易乱跳。

##### 建议
补规则：

只有以下情况允许切 class：

1. 当前 class 内高价值题已问尽
2. 连续 `unknown >= threshold`
3. top problems 跨多个 class 且分差接近
4. 新增 visual/context evidence 明显指向另一 class

并且每次切 class 必须记录：
- `from_class`
- `to_class`
- `switch_reason`

---

#### 缺口 6：没有写死非视觉 context symptom 是否参与 class

##### 问题
你现在的 `symptoms` 里已经有很多 context / background 项：

- `recent_direct_sun_increase`
- `low_light_context`
- `watering_excess_background`
- `watering_deficit_background`
- `fertilization_gap`

这些并不是 AI visual symptom，但会强影响问诊模式。

##### 风险
如果文档只把 class 理解成 visual-only，Codex 会忽略这些高价值背景信号。

##### 建议
补硬规则：

```text
symptom_class 的触发来源不仅包括 AI visual symptom，
还包括高价值 context symptom / background symptom / diagnostic symptom。
```

也就是：
- visual 可以触发 class
- 问诊答案映射出的背景 symptom 也可以修正 class

---

#### 缺口 7：没有写死 class 与 question_strategy 的关系结构

##### 问题
当前文档只说“symptom_class + top_problem_key 双层选题”，但没规定 question 表结构怎么跟它挂。

##### 风险
Codex 可能继续沿用旧 `question_strategy(problem_key)`，只是临时 if 一层 class。

##### 建议
正式规定：
- `question_strategy` 需要升级支持 `class_key`
- 至少新增一层：
  - `class_key`
  - `problem_key`
  - `question_group_key`
  - `priority`
- 没有 class 命中的问题，不得参与第一轮 follow-up 竞争

---

#### 缺口 8：没有写死 symptom_class 的数据审计要求

##### 问题
MASTER SPEC 里把 symptom_class 当系统概念写进去了，但没规定：
- class 本身是否需要 source
- mapping 是否需要 audited/partial
- 如何处理聚合类/模糊类

##### 风险
后面会出现：
- class 命名很漂亮
- 但完全没有审计状态
- 谁都能随手加一个 mode

##### 建议
明确增加：

###### `symptom_classes`
- `class_key`
- `class_name_cn`
- `class_definition`
- `class_source_basis`
- `data_status`

###### `symptom_class_mapping`
- `symptom_key`
- `class_key`
- `mapping_strength`
- `is_primary`
- `data_status`
- `audit_note`

---

#### 三、我对当前 symptom_class 文档部分的最终评级

##### MASTER_SPEC_v2
**评级：B+**

优点：
- 已经把 symptom_class 升成正式层
- 方向对
- 足以阻止 Codex 完全忽略这一层

问题：
- 结构约束还不够硬
- 容易被实现成“只有概念，没有可靠运行时行为”

##### CODEX_MINIMAL_EXEC_SUMMARY_v2
**评级：A-**

优点：
- 很适合让 Codex 快速抓住主约束
- 文字短，方向清晰

问题：
- 过于极简
- 如果不配合主规范，很容易把 class gating 实现成硬截断或硬编码分流

---

#### 四、这次对 symptoms 的补充结果

我已基于当前 `symptoms` 内容，补充了：

- `symptom_class`
- `symptom_class_cn`
- `symptom_class_status`
- `symptom_class_source`
- `symptom_class_note`

并给出了独立的 `symptom_classes` 参考表。

##### 当前补入的主要模式包括：

- `bacterial_leaf_spot_mode`
- `fungal_leaf_spot_mode`
- `leaf_spot_complex_mode`
- `sap_sucking_honeydew_pest_mode`
- `mite_damage_mode`
- `thrips_damage_mode`
- `chewing_pest_mode`
- `leafminer_mode`
- `root_rot_wet_wilt_mode`
- `soft_rot_mode`
- `yellowing_mode`
- `powdery_mildew_mode`
- `gray_mold_mode`
- `rust_mode`
- `virus_mosaic_mode`
- `water_stress_mode`
- `light_stress_mode`
- `humidity_stress_mode`
- `temperature_stress_mode`
- `general_stress_mode`
- `soil_moisture_pest_mode`
- `mechanical_damage_mode`
- `flower_stress_mode`
- `natural_aging_mode`
- `salt_dry_edge_mode`
- `leaf_edge_necrosis_mode`

##### 这次补充采用的判断原则

不是简单按名字机翻归类，而是综合了：

1. symptom 当前表中的：
   - `location_key`
   - `pattern_key`
   - `distribution_key`
   - `note`
   - `data_source`

2. 权威园艺/病虫害资料对症状模式的归类逻辑：
   - 黄叶 / 缺素 / 脉间黄化
   - 刺吸害虫 / 蜜露 / 煤污
   - 螨害细网 / 点刺失绿
   - 叶斑类病斑 / 水渍斑 / 角形斑 / 同心轮纹
   - 白粉 / 灰霉 / 锈病 / 病毒花叶
   - 过湿 / 根腐 / 水肿 / 排水差
   - 低光 / 日灼 / 低湿 / 温度伤害

---

#### 五、使用提醒

这次补充后的 `symptom_class` 可以先作为：

```text
soft gate / follow-up mode gate
```

来使用。

##### 现阶段不建议直接做：
- 强硬白名单截断
- 一票否决 problem 候选
- 把 class 当最终诊断结果

##### 更稳的用法是：
1. 先作为 question selector 的题组收敛层
2. 再逐步引入 candidate reweight
3. 最后才考虑高置信 class 的强 gating

---

#### 六、一句话结论

```text
这次 symptom_class 方向是对的，而且必须保留；
但文档层还需要再补“关系、映射、切换、审计、软硬 gate 边界”这五类硬约束，
否则 Diagnose-process 仍然可能在实现时失真。
```



## [S33] 症状模式落代码前提条件审查结论 v1

- 文件名：`症状模式落代码前提条件审查结论_v1.md`
- 状态：非A类/补充或过程文件
- 类别：症状模式/开发前置
- 用途：症状模式落代码前必须满足的条件与硬缺口
- SHA-256 前 16 位：`71fd66adca1ebf1e`

---

### 症状模式落代码前提条件审查结论 v1

生成时间：2026-04-22

#### 1. 审查范围

本结论基于以下材料与当前实现交叉核对得出：

- `docs/new-rules/症状模式分流机制与运行时流程规范_最终完整版.md`
- `docs/new-rules/症状模式配套数据_final_candidate说明.md`
- `docs/class_question_group_strategy_final_candidate.csv`
- `docs/class_question_group_strategy_final_candidate.xlsx`
- `docs/symptom_class_row_review_final_candidate.csv`
- `cloudfunctions/diagnose-http` 当前运行时代码

---

#### 2. 最终结论

结论只有一句：

```text
当前“症状模式”这套方案已经具备进入正式工程化拆解与脚手架开发的条件，
但还不具备直接全量落库并接入现网运行时的前提条件。
```

更具体地说：

- 概念层：基本具备
- 候选数据层：接近具备，但仍有缺口和歧义
- 表结构与持久化层：未具备
- 运行时消费层：未具备

所以当前状态更准确的判断是：

```text
可以开始做 schema / repository / runtime skeleton，
但不能把这批 final_candidate 直接当成“无需再确认即可上线”的最终输入。
```

---

#### 3. 已具备的前提

##### 3.1 概念定义已经足够清晰

`最终完整版` 已经把 runtime 必须具备的核心约束写清楚了，包括：

- 必须有 `primaryClass / secondaryClasses / classScores`
- 默认 `soft gate > hard gate`
- pseudo-symptom 必须与视觉主证据隔离
- `group_role` 语义必须收紧
- session 必须记录 `currentClassKey / currentGroupKey / unknownCountInGroup`

这意味着“症状模式层到底要解决什么问题”已经不是模糊状态，而是明确的运行时契约。

##### 3.2 候选数据已经明显不是初版

`final_candidate说明` 明确说明这不是旧 review 数据，而是与最终完整版规范对齐后的候选最终版。  
`class_question_group_strategy_final_candidate` 已经补入：

- `class_gate_type`
- `class_switch_allowed`
- `unknown_switch_policy`
- `ai_locked_confirm_penalty`
- `pseudo_symptom_allowed`
- `role_semantic_validated`
- `final_review_decision`
- `final_review_note`

`symptom_class_row_review_final_candidate` 也已经补入：

- `primary_class_key`
- `secondary_class_keys`
- `class_mapping_type`
- `visual_scoring_allowed`
- `question_activation_allowed`
- `explanation_only_allowed`
- `class_conflict_note`
- `audited_semantic_note`

这说明数据字段已经朝“可被运行时直接消费”靠近，而不是停留在纯 review 备注层。

##### 3.3 pseudo-symptom 边界已经开始被显式编码

例如：

- `recent_direct_sun_increase`
- `low_light_context`
- `watering_excess_background`
- `watering_deficit_background`

在候选数据里都已经被标成仅用于上下文/问诊，不应进入视觉主证据分。  
这一点和最终完整版的方向基本一致。

---

#### 4. 当前不能直接落代码的硬缺口

##### 4.1 缺少正式的 `symptom_classes` 数据源

最终完整版要求至少存在三张逻辑表：

- `symptom_classes`
- `symptom_class_mapping`
- `class_question_group_strategy`

但这次给到的实际配套数据里，只有：

- `symptom -> class` review 数据
- `class -> question_group` strategy 数据

没有独立的 `symptom_classes` 候选表。

这会直接导致以下字段无处落地：

- `class_name_cn`
- `description`
- `question_mode`
- `class_level`
- `parent_class_key`
- `data_source`
- `audit_note`

如果没有这张表，代码里即使先把 class 跑起来，也只能依赖散落在 mapping/strategy 里的碎片信息，后续会很难维护。

##### 4.2 `symptom_class_row_review_final_candidate.csv` 仍是 review 结构，不是最终归一化导入结构

规范对 `symptom_class_mapping` 的建议更接近“一条 symptom-class 边一行”的结构，需要至少明确：

- `symptom_key`
- `class_key`
- `mapping_strength`
- `is_primary`

但当前候选文件使用的是：

- `primary_class_key`
- `secondary_class_keys`
- `class_mapping_type`

这意味着它还不是最终 normalized import shape。

直接落库前，至少还要再明确两件事：

1. `secondary_class_keys` 如何拆成多行
2. 每条 secondary mapping 的默认强度是什么

否则 runtime 里的 `classScores` 计算没有稳定输入。

##### 4.3 数据覆盖不完整：`symptom -> class` 与 `class -> group` 数量不闭环

我直接统计当前两份 CSV 后得到：

- `symptom_class_row_review_final_candidate.csv`：99 行，26 个 primary class
- `class_question_group_strategy_final_candidate.csv`：59 行，21 个 class

也就是说，至少有 5 个 class 出现在 `symptom -> class` 侧，但没有出现在 `class -> question_group` 侧：

- `flower_stress_mode`
- `humidity_stress_mode`
- `leaf_spot_complex_mode`
- `natural_aging_mode`
- `temperature_stress_mode`

这不是小问题。因为其中对应 symptom 行并不都是“只解释不问诊”，有些仍然允许激活问题。  
如果 class 侧没有题组策略，runtime 到 follow-up 阶段就会断层。

##### 4.4 二级 class 引用了未正式落地的 class

当前 secondary class 里还出现了两个没有进入 primary class 主集合、也没有进入 strategy 集合的 class：

- `nutrient_stress_mode`
- `edema_overwater_mode`

这意味着当前数据里已经隐含了“未来还会有更多 class”，但这些 class 还没有完整的：

- class 定义
- strategy 定义
- 运行时切换规则

如果不先把这件事讲清楚，代码里会出现“secondary 指到了一个系统并不认识的 class”。

##### 4.5 当前运行时代码没有正式的 symptom-class 消费骨架

现在的 `diagnose-http` 仍然不是 class-first runtime，而是旧的 problem-first + direction-boost 结构：

- `buildFollowUps` 仍然先取 top problems，再读 `question_strategy_v5_real`
- `question-repository` 读取的仍是旧字段集合
- session 恢复时只重建 `askedQuestionKeys / answeredQuestionGroupKeys / unknownCountByGroup`
- 现有 route 层仍以 `diagnosisDirections` 为主，而不是正式的 `primaryClass / secondaryClasses / classScores`

也就是说，当前代码并没有一个“只差导数据就能跑”的半成品 class runtime。

##### 4.6 当前项目里还没有与该方案对应的表注册、repository、migration

当前 `cloudfunctions/diagnose-http/constants/tables.js` 中并没有：

- `symptom_classes`
- `symptom_class_mapping`
- `class_question_group_strategy`

项目内也没有找到对应的新表 migration / import SQL / repository 实现。  
所以从工程角度看，真正缺的是：

- schema
- repository
- classifier
- question selector 接口改造
- session snapshot 扩展

而不只是“把一份 CSV 导进去”。

---

#### 5. 当前数据本身仍然存在的疑点

##### 5.1 `final_candidate` 说明文档自己也没有把它定义成“可直接入库”

文档写得很明确：正式落库前仍建议做一次：

- 真实 case 回放
- top1/top2 冲突抽检
- unknown 流程抽检
- AI 已锁定场景下 confirm 题降权抽检

所以如果现在把它理解成“final = 已经不需要再验证”，这个理解是不成立的。

##### 5.2 `class_question_group_strategy` 里仍有明显未收紧项

我直接统计后得到：

- `final_review_decision = keep`：36 条
- `keep_with_constraints`：10 条
- `update_required`：13 条

这意味着接近 40% 的 strategy 行还不是无条件可落地状态。

##### 5.3 `symptom_class_row_review` 里也不是全部无歧义

我直接统计后得到：

- `symptom_class_status = audited`：96
- `symptom_class_status = partial`：3
- `review_status = keep`：88
- `adjust`：6
- `keep_with_note`：5

也就是说，它已经非常接近可用，但仍不是完全收口。

##### 5.4 pseudo-symptom 边界仍有疑点：`fertilization_gap`

`fertilization_gap` 现在被标成：

- `class_mapping_type = direct_visual`
- `visual_scoring_allowed = True`
- `question_activation_allowed = True`

但从语义上看，它更像养护背景，不像视觉模型可直接看到的主证据。  
这一条和 `low_light_context / watering_excess_background` 的口径并不一致。

##### 5.5 `explanation_only_allowed` 字段语义仍不够清楚

例如下面几条同时出现了：

- `question_activation_allowed = True`
- `explanation_only_allowed = True`

典型行包括：

- `black_mold_growth`
- `soil_smell`
- `sooty_mold`

如果 `explanation_only_allowed` 的含义是“只能用于 explanation”，那这些组合是矛盾的。  
如果它的含义只是“允许进入 explanation”，那字段命名又会误导实现。

这个字段在真正落代码前必须先定死语义。

##### 5.6 一部分 class 边界仍然明显处于待裁决状态

当前 review 数据里，至少这些 symptom 仍带有明显的边界歧义：

- `purple_leaves`
- `small_leaves`
- `vein_darkening`
- `leaf_margin_necrosis`
- `leaf_curl`

这些条目如果不先明确“主 class / 次 class / 是否降级为 fallback 或 partial”，代码实现时会被迫替业务做决定。

---

#### 6. 代码侧当前最大的现实 gap

##### 6.1 问题选择器还没有 class-gated 入口

当前 follow-up 选择过程仍然是：

```text
top problems -> question_strategy_v5_real -> candidate questions
```

而不是：

```text
visual symptoms -> class scores -> class-gated groups -> group内选题
```

这意味着即使把候选 CSV 导入数据库，现有 runtime 也不会自然开始正确使用它们。

##### 6.2 session 状态还不够支撑 class runtime

最终完整版要求显式记录：

- `currentClassKey`
- `currentGroupKey`
- `unknownCountInGroup`

但当前 session 侧只具备 group 级 answered / unknown 重建，没有 class 状态机。  
因此还不具备：

- class 内切组
- high value group 用尽后切 secondary class
- bounded class score update

这些最终版规范里的关键能力。

##### 6.3 `diagnosisDirections` 仍是旧的粗粒度代理层

当前系统里真正在线的是 `yellowing_direction / pest_direction / mold_direction` 这类粗粒度方向层。  
它能起到启发式加权作用，但它不是正式的 `symptom_class` 运行时。

所以不能把“现在已经有 diagnosisDirections”误判成“症状模式层已经有运行时承接”。

---

#### 7. 现在可以开始做什么

如果目标是“开始实现”，当前最合理的范围是：

##### 可以立即开始

- 新建 `symptom-class-repository`
- 新建 `symptom-classifier`
- 设计并落 `symptom_classes / symptom_class_mapping / class_question_group_strategy` 三张表
- 扩展 session runtime snapshot，加入 class 状态字段
- 改造 question selector，使其支持 class-gated 选组

##### 不建议直接开始

- 直接把 final_candidate 全量导库后接到现网 follow-up
- 在未明确 secondary class 权重前实现 `classScores`
- 在未补齐缺失 class strategy 前让所有 class 都参与 follow-up
- 在未定死 pseudo-symptom 语义前让这些条目参与 visual 主证据分

---

#### 8. 落代码前必须逐条确认的问题

以下问题如果不先确认，代码实现过程中一定会反复返工：

1. `symptom_classes` 的正式数据源是什么，是否还需要单独补一张类目主表。
2. `symptom_class_row_review_final_candidate.csv` 是否要先归一化成真正的 `symptom_class_mapping` 导入表。
3. `secondary_class_keys` 拆分后每条 secondary mapping 的默认强度是多少。
4. `nutrient_stress_mode` 是否正式纳入 v1 class 集合。
5. `edema_overwater_mode` 是否正式纳入 v1 class 集合，还是仅作为解释层概念存在。
6. `flower_stress_mode / humidity_stress_mode / leaf_spot_complex_mode / natural_aging_mode / temperature_stress_mode` 这 5 个缺少 strategy 的 class，是否要补策略，还是暂不进入 follow-up。
7. `fertilization_gap` 是否应改成 `context_only` / pseudo-symptom，而不是 `direct_visual`。
8. `explanation_only_allowed` 的正式语义到底是“只允许 explanation”，还是“允许 explanation 参与”。
9. `keep_with_constraints / update_required / partial` 这些状态在代码里是禁止进入运行时，还是允许进入但降权。
10. 当前 `diagnosisDirections` 是要逐步退场，还是作为 symptom-class 之前的过渡层保留。
11. `class_question_group_strategy` 中缺少的 3 个 group 文本资产是否已经存在于云端库中，还是仍未建完。
12. `q_stable_marking_longstanding` 这类 sample question key 是否真实存在于正式题库。
13. telemetry / backtest 的最小落地字段要不要与 symptom-class 一并上，否则后续无法验证这层是否真的提升了诊断质量。

---

#### 9. 一句话收口

```text
规则已接近收口，数据已接近可导，代码却还没有正式承接层；
因此当前最正确的动作不是“直接接入”，而是先补 schema、runtime skeleton 和少量关键数据裁决。
```



## [S34] 症状模式配套数据 final_candidate 说明

- 文件名：`症状模式配套数据_final_candidate说明.md`
- 状态：非A类/补充或过程文件
- 类别：症状模式/数据
- 用途：症状模式配套 final_candidate 数据说明
- SHA-256 前 16 位：`0702590575bcb9bb`

---

### 症状模式配套数据 final_candidate 说明

本批文件是基于：

- 《症状模式分流机制与运行时流程规范_最终完整版.md》
- `class_question_group_strategy_review_v2.*`
- `symptom_class_row_review_v2.csv`

联动升级后的 **final_candidate** 数据版本。

#### 文件说明

##### 1. class_question_group_strategy_final_candidate.xlsx / csv
作用：
- 作为 `symptom_class -> question_group` 的候选最终版
- 已补入最终版规范要求的关键字段：
  - `class_gate_type`
  - `class_switch_allowed`
  - `unknown_switch_policy`
  - `ai_locked_confirm_penalty`
  - `pseudo_symptom_allowed`
  - `role_semantic_validated`
  - `final_review_decision`
  - `final_review_note`

##### 2. symptom_class_row_review_final_candidate.csv
作用：
- 作为 `symptom -> symptom_class` 的候选最终版 review 数据
- 已补入：
  - `primary_class_key`
  - `secondary_class_keys`
  - `class_mapping_type`
  - `visual_scoring_allowed`
  - `question_activation_allowed`
  - `explanation_only_allowed`
  - `class_conflict_note`
  - `audited_semantic_note`

#### 当前定位

这批文件已经不是“初版 review”数据，而是：

```text
与最终完整版规范对齐后的候选最终版（final_candidate）
```

但仍建议在正式落库前再做一次：
- 真实 case 回放
- top1/top2 冲突抽检
- unknown 流程抽检
- AI 已锁定场景下的 confirm 题降权抽检

#### 一句话结论

```text
最终完整版文档已经把规则收紧，
所以配套数据也必须同步升级到 final_candidate，
否则会出现“文档是 final，数据仍是旧 review 口径”的错位。
```



## [S35] 症状模式剩余 block 收口说明（v3）

- 文件名：`症状模式剩余block收口说明_v3.md`
- 状态：非A类/补充或过程文件
- 类别：症状模式/收口
- 用途：症状模式剩余 block 收口说明
- SHA-256 前 16 位：`5e247da6fc9002a6`

---

### 症状模式剩余 block 收口说明（v3）

本次只做 3 个明确收口动作，目标是把剩余的“设计未定 block”在进入 Codex 前清掉。

#### 已完成

##### 1. 收紧 context_only 伪症状
已将以下条目统一改为：

- `primary_class_lock_allowed_v1 = False`

涉及：

- `low_light_context`
- `recent_direct_sun_increase`
- `watering_deficit_background`
- `watering_excess_background`

这意味着：
- 可用于 question / context / explanation
- 不可锁定 `primaryClass`
- 不可留下“背景事实能否锁主模式”的歧义

##### 2. 降级未验证题组资产
已将以下 group 先降级为不可运行：

- `leaf_spot_texture_group`
- `leaf_surface_residue_group`

处理方式：

- `effective_runtime_v1 = False`
- `runtime_block_reason = asset_not_verified`
- `asset_status = missing_or_unverified`

这样 Codex 后续只需去做“资产存在性核查”，而不会在接线时继续吃到自相矛盾的数据。

##### 3. 明确 `parent_class_key` 的 schema 决策
已单独生成说明文档，正式定稿为：

```text
v1 中 parent_class_key 作为 taxonomy label 落库，不做 FK。
```

#### 一句话结论

```text
这 3 个收口动作完成后，
剩下的就基本是 Codex 的工程实现工作，
不再是设计未定 block。
```



## [S36] parent_class_key schema 决策说明（v1）

- 文件名：`parent_class_key_schema_decision_v1.md`
- 状态：非A类/补充或过程文件
- 类别：症状模式/schema
- 用途：parent_class_key schema 裁决
- SHA-256 前 16 位：`46b7b20bb0410665`

---

### parent_class_key schema 决策说明（v1）

#### 结论

当前 v1 中：

```text
parent_class_key 作为 taxonomy label 落库，
不做 FK（外键）。
```

#### 原因

当前这些值：

- `biotic_disease_mode`
- `abiotic_stress_mode`
- `bridge_mode`
- `fallback_mode`
- `normalization_mode`
- `biotic_pest_mode`
- `abiotic_biotic_bridge_mode`
- `abiotic_bridge_mode`

更像分类标签 / 语义分桶，而不是 `symptom_classes` 中已存在的真实父级 row。

#### v1 实施规则

- `parent_class_key` 允许为空
- `parent_class_key` 允许引用不在 `symptom_classes.class_key` 中的 taxonomy label
- repository 和 runtime 不应依赖它做 join
- 它只用于：
  - 分类展示
  - 人工 review
  - 后续版本整理

#### 后续

如果未来要把“父类”做成正式实体，再单独设计父层级表；
在那之前，`parent_class_key` 不做 FK。



## [S37] 植物身份主表与命名归一规则 v1（完整最终版）

- 文件名：`plant_identity_master_and_name_normalization_rules_v1.md`
- 状态：A类正式基线
- 类别：Taxonomy/身份
- 用途：植物身份主表与命名归一规则
- SHA-256 前 16 位：`b6887c7f78efd31d`

---

### 植物身份主表与命名归一规则 v1（完整最终版）

> 说明：
>
> - 本文档是《植物 Taxonomy 体系定义 v1.1（review 增补修正版，完整最终版）》的进一步落地文档。
> - 它不再讨论“大方向”，而是专门钉死：
>   - plant identity entity 主表规则
>   - canonical identity 规则
>   - alias 规则
>   - 新建 / 合并 / 停用 / 退役规则
>
> - 本文档遵循：
>
> # **中文是一等公民**
> # **中文主名优先**
> # **只给完整最终文件，不给纯补丁**

---

### 1. 文档目标

本文件要解决 6 个问题：

1. 植物身份主表到底承载什么
2. canonical identity 怎么定义
3. alias 怎么分型
4. 什么情况下能新建 identity
5. 什么情况下必须归 alias
6. merge / retire 如何治理

---

### 2. 正式主表定义

#### 2.1 正式主表：`plant_identity_entities`

##### 中文主名
植物身份主表

##### 作用
系统内部唯一承载“植物身份对象”的正式主表。

##### 它承载的是
- 主身份主名
- 身份层级
- family / genus / species
- 学名
- 主展示名
- 归一后的正式主对象语义

##### 它不承载的是
- 一坨别名
- 一堆外部平台命中名
- 临时用户输入名
- diagnosis 业务表字段
- 视觉运行时状态

---

### 3. canonical identity 规则

#### 3.1 定义

##### 中文主名
主身份主名

##### 英文辅助名
canonical identity

##### 规则
一个植物身份对象，必须且只能有一个 canonical identity。

---

#### 3.2 作用

canonical identity 主要用于：

- 主数据归一
- 下游结构挂接
- 主键语义稳定
- 训练标签统一

它不是单纯的：
- UI 展示名
- 搜索关键词
- 平台返回名

---

#### 3.3 与主展示名的边界

##### `canonical_identity_name`
内部主身份主名

##### `primary_display_name`
产品对外主展示名

##### 规则
- 二者可以相同
- 但不强制相同
- 不得把展示名反向当作 identity 主键语义

---

### 4. identity_level 规则

#### 4.1 正式允许值

当前冻结为：

- `genus`
- `species`
- `horticultural_variant`
- `unknown`

---

#### 4.2 使用边界

##### genus
用于：
- 属级稳定承接
- species 不稳时的正式对象

##### species
用于：
- 已稳定到种级的正式对象

##### horticultural_variant
用于：
- 经确认确有独立 identity 价值的园艺变体
- 当前阶段慎用

##### unknown
用于：
- 暂未稳定层级
- 不得长期泛滥为正式对象

---

### 5. 新建 identity 规则

#### 5.1 允许新建的前提

同时满足以下方向时，才允许评估新建：

1. 具有独立稳定身份意义
2. 不是旧对象的别名变体
3. 在分类、宿主背景、展示或业务上有独立价值
4. 与既有对象不会形成高重叠污染
5. 不会明显破坏命名归一稳定性

---

#### 5.2 默认禁止新建的情况

以下默认不得新建 identity，应优先归为 alias：

- 商品名差异
- 常见俗名差异
- 简繁差异
- 标点 / 空格差异
- 平台返回名差异
- 历史旧名
- 搜索兼容名
- 只是同一 identity 的不同写法

---

#### 5.3 新建审查记录

任何新建 identity，至少应记录：

- 新建原因
- 排重结果
- 分类路径依据
- 是否存在旧对象候选
- 审查状态
- 审查时间

---

### 6. alias 体系规则

#### 6.1 alias 不是字符串垃圾桶

新增正式规则：

### **alias 不是一坨混乱名称集合，必须分型。**

---

#### 6.2 alias_type 当前建议值

- `standard_alias`：标准别名
- `common_name`：常见俗名
- `commercial_name`：商业名 / 园艺名
- `legacy_name`：历史旧名
- `baidu_match_name`：百度命中映射名
- `search_compatible_name`：搜索兼容名

---

#### 6.3 alias 的作用

alias 至少服务于：

- 识别命中
- 搜索兼容
- 去重审查
- 产品展示控制
- 数据清洗

---

#### 6.4 alias 与主表边界

##### alias 可以做
- 承接平台返回名
- 承接用户常见叫法
- 承接商业名
- 承接旧名

##### alias 不能做
- 替代 canonical identity
- 替代主对象唯一性
- 绕过 identity 新建规则

---

### 7. genus / species 共存规则

#### 7.1 可以共存，但职责不同

##### genus 级对象
更适合承担：
- 稳定宿主背景
- species 不稳时的降级承接
- genus 级 diagnosis 挂接

##### species 级对象
更适合承担：
- 精确主身份结果
- 更细身份展示与挂接

---

#### 7.2 species 已稳时的主结果规则

当 species 已稳定 matched：

- 当前会话主身份结果优先落到 species 级对象
- genus 级对象保留为上位背景
- 不再与 species 争夺主身份结果

---

### 8. merge / retire 规则

#### 8.1 merge 触发条件

若两个 identity 满足以下条件，应评估合并：

- 实际指向同一植物身份
- 分类路径可归一
- 宿主先验价值无独立差异
- 主要差异只是名字体系不同

---

#### 8.2 merge 后必须保留

- `replacement_identity_id`
- 历史 alias 映射
- 合并原因
- 合并时间
- 审查记录

---

#### 8.3 retire 触发条件

若某 identity：

- 长期无命中价值
- 被确认只是重复对象
- 命名高度误导
- 已被更稳定对象替代

则可评估停用 / 退役。

---

### 9. 身份命中规则

#### 9.1 正式概念

##### 中文主名
身份命中规则

##### 作用
定义外部识别名 / 输入名如何命中主表对象。

---

#### 9.2 当前建议命中类型

- 完全主名命中
- alias 命中
- 学名命中
- 清洗后命中
- 人工映射命中
- 模糊弱命中

---

#### 9.3 留痕字段

后续命中记录中至少保留：

- `match_rule`
- `match_score`
- `match_reason`

---

### 10. 本文件总裁决

本文件最终钉死：

### **主表负责唯一 identity**
### **alias 负责多名字体系**
### **展示名不等于主身份主名**
### **species 不稳时允许 genus 承接**
### **商品名 / 俗名 / 平台返回名默认先走 alias，不得直接新建主对象**



## [S38] 植物 Taxonomy 体系定义 v1.3（完整最终版，开发收口版）

- 文件名：`植物_Taxonomy_体系定义_v1_3_完整最终版_开发收口版.md`
- 状态：A类正式基线
- 类别：Taxonomy/身份
- 用途：Taxonomy 静态层与运行时身份解析边界
- SHA-256 前 16 位：`6e6f713940cdc384`

---

### 植物 Taxonomy 体系定义 v1.3（完整最终版，开发收口版）

> 说明：
>
> - 本文件用于作为当前开发阶段可直接引用的 Taxonomy 正式基线。
> - 本版目标不是继续扩概念，而是收口会阻碍开发的关键边界。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **只修阻断开发的问题**

---

### 一、当前正式定位

plants taxonomy（植物 Taxonomy 体系）是当前诊断系统中，用于承载：

- 植物身份主结果的静态主数据
- 植物命名归一
- 分类路径
- 宿主背景输入
- 属级养护基线挂接基础

的正式主数据体系。

---

### 二、Taxonomy 静态层与运行时层边界

#### 2.1 Taxonomy 静态层承载什么
Taxonomy 静态层承载：

- `plant_identity_entity`
- canonical identity
- primary display name
- family / genus / species
- aliases
- match rules
- merge / retire 历史
- genus care baseline 挂接基础

#### 2.2 Taxonomy 静态层不承载什么
Taxonomy 静态层不承载：

- 当前会话的 `matched / weak_matched / unresolved`
- 当前会话的 `identity_resolution_status`
- 当前会话的 route hint
- 当前会话的视觉候选状态

##### 正式裁决
### **`identity_resolution_status` 不属于 Taxonomy 静态主数据字段。**
### **它只属于运行时身份解析记录。**

---

### 三、第一阶段正式字段口径

#### 3.1 `plant_identity_entities`
第一阶段正式核心字段口径为：

- `plant_identity_id`
- `legacy_plant_id`
- `canonical_identity_name`
- `canonical_identity_name_cn`
- `canonical_identity_name_en`
- `primary_display_name`
- `identity_level`
- `family_name_canonical`
- `family_name_cn`
- `family_name_en`
- `genus_name`
- `species_name`
- `scientific_name`
- `category_name_cn`
- `category_name_en`
- `is_active`
- `review_status`
- `data_source`
- `version`
- `created_at`
- `updated_at`

##### 说明
为解决第一阶段挂接键不自洽问题，当前正式新增：

### **`family_name_canonical`**
作为第一阶段归一科名字段。

---

### 四、属级养护基线与 Taxonomy 的关系

#### 4.1 属级养护基线属于 Taxonomy 侧主数据体系
正式表：

- `genus_care_profiles`

中文主名：

- 属级养护基线表

它用于承载：

- 浇水基线
- 施肥基线
- 光照基线
- 通风基线
- 温度区间
- 湿度区间
- 毒性等级
- 证据层级与说明

#### 4.2 第一阶段正式挂接键
正式裁决：

### **第一阶段挂接键 = `genus_name + family_name_canonical`**

这意味着：

- `genus_care_profiles` 侧应使用 `family_name_canonical`
- `plant_identity_entities` 侧也应提供 `family_name_canonical`

不再模糊使用：
- `family_name`
- `family_name_cn`
- `family_name_en`

作为业务 join key

---

### 五、Taxonomy 与 Diagnosis 的边界

Taxonomy 可以影响：

- 宿主背景
- explanation 背景
- 行动建议上游输入
- 属级养护基线消费

Taxonomy 不能直接充当：

- problem
- symptom
- question
- outcome

并且：

### **Taxonomy / 宿主先验不得推翻高置信症状。**

---

### 六、一句话总裁决

**当前开发阶段，Taxonomy 的核心任务是：稳定提供身份主数据、命名归一、分类路径、宿主背景与属级养护基线挂接基础；会话态身份状态一律留在运行时层。**



## [S39] Taxonomy 与 Diagnosis 挂接规则 v1（完整最终版）

- 文件名：`taxonomy_diagnosis_linkage_rules_v1.md`
- 状态：A类正式基线
- 类别：Taxonomy/Diagnosis桥接
- 用途：Taxonomy 到 Diagnosis 的受限挂接规则与优先级
- SHA-256 前 16 位：`0d2fc40f845b358a`

---

### Taxonomy 与 Diagnosis 挂接规则 v1（完整最终版）

> 说明：
>
> - 本文档用于钉死：
>   - Taxonomy 主数据层
>   - Diagnosis 业务层
>   之间的正式挂接规则。
> - 本文档与：
>   - 《植物 Taxonomy 体系定义 v1.1（review 增补修正版，完整最终版）》
>   - 《Taxonomy / Diagnosis SQL 字段映射表 v1（完整最终版）》
>   - 《植物身份主表与命名归一规则 v1（完整最终版）》
>   配套使用。
>
> - 本文档遵循：
>
> # **中文是一等公民**
> # **中文主名优先**
> # **不给纯补丁，只给完整最终文件**

---

### 1. 文档目标

本文件要回答 4 个问题：

1. Taxonomy 主对象如何进入 diagnosis 侧
2. 何时按 `plant_identity_id` 精确挂接
3. 何时降级到 genus / family
4. unresolved / weak_matched 的边界是什么

---

### 2. 挂接总原则

#### 2.1 Taxonomy 不直接等于 Diagnosis

新增正式规则：

### **Taxonomy 主数据层不等于 Diagnosis 业务层。**

Taxonomy 提供的是：

- 身份
- family / genus / species
- alias 归一
- 宿主背景
- 宿主先验挂点

Diagnosis 侧负责的是：

- problem
- symptom
- question
- explanation
- plant_problem_profiles
- outcome 收敛

二者必须通过正式挂接规则连接，不能混表、不能混概念。

---

#### 2.2 挂接是“受限连接”，不是“无限透传”

Taxonomy 的身份信息可以影响 diagnosis，  
但不得直接变成：

- problem
- outcome
- final diagnosis

---

### 3. 挂接优先级写死

#### 3.1 第一优先级：identity 精确挂接

当同时满足：

- 当前会话主身份结果为稳定 `matched`
- 存在明确 `plant_identity_id`
- 存在已审查的 diagnosis 挂接关系

则优先采用：

### **`plant_identity_id` 精确挂接**

##### 适用
- 精确宿主画像
- `plant_problem_profiles`
- 更细 problem prior

---

#### 3.2 第二优先级：genus 降级挂接

当 identity 级精确挂接条件不满足，但同时满足：

- genus 稳定
- genus 级挂接规则存在
- 当前风险可控

则允许：

### **genus 级降级挂接**

##### 适用
- genus 级常见问题背景
- genus 级宿主先验
- genus 级 explanation 辅助

---

#### 3.3 第三优先级：family 弱背景挂接

当 genus 也不稳定，但 family 可用时：

- 只允许进入 family 级弱背景
- 不得进入精细问题先验

##### 适用
- 很弱的 explanation 背景
- 很弱的宿主提示

##### 不适用
- 精细 `plant_problem_profiles`
- 问题 top1 强推
- outcome 锁定

---

#### 3.4 第四优先级：unresolved 不挂接

当主身份结果为 `unresolved`：

### **不得进入 diagnosis baseline 的精细挂接**

##### 允许
- explanation 中提示身份未稳定
- question 中优先补宿主确认
- route hint 中提高全株图 / 补图优先级

##### 不允许
- 精细宿主画像挂接
- 精细问题先验挂接
- 假装已有 identity 主结果

---

### 4. weak_matched 的边界

#### 4.1 weak_matched 默认不做精细挂接

新增正式规则：

### **weak_matched 默认不进入 diagnosis baseline 的精细挂接。**

##### 允许
- explanation
- question 辅助
- 弱宿主背景提示
- 轻微宿主先验偏置

##### 不允许
- 直接挂 `plant_problem_profiles`
- 直接推高精细问题先验
- 直接锁定 diagnosis 侧细粒度宿主对象

---

#### 4.2 weak_matched 升级条件

若后续补图或人工确认使其升级为 `matched`，  
才允许进入 identity 级精确挂接。

---

### 5. 挂接对象形式

#### 5.1 正式挂接表建议

建议至少显式存在：

- `plant_identity_diagnosis_links`

---

#### 5.2 link_level 当前建议值

- `identity`
- `genus`
- `family`

---

#### 5.3 link_strength 当前建议值

- `exact`
- `downgraded`
- `weak_background`

---

### 6. 挂接时不得做的事

以下做法明确禁止：

- 用 weak_matched 直接精细挂接
- 用 unresolved 硬挂 diagnosis baseline
- 用 family 弱背景强推问题 top1
- 把 Taxonomy 分类字段直接当 problem taxonomy
- 把 identity 结果直接当 outcome object

---

### 7. 与运行时的关系

#### 7.1 Taxonomy 挂接只提供“宿主侧结构”

挂接后进入 runtime 的主要是：

- 宿主背景
- 宿主先验挂点
- explanation 支持信息

而不是：
- 直接产出结论对象

---

#### 7.2 仍需服从既有硬约束

挂接结果仍必须服从：

- 宿主先验不得推翻高置信症状
- route hint 不能反写事实层
- identity 结果不是 outcome
- Taxonomy 不属于 problem taxonomy

---

### 8. 本文件总裁决

本文件最终钉死：

### **稳定 matched → identity 精确挂接**
### **identity 不稳但 genus 稳 → genus 降级挂接**
### **genus 不稳但 family 可用 → family 弱背景挂接**
### **unresolved / weak_matched → 不得进入精细 diagnosis 挂接**

这条规则一旦写死，后续 SQL 与运行时实现就不会再摇摆。



## [S40] Taxonomy / Diagnosis SQL 字段映射表 v1.1（完整最终版）

- 文件名：`Taxonomy_Diagnosis_SQL_字段映射表_v1_1_完整最终版_标题版本已统一.md`
- 状态：A类正式基线
- 类别：SQL/字段映射
- 用途：Taxonomy/Diagnosis SQL 字段映射与素材源职责
- SHA-256 前 16 位：`3be6cde3202808d3`

---

### Taxonomy / Diagnosis SQL 字段映射表 v1.1（完整最终版）

> 说明：
>
> - 本文档用于把当前已确认的两份最终制表素材：
>   - `plant_catalog.csv`
>   - `plants_v13_user_friendly_full_v7.xlsx`
>   映射到正式 SQL 制表结构。
> - 本文档是桥接文档，不替代：
>   - 《植物 Taxonomy 体系定义 v1.1（review 增补修正版，完整最终版）》
>   - 《AI视觉诊断入口层数据结构与留存规范 v1.4（最终完整增补版，基于 v1.1 只增不减）》
>   - 《核心数据结构 v1.5（完整最终版，基于可用前版只增不减）》
> - 本文档遵循：
>
> # **中文是一等公民**
> # **中文主名优先**
> # **英文字段名仅作 SQL / 程序实现映射**
>
> - 本文档结论优先：
>
> # **`plant_catalog.csv` = Taxonomy 主数据侧素材**
> # **`plants_v13_user_friendly_full_v7.xlsx` = Diagnosis 侧素材**
> # **两者都不是可直接照抄入库的真值源，必须经过映射、归一、审查后进入正式 SQL**

---

### 1. 文档目标

本文件要回答 5 个问题：

1. 哪些 SQL 表属于 Taxonomy 主数据层
2. 哪些 SQL 表属于 Diagnosis 业务层
3. 两份素材分别为哪些正式表提供字段来源
4. 哪些字段可以直接继承，哪些必须重命名 / 重组 / 新增
5. 哪些字段禁止直接从素材源照抄进入正式表

---

### 2. 最终 SQL 表分层建议

当前最终 SQL 表建议至少分为 4 层：

#### 2.1 Taxonomy 主数据层
- `plant_identity_entities`
- `plant_identity_aliases`
- `taxonomy_families`（如需）
- `taxonomy_genera`（如需）
- `taxonomy_species`（如需）
- `plant_identity_merge_history`

#### 2.2 Diagnosis 静态业务层
- `problems`
- `symptoms`
- `question_templates`
- `question_option_sets`
- `diagnosis_result_explanations`
- `plant_problem_profiles`
- 以及 v7 中其他 diagnosis 基础表

#### 2.3 Taxonomy → Diagnosis 挂接层
- `plant_identity_diagnosis_links`
- `genus_diagnosis_links`（如需显式表）
- `family_diagnosis_links`（如需显式表）

#### 2.4 运行时 / 监督层
- 该部分不以本文件为主，但需与既有文档一致：
  - `plant_identity_resolution_records`
  - `visual_raw_image_records`
  - `visual_normalized_image_results`
  - `visual_call_aggregate_results`
  - `visual_admission_records`
  - `visual_supervision_records`

---

### 3. 素材源职责写死

#### 3.1 `plant_catalog.csv` 的正式职责

它服务于：

- `plant_identity_entities`
- `plant_identity_aliases` 的初始 identity / name baseline
- family / genus / species 基础字段
- 学名、中文展示名、基础分类标签
- Taxonomy 归一重构的底稿

##### 它不应直接充当
- diagnosis 主表
- problem / symptom / question 主表
- 运行时表
- 视觉入口监督表

---

#### 3.2 `plants_v13_user_friendly_full_v7.xlsx` 的正式职责

它服务于：

- diagnosis 静态业务表
- `plant_problem_profiles`
- 其他 problem / symptom / question / explanation 基础表
- diagnosis 侧字段命名与业务语义 baseline

##### 它不应直接充当
- Taxonomy 主表
- plant identity 主对象表
- alias 主表
- 身份命中规则主表

---

### 4. Taxonomy 主表字段映射

#### 4.1 正式主表：`plant_identity_entities`

##### 中文主名
植物身份主表

##### 作用
系统内部唯一承载 plant identity entity 的正式主表。

---

#### 4.2 字段映射表

| 正式字段名 | 中文主名 | 来源素材 | 来源字段/说明 | 处理方式 |
|---|---|---|---|---|
| `plant_identity_id` | 植物身份对象ID | 新增 | 无直接素材字段 | **新增正式主键** |
| `legacy_plant_id` | 历史植物ID | `plant_catalog.csv` | 原植物内部ID | 继承并保留为历史映射 |
| `canonical_identity_name` | 主身份主名 | `plant_catalog.csv` | 中文展示名/学名综合判定 | **归一生成，不可直接照抄** |
| `canonical_identity_name_cn` | 中文主身份主名 | `plant_catalog.csv` | 中文展示名 | 归一后生成 |
| `canonical_identity_name_en` | 英文主身份主名 | `plant_catalog.csv` | 学名/英文名 | 归一后生成 |
| `primary_display_name` | 主展示名 | `plant_catalog.csv` | 中文展示名 | 可继承，但需审查 |
| `identity_level` | 身份层级 | 新增 | 无直接素材字段 | **新增规则字段** |
| `family_name_cn` | 科中文名 | `plant_catalog.csv` | 科中文字段 | 继承 |
| `family_name_en` | 科英文名 | `plant_catalog.csv` | 科英文字段 | 继承 |
| `genus_name` | 属名 | `plant_catalog.csv` | 属英文字段/可补中文 | 继承后归一 |
| `species_name` | 种名 | `plant_catalog.csv` | 学名拆解/可补 | **部分继承 + 解析生成** |
| `scientific_name` | 学名 | `plant_catalog.csv` | 学名字段 | 继承 |
| `category_name_cn` | 分类中文名 | `plant_catalog.csv` | 中文分类 | 继承 |
| `category_name_en` | 分类英文名 | `plant_catalog.csv` | 英文分类 | 继承 |
| `basic_description` | 基础描述 | `plant_catalog.csv` | 简介描述 | 继承但不作主键语义 |
| `cover_image_ref` | 封面图引用 | `plant_catalog.csv` | 图片/封面引用 | 继承 |
| `is_active` | 是否启用 | 新增/素材状态位 | 状态位/启用位 | 归一生成 |
| `data_source` | 数据来源 | 新增 | 固定值 | 新增 |
| `review_status` | 审查状态 | 新增 | 无直接素材字段 | 新增 |
| `version` | 版本 | 新增 | 无直接素材字段 | 新增 |
| `created_at` | 创建时间 | `plant_catalog.csv` | 创建时间 | 继承 |
| `updated_at` | 更新时间 | `plant_catalog.csv` | 更新时间 | 继承 |
| `retired_at` | 退役时间 | 新增 | 无 | 新增 |
| `replacement_identity_id` | 替代对象ID | 新增 | 无 | 新增 |

---

#### 4.3 处理原则

##### 可直接继承
- 科中文名
- 科英文名
- 中文分类
- 英文分类
- 学名
- 创建时间
- 更新时间
- 封面图引用

##### 必须归一后生成
- `plant_identity_id`
- `canonical_identity_name`
- `identity_level`
- `species_name`
- `is_active`
- `review_status`

##### 禁止直接照抄进正式主字段
- 外部平台返回植物名
- 商品名
- 用户搜索兼容名
- 未审查别名

---

### 5. 别名表字段映射

#### 5.1 正式表：`plant_identity_aliases`

##### 中文主名
植物身份别名表

##### 作用
承载一个 plant identity entity 的多别名体系。

---

#### 5.2 字段映射表

| 正式字段名 | 中文主名 | 来源素材 | 说明 | 处理方式 |
|---|---|---|---|---|
| `alias_id` | 别名ID | 新增 | 无 | 新增主键 |
| `plant_identity_id` | 植物身份对象ID | 来自主表 | 外键 | 关联 |
| `alias_name` | 别名内容 | `plant_catalog.csv` / 其他人工补充 | 中文名/别名/商品名等 | 归一后写入 |
| `alias_type` | 别名类型 | 新增 | 规则字段 | 新增 |
| `is_preferred_search_alias` | 是否优先搜索别名 | 新增 | 规则字段 | 新增 |
| `source_name` | 来源 | 新增 | 素材源/人工来源 | 新增 |
| `is_active` | 是否启用 | 新增 | 状态字段 | 新增 |
| `created_at` | 创建时间 | 新增 | 无 | 新增 |

---

#### 5.3 alias_type 当前建议值

- `standard_alias`：标准别名
- `common_name`：常见俗名
- `commercial_name`：商业名 / 园艺名
- `legacy_name`：历史旧名
- `baidu_match_name`：百度命中映射名
- `search_compatible_name`：搜索兼容名

---

### 6. 身份命中规则表字段映射

#### 6.1 正式表：`plant_identity_match_rules`

##### 中文主名
植物身份命中规则表

##### 作用
承载“外部识别名 / 输入名如何命中正式主对象”的规则记录。

---

#### 6.2 字段建议

| 正式字段名 | 中文主名 | 来源素材 | 说明 | 处理方式 |
|---|---|---|---|---|
| `match_rule_id` | 命中规则ID | 新增 | 无 | 新增主键 |
| `plant_identity_id` | 植物身份对象ID | 主表 | 外键 | 关联 |
| `match_key` | 命中键 | `plant_catalog.csv` / alias 清洗结果 | 可匹配字符串 | 归一生成 |
| `match_rule_type` | 命中规则类型 | 新增 | 完全名/alias/学名等 | 新增 |
| `match_strength` | 命中强度 | 新增 | strong / weak | 新增 |
| `source_name` | 来源 | 新增 | 素材/人工 | 新增 |
| `is_active` | 是否启用 | 新增 | 状态字段 | 新增 |

---

### 7. Diagnosis 主表字段映射

#### 7.1 正式原则

Diagnosis 侧大部分表，以：

### **`plants_v13_user_friendly_full_v7.xlsx` 为字段来源 baseline**

但不等于直接照抄。  
尤其是字段命名、主键、外键、唯一键、治理字段，仍需按正式 SQL 结构调整。

---

#### 7.2 典型 diagnosis 表映射

##### `problems`
- 来源：v7 对应问题表
- 处理：延续现有 diagnosis 业务语义，补正式主键与治理字段

##### `symptoms`
- 来源：v7 对应症状表
- 处理：延续现有症状键、中文主名、证据语义，补治理字段

##### `question_templates`
- 来源：v7 question 相关表
- 处理：统一 question 模板主键与适用条件

##### `diagnosis_result_explanations`
- 来源：v7 explanation 表
- 处理：保留 explanation 业务含义，补版本字段

##### `plant_problem_profiles`
- 来源：v7 `plant_problem_profiles`
- 处理：作为 diagnosis baseline 中最关键的宿主挂接表

---

### 8. Taxonomy → Diagnosis 挂接表

#### 8.1 正式表：`plant_identity_diagnosis_links`

##### 中文主名
植物身份到诊断挂接表

##### 作用
承载 Taxonomy 主对象如何稳定挂 diagnosis baseline。

---

#### 8.2 字段建议

| 正式字段名 | 中文主名 | 说明 |
|---|---|---|
| `link_id` | 挂接ID | 主键 |
| `plant_identity_id` | 植物身份对象ID | Taxonomy 外键 |
| `link_level` | 挂接层级 | identity / genus / family |
| `target_profile_key` | 目标画像键 | diagnosis 侧目标键 |
| `target_table_name` | 目标表名 | 如 `plant_problem_profiles` |
| `target_record_key` | 目标记录键 | diagnosis 侧记录标识 |
| `link_strength` | 挂接强度 | exact / downgraded / weak_background |
| `is_active` | 是否启用 | 状态位 |
| `review_status` | 审查状态 | 治理字段 |

---

#### 8.3 挂接优先级写死

##### 第一优先级
稳定 `matched` 且存在明确 `plant_identity_id`  
→ `identity` 级精确挂接

##### 第二优先级
identity 不稳但 genus 稳  
→ `genus` 级降级挂接

##### 第三优先级
genus 不稳但 family 可用  
→ `family` 级弱背景挂接

##### 第四优先级
`unresolved`  
→ 不做 diagnosis 精细挂接

---

### 9. 禁止直接照抄入库的字段类型

以下内容**不得**从素材源未经治理直接进入正式主表或正式 diagnosis 表：

- 百度直接返回植物名
- 混元直接输出的身份候选
- 未分型的 alias 串
- 未审查的用户俗名
- 外部平台临时命中名
- 模糊清洗但未记录规则的匹配名

---

### 10. 新增治理字段清单

无论 Taxonomy 侧还是 Diagnosis 侧，正式 SQL 表都建议统一补以下治理字段：

- `data_source`
- `review_status`
- `version`
- `is_active`
- `created_at`
- `updated_at`
- `retired_at`（按需）
- `replacement_id`（按需）

---

### 11. 最终映射总裁决

本文件最终钉死：

### **`plant_catalog.csv` 服务于 Taxonomy 主数据侧**
### **`plants_v13_user_friendly_full_v7.xlsx` 服务于 Diagnosis 侧**
### **二者均需经过映射、归一、审查，才能进入最终 SQL**

也就是说：

- 不是“导进去就完”
- 而是“先形成正式对象，再入库”

---

### 12. 本文件之后的落地顺序建议

1. 先完成《植物身份主表与命名归一规则 v1》
2. 再完成《Taxonomy 与 Diagnosis 挂接规则 v1》
3. 最后基于这三份桥接文档形成《最终 SQL 制表方案 v1》

这才是稳定落代码的顺序。




### ================================
### v1.1 新增附录开始（基于 v1 只增不减）
### ================================

> 说明：
>
> - 以下内容为《Taxonomy / Diagnosis SQL 字段映射表 v1（完整最终版）》在**完整保留上文全部有效内容**的前提下，继续新增的联动附录。
> - 本次新增目标：
>   - 正式把 `genus_care_profile.csv` 的字段映射纳入总映射表
>   - 明确它如何进入 `genus_care_profiles`
>
> - 本次新增只做补充，不删改上文，不重排上文，不替换上文。

---

### 附录 A：属级养护基线字段映射增补（本次新增，不替换上文）

#### A-1. 新增正式素材源

在现有两份素材源之外，当前新增正式确认素材源：

- `genus_care_profile.csv`

##### 定位
它是：

### **Taxonomy 侧属级养护基线主表素材**

---

#### A-2. 新增正式目标表：`genus_care_profiles`

中文主名：

- **属级养护基线表**

---

#### A-3. 字段映射表

| 正式字段名 | 中文主名 | 来源素材 | 来源字段/说明 | 处理方式 |
|---|---|---|---|---|
| `genus_care_profile_id` | 属级养护基线ID | 新增 | 无直接素材字段 | 新增正式主键 |
| `genus_name` | 属名 | `genus_care_profile.csv` | 第1列 | 继承 |
| `family_name` | 科名 | `genus_care_profile.csv` | 第2列 | 继承 |
| `plant_category` | 植物类别 | `genus_care_profile.csv` | 第3列 | 继承后受控值域化 |
| `watering_strategy_json` | 浇水策略JSON | `genus_care_profile.csv` | 第4列 | 继承，但需按正式 schema 校验 |
| `fertilizing_strategy_json` | 施肥策略JSON | `genus_care_profile.csv` | 第5列 | 继承，但需按正式 schema 校验 |
| `light_strategy_json` | 光照策略JSON | `genus_care_profile.csv` | 第6列 | 继承，但需按正式 schema 校验 |
| `airflow_strategy_json` | 通风策略JSON | `genus_care_profile.csv` | 第7列 | 继承，但需按正式 schema 校验 |
| `temp_min_c` | 最低适宜温度（℃） | `genus_care_profile.csv` | 第8列 | 继承 |
| `temp_max_c` | 最高适宜温度（℃） | `genus_care_profile.csv` | 第9列 | 继承 |
| `humidity_min` | 最低适宜湿度 | `genus_care_profile.csv` | 第10列 | 继承 |
| `humidity_max` | 最高适宜湿度 | `genus_care_profile.csv` | 第11列 | 继承 |
| `toxicity_level` | 毒性等级 | `genus_care_profile.csv` | 第12列 | 继承后受控值域化 |
| `review_status` | 审核状态 | `genus_care_profile.csv` | 第13列 | 继承后受控值域化 |
| `source_evidence` | 证据来源 | `genus_care_profile.csv` | 第14列 | 继承 |
| `baseline_note` | 基线说明 | `genus_care_profile.csv` | 第15列 | 继承 |
| `evidence_level` | 证据层级 | `genus_care_profile.csv` | 第16列 | 继承后受控值域化 |
| `evidence_strategy` | 证据策略 | `genus_care_profile.csv` | 第17列 | 继承后受控值域化 |
| `data_source` | 数据来源 | 新增 | 固定值 | 新增 |
| `version` | 版本 | 新增 | 固定值或导入批次值 | 新增 |
| `is_active` | 是否启用 | 新增 / review_status 导出 | 无直接素材字段 | 新增规则字段 |
| `created_at` | 创建时间 | `genus_care_profile.csv` | 第19列 | 继承 |
| `updated_at` | 更新时间 | `genus_care_profile.csv` | 第20列 | 继承 |
| `retired_at` | 退役时间 | 新增 | 无 | 新增 |
| `replacement_profile_id` | 替代基线ID | 新增 | 无 | 新增 |
| `genus_id` | 属ID | 预留 | 当前无直接素材字段 | 预留升级位 |
| `genus_identity_id` | 属级身份对象ID | 预留 | 当前无直接素材字段 | 预留升级位 |

---

#### A-4. 正式 CSV 表头建议

后续若继续以 CSV 作为导入中间层，应使用带表头版本：

```csv
genus_name,family_name,plant_category,watering_strategy_json,fertilizing_strategy_json,light_strategy_json,airflow_strategy_json,temp_min_c,temp_max_c,humidity_min,humidity_max,toxicity_level,review_status,source_evidence,baseline_note,evidence_level,evidence_strategy,reserved,created_at,updated_at
```

---

#### A-5. 当前正式处理原则

##### 可直接继承
- `genus_name`
- `family_name`
- 温湿度上下限
- `source_evidence`
- `baseline_note`
- `created_at`
- `updated_at`

##### 必须受控值域化
- `plant_category`
- `toxicity_level`
- `review_status`
- `evidence_level`
- `evidence_strategy`

##### 必须 schema 校验
- `watering_strategy_json`
- `fertilizing_strategy_json`
- `light_strategy_json`
- `airflow_strategy_json`

##### 新增生成
- `genus_care_profile_id`
- `data_source`
- `version`
- `is_active`
- `retired_at`
- `replacement_profile_id`

---

#### A-6. 当前唯一性建议

第一阶段建议以：

- `genus_name`
- `family_name`

共同构成业务唯一性约束。

---

#### A-7. 当前总裁决补充

本附录补入后，当前总字段映射体系应统一理解为：

- `plant_catalog.csv` → Taxonomy 身份主数据侧
- `plants_v13_user_friendly_full_v7.xlsx` → Diagnosis 侧
- `genus_care_profile.csv` → Taxonomy 侧属级养护基线主表



## [S41] 最终 SQL 制表方案 v1.3（完整最终版，开发收口版）

- 文件名：`最终_SQL_制表方案_v1_3_完整最终版_开发收口版.md`
- 状态：A类正式基线
- 类别：SQL/开发收口
- 用途：最终 SQL 制表方案 v1.3；分层、字段裁决、枚举与落表边界
- SHA-256 前 16 位：`c5cc94a8f92b2dd1`

---

### 最终 SQL 制表方案 v1.3（完整最终版，开发收口版）

> 说明：
>
> - 本文件用于作为当前开发阶段可直接引用的正式 SQL 制表基线。
> - 本版只收口真正阻断开发的问题，不继续扩概念。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **先支撑 dev 可落地**

---

### 一、当前正式分层

#### 1. Taxonomy 主数据层
- `plant_identity_entities`
- `plant_identity_aliases`
- `plant_identity_match_rules`
- `plant_identity_merge_history`
- `genus_care_profiles`

#### 2. Diagnosis 静态业务层
- `problems`
- `symptoms`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`（仅 audited generation asset，不计入 formal runtime coverage）
- `diagnosis_result_explanations`
- `plant_problem_profiles`

#### 3. Taxonomy 到 Diagnosis 挂接层
- `plant_identity_diagnosis_links`

#### 4. 运行时与监督层
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`
- `visual_call_aggregate_results`
- `visual_supervision_records`

---

### 二、第一阶段正式挂接键裁决

#### 2.1 属级养护基线挂接键
正式裁决：

### **第一阶段 `genus_care_profiles` 的正式业务挂接键 = `genus_name + family_name_canonical`**

##### 说明
- `family_name_canonical` 是第一阶段归一科名字段
- 展示字段可保留中文 / 英文
- 但业务 join key 只使用归一字段

---

### 三、运行时对象最小持久化策略

#### 3.1 必须持久化到 SQL
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`

#### 3.2 建议持久化到 SQL
- `visual_call_aggregate_results`
- `visual_supervision_records`

#### 3.3 默认不强制持久化到 SQL
以下运行时对象第一版可先放内存 / cache / trace，不要求立即建表：

- `normalized_input`
- `observed_evidence_set`
- `hypothesis_pool`
- `outcome_pool`
- `question_queue`
- `stop_state`
- `diagnostic_trace`

##### 说明
第一版目标是：
### **先跑通 dev 链路**
而不是一次性把全部运行时对象 SQL 化。

---

### 四、视觉调用批次主记录方案

#### 4.1 正式新增主记录表
正式裁决：

### **第一版必须新增 `visual_call_batches`**

##### 中文主名
视觉调用批次主记录表

##### 最小职责
承载：
- `visual_call_batch_id`
- `session_id`
- `trigger_source`
- `round_id`
- `batch_status`
- `image_count`
- `created_at`
- `updated_at`

---

### 五、AI 入口新增治理字段正式冻结

#### 5.1 `plant_identity_resolution_records`
正式冻结关键字段：

- `taxonomy_match_status`
- `identity_resolution_status`
- `matched_plant_identity_id`
- `is_current_primary_identity`
- `match_rule`
- `match_score`
- `match_reason`
- `superseded_by_resolution_id`
- `superseded_reason`
- `superseded_at`

#### 5.2 `visual_normalized_image_results`
正式冻结关键字段：

- `route_primary_action`
- `top1_stability_score`
- `top3_stability_score`
- `long_tail_noise_flag`
- `pattern_derivation_status`

#### 5.3 `visual_supervision_records`
正式冻结关键字段：

- `question_correction_scope`

---

### 六、状态字段边界裁决

#### 6.1 `taxonomy_match_status`
只表示：

### **某条原始识别名对 Taxonomy 的命中结果**

典型值：
- `matched`
- `weak_matched`
- `unresolved`

#### 6.2 `identity_resolution_status`
表示：

### **该解析记录在进入当前会话身份裁定后的最终状态**

它不等于 Taxonomy 静态属性。

---

### 七、`route_primary_action` 第一阶段正式枚举

正式裁决：

- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

##### 删除
- `hold_for_review`

##### 原因
当前系统没有人工审核状态机，一人维护阶段不引入该复杂度。

---

### 八、route hint 与事实层落位顺序裁决

正式裁决：

### **只要条目已被 `formally_admitted`，就先进入 `observed_evidence_set`。**
### **route hint 只改变后续流程优先级，不改变事实层先落位。**

---

### 九、一句话总裁决

**当前 SQL 制表方案已经足以支撑 Codex 进入 dev 建表阶段；其余更复杂的持久化哲学与扩展状态机，全部延后。**



## [S42] 第一版 SQL 表结构草案 v1.1（完整最终版，开发收口版）

- 文件名：`第一版_SQL_表结构草案_v1_1_开发收口版.md`
- 状态：A类正式基线
- 类别：SQL/开发收口
- 用途：第一版 SQL 表结构草案 v1.1 开发收口版
- SHA-256 前 16 位：`beaaa96e28a76ee5`

---

### 第一版 SQL 表结构草案 v1.1（完整最终版，开发收口版）

> 说明：
>
> - 本文件是在 v1 基础上的开发收口版。
> - 本版只修真正阻断开发的点，并与收口裁决保持一致。
>
> - 本文件遵循：
>
> # **中文是一等公民**
> # **完整最终文件优先**
> # **以 dev 落地为第一目标**

---

### 一、当前建表分层

#### 1. Taxonomy 主数据层
- `plant_identity_entities`
- `plant_identity_aliases`
- `plant_identity_match_rules`
- `plant_identity_merge_history`
- `genus_care_profiles`

#### 2. Diagnosis 静态业务层
- `problems`
- `symptoms`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`（仅 audited generation asset，不计入 formal runtime coverage）
- `diagnosis_result_explanations`
- `plant_problem_profiles`

#### 3. Taxonomy 到 Diagnosis 挂接层
- `plant_identity_diagnosis_links`

#### 4. 运行时与监督层
- `visual_call_batches`
- `plant_identity_resolution_records`
- `visual_raw_image_records`
- `visual_normalized_image_results`
- `visual_admission_records`
- `visual_call_aggregate_results`
- `visual_supervision_records`

---

### 二、Taxonomy 主数据层表结构草案

#### 2.1 `plant_identity_entities`（植物身份主表）

```sql
CREATE TABLE plant_identity_entities (
  plant_identity_id            VARCHAR(64) PRIMARY KEY COMMENT '植物身份对象ID',
  legacy_plant_id             VARCHAR(64) NULL COMMENT '历史植物ID',
  canonical_identity_name     VARCHAR(255) NOT NULL COMMENT '主身份主名',
  canonical_identity_name_cn  VARCHAR(255) NULL COMMENT '中文主身份主名',
  canonical_identity_name_en  VARCHAR(255) NULL COMMENT '英文主身份主名',
  primary_display_name        VARCHAR(255) NOT NULL COMMENT '主展示名',
  identity_level              VARCHAR(64) NOT NULL COMMENT '身份层级',
  family_name_canonical       VARCHAR(255) NULL COMMENT '归一科名（第一阶段正式挂接键）',
  family_name_cn              VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en              VARCHAR(255) NULL COMMENT '科英文名',
  genus_name                  VARCHAR(255) NULL COMMENT '属名',
  species_name                VARCHAR(255) NULL COMMENT '种名',
  scientific_name             VARCHAR(255) NULL COMMENT '学名',
  category_name_cn            VARCHAR(255) NULL COMMENT '分类中文名',
  category_name_en            VARCHAR(255) NULL COMMENT '分类英文名',
  basic_description           TEXT NULL COMMENT '基础描述',
  cover_image_ref             TEXT NULL COMMENT '封面图引用',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_identity_id     VARCHAR(64) NULL COMMENT '替代对象ID',
  UNIQUE KEY uk_identity_name_level (canonical_identity_name, identity_level),
  KEY idx_genus_family (genus_name, family_name_canonical)
) COMMENT='植物身份主表';
```

---

#### 2.2 `genus_care_profiles`（属级养护基线表）

```sql
CREATE TABLE genus_care_profiles (
  genus_care_profile_id       VARCHAR(64) PRIMARY KEY COMMENT '属级养护基线ID',
  genus_name                  VARCHAR(255) NOT NULL COMMENT '属名',
  family_name_canonical       VARCHAR(255) NOT NULL COMMENT '归一科名（第一阶段正式挂接键）',
  family_name_cn              VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en              VARCHAR(255) NULL COMMENT '科英文名',
  genus_id                    VARCHAR(64) NULL COMMENT '属ID（预留升级位）',
  genus_identity_id           VARCHAR(64) NULL COMMENT '属级身份对象ID（预留升级位）',
  plant_category              VARCHAR(64) NOT NULL COMMENT '植物类别',
  watering_strategy_json      JSON NOT NULL COMMENT '浇水策略JSON',
  fertilizing_strategy_json   JSON NOT NULL COMMENT '施肥策略JSON',
  light_strategy_json         JSON NOT NULL COMMENT '光照策略JSON',
  airflow_strategy_json       JSON NOT NULL COMMENT '通风策略JSON',
  temp_min_c                  DECIMAL(5,2) NULL COMMENT '最低适宜温度（℃）',
  temp_max_c                  DECIMAL(5,2) NULL COMMENT '最高适宜温度（℃）',
  humidity_min                DECIMAL(5,2) NULL COMMENT '最低适宜湿度',
  humidity_max                DECIMAL(5,2) NULL COMMENT '最高适宜湿度',
  toxicity_level              VARCHAR(64) NOT NULL COMMENT '毒性等级',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  source_evidence             TEXT NULL COMMENT '证据来源',
  baseline_note               TEXT NULL COMMENT '基线说明',
  evidence_level              VARCHAR(64) NOT NULL COMMENT '证据层级',
  evidence_strategy           VARCHAR(64) NOT NULL COMMENT '证据策略',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_profile_id      VARCHAR(64) NULL COMMENT '替代基线ID',
  UNIQUE KEY uk_genus_family (genus_name, family_name_canonical)
) COMMENT='属级养护基线表';
```

---

### 三、运行时与监督层表结构草案

#### 3.1 `visual_call_batches`（视觉调用批次主记录表）

```sql
CREATE TABLE visual_call_batches (
  visual_call_batch_id        VARCHAR(64) PRIMARY KEY COMMENT '视觉调用批次ID',
  session_id                  VARCHAR(64) NOT NULL COMMENT '会话ID',
  trigger_source              VARCHAR(64) NULL COMMENT '触发来源',
  round_id                    VARCHAR(64) NULL COMMENT '轮次ID',
  batch_status                VARCHAR(64) NULL COMMENT '批次状态',
  image_count                 INT NULL COMMENT '图片数量',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间'
) COMMENT='视觉调用批次主记录表';
```

---

#### 3.2 `plant_identity_resolution_records`（植物身份解析记录表）

```sql
CREATE TABLE plant_identity_resolution_records (
  identity_resolution_record_id VARCHAR(64) PRIMARY KEY COMMENT '身份解析记录ID',
  session_id                    VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id          VARCHAR(64) NULL COMMENT '视觉调用批次ID',
  raw_recognition_name          VARCHAR(255) NULL COMMENT '原始识别名',
  taxonomy_match_status         VARCHAR(64) NOT NULL COMMENT '原始识别名对Taxonomy的命中结果',
  identity_resolution_status    VARCHAR(64) NOT NULL COMMENT '进入会话裁定后的身份解析状态',
  matched_plant_identity_id     VARCHAR(64) NULL COMMENT '命中植物身份对象ID',
  is_current_primary_identity   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前主身份结果',
  match_rule                    VARCHAR(64) NULL COMMENT '命中规则',
  match_score                   DECIMAL(6,3) NULL COMMENT '命中分数',
  match_reason                  TEXT NULL COMMENT '命中原因',
  superseded_by_resolution_id   VARCHAR(64) NULL COMMENT '被哪个解析记录覆盖',
  superseded_reason             TEXT NULL COMMENT '覆盖原因',
  superseded_at                 DATETIME NULL COMMENT '覆盖时间',
  created_at                    DATETIME NULL COMMENT '创建时间',
  updated_at                    DATETIME NULL COMMENT '更新时间'
) COMMENT='植物身份解析记录表';
```

---

#### 3.3 `visual_normalized_image_results`（单图视觉标准化结果表）

```sql
CREATE TABLE visual_normalized_image_results (
  visual_normalized_image_result_id VARCHAR(64) PRIMARY KEY COMMENT '单图视觉标准化结果ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_raw_image_record_id        VARCHAR(64) NOT NULL COMMENT '单图视觉原始记录ID',
  analyzability_level               VARCHAR(64) NULL COMMENT '可分析等级',
  clarity_level                     VARCHAR(64) NULL COMMENT '清晰度等级',
  subject_completeness_level        VARCHAR(64) NULL COMMENT '主体完整性等级',
  primary_organ_type                VARCHAR(64) NULL COMMENT '主器官类型',
  organ_source                      VARCHAR(64) NULL COMMENT '器官来源',
  topk_symptoms_json                JSON NULL COMMENT '前K症状JSON',
  pattern_candidates_json           JSON NULL COMMENT '模式候选JSON',
  route_hints_json                  JSON NULL COMMENT '路由建议JSON',
  route_primary_action              VARCHAR(64) NULL COMMENT '路由建议主动作',
  top1_stability_score              DECIMAL(6,3) NULL COMMENT 'Top1稳定性分数',
  top3_stability_score              DECIMAL(6,3) NULL COMMENT 'Top3稳定性分数',
  long_tail_noise_flag              TINYINT(1) NULL COMMENT '长尾噪声标记',
  pattern_derivation_status         VARCHAR(64) NULL COMMENT '模式推导状态',
  created_at                        DATETIME NULL COMMENT '创建时间'
) COMMENT='单图视觉标准化结果表';
```

---

#### 3.4 `visual_admission_records`（视觉接纳判定记录表）

```sql
CREATE TABLE visual_admission_records (
  visual_admission_record_id   VARCHAR(64) PRIMARY KEY COMMENT '视觉接纳判定记录ID',
  session_id                   VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id         VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_normalized_image_result_id VARCHAR(64) NOT NULL COMMENT '单图视觉标准化结果ID',
  object_type                  VARCHAR(64) NOT NULL COMMENT '对象类型',
  object_key                   VARCHAR(255) NULL COMMENT '对象键',
  admission_result             VARCHAR(64) NOT NULL COMMENT '接纳结果',
  admission_reason             TEXT NULL COMMENT '接纳理由',
  entered_runtime              TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否进入运行时正式层',
  target_layer                 VARCHAR(64) NULL COMMENT '进入目标层级',
  created_at                   DATETIME NULL COMMENT '创建时间'
) COMMENT='视觉接纳判定记录表';
```

---

#### 3.5 `visual_supervision_records`（视觉监督记录表）

```sql
CREATE TABLE visual_supervision_records (
  visual_supervision_record_id      VARCHAR(64) PRIMARY KEY COMMENT '视觉监督记录ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_admission_record_id        VARCHAR(64) NOT NULL COMMENT '视觉接纳判定记录ID',
  adopted_by_evidence               TINYINT(1) NULL COMMENT '后续是否被正式证据采纳',
  corrected_by_question             TINYINT(1) NULL COMMENT '后续是否被追问修正',
  denied_by_runtime                 TINYINT(1) NULL COMMENT '后续是否被运行时否定',
  denied_by_outcome_competition     TINYINT(1) NULL COMMENT '后续是否被结论竞争否定',
  question_correction_scope         VARCHAR(64) NULL COMMENT '问题回流纠正作用域',
  final_outcome_type                VARCHAR(64) NULL COMMENT '最终结论类型',
  final_stop_reason                 VARCHAR(128) NULL COMMENT '最终停止原因',
  updated_at                        DATETIME NULL COMMENT '更新时间'
) COMMENT='视觉监督记录表';
```

---

### 四、关键执行说明

#### 4.1 `hold_for_review`
第一版已删除，不进入正式枚举。

#### 4.2 `route_primary_action`
第一版正式枚举：

- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

#### 4.3 正式证据先落位
只要条目已被：

- `formally_admitted`

就应先进入：

- `observed_evidence_set`

route hint 只改变后续流程优先级，不改变事实层先落位。

---

### 五、一句话总裁决

**这份 v1.1 已经足以作为 Codex 直接写 dev SQL 的第一版结构基线。**



## [S43] 第一版 SQL 表结构草案 v1（完整最终版）

- 文件名：`第一版_SQL_表结构草案_v1.md`
- 状态：非A类/补充或过程文件
- 类别：SQL/旧草案
- 用途：第一版 SQL 表结构草案 v1；被 v1.1/最终方案覆盖时不应优先使用
- SHA-256 前 16 位：`d3424f57c380422c`

---

### 第一版 SQL 表结构草案 v1（完整最终版）

> 说明：
> 
> -   本文档是基于当前全部正式基线文档收束出来的**第一版 SQL 表结构草案**。
>     
> -   目标不是一次性给出最终生产级 schema，而是给出：
>     
>     -   可进入 dev 验证的正式建表草案
>     -   可支撑第一轮数据导入 / 映射 / 联调的表结构基础
> -   本文档遵循：
>     
> 
> # **中文是一等公民**
> 
> # **完整最终文件优先**
> 
> # **当前以 dev 落地为第一目标**

---

### 一、当前建表分层

#### 1. Taxonomy 主数据层

-   `plant_identity_entities`
-   `plant_identity_aliases`
-   `plant_identity_match_rules`
-   `plant_identity_merge_history`
-   `genus_care_profiles`

#### 2. Diagnosis 静态业务层

-   `problems`
-   `symptoms`
-   `question_templates`
-   `question_option_sets`
-   `diagnosis_result_explanations`
-   `plant_problem_profiles`

#### 3. Taxonomy 到 Diagnosis 挂接层

-   `plant_identity_diagnosis_links`

#### 4. 运行时与监督层

-   `plant_identity_resolution_records`
-   `visual_raw_image_records`
-   `visual_normalized_image_results`
-   `visual_admission_records`
-   `visual_call_aggregate_results`（建议落）
-   `visual_supervision_records`（建议落）

---

### 二、Taxonomy 主数据层表结构草案

#### 2.1 `plant_identity_entities`（植物身份主表）

```sql
CREATE TABLE plant_identity_entities (
  plant_identity_id            VARCHAR(64) PRIMARY KEY COMMENT '植物身份对象ID',
  legacy_plant_id             VARCHAR(64) NULL COMMENT '历史植物ID',
  canonical_identity_name     VARCHAR(255) NOT NULL COMMENT '主身份主名',
  canonical_identity_name_cn  VARCHAR(255) NULL COMMENT '中文主身份主名',
  canonical_identity_name_en  VARCHAR(255) NULL COMMENT '英文主身份主名',
  primary_display_name        VARCHAR(255) NOT NULL COMMENT '主展示名',
  identity_level              VARCHAR(64) NOT NULL COMMENT '身份层级：genus/species/horticultural_variant/unknown',
  family_name_cn              VARCHAR(255) NULL COMMENT '科中文名',
  family_name_en              VARCHAR(255) NULL COMMENT '科英文名',
  genus_name                  VARCHAR(255) NULL COMMENT '属名',
  species_name                VARCHAR(255) NULL COMMENT '种名',
  scientific_name             VARCHAR(255) NULL COMMENT '学名',
  category_name_cn            VARCHAR(255) NULL COMMENT '分类中文名',
  category_name_en            VARCHAR(255) NULL COMMENT '分类英文名',
  basic_description           TEXT NULL COMMENT '基础描述',
  cover_image_ref             TEXT NULL COMMENT '封面图引用',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_identity_id     VARCHAR(64) NULL COMMENT '替代对象ID',
  UNIQUE KEY uk_identity_name_level (canonical_identity_name, identity_level)
) COMMENT='植物身份主表';
```

---

#### 2.2 `plant_identity_aliases`（植物身份别名表）

```sql
CREATE TABLE plant_identity_aliases (
  alias_id                    VARCHAR(64) PRIMARY KEY COMMENT '别名ID',
  plant_identity_id           VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  alias_name                  VARCHAR(255) NOT NULL COMMENT '别名内容',
  alias_type                  VARCHAR(64) NOT NULL COMMENT '别名类型',
  is_preferred_search_alias   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否优先搜索别名',
  source_name                 VARCHAR(128) NULL COMMENT '来源',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  UNIQUE KEY uk_identity_alias_type (plant_identity_id, alias_name, alias_type),
  KEY idx_alias_name (alias_name),
  CONSTRAINT fk_alias_identity
    FOREIGN KEY (plant_identity_id) REFERENCES plant_identity_entities(plant_identity_id)
) COMMENT='植物身份别名表';
```

---

#### 2.3 `plant_identity_match_rules`（植物身份命中规则表）

```sql
CREATE TABLE plant_identity_match_rules (
  match_rule_id               VARCHAR(64) PRIMARY KEY COMMENT '命中规则ID',
  plant_identity_id           VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  match_key                   VARCHAR(255) NOT NULL COMMENT '命中键',
  match_rule_type             VARCHAR(64) NOT NULL COMMENT '命中规则类型',
  match_strength              VARCHAR(32) NOT NULL COMMENT '命中强度',
  source_name                 VARCHAR(128) NULL COMMENT '来源',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_identity_match (plant_identity_id, match_key, match_rule_type),
  KEY idx_match_key (match_key),
  CONSTRAINT fk_match_identity
    FOREIGN KEY (plant_identity_id) REFERENCES plant_identity_entities(plant_identity_id)
) COMMENT='植物身份命中规则表';
```

---

#### 2.4 `plant_identity_merge_history`（植物身份合并历史表）

```sql
CREATE TABLE plant_identity_merge_history (
  merge_history_id            VARCHAR(64) PRIMARY KEY COMMENT '合并历史ID',
  source_identity_id          VARCHAR(64) NOT NULL COMMENT '源身份对象ID',
  target_identity_id          VARCHAR(64) NOT NULL COMMENT '目标身份对象ID',
  merge_reason                TEXT NULL COMMENT '合并原因',
  merged_at                   DATETIME NULL COMMENT '合并时间'
) COMMENT='植物身份合并历史表';
```

---

#### 2.5 `genus_care_profiles`（属级养护基线表）

```sql
CREATE TABLE genus_care_profiles (
  genus_care_profile_id       VARCHAR(64) PRIMARY KEY COMMENT '属级养护基线ID',
  genus_name                  VARCHAR(255) NOT NULL COMMENT '属名',
  family_name                 VARCHAR(255) NOT NULL COMMENT '科名',
  genus_id                    VARCHAR(64) NULL COMMENT '属ID（预留升级位）',
  genus_identity_id           VARCHAR(64) NULL COMMENT '属级身份对象ID（预留升级位）',
  plant_category              VARCHAR(64) NOT NULL COMMENT '植物类别',
  watering_strategy_json      JSON NOT NULL COMMENT '浇水策略JSON',
  fertilizing_strategy_json   JSON NOT NULL COMMENT '施肥策略JSON',
  light_strategy_json         JSON NOT NULL COMMENT '光照策略JSON',
  airflow_strategy_json       JSON NOT NULL COMMENT '通风策略JSON',
  temp_min_c                  DECIMAL(5,2) NULL COMMENT '最低适宜温度（℃）',
  temp_max_c                  DECIMAL(5,2) NULL COMMENT '最高适宜温度（℃）',
  humidity_min                DECIMAL(5,2) NULL COMMENT '最低适宜湿度',
  humidity_max                DECIMAL(5,2) NULL COMMENT '最高适宜湿度',
  toxicity_level              VARCHAR(64) NOT NULL COMMENT '毒性等级',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  source_evidence             TEXT NULL COMMENT '证据来源',
  baseline_note               TEXT NULL COMMENT '基线说明',
  evidence_level              VARCHAR(64) NOT NULL COMMENT '证据层级',
  evidence_strategy           VARCHAR(64) NOT NULL COMMENT '证据策略',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  retired_at                  DATETIME NULL COMMENT '退役时间',
  replacement_profile_id      VARCHAR(64) NULL COMMENT '替代基线ID',
  UNIQUE KEY uk_genus_family (genus_name, family_name),
  KEY idx_genus_name (genus_name)
) COMMENT='属级养护基线表';
```

---

### 三、Diagnosis 静态业务层表结构草案

#### 3.1 `problems`（问题主表）

```sql
CREATE TABLE problems (
  problem_id                  VARCHAR(64) PRIMARY KEY COMMENT '问题ID',
  problem_key                 VARCHAR(128) NOT NULL COMMENT '问题键',
  problem_name_cn             VARCHAR(255) NOT NULL COMMENT '问题中文名',
  problem_name_en             VARCHAR(255) NULL COMMENT '问题英文名',
  problem_category            VARCHAR(64) NULL COMMENT '问题类别',
  severity_default            VARCHAR(64) NULL COMMENT '默认严重度',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  UNIQUE KEY uk_problem_key (problem_key)
) COMMENT='问题主表';
```

---

#### 3.2 `symptoms`（症状主表）

```sql
CREATE TABLE symptoms (
  symptom_id                  VARCHAR(64) PRIMARY KEY COMMENT '症状ID',
  symptom_key                 VARCHAR(128) NOT NULL COMMENT '症状键',
  symptom_name_cn             VARCHAR(255) NOT NULL COMMENT '症状中文名',
  symptom_name_en             VARCHAR(255) NULL COMMENT '症状英文名',
  symptom_type                VARCHAR(64) NULL COMMENT '症状类型',
  evidence_reliability        DECIMAL(5,2) NULL COMMENT '证据可靠性',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  UNIQUE KEY uk_symptom_key (symptom_key)
) COMMENT='症状主表';
```

---

#### 3.3 `question_templates`（问题模板表）

```sql
CREATE TABLE question_templates (
  question_template_id        VARCHAR(64) PRIMARY KEY COMMENT '问题模板ID',
  question_key                VARCHAR(128) NOT NULL COMMENT '问题键',
  question_text_cn            TEXT NOT NULL COMMENT '问题中文文本',
  question_type               VARCHAR(64) NULL COMMENT '问题类型',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at                  DATETIME NULL COMMENT '创建时间',
  updated_at                  DATETIME NULL COMMENT '更新时间',
  UNIQUE KEY uk_question_key (question_key)
) COMMENT='问题模板表';
```

---

#### 3.4 `question_option_sets`（问题选项集表）

```sql
CREATE TABLE question_option_sets (
  question_option_id          VARCHAR(64) PRIMARY KEY COMMENT '问题选项ID',
  question_key                VARCHAR(128) NOT NULL COMMENT '问题键',
  option_key                  VARCHAR(128) NOT NULL COMMENT '选项键',
  option_text_cn              VARCHAR(255) NOT NULL COMMENT '选项中文文本',
  option_order                INT NULL COMMENT '选项顺序',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_question_option (question_key, option_key)
) COMMENT='问题选项集表';
```

---

#### 3.5 `diagnosis_result_explanations`（诊断结果解释表）

```sql
CREATE TABLE diagnosis_result_explanations (
  explanation_id              VARCHAR(64) PRIMARY KEY COMMENT '解释ID',
  target_type                 VARCHAR(64) NOT NULL COMMENT '目标类型',
  target_key                  VARCHAR(128) NOT NULL COMMENT '目标键',
  explanation_text_cn         TEXT NOT NULL COMMENT '解释中文文本',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_target_expl (target_type, target_key)
) COMMENT='诊断结果解释表';
```

---

#### 3.6 `plant_problem_profiles`（植物问题画像表）

```sql
CREATE TABLE plant_problem_profiles (
  plant_problem_profile_id    VARCHAR(64) PRIMARY KEY COMMENT '植物问题画像ID',
  profile_key                 VARCHAR(128) NOT NULL COMMENT '画像键',
  plant_identity_id           VARCHAR(64) NULL COMMENT '植物身份对象ID',
  genus_name                  VARCHAR(255) NULL COMMENT '属名',
  family_name                 VARCHAR(255) NULL COMMENT '科名',
  problem_key                 VARCHAR(128) NOT NULL COMMENT '问题键',
  prior_score                 DECIMAL(6,3) NULL COMMENT '先验分数',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  data_source                 VARCHAR(128) NOT NULL COMMENT '数据来源',
  version                     VARCHAR(64) NULL COMMENT '版本',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  KEY idx_profile_problem (profile_key, problem_key)
) COMMENT='植物问题画像表';
```

---

### 四、Taxonomy 到 Diagnosis 挂接层表结构草案

#### 4.1 `plant_identity_diagnosis_links`（植物身份到诊断挂接表）

```sql
CREATE TABLE plant_identity_diagnosis_links (
  link_id                     VARCHAR(64) PRIMARY KEY COMMENT '挂接ID',
  plant_identity_id           VARCHAR(64) NOT NULL COMMENT '植物身份对象ID',
  link_level                  VARCHAR(32) NOT NULL COMMENT '挂接层级：identity/genus/family',
  target_table_name           VARCHAR(128) NOT NULL COMMENT '目标表名',
  target_record_key           VARCHAR(128) NOT NULL COMMENT '目标记录键',
  link_strength               VARCHAR(32) NOT NULL COMMENT '挂接强度：exact/downgraded/weak_background',
  review_status               VARCHAR(64) NOT NULL COMMENT '审核状态',
  is_active                   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  UNIQUE KEY uk_identity_link (plant_identity_id, link_level, target_table_name, target_record_key)
) COMMENT='植物身份到诊断挂接表';
```

---

### 五、运行时与监督层表结构草案

#### 5.1 `plant_identity_resolution_records`（植物身份解析记录表）

```sql
CREATE TABLE plant_identity_resolution_records (
  identity_resolution_record_id VARCHAR(64) PRIMARY KEY COMMENT '身份解析记录ID',
  session_id                    VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id          VARCHAR(64) NULL COMMENT '视觉调用批次ID',
  raw_recognition_name          VARCHAR(255) NULL COMMENT '原始识别名',
  taxonomy_match_status         VARCHAR(64) NOT NULL COMMENT 'Taxonomy匹配状态',
  identity_resolution_status    VARCHAR(64) NOT NULL COMMENT '身份解析状态',
  matched_plant_identity_id     VARCHAR(64) NULL COMMENT '命中植物身份对象ID',
  is_current_primary_identity   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前主身份结果',
  match_rule                    VARCHAR(64) NULL COMMENT '命中规则',
  match_score                   DECIMAL(6,3) NULL COMMENT '命中分数',
  match_reason                  TEXT NULL COMMENT '命中原因',
  superseded_by_resolution_id   VARCHAR(64) NULL COMMENT '被哪个解析记录覆盖',
  superseded_reason             TEXT NULL COMMENT '覆盖原因',
  superseded_at                 DATETIME NULL COMMENT '覆盖时间',
  created_at                    DATETIME NULL COMMENT '创建时间',
  updated_at                    DATETIME NULL COMMENT '更新时间'
) COMMENT='植物身份解析记录表';
```

---

#### 5.2 `visual_raw_image_records`（单图视觉原始记录表）

```sql
CREATE TABLE visual_raw_image_records (
  visual_raw_image_record_id  VARCHAR(64) PRIMARY KEY COMMENT '单图视觉原始记录ID',
  session_id                  VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id        VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  image_ref                   TEXT NULL COMMENT '图片引用',
  input_slot_type             VARCHAR(64) NULL COMMENT '输入槽位类型',
  model_name                  VARCHAR(128) NULL COMMENT '模型名称',
  model_version               VARCHAR(128) NULL COMMENT '模型版本',
  prompt_version              VARCHAR(128) NULL COMMENT '提示词版本',
  raw_text_output             LONGTEXT NULL COMMENT '原始文本输出',
  raw_structured_output       LONGTEXT NULL COMMENT '原始结构化输出',
  call_status                 VARCHAR(64) NULL COMMENT '调用状态',
  latency_ms                  INT NULL COMMENT '延迟毫秒数',
  error_code                  VARCHAR(64) NULL COMMENT '错误码',
  created_at                  DATETIME NULL COMMENT '创建时间'
) COMMENT='单图视觉原始记录表';
```

---

#### 5.3 `visual_normalized_image_results`（单图视觉标准化结果表）

```sql
CREATE TABLE visual_normalized_image_results (
  visual_normalized_image_result_id VARCHAR(64) PRIMARY KEY COMMENT '单图视觉标准化结果ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_raw_image_record_id        VARCHAR(64) NOT NULL COMMENT '单图视觉原始记录ID',
  analyzability_level               VARCHAR(64) NULL COMMENT '可分析等级',
  clarity_level                     VARCHAR(64) NULL COMMENT '清晰度等级',
  subject_completeness_level        VARCHAR(64) NULL COMMENT '主体完整性等级',
  primary_organ_type                VARCHAR(64) NULL COMMENT '主器官类型',
  organ_source                      VARCHAR(64) NULL COMMENT '器官来源',
  topk_symptoms_json                JSON NULL COMMENT '前K症状JSON',
  pattern_candidates_json           JSON NULL COMMENT '模式候选JSON',
  route_hints_json                  JSON NULL COMMENT '路由建议JSON',
  top1_stability_score              DECIMAL(6,3) NULL COMMENT 'Top1稳定性分数',
  top3_stability_score              DECIMAL(6,3) NULL COMMENT 'Top3稳定性分数',
  long_tail_noise_flag              TINYINT(1) NULL COMMENT '长尾噪声标记',
  created_at                        DATETIME NULL COMMENT '创建时间'
) COMMENT='单图视觉标准化结果表';
```

---

#### 5.4 `visual_admission_records`（视觉接纳判定记录表）

```sql
CREATE TABLE visual_admission_records (
  visual_admission_record_id   VARCHAR(64) PRIMARY KEY COMMENT '视觉接纳判定记录ID',
  session_id                   VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id         VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_normalized_image_result_id VARCHAR(64) NOT NULL COMMENT '单图视觉标准化结果ID',
  object_type                  VARCHAR(64) NOT NULL COMMENT '对象类型',
  object_key                   VARCHAR(255) NULL COMMENT '对象键',
  admission_result             VARCHAR(64) NOT NULL COMMENT '接纳结果',
  admission_reason             TEXT NULL COMMENT '接纳理由',
  entered_runtime              TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否进入运行时正式层',
  target_layer                 VARCHAR(64) NULL COMMENT '进入目标层级',
  created_at                   DATETIME NULL COMMENT '创建时间'
) COMMENT='视觉接纳判定记录表';
```

---

#### 5.5 `visual_call_aggregate_results`（视觉调用聚合结果表，建议落）

```sql
CREATE TABLE visual_call_aggregate_results (
  visual_call_aggregate_result_id VARCHAR(64) PRIMARY KEY COMMENT '视觉调用聚合结果ID',
  session_id                      VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id            VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  aggregate_analyzability_level   VARCHAR(64) NULL COMMENT '聚合可分析等级',
  aggregate_summary_json          JSON NULL COMMENT '聚合摘要JSON',
  created_at                      DATETIME NULL COMMENT '创建时间'
) COMMENT='视觉调用聚合结果表';
```

---

#### 5.6 `visual_supervision_records`（视觉监督记录表，建议落）

```sql
CREATE TABLE visual_supervision_records (
  visual_supervision_record_id      VARCHAR(64) PRIMARY KEY COMMENT '视觉监督记录ID',
  session_id                        VARCHAR(64) NOT NULL COMMENT '会话ID',
  visual_call_batch_id              VARCHAR(64) NOT NULL COMMENT '视觉调用批次ID',
  visual_admission_record_id        VARCHAR(64) NOT NULL COMMENT '视觉接纳判定记录ID',
  adopted_by_evidence               TINYINT(1) NULL COMMENT '后续是否被正式证据采纳',
  corrected_by_question             TINYINT(1) NULL COMMENT '后续是否被追问修正',
  denied_by_runtime                 TINYINT(1) NULL COMMENT '后续是否被运行时否定',
  denied_by_outcome_competition     TINYINT(1) NULL COMMENT '后续是否被结论竞争否定',
  question_correction_scope         VARCHAR(64) NULL COMMENT '问题回流纠正作用域',
  final_outcome_type                VARCHAR(64) NULL COMMENT '最终结论类型',
  final_stop_reason                 VARCHAR(128) NULL COMMENT '最终停止原因',
  updated_at                        DATETIME NULL COMMENT '更新时间'
) COMMENT='视觉监督记录表';
```

---

### 六、当前建表顺序建议

#### 第一阶段：先建主数据与 diagnosis 静态表

1.  `plant_identity_entities`
2.  `plant_identity_aliases`
3.  `plant_identity_match_rules`
4.  `plant_identity_merge_history`
5.  `genus_care_profiles`
6.  `problems`
7.  `symptoms`
8.  `question_templates`
9.  `question_option_sets`
10.  `diagnosis_result_explanations`
11.  `plant_problem_profiles`

#### 第二阶段：再建挂接表

12.  `plant_identity_diagnosis_links`

#### 第三阶段：再建运行时骨架表

13.  `plant_identity_resolution_records`
14.  `visual_raw_image_records`
15.  `visual_normalized_image_results`
16.  `visual_admission_records`

#### 第四阶段：补建议落表

17.  `visual_call_aggregate_results`
18.  `visual_supervision_records`

---

### 七、一句话总裁决

**这份第一版 SQL 表结构草案 v1，已经足以支撑进入 dev 建表与联调阶段。**



## [S44] 第一版数据映射 / 导入脚本方案 v1（完整最终版）

- 文件名：`第一版_数据映射_导入脚本方案_v1.md`
- 状态：A类正式基线
- 类别：SQL/导入
- 用途：三份素材源的数据映射与导入脚本方案
- SHA-256 前 16 位：`b326db6208398e77`

---

### 第一版数据映射 / 导入脚本方案 v1（完整最终版）

> 说明：
>
> - 本文档用于定义：
>   - 当前正式素材源如何进入 dev SQL
>   - 数据映射、清洗、校验、导入的第一版脚本方案
>
> - 当前正式素材源包括：
>   1. `plant_catalog.csv`
>   2. `plants_v13_user_friendly_full_v7.xlsx`
>   3. `genus_care_profile.csv`
>
> - 目标不是一上来做最复杂的全自动管线，而是给出：
>
> # **可执行的第一版导入方案**
> # **可验证的第一版脚本分层**
> # **可追溯的第一版错误治理口径**

---

### 一、导入总原则

#### 1.1 不是“把文件导进去”
当前导入逻辑必须统一理解为：

### **先形成正式对象，再写入 SQL**

也就是说：
- 不能把原始文件列直接当正式主表字段
- 不能绕过归一 / 校验 / 受控值域
- 不能绕过 review_status / version / data_source 等治理字段

---

#### 1.2 三份素材源职责

##### `plant_catalog.csv`
进入：
- `plant_identity_entities`
- `plant_identity_aliases`
- `plant_identity_match_rules`

##### `plants_v13_user_friendly_full_v7.xlsx`
进入：
- `problems`
- `symptoms`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`（仅作 audited generation asset / 审计登记）
- `diagnosis_result_explanations`
- `plant_problem_profiles`

##### `genus_care_profile.csv`
进入：
- `genus_care_profiles`

---

### 二、第一版脚本分层

当前建议把导入脚本拆成 6 层。

#### 2.1 读取层
负责：
- 读取 CSV / XLSX
- 标准化列名
- 统一空值表现
- 输出 DataFrame / 中间对象

##### 建议脚本
- `load_plant_catalog.py`
- `load_diagnosis_v7.py`
- `load_genus_care_profiles.py`

---

#### 2.2 映射层
负责：
- 把原始列映射为正式对象字段
- 形成中间结构对象
- 还不直接写库

##### 建议脚本
- `map_plant_identity_entities.py`
- `map_diagnosis_tables.py`
- `map_genus_care_profiles.py`

---

#### 2.3 归一层
负责：
- 身份主名归一
- alias 分型
- match_key 生成
- 受控值域清洗
- JSON schema 规范化

##### 建议脚本
- `normalize_identity_fields.py`
- `normalize_diagnosis_fields.py`
- `normalize_genus_care_fields.py`

---

#### 2.4 校验层
负责：
- 主键唯一性校验
- 受控值域校验
- JSON schema 校验
- 数值区间校验
- 必填字段校验
- 交叉引用校验

##### 建议脚本
- `validate_taxonomy_payload.py`
- `validate_diagnosis_payload.py`
- `validate_genus_care_payload.py`

---

#### 2.5 导入层
负责：
- 将已通过校验的数据写入 dev SQL
- 按表顺序导入
- 支持幂等 / 覆盖 / replace / upsert 策略

##### 建议脚本
- `import_taxonomy_tables.py`
- `import_diagnosis_tables.py`
- `import_genus_care_tables.py`

---

#### 2.6 报告层
负责：
- 输出导入报告
- 输出错误清单
- 输出统计摘要
- 输出 rejected records

##### 建议脚本
- `build_import_report.py`

---

### 三、三份素材源的第一版导入步骤

#### 3.1 `plant_catalog.csv` 导入步骤

##### Step 1：读取原始文件
- 读取 CSV
- 标准化空值
- 统一列名

##### Step 2：映射为 plant identity 中间对象
输出：
- `plant_identity_entities_payload`
- `plant_identity_aliases_payload`
- `plant_identity_match_rules_payload`

##### Step 3：归一
- 生成 canonical identity
- 生成 primary_display_name
- 生成 identity_level
- 生成 alias_type
- 生成 match_key

##### Step 4：校验
- canonical identity 唯一性
- alias 不重复
- match_key 合法
- identity_level 合法

##### Step 5：写入
导入顺序：
1. `plant_identity_entities`
2. `plant_identity_aliases`
3. `plant_identity_match_rules`

---

#### 3.2 `plants_v13_user_friendly_full_v7.xlsx` 导入步骤

##### Step 1：读取工作表
- 读取所有需要的工作表
- 标准化列名

##### Step 2：映射为 diagnosis 中间对象
输出：
- `problems_payload`
- `symptoms_payload`
- `question_library_v5_real_payload`
- `question_option_mapping_v5_real_payload`
- `question_strategy_v5_real_payload`
- `question_generation_engine_payload`
- `diagnosis_result_explanations_payload`
- `plant_problem_profiles_payload`

##### Step 3：归一
- problem_key
- symptom_key
- question_key
- profile_key
- review_status / data_source / version

##### Step 4：校验
- 问题键唯一性
- 症状键唯一性
- question 与 option 的从属关系
- profile 中 plant / genus / family 背景字段合法

##### Step 5：写入
导入顺序：
1. `problems`
2. `symptoms`
3. `question_library_v5_real`
4. `question_option_mapping_v5_real`
5. `question_strategy_v5_real`
6. `question_generation_engine`
7. `diagnosis_result_explanations`
8. `plant_problem_profiles`

---

#### 3.3 `genus_care_profile.csv` 导入步骤

##### Step 1：读取原始文件
- 当前文件无表头
- 第一版脚本先按已知列顺序读取
- 立即补成带正式表头的中间 DataFrame

##### Step 2：映射为 genus care 中间对象
输出：
- `genus_care_profiles_payload`

##### Step 3：归一
- `plant_category` 受控值域化
- `toxicity_level` 受控值域化
- `review_status` 受控值域化
- `evidence_level` / `evidence_strategy` 受控值域化
- 4 类 JSON schema 规范化

##### Step 4：校验
必须校验：
- `genus_name + family_name` 唯一
- `temp_min_c <= temp_max_c`
- `humidity_min <= humidity_max`
- JSON 可解析
- 必填字段存在
- 枚举值合法

##### Step 5：写入
导入：
- `genus_care_profiles`

---

### 四、推荐目录结构

```text
scripts/
  loaders/
    load_plant_catalog.py
    load_diagnosis_v7.py
    load_genus_care_profiles.py

  mappers/
    map_plant_identity_entities.py
    map_diagnosis_tables.py
    map_genus_care_profiles.py

  normalizers/
    normalize_identity_fields.py
    normalize_diagnosis_fields.py
    normalize_genus_care_fields.py

  validators/
    validate_taxonomy_payload.py
    validate_diagnosis_payload.py
    validate_genus_care_payload.py

  importers/
    import_taxonomy_tables.py
    import_diagnosis_tables.py
    import_genus_care_tables.py

  reports/
    build_import_report.py
```

---

### 五、导入顺序总方案

#### 第一阶段：Taxonomy 主数据
1. `plant_identity_entities`
2. `plant_identity_aliases`
3. `plant_identity_match_rules`
4. `plant_identity_merge_history`
5. `genus_care_profiles`

#### 第二阶段：Diagnosis 静态业务
6. `problems`
7. `symptoms`
8. `question_library_v5_real`
9. `question_option_mapping_v5_real`
10. `question_strategy_v5_real`
11. `question_generation_engine`
12. `diagnosis_result_explanations`
13. `plant_problem_profiles`

#### 第三阶段：挂接层
14. `plant_identity_diagnosis_links`

##### 说明
第一版可以先手工构造或脚本半自动生成挂接表。

---

### 六、第一版错误治理口径

#### 6.1 错误分级
建议至少分为：

- `fatal`：阻断导入
- `warning`：允许导入但需记录
- `info`：仅提示

---

#### 6.2 典型 fatal
- 主键重复
- 必填字段缺失
- JSON 无法解析
- 受控值域非法
- 关键外键找不到

---

#### 6.3 典型 warning
- baseline_note 为空
- 某些可选字段缺失
- 某条 explanation 过短
- 某些匹配名需人工补审

---

### 七、第一版技术选型建议

#### 7.1 脚本语言
建议使用：

- Python

##### 原因
- 处理 CSV / XLSX 方便
- JSON schema 校验方便
- 适合构建导入报告
- 与现有数据整理工作衔接顺畅

---

#### 7.2 推荐库
- `pandas`
- `openpyxl`
- `json`
- `pydantic` 或 `jsonschema`（二选一）

---

### 八、第一版落地顺序建议

1. 先写 loader
2. 再写 mapper
3. 再写 normalizer
4. 再写 validator
5. 最后写 importer + report

不要一开始就写“直接导库一把梭”，否则返工会很大。

---

### 九、一句话总裁决

**这份第一版数据映射 / 导入脚本方案 v1，已经足以指导你开始写第一轮导入脚本，并跑出第一版 dev 数据验证。**



## [S45] 属级养护基线表设计 v1.1（review 增补修正版，完整最终版）

- 文件名：`属级养护基线表设计_v1_1_full_reviewed_final_标题版本已统一.md`
- 状态：A类正式基线
- 类别：属级养护基线
- 用途：genus_care_profiles 表设计、字段、JSON 策略与枚举
- SHA-256 前 16 位：`915ed67cc7be8780`

---

### 属级养护基线表设计 v1.1（review 增补修正版，完整最终版）

> 说明：
>
> - 本文档用于把 `genus_care_profile.csv` 正式收束为可落表、可入 SQL、可服务后续养护建议与动作建议系统的正式设计文档。
> - 本文档建立在以下前提之上：
>   - `genus_care_profile.csv` 已经完成逐行校对，具备属级养护基线数据价值
>   - 当前诊断系统已明确：
>     - Taxonomy 主数据层
>     - Diagnosis 静态业务层
>     - Taxonomy → Diagnosis 挂接层
>     - 运行时与监督层
>   - `plant_catalog.csv` + `plants_v13_user_friendly_full_v7.xlsx` 是最终制表（SQL）的素材来源
>   - `genus_care_profile.csv` 作为新增确认数据，应正式纳入本次落表范围
>
> - 本文档遵循：
>
> # **中文是一等公民**
> # **中文主名优先**
> # **只给完整最终文件，不给纯补丁**

---

### 一、文档目标

本文件要解决 7 个问题：

1. `genus_care_profile.csv` 的正式定位是什么
2. 它应落成什么正式表
3. 正式表头如何定义
4. JSON 字段 schema 如何冻结
5. 它与 Taxonomy 的挂接关系是什么
6. 它与 future species / care_overrides 的边界是什么
7. 它如何服务后续养护建议 / 行动建议系统

---

### 二、正式定位

#### 2.1 它不是 Diagnosis 问题表

这张表不表达：

- problem
- symptom
- question
- outcome

因此它不属于 Diagnosis 静态业务层主表。

---

#### 2.2 它应正式归入 Taxonomy 侧主数据体系

这张表表达的是：

### **属级养护基线**

它描述的是：

- 某个属级对象在常规养护上的基线偏好
- 浇水 / 施肥 / 光照 / 通风 / 温湿度 / 毒性等长期稳定特征
- 后续 species / identity 级别覆盖的上位基线

因此它最合理的正式定位是：

### **Taxonomy 侧属级养护基线主表**

---

#### 2.3 正式表名

##### 英文正式表名
`genus_care_profiles`

##### 中文主名
**属级养护基线表**

---

### 三、它在系统中的职责

#### 3.1 它服务哪些系统能力

这张表至少服务 4 类能力：

##### 1. 养护背景说明
给 explanation / 产品说明提供属级养护背景

##### 2. 行动建议生成
为后续“浇水建议 / 光照建议 / 通风建议 / 施肥建议 / 湿度建议”提供稳定基线

##### 3. 宿主环境上下文
作为植物宿主背景的一部分，帮助判断：
- 当前环境与基线是否偏离
- 某些问题是否可能和养护偏差有关

##### 4. future overrides 的上位基线
为后续：
- species care overrides
- plant identity care overrides
- 特定品种 / 园艺变体 overrides
提供上位默认值

---

#### 3.2 它不服务什么

它不应直接承担：

- 最终 diagnosis
- problem 定义
- outcome 锁定
- 单次会话运行时状态
- 临时问答结论

也就是说：

### **它是主数据基线表，不是会话结果表。**

---

### 四、正式表结构设计

#### 4.1 正式字段清单

当前建议正式字段如下：

| 正式字段名 | 中文主名 | 说明 |
|---|---|---|
| `genus_care_profile_id` | 属级养护基线ID | 主键 |
| `genus_name` | 属名 | 对应 genus |
| `family_name` | 科名 | 用于加强唯一性与校验 |
| `plant_category` | 植物类别 | 如室内观叶、开花、藤本等 |
| `watering_strategy_json` | 浇水策略JSON | 结构化浇水基线 |
| `fertilizing_strategy_json` | 施肥策略JSON | 结构化施肥基线 |
| `light_strategy_json` | 光照策略JSON | 结构化光照基线 |
| `airflow_strategy_json` | 通风策略JSON | 结构化通风基线 |
| `temp_min_c` | 最低适宜温度（℃） | 数值 |
| `temp_max_c` | 最高适宜温度（℃） | 数值 |
| `humidity_min` | 最低适宜湿度 | 数值 |
| `humidity_max` | 最高适宜湿度 | 数值 |
| `toxicity_level` | 毒性等级 | 结构化等级 |
| `review_status` | 审核状态 | audited / review_pending 等 |
| `source_evidence` | 证据来源 | 来源说明 |
| `baseline_note` | 基线说明 | 可读性说明 |
| `evidence_level` | 证据层级 | L1 / L2 等 |
| `evidence_strategy` | 证据策略 | representative / derived 等 |
| `data_source` | 数据来源 | 固定为本轮素材来源 |
| `version` | 版本 | 数据版本 |
| `is_active` | 是否启用 | 状态位 |
| `created_at` | 创建时间 | 时间戳 |
| `updated_at` | 更新时间 | 时间戳 |
| `retired_at` | 退役时间 | 可空 |
| `replacement_profile_id` | 替代基线ID | 可空 |

---

#### 4.2 当前最小必备字段

如果第一期需要压缩，最小必备字段至少应包括：

- `genus_care_profile_id`
- `genus_name`
- `family_name`
- `plant_category`
- `watering_strategy_json`
- `fertilizing_strategy_json`
- `light_strategy_json`
- `airflow_strategy_json`
- `temp_min_c`
- `temp_max_c`
- `humidity_min`
- `humidity_max`
- `toxicity_level`
- `review_status`
- `source_evidence`
- `baseline_note`
- `evidence_level`
- `evidence_strategy`
- `is_active`
- `created_at`
- `updated_at`

---

### 五、唯一性与主键规则

#### 5.1 主键规则

正式主键：

- `genus_care_profile_id`

必须为系统生成主键，不直接使用 genus_name 代替主键。

---

#### 5.2 当前业务唯一性建议

第一期建议以：

- `genus_name`
- `family_name`

共同构成业务唯一性约束。

##### 原因
只用 genus_name 虽然在多数情况下可行，但后续：
- 历史名
- 命名冲突
- 数据清洗阶段异常值

都可能让 family_name 成为必要补强。

---

### 六、CSV 正式表头定义

#### 6.1 当前问题

`genus_care_profile.csv` 当前没有正式表头。  
这意味着它还不是可直接导入的正式 CSV。

---

#### 6.2 正式 CSV 表头建议

后续若继续以 CSV 作为导入中间层，应正式加上表头：

```csv
genus_name,family_name,plant_category,watering_strategy_json,fertilizing_strategy_json,light_strategy_json,airflow_strategy_json,temp_min_c,temp_max_c,humidity_min,humidity_max,toxicity_level,review_status,source_evidence,baseline_note,evidence_level,evidence_strategy,reserved,created_at,updated_at
```

##### 说明
- `reserved` 当前可保留但不建议长期存在
- 更稳的方式是后续直接去掉 `reserved`，用正式新增字段替代

---

### 七、JSON schema 冻结

这是本文件最关键的一部分之一。

---

#### 7.1 浇水策略 JSON（`watering_strategy_json`）

##### 中文主名
浇水策略

##### 当前建议 schema
```json
{
  "way": "soil_dry_then_water",
  "freq": 7,
  "unit": "day",
  "verb": "浇透"
}
```

##### 字段说明
- `way`：浇水方式
- `freq`：频率数值
- `unit`：频率单位
- `verb`：动作动词

##### 必填字段
- `way`
- `freq`
- `unit`

##### 可选字段
- `verb`

##### 当前建议合法值
###### `way`
- `soil_dry_then_water`
- `keep_slightly_moist`
- `avoid_waterlogging`
- `allow_partial_dry_between_watering`

###### `unit`
- `day`
- `week`

---

#### 7.2 施肥策略 JSON（`fertilizing_strategy_json`）

##### 中文主名
施肥策略

##### 当前建议 schema
```json
{
  "freq": 14,
  "unit": "day",
  "type": "balanced_liquid_fertilizer",
  "other": "生长期为主"
}
```

##### 必填字段
- `freq`
- `unit`
- `type`

##### 可选字段
- `other`

##### 当前建议合法值
###### `unit`
- `day`
- `week`
- `month`

###### `type`
- `balanced_liquid_fertilizer`
- `foliage_plant_fertilizer`
- `flowering_plant_fertilizer`
- `slow_release_fertilizer`
- `diluted_general_fertilizer`

---

#### 7.3 光照策略 JSON（`light_strategy_json`）

##### 中文主名
光照策略

##### 当前建议 schema
```json
{
  "way": "bright_indirect_light",
  "freq": null,
  "unit": null,
  "other": "避免强烈直晒"
}
```

##### 必填字段
- `way`

##### 可选字段
- `freq`
- `unit`
- `other`

##### 当前建议合法值
###### `way`
- `bright_indirect_light`
- `medium_indirect_light`
- `bright_scattered_light`
- `gentle_direct_light_ok`
- `avoid_harsh_direct_sun`

---

#### 7.4 通风策略 JSON（`airflow_strategy_json`）

##### 中文主名
通风策略

##### 当前建议 schema
```json
{
  "level": "good_airflow",
  "sensitivity": "avoid_stagnant_air"
}
```

##### 必填字段
- `level`

##### 可选字段
- `sensitivity`

##### 当前建议合法值
###### `level`
- `good_airflow`
- `moderate_airflow`
- `stable_airflow`

###### `sensitivity`
- `avoid_stagnant_air`
- `avoid_strong_draft`
- `normal`

---

### 八、与 Taxonomy 的挂接关系

#### 8.1 当前阶段的正式挂接方式

第一期最稳的做法是：

### **通过 `genus_name` + `family_name` 与 Taxonomy 侧 genus 语义挂接**

也就是说，这张表当前不直接依赖：
- `genus_id`
- `genus_identity_id`

因为这些维表或对象化结构，在第一期未必已经完全独立稳定。

---

#### 8.2 后续可升级挂接方式

当以下结构成熟后：

- `taxonomy_genera`
或
- genus 级 `plant_identity_entity`

可进一步升级为：

- `genus_id`
或
- `genus_identity_id`

显式挂接。

---

#### 8.3 当前边界写死

### **当前阶段它是 genus baseline**
### **不是 species 主表**
### **也不是 plant identity 级唯一养护真值表**

---

### 九、与 future overrides 的边界

#### 9.1 它是基线，不是终局覆盖层

新增正式规则：

### **属级养护基线表是上位默认值，不是后续一切养护策略的唯一真值表。**

---

#### 9.2 后续应允许的覆盖层

未来应允许：

##### 1. species care overrides
当 species 已稳定且确有显著差异时，允许覆盖 genus baseline。

##### 2. plant identity care overrides
当某个 plant identity 在产品层面有足够独立价值时，允许做更细覆盖。

##### 3. horticultural variant overrides
当园艺变体确有长期稳定差异时，允许做变体覆盖。

---

#### 9.3 当前阶段禁止的误解

##### 禁止把 genus baseline 理解成
- 所有 species 都永远完全相同
- 所有 identity 都不能再细化
- 以后不需要 overrides

这条必须先写死，不然后续会被这张表反向绑死。

---

### 十、与行动建议系统的关系

#### 10.1 这张表是行动建议系统的重要上游

后续行动建议至少会用到：

- 浇水策略
- 光照策略
- 通风策略
- 温度区间
- 湿度区间
- 毒性等级

也就是说，这张表会成为：

### **行动建议系统的基线输入层**

---

#### 10.2 行动建议不能直接等于基线表原句复读

虽然这张表会服务行动建议，但不能简单做成：

- 取 baseline_note 直接输出
- 取 JSON 文本直接对用户复读

更合理的做法是：

- baseline 作为规则输入
- 再结合：
  - 用户环境
  - 当前症状
  - 当前问题路径
  - 当前季节 / 阶段
生成更贴合上下文的动作建议

---

### 十一、纳入最终 SQL 制表方案的结论

本文件最终钉死：

### **`genus_care_profile.csv` 应正式纳入本次落表**
### **正式表名为 `genus_care_profiles`**
### **正式定位为 Taxonomy 侧属级养护基线主表**
### **当前不能原样直接入库，必须先补正式表头与 JSON schema**
### **后续允许 species / identity / variant 级 overrides 覆盖**

---

### 十二、下一步建议

本文件完成后，最合理的下一步是：

1. 把 `genus_care_profiles` 正式纳入《最终 SQL 制表方案 v1.1》的主表清单
2. 给 `genus_care_profile.csv` 生成带正式表头的导入版
3. 在正式 SQL 草案中把它落成主表
4. 预留 future overrides 设计位，但本期不强行展开




### ================================
### v1.1 新增附录开始（基于 v1 只增不减）
### ================================

> 说明：
>
> - 以下内容为《属级养护基线表设计 v1》在**完整保留 v1 原文**的前提下，继续新增的 review 收口附录。
> - 上文全部内容 = v1 原文，原样保留。
> - 下文附录 A～D = 基于最高规格审查结果新增的修正版内容。
> - 本次新增只做补充，不删改上文，不重排上文，不替换上文。

---

### 附录 A：当前挂接键与未来升级键边界增补（本次新增，不替换上文）

#### A-1. 一期正式挂接键写死

为防止实现口径摇摆，现正式写死：

### **第一阶段 `genus_care_profiles` 的正式业务挂接键 = `genus_name + family_name`**

这意味着：

- 当前查询
- 当前导入
- 当前 Taxonomy 侧 genus 语义挂接
- 当前行动建议基线查询

都应以这组键作为第一阶段正式口径。

---

#### A-2. 这组挂接键是“阶段性正式键”，不是永久终局形态

新增正式说明：

### **`genus_name + family_name` 是当前阶段的正式挂接键，但不是永久终局形态。**

后续当以下结构成熟后：

- `taxonomy_genera`
或
- genus 级 `plant_identity_entity`

可升级为：

- `genus_id`
或
- `genus_identity_id`

显式挂接。

---

#### A-3. 当前表结构应预留升级位

为避免未来迁移成本过高，当前表结构建议预留：

- `genus_id`（可空）
- `genus_identity_id`（可空）

##### 说明
- 第一阶段允许为空
- 第二阶段结构成熟后再逐步回填
- 不得因为当前还未启用，就否定其预留必要性

---

### 附录 B：JSON schema 空值 / 未知值 / 扩展规则增补（本次新增，不替换上文）

#### B-1. 空值规则

##### 正式规则
- `null`：字段存在，但当前无值
- 空字符串：不得作为 schema 内部字段合法值
- 缺字段：只允许出现在可选字段上

---

#### B-2. 未知值 / 不适用值规则

当前建议正式允许：

- `unknown`
- `not_applicable`

##### 含义
- `unknown`：当前未知，但理论上应有此信息
- `not_applicable`：该字段对当前对象不适用

---

#### B-3. 枚举扩展规则

新增正式规则：

### **当前文档列出的合法枚举值属于 v1 冻结值域。**
### **后续如需新增枚举，必须通过版本增补，不允许脚本侧私扩。**

这意味着：

- 校验器可按当前值域严格校验
- 后续扩展必须走文档增补与版本升级
- 不允许某个导入脚本偷偷新增本地枚举值

---

### 附录 C：字段值域冻结增补（本次新增，不替换上文）

#### C-1. `plant_category` 当前建议值域

建议当前先冻结为受控值，例如：

- `indoor_foliage`
- `flowering`
- `vine`
- `succulent`
- `fern`
- `woody_foliage`
- `aquatic_or_semi_aquatic`
- `other`

##### 说明
- 这是 v1 建议冻结值域
- 后续如需扩展，必须走版本增补

---

#### C-2. `toxicity_level` 当前建议值域

建议当前先冻结为：

- `non_toxic`
- `mild_toxic`
- `toxic`
- `unknown`

##### 说明
- 当前先做主数据等级，不直接展开为多维宠物 / 儿童风险体系
- 后续若有必要，可再引入更细风险维度

---

#### C-3. `review_status` 当前建议值域

建议当前先冻结为：

- `audited`
- `review_pending`
- `deprecated`
- `retired`

---

#### C-4. `evidence_level` 当前建议值域

建议当前先冻结为：

- `L1_representative_species_direct`
- `L2_derived_from_authoritative_sources`

---

#### C-5. `evidence_strategy` 当前建议值域

建议当前先冻结为：

- `representative_species`
- `authoritative_derivation`

---

### 附录 D：导入校验规则增补（本次新增，不替换上文）

#### D-1. 必须通过的基础校验

正式导入前，至少必须通过以下校验：

1. `genus_name + family_name` 不得重复
2. `temp_min_c <= temp_max_c`
3. `humidity_min <= humidity_max`
4. 所有 JSON 字段必须可解析
5. 必填字段不得缺失
6. `review_status` 必须在合法值域内
7. `toxicity_level` 必须在合法值域内
8. `evidence_level` / `evidence_strategy` 必须在合法值域内

---

#### D-2. 推荐增加的语义校验

建议后续再加：

- `freq` 不得为负数
- `unit` 必须与 `freq` 语义匹配
- `way` / `type` / `level` 必须在当前枚举值域内
- `baseline_note` 不得为空白长文本垃圾值

---

### 本文件版本状态说明

- 上文全部内容 = 《属级养护基线表设计 v1》原文，原样保留
- 下文附录 A～D = 本次最高规格 review 后新增的收口内容
- 二者合并后，共同构成：

### **《属级养护基线表设计 v1.1（review 增补修正版，完整最终版）》**



## [S46] 属级养护基线概念联动分析与文档增补建议 v1

- 文件名：`属级养护基线概念联动分析与文档增补建议_v1_重新生成版.md`
- 状态：A类正式基线
- 类别：属级养护基线/联动
- 用途：属级养护基线与 Taxonomy、SQL、运行时、行动建议的联动分析
- SHA-256 前 16 位：`62b7f4ee73b79594`

---

### 属级养护基线概念联动分析与文档增补建议 v1

> 分析目标：
>
> - 判断“属级养护基线表”这一新概念与当前全部宪法、概念文档的关系
> - 判断哪些文档必须增补，哪些文档建议增补
> - 给出联动优先级

---

### 一、总判断

### **“属级养护基线表”不是局部附加概念。**
### **它会正式进入当前总体系，并与 Taxonomy、SQL、运行时、行动建议多条链路发生关系。**

因此它不能只停留在单独一份《属级养护基线表设计》里。  
至少需要对若干主文档做联动增补。

---

### 二、必须增补的文档

#### 2.1 《植物 Taxonomy 体系定义 v1.1（review 增补修正版，完整最终版）》

##### 必须增补原因
属级养护基线表正式归入：

### **Taxonomy 侧主数据体系**

因此 Taxonomy 主数据体系定义里，必须明确新增：

- genus care baseline 的正式地位
- 它不是 diagnosis 表
- 它是 genus 级主数据的一部分
- 它与 future species / identity overrides 的边界

##### 建议新增的概念
- 属级养护基线
- genus care baseline
- care overrides 边界

---

#### 2.2 《最终 SQL 制表方案 v1.1（范围收口修正版，完整最终版）》

##### 必须增补原因
这张表已经明确要正式纳入本次落表。  
因此 SQL 总方案必须把它正式加入：

- 总表清单
- 分层位置
- 本期必须落表 / 建议落表 / 可选预留表的分类
- 与 Taxonomy 的挂接关系
- 与行动建议系统的上游关系

##### 建议新增位置
- Taxonomy 主数据层表清单
- 本期必须落表清单
- 两份素材源之外的新增正式主表说明

---

#### 2.3 《Taxonomy / Diagnosis SQL 字段映射表 v1（完整最终版）》

##### 必须增补原因
虽然 `genus_care_profile.csv` 不是最初那两份素材之一，但既然现在确认它是正式落表数据之一，这份文档就必须补：

- `genus_care_profile.csv`
- `genus_care_profiles`

的字段映射关系。

##### 建议新增内容
- 新增一节：属级养护基线字段映射
- 正式表头与 JSON 字段映射
- 新增治理字段映射

---

### 三、强烈建议增补的文档

#### 3.1 《核心数据结构 v1.5（完整最终版，基于可用前版只增不减）》

##### 建议增补原因
当前核心数据结构文档主要覆盖：
- diagnosis 主对象
- 运行时对象
- 视觉入口对象
- identity 相关对象

但现在既然 genus care baseline 要入体系，就应该在“静态主数据对象”部分明确补入：

- `genus_care_profiles`

并说明其对象级职责与 future overrides 边界。

---

#### 3.2 《统一术语表 v1.3（完整最终版，基于可用前版只增不减）》

##### 建议增补原因
这份表应该补几个正式术语：

- 属级养护基线
- genus care baseline
- species care overrides
- plant identity care overrides
- 行动建议基线输入层

这样后续不会出现多种叫法混乱。

---

#### 3.3 《最小可用知识库 v1.2（完整最终版，基于可用前版只增不减）》

##### 建议增补原因
如果你当前体系已经把“属级养护基线”纳入正式主数据，那最小可用知识库文档里，应该明确：

- 除了 diagnosis 侧知识
- 还至少需要：
  - identity 主数据
  - genus care baseline

否则最小知识库的定义会偏 diagnosis，不够完整。

---

#### 3.4 《准入与退役规则 v1.2（完整最终版，基于可用前版只增不减）》

##### 建议增补原因
这张表以后也会经历：

- 审核
- 停用
- 替代
- 证据层级调整

所以准入与退役规则里，建议补一节：

- 属级养护基线表的准入 / 退役规则

---

### 四、可选增补的文档

#### 4.1 《运行时模型 v1.4（完整最终版，基于可用前版只增不减）》

##### 可选增补原因
运行时本身不直接消费 genus care baseline 去做 diagnosis 收敛，  
但后续若行动建议系统进入运行时链路，可能需要在 explanation / action policy 阶段补一节引用关系。

当前不是最高优先级。

---

#### 4.2 《AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1（分支场景增补版，完整最终版）》

##### 可选增补原因
未来若要演示“诊断后行动建议生成”，可以在示例链路末端补一句：

- action policy 如何调用 genus care baseline

但当前不是必须。

---

### 五、不建议强行增补的文档

#### 5.1 《诊断结论层 v1.2（完整最终版，基于 v1.1 只增不减）》

不建议强行补。  
因为属级养护基线不是 outcome object，也不属于 outcome layer 核心边界。

---

#### 5.2 《诊断目标分层 v1.4（完整最终版，基于可用前版只增不减）》

也不建议强行补。  
因为它不是 problem taxonomy 对象，不属于问题分层主语义。

---

### 六、联动优先级建议

#### 第一优先级（必须立即补）
1. 《植物 Taxonomy 体系定义 v1.1》
2. 《最终 SQL 制表方案 v1.1》
3. 《Taxonomy / Diagnosis SQL 字段映射表 v1》

#### 第二优先级（强烈建议补）
4. 《核心数据结构 v1.5》
5. 《统一术语表 v1.3》
6. 《最小可用知识库 v1.2》
7. 《准入与退役规则 v1.2》

#### 第三优先级（可选后补）
8. 《运行时模型 v1.4》
9. 《AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1》

---

### 七、最终结论

本次新增的“属级养护基线表”概念，已经足够重要到：

### **必须进入 Taxonomy 主数据体系**
### **必须进入 SQL 制表总方案**
### **必须进入字段映射文档**

同时，它还应进一步联动：

- 核心数据结构
- 统一术语表
- 最小可用知识库
- 准入与退役规则

但当前：

- 不必强行塞进诊断结论层
- 不必强行塞进诊断目标分层

这样既保持体系完整，也不把不属于 diagnosis 核心对象的东西硬塞进 problem / outcome 文档。



## [S47] 《genus_care_profile.csv》最高规格审查报告（属级养护策略数据）

- 文件名：`genus_care_profile_review_report.md`
- 状态：A类正式基线
- 类别：属级养护基线/审查
- 用途：genus_care_profile.csv 审查报告与正式定位判断
- SHA-256 前 16 位：`c62a67501be6b518`

---

### 《genus_care_profile.csv》最高规格审查报告（属级养护策略数据）

> 审查对象：
>
> - `genus_care_profile.csv`
>
> 审查目标：
>
> - 判断它是否属于本次需要正式落表的数据之一
> - 判断它更适合落在哪一层
> - 判断它当前是否可以直接入库
> - 判断它与 Taxonomy / Diagnosis / 行动建议体系的关系
>
> 先给结论：
>
> # **这份数据应该正式进入本次落表范围。**
> # **它更适合作为 Taxonomy 侧的“属级养护基线主数据表”。**
> # **但它当前不能原样直接入库，必须先做结构收口。**

---

### 一、为什么这份数据必须纳入正式落表

这份数据不是边角料，也不是可有可无的补充素材。  
它关系到后续至少 4 条主链路：

1. **植物养护数据主链路**
2. **行动建议生成**
3. **宿主背景解释**
4. **后续 species / care_overrides 的上位基线**

如果没有这张表，你后续在“养护建议”“基线阈值”“环境偏好”“毒性提示”这些方面，会很快陷入：

- 行动建议没有稳定上游
- 养护策略只能临时拼接
- 属级基线与 species 差异无法管理
- 养护侧数据和诊断侧数据分裂

所以，结论很明确：

### **它不是参考表，而是主数据候选表。**

---

### 二、我看到的当前数据结构

从文件本身看，它当前一共有 **152 行**，且 **属名无重复**，这说明它已经明显按“一个属一条基线记录”的方向组织。  
同时，`review_status` 当前全部为 `audited`，说明你之前已经按逐行校对思路推进过这一轮。  
`evidence_level` 当前主要分成两类：

- `L1_representative_species_direct`
- `L2_derived_from_authoritative_sources`

这也说明它不是随手写的，而是有证据层级意识的数据。  

同时，它当前已经包含这些核心字段组：

- 属名
- 科名
- 植物类别
- 浇水策略 JSON
- 施肥策略 JSON
- 光照策略 JSON
- 通风策略 JSON
- 温度范围
- 湿度范围
- 毒性等级
- 审核状态
- 证据来源
- 基线说明
- 证据层级
- 证据策略
- 创建时间 / 更新时间

这套字段，已经非常接近一张正式主表。

---

### 三、我对它的正式定位判断

#### 3.1 它不应放到 Diagnosis 主表层

它不是：

- problem 表
- symptom 表
- question 表
- explanation 表

因为它表达的不是“问题对象”，而是：

### **属级养护基线**

所以它不应归到 Diagnosis 静态业务层。

---

#### 3.2 它更适合放到 Taxonomy 主数据侧

这份数据最合理的正式定位是：

### **Taxonomy 侧的属级养护基线主表**

更准确一点说，它应该成为：

- genus 级养护策略主表
- care baseline 主表
- species / care_overrides 的上位基线表

也就是说，它和 `plant_identity_entities` 的关系，不是平级乱连，而是：

- plant identity entity
- genus 维度 / genus_name
- genus care baseline

这条链。

---

#### 3.3 它不应直接绑在单个 species 上

因为它现在的组织粒度很明显是：

### **属级（genus level）**

不是：
- species level
- cultivar level

所以它不应被误落成：
- species 养护表
- 单植物专属表

它应该先作为：

### **genus care baseline**

然后未来再允许：

- species care overrides
- identity-level care overrides

在它上面做覆盖。

---

### 四、当前数据的优点

#### 4.1 粒度是对的
你现在这个表按属级组织，非常适合当前阶段。  
因为你前面整套 Taxonomy 体系已经确认：

- species 不一定总是稳定
- genus 级对象很重要
- genus 可以作为稳定降级承接层

那养护策略也按 genus 先落，这个方向是对的。

---

#### 4.2 结构已经有“可程序消费”的雏形
尤其是这些 JSON 字段：

- `watering_json`
- `fertilizing_json`
- `light_json`
- `airflow_json`

这说明它不是纯文本建议表，而是在往：

### **可程序消费**
### **可结构化动作建议**
### **可未来前端直出**

这个方向走。

这是很重要的优点。

---

#### 4.3 证据意识是对的
当前已经有：

- `source_evidence`
- `baseline_note`
- `evidence_level`
- `evidence_strategy`
- `review_status`

这意味着它后续可以进入：

- 审查
- 追溯
- 分层治理
- 后续再校正

而不是一张“建议写死后无法追责”的表。

---

### 五、当前不能原样直接入库的几个问题

#### 5.1 最大问题：它没有正式表头

这是当前最明确的问题。

文件本身第一行就是数据，不是表头。  
这意味着它当前还是：

### **半成品 CSV**
而不是：
### **正式可直接导入的 schema 化 CSV**

这件事必须修。

##### 为什么严重
因为一旦进入：
- SQL 映射脚本
- 导入脚本
- 校验脚本

没有正式表头就会导致：
- 字段位置依赖
- 维护脆弱
- 后续一旦增列就容易错位

##### 结论
这不是小问题，必须先补正式表头。

---

#### 5.2 JSON 字段还缺正式 schema 约束

虽然这几个 JSON 当前都能正常解析：

- 浇水
- 施肥
- 光照
- 通风

但它们还停留在“可解析”，还没到“正式 schema 冻结”的程度。

例如当前已经能看出：

##### 浇水
大致结构是：
- `way`
- `freq`
- `unit`
- `verb`

##### 施肥
大致结构是：
- `freq`
- `type`
- `unit`
- `other`

##### 光照
大致结构是：
- `way`
- `freq`
- `unit`
- `other`

##### 通风
大致结构是：
- `level`
- `sensitivity`

这已经不错，但还需要正式文档把：

- 必填字段
- 可选字段
- 枚举值
- 值域
- freq 的语义
- unit 的合法取值

全部钉死。

否则后面表一扩展，字段就会漂。

---

#### 5.3 它与 Taxonomy 主表的挂接关系还没正式写死

它现在逻辑上显然应该挂：

- genus_name
- 或 genus 维度对象

但当前还没正式定义：

### **它到底通过什么主键 / 外键去挂 Taxonomy**

现在至少有 3 种可能：

1. 直接用 `genus_name`
2. 用未来的 `taxonomy_genera.genus_id`
3. 用 `plant_identity_entities` 中 genus 级 identity 的 `plant_identity_id`

这三种不是一回事。

我的判断是：

##### 当前阶段最稳的做法
先把它落成：

### **`genus_care_profiles`**
并以：
- `genus_name`
- `family_name`
作为第一阶段业务唯一性键

##### 后续更稳的做法
再在 Taxonomy 维表或 genus 级 identity 稳定后，补：
- `genus_id`
或
- `genus_identity_id`

但这条必须先在方案中说清楚。

---

#### 5.4 它和后续 species / care_overrides 的边界必须提前写死

你自己已经点到重点了：

这张表关系到后期植物养护数据、行动建议。

那就意味着它不能一个人把所有养护语义全吞掉。  
必须先写死：

### **它是 genus baseline**
不是：
### **最终所有植物的唯一养护真值表**

后面应允许：

- species care overrides
- plant identity care overrides
- 特殊品种 / 园艺变体 overrides

否则未来你一旦引入更细粒度养护数据，这张表会被迫重构。

---

### 六、正式落表建议

#### 6.1 正式表名建议
我建议把它正式落为：

### **`genus_care_profiles`**

中文主名：

### **属级养护基线表**

---

#### 6.2 字段建议
当前建议正式字段至少包括：

- `genus_care_profile_id`
- `genus_name`
- `family_name`
- `plant_category`
- `watering_strategy_json`
- `fertilizing_strategy_json`
- `light_strategy_json`
- `airflow_strategy_json`
- `temp_min_c`
- `temp_max_c`
- `humidity_min`
- `humidity_max`
- `toxicity_level`
- `review_status`
- `source_evidence`
- `baseline_note`
- `evidence_level`
- `evidence_strategy`
- `is_active`
- `created_at`
- `updated_at`

##### 补充建议
当前还建议新增：
- `data_source`
- `version`
- `replacement_profile_id`（按需）
- `retired_at`（按需）

---

#### 6.3 唯一性建议

当前建议唯一性至少先按：

- `genus_name`
- `family_name`

控制

而不是只按 genus_name。  
因为后面如果出现极少数命名歧义或历史名问题，family 会更稳。

---

### 七、我对它是否应纳入本次正式落表的结论

结论很明确：

### **应该纳入**
而且不是“以后再说”，而是：

### **现在就应纳入本次正式落表范围**

但它应纳入的是：

### **Taxonomy 侧属级养护基线主表**
而不是：
- Diagnosis 问题表
- 运行时表
- 临时建议表

---

### 八、当前最合理的下一步

基于这次审核，我建议下一步直接建立一份正式文档：

### **《属级养护基线表设计 v1》**

它要专门回答：

1. `genus_care_profile.csv` 的正式表名与定位
2. 正式字段表头
3. JSON schema 冻结
4. 与 Taxonomy 的挂接关系
5. 与 future species / care_overrides 的边界
6. 与行动建议系统的关系

这样后续这张表才能稳定进入最终 SQL 制表方案，而不是继续作为“审核过但未正式定义”的游离数据。

---

### 九、一句话结论

**这份 genus_care_profile.csv 应该正式纳入本次落表，而且应作为 Taxonomy 侧的“属级养护基线主表”；但它当前还不能原样入库，必须先补正式表头、JSON schema、挂接关系与 overrides 边界。**



## [S48] 绿植诊断系统完整流程图说明（终极版，中文主导，v1.1 开发收口版）

- 文件名：`绿植诊断系统完整流程图说明_终极版_中文主导_v1_1_开发收口版.md`
- 状态：A类正式基线
- 类别：流程图说明
- 用途：完整流程图文字说明；上游并行链、停止与输出资格、route hint 落位
- SHA-256 前 16 位：`3f017f1344decadc`

---

### 绿植诊断系统完整流程图说明（终极版，中文主导，v1.1 开发收口版）

#### 1. 本版新增的正式裁决

##### 1.1 上游并行链汇合关系
- 植物身份主链路
- AI视觉症状主链路

属于：
### **上游并行可独立完成的链路**

最终统一汇入：
- **上游结果汇合点**
- 再进入 **输入归一处理**

---

##### 1.2 停止条件与输出资格拆分
本版明确拆成两个节点：

1. **是否满足停止条件**
2. **停止后是否满足输出资格**

含义：
- 停止不等于一定可输出
- 停止后若仍不满足输出资格，系统仍可回到追问 / 补图 / 重算
- 只有停止且满足输出资格，才进入最终结论分类与输出

---

##### 1.3 route hint 与事实层落位顺序统一
本版正式写死：

### **只要条目已被正式接纳，就先进入正式观察证据集合。**
### **route hint 只改变后续流程优先级，不改变事实层先落位。**

因此：
- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

都不能绕过正式证据集合的建立。

---

##### 1.4 `hold_for_review` 第一版删除
考虑一人维护可控性，第一版不引入人工审核状态机。  
因此 `route_primary_action` 正式枚举只保留：

- `retake_first`
- `ask_first`
- `uncertain_prepare`
- `standard_flow`

---

#### 2. 如何阅读本图

##### 第一步：看主干
先看从：
- 用户输入
- 到身份链 / 症状链
- 到接纳判定
- 到上游结果汇合
- 到输入归一
- 到正式证据集合
- 到挂接
- 到问题竞争
- 到追问回流
- 到停止条件
- 到输出资格
- 到结论分类与输出

##### 第二步：看并行上游
注意：
- 植物身份主链路
- AI视觉症状主链路
是并行可独立完成的上游链。

##### 第三步：看关键分支
重点看：
- Taxonomy 未命中
- weak_matched / unresolved
- 图像质量不足
- 正式接纳 / 候选保留 / 仅解释保留 / 直接拒绝
- 优先补图 / 优先提问 / 不确定预备 / 标准流程
- identity / genus / family 挂接
- 问题性 / 非问题性 / 不确定结论

---

#### 3. 属级养护基线的位置
本版继续固定：

- 它属于 **Taxonomy 侧主数据**
- 第一阶段通过 **属名 + 归一科名** 挂接
- 它不进入问题主竞争链
- 它只在：
  - 解释组织
  - 环境偏离判断
  - 动作建议阶段
被消费

---

#### 4. 一句话总裁决
**这版图是当前开发阶段的正式流程图基线。**
