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
- （v1/v2）`CultivationRetention` 使用发布正文的 `cultivationRetention` 不确定区间（盆器/基质相对参考的未知差异），不默认 1；**v3 起改由实测盆与基质推导，见第 8 节**；`PersonalCalibration` 使用合同允许的中性值 `[1,1]`（个体校准策略仍 pending，未形成有效周期前不学习）。

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

触发条件先归入四个湿度分组（`resolveMvpMoistureGroup`），再由分组决定观察范围要求：

| 触发语义 trigger | 湿度分组 | 观察范围要求 |
|---|---|---|
| `KEEP_WET`、`KEEP_MOIST` | `keep_moist` | 接受表土 |
| `SURFACE_DRY` | `surface_dry` | 接受表土 |
| `DRY_WET` | `dry_wet` | 需要根区 |
| `FULL_DRY`、`VERY_DRY`、`DROUGHT_SIGNAL` | `full_dry`（必须干透） | 需要根区 |
| `TIER_DEFAULT` | 按来源 tier：`constant_moisture`→`keep_moist`、`regular`→`surface_dry`、`occasional`→`dry_wet`、`drought_tolerant`→`full_dry` | “常湿”“常规”两级接受表土；“偶尔浇水”“耐旱”两级需要根区 |

根区观察例如指插 3～5cm 或竹签。干态对 `keep_moist` 分组植物表示已超过目标，同样为“可以浇水”。未知 tier 或 trigger 直接拒绝，不落入隐式默认分组。

> **修订 2026-10-09**：Camunda 建模核对发现本节与代码不一致，用户裁决以代码为准、修改合同。旧表述为：“触发条件对观察范围的要求：`SURFACE_DRY`、`TIER_DEFAULT`、`KEEP_WET`、`KEEP_MOIST`、`DROUGHT_SIGNAL` 接受表土；`DRY_WET`、`FULL_DRY`、`VERY_DRY` 需要根区（例如指插 3～5cm 或竹签）。干态对 `KEEP_WET`/`KEEP_MOIST` 植物表示已超过目标，同样为“可以浇水”。” 变化：`DROUGHT_SIGNAL` 改归“必须干透”（需要根区）；`TIER_DEFAULT` 不再一律接受表土，而是按来源分级，“偶尔浇水”“耐旱”两级需要根区。

### 3a. 盆土证据有效期（`care-watering-mvp/v2`，用户 2026-10-09 裁决 U6）

v1 的固定 `soilEvidenceTtlHours` 被视为缺陷；v2 正文以 `soilEvidenceFallbackHours`（24）与 `soilEvidenceMaxHours`（72）替代，其余数值与 v1 相同（`mvp-watering-policy-release.v2.json`）：

- 湿、微湿：以最快干燥速率消耗「(该状态剩余比例上界 − 下界) × 基线下端」所需时间，从观察时刻沿同一组干燥时段积分；推不出（缺光照/环境段，或时段不从观察时刻连续覆盖）→ 观察 + 回退小时。
- 干（含仅表土干）：一直有效，直到出现晚于观察时刻的已确认浇水事实。
- 统一封顶：观察 + 封顶小时；超过即过期，结果缺盆土证据。
- 读取器同时接受 v1/v2；读到 v1 时仍按固定 TTL。长期植物与临时案例同一规则。

## 4. 浇水量（独立分支）

只在最终行动为“可以浇水”、实际内盆几何已确认且有排水孔时计算：

```text
V        = 内盆截锥在“盆高 − 留空高度 headspaceCm”处的装土体积   （mL，区间来自留空区间）
CC, AW   = 所选材料容器持水量、可用水（AW，Bilderback 2005 口径）的区间并集（未知配比时，任意配比的混合值落在各组分最小与最大之间）
d        = 该湿度分组浇水前已消耗的可用水（AW，Bilderback 2005 口径）比例 depletion[moistureGroup]（分组见第 3 节）
净补水 N = [Vmin × dmin × AWmin, Vmax × dmax × AWmax]
建议浇入 = [Nmin / (1 − LFmin), Nmax / (1 − LFmax)]，四舍五入到 10 mL
上限     = 不超过 Vmax × CCmax / (1 − LFmax)
```

