# 属级养护基线表设计 v1.1（review 增补修正版，完整最终版）

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

# 一、文档目标

本文件要解决 7 个问题：

1. `genus_care_profile.csv` 的正式定位是什么
2. 它应落成什么正式表
3. 正式表头如何定义
4. JSON 字段 schema 如何冻结
5. 它与 Taxonomy 的挂接关系是什么
6. 它与 future species / care_overrides 的边界是什么
7. 它如何服务后续养护建议 / 行动建议系统

---

# 二、正式定位

## 2.1 它不是 Diagnosis 问题表

这张表不表达：

- problem
- symptom
- question
- outcome

因此它不属于 Diagnosis 静态业务层主表。

---

## 2.2 它应正式归入 Taxonomy 侧主数据体系

这张表表达的是：

# **属级养护基线**

它描述的是：

- 某个属级对象在常规养护上的基线偏好
- 浇水 / 施肥 / 光照 / 通风 / 温湿度 / 毒性等长期稳定特征
- 后续 species / identity 级别覆盖的上位基线

因此它最合理的正式定位是：

# **Taxonomy 侧属级养护基线主表**

---

## 2.3 正式表名

### 英文正式表名
`genus_care_profiles`

### 中文主名
**属级养护基线表**

---

# 三、它在系统中的职责

## 3.1 它服务哪些系统能力

这张表至少服务 4 类能力：

### 1. 养护背景说明
给 explanation / 产品说明提供属级养护背景

### 2. 行动建议生成
为后续“浇水建议 / 光照建议 / 通风建议 / 施肥建议 / 湿度建议”提供稳定基线

### 3. 宿主环境上下文
作为植物宿主背景的一部分，帮助判断：
- 当前环境与基线是否偏离
- 某些问题是否可能和养护偏差有关

### 4. future overrides 的上位基线
为后续：
- species care overrides
- plant identity care overrides
- 特定品种 / 园艺变体 overrides
提供上位默认值

---

## 3.2 它不服务什么

它不应直接承担：

- 最终 diagnosis
- problem 定义
- outcome 锁定
- 单次会话运行时状态
- 临时问答结论

也就是说：

# **它是主数据基线表，不是会话结果表。**

---

# 四、正式表结构设计

## 4.1 正式字段清单

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

## 4.2 当前最小必备字段

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

# 五、唯一性与主键规则

## 5.1 主键规则

正式主键：

- `genus_care_profile_id`

必须为系统生成主键，不直接使用 genus_name 代替主键。

---

## 5.2 当前业务唯一性建议

第一期建议以：

- `genus_name`
- `family_name`

共同构成业务唯一性约束。

### 原因
只用 genus_name 虽然在多数情况下可行，但后续：
- 历史名
- 命名冲突
- 数据清洗阶段异常值

都可能让 family_name 成为必要补强。

---

# 六、CSV 正式表头定义

## 6.1 当前问题

`genus_care_profile.csv` 当前没有正式表头。  
这意味着它还不是可直接导入的正式 CSV。

---

## 6.2 正式 CSV 表头建议

后续若继续以 CSV 作为导入中间层，应正式加上表头：

```csv
genus_name,family_name,plant_category,watering_strategy_json,fertilizing_strategy_json,light_strategy_json,airflow_strategy_json,temp_min_c,temp_max_c,humidity_min,humidity_max,toxicity_level,review_status,source_evidence,baseline_note,evidence_level,evidence_strategy,reserved,created_at,updated_at
```

### 说明
- `reserved` 当前可保留但不建议长期存在
- 更稳的方式是后续直接去掉 `reserved`，用正式新增字段替代

---

# 七、JSON schema 冻结

这是本文件最关键的一部分之一。

---

## 7.1 浇水策略 JSON（`watering_strategy_json`）

### 中文主名
浇水策略

### 当前建议 schema
```json
{
  "way": "soil_dry_then_water",
  "freq": 7,
  "unit": "day",
  "verb": "浇透"
}
```

### 字段说明
- `way`：浇水方式
- `freq`：频率数值
- `unit`：频率单位
- `verb`：动作动词

### 必填字段
- `way`
- `freq`
- `unit`

### 可选字段
- `verb`

### 当前建议合法值
#### `way`
- `soil_dry_then_water`
- `keep_slightly_moist`
- `avoid_waterlogging`
- `allow_partial_dry_between_watering`

#### `unit`
- `day`
- `week`

