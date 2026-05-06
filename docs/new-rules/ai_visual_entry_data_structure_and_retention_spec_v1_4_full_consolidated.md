# AI视觉诊断入口层数据结构与留存规范 v1.4（器官识别与产品辅助输入增补版）

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

# 附录 A：症状链内部分层增补（本次新增，不替换原文）

## A-1. 症状识别主链路内部应进一步拆层

在此前已明确：

- 植物身份主链路：百度植物识别 → taxonomy 命中直取
- 症状识别主链路：混元

的基础上，现进一步明确：

# **症状识别主链路内部也必须分层，不得把整图直接粗暴映射为最终 canonical symptom。**

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

## A-2. AI symptom 与 canonical symptom 的边界进一步强化

新增正式说明：

# **AI symptom 仍然只是原始视觉证据层对象，不等于 canonical symptom。**

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

## A-3. follow-up 是准入层合法出口，不是补丁功能

新增正式说明：

对高歧义症状类型，follow-up 应被视为：

# **准入层的正式出口之一**

而不是：

- 模型没想好时的临时补丁
- 或 diagnosis 后面才追加的附属流程

也就是说：

- direct_admit
- followup_required
- reject_or_hold

这三者在入口层应当具有同等正式地位。

---

# 附录 B：器官识别与产品辅助输入增补（本次新增，不替换原文）

## B-1. 产品侧输入设计是器官识别的正式辅助机制

新增正式裁决：

# **器官识别不只依赖模型视觉判断，也允许并鼓励由产品侧输入设计提供显式器官提示。**

这意味着：

- 器官识别既可以来自模型判断
- 也可以来自产品 UI 的上传槽位语义
- 在当前冷启动阶段，产品侧结构化输入提示可以显著提高识别稳定性

这不是“作弊”，而是：

# **把产品交互优势转化为 AI 识别稳定性的正当手段。**

---

## B-2. 推荐的器官槽位上传设计

产品层可采用如下推荐结构：

### 图 1
- 叶片图（leaf image）

### 图 2
- 茎图（stem image）

### 图 3
- 根 / 根颈图（root or stem-base image）

### 图 4
- 全株图（whole-plant image）

### 图 5（可选）
- 花 / 果 / 其他特写图

补充说明：

- 不要求每次都必须填满
- 但若用户按槽位上传，系统应视其为**强器官提示**
- 该提示可进入症状识别主链路的器官层，作为正式上游条件

---

## B-3. 器官槽位提示的法律地位

新增正式边界：

# **产品侧器官槽位提示属于“结构化输入提示”，不是最终事实真值。**

它的地位高于：

- 模型在无提示情况下的自由猜测

但仍低于：

- 后续明确的人工纠正
- 高置信、反复一致的会话级证据

因此：

### 允许
- 用作 prompt 约束
- 用作器官字段预填
- 用作 symptom 映射的约束条件
- 用作 follow-up 优先级提示

### 不允许
- 直接跳过图像质量判断
- 直接跳过症状映射与准入
- 直接把某器官槽位上传等同于器官事实绝对真值

---

## B-4. 器官提示优先级建议

当前推荐优先级如下：

### 第一优先级
- 明确人工结构化输入提示（如上传槽位语义）

### 第二优先级
- 模型对器官的高置信识别

### 第三优先级
- 症状与器官的弱推断关系

这意味着：

# **在冷启动阶段，“图2是茎图”这种产品结构提示，应优先于模型自己猜“这更像叶片还是茎”。**

这是当前最务实也最稳的方案。

---

# 附录 C：字段级增补（本次新增，不替换原文）

## C-1. 单图原始记录增加器官输入提示字段

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

### 说明
这些字段用于承接产品侧的器官槽位语义。  
它们不是模型输出，而是：

# **结构化用户输入提示**

---

## C-2. 单图标准化结果增加器官字段组

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

### 说明
这组字段用于明确回答：

- 这一张图当前主要按哪个器官解释
- 这个器官判断来自哪里
- 是否存在器官冲突

---

## C-3. 增加异常区域可升级接口

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

### 说明
当前阶段即使只做“轻区域化”，也应给未来检测 / 分割能力留接口。  
否则后面升级时，数据结构会被迫大改。

---

## C-4. topK symptom item 增加器官绑定字段

在 `topk_symptoms_json` 的每个 symptom item 中，建议新增 / 强化以下字段：

