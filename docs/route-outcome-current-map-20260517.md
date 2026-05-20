# 当前 route / outcome 实现清单（2026-05-17）

## 1. 口径

本文件记录当前 CloudBase SQL 中已经真实落库并可被 `diagnose-http` route planner 消费的 route / outcome 数据。

只统计满足以下条件的数据：

- route 表：`enabled=1 AND review_status='audited' AND data_status='active'`
- outcome / action profile 表：`review_status='audited' AND data_status='active'`

代码运行 schema 口径来自 `cloudfunctions/diagnose-http/db/schema-resolver.js`：

- production / prod：`cloud1-2grufevs395a9d5e`
- development / dev / local / test：`cloud1_dev`

本文件是“当前实现清单”，不是对每条 route 业务正确性的最终医学/园艺审定。

## 2. 表级统计

| schema | diagnosis_outcomes | route_groups | routes | route_gates | route_questions | answer_effects | action_profiles |
|---|---:|---:|---:|---:|---:|---:|---:|
| prod `cloud1-2grufevs395a9d5e` | 17 | 5 | 22 | 22 | 18 | 24 | 14 |
| dev `cloud1_dev` | 17 | 6 | 24 | 24 | 7 | 27 | 14 |

## 3. outcome route 覆盖

### 3.1 production

production 当前 17 个 active outcome 中，16 个有 active route。

| outcome | 展示名 | route 数 | route keys |
|---|---|---:|---|
| `overwatering_root_pressure` | 积水/根系压力 | 2 | `wilting_wet_soil_route`, `yellowing_wet_soil_route` |
| `underwatering` | 缺水压力 | 2 | `wilting_dry_soil_route`, `yellowing_dry_soil_route` |
| `low_light_growth_weakness` | 光照不足/生长偏弱 | 2 | `leggy_low_light_route`, `yellowing_low_light_route` |
| `sunburn` | 晒伤/强光刺激 | 2 | `sunburn_recent_exposure_route`, `yellowing_sunburn_route` |
| `leaf_spot_problem` | 叶斑类问题 | 2 | `leaf_spot_humid_route`, `yellowing_airflow_leaf_spot_route` |
| `uncertain_observation` | 暂不能稳定判断 | 2 | `yellowing_airflow_unknown_route`, `yellowing_fertilization_unknown_route` |
| `chewing_pest_damage` | 疑似虫害痕迹 | 1 | `holes_chewing_pest_route` |
| `structural_damage_old_injury` | 结构损伤/旧伤 | 1 | `holes_old_injury_route` |
| `dry_air_stress` | 叶尖焦枯/环境压力 | 1 | `dry_air_leaf_edge_route` |
| `normal_leaf_aging` | 自然代谢 | 1 | `yellowing_old_leaf_route` |
| `iron_deficiency` | 缺铁/新叶脉间黄化 | 1 | `yellowing_low_fertilizer_iron_route` |
| `nitrogen_deficiency` | 缺氮/长期营养不足 | 1 | `yellowing_low_fertilizer_nitrogen_route` |
| `nutrient_deficiency` | 营养供给偏弱 | 1 | `yellowing_low_fertilizer_nutrient_route` |
| `fertilizer_repot_stress` | 施肥/换盆应激 | 1 | `yellowing_heavy_fertilizer_repot_route` |
| `humidity_airflow_stress` | 通风/湿度环境压力 | 1 | `yellowing_airflow_humidity_stress_route` |
| `root_stress` | 根部环境压力 | 1 | `yellowing_airflow_root_stress_route` |
| `stable_natural_marking` | 艺斑/正常斑纹 | 0 | production 未落 active route |

### 3.2 development

dev 当前 17 个 active outcome 全部有 active route。相比 production，dev 多了 `non_problematic_marking_group`，使 `stable_natural_marking` 和额外的 `uncertain_observation_route` 可用。

