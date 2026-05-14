# Taxonomy 与 Diagnosis 挂接规则 v1（完整最终版）

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

# 1. 文档目标

本文件要回答 4 个问题：

1. Taxonomy 主对象如何进入 diagnosis 侧
2. 何时按 `plant_identity_id` 精确挂接
3. 何时降级到 genus / family
4. unresolved / weak_matched 的边界是什么

---

# 2. 挂接总原则

## 2.1 Taxonomy 不直接等于 Diagnosis

新增正式规则：

# **Taxonomy 主数据层不等于 Diagnosis 业务层。**

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

## 2.2 挂接是“受限连接”，不是“无限透传”

Taxonomy 的身份信息可以影响 diagnosis，  
但不得直接变成：

- problem
- outcome
- final diagnosis

---

# 3. 挂接优先级写死

## 3.1 第一优先级：identity 精确挂接

当同时满足：

- 当前会话主身份结果为稳定 `matched`
- 存在明确 `plant_identity_id`
- 存在已审查的 diagnosis 挂接关系

则优先采用：

# **`plant_identity_id` 精确挂接**

### 适用
- 精确宿主画像
- `plant_problem_profiles`
- 更细 problem prior

---

## 3.2 第二优先级：genus 降级挂接

当 identity 级精确挂接条件不满足，但同时满足：

- genus 稳定
- genus 级挂接规则存在
- 当前风险可控

则允许：

# **genus 级降级挂接**

### 适用
- genus 级常见问题背景
- genus 级宿主先验
- genus 级 explanation 辅助

---

## 3.3 第三优先级：family 弱背景挂接

当 genus 也不稳定，但 family 可用时：

- 只允许进入 family 级弱背景
- 不得进入精细问题先验

### 适用
- 很弱的 explanation 背景
- 很弱的宿主提示

### 不适用
- 精细 `plant_problem_profiles`
- 问题 top1 强推
- outcome 锁定

---

## 3.4 第四优先级：unresolved 不挂接

当主身份结果为 `unresolved`：

# **不得进入 diagnosis baseline 的精细挂接**

### 允许
- explanation 中提示身份未稳定
- question 中优先补宿主确认
- route hint 中提高全株图 / 补图优先级

### 不允许
- 精细宿主画像挂接
- 精细问题先验挂接
- 假装已有 identity 主结果

---

# 4. weak_matched 的边界

## 4.1 weak_matched 默认不做精细挂接

新增正式规则：

# **weak_matched 默认不进入 diagnosis baseline 的精细挂接。**

### 允许
- explanation
- question 辅助
- 弱宿主背景提示
- 轻微宿主先验偏置

### 不允许
- 直接挂 `plant_problem_profiles`
- 直接推高精细问题先验
- 直接锁定 diagnosis 侧细粒度宿主对象

---

## 4.2 weak_matched 升级条件

若后续补图或人工确认使其升级为 `matched`，  
才允许进入 identity 级精确挂接。

---

# 5. 挂接对象形式

## 5.1 正式挂接表建议

建议至少显式存在：

- `plant_identity_diagnosis_links`

---

## 5.2 link_level 当前建议值

- `identity`
- `genus`
- `family`

---

## 5.3 link_strength 当前建议值

- `exact`
- `downgraded`
- `weak_background`

---

# 6. 挂接时不得做的事

以下做法明确禁止：

- 用 weak_matched 直接精细挂接
- 用 unresolved 硬挂 diagnosis baseline
- 用 family 弱背景强推问题 top1
- 把 Taxonomy 分类字段直接当 problem taxonomy
- 把 identity 结果直接当 outcome object

---

# 7. 与运行时的关系

## 7.1 Taxonomy 挂接只提供“宿主侧结构”

挂接后进入 runtime 的主要是：

- 宿主背景
- 宿主先验挂点
- explanation 支持信息

而不是：
- 直接产出结论对象

---

## 7.2 仍需服从既有硬约束

挂接结果仍必须服从：

- 宿主先验不得推翻高置信症状
- route hint 不能反写事实层
- identity 结果不是 outcome
- Taxonomy 不属于 problem taxonomy

---

# 8. 本文件总裁决

本文件最终钉死：

# **稳定 matched → identity 精确挂接**
# **identity 不稳但 genus 稳 → genus 降级挂接**
# **genus 不稳但 family 可用 → family 弱背景挂接**
# **unresolved / weak_matched → 不得进入精细 diagnosis 挂接**

这条规则一旦写死，后续 SQL 与运行时实现就不会再摇摆。