---

## 7.2 施肥策略 JSON（`fertilizing_strategy_json`）

### 中文主名
施肥策略

### 当前建议 schema
```json
{
  "freq": 14,
  "unit": "day",
  "type": "balanced_liquid_fertilizer",
  "other": "生长期为主"
}
```

### 必填字段
- `freq`
- `unit`
- `type`

### 可选字段
- `other`

### 当前建议合法值
#### `unit`
- `day`
- `week`
- `month`

#### `type`
- `balanced_liquid_fertilizer`
- `foliage_plant_fertilizer`
- `flowering_plant_fertilizer`
- `slow_release_fertilizer`
- `diluted_general_fertilizer`

---

## 7.3 光照策略 JSON（`light_strategy_json`）

### 中文主名
光照策略

### 当前建议 schema
```json
{
  "way": "bright_indirect_light",
  "freq": null,
  "unit": null,
  "other": "避免强烈直晒"
}
```

### 必填字段
- `way`

### 可选字段
- `freq`
- `unit`
- `other`

### 当前建议合法值
#### `way`
- `bright_indirect_light`
- `medium_indirect_light`
- `bright_scattered_light`
- `gentle_direct_light_ok`
- `avoid_harsh_direct_sun`

---

## 7.4 通风策略 JSON（`airflow_strategy_json`）

### 中文主名
通风策略

### 当前建议 schema
```json
{
  "level": "good_airflow",
  "sensitivity": "avoid_stagnant_air"
}
```

### 必填字段
- `level`

### 可选字段
- `sensitivity`

### 当前建议合法值
#### `level`
- `good_airflow`
- `moderate_airflow`
- `stable_airflow`

#### `sensitivity`
- `avoid_stagnant_air`
- `avoid_strong_draft`
- `normal`

---

# 八、与 Taxonomy 的挂接关系

## 8.1 当前阶段的正式挂接方式

第一期最稳的做法是：

# **通过 `genus_name` + `family_name` 与 Taxonomy 侧 genus 语义挂接**

也就是说，这张表当前不直接依赖：
- `genus_id`
- `genus_identity_id`

因为这些维表或对象化结构，在第一期未必已经完全独立稳定。

---

## 8.2 后续可升级挂接方式

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

## 8.3 当前边界写死

# **当前阶段它是 genus baseline**
# **不是 species 主表**
# **也不是 plant identity 级唯一养护真值表**

---

# 九、与 future overrides 的边界

## 9.1 它是基线，不是终局覆盖层

新增正式规则：

# **属级养护基线表是上位默认值，不是后续一切养护策略的唯一真值表。**

---

## 9.2 后续应允许的覆盖层

未来应允许：

### 1. species care overrides
当 species 已稳定且确有显著差异时，允许覆盖 genus baseline。

### 2. plant identity care overrides
当某个 plant identity 在产品层面有足够独立价值时，允许做更细覆盖。

### 3. horticultural variant overrides
当园艺变体确有长期稳定差异时，允许做变体覆盖。

---

## 9.3 当前阶段禁止的误解

### 禁止把 genus baseline 理解成
- 所有 species 都永远完全相同
- 所有 identity 都不能再细化
- 以后不需要 overrides

这条必须先写死，不然后续会被这张表反向绑死。

---

# 十、与行动建议系统的关系

## 10.1 这张表是行动建议系统的重要上游

后续行动建议至少会用到：

- 浇水策略
- 光照策略
- 通风策略
- 温度区间
- 湿度区间
- 毒性等级

也就是说，这张表会成为：

# **行动建议系统的基线输入层**

---

## 10.2 行动建议不能直接等于基线表原句复读

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

# 十一、纳入最终 SQL 制表方案的结论

本文件最终钉死：

# **`genus_care_profile.csv` 应正式纳入本次落表**
# **正式表名为 `genus_care_profiles`**
# **正式定位为 Taxonomy 侧属级养护基线主表**
# **当前不能原样直接入库，必须先补正式表头与 JSON schema**
# **后续允许 species / identity / variant 级 overrides 覆盖**

---

# 十二、下一步建议

本文件完成后，最合理的下一步是：

1. 把 `genus_care_profiles` 正式纳入《最终 SQL 制表方案 v1.1》的主表清单
2. 给 `genus_care_profile.csv` 生成带正式表头的导入版
3. 在正式 SQL 草案中把它落成主表
4. 预留 future overrides 设计位，但本期不强行展开