| outcome | 展示名 | route 数 | route keys |
|---|---|---:|---|
| `uncertain_observation` | 暂不能稳定判断 | 3 | `uncertain_observation_route`, `yellowing_airflow_unknown_route`, `yellowing_fertilization_unknown_route` |
| `overwatering_root_pressure` | 积水/根系压力 | 2 | `wilting_wet_soil_route`, `yellowing_wet_soil_route` |
| `underwatering` | 缺水压力 | 2 | `wilting_dry_soil_route`, `yellowing_dry_soil_route` |
| `low_light_growth_weakness` | 光照不足/生长偏弱 | 2 | `leggy_low_light_route`, `yellowing_low_light_route` |
| `sunburn` | 晒伤/强光刺激 | 2 | `sunburn_recent_exposure_route`, `yellowing_sunburn_route` |
| `leaf_spot_problem` | 叶斑类问题 | 2 | `leaf_spot_humid_route`, `yellowing_airflow_leaf_spot_route` |
| `chewing_pest_damage` | 疑似虫害痕迹 | 1 | `holes_chewing_pest_route` |
| `structural_damage_old_injury` | 结构损伤/旧伤 | 1 | `holes_old_injury_route` |
| `dry_air_stress` | 叶尖焦枯/环境压力 | 1 | `dry_air_leaf_edge_route` |
| `stable_natural_marking` | 艺斑/正常斑纹 | 1 | `stable_natural_marking_route` |
| `normal_leaf_aging` | 自然代谢 | 1 | `yellowing_old_leaf_route` |
| `iron_deficiency` | 缺铁/新叶脉间黄化 | 1 | `yellowing_low_fertilizer_iron_route` |
| `nitrogen_deficiency` | 缺氮/长期营养不足 | 1 | `yellowing_low_fertilizer_nitrogen_route` |
| `nutrient_deficiency` | 营养供给偏弱 | 1 | `yellowing_low_fertilizer_nutrient_route` |
| `fertilizer_repot_stress` | 施肥/换盆应激 | 1 | `yellowing_heavy_fertilizer_repot_route` |
| `humidity_airflow_stress` | 通风/湿度环境压力 | 1 | `yellowing_airflow_humidity_stress_route` |
| `root_stress` | 根部环境压力 | 1 | `yellowing_airflow_root_stress_route` |

## 4. production 当前 route group 与 route path

### 4.1 `holes_in_leaf_split_group`：孔洞分流组

入口症状：`holes_in_leaf`

候选 outcome：`structural_damage_old_injury`, `chewing_pest_damage`

默认分流题：`q_observed_probe__holes_in_leaf__structural_cause`

| route | 到达 outcome | route 条件 / gate | route 追问 / answer effect |
|---|---|---|---|
| `holes_chewing_pest_route` 孔洞 + 虫迹路径 | `chewing_pest_damage` 疑似虫害痕迹 | `chewing_pest_gate` 要求 `holes_in_leaf + visible_pest_trace` | `q_holes_in_leaf_confirm:yes` 或 `q_observed_probe__holes_in_leaf__structural_cause:pest_like` 支持该路径 |
| `holes_old_injury_route` 孔洞 + 无虫迹 + 不扩散路径 | `structural_damage_old_injury` 结构损伤/旧伤 | `old_injury_gate` 要求 `holes_in_leaf + no_pest_trace + not_spreading`，阻断 `visible_pest_trace` | `q_observed_probe__holes_in_leaf__structural_cause:old_injury` 支持该路径 |

### 4.2 `leaf_spot_split_group`：叶斑分流组

入口症状：`spreading_spots`

候选 outcome：`leaf_spot_problem`, `uncertain_observation`

| route | 到达 outcome | route 条件 / gate | route 追问 / answer effect |
|---|---|---|---|
| `leaf_spot_humid_route` 斑点扩散 + 通风差路径 | `leaf_spot_problem` 叶斑类问题 | `leaf_spot_gate` 要求 `spreading_spots + poor_ventilation` | 当前无 active route question / answer effect；依赖正式症状证据闭合 |

