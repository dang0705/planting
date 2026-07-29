# 浇水提醒算法 v2.1 逐步逻辑（watering-planner）

> 事实源：`cloudfunctions/layer/utils/watering-planner.js`、`hydration-load.js`、`pot-geometry.js`、`water-volume-format.js`；前端 `src/utils/water-volume-format.js`。
> 若本文与代码冲突，以代码为准，修正本文。行号以撰写时（2026-07-01）为准，仅作定位参考。

## 1. 定位与调用入口

- 纯计算模块，无 DB、无外部 IO。三个文件职责：
  - `pot-geometry.js`：从盆型档案推导几何因子（体积、干透因子、排水风险）。
  - `hydration-load.js`：水合负载、湿压负载、根区湿度、Dry/Wet Gate 判定、水量建议。
  - `watering-planner.js`：编排上述模块，产出下次浇水建议与诊断用 formula 步骤。
- HTTP 入口：`plant-user-http/app.js` 的 `POST /user-plants/watering-planner` 分支。
- 关键事实：**盆型不由前端传**。后端用 `getUserPlantWateringStrategy(openid, plantId)` 查出 `strategy.potProfile`（来自 `user_plant_instances` 主表盆型列），再传入 `buildWateringPlanner({ potProfile })`。前端请求 body 只带 `wateringEvents / weatherDays / forecastDays / referenceDate`。

## 2. 主流程（buildWateringPlanner）

入参：`{ wateringStrategy, historical, forecast, behaviorTimeline, potProfile, thresholds, referenceDate, resolveThresholds }`。

| 步骤 | 计算 | 关键产物 |
| --- | --- | --- |
| 1. 阈值解析 | `resolveThresholds ?? resolveDefaultThresholds`，取 `.watering` | thresholds |
| 2. 盆型几何 | `computePotGeometry(potProfile ?? {})` | `potGeometry` |
| 3. 时间线归一化 | 有 summary 直用，否则 `normalizeCareBehaviorTimeline` | `timeline` |
| 4. 行为摘要（依赖盆型） | `buildBehaviorSummary(refDate, {wateringEvents}, potGeometry)` | `effectiveHydrationLoad` 等 |
| 5. baseline 间隔 | `resolveBaselineInterval(wateringStrategy)` → `[min,max]`，缺省 `[5,8]` | baseline |
| 6. 动态回看窗口 | `resolveLookbackWindowDays(baseline.intervalDays, potGeometry)` | lookbackWindowDays |
| 7. 天气信号 | 偏湿命中数、预报/历史 hot-dry 命中 | weather 信号 |
| 8. 近期浇透 | `hasRecentThoroughWatering(events, refDate)` | 布尔 |
| 9. Dry/Wet Gate | `evaluateDryWetGate({...})` | `gateState / wateringContext / action / reasonCodes` |
| 10. 水量建议 | `computeAmountSuggestion(potGeometry, gate.gateState, baseline.intervalDays, { wateringQuantization })` | `amountRangeMl / stopCondition / confidenceLevel` |
| 11. 下次浇水日期 | `resolveNextWaterDate(baseline, gate.wateringContext, timeline, refDate)` | `nextWaterDate / nextWaterWindow / nextWaterReason` |

## 3. 盆型 / 基质如何参与计算

盆型经 `computePotGeometry` 产出三类因子，参与路径**各不相同**：

### 3.1 potVolumeMl（截锥体积）——唯一直接影响输出

- 公式：`V = (π·h/3)·(R² + R·r + r²)`，R/r 为盆口/盆底半径，h 为盆高（ml = cm³）。
- 只提供一个直径时视为上下口径相同；盆高缺失时按 `平均直径 × 0.85` 估算并降 `volumeConfidence` 为 `low`。
- **直接决定 `amountRangeMl`**：DRY 取体积 20%~30%，BASELINE 取 10%~15%。
- 缺直径 → `buildEmptyGeometry` 返回 `potVolumeMl: 0`（见 §6）。

### 3.2 potGeometryDryDownFactor（干透因子）——间接影响 gate