# ================================
# v1.1 新增附录开始（基于 v1 只增不减）
# ================================

> 说明：
>
> - 以下内容为《属级养护基线表设计 v1》在**完整保留 v1 原文**的前提下，继续新增的 review 收口附录。
> - 上文全部内容 = v1 原文，原样保留。
> - 下文附录 A～D = 基于最高规格审查结果新增的修正版内容。
> - 本次新增只做补充，不删改上文，不重排上文，不替换上文。

---

# 附录 A：当前挂接键与未来升级键边界增补（本次新增，不替换上文）

## A-1. 一期正式挂接键写死

为防止实现口径摇摆，现正式写死：

# **第一阶段 `genus_care_profiles` 的正式业务挂接键 = `genus_name + family_name`**

这意味着：

- 当前查询
- 当前导入
- 当前 Taxonomy 侧 genus 语义挂接
- 当前行动建议基线查询

都应以这组键作为第一阶段正式口径。

---

## A-2. 这组挂接键是“阶段性正式键”，不是永久终局形态

新增正式说明：

# **`genus_name + family_name` 是当前阶段的正式挂接键，但不是永久终局形态。**

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

## A-3. 当前表结构应预留升级位

为避免未来迁移成本过高，当前表结构建议预留：

- `genus_id`（可空）
- `genus_identity_id`（可空）

### 说明
- 第一阶段允许为空
- 第二阶段结构成熟后再逐步回填
- 不得因为当前还未启用，就否定其预留必要性

---

# 附录 B：JSON schema 空值 / 未知值 / 扩展规则增补（本次新增，不替换上文）

## B-1. 空值规则

### 正式规则
- `null`：字段存在，但当前无值
- 空字符串：不得作为 schema 内部字段合法值
- 缺字段：只允许出现在可选字段上

---

## B-2. 未知值 / 不适用值规则

当前建议正式允许：

- `unknown`
- `not_applicable`

### 含义
- `unknown`：当前未知，但理论上应有此信息
- `not_applicable`：该字段对当前对象不适用

---

## B-3. 枚举扩展规则

新增正式规则：

# **当前文档列出的合法枚举值属于 v1 冻结值域。**
# **后续如需新增枚举，必须通过版本增补，不允许脚本侧私扩。**

这意味着：

- 校验器可按当前值域严格校验
- 后续扩展必须走文档增补与版本升级
- 不允许某个导入脚本偷偷新增本地枚举值

---

# 附录 C：字段值域冻结增补（本次新增，不替换上文）

## C-1. `plant_category` 当前建议值域

建议当前先冻结为受控值，例如：

- `indoor_foliage`
- `flowering`
- `vine`
- `succulent`
- `fern`
- `woody_foliage`
- `aquatic_or_semi_aquatic`
- `other`

### 说明
- 这是 v1 建议冻结值域
- 后续如需扩展，必须走版本增补

---

## C-2. `toxicity_level` 当前建议值域

建议当前先冻结为：

- `non_toxic`
- `mild_toxic`
- `toxic`
- `unknown`

### 说明
- 当前先做主数据等级，不直接展开为多维宠物 / 儿童风险体系
- 后续若有必要，可再引入更细风险维度

---

## C-3. `review_status` 当前建议值域

建议当前先冻结为：

- `audited`
- `review_pending`
- `deprecated`
- `retired`

---

## C-4. `evidence_level` 当前建议值域

建议当前先冻结为：

- `L1_representative_species_direct`
- `L2_derived_from_authoritative_sources`

---

## C-5. `evidence_strategy` 当前建议值域

建议当前先冻结为：

- `representative_species`
- `authoritative_derivation`

---

# 附录 D：导入校验规则增补（本次新增，不替换上文）

## D-1. 必须通过的基础校验

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

## D-2. 推荐增加的语义校验

建议后续再加：

- `freq` 不得为负数
- `unit` 必须与 `freq` 语义匹配
- `way` / `type` / `level` 必须在当前枚举值域内
- `baseline_note` 不得为空白长文本垃圾值

---

# 本文件版本状态说明

- 上文全部内容 = 《属级养护基线表设计 v1》原文，原样保留
- 下文附录 A～D = 本次最高规格 review 后新增的收口内容
- 二者合并后，共同构成：

# **《属级养护基线表设计 v1.1（review 增补修正版，完整最终版）》**
