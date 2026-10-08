# MVP 浇水策略 `care-watering-mvp/v1`

归属：E04→E06，ClickUp `z8v0kmr973`。依据：用户 2026-10-08 裁决——一人开发、无真实盆栽标定条件，MVP 由文献/公开数据标定先实现，真实标定列为后续优化；统一计划 4.3／4.3.1（当前盆土优先、提前检查来自本轮剩余干燥窗口、水量独立）；已冻结的 `care-capability-result/v1` 外壳与 `watering-assessment/v1` 详情草案。

本策略是**低置信度**的正式 MVP 发布：可以对外返回建议，但每个结果固定 `confidence: low`，说明“依据通用文献估算，未经本盆标定”。所有数值只来自不可变发布正文（`business_policy_releases` 的 `care/mvp_watering`），源码不内置默认值；没有活动发布时整体返回 `temporarily_unavailable`。

## 1. 量纲与参考条件

- **1 个等效干燥单位 = 在本策略参考条件下的 1 天。** 参考条件由发布正文声明：白天平均 PPFD `referencePpfd`、空气 VPD `referenceVpdKpa`。
- Tropicals 名义基线 `[min,max]` 天（已按 tier＋trigger 读回）在本策略下解释为 `[min,max]` 个等效单位，`referenceConditionsConfirmed=true` 仅由本发布授予，并在结果快照中保留策略版本。不是“旧天数改名”：环境偏离参考时，同一基线对应的日历天数随之变化。
- 基线是固定参考，不直接产生日期；日期只来自下述动态积分。

## 2. 环境干燥需求（逐时段）

沿用已验证的联合响应结构（原实验 `light-log-vpd-hypothesis/v1`，本发布提升为正式参数组）：

```text
L(q)   = q / (q + k)
H(D)   = (D/Dref) × max(0, 1 − s × ln(D/Dref))
Leaf   = L(q)/L(qref) × H(D)
E_soil = D / Dref                       （基质表面蒸发按道尔顿关系随 VPD 变化）
Demand = w × Leaf + (1 − w) × E_soil
```

- q：植物位置时段平均 PPFD（来自极简 Lux 锚点光照链），D：室内空气 VPD。
- **室内 VPD**：有同刻有效实测时用实测范围；否则使用发布正文的 `indoorVpdFallbackKpa` 区间（典型室内范围，明确标为 estimate），不使用未准入的室外→室内模型，也不把室外 VPD 当室内。
- 夜间 q=0 时叶片项为 0，只剩基质蒸发项；夜间蒸腾未建模（低估方向，已记录）。
- 超出发布声明的 `validPpfd`／`validVpdKpa` 的时段为缺段，不钳制。
- `CultivationRetention` 使用发布正文的 `cultivationRetention` 不确定区间（盆器/基质相对参考的未知差异），不默认 1；`PersonalCalibration` 使用合同允许的中性值 `[1,1]`（个体校准策略仍 pending，未形成有效周期前不学习）。

### 2a. 植物位置光照：单通道比例法（用户 2026-10-08 选定）

```text
PPFD_测量  = Lux × [1/luxPerPpfd.max, 1/luxPerPpfd.min] × (1 ± luxUncertainty[来源])
比例 r     = PPFD_测量 ÷ (GHI_测量时段 × 室外 PPFD 换算)        （换算系数在下式中约掉）
PPFD_植物(h) = Lux 换算区间 × GHI(h) ÷ GHI_测量时段
```

- GHI 取 Open-Meteo 标准化序列中**包含测量时刻**的时段平均（优先 15 分钟，否则 1 小时），明确为近似，不冒充瞬时值。
- 测量时段 GHI 低于 `luxAnchorMinGhiWm2`（天色太暗，比例不可信）或推出的植物 PPFD 高于室外 PPFD（读数不合理）时，锚点不可用，植物位置光照为缺证据。
- Lux 读数早于 `luxAnchorMaxAgeDays` 天视为过期，不再使用；植物换位置后由前端重新测量。
- Lux 已包含玻璃、距离和遮挡效应，不再叠加玻璃衰减；朝向保存但单通道法不使用（已知局限：东西向窗户的上下午直射差异被平均掉）。
- 缺 GHI 的时段为缺段；GHI 为有效零（夜间）时植物 PPFD 为 0。
- 室内实测温湿度只用于测量后 24 小时内的时段，其余时段用兜底区间。

