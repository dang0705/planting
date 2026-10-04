# 浇水等效干燥进度决策合同

- 合同版本：`watering-decision-model/v1`
- 所有者：`care`
- 上游：`care-environment-foundation/v2`、已审核 Internal Care Knowledge、Plant Facts、Soil Evidence
- 输出：`care-capability-result/v1`

## 1. 定位

本合同冻结浇水模型的**职责、依赖、顺序和回放边界**，不冻结尚未通过影子数据校准的倍率值。

浇水不是“第 N 天自动浇水”的日历模型，而是：

```text
植物基线决定需要多少标准干燥进度
→ 环境决定每天推进多快
→ 栽培系统决定水保存多久
→ 历史真实干湿循环只校准模型残差
→ 当前盆土证据拥有最终否决权
```

## 2. 基线

```ts
type BaselinePolicy = {
  policyVersion: string
  waterFrequencyTier: string
  triggerState: string
  minDryUnits: number
  maxDryUnits: number
  sourceEvidenceRefs: string[]
}
```

MVP 可由当前 `watering_baseline_policy.min_days/max_days` 迁移为同数值的 `minDryUnits/maxDryUnits`，但语义改为“标准参考条件下的标准干燥单位”，不是现实自然日的硬截止日期。

## 3. GrowthActivityState

```ts
type GrowthActivityState = {
  state: 'ACTIVE' | 'SLOWED' | 'DORMANT' | 'UNKNOWN'
  confidence: 'low' | 'medium' | 'high'
  evidenceRefs: string[]
  reasoningSummary: string
  algorithmReleaseRef: string
}
```

它只负责选择条件性 baseline / trigger。禁止：

```text
低 DLI 已降低环境需求
× 低温已影响 Indoor Environment
× DORMANT 再乘一个季节系数
```

低置信度或证据冲突时回退到安全的 tier/default baseline。

## 4. 环境需求

一级输入只保留：

- DLI；
- `PlantVpdRatio = IndoorAirVpd / PlantVpdAnchor`，植物锚点不存在时走显式 fallback；
- AirMovement proxy。

```text
EnvironmentDemand(d)
= bounded(
    LightFactor(DLI_d)
    × VpdFactor(PlantVpdRatio_d)
    × AirMovementFactor(AirProxy_d)
  )
```

`Factor` 的敏感度和上下限是版本化产品模型参数，不是自然科学常数；未冻结时不得猜值。

禁止再次把温度、RH、朝向、peakPPFD、directDuration 等作为重复乘数。它们可服务其他风险模型，但浇水不得重复计权。

## 5. 栽培系统

```ts
type CultivationRetention = {
  value: number
  confidence: 'low' | 'medium' | 'high'
  evidenceRefs: string[]
  algorithmReleaseRef: string
}
```

输入包含：实际种植内盆材质、盆器几何/有效基质体积、排水模式、基质、栽培方式。

硬语义：

- 盆材质影响盆壁蒸发/整体干燥，不直接修改植物蒸腾。
- `NO_DRAINAGE` 是安全条件，不只是普通倍率。
- 基质 retention/drainage/aeration 是先验估计，不能表述成用户盆土真实物理测量值。
- 陶粒垫底不得自动获得“提高排水”的奖励。

植物级 cultivation reference 只有在对应结构化性状完成来源审核和 release 后才允许启用；当前数据不足时使用明确 fallback，不伪造 `substrate_preference`。

## 6. 个体校准

`PersonalCalibration` 只观察模型预测与真实目标干燥状态之间的历史残差，不重新消费 DLI、VPD、盆器或基质。

```text
HistoryFactor(j) = Bmid / U_observed(j)
PersonalCalibration = bounded robust median(recent valid cycles)
```

只有高质量干湿循环进入校准。换盆、换基质、明显换位置等导致系统发生结构变化时，旧校准必须失效或降权。

## 7. DryUnit / DryProgress

```text
DryUnit(d)
= EnvironmentDemand(d)
× PersonalCalibration
÷ CultivationRetention

DryProgress(now)
= 从最近一次已确认实际浇水 Plant Fact 开始
  Σ DryUnit(d)
```

只有实际浇水事实重置 `DryProgress=0`。Proposal、Plan、Reminder、Notification 均不能重置。

## 8. 当前 Soil Safety Gate

当前可信证据优先级高于模型预测。

| 当前证据 | 周期位置 | 行为 |
|---|---|---|
| 明确偏湿/积水 | 任意 | 暂停浇水 |
| 已可靠达到该植物目标干燥状态 | 即使未到 Bmin | 允许浇水，并记录模型可能低估干燥速度 |
| 未达到目标干燥状态 | 即使超过 Bmax | 不自动浇水，要求复查 |
| 无可靠当前证据，DryProgress < Bmin | 偏早 | 暂不浇，之后检查 |
| 无可靠当前证据，位于窗口 | 到窗口 | 现在检查盆土 |
| 无可靠当前证据，超过 Bmax | 超窗 | 优先检查，但不自动认定缺水 |

视觉“土表偏湿/偏干”只能表达其可见范围，不能冒充根区长期状态。

## 9. 输出与回放

每次结果必须能回放：

```text
plant identity / knowledge release
→ baseline policy
→ GrowthActivityState + evidence refs
→ environment snapshot
→ DLI / Indoor VPD / AirMovement derivations
→ CultivationRetention
→ PersonalCalibration source cycles
→ DryUnit series / DryProgress
→ Soil Evidence
→ Soil Gate decision
→ Watering Proposal
```

不保存模型思维链，只保存结构化证据、版本、结果和简短可审计解释。

## 10. Persistent 与 Ephemeral 持久化

Persistent 用户植物可把环境/栽培派生写入 `care_environment_derivations`，把 GrowthActivity、PersonalCalibration、DryProgress 写入 `care_decision_derivations`，两者都绑定同一 Environment Snapshot。

Ephemeral 不创建长期派生记录；同语义输入、派生、release 和 Soil Gate 结果嵌入 `temporary_care_results`，用于有效期内回放。后续显式绑定只增加归属，不把临时建议改写成 Fact、Plan 或“当时已经发生”的行为。