- `LF` 为发布正文的排出比例（浇到盆底少量出水）。无排水孔、排水未知或几何缺失时不给水量，返回对应缺证据；不以盆容积百分比兜底。
- 未选择材料时不给水量（缺 `substrate_materials`）。材料按集合处理：重复选择不改变结果；列表中的 `null`／`undefined` 空洞跳过，只剩空洞时视为未选择。
- 策略物性须满足可用水（AW，Bilderback 2005 口径）上限不超过容器持水量下限（可用水（AW，Bilderback 2005 口径）是持水量的一部分），否则拒绝该策略。
- 消耗比例按湿度分组查：发布正文的 `depletion` 以 `keep_moist`、`surface_dry`、`dry_wet`、`full_dry` 四个分组为键（`estimateMvpWaterAmount` 使用 `depletion[group]`）。

> **修订 2026-10-09**：Camunda 建模核对发现本节与代码不一致，用户裁决以代码为准、修改合同。旧表述为：“d = 该触发条件下浇水前已消耗的可用水（AW，Bilderback 2005 口径）比例 depletion[trigger]”。变化：消耗比例不按触发语义查，改为按第 3 节的湿度分组查；数值与已发布 v1/v2 正文一致，未改动。

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

## 8. 盆型与基质参与干湿循环（`care-watering-mvp/v3`，用户 2026-10-10 审定）

> **状态：核心模型已审定（2026-10-10）**：参考盆、参考可用水（AW，Bilderback 2005 口径）、植物伸缩指数 b、盆体积与土表面积几何关系、混合基质主要材料规则、缺基质兜底、环境缺段 ≤6 小时补齐。**盆壁材质（κ、`wallMaterial`、织物盆）待验证**：用户要求经严格验证、开票并实现后才能进入模型，验证票 ClickUp `z8v0kmvewm`；验证通过前源码、DTO 与发布正文均不得出现 κ 或 `wallMaterial`。v1/v2 已发布行为不变。发布正文：`mvp-watering-policy-release.v3.json`（取值依据 `.v3.md`）。测试：`test/care/watering/pot-substrate-drying.spec.ts`、`drying-gap-fill.spec.ts`、`mvp-water-amount.spec.ts`、`watering-advice-request.spec.ts`、`mvp-watering-policy.spec.ts`；证据：`.codex/backend-v2/evidence/E06-pot-substrate-drying-design-2026-10-10.json`。

### 8.1 问题

v1/v2 的 `cultivationRetention` 是固定区间 0.8～1.25，与盆的大小、形状、排水孔和基质都无关；盆和基质只进入盆器安全门与浇水量。结果：12cm 盆配颗粒土与 20cm 盆配泥炭得到相同的检查窗口，与园艺常识和文献方向都不符。

### 8.2 物理模型（一句话版）

```text
干完一轮所需时间  ∝  这盆土能给出的可用水量  ÷  这盆每天的失水速度
```

- **可用水量（存量）** = 装土体积 × 基质可用水（AW，Bilderback 2005 口径）比例 AW（与第 4 节水量估算同一口径、同一物性表、同一混合规则 8.10）。
- **口径说明**：本节（及第 4 节、发布正文 `availableWater`、`referenceAvailableWater`）的 AW 是 Bilderback 2005 口径的「可用水」＝容器持水量 CC − 1500 kPa 吸力下的残留含水（θ1500kPa），即植物理论上能吸走的全部水；**不是** De Boodt 口径的「易利用水 EAW」（吸力 1→5 kPa 之间释放的水，只是 AW 中最容易吸的一部分，数值更小）。两种口径不可混用：`depletion[分组]` 的消耗比例也按 AW 口径解释（文献调研 §0、§2、§9）。
- **失水速度（需求）** = 植物蒸腾（随植物大小）＋ 盆土表面蒸发（随土表面积）。盆壁蒸发（只有透气材质）**未纳入**，待验证票 `z8v0kmvewm`。
- 基线 `[min,max]` 等效单位定义在**参考盆**下（8.3）。实际盆相对参考盆的「存量比」与「需求比」决定窗口相对基线伸缩多少。浇水前要消耗的可用水（AW，Bilderback 2005 口径）比例 `depletion[分组]` 对同一植物在两边相同，比值中约掉，不再重复乘。