### 4.3 `light_heat_split_group`：光照与热胁迫分流组

入口症状：`leggy_growth`, `scorching_spots`, `burnt_leaf_edge`

候选 outcome：`low_light_growth_weakness`, `sunburn`, `dry_air_stress`

| route | 到达 outcome | route 条件 / gate | route 追问 / answer effect |
|---|---|---|---|
| `sunburn_recent_exposure_route` 焦斑 + 最近暴晒路径 | `sunburn` 晒伤/强光刺激 | `sunburn_gate` 要求 `scorching_spots + recent_strong_sun` | 当前无 active route question / answer effect |
| `leggy_low_light_route` 徒长 + 弱光路径 | `low_light_growth_weakness` 光照不足/生长偏弱 | `low_light_gate` 要求 `leggy_growth + weak_light` | 当前无 active route question / answer effect |
| `dry_air_leaf_edge_route` 焦边 + 干空气路径 | `dry_air_stress` 叶尖焦枯/环境压力 | `dry_air_gate` 要求 `burnt_leaf_edge + dry_air_condition` | 当前无 active route question / answer effect |

### 4.4 `wilting_care_split_group`：萎蔫养护分流组

入口症状：`wilting`

候选 outcome：`overwatering_root_pressure`, `underwatering`

默认分流题：`q_root_rot_wet_soil_wilt`

| route | 到达 outcome | route 条件 / gate | route 追问 / answer effect |
|---|---|---|---|
| `wilting_wet_soil_route` 萎蔫 + 土湿路径 | `overwatering_root_pressure` 积水/根系压力 | `wilting_wet_gate` 要求 `wilting` 且 `q_root_rot_wet_soil_wilt:yes`，阻断 `:no` | 追问 `q_root_rot_wet_soil_wilt` |
| `wilting_dry_soil_route` 萎蔫 + 土干路径 | `underwatering` 缺水压力 | `wilting_dry_gate` 要求 `wilting` 且 `q_root_rot_wet_soil_wilt:no`，阻断 `:yes` | 追问 `q_root_rot_wet_soil_wilt` |

### 4.5 `yellowing_care_split_group`：黄叶养护分流组

入口症状：`leaf_yellowing`, `uniform_yellowing`, `yellow_lower_leaves`, `yellow_new_leaves`, `interveinal_chlorosis`

候选 outcome：

`overwatering_root_pressure`, `underwatering`, `normal_leaf_aging`, `low_light_growth_weakness`, `sunburn`, `nitrogen_deficiency`, `iron_deficiency`, `nutrient_deficiency`, `fertilizer_repot_stress`, `humidity_airflow_stress`, `root_stress`, `dry_air_stress`, `uncertain_observation`

默认前置题：`watering_frequency_context`、`light_change_context`、`fertilization_growth_context`、`airflow_humidity_context`；不再以 `q_observed_probe__leaf_yellowing__yellowing_care_area_gate` 作为首题或单点聚合 gate。纯黄叶入口不得把 `leaf_spot_problem`、叶斑、病斑、斑纹、mosaic 或虫害题混入后续问诊。

