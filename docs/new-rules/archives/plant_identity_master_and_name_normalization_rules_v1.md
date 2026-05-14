# 植物身份主表与命名归一规则 v1（完整最终版）

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

# 1. 文档目标

本文件要解决 6 个问题：

1. 植物身份主表到底承载什么
2. canonical identity 怎么定义
3. alias 怎么分型
4. 什么情况下能新建 identity
5. 什么情况下必须归 alias
6. merge / retire 如何治理

---

# 2. 正式主表定义

## 2.1 正式主表：`plant_identity_entities`

### 中文主名
植物身份主表

### 作用
系统内部唯一承载“植物身份对象”的正式主表。

### 它承载的是
- 主身份主名
- 身份层级
- family / genus / species
- 学名
- 主展示名
- 归一后的正式主对象语义

### 它不承载的是
- 一坨别名
- 一堆外部平台命中名
- 临时用户输入名
- diagnosis 业务表字段
- 视觉运行时状态

---

# 3. canonical identity 规则

## 3.1 定义

### 中文主名
主身份主名

### 英文辅助名
canonical identity

### 规则
一个植物身份对象，必须且只能有一个 canonical identity。

---

## 3.2 作用

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

## 3.3 与主展示名的边界

### `canonical_identity_name`
内部主身份主名

### `primary_display_name`
产品对外主展示名

### 规则
- 二者可以相同
- 但不强制相同
- 不得把展示名反向当作 identity 主键语义

---

# 4. identity_level 规则

## 4.1 正式允许值

当前冻结为：

- `genus`
- `species`
- `horticultural_variant`
- `unknown`

---

## 4.2 使用边界

### genus
用于：
- 属级稳定承接
- species 不稳时的正式对象

### species
用于：
- 已稳定到种级的正式对象

### horticultural_variant
用于：
- 经确认确有独立 identity 价值的园艺变体
- 当前阶段慎用

### unknown
用于：
- 暂未稳定层级
- 不得长期泛滥为正式对象

---

# 5. 新建 identity 规则

## 5.1 允许新建的前提

同时满足以下方向时，才允许评估新建：

1. 具有独立稳定身份意义
2. 不是旧对象的别名变体
3. 在分类、宿主背景、展示或业务上有独立价值
4. 与既有对象不会形成高重叠污染
5. 不会明显破坏命名归一稳定性

---

## 5.2 默认禁止新建的情况

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

## 5.3 新建审查记录

任何新建 identity，至少应记录：

- 新建原因
- 排重结果
- 分类路径依据
- 是否存在旧对象候选
- 审查状态
- 审查时间

---

# 6. alias 体系规则

## 6.1 alias 不是字符串垃圾桶

新增正式规则：

# **alias 不是一坨混乱名称集合，必须分型。**

---

## 6.2 alias_type 当前建议值

- `standard_alias`：标准别名
- `common_name`：常见俗名
- `commercial_name`：商业名 / 园艺名
- `legacy_name`：历史旧名
- `baidu_match_name`：百度命中映射名
- `search_compatible_name`：搜索兼容名

---

## 6.3 alias 的作用

alias 至少服务于：

- 识别命中
- 搜索兼容
- 去重审查
- 产品展示控制
- 数据清洗

---

## 6.4 alias 与主表边界

### alias 可以做
- 承接平台返回名
- 承接用户常见叫法
- 承接商业名
- 承接旧名

### alias 不能做
- 替代 canonical identity
- 替代主对象唯一性
- 绕过 identity 新建规则

---

# 7. genus / species 共存规则

## 7.1 可以共存，但职责不同

### genus 级对象
更适合承担：
- 稳定宿主背景
- species 不稳时的降级承接
- genus 级 diagnosis 挂接

### species 级对象
更适合承担：
- 精确主身份结果
- 更细身份展示与挂接

---

## 7.2 species 已稳时的主结果规则

当 species 已稳定 matched：

- 当前会话主身份结果优先落到 species 级对象
- genus 级对象保留为上位背景
- 不再与 species 争夺主身份结果

---

# 8. merge / retire 规则

## 8.1 merge 触发条件

若两个 identity 满足以下条件，应评估合并：

- 实际指向同一植物身份
- 分类路径可归一
- 宿主先验价值无独立差异
- 主要差异只是名字体系不同

---

## 8.2 merge 后必须保留

- `replacement_identity_id`
- 历史 alias 映射
- 合并原因
- 合并时间
- 审查记录

---

## 8.3 retire 触发条件

若某 identity：

- 长期无命中价值
- 被确认只是重复对象
- 命名高度误导
- 已被更稳定对象替代

则可评估停用 / 退役。

---

# 9. 身份命中规则

## 9.1 正式概念

### 中文主名
身份命中规则

### 作用
定义外部识别名 / 输入名如何命中主表对象。

---

## 9.2 当前建议命中类型

- 完全主名命中
- alias 命中
- 学名命中
- 清洗后命中
- 人工映射命中
- 模糊弱命中

---

## 9.3 留痕字段

后续命中记录中至少保留：

- `match_rule`
- `match_score`
- `match_reason`

---

# 10. 本文件总裁决

本文件最终钉死：

# **主表负责唯一 identity**
# **alias 负责多名字体系**
# **展示名不等于主身份主名**
# **species 不稳时允许 genus 承接**
# **商品名 / 俗名 / 平台返回名默认先走 alias，不得直接新建主对象**