- `surfaceEvaporationFactor = min(2.0, S/V比 × 10 × 材质蒸发因子)`
- `depthRetentionFactor = min(2.0, (有效深度/10) × 基质保水因子)`
- `potGeometryDryDownFactor = clamp(蒸发/保水, 0.3, 3.0)`，越高干透越快。
- **材质/基质经此因子参与** `rootZoneMoistureIndex` → gate（影响"何时浇/是否暂停"）。此外基质保水强度（`substrateRetentionFactor`）与排水孔还经 §6.2 修正矩阵**直接收窄无排水孔时的单次水量**。

材质蒸发因子（`MATERIAL_EVAPORATION_FACTOR`）：

| 材质 | 因子 |
| --- | --- |
| plastic | 0.85 |
| ceramic | 1.0 |
| terracotta | 1.35 |
| glazed | 0.75 |
| unknown | 1.0 |

基质保水因子（`SUBSTRATE_RETENTION_FACTOR`）：

| 基质 | 因子 |
| --- | --- |
| general | 1.1 |
| peat | 1.3 |
| coco | 1.2 |
| bark | 0.7 |
| sphagnum | 1.4 |
| gritty | 0.5 |
| perlite | 0.4 |
| ceramsite | 0.5 |
| coarse_sand | 0.4 |
| unknown | 1.0 |

> 基质多选已由 `resolveSubstrateRetentionFactor` 支持（Q2-B）：`substrate_type` 存 JSON 数组字符串（`[{material,ratio}]` 多选+比例）时按 ratio 加权平均各基质保水因子；单值枚举仍走查表；非法 JSON / 空 → 1.0 基线。排水材料 perlite/ceramsite/coarse_sand 已补入因子表。

### 3.3 drainageRiskFactor（排水风险）——间接影响 WET 判定

- 有排水孔：0.2；未知：0.5；无排水孔：0.8，且锥度 `taperRatio>1.3`（上宽下窄）时额外加成，clamp 到 1.5。
- 作用：`computeWetPressureLoad` 的乘子；`resolveLookbackWindowDays`（无排水孔窗口 ×1.3）；gate 的"无排水孔窄底盆"判定（`hasDrainageHole==='false' && taperRatio>1.3`）。
- 另注：`hasDrainageHole` 原始值还经 §6.2 修正矩阵直接收窄单次水量（与本因子是两条独立路径）。

## 4. 负载与根区湿度（hydration-load）

浇水事件 amount 先经 `resolveDoseClass` 映射到剂量档（支持中英："浇透/大水"→thorough，"喷雾"→mist，"普通"→normal，"少量"→small，无法识别→unknown）。

各档权重：

| doseClass | 水合权重 | 湿压权重 |
| --- | --- | --- |
| unknown | 0.4 | 0.3 |
| mist | 0.1 | 0.05 |
| small | 0.4 | 0.3 |
| normal | 0.7 | 0.6 |
| thorough | 1.0 | 1.0 |

- `effectiveHydrationLoad = Σ(水合权重 × recencyDecay) / lookbackWindowDays × 10`，`recencyDecay = 1 - daysAgo/窗口`。
- `wetPressureLoad = Σ(湿压权重 × recencyDecay) / 窗口 × 10 × drainageRiskFactor`。
- `lastEffectiveRootWateredDaysAgo`：非喷雾事件里距今最近的天数（喷雾不抵根区，被排除）。
- `rootZoneMoistureIndex = clamp(水合负载/干透因子 + 湿压×0.5 + 天气偏湿加成, 0, 1)`。

不变量：unknown 历史不能当 0 次（权重 0.4）；喷雾不能抵消干燥（水合权重仅 0.1，且不计入有效根区浇水）。

## 5. Dry/Wet Gate 判定（evaluateDryWetGate）

**WET（likely_too_wet，action=delay_and_check_soil）** 满足任一：
1. `rootZoneMoistureIndex>0.6` 且 `wetPressureLoad>0.4`
2. 近期浇透 且 `lastEffectiveRootWateredDaysAgo≤3` 且 天气偏湿命中≥2
3. 无排水孔窄底盆 且 `rootZoneMoistureIndex>0.5`
4. `rootZoneMoistureIndex>0.8` 且 `lastEffectiveRootWateredDaysAgo≤2`

