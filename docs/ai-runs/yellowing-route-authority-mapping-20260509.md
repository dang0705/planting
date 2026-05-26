# 黄叶 route 权威依据与 SQL 映射

## 1. 目标

本文件用于约束黄叶人工问诊与 route SQL 的对齐方式。目标不是扩展全部黄叶 outcome，而是先让现有 MVP outcome 在系统运行时形成可闭环的 authoritative route。

当前只覆盖以下 outcome：

- `overwatering_root_pressure`
- `underwatering`
- `normal_leaf_aging`
- `low_light_growth_weakness`
- `uncertain_observation`

## 2. 权威来源

### 2.1 RHS: Leaf damage on houseplants

来源：
<https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants>

本次采用的规则：

- 大量黄叶常见于文化条件问题，不应先默认病虫害。
- 黄叶需要优先检查浇水过多、浇水过少、位置过阴、温度/环境不适。
- 成熟植株偶发下位老叶发黄脱落，可属于自然代谢。
- 若叶片大面积黄化且根系过湿、发暗、发软，优先考虑过湿/根系压力。

### 2.2 RHS: How to help a poorly houseplant

来源：
<https://www.rhs.org.uk/plants/types/houseplants/how-to-help-a-poorly-houseplant>

本次采用的规则：

- 缺水时，下位老叶常先黄并脱落。
- 过浇水和缺水都可能表现为萎蔫，必须结合盆土和根系状态区分。
- 过浇水常见信号包括新老叶同时发黄脱落、茎基部问题、暗色软烂根。
- 长期不换土或缺肥会造成生长乏力与黄化，但在当前 MVP outcome 中只能作为保守分流，不直接新建营养缺乏 outcome。

### 2.3 Clemson HGIC: Indoor Plants - Watering

来源：
<https://hgic.clemson.edu/factsheet/indoor-plants-watering/>

本次采用的规则：

- 盆栽死亡最常见原因是过浇水。
- 根需要水和氧，长期过湿会缺氧、烂根。
- 过浇水与缺水症状可能相似，不能只看萎蔫，需要看土壤和根区背景。
- 温暖干燥明亮位置用水更快；阴凉低光位置需水更少。

### 2.4 Clemson HGIC: Houseplant Diseases & Disorders

来源：
<https://hgic.clemson.edu/factsheet/houseplant-diseases-disorders/>

本次采用的规则：

- 过浇水与缺水都是室内植物衰退主因。
- 过湿 + 低光 + 低温会放大生理性问题。
- 低光与过湿组合下的黄叶应优先进入养护分流，而不是直接关闭到单一 disease/problem。

### 2.5 UC IPM: Houseplant Problems

来源：
<https://ipm.ucanr.edu/home-and-landscape/houseplant-problems>

本次采用的规则：

- 弱光会造成徒长、弱生长和黄绿化。
- 黄化可由过浇水、低光、营养不足、根区健康差共同引起。
- 黄叶伴细小斑驳/细网/蜜露时，才优先走虫害线索，不应与纯黄叶养护 route 混淆。

## 3. 映射原则

### 3.0 权威来源 -> yellowing route SQL 映射表

> 2026-05-16 口径修正：下表保留 2026-05-09 的历史映射快照。运行时不再把 `yellowing_primary_clue_gate + yellowing_care_area_gate` 作为一屏聚合 gate 闭合条件；黄叶类 gate 现在按分组逐页提问，一页只展示一组 `gate.options`，累计所有必要分组答案后再由 `route/gate/outcome` 收敛。

| 权威来源 | 观察/判断依据 | SQL route / gate | question-option 闭环 | outcome |
|---|---|---|---|---|
| RHS `Leaf damage on houseplants` | 黄叶先看文化条件，不先默认病虫害；过湿根压优先看长期过湿背景 | `yellowing_wet_soil_route` / `wet_soil_confirmation_gate` | `yellowing_primary_clue_gate=care_context` + `yellowing_care_area_gate=watering_area` + `watering_frequency_context=often_wet` | `overwatering_root_pressure` |
| RHS `How to help a poorly houseplant` | 缺水与过浇都可黄化/萎蔫，必须结合盆土与浇水背景区分 | `yellowing_dry_soil_route` / `dry_soil_confirmation_gate` | `yellowing_primary_clue_gate=care_context` + `yellowing_care_area_gate=watering_area` + `watering_frequency_context=often_dry` | `underwatering` |
| RHS `Leaf damage on houseplants` + RHS `How to help a poorly houseplant` | 下位老叶先黄、稳定脱落，可作为自然代谢 | `yellowing_old_leaf_route` / `old_leaf_aging_gate` | `yellowing_leaf_age_pattern=old_lower_leaves_first` | `normal_leaf_aging` |
| Clemson `Indoor Plants - Watering` + UC IPM `Houseplant Problems` | 阴处需水更少，弱光会黄化/弱生长；光照偏弱的黄叶需从养护分流闭环 | `yellowing_low_light_route` / `yellowing_low_light_gate` | `yellowing_primary_clue_gate=care_context` + `yellowing_care_area_gate=light_area` + `light_change_context=weaker_light` | `low_light_growth_weakness` |
| RHS/Clemson/UC IPM 的共同保守边界 | 施肥不足、换盆应激、无形态支撑的强光、病虫迹象未满足正式入口 | 不新增 definitive route | 不直接闭环，保留保守收口 | `uncertain_observation` |