## 3. 盆土观察映射

输入为四态之一 `wet | moist | dry | uncertain`（`care.soil_evidence.states` 硬规则）＋观察范围 `surface | root_zone`＋观察时刻＋来源可靠性。有效期 = 观察时刻 + `soilEvidenceTtlHours`。

| 观察 | 安全门状态 | 是否达到目标 | 观察时刻的剩余干燥量 |
|---|---|---|---|
| wet | `wet`（暂停浇水） | 否 | `remainingFraction.wet × 基线` |
| moist | `unknown` | 否 | `remainingFraction.moist × 基线` |
| dry，且观察范围满足该植物触发条件 | `target_dry` | 是 | `[0,0]` |
| dry，但触发条件需要根区而只看了表土 | `unknown` | 否 | `remainingFraction.surfaceDryOnly × 基线` |
| uncertain | 无证据（`null`） | — | 不生成 |

触发条件对观察范围的要求：`SURFACE_DRY`、`TIER_DEFAULT`、`KEEP_WET`、`KEEP_MOIST`、`DROUGHT_SIGNAL` 接受表土；`DRY_WET`、`FULL_DRY`、`VERY_DRY` 需要根区（例如指插 3～5cm 或竹签）。干态对 `KEEP_WET`/`KEEP_MOIST` 植物表示已超过目标，同样为“可以浇水”。

## 4. 浇水量（独立分支）

只在最终行动为“可以浇水”、实际内盆几何已确认且有排水孔时计算：

```text
V        = 内盆截锥在“盆高 − 留空高度 headspaceCm”处的装土体积   （mL，区间来自留空区间）
CC, AW   = 所选材料容器持水量、易利用水的区间并集（未知配比时，任意配比的混合值落在各组分最小与最大之间）
d        = 该触发条件下浇水前已消耗的易利用水比例 depletion[trigger]
净补水 N = [Vmin × dmin × AWmin, Vmax × dmax × AWmax]
建议浇入 = [Nmin / (1 − LFmin), Nmax / (1 − LFmax)]，四舍五入到 10 mL
上限     = 不超过 Vmax × CCmax / (1 − LFmax)
```

- `LF` 为发布正文的排出比例（浇到盆底少量出水）。无排水孔、排水未知或几何缺失时不给水量，返回对应缺证据；不以盆容积百分比兜底。
- 未选择材料时不给水量（缺 `substrate_materials`）。材料按集合处理：重复选择不改变结果；列表中的 `null`／`undefined` 空洞跳过，只剩空洞时视为未选择。
- 策略物性须满足易利用水上限不超过容器持水量下限（易利用水是持水量的一部分），否则拒绝该策略。

## 5. 日期

- 有可靠盆土观察：从观察时刻起按第 2 节逐时积分，求剩余量耗尽的最早／最晚时刻（快慢包络），即检查盆土窗口；提前检查直接取窗口最早端，不再叠加固定比例。
- 无观察但有已确认实际浇水时刻：从该时刻按同一积分求进度与窗口。
- 两者都没有：`insufficient_evidence`，提示检查盆土；不以今天或零进度补起点。
- 环境预报覆盖不足时窗口端点保持空值（开放结束），新数据到达后重算；不外推。

## 6. 输出

- 复用 `projectWateringReplayResult` 的安全裁决顺序；有活动发布时以 `candidate` 作为公开结果，`confidence` 固定 `low`，说明文字改为“依据通用文献参数估算”。
- 无活动发布、发布非法或未生效：`temporarily_unavailable`。
- 结果、输入快照、策略版本与摘要写入既有临时/长期结果存储，算法升级追加新结果。

## 7. 验证

L1 `unit_fake`：独立手算 Expected（映射表、截锥体积、N 与浇入量区间、需求公式）。L3 `unit_fake`：基线＋光照/VPD 区间＋盆土＋盆器→最终结果。策略读取另做真实隔离 MySQL 读回。真实 Provider、HTTP 与部署分别验收。未覆盖：真实植物精度（无本地标定，已由用户接受为后续优化）。