### 8.3 参考盆（基线的量纲锚点，已审定）

| 字段 | 值 | 含义 |
|---|---|---|
| `referencePot` | 盆口内径 15、盆底内径 11、内深 13（cm），不透气、有排水孔 | 约 1.7 L 的常见 15cm 塑料盆；文献调研 §8 用 15cm/1.5～2 L 核对过 5～14 天周期量级 |
| `referenceAvailableWater` | 0.30（点值） | 参考基质（泥炭类）可用水（AW，Bilderback 2005 口径）比例，取已发布泥炭物性 0.25～0.35 的中点。它是**定义锚点**而非测量不确定性，故用点值，避免同一不确定性在分子分母各算一次而虚假放大 |

### 8.4 逐项推导（全部区间算术，不取中值）

对留空高度 `headspaceCm` 的两个端点 s 分别计算，实际盆与参考盆用**同一个 s**（同一用户装土习惯），再取包络：

```text
f = H − s，f_ref = H_ref − s                                  （装土高度）
R_f = r + (R − r) × f / H                                     （装土面半径，半径按盆高线性插值）
V(s)      = π f (R_f² + R_f r + r²) / 3                         （装土体积，与第 4 节一致）
A_top(s)  = π R_f²                                             （蒸发面：土表面积）

体积比   v(s) = V(s) / V_ref(s)
存量比   S    = [ min_s v × AW_min / AW_ref ,  max_s v × AW_max / AW_ref ]
植物比   P    = 包络{ v^b ：v ∈ {min_s v, max_s v}，b ∈ plantDemandVolumeExponent }
蒸发面比 Ae   = [ min_s A_top / A_top_ref ,  max_s A_top / A_top_ref ]
```

- `AW_min/AW_max`：所选材料的可用水（AW，Bilderback 2005 口径）按 8.10 混合规则得到的区间。
- `b`（`plantDemandVolumeExponent` = [0, 0.52]，已审定）：植物蒸腾随盆大小的伸缩指数。b=0 表示“刚换大盆、植物还没长大”；b=0.52 来自 Poorter et al. 2012 荟萃分析“盆容积翻倍、生物量平均 +43%”（log₂1.43≈0.52）。拿不到植物大小，两端都保留。
- **盆壁蒸发（待验证，未启用）**：候选形式为 `Ae = (A_top + κ × A_wall) / A_top_ref`，其中 `A_wall = π (R_f + r) × √(f² + (R_f − r)²)`；塑料/釉面 κ=0，素烧陶候选 κ∈[0.4, 0.8]（Suh 1977 推导，低置信），未知取并集。验证方法与门禁见 ClickUp `z8v0kmvewm`；当前所有盆按不透气盆壁计算（已知局限：素烧陶盆的窗口可能偏晚）。

### 8.5 写入干燥积分（复用既有 `DryingInterval`，不改积分内核）

```text
Demand_pot = w × Leaf × P + (1 − w) × E_soil × Ae               （逐时段，区间端点同向相乘）
cultivationRetention = S                                       （DryingInterval 字段；保水倍率的含义收窄为「存量比」）
rate = Demand_pot × PersonalCalibration / S                     （replay-dry-progress 原式不变）
```