| route | 到达 outcome | route 条件 / gate | route 追问 / answer effect |
|---|---|---|---|
| `yellowing_wet_soil_route` 黄叶 + 浇水偏勤/盆土久湿路径 | `overwatering_root_pressure` 积水/根系压力 | 任一黄叶入口症状 + `q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet`；阻断 `often_dry`，并与光照/施肥/通风湿度答案按分组累计 | 追问 `watering_frequency_context`；`often_wet` 支持，`normal_or_stable` 削弱，`q_root_rot_wet_soil_wilt:yes` 支持，`:no` 削弱 |
| `yellowing_dry_soil_route` 黄叶 + 浇水偏少/盆土偏干路径 | `underwatering` 缺水压力 | 任一黄叶入口症状 + `watering_frequency_context:often_dry`；阻断 `often_wet`，并与其他养护/环境维度按分组累计 | 追问 `watering_frequency_context`；`often_dry` 支持，`normal_or_stable` 削弱，`q_root_rot_wet_soil_wilt:no` 可 redirect |
| `yellowing_low_fertilizer_iron_route` 黄叶 + 低施肥 + 新叶/脉间黄化路径 | `iron_deficiency` 缺铁/新叶脉间黄化 | `yellow_new_leaves` 或 `interveinal_chlorosis` + `fertilization_growth_context:low_or_no_fertilizer` | 追问 `fertilization_growth_context` |
| `yellowing_low_fertilizer_nitrogen_route` 黄叶 + 低施肥 + 老叶/均匀黄化路径 | `nitrogen_deficiency` 缺氮/长期营养不足 | `uniform_yellowing` 或 `yellow_lower_leaves` + `fertilization_growth_context:low_or_no_fertilizer` | 追问 `fertilization_growth_context` |
| `yellowing_old_leaf_route` 黄叶 + 底部老叶自然代谢路径 | `normal_leaf_aging` 自然代谢 | 历史兼容路径保留；纯黄叶入口当前不主动追问 `yellowing_leaf_age_pattern`，只能在已有可靠证据时参与收敛 | 不作为纯黄叶首轮追问 |
| `yellowing_low_light_route` 黄叶 + 光照偏弱路径 | `low_light_growth_weakness` 光照不足/生长偏弱 | 任一黄叶入口症状 + `light_change_context:weaker_light`；阻断 `stronger_direct_light`，并与浇水/施肥/通风湿度答案按分组累计 | 追问 `light_change_context` |
| `yellowing_low_fertilizer_nutrient_route` 黄叶 + 长期缺肥营养供给偏弱路径 | `nutrient_deficiency` 营养供给偏弱 | 任一黄叶入口症状 + `fertilization_growth_context:low_or_no_fertilizer` | 追问 `fertilization_growth_context`；`normal_light_fertilizer` 削弱 |
| `yellowing_sunburn_route` 黄叶 + 近期强光/暴晒路径 | `sunburn` 晒伤/强光刺激 | 任一黄叶入口症状 + `light_change_context:stronger_direct_light`；阻断 `weaker_light`，并与浇水/施肥/通风湿度答案按分组累计 | 追问 `light_change_context` |
| `yellowing_heavy_fertilizer_repot_route` 黄叶 + 重肥/换盆根区应激路径 | `fertilizer_repot_stress` 施肥/换盆应激 | 任一黄叶入口症状 + `fertilization_growth_context:recent_heavy_fertilizer_or_repot` | 追问 `fertilization_growth_context` |
| `yellowing_airflow_leaf_spot_route` 黄叶 + 通风湿度变化 + 快速扩散路径 | `leaf_spot_problem` 叶斑类问题 | 任一黄叶入口症状 + `spreading_spots` + `yellowing_progression_speed:rapid_spreading` | 追问 `yellowing_progression_speed` |
| `yellowing_airflow_root_stress_route` 黄叶 + 通风湿度变化 + 萎蔫掉叶路径 | `root_stress` 根部环境压力 | 任一黄叶入口症状 + `yellowing_progression_speed:with_wilting_or_drop` | 追问 `yellowing_progression_speed` |
| `yellowing_airflow_humidity_stress_route` 黄叶 + 通风湿度环境压力路径 | `humidity_airflow_stress` 通风/湿度环境压力 | 任一黄叶入口症状 + `yellowing_progression_speed:slow_stable` | 追问 `yellowing_progression_speed` |
| `yellowing_airflow_unknown_route` 黄叶 + 通风湿度进展不确定路径 | `uncertain_observation` 暂不能稳定判断 | 任一黄叶入口症状 + `yellowing_progression_speed:unknown` | 追问 `yellowing_progression_speed` |
| `yellowing_fertilization_unknown_route` 黄叶 + 施肥背景不确定路径 | `uncertain_observation` 暂不能稳定判断 | 任一黄叶入口症状 + `fertilization_growth_context:unknown` | 追问 `fertilization_growth_context` |