**DRY（likely_too_dry，action=increase_soil_check_frequency）** 满足任一：
1. `rootZoneMoistureIndex<0.3` 且 距上次有效浇水久（≥baseline min）
2. 预报 hot-dry 且 距上次浇水久
3. 历史 hot-dry 且 无有效浇水记录

**湿信号刹车**：DRY 命中且 `weatherWetPressureHitCount≥2` 且 DRY 不来自 `FORECAST_HOT_DRY_HIT` 时，降级为 BASELINE + `DRY_SUPPRESSED_BY_WET_ENVIRONMENT` + `CHECK_SOIL_BEFORE_WATERING`。解决"历史无有效浇水 + 天气强湿"冲突场景下过早判 DRY 并给大水量的问题。预报确有热干时不压制。

**BASELINE（keep_baseline_or_check_soil，action=follow_baseline_or_check_soil）**：以上都不满足时的兜底态。

> 代码修复记录（Q2-B）：`isTooLongAgo` 原为 `A || B || 5`，`|| 5` 恒真使阈值失效，已修为 `lastEffective===null || lastEffective >= (baselineMin ?? 5)`，baseline min 阈值恢复生效。`isWet`/`isDry` 仍用混合 `&&`/`||` 未加括号，按 JS 运算符优先级解读。

## 6. 水量建议与矿泉水瓶度量（computeAmountSuggestion）

接收 `(potGeometry, gateState, baselineIntervalDays, { wateringQuantization, weatherWetPressureHitCount, userDoseEcho })`。按体积算出建议水量区间（ml）后，依次乘 **天气偏湿压制（仅DRY，§6.0）** → **属级需水系数（§6.1）** → **排水孔/基质修正（§6.2）** → **用户历史剂量锚定下限（§6.3）**，产出 `amountRangeMl`（ml 数组）即止。

**前后端职责分离**（2026-07-08 重构）：后端 `computeAmountSuggestion` 只返回 `amountRangeMl`（ml 数组），**不再做任何文案换算**；后端 `water-volume-format.js` 已移除 `formatMlToBottleText` / `formatMlRangeToBottleText` / `BOTTLE_ML` / `BUCKET_ML` / `BUCKET_TEXT_MIN_ML` / `RANGE_MIN_SPAN_ML` 等展示常量与函数，只保留剂量落档算法（`DOSE_CLASS` / `classifyDoseByVolumeRatio` / `resolveMlToDoseClass`）。文案换算全部由前端 `src/utils/water-volume-format.js` 负责。`amountBottleText` 字段已从后端响应中**彻底废弃**，前端 `WateringReminderSheet` 直接调 `formatMlRangeToBottleText(amountRangeMl)` 自算。

| 条件 | amountRangeMl 基线 |
| --- | --- |
| WET（有/无盆型） | `[0,0]`（暂停） |
| DRY 有盆型 | `[V×0.2, V×0.3]` |
| BASELINE 有盆型 | `[V×0.1, V×0.15]` |
| DRY 无盆型 | `[100,200]`（保守） |
| BASELINE 无盆型 | `[50,150]`（保守） |

**输出不再有 amountClass 相对档**。原因：建议水量已是"体积 × 固定倍率"，若再按"水量/体积"百分比落档会对所有盆恒定落同一档，失去区分度。改为直接输出绝对 ml 区间（`amountRangeMl`），文案换算由前端负责。

