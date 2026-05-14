# AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1（分支场景增补版，完整最终版）

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

# 一、示例前提

## 1.1 用户提交内容

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

## 1.2 当前目标

目标不是直接让 AI 给出最终诊断，  
而是演示：

# **AI视觉入口层如何把上游观察转成系统可消费对象**
# **再由 Diagnosis 运行时完成问题竞争与结论收敛**

---

# 二、第一段：植物身份主链路

## 2.1 百度植物识别

系统先走植物身份主链路：

# **百度植物识别 → Taxonomy 匹配 → 命中直取**

假设百度返回：

- 原始返回名：龟背竹

---

## 2.2 Taxonomy 匹配

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

## 2.3 当前会话身份主结果

运行时此时获得：

- 当前会话植物身份主结果 = 龟背竹
- 当前宿主先验挂点 = Monstera / 天南星科背景
- 允许后续按 identity 精确挂 diagnosis baseline

注意：

# **这还不是 diagnosis**
# **只是宿主侧正式结构进入了运行时**

---

# 三、第二段：症状识别主链路

## 3.1 视觉调用批次

用户本轮 4 张图形成一个：

- `visual_call_batch_id = VCB_001`

---

## 3.2 单图视觉原始记录

每张图都会生成一条：

- `visual_raw_image_record`

例如：

### 图1（叶片图）
- `input_slot_type = leaf`
- 模型：混元
- prompt 版本：当前版本
- 原始输出包含：
  - 图像质量结果
  - TopK 症状候选
  - pattern candidate
  - route hint

---

## 3.3 单图视觉标准化结果

系统把图1标准化为：

### 图像质量
- 可分析等级：可分析
- 清晰度：正常
- 主体完整性：局部但足够
- 关键区域可见

### 主器官类型
- `primary_organ_type = leaf`
- `organ_source = ui_hint`

### TopK 症状（示例）
1. 叶片局部发黄
2. 叶缘焦枯
3. 斑点周围轻微黄晕

### 模式候选
- 黄叶 + 叶缘干焦模式候选

### 路由建议
- 可进入标准流程
- 建议优先问：
  - 最近是否暴晒
  - 浇水是否异常
  - 是否只影响老叶

---

## 3.4 多图聚合

4 张图聚合后，系统形成：

- `visual_call_aggregate_result`

聚合结果示例：

### 聚合质量
- 整体可分析
- 全株图可见性良好

### 聚合症状
- 高重复观察到：
  - 叶片局部发黄
  - 叶缘焦枯
- 斑点黄晕仅在一张局部图弱出现

### 聚合路由建议
- 进入标准流程
- 优先问环境与分布问题
- 不优先走不确定预备
- 不优先补图

---

# 四、第三段：视觉接纳判定

## 4.1 图像质量结果

图像质量解析成功：

- 正式接纳

因为它是限权条件，不是竞争对象。

---

## 4.2 症状候选接纳

### 症状 1：叶片局部发黄
满足：
- 图像可分析
- 主器官已确定为 leaf
- 症状键归一成功
- 多图重复出现

→ 判定：
- `formally_admitted`

### 症状 2：叶缘焦枯
满足：
- 器官明确
- 图像可分析
- 多图支持

→ 判定：
- `formally_admitted`

### 症状 3：斑点周围轻微黄晕
问题：
- 仅单图弱出现
- 稳定性不足
- 存在长尾噪声风险

→ 判定：
- `candidate_retained`

---

## 4.3 route hint 接纳

route hint 解析成功且不越权：

→ 正式进入流程层  
但：

# **只影响 question_queue**
# **不反写事实层**

---

# 五、第四段：进入 Diagnosis 运行时

## 5.1 evidence 层

正式进入 evidence 的对象：

- 叶片局部发黄
- 叶缘焦枯

候选保留对象：

- 斑点周围轻微黄晕

---

## 5.2 Taxonomy → Diagnosis 挂接

因为当前主身份结果为：

- `matched`
- `plant_identity_id` 明确

所以按挂接优先级走：

