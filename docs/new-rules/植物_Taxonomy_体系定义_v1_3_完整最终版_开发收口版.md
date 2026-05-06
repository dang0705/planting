# 植物 Taxonomy 体系定义 v1.3（完整最终版，开发收口版）

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

# 一、当前正式定位

plants taxonomy（植物 Taxonomy 体系）是当前诊断系统中，用于承载：

- 植物身份主结果的静态主数据
- 植物命名归一
- 分类路径
- 宿主背景输入
- 属级养护基线挂接基础

的正式主数据体系。

---

# 二、Taxonomy 静态层与运行时层边界

## 2.1 Taxonomy 静态层承载什么
Taxonomy 静态层承载：

- `plant_identity_entity`
- canonical identity
- primary display name
- family / genus / species
- aliases
- match rules
- merge / retire 历史
- genus care baseline 挂接基础

## 2.2 Taxonomy 静态层不承载什么
Taxonomy 静态层不承载：

- 当前会话的 `matched / weak_matched / unresolved`
- 当前会话的 `identity_resolution_status`
- 当前会话的 route hint
- 当前会话的视觉候选状态

### 正式裁决
# **`identity_resolution_status` 不属于 Taxonomy 静态主数据字段。**
# **它只属于运行时身份解析记录。**

---

# 三、第一阶段正式字段口径

## 3.1 `plant_identity_entities`
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

### 说明
为解决第一阶段挂接键不自洽问题，当前正式新增：

# **`family_name_canonical`**
作为第一阶段归一科名字段。

---

# 四、属级养护基线与 Taxonomy 的关系

## 4.1 属级养护基线属于 Taxonomy 侧主数据体系
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

## 4.2 第一阶段正式挂接键
正式裁决：

# **第一阶段挂接键 = `genus_name + family_name_canonical`**

这意味着：

- `genus_care_profiles` 侧应使用 `family_name_canonical`
- `plant_identity_entities` 侧也应提供 `family_name_canonical`

不再模糊使用：
- `family_name`
- `family_name_cn`
- `family_name_en`

作为业务 join key

---

# 五、Taxonomy 与 Diagnosis 的边界

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

# **Taxonomy / 宿主先验不得推翻高置信症状。**

---

# 六、一句话总裁决

**当前开发阶段，Taxonomy 的核心任务是：稳定提供身份主数据、命名归一、分类路径、宿主背景与属级养护基线挂接基础；会话态身份状态一律留在运行时层。**