## 5. dev 比 production 多出的 route

dev 额外有 `non_problematic_marking_group`，production 当前没有 active route group。

入口症状：`stable_natural_marking_pattern`, `irregular_blotches`

候选 outcome：`stable_natural_marking`, `uncertain_observation`

默认分流题：`q_non_problematic_variegation_stability`

| route | 到达 outcome | route 条件 / gate | route 追问 / answer effect |
|---|---|---|---|
| `stable_natural_marking_route` 稳定斑纹/艺斑路径 | `stable_natural_marking` 艺斑/正常斑纹 | `stable_natural_marking_pattern` + `q_non_problematic_variegation_stability:stable_for_weeks`；阻断 `expanding_or_uncertain` | 追问 `q_non_problematic_variegation_stability`；`stable_for_weeks` 支持，`expanding_or_uncertain` 排除 |
| `uncertain_observation_route` 稳定斑纹未闭合-保守不确定路径 | `uncertain_observation` 暂不能稳定判断 | `stable_natural_marking_pattern` 或 `irregular_blotches` + `q_non_problematic_variegation_stability:expanding_or_uncertain` | 追问 `q_non_problematic_variegation_stability` |

## 6. development route 合理性复核

本节复核对象是 development `cloud1_dev` 当前 24 条 active route。复核结论结合两类依据：

1. 自然业务理解：室内植物诊断不能把单一泛化症状直接闭合为具体 outcome，必须由 route/gate 提供更高特异事实。
2. 权威资料核对：优先使用大学 Extension / 官方园艺资料，对黄叶、浇水、缺素、日灼、叶斑、虫食、湿度/通风、艺斑等路径做常识校验。

### 6.1 总体结论

dev 当前 route 体系整体方向成立：大部分 route 已经把“黄叶/萎蔫/孔洞/斑点/焦边”等泛化现象拆到水分、光照、施肥、通风湿度、虫食、稳定斑纹和不确定观察。

但有 3 类 route 需要更严格的 gate 或文档标注：

| route | 当前判断 | 建议 |
|---|---|---|
| `yellowing_airflow_root_stress_route` | 偏弱。黄叶 + 萎蔫/掉叶可以指向根部环境压力，但同样可能是过干、过湿、低湿、温度/环境突变。 | 建议后续 SQL gate 增加土壤持续偏湿、根部异常、排水差、盆土问题等根区证据；否则应降级到 `uncertain_observation` 或 `humidity_airflow_stress`。 |
| `dry_air_leaf_edge_route` | 条件方向成立，但焦边/叶尖发褐是多因一果。 | 必须依赖低湿、空调/暖气风口、干空气或土壤水分排除证据；不能仅凭焦边闭合。 |
| `leaf_spot_humid_route` | 方向成立，但当前 production/dev 的 active question/effect 覆盖不一致。 | 应保留 `spreading_spots` 或明确叶斑证据；仅“通风差/湿度变化”不应闭合叶斑。 |

其余 route 当前可以保留，但需维持“强证据闭合”原则：铁/氮缺素必须看新老叶和脉间/均匀黄化；浇水路线必须看盆土干湿；稳定斑纹必须看长期稳定且不扩散。

### 6.2 逐组判断

