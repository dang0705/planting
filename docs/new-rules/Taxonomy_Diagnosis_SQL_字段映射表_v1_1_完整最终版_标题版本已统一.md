# Taxonomy / Diagnosis SQL 字段映射表 v1.1（完整最终版）

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

# 1. 文档目标

本文件要回答 5 个问题：

1. 哪些 SQL 表属于 Taxonomy 主数据层
2. 哪些 SQL 表属于 Diagnosis 业务层
3. 两份素材分别为哪些正式表提供字段来源
4. 哪些字段可以直接继承，哪些必须重命名 / 重组 / 新增
5. 哪些字段禁止直接从素材源照抄进入正式表

---

# 2. 最终 SQL 表分层建议

当前最终 SQL 表建议至少分为 4 层：

## 2.1 Taxonomy 主数据层
- `plant_identity_entities`
- `plant_identity_aliases`
- `taxonomy_families`（如需）
- `taxonomy_genera`（如需）
- `taxonomy_species`（如需）
- `plant_identity_merge_history`

## 2.2 Diagnosis 静态业务层
- `problems`
- `symptoms`
- `question_templates`
- `question_option_sets`
- `diagnosis_result_explanations`
- `plant_problem_profiles`
- 以及 v7 中其他 diagnosis 基础表

## 2.3 Taxonomy → Diagnosis 挂接层
- `plant_identity_diagnosis_links`
- `genus_diagnosis_links`（如需显式表）
- `family_diagnosis_links`（如需显式表）

## 2.4 运行时 / 监督层
- 该部分不以本文件为主，但需与既有文档一致：
  - `plant_identity_resolution_records`
  - `visual_raw_image_records`
  - `visual_normalized_image_results`
  - `visual_call_aggregate_results`
  - `visual_admission_records`
  - `visual_supervision_records`

---

# 3. 素材源职责写死

## 3.1 `plant_catalog.csv` 的正式职责

它服务于：

- `plant_identity_entities`
- `plant_identity_aliases` 的初始 identity / name baseline
- family / genus / species 基础字段
- 学名、中文展示名、基础分类标签
- Taxonomy 归一重构的底稿

### 它不应直接充当
- diagnosis 主表
- problem / symptom / question 主表
- 运行时表
- 视觉入口监督表

---

## 3.2 `plants_v13_user_friendly_full_v7.xlsx` 的正式职责

它服务于：

- diagnosis 静态业务表
- `plant_problem_profiles`
- 其他 problem / symptom / question / explanation 基础表
- diagnosis 侧字段命名与业务语义 baseline

### 它不应直接充当
- Taxonomy 主表
- plant identity 主对象表
- alias 主表
- 身份命中规则主表

---

# 4. Taxonomy 主表字段映射

## 4.1 正式主表：`plant_identity_entities`

### 中文主名
植物身份主表

### 作用
系统内部唯一承载 plant identity entity 的正式主表。

---

## 4.2 字段映射表

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

## 4.3 处理原则

### 可直接继承
- 科中文名
- 科英文名
- 中文分类
- 英文分类
- 学名
- 创建时间
- 更新时间
- 封面图引用

### 必须归一后生成
- `plant_identity_id`
- `canonical_identity_name`
- `identity_level`
- `species_name`
- `is_active`
- `review_status`

### 禁止直接照抄进正式主字段
- 外部平台返回植物名
- 商品名
- 用户搜索兼容名
- 未审查别名

---

# 5. 别名表字段映射

## 5.1 正式表：`plant_identity_aliases`

### 中文主名
植物身份别名表

### 作用
承载一个 plant identity entity 的多别名体系。

---

## 5.2 字段映射表

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

## 5.3 alias_type 当前建议值

- `standard_alias`：标准别名
- `common_name`：常见俗名
- `commercial_name`：商业名 / 园艺名
- `legacy_name`：历史旧名
- `baidu_match_name`：百度命中映射名
- `search_compatible_name`：搜索兼容名

---

# 6. 身份命中规则表字段映射

## 6.1 正式表：`plant_identity_match_rules`

### 中文主名
植物身份命中规则表

### 作用
承载“外部识别名 / 输入名如何命中正式主对象”的规则记录。

---

## 6.2 字段建议

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

# 7. Diagnosis 主表字段映射

## 7.1 正式原则

Diagnosis 侧大部分表，以：

# **`plants_v13_user_friendly_full_v7.xlsx` 为字段来源 baseline**

但不等于直接照抄。  
尤其是字段命名、主键、外键、唯一键、治理字段，仍需按正式 SQL 结构调整。

---

## 7.2 典型 diagnosis 表映射

### `problems`
- 来源：v7 对应问题表
- 处理：延续现有 diagnosis 业务语义，补正式主键与治理字段

### `symptoms`
- 来源：v7 对应症状表
- 处理：延续现有症状键、中文主名、证据语义，补治理字段