- 需求比按分量乘：植物比只乘叶片项，蒸发面比只乘基质蒸发项。夜间叶片项为 0 时只剩蒸发项。
- 参考盆、泥炭：v=1、P=1、Ae=1，S=[0.833,1.167]（参考泥炭物性本身的区间），不再额外叠加 0.8～1.25。
- 已知局限（不建模，已记录方向）：① 盆越高、盆底滞水层占比越小，容器持水量越低（Owen & Altland 2008：盆高 3.8→15.2cm 时 CC 降 20%～42%），深盆存量可能被高估；② 表土变干后形成“蒸发屏障”，土表蒸发并非恒速（Schabauer 2026）；③ 根系占据体积未扣除；④ 盆壁材质未建模（见 8.4）。

### 8.6 缺证据时的行为

| 情形 | 存量比 S | 需求比 P / Ae | 说明 |
|---|---|---|---|
| 实际内盆未确认，或三项尺寸缺任一 | 兜底（同下行，仅供内部积分） | P=1，Ae=1 | 维持既有安全裁决顺序：盆器安全门 `insufficient_evidence` → 公开结果 `insufficient_evidence`，不公开检查窗口（v2 现状即如此） |
| 盆高不大于留空上限（装不了土） | 兜底 | P=1，Ae=1 | 视同几何不可推导；不猜装土高度 |
| 几何齐备但未选基质材料 | 发布正文 `cultivationRetention` 0.8～1.25（v3 中语义收窄为“缺基质证据时的兜底存量比”，已确认保留） | P=1，Ae=1 | 缺持水依据时不默认存量比为 1；不跨材料猜 AW；提示补选基质 |
| 排水孔明确没有（`drainageAvailable=false`）或未知（`null`） | 按 8.4 | 按 8.4 | 公开结果维持既有安全裁决顺序：排水明确无效 → `review_drainage`，排水未知 → `insufficient_evidence`，都不公开检查窗口、不给水量。“无孔盆存量上端无界”规则仍 pending（`care.watering.no_drainage_drying_upper_bound`），未实现 |

### 8.7 输入合同变化

- `watering-advice` 请求新增可选字段 `primarySubstrateMaterial`：九类材料代码之一或 `null`；必须属于 `substrateMaterials`，否则 `VALIDATION_FAILED`（含未选材料却标主要材料）。内部命令字段 `primaryMaterial`，未标为 `null`。输入清单只在已标时写入 `primaryMaterial`，未标请求的清单与哈希不变。
- **不新增** `wallMaterial`（待验证票 `z8v0kmvewm`）。
- 发布正文 v3 新增字段：`referencePot`、`referenceAvailableWater`、`plantDemandVolumeExponent`；`cultivationRetention` 保留字段名，语义收窄为兜底存量比；混入 `porousWallEvaporationRatio` 等未验证字段的正文一律非法。其余字段与 v2 相同。读取器接受 v1/v2/v3，并保持 v1/v2 旧语义：v1/v2 不按盆伸缩、不补缺段、忽略主要材料。

### 8.8 对浇水建议结果的影响示例（参考环境：PPFD 50、VPD 1.4，即 Leaf=E_soil=1；植物“表土干再浇”，基线 5～8）

| 盆与基质 | 存量比 S | 需求比 D | 浇透后到该检查（天） | 根区微湿观察后检查窗口（天） |
|---|---|---|---|---|
| v2 现状（任何盆） | 0.8～1.25（固定） | 1 | 4.0～10.0 | 1.0～6.0 |
| 参考盆 15cm＋泥炭 | 0.83～1.17 | 1.00 | 4.2～9.3 | 1.04～5.6 |
| 12cm＋泥炭 | 0.43～0.63 | 0.69～0.93 | 2.3～7.3 | 0.58～4.37 |
| 12cm＋颗粒土 | 0.16～0.56 | 0.69～0.93 | 0.8～6.5 | 0.21～3.87 |
| 20cm＋泥炭 | 2.15～3.25 | 1.16～1.73 | 6.2～22.4 | 1.55～13.44 |
| 16cm 泥炭＋珍珠岩，未标主要材料 | 0.34～1.50 | 1.03～1.14 | 1.5～11.7 | 0.37～7.01 |
| 16cm 泥炭＋珍珠岩，主要材料泥炭 | 0.69～1.50 | 1.03～1.14 | 3.0～11.7 | 0.76～7.01 |

