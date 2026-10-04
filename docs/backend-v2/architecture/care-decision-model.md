# Care 最新决策架构

> 状态：2026-10-03 当前目标架构基线。本文描述养护计算的职责边界与数据流；具体倍率、阈值和敏感度仍须通过版本化策略与影子数据校准，不能把产品参数包装成物理常数。

## 1. 总原则

青花植养护固定遵循：

```text
先事实 → 后确定性推导 → 再受约束综合 → 最后建议
```

AI 可以承担多证据归约、解释与建议，但不能定义输入事实，也不能重新计算已有确定性物理量。展示型百科不是养护知识源；外部结构化性状只有经过来源保留、归一、审核和不可变 release 后，才能进入 Internal Care Knowledge。

```mermaid
flowchart TB
  ExternalTrait["外部结构化性状证据<br/>Tropicals 等<br/>原始来源 / 原始值 / 证据"] --> TraitReview["plant-knowledge<br/>归一 / 来源锁定 / 审核"]
  TraitReview --> InternalCare["Internal Care Knowledge<br/>不可变 release"]

  Atomic["Atomic Environment<br/>原子环境事实"] --> Snapshot["Environment Snapshot<br/>不可变输入快照"]
  Snapshot --> Deterministic["Deterministic Derivations<br/>确定性派生"]
  InternalCare --> Reference["Care Reference Profile<br/>植物级参考"]
  Deterministic --> Decision["Care Decision"]
  Reference --> Decision
  Decision --> Proposal["Care Proposal"]

  PublicEncyclopedia["展示型百科"] -. "禁止直连" .-> Decision
```

## 2. 光照：DLI 是浇水正式上游

```mermaid
flowchart TB
  Weather["DNI / DHI / GHI"] --> Solar["太阳几何<br/>经纬度 / 日期时间<br/>高度角 / 方位角"]
  Solar --> Window["窗面几何<br/>朝向 / 倾角 / AOI"]
  Weather --> Window
  Window --> WPI["Window Plane Irradiance<br/>窗面入射辐照<br/>Direct / Diffuse"]
  WPI --> Occlusion["外部遮挡 / 天空可见度"]
  Occlusion --> Transmission["玻璃 / 窗帘 / 室内遮挡 / 距离"]
  Transmission --> PPFD["PPFD(t)"]
  PPFD --> DLI["DLI<br/>日光积分"]
  PPFD --> Peak["峰值 PPFD / 直射持续时间<br/>强光风险"]
  DLI --> Watering["Watering<br/>只消费 DLI，不重算朝向"]
```

硬规则：

- 不使用固定“南窗=有直射、北窗=无直射”的业务规则；是否有直射由太阳位置、窗面几何和遮挡决定。
- Direct / Diffuse 在进入植物位置前不应过早合并。
- MVP 不把地面反射作为核心计算项。
- `indoorEqHours` 退出浇水一级依赖。

## 3. 室内空气：实测优先，估算必须明示

```mermaid
flowchart TB
  IndoorMeasured["室内 / plant-zone 实测 T/RH"] --> Select{"是否有可用实测?"}
  Outdoor["室外逐时 T/RH"] --> IndoorEstimate["Estimated Indoor Environment<br/>室内估算环境"]
  Exchange["室内外空气交换程度"] --> IndoorEstimate
  SolarHeat["房间太阳热输入"] --> IndoorEstimate
  Thermal["建筑热惯性<br/>缺失时使用已发布默认"] --> IndoorEstimate
  IndoorEstimate --> Select
  Select -->|是| IndoorTRH["Indoor T/RH + provenance"]
  IndoorMeasured --> IndoorTRH
  Select -->|否，采用估算| IndoorTRH
  IndoorTRH --> VPD["Air VPD"]
```

室外天气永远保持 `outdoor` 范围。`Estimated Indoor Environment` 是派生值，不是室内实测。

## 4. 浇水：等效干燥进度而不是日期乘法

```mermaid
flowchart TB
  Trait["已审核 Watering Trait"] --> Growth["GrowthActivityState<br/>ACTIVE / SLOWED / DORMANT / UNKNOWN<br/>confidence + evidence"]
  EnvHistory["DLI / photoperiod / Indoor T history"] --> Growth
  PlantFacts["新叶/新芽/开花 / 干湿循环事实"] --> Growth

  Growth --> Baseline["resolveBaseline()<br/>BaselinePolicy [Bmin,Bmax]<br/>只选择规则，不乘季节系数"]
  Trait --> Baseline

  DLI["DLI"] --> EnvDemand["EnvironmentDemand<br/>有界环境干燥需求"]
  VPD["Plant VPD ratio"] --> EnvDemand
  Air["AirMovement proxy"] --> EnvDemand

  Cultivation["实际种植系统<br/>盆器 / 内盆材质 / 排水 / 基质 / 栽培方式"] --> Retention["CultivationRetention"]
  Cycles["真实有效干湿循环残差"] --> Personal["PersonalCalibration<br/>只校准模型误差"]

  LastWater["最近一次已确认实际浇水 Fact"] --> DryProgress["从该事实起累计 DryProgress"]
  EnvDemand --> DryUnit["DryUnit(d) =<br/>EnvironmentDemand × PersonalCalibration<br/>÷ CultivationRetention"]
  Retention --> DryUnit
  Personal --> DryUnit
  DryUnit --> DryProgress
  Baseline --> Window["预计检查窗口<br/>DryProgress vs [Bmin,Bmax]"]
  DryProgress --> Window

  Soil["当前可靠 Soil Evidence<br/>用户检查优先 / 受控视觉辅助"] --> Gate{"Soil Safety Gate"}
  Window --> Gate
  Gate -->|WET / 未达到目标状态| Hold["暂停 / 稍后复查"]
  Gate -->|目标干燥状态已满足| Allow["允许浇水"]
  Gate -->|无可靠当前证据| Check["按 DryProgress 提示检查"]
  Hold --> Proposal["Watering Proposal"]
  Allow --> Proposal
  Check --> Proposal
```

优先级固定为：

```text
当前可靠盆土证据
> 真实干湿循环个体校准
> 环境/栽培预测
> 名义日历天数
```

最近浇水建议、提醒或 Care Plan 都不能重置 DryProgress；只有用户确认已实际浇水形成的 Care Event / Plant Fact 才能重置。

## 5. Reference Profile

Reference Profile 不再是假设所有植物共享一个“标准室内环境”。目标结构是：

```text
WateringReferenceProfile
├─ baseline trait / trigger
├─ light reference        植物级
├─ VPD anchor             植物级，来自已审核温湿度性状
├─ air movement reference 全局普通室内参考 + 有界映射
└─ cultivation reference  植物级；仅在可用性状证据通过审核后启用
```

当前 `qinghuazhi_v2_test.tropicals_trait_ref` 为空，且现有百科表没有 `substrate_preference` 字段，因此植物级 cultivation reference 的数据来源仍未完成，不能在实现或图中宣称已具备。当前可先使用已经存在且可追溯的 watering tier、温湿度、光照 tier 与 growth-season knowledge，缺失部分必须显式 fallback。

## 6. Proposal → Plan → Fact

```mermaid
flowchart LR
  Decision["Care Decision"] --> Proposal["Care Proposal<br/>建议"]
  Proposal -->|用户确认未来动作| Plan["Care Plan<br/>未来计划"]
  Plan -->|用户确认实际完成| Event["Care Event"]
  Event --> Fact["Plant Fact<br/>不可变事实"]
  Fact --> Next["下一轮计算输入"]
```

任何 AI 输出、建议、计划或通知都不能冒充事实。
