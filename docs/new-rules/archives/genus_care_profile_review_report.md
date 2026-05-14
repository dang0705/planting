# 《genus_care_profile.csv》最高规格审查报告（属级养护策略数据）

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

# 一、为什么这份数据必须纳入正式落表

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

# **它不是参考表，而是主数据候选表。**

---

# 二、我看到的当前数据结构

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

# 三、我对它的正式定位判断

## 3.1 它不应放到 Diagnosis 主表层

它不是：

- problem 表
- symptom 表
- question 表
- explanation 表

因为它表达的不是“问题对象”，而是：

# **属级养护基线**

所以它不应归到 Diagnosis 静态业务层。

---

## 3.2 它更适合放到 Taxonomy 主数据侧

这份数据最合理的正式定位是：

# **Taxonomy 侧的属级养护基线主表**

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

## 3.3 它不应直接绑在单个 species 上

因为它现在的组织粒度很明显是：

# **属级（genus level）**

不是：
- species level
- cultivar level

所以它不应被误落成：
- species 养护表
- 单植物专属表

它应该先作为：

# **genus care baseline**

然后未来再允许：

- species care overrides
- identity-level care overrides

在它上面做覆盖。

---

# 四、当前数据的优点

## 4.1 粒度是对的
你现在这个表按属级组织，非常适合当前阶段。  
因为你前面整套 Taxonomy 体系已经确认：

- species 不一定总是稳定
- genus 级对象很重要
- genus 可以作为稳定降级承接层

那养护策略也按 genus 先落，这个方向是对的。

---

## 4.2 结构已经有“可程序消费”的雏形
尤其是这些 JSON 字段：

- `watering_json`
- `fertilizing_json`
- `light_json`
- `airflow_json`

这说明它不是纯文本建议表，而是在往：

# **可程序消费**
# **可结构化动作建议**
# **可未来前端直出**

这个方向走。

这是很重要的优点。

---

## 4.3 证据意识是对的
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

# 五、当前不能原样直接入库的几个问题

## 5.1 最大问题：它没有正式表头

这是当前最明确的问题。

文件本身第一行就是数据，不是表头。  
这意味着它当前还是：

# **半成品 CSV**
而不是：
# **正式可直接导入的 schema 化 CSV**

这件事必须修。

### 为什么严重
因为一旦进入：
- SQL 映射脚本
- 导入脚本
- 校验脚本

没有正式表头就会导致：
- 字段位置依赖
- 维护脆弱
- 后续一旦增列就容易错位

### 结论
这不是小问题，必须先补正式表头。

---

## 5.2 JSON 字段还缺正式 schema 约束

虽然这几个 JSON 当前都能正常解析：

- 浇水
- 施肥
- 光照
- 通风

但它们还停留在“可解析”，还没到“正式 schema 冻结”的程度。

例如当前已经能看出：

### 浇水
大致结构是：
- `way`
- `freq`
- `unit`
- `verb`

### 施肥
大致结构是：
- `freq`
- `type`
- `unit`
- `other`

### 光照
大致结构是：
- `way`
- `freq`
- `unit`
- `other`

### 通风
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

## 5.3 它与 Taxonomy 主表的挂接关系还没正式写死

它现在逻辑上显然应该挂：

- genus_name
- 或 genus 维度对象

但当前还没正式定义：

# **它到底通过什么主键 / 外键去挂 Taxonomy**

现在至少有 3 种可能：

1. 直接用 `genus_name`
2. 用未来的 `taxonomy_genera.genus_id`
3. 用 `plant_identity_entities` 中 genus 级 identity 的 `plant_identity_id`

这三种不是一回事。

我的判断是：

### 当前阶段最稳的做法
先把它落成：

# **`genus_care_profiles`**
并以：
- `genus_name`
- `family_name`
作为第一阶段业务唯一性键

### 后续更稳的做法
再在 Taxonomy 维表或 genus 级 identity 稳定后，补：
- `genus_id`
或
- `genus_identity_id`

但这条必须先在方案中说清楚。

---

## 5.4 它和后续 species / care_overrides 的边界必须提前写死

你自己已经点到重点了：

这张表关系到后期植物养护数据、行动建议。

那就意味着它不能一个人把所有养护语义全吞掉。  
必须先写死：

# **它是 genus baseline**
不是：
# **最终所有植物的唯一养护真值表**

后面应允许：

- species care overrides
- plant identity care overrides
- 特殊品种 / 园艺变体 overrides

否则未来你一旦引入更细粒度养护数据，这张表会被迫重构。

---

# 六、正式落表建议

## 6.1 正式表名建议
我建议把它正式落为：

# **`genus_care_profiles`**

中文主名：

# **属级养护基线表**

---

## 6.2 字段建议
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

### 补充建议
当前还建议新增：
- `data_source`
- `version`
- `replacement_profile_id`（按需）
- `retired_at`（按需）

---

## 6.3 唯一性建议

当前建议唯一性至少先按：

- `genus_name`
- `family_name`

控制

而不是只按 genus_name。  
因为后面如果出现极少数命名歧义或历史名问题，family 会更稳。

---

# 七、我对它是否应纳入本次正式落表的结论

结论很明确：

# **应该纳入**
而且不是“以后再说”，而是：

# **现在就应纳入本次正式落表范围**

但它应纳入的是：

# **Taxonomy 侧属级养护基线主表**
而不是：
- Diagnosis 问题表
- 运行时表
- 临时建议表

---

# 八、当前最合理的下一步

基于这次审核，我建议下一步直接建立一份正式文档：

# **《属级养护基线表设计 v1》**

它要专门回答：

1. `genus_care_profile.csv` 的正式表名与定位
2. 正式字段表头
3. JSON schema 冻结
4. 与 Taxonomy 的挂接关系
5. 与 future species / care_overrides 的边界
6. 与行动建议系统的关系

这样后续这张表才能稳定进入最终 SQL 制表方案，而不是继续作为“审核过但未正式定义”的游离数据。

---

# 九、一句话结论

**这份 genus_care_profile.csv 应该正式纳入本次落表，而且应作为 Taxonomy 侧的“属级养护基线主表”；但它当前还不能原样入库，必须先补正式表头、JSON schema、挂接关系与 overrides 边界。**