矿泉水瓶度量（**仅前端** `src/utils/water-volume-format.js`；后端 `water-volume-format.js` 已移除全部展示函数与常量，只保留剂量落档算法）。前端独占 `formatMlToBottleText` / `formatMlRangeToBottleText` / `formatMlToDoseLabel`，另有 dose-slider 专用函数（`resolveWateringDoseOptions` / `isDoseOptionsUsingBucket`）。
- `BOTTLE_ML = 550`；`formatMlToBottleText(ml)` 按 0.5 瓶粒度就近换算，最小「约半瓶」（不附 ml）。
- 单位切换阈值统一为 `BUCKET_TEXT_MIN_ML = 2500`（约半桶）：≥2500ml 改用 5 升油桶「约 N 桶（5L油桶）」，桶数统一 `Math.round`（天然处理 ±10% 容差：2500 与 5000 都 round 到 1 桶）；<2500ml 用矿泉水瓶。**已移除「喷一喷」展示单位**，小水量归到「约半瓶」。
- dose-slider 桶/瓶单位切换：前端 `resolveWateringDoseOptions` 对每个档位**独立**判断单位（≥2500ml 用桶、<2500ml 用瓶），故动态档位可「瓶桶混排」；`isDoseOptionsUsingBucket` 以**最低档（10% 盆体积）是否 ≥2500ml** 判定全档位是否含桶（曾以最高档 80% 为基准，致 slider 显示「桶」而建议水量仍为「瓶」的单位错配，已修）。
- 文案由前端 `formatMlRangeToBottleText(amountRangeMl)` 换算：下限 >0 且上下限差 > `RANGE_MIN_SPAN_ML`(275ml) 时输出区间文案「约{lo}~{hi}瓶」或「约{lo}~{hi}桶（5L油桶）」（按上限是否 ≥2500 切单位）；否则退回取上限单值。区间文案统一输出瓶/桶标签，**不再输出「约{min}~{max}ml」**。
- `amountBottleText` 字段已从后端响应中**彻底废弃**：前端 `WateringReminderSheet` 不再依赖后端透传，直接调 `formatMlRangeToBottleText(amountRangeMl)` 自算。
- 算法层 `hydration-load.js` 的 `DOSE_CLASS.MIST` 档位分类与 `MIST_TEXT_MAX_ML_FOR_CONFLICT`(=50) 冲突判定常量**保留不动**，它们是内部落档/冲突算法，不是展示文案。

### 6.0 天气偏湿水量压制（resolveWeatherWetAmountFactor）

在 gate 倍率之后、属级需水系数之前，对 DRY 水量区间乘天气偏湿压制系数（仅 DRY 生效，BASELINE/WET 返回 1.0 不压）：

| weatherWetPressureHitCount | 系数 | 语义 |
| --- | --- | --- |
| 0 | 1.0 | 正常 |
| 1 | 0.8 | 轻度偏湿，收窄 20% |
| ≥2 | 0.5 | 强偏湿，水量砍半 + stopCondition 改查土提示 |

- 与 §5 的湿信号刹车配合：刹车把 DRY 降级为 BASELINE 后本节不再介入（仅 DRY 生效）；若 DRY 未被刹车（如预报确有热干）但仍有湿信号命中，本节收窄水量。
- stopCondition 在 `weatherWetPressureHitCount≥2` 时改为「先查土，确认表土干燥后再浇」。

### 6.1 属级需水量修正（resolveSpeciesWaterFactor）

让"这类植物本身多需水"参与水量（不只看盆体积）。以属级 `watering_way_quantization_json.targetMoistureMid`（目标湿度中值）为锚，乘到 DRY/BASELINE 区间上：

| targetMoistureMid | 需水系数 | 典型 |
| --- | --- | --- |
| ≤ 0.35 | 0.6 | 喜干（多肉/龙舌兰，backfill 0.28） |
| 0.35 ~ 0.5（不含 0.5） | 0.85 | 微干（表土微干，backfill 0.45） |
| 0.5（缺省中性） | 1.0 | 中性 |
| 0.5 ~ 0.75 | 1.15 | 湿润（均匀湿润，backfill 0.65） |
| > 0.75 | 1.25 | 高湿/水生（backfill 0.85） |

- 无量化数据 / 非法值 → 1.0（中性，不改变水量）。
- 数据链：属级 `watering_way_quantization_json` 经 `getUserPlantWateringStrategy` → `app.js` → `buildWateringPlanner` → `computeAmountSuggestion` 的 `options.wateringQuantization` 传入。
- 与 §6.2 排水孔修正是**独立乘子、按序叠加**（先需水系数、后排水安全），喜干+无孔叠加后最严。

### 6.2 排水孔/基质修正（resolveDrainageAmountModifier）

在需水系数之后再乘排水安全修正系数（防积水烂根），按积水风险从高到低匹配，只取第一命中：