### `question_templates`
- 来源：v7 question 相关表
- 处理：统一 question 模板主键与适用条件

### `diagnosis_result_explanations`
- 来源：v7 explanation 表
- 处理：保留 explanation 业务含义，补版本字段

### `plant_problem_profiles`
- 来源：v7 `plant_problem_profiles`
- 处理：作为 diagnosis baseline 中最关键的宿主挂接表

---

# 8. Taxonomy → Diagnosis 挂接表

## 8.1 正式表：`plant_identity_diagnosis_links`

### 中文主名
植物身份到诊断挂接表

### 作用
承载 Taxonomy 主对象如何稳定挂 diagnosis baseline。

---

## 8.2 字段建议

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

## 8.3 挂接优先级写死

### 第一优先级
稳定 `matched` 且存在明确 `plant_identity_id`  
→ `identity` 级精确挂接

### 第二优先级
identity 不稳但 genus 稳  
→ `genus` 级降级挂接

### 第三优先级
genus 不稳但 family 可用  
→ `family` 级弱背景挂接

### 第四优先级
`unresolved`  
→ 不做 diagnosis 精细挂接

---

# 9. 禁止直接照抄入库的字段类型

以下内容**不得**从素材源未经治理直接进入正式主表或正式 diagnosis 表：

- 百度直接返回植物名
- 混元直接输出的身份候选
- 未分型的 alias 串
- 未审查的用户俗名
- 外部平台临时命中名
- 模糊清洗但未记录规则的匹配名

---

# 10. 新增治理字段清单

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

# 11. 最终映射总裁决

本文件最终钉死：

# **`plant_catalog.csv` 服务于 Taxonomy 主数据侧**
# **`plants_v13_user_friendly_full_v7.xlsx` 服务于 Diagnosis 侧**
# **二者均需经过映射、归一、审查，才能进入最终 SQL**

也就是说：

- 不是“导进去就完”
- 而是“先形成正式对象，再入库”

---

# 12. 本文件之后的落地顺序建议

1. 先完成《植物身份主表与命名归一规则 v1》
2. 再完成《Taxonomy 与 Diagnosis 挂接规则 v1》
3. 最后基于这三份桥接文档形成《最终 SQL 制表方案 v1》

这才是稳定落代码的顺序。




# ================================
# v1.1 新增附录开始（基于 v1 只增不减）
# ================================

> 说明：
>
> - 以下内容为《Taxonomy / Diagnosis SQL 字段映射表 v1（完整最终版）》在**完整保留上文全部有效内容**的前提下，继续新增的联动附录。
> - 本次新增目标：
>   - 正式把 `genus_care_profile.csv` 的字段映射纳入总映射表
>   - 明确它如何进入 `genus_care_profiles`
>
> - 本次新增只做补充，不删改上文，不重排上文，不替换上文。

---

# 附录 A：属级养护基线字段映射增补（本次新增，不替换上文）

## A-1. 新增正式素材源

在现有两份素材源之外，当前新增正式确认素材源：

- `genus_care_profile.csv`

### 定位
它是：

# **Taxonomy 侧属级养护基线主表素材**

---

## A-2. 新增正式目标表：`genus_care_profiles`

中文主名：

- **属级养护基线表**

---

## A-3. 字段映射表

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

## A-4. 正式 CSV 表头建议

后续若继续以 CSV 作为导入中间层，应使用带表头版本：

```csv
genus_name,family_name,plant_category,watering_strategy_json,fertilizing_strategy_json,light_strategy_json,airflow_strategy_json,temp_min_c,temp_max_c,humidity_min,humidity_max,toxicity_level,review_status,source_evidence,baseline_note,evidence_level,evidence_strategy,reserved,created_at,updated_at
```

---

## A-5. 当前正式处理原则

### 可直接继承
- `genus_name`
- `family_name`
- 温湿度上下限
- `source_evidence`
- `baseline_note`
- `created_at`
- `updated_at`

### 必须受控值域化
- `plant_category`
- `toxicity_level`
- `review_status`
- `evidence_level`
- `evidence_strategy`

### 必须 schema 校验
- `watering_strategy_json`
- `fertilizing_strategy_json`
- `light_strategy_json`
- `airflow_strategy_json`

### 新增生成
- `genus_care_profile_id`
- `data_source`
- `version`
- `is_active`
- `retired_at`
- `replacement_profile_id`

---

## A-6. 当前唯一性建议

第一阶段建议以：

- `genus_name`
- `family_name`

共同构成业务唯一性约束。

---

## A-7. 当前总裁决补充

本附录补入后，当前总字段映射体系应统一理解为：

- `plant_catalog.csv` → Taxonomy 身份主数据侧
- `plants_v13_user_friendly_full_v7.xlsx` → Diagnosis 侧
- `genus_care_profile.csv` → Taxonomy 侧属级养护基线主表