### 3.1 入口症状

黄叶养护 route 入口不能只接受 `leaf_yellowing`，还必须接受实际人工链高频出现的黄叶形态：

- `uniform_yellowing`
- `yellow_lower_leaves`
- `yellow_new_leaves`
- `interveinal_chlorosis`

说明：

- 这几类都属于黄叶家族，适合作为 yellowing care route 入口。
- `yellowing_patchy`、`yellow_speckling`、`fine_webbing`、`sticky_honeydew` 不默认并入养护 route。

### 3.2 养护主分流

黄叶进入养护 route 后，先按人工链已有问题分三段：

1. `q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate`
2. `q_observed_probe__leaf_yellowing__yellowing_care_area_gate`
3. 进入更细的上下文题：
   - `q_observed_probe__leaf_yellowing__watering_frequency_context`
   - `q_observed_probe__leaf_yellowing__light_change_context`
   - `q_observed_probe__leaf_yellowing__fertilization_growth_context`
   - `q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern`

### 3.3 当前 MVP 可闭环 outcome

#### A. 过湿 / 根系压力

满足：

- 黄叶入口成立
- `yellowing_primary_clue_gate = care_context`
- `yellowing_care_area_gate = watering_area`
- `watering_frequency_context = often_wet`

则收敛到：

- `overwatering_root_pressure`

#### B. 缺水压力

满足：

- 黄叶入口成立
- `yellowing_primary_clue_gate = care_context`
- `yellowing_care_area_gate = watering_area`
- `watering_frequency_context = often_dry`

则收敛到：

- `underwatering`

#### C. 自然老叶代谢

满足：

- 黄叶入口成立
- `yellowing_leaf_age_pattern = old_lower_leaves_first`

则收敛到：

- `normal_leaf_aging`

#### D. 弱光 / 生长偏弱

满足：

- 黄叶入口成立
- `yellowing_primary_clue_gate = care_context`
- `yellowing_care_area_gate = light_area`
- `light_change_context = weaker_light`

则收敛到：

- `low_light_growth_weakness`

### 3.4 当前 MVP 不直接闭环的情况

以下情况本轮不直接新建 definitive outcome，统一保守处理：

- `fertilization_growth_context = low_or_no_fertilizer`
- `fertilization_growth_context = recent_heavy_fertilizer_or_repot`
- `light_change_context = stronger_direct_light` 但无明确晒伤形态
- 黄叶主链里出现病斑/虫害线索，但不满足现有病虫 route 的正式入口

处理策略：

- 保持 `uncertain_observation`
- 不允许误报为 `overwatering_root_pressure` / `underwatering`

## 4. SQL 落地要求

本轮 SQL 必须至少完成：

1. `yellowing_care_split_group` 扩大入口症状集合。
2. `yellowing_wet_soil_route` / `yellowing_dry_soil_route` / `yellowing_old_leaf_route` 的 gate 改为可消费人工链 question-option。
3. 新增 `yellowing_low_light_route`。
4. `outcome_route_questions` 使用人工链已有 question key，而不是继续只依赖 `q_root_rot_wet_soil_wilt`。
5. `outcome_answer_effects` 补齐黄叶人工链问题的 option -> route/outcome 映射。

## 5. runtime 落地要求

本轮 runtime 必须至少完成：

1. route planner 能在 `uniform_yellowing` 等黄叶形态下命中 `yellowing_care_split_group`。
2. route planner 能消费人工链真实答案，而不是只认 `q_root_rot_wet_soil_wilt`。
3. `runtime_snapshot_json.metrics.routeDecision` 不能在黄叶养护链场景下持续为 `null`。
4. 当 `care_context -> watering_area -> often_wet` 成立时，最终公开结果必须能闭合到 `overwatering_root_pressure`，而不是落回旧的 `uncertain_output_ready`。