| 排水孔状态 | 下限× | 上限× | 判定依据 |
| --- | --- | --- | --- |
| 有排水孔 `true` | 1.0 | 1.0 | 基线 |
| 无孔 + 喜干植物 | 0.4 | 0.35 | `wateringQuantization.dryTolerance === 'high'` |
| 无孔 + 保水基质 | 0.5 | 0.4 | `potGeometry.substrateRetentionFactor > 1.0` |
| 无孔（普通） | 0.6 | 0.5 | — |
| 未知 `unknown` | 1.0 | 0.85 | 不假设无孔，仅适度收上限 |

- 喜干信号来自属级 `watering_way_quantization_json.dryTolerance`。
- 保水基质用 `substrateRetentionFactor`（由 `resolveSubstrateRetentionFactor` 按单值或 JSON 多选加权算出，`computePotGeometry` 暴露）；> 1.0 表示保水强于中性田园土。
- 有排水孔时修正矩阵不介入（系数 1.0），水量只随体积/gate/需水系数。

### 6.3 用户历史剂量锚定下限（userDoseEcho 锚定）

在排水修正之后，对 BASELINE/DRY 区间下限做用户历史剂量锚定（WET 不受影响）。让"用户上次实际浇了多少"参与建议水量，而非只由盆体积×gate 决定。

**数据来源**：`resolveUserDoseEcho` 取最近一次非喷雾浇水的 `{ doseClass, amountMl }`。返回对象（含具体 ml），无事件返回 null。

**锚定规则**（仅 small/normal/thorough，mist/unknown 不锚定）：

| 条件 | 锚定值 | 说明 |
| --- | --- | --- |
| 有 `amountMl`（具体ml） | `max(amountMl, 基线下限)` | 用户习惯浇更多时锚到用户值 |
| 无 `amountMl`，有 doseClass | 按 doseClass 反推代表 ml | small=V×0.08, normal=V×0.2, thorough=V×0.4 |
| mist / unknown / null | 不锚定 | 喷雾不代表根区浇水 |

- 锚定值 > 上限时 clamp 到上限（下限不超过上限）。
- 锚定命中时追加 `USER_DOSE_ANCHORED` reasonCode。
- **上限保持体积基准不变**：不被用户浇量拉高或压低，防止"上次浇少→永远建议少"死循环。

**效果示例**（V=11000ml，BASELINE 基线 [1100, 1650]，区间跨度 550ml > `RANGE_MIN_SPAN_ML`(275) 故可输出区间文案）：

| 用户上次浇量 | echo doseClass | 锚定后下限 | amountRangeMl | amountBottleText |
| --- | --- | --- | --- | --- |
| 1200ml | small | 1200 | [1200, 1650] | 约2~3瓶 |
| 2200ml | normal | clamp->1650 | [1650, 1650] | 约3瓶 |
| 30ml | mist | 不锚定 | [1100, 1650] | 约2~3瓶 |

> 注：小盆（如 V=2749ml，基线 [275,412]，跨度 137ml < 275）会退回取上限单值「约半瓶」，不输出区间文案。


### 6.4 录入侧绝对 ml 与档反推（resolveDoseClass / resolveMlToDoseClass）

录入侧（用户"上次浇了多少"）改为存**绝对 amountMl**。无盆体积时退回固定 `WATERING_BOTTLE_OPTIONS`（label 为换行格式「约N瓶\n矿泉水瓶」或「约N桶\n5L油桶」）：不知道 / 约0.5瓶 150 / 约1瓶 550 / 约2瓶 1100 / 约5瓶 2600 / 约1桶 5000（**已移除「喷一喷」/`spray` 档**，小水量并入「约0.5瓶」）；有盆体积时由 `resolveWateringDoseOptions(potVolumeMl)` 按盆体积百分比动态生成档位（每档独立判单位，可瓶桶混排）。

- `resolveDoseClass(event, potVolumeMl)`：事件带 `amountMl` 时优先按 **盆体积百分比反推**相对档（5%/15%/40% → mist/small/normal/thorough）；否则回退旧的 amount 字符串档匹配（兼容历史数据）。
- `classifyDoseByVolumeRatio` / `resolveMlToDoseClass`：有盆体积按百分比、无盆体积 fallback 固定 ml 阈值（30/80/300）。
- 水合负载 / 湿压 / `userDoseEcho` / `hasRecentThoroughWatering` 等计算均透传 `potVolumeMl`，使录入侧 ml 真正驱动算法。
- 意义：同样 500ml，对小盆（V≈350）反推为浇透、对大盆（V≈16000）反推为喷雾——同一绝对量对不同盆的相对意义不同。