（12cm 盆按 12/9/11cm，16cm 按 16/12/14cm，20cm 按 20/15/18cm；数值为独立手算，见证据文件。盆壁材质未纳入。）

### 8.9 验证

L1 `unit_fake`：v3 正文 Schema 与物理约束、主要材料混合规则（水量分支）、DTO 校验。L3 `unit_fake`：`assessMvpWatering` 端到端窗口（参考盆恒等、体积/基质方向、缺证据分支、主要材料、缺段补齐、v2 语义不变）。MySQL 读取器 v3 版本准入为 `unit_fake`。未覆盖：真实隔离 MySQL 读回与发布（主代理执行）、HTTP 端到端、真实盆栽精度（无本地标定，用户已接受为后续优化）、盆壁材质（验证票）。

### 8.10 混合基质「主要材料」规则（用户 2026-10-10 审定）

用户可在所选材料中标一个**主要材料**，含义：**体积占一半及以上**（前端文案建议“占一半以上的材料”）。配比仍未知，按体积线性混合近似：

```text
未标主要材料：  AW = [ min_i AW_i.min ,  max_i AW_i.max ]                       （各组分并集，与 v2 相同）
标了主要材料 p： O_min = min_{i≠p} AW_i.min，O_max = max_{i≠p} AW_i.max
                AW = [ min(AW_p.min, ½AW_p.min + ½O_min) ,  max(AW_p.max, ½AW_p.max + ½O_max) ]
```

- 解释：主材料占比 f∈[½, 1]，混合值是 f×主材料 + (1−f)×其余的线性组合；最极端情况出现在 f=1（纯主材料）或 f=½ 且其余全是最极端组分，所以结果 = 主材料区间 ∪「主材料与最极端其余组分对半混合」区间。
- 只选一种材料时，主要材料就是它，结果与未标相同。
- 同一规则用于水量分支的可用水（AW，Bilderback 2005 口径）与容器持水量上限（第 4 节），干燥存量与浇水量对同一选择作同一解释。
- 局限：细颗粒填入粗颗粒孔隙时混合不线性（Bilderback 2005：细砂填充树皮孔隙），已记录。

### 8.11 环境数据缺段补齐（用户 2026-10-10 审定，v3 起生效）

- **缺段**：两个有效时段之间的时间空洞，包括时段缺失，以及 PPFD 缺失或 PPFD/VPD 超出有效域而被丢弃的时段（连续的合并计算总时长）。
- 总时长 **≤ 6 小时**（`MVP_DRYING_GAP_FILL_MAX_HOURS`，目录 `care.watering.drying_gap_fill_max_hours`，hard_rule）：用该段的**保守全区间需求**补上——即发布有效域（`validPpfd`、`validVpdKpa`）上需求公式的最低～最高包络（含 8.5 的盆倍率）。最低端取 PPFD 下限、VPD 下限，最高端取 PPFD 上限与 H(D) 峰值。窗口变宽但不中断。
- 总时长 **> 6 小时**：保持空洞，按既有规则无结论（历史缺口 → `history_gap`；未来缺口 → 覆盖终点，窗口端点开放或缺失）。
- 不补：第一个有效时段之前（起点前导缺口）与最后一个有效时段之后（预报覆盖终点）。
- v1/v2 不补缺段（保持已发布语义可复算）。
- 定为 hard_rule 的理由：它是“证据连续到什么程度才允许下结论”的准入边界，与 Open-Meteo 逐小时粒度绑定，不是需要按发布调参的业务数值；放进策略正文会让每次发布都可能悄悄改变安全边界。调整须同步本节、目录与锁定测试。