- `organ_type`
- `organ_binding_confidence`
- `organ_binding_source`
  - ui_hint
  - model_detected
  - merged
- `requires_organ_confirmation`

### 说明
某些 symptom 的语义高度依赖器官。  
因此后续 canonical symptom 映射不得忽略器官绑定。

---

# 附录 D：接纳门槛矩阵增补（本次新增，不替换原文）

## D-1. 症状接纳必须纳入器官约束

此前 v1 已写明 topK symptom 的最小接纳门槛。  
现在进一步补充：

### topK symptom 若要进入 `formally_admitted` 或高质量 `candidate_retained`
除原有条件外，建议再满足至少其一：

1. `primary_organ_type` 已可靠确定
2. `organ_binding_confidence` 达标
3. 该 symptom 本身对器官不敏感
4. 该 symptom 被标记为允许弱器官条件准入

也就是说：

# **对器官敏感型 symptom，器官未明时应更保守。**

---

## D-2. 高歧义症状类型默认更偏向 follow-up

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

# **不是所有 symptom 都应使用同样的准入策略。**

---

## D-3. 器官槽位提示可降低 follow-up 成本，但不能取消 follow-up

若用户已通过产品槽位提供明确器官提示，则系统可以：

- 降低器官确认型 follow-up 的优先级
- 提高与该器官高度匹配 symptom 的映射稳定性

但不能因此：

- 跳过高歧义 symptom 的 follow-up
- 直接锁定 final outcome
- 忽略图像质量与冲突检查

---

# 附录 E：prompt 约束增补（本次新增，不替换原文）

## E-1. prompt 应显式利用产品槽位语义

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

## E-2. prompt 约束不等于结果越权

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

# 附录 F：对后续文档的启发性影响（本次新增，不替换原文）

本轮增补后，后续若继续推进文档链，应吸收以下变化：

## F-1. 《AI视觉诊断入口层》主文档
后续版本应更明确写入：
- 症状链内部分层
- 产品侧器官提示是正式辅助机制

## F-2. 《诊断结论层》
后续联动增补时，应明确：
- 器官槽位提示不是 outcome
- 器官识别结果不是 outcome
- route hint 与器官提示都属于入口层 / 流程层条件

## F-3. 《诊断目标分层》
后续联动增补时，应明确：
- 器官提示与 identity entity 都不属于 problem taxonomy
- AI symptom 候选仍低于 canonical symptom 与 problem 层

---

# 本版状态说明

- 本版保留 v1 正文主体
- 仅通过附录 A～F 做只增不减增补
- 未对原有适用条款做删减




# ================================
# v1.4 新增附录开始（基于 v1.1 只增不减）
# ================================

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

# 附录 G：中文一等公民规则增补（本次新增，不替换上文）

## G-1. 中文是一等公民

从本附录开始，本文件线及其后续增补统一执行：

# **中文是一等公民**
# **中文主名优先**
# **英文仅作辅助标记**
# **字段名不等于概念主名**

---

## G-2. 中文主名优先解释规则

上文 v1.1 原文与附录中若存在以下情况：

- 英文概念在语义上占主导
- 章节标题偏英文思维
- 字段名被误读为正式概念名

则从本附录开始，一律按：

# **中文主名优先解释**
# **英文只用于辅助映射、实现标识、字段名说明**

---

## G-3. 核心概念中文主名对照

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

## G-4. 章节与表述的阅读规则

阅读上文 v1.1 原文时，应统一采用以下理解方式：

### 规则 1
先读中文含义，再看英文标记。

### 规则 2
若中文与英文在直觉上产生主从冲突，以中文主名为准。

### 规则 3
英文字段名仅服务于：
- SQL 制表
- 程序实现
- JSON 结构
- API / 模型输出映射

不得把英文字段名反向提升为业务概念主名。

---

## G-5. 后续版本写作规则

从本附录开始，本文件线后续所有版本必须遵守：

### 必须
- 章节标题中文优先
- 概念定义中文优先
- 结论表达中文优先

### 允许
- 括号中保留英文辅助名
- 保留英文字段名
- 保留英文枚举值

### 不允许
- 再出现英文概念压过中文主表达
- 再出现用英文术语代替正式业务概念主名
- 再出现“文档叙述语言像字段名说明书”这种写法

---

# 附录 H：视觉调用批次定义增补（本次新增，不替换上文）