# **identity 精确挂接**

进入 diagnosis baseline 时，可稳定挂到：

- `plant_problem_profiles`
- 龟背竹对应宿主问题画像

---

## 5.3 宿主先验作用

运行时此时可使用：

- 龟背竹宿主背景
- Monstera 常见问题背景
- explanation 用植物名与属科背景

但必须继续遵守：

# **宿主先验不得推翻高置信症状**
# **identity 结果不是 outcome**

---

# 六、第五段：problem 竞争

## 6.1 形成问题候选池

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

## 6.2 question_queue 生成

由于 route hint 建议优先问环境和分布问题，  
question_queue 可优先生成：

1. 最近是否暴晒过？
2. 主要影响老叶，还是新叶也有？
3. 最近浇水是否明显偏多或偏少？
4. 是一两片叶，还是很多叶都有？

---

# 七、第六段：问题回流与纠正

## 7.1 用户回答示例

用户回答：

- 最近搬到阳台，太阳直晒明显变强
- 主要是朝外侧叶片受影响
- 新叶基本正常
- 浇水没有明显变化

---

## 7.2 运行时纠正

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

# 八、第七段：outcome 收敛

## 8.1 最终结论方向

此时更可能收敛到：

- 问题性结论对象：光照灼伤 / 暴晒应激

而不是：
- identity 结果本身
- route hint
- 图像质量
- 器官结果

---

## 8.2 最终输出

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

# 九、这个示例真正证明了什么

本示例证明：

# **AI视觉入口层不是在做最终诊断**
# **它是在做上游受控观察、接纳与流程引导**

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

# 十、最终总裁决

这个链路应统一理解为：

# **图片输入**
# **→ 植物身份主链路**
# **→ 症状识别主链路**
# **→ 接纳判定**
# **→ Taxonomy → Diagnosis 挂接**
# **→ problem 竞争**
# **→ question 回流**
# **→ outcome 收敛**

这条链路一旦打通，后续正式落代码就不再是“概念实现”，而是：

# **把已经定义清楚的对象与规则真实落成系统**




# ================================
# v1.1 新增附录开始（基于 v1 只增不减）
# ================================

> 说明：
>
> - 以下内容为《AI视觉入口层到 Diagnosis 运行时挂接示例 v1》在**完整保留 v1 原文**的前提下，继续新增的 review 收口附录。
> - 上文全部内容 = v1 原文，原样保留。
> - 下文附录 A～B = 基于最高规格审查结果新增的分支场景示例。
> - 本次新增只做补充，不删改上文，不重排上文，不替换上文。

---

# 附录 A：异常分支示例——身份未命中（unresolved）路径（本次新增，不替换上文）

## A-1. 场景前提

用户提交 3 张图：

- 图1：叶片图
- 图2：局部叶片特写图
- 图3：全株图（但较远、主体不够清晰）

产品仍提供槽位语义，但本轮图片对植物整体特征支撑不足。

---

## A-2. 身份主链路

百度植物识别返回一个名称，但在当前 Taxonomy 中：

- 无稳定命中对象
- alias 规则也无法稳定归并
- 学名命中失败
- 人工映射规则当前不存在

因此生成：

- `taxonomy_match_status = unresolved`
- `identity_resolution_status = unresolved`
- `is_current_primary_identity = false`

### 结果
运行时当前只能得到：

- 身份未命中状态
- explanation 中的保守表述
- “需补宿主确认 / 更清晰全株图”的流程倾向

### 不允许发生的事
- 不得伪造 `plant_identity_id`
- 不得假装已有主身份对象
- 不得进入 diagnosis baseline 的精细挂接

---

## A-3. 症状主链路

混元仍可完成症状观察，例如：

- 图1：叶片局部发黄
- 图2：轻微焦边
- 图3：全株图质量一般，仅能支持“可能存在多片叶受影响”

这些结果可正常进入：

- 原始层
- 标准化层
- 接纳判定层

---

## A-4. 接纳判定

### 正式接纳
- 叶片局部发黄
- 轻微焦边（若质量与器官条件满足）