| route group | 结论 | 理由 |
|---|---|---|
| `yellowing_care_split_group` | 基本合理，需强化根区/叶斑/湿度分支的保守性 | UMD 指出黄叶是植物压力早期表现，可能由过水、缺水、低光、强光和介质问题导致；因此黄叶路线必须继续依赖水分、光照、施肥、进展速度等分流事实。 |
| `wilting_care_split_group` | 合理 | UMD 浇水资料明确：过干会萎蔫，过湿会掉叶或黄叶，且萎蔫也可能由过水造成；用土湿/土干追问拆分符合证据逻辑。 |
| `light_heat_split_group` | 合理但不能泛化 | UMD 和 UMN 均指出突然强光/直晒可导致日灼、发白斑块、焦边；低光可造成徒长。需要保留最近强光或弱光证据。 |
| `leaf_spot_split_group` | 条件成立但覆盖不足 | Penn State / Extension 资料均支持湿度高、叶面潮湿、通风不足会加重叶斑/病害；但必须有斑点或扩散证据。 |
| `holes_in_leaf_split_group` | 合理 | Illinois Extension 指出孔洞、叶片缺损、叶片被吃掉通常可提示咀嚼类昆虫；无虫迹且不扩散时转旧伤/结构损伤合理。 |
| `non_problematic_marking_group` | dev-only 路径合理，但不宜在扩散/不确定时输出非问题 | Illinois Extension 资料支持彩叶、斑纹、variegation 可作为正常观赏性状；但“irregular blotches”与病斑重叠，必须依赖稳定数周、不扩散、无病害进展。 |

### 6.3 权威资料核对摘要

| 资料 | 支撑点 | 对 route 的影响 |
|---|---|---|
| University of Maryland Extension: Yellowing Leaves on Indoor Plants | 黄叶是压力早期表现；常见原因包括过水、缺水、低光、强光和介质问题。 | 支持黄叶必须走分流 route，不能直接定单一 outcome。 |
| University of Maryland Extension: Watering Indoor Plants | 过干会萎蔫，过湿会掉叶或黄叶；浇水不应只按固定频率。 | 支持 `yellowing_wet_soil_route`、`yellowing_dry_soil_route`、`wilting_wet_soil_route`、`wilting_dry_soil_route`。 |
| University of Minnesota Extension: Quick guide to fertilizing plants | 缺氮常见为老叶/下部叶黄化。 | 支持 `yellowing_low_fertilizer_nitrogen_route` 需要老叶/均匀黄化证据。 |
| University of Minnesota Extension: Iron chlorosis diagnose page | 缺铁/铁失绿常见为黄叶绿脉，且更明显于新梢/新叶。 | 支持 `yellowing_low_fertilizer_iron_route` 需要新叶/脉间黄化证据。 |
| University of Maryland Extension: Excess Light on Indoor Plants | 强光/高热可导致日灼，出现褪色、发白、后续变褐发脆。 | 支持 `sunburn_recent_exposure_route`，但需近期强光证据。 |
| University of Illinois Extension: Houseplants Troubleshooting | 叶尖发褐、失色、斑点有多种原因，包括浇水、肥害、虫害、光照和病害。 | 提醒 `dry_air_leaf_edge_route`、叶斑 route 不可只靠单一泛化症状闭合。 |
| Penn State Extension: Caring for Houseplants | 过湿、叶面潮湿和空气不流通会使病害更易发生；植物需要适当空气流通。 | 支持通风/湿度作为叶斑或环境压力 route 的上下文，但不能替代斑点证据。 |
| Penn State Extension: Pilea as a Houseplant | 过高湿度可发生细菌性叶斑，处理包括降低湿度、增加空气流通。 | 支持 `leaf_spot_humid_route` 的方向。 |
| Illinois Extension: How Insects Feed and Hide | 叶片缺损、孔洞、整片被吃常可提示咀嚼类昆虫。 | 支持 `holes_chewing_pest_route`。 |
| Illinois Extension: Foliage | 彩叶和 variegated 斑纹可作为正常观赏性状长期存在。 | 支持 `stable_natural_marking_route`，但必须以稳定性和不扩散为前提。 |

资料链接：

- <https://extension.umd.edu/resource/yellowing-leaves-indoor-plants>
- <https://extension.umd.edu/resource/watering-indoor-plants>
- <https://extension.umn.edu/manage-soil-nutrients/quick-guide-fertilizing-plants>
- <https://apps.extension.umn.edu/garden/diagnose/plant/deciduous/maple/leaveswhite.html>
- <https://extension.umd.edu/resource/excess-light-indoor-plants/>
- <https://extension.illinois.edu/houseplants/troubleshooting>
- <https://extension.psu.edu/caring-for-houseplants>
- <https://extension.psu.edu/pilea-as-a-houseplant>
- <https://extension.illinois.edu/blogs/over-garden-fence/2016-06-17-how-insects-feed-and-hide>
- <https://extension.illinois.edu/plants/foliage>

