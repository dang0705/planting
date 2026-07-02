# 浇水提醒算法 v2.1 逐步逻辑（watering-planner）

> 事实源：`cloudfunctions/layer/utils/watering-planner.js`、`hydration-load.js`、`pot-geometry.js`。
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
| 10. 水量建议 | `computeAmountSuggestion(potGeometry, gate.gateState, baseline.intervalDays)` | `amountClass / amountRangeMl / stopCondition / confidenceLevel` |
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
- **材质/基质经此因子参与** `rootZoneMoistureIndex` → gate（影响"何时浇/是否暂停"）。此外基质保水强度（`substrateRetentionFactor`）与排水孔还经 §6.1 修正矩阵**直接收窄无排水孔时的单次水量**。

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
| general | 1.0 |
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
- 另注：`hasDrainageHole` 原始值还经 §6.1 修正矩阵直接收窄单次水量（与本因子是两条独立路径）。

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

**BASELINE（keep_baseline_or_check_soil，action=follow_baseline_or_check_soil）**：以上都不满足时的兜底态。

> 代码修复记录（Q2-B）：`isTooLongAgo` 原为 `A || B || 5`，`|| 5` 恒真使阈值失效，已修为 `lastEffective===null || lastEffective >= (baselineMin ?? 5)`，baseline min 阈值恢复生效。`isWet`/`isDry` 仍用混合 `&&`/`||` 未加括号，按 JS 运算符优先级解读。

## 6. 水量建议与档位分级（computeAmountSuggestion）

只接收 `(potGeometry, gateState)`，**不读取 wateringEvents 的 amount**（用户历史剂量另经 `userDoseEcho` 双轨回显，见 §6.1）。Q2-B 后按"单次建议水量绝对 ml"落档，启用 mist/small：

| 条件 | amountRangeMl | 落档规则 |
| --- | --- | --- |
| WET（有/无盆型） | `[0,0]` | unknown（暂停） |
| DRY 有盆型 | `[V×0.2, V×0.3]` | 按上限 ml 落档 |
| BASELINE 有盆型 | `[V×0.1, V×0.15]` | 按上限 ml 落档 |
| DRY 无盆型 | `[100,200]` | normal（保守） |
| BASELINE 无盆型 | `[50,150]` | normal（保守） |

档位落桶（`classifyDoseByAmount`，按 amountRangeMl 上限 ml）：

| 建议量上限 ml | 档位 |
| --- | --- |
| ≤ 30 | mist |
| 31 ~ 80 | small |
| 81 ~ 300 | normal |
| > 300 | thorough |

- 小盆浇透绝对水量小 → 可落 mist/small；大盆 → normal/thorough。`mist`/`small` 不再是死代码。
- 无盆型（volumeMl≤0）无法可靠分档，保守只给 normal，confidence 仍 `low`。
- 语义：amountClass 反映"下次建议的绝对水量规模"，独立于用户历史剂量（后者由 userDoseEcho 单独回显，不污染建议）。

### 6.1 排水孔/基质/喜干植物修正（resolveDrainageAmountModifier）

DRY/BASELINE 的水量区间在按体积算出后，再乘排水安全修正系数（防积水烂根），按积水风险从高到低匹配，只取第一命中：

| 排水孔状态 | 下限× | 上限× | 判定依据 |
| --- | --- | --- | --- |
| 有排水孔 `true` | 1.0 | 1.0 | 基线 |
| 无孔 + 喜干植物 | 0.4 | 0.35 | `wateringQuantization.dryTolerance === 'high'` |
| 无孔 + 保水基质 | 0.5 | 0.4 | `potGeometry.substrateRetentionFactor > 1.0` |
| 无孔（普通） | 0.6 | 0.5 | — |
| 未知 `unknown` | 1.0 | 0.85 | 不假设无孔，仅适度收上限 |

- 喜干信号来自属级 `watering_way_quantization_json.dryTolerance`（经 `getPlantCatalogById` → `getUserPlantWateringStrategy` → `app.js` → `buildWateringPlanner` → `computeAmountSuggestion` 传入的 `wateringQuantization`）。
- 保水基质用 `substrateRetentionFactor`（由 `resolveSubstrateRetentionFactor` 按单值或 JSON 多选加权算出，`computePotGeometry` 暴露）；> 1.0 表示保水强于中性田园土。
- 有排水孔时修正矩阵不介入（系数 1.0），水量只随体积/gate。

### 6.2 userDoseEcho 用户历史剂量回显（双轨）

- `resolveUserDoseEcho(wateringEvents, referenceDate)`：取最近一次**非喷雾**浇水的 doseClass；只有喷雾 → mist；无事件 → null。
- `buildWateringPlanner` 返回 `userDoseEcho`，`plant-user-http` 响应透出，前端 `WateringReminderSheet` 以"你通常浇 Y"对照"建议水量 X"展示。

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

`test/unit-test/test-watering-planner-v21.mjs` 覆盖：gate 三态、盆型影响水量区间、baseline 解析、`computeAmountSuggestion` 的 WET/DRY/无盆型分支、基质多选加权、排水材料因子、DRY baseline min 阈值、amountClass 体积分档（小盆 mist/small、大盆 thorough）、userDoseEcho 回显（最近非喷雾/仅喷雾/无事件）。