### 候选保留
- 多片叶受影响（若全株图质量不够高）
- 其他弱模式候选

### route hint
当前更可能产生：

- `route_primary_action = ask_first`
或
- `route_primary_action = retake_first`

取决于：
- 当前图像质量
- 身份未命中的严重程度
- 是否还能从 question 中先获得高收益信息

---

## A-5. Taxonomy → Diagnosis 挂接

由于当前主身份结果为：

- `unresolved`

因此必须执行：

# **不得进入 diagnosis baseline 的精细挂接**

### 允许
- explanation 提示身份未稳定
- question 优先生成：
  - 这是什么植物？
  - 是否可补一张更清晰全株图？
  - 是否有叶片正反面 / 茎部图？

### 不允许
- 直接挂 `plant_problem_profiles`
- 直接使用 species / genus 宿主先验强推问题排序

---

## A-6. problem 竞争与 outcome 倾向

这时系统更可能处于：

- 症状已部分可用
- 宿主信息不足
- diagnosis 可继续，但可信度有限

因此 outcome 方向更可能走向：

- 输入不足型不确定路径
或
- 继续提问收益较高，暂不停止

---

## A-7. 这个分支证明了什么

这个分支证明：

# **身份主链路失败，不等于整个诊断流失败**
# **但它会限制 diagnosis baseline 的精细挂接能力**
# **并抬高补图 / 宿主确认 / 保守 explanation 的优先级**

---

# 附录 B：异常分支示例——图像质量不足路径（本次新增，不替换上文）

## B-1. 场景前提

用户提交 2 张图：

- 图1：叶片图，但明显模糊
- 图2：全株图，但距离远、主体过小

虽然槽位语义存在，但图片质量不足。

---

## B-2. 图像质量标准化结果

系统生成：

### 图1
- 可分析等级：`marginal`
- 清晰度：`blurry`
- 主体完整性：局部可见
- 关键区域可见性：部分可见

### 图2
- 可分析等级：`insufficient`
- 清晰度：一般
- 主体完整性：主体过小
- 关键区域可见性：不足

聚合后得出：

- `aggregate_analyzability_level = marginal`
- 关键图对精细症状支持不足

---

## B-3. 症状候选与接纳

混元可能仍给出若干症状候选，例如：

- 叶片局部发黄
- 疑似边缘干枯
- 疑似斑点

但由于图像质量限制：

### 更合理的接纳结果
- `candidate_retained`
- `explanation_retained`

而不是大面积：
- `formally_admitted`

因为当前缺少足够稳定的视觉支撑。

---

## B-4. route hint 主动作

此时应更倾向：

- `route_primary_action = retake_first`

### 对应策略
- 先补拍更清晰叶片图
- 先补拍更近的全株图
- 必要时补茎图 / 根颈图

### 不应发生的事
- 直接依据低质量图锁定高置信 outcome
- 把弱视觉候选大面积写入正式 evidence
- 用低质量全株图强推 identity 结果

---

## B-5. 后续 question_queue

question_queue 此时应优先生成补图问题，而不是过早进入细分 diagnosis 问题。

例如：

1. 请补一张更清晰的叶片近照
2. 请补一张主体更大的全株图
3. 如可行，请补一张茎部图

---

## B-6. 这个分支证明了什么

这个分支证明：

# **图像质量不足时，系统的正确动作不是“硬判”，而是“降级、保留、补图优先”**

也就是说：

- 图像质量是限权条件
- route hint 只影响流程
- candidate_retained 不等于正式 evidence
- retake_first 是合法且必要的主动作

---

# 本文件版本状态说明

- 上文全部内容 = 《AI视觉入口层到 Diagnosis 运行时挂接示例 v1》原文，原样保留
- 下文附录 A～B = 本次最高规格 review 后新增的异常 / 降级分支示例
- 二者合并后，共同构成：

# **《AI视觉入口层到 Diagnosis 运行时挂接示例 v1.1（分支场景增补版，完整最终版）》**