**amountMl 与 amount 标签冲突校验（resolveDoseClassWithConflict）**：当事件同时带 `amountMl` 和 `amount` 标签时，按 ml 反推的 doseClass rank 与 amount 标签 rank 比较，rank 差 ≥2 判冲突（如 30ml + normal 在 2749ml 盆上：ml 反推为 mist，标签为 normal，差 2）。冲突时以 ml 反推为准，并在 reasonCodes 追加 `AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL`，confidence 降为 low。解决用户录了"正常浇"但实际只浇了 30ml 的矛盾输入。

### 6.5 userDoseEcho 用户历史剂量回显（双轨）

- `resolveUserDoseEcho(wateringEvents, referenceDate, potVolumeMl)`：取最近一次**非喷雾**浇水的 `{ doseClass, amountMl }` 对象；只有喷雾 → `{ doseClass: 'mist', amountMl: null }`；无事件 → null。
- `userDoseEcho` 同时服务于两个用途：① §6.3 锚定水量区间下限（算法参与）；② 前端 `WateringReminderSheet` 以"你通常浇 Y"对照"建议水量 X"展示（回显）。

## 7. 下次浇水日期（resolveNextWaterDate）

- WET：返回 `null`，前端提示"暂停浇水并检查土壤"。
- DRY：今天 + 1（不受排水孔周期系数影响）。
- BASELINE：最近浇水日 + baseline 区间中值；无浇水记录返回 `null`。**排水孔在此轻微调制周期**：无排水孔 `intervalFactor=1.15`（间隔+窗口拉长约 15%，干得慢缓浇防涝），有孔/未知 `1.0`。系数仅作用 BASELINE，DRY/WET 不变。
- 所有日期 clamp 到不早于明天（referenceDate + 1）。

## 8. 可审计性现状

- `buildWateringPlanner` 返回结构已含中间量：`effectiveHydrationLoad / wetPressureLoad / lastEffectiveRootWateredDaysAgo / rootZoneMoistureIndex / potGeometry / userDoseEcho`，以及 `calculation.formulas[]`（逐步表达式 + inputs + thresholds + result + passed）。
- `plant-user-http/app.js` 响应已透出 `userDoseEcho`；`potGeometry` 与 `calculation` 仍未透出，如需看盆型体积、gate 落点需后端打点或临时扩展响应字段。
- 无 debug 开关、无副作用日志。

## 9. 单元测试覆盖

`test/unit-test/test-watering-planner-v21.mjs` 覆盖：gate 三态、盆型影响水量区间、baseline 解析、`computeAmountSuggestion` 的 WET/DRY/无盆型分支、基质多选加权、排水材料因子、DRY baseline min 阈值、大小盆瓶数文案、录入侧 amountMl 按盆体积反推档、属级需水系数（喜干<湿润）、userDoseEcho 回显（最近非喷雾/仅喷雾/无事件）、**DRY 湿信号刹车压制为 BASELINE**、**amountMl 与 amount 标签冲突校验**、**天气偏湿水量压制（DRY ×0.5/×0.8）**、**田园土 retentionFactor 1.1**、**userDoseEcho 锚定区间下限（amountMl/doseClass反推/mist不锚/clamp）**、**区间文案 formatMlRangeToBottleText**（此函数已 import 自前端 `src/utils/water-volume-format.js`）。另有 `test/unit-test/test-water-volume-format.mjs`（后端剂量落档 `classifyDoseByVolumeRatio`/`resolveMlToDoseClass` 与 `DOSE_CLASS`；后端已无瓶数换算函数，瓶数换算测试需迁前端）与 `test/unit-test/test-water-volume-format-frontend.mjs`（前端 dose-slider 桶/瓶单位切换阈值、`resolveWateringDoseOptions`/`isDoseOptionsUsingBucket`、体积估算、巨盆判定）覆盖。