## H-1. 必须新增正式对象：视觉调用批次

### 中文主名
视觉调用批次

### 英文辅助名
visual call batch

### 定义
同一轮次内、由一次用户提交或一次系统触发所形成的、用于生成一组视觉入口结果的统一处理单元。

---

## H-2. 视觉调用批次的最小规则

### 规则 1
一次用户提交多张图，默认产生一个新的视觉调用批次。

### 规则 2
一个视觉调用批次下可以包含：
- 多条单图原始记录
- 多条单图标准化结果
- 一个调用聚合结果
- 一组接纳判定记录

### 规则 3
身份链与症状链可以共享同一个视觉调用批次 ID，  
但必须保留各自独立的子结果对象。

### 规则 4
用户补图后，必须产生新的视觉调用批次。  
不得把补图结果回写为旧批次结果。

### 规则 5
同一轮次内允许存在多个视觉调用批次。

---

## H-3. 推荐新增字段

建议在相关对象中统一增加：

- `visual_call_batch_id`

### 适用对象
- 植物身份解析记录
- 单图视觉原始记录
- 单图视觉标准化结果
- 视觉调用聚合结果
- 视觉接纳判定记录
- 视觉监督记录

---

# 附录 I：当前会话主身份结果裁定规则增补（本次新增，不替换上文）

## I-1. 必须新增正式裁定规则：当前会话主身份结果状态机

上文 v1.1 已有：
- `taxonomy_match_status`
- `identity_resolution_status`
- `is_current_primary_identity`

但此前仍缺正式状态机。  
本附录新增：

# **当前会话主身份结果裁定规则**

---

## I-2. 裁定优先级

多条身份解析记录并存时，优先级必须按以下顺序裁定：

# `matched` > `weak_matched` > `unresolved`

### 含义
- `matched` 可以覆盖 `weak_matched` 与 `unresolved`
- `weak_matched` 可以覆盖 `unresolved`
- `unresolved` 不得覆盖 `matched` 或 `weak_matched`

---

## I-3. 同等级覆盖规则

当两条身份解析记录等级相同，是否覆盖应按以下顺序判断：

### 第一判断
图像质量 / 主体完整性 / 全株可见性更高者优先

### 第二判断
更晚的视觉调用批次可覆盖更早批次，但必须记录覆盖原因

### 第三判断
若两者质量相近且无显著优势，则保持旧主身份结果，避免频繁抖动

---

## I-4. 人工修正优先级

# **人工确认后的主身份结果优先级最高。**

一旦某条身份解析记录被人工确认，则：

- 其优先级高于自动 `matched`
- 后续自动 `weak_matched` / `unresolved` 不得覆盖
- 后续自动 `matched` 若想覆盖，也必须进入人工复核或特殊治理路径

---

## I-5. 被覆盖记录的留痕规则

旧主身份结果被覆盖后：

- 必须保留历史记录
- `is_current_primary_identity` 改为 false
- 必须记录：
  - 覆盖批次
  - 覆盖原因
  - 覆盖时间

### 建议新增字段
- `superseded_by_resolution_id`
- `superseded_reason`
- `superseded_at`

---

## I-6. 弱身份主结果的用途边界

# **弱身份主结果默认不参与 diagnosis baseline 的精细宿主挂接。**

### 允许
- explanation
- question 辅助
- 弱宿主背景提示
- 宿主先验轻微偏置（仅在风险可控时）

### 不允许
- 直接精确挂接 `plant_problem_profiles`
- 直接强推问题先验
- 直接锁定 diagnosis baseline 中的细粒度宿主对象

---

# 附录 J：问题回流纠正作用域增补（本次新增，不替换上文）

## J-1. 问题回流纠正不能再只写成一个笼统字段

上文 v1.1 仅有：
- `was_question_corrected`

这还不够。  
本附录新增：

# **问题回流纠正作用域**

---

## J-2. 建议新增字段：`question_correction_scope`

### 中文主名
问题回流纠正作用域

### 推荐字段名
`question_correction_scope`

### 推荐枚举值
- `organ`
- `symptom`
- `pattern`
- `route`
- `admission`
- `identity_hint_only`
- `multiple`
- `none`

---

## J-3. 建议增加更细粒度的监督字段

在 `visual_supervision_records` 中，建议新增：