### 6.4 是否需要更新已实现 route

需要，但不建议本文件直接改 SQL。建议后续以 SQL patch 方式处理：

1. `yellowing_airflow_root_stress_route`：增加根区/盆土/排水类 required evidence；缺证据时改走 `humidity_airflow_stress` 或 `uncertain_observation`。
2. `dry_air_leaf_edge_route`：增加低湿/干空气/风口类上下文或排除肥害/水分异常的 gate。
3. `leaf_spot_humid_route`：确认 dev/prod 的 active question/effect 一致，保持 `spreading_spots` 或叶斑可见证据为 required evidence。

不建议更新的 route：

1. 水分干湿路线：当前方向合理。
2. 铁/氮缺素路线：当前方向合理，但必须继续要求新老叶/脉间或均匀黄化证据。
3. 孔洞虫食/旧伤路线：当前方向合理。
4. 稳定斑纹路线：dev 方向合理，但 production 是否启用应单独验收。

## 7. 需要注意的当前差异

1. production 与 dev 不完全一致：
   - dev 多 `non_problematic_marking_group`、`stable_natural_marking_route`、`uncertain_observation_route`；
   - production 中 `stable_natural_marking` 仍是 active outcome，但没有 active route；
   - production 的 active route question 数量为 18，dev 为 7，说明两边黄叶 route question 行的启用状态并不一致。
2. production 当前“已经实现 route 的 outcome”按 active route 统计为 16/17；dev 为 17/17。
3. `leaf_spot_humid_route`、`sunburn_recent_exposure_route`、`leggy_low_light_route`、`dry_air_leaf_edge_route` 当前依赖正式症状证据闭合，没有 active route answer effect。
4. `yellowing_airflow_leaf_spot_route` 已要求 `spreading_spots`，不是只靠黄叶 + 快速扩散闭合。
5. 以上清单来自 SQL 当前状态；seed 脚本可能与真实表不同，不能用 seed 文件替代本清单。

## 8. 证据来源

CloudBase MCP 只读查询：

- 环境：`cloud1-2grufevs395a9d5e`
- SQL 实例：`default`
- production schema：`cloud1-2grufevs395a9d5e`
- dev schema：`cloud1_dev`
- 关键 requestId：
  - schema 检查：`9c81ed9f-8b60-4f5b-a0d8-05d7037618f5`
  - 表统计：`ce8c1d74-09b6-4959-a32e-b21ab7aef60d`
  - outcome 覆盖：`0154584c-9262-4f04-b6ac-7f42936cabac`
  - production route 摘要：`2b7aa6b9-421b-41d6-8dee-1e0216b1c579`
  - production gate 明细：`c04ad271-b8c0-46fc-b4fe-68b2ca8447fc`
  - production question 明细：`c8c1c84b-68e7-4b04-bcb8-2afad6917986`
  - production answer effect 明细：`3836e3e4-4ed8-4d6e-a1e1-b31e9f26229a`
  - dev 额外 route 明细：`930b6b32-7dda-4efb-a6ff-b5ad8c8a118c`

## 2026-05-17 说明补充：development route 合理性复核完成口径

- 本轮变更确认 `development route` 的输出不以 ranking/青花值排名为依赖，全部以 `候选 outcome` + `路径 gate` 规则收敛。
- 当出现该类 route 时，以规则一致性（输入约束是否满足、`route 决策` 是否闭环、是否回退 follow-up）作为完成口径；若无异常则视为合理。
- 复核通过标准：
  - route 决策命中且命中理由可追溯；
  - 无异常回退至 review/list 显示分差；
  - answer/front-end 仅消费可解释 `候选 outcome` 与 `回答影响值`。