- `question_corrected_organ`
- `question_corrected_symptom_key`
- `question_corrected_pattern_candidate`
- `question_corrected_route_hint`
- `question_corrected_admission_result`
- `question_corrected_identity_hint_only`

---

## J-4. 问题回流纠正的边界

### 问题回流可以纠正
- 器官绑定解释
- 规范症状映射
- 模式候选合法性
- 路由建议合理性
- 接纳结果是否过宽 / 过窄
- 身份链的弱提示解释

### 问题回流不能直接做
- 伪造新的 Taxonomy 主对象
- 直接越层写 final outcome
- 直接把 AI症状候选 改写成 problem taxonomy 对象

---

# 附录 K：路由建议主动作字段增补（本次新增，不替换上文）

## K-1. 路由建议不能只是一组并列布尔值

上文 v1.1 已有：

- `prefer_retake_path`
- `prefer_uncertain_path`
- `prefer_question_stability`
- `prefer_question_progression`
- `prefer_question_host_confirmation`

这些都保留。  
但为了实现不散，本附录新增一个总字段：

# **路由建议主动作**

---

## K-2. 推荐新增字段：`route_primary_action`

### 中文主名
路由建议主动作

### 推荐字段名
`route_primary_action`

### 推荐枚举值
- `retake_first`：优先补图
- `ask_first`：优先提问
- `uncertain_prepare`：优先进入不确定预备
- `standard_flow`：进入标准流程
- `hold_for_review`：暂缓并等待审查（可选）

---

## K-3. 主动作字段的意义

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

# 附录 L：TopK 稳定性与模式派生状态增补（本次新增，不替换上文）

## L-1. TopK 稳定性应正式进入结构层

TopK 不只是模型输出，还应成为治理对象。  
建议在单图标准化结果或聚合结果中新增：

- `top1_stability_score`
- `top3_stability_score`
- `long_tail_noise_flag`

### 含义
- `top1_stability_score`：Top1 稳定性分数
- `top3_stability_score`：Top3 覆盖稳定性分数
- `long_tail_noise_flag`：长尾候选噪声标记

---

## L-2. 模式候选与正式模式派生链的接口进一步显式化

建议增加字段：

- `pattern_derivation_status`

### 推荐枚举值
- `not_eligible`
- `eligible`
- `derived`
- `rejected_after_check`

---

# 附录 M：全株图职责与 SQL 映射责任增补（本次新增，不替换上文）

## M-1. 全株图职责进一步写死

# **全株图默认更适合承担“整体状态、分布、扩展性、身份链增稳”职责，而不是承担精细局部症状主判。**

### 全株图优先支持
- 身份链稳定命中
- 病变分布判断
- 新旧叶覆盖范围判断
- 是否多器官受影响判断
- 是否需要补局部图判断

### 全株图默认不优先承担
- 微小局部病斑的精细主判
- 细粒度局部 symptom key 锁定

---

## M-2. 最终 SQL 制表素材必须经过映射、归一、审查

上文 v1.1 已写死：

# **`plant_catalog.csv` + `plants_v13_user_friendly_full_v7.xlsx` 是最终 SQL 制表的素材来源**

本附录进一步补充：

# **这两份素材不是直接入库真值，而是必须经过映射、归一、审查后进入最终 SQL 制表。**

---

# 附录 N：核心字段中文对照增补（本次新增，不替换上文）

## N-1. 建议后续补一份字段中文对照表

为继续强化“中文是一等公民”，建议后续在本规范或附录中补充一张正式对照表：

| 字段名 | 中文主名 | 说明 |
|---|---|---|
| visual_call_batch_id | 视觉调用批次 ID | 统一一批视觉处理结果 |
| route_primary_action | 路由建议主动作 | 流程层主动作 |
| question_correction_scope | 问题回流纠正作用域 | 问题回流影响哪一层 |
| identity_resolution_status | 身份解析状态 | 身份链状态，不是 outcome |
| pattern_derivation_status | 模式派生状态 | 候选进入正式模式链的状态 |

---

# 本文件版本状态说明

- 上文全部内容 = 你上传并指定为基准的 v1.1 原文，原样保留 fileciteturn3file0
- 本文件新增内容 = 附录 G～N
- 二者合并后，共同构成：

# **《AI视觉诊断入口层数据结构与留存规范 v1.4（最终完整增补版，基于 v1.1 只增不减）》**
