# 统一养护能力输出合同

- 合同版本：`care-capability-result/v1`
- 所有者：`care`
- 适用能力：`watering`、`fertilizing`、`lighting`、`ventilation`。

适用于浇水、施肥、光照和通风。

所有能力的输入必须先遵循 `care-environment-foundation/v2`：原子环境事实形成不可变输入快照，再由版本化算法生成派生环境指标。能力实现不得直接改写观察事实，也不得绕过来源范围和新鲜度校验读取供应商原始载荷。

```ts
/**
 * 统一养护能力结果外壳。
 * 内部算法可以变化，但同一合同版本不得删除字段、改变单位或改变枚举语义。
 */
type CareCapabilityResult = {
  /** 能力类型：浇水、施肥、光照或通风。 */
  capabilityType: 'watering' | 'fertilizing' | 'lighting' | 'ventilation';
  /** 对外合同版本。 */
  contractVersion: 'care-capability-result/v1';
  /** 当前结论状态。 */
  status: 'ready' | 'insufficient_evidence' | 'temporarily_unavailable';
  /** 可信程度，不允许伪造精确分数。 */
  confidence: 'low' | 'medium' | 'high';
  /** 参与结论的证据摘要。 */
  evidenceSummary: string[];
  /** 用户可执行的建议动作。 */
  recommendedActions: string[];
  /** 结果生成时间。 */
  generatedAt: string;
  /** 结果有效截止时间。 */
  validUntil: string | null;
  /** 能力详情结构版本；算法变化不能静默改变 details。 */
  detailsSchemaVersion: string;
  /** 能力专属字段，随新合同版本演进。 */
  details: Record<string, unknown>;
};
```

光照必须使用版本化的 DNI/DHI/GHI → 太阳几何 → 窗面 Direct/Diffuse → 室内传播 → PPFD/DLI 证据；朝向名称不能直接决定直射。通风必须使用室内空气交换、空间开放度、局部风源和直吹风险，不能把室外风速直接等同为室内通风。

浇水必须遵循 `watering-decision-model/v1`：已审核 BaselinePolicy + GrowthActivityState 选择基线；DLI/Air VPD/AirMovement 形成 EnvironmentDemand；盆器/基质/排水/栽培方式形成 CultivationRetention；真实干湿循环只做 PersonalCalibration；从最近实际浇水 Fact 累计 DryProgress；最终由当前 Soil Safety Gate 决策。固定天数、`indoorEqHours` 或旧 `dryDownFactor` 都不能直接变成浇水命令。

## 稳定边界

- 同一 `contractVersion` 不得删除字段、改变单位、改变枚举语义或把缺证据伪装成低置信度结论。
- `evidenceSummary` 只返回脱敏摘要，不暴露供应商原文、模型输入、图片地址或内部规则权重。
- `recommendedActions` 是建议，不直接创建事实、计划或提醒。
- `status=insufficient_evidence` 时必须明确缺少哪类用户可补充证据；不得返回猜测性养护结论。
- 算法新增输入或内部评分不要求升级外壳版本；只要 `details` 形状变化，就必须升级 `detailsSchemaVersion` 并保留旧读者兼容。

## 能力专属 details 最低语义

| 能力 | 最低稳定语义 | 明确禁止 |
|---|---|---|
| `watering` | 当前 Soil Evidence、DryProgress 所在窗口、是否建议浇水/检查、建议复查时间、证据有效期 | 只凭固定天数、旧 indoorEqHours 或理论预测直接要求浇水 |
| `fertilizing` | 是否处于可施肥窗口、植物状态禁忌、建议复查时间 | 把施肥计划当成已施肥事实 |
| `lighting` | 当前光照区间、植物需求区间、天气/环境证据和调整方向 | 仅用室外天气推断室内实际光照 |
| `ventilation` | 空气交换、空间开放度、局部风源、直吹风险和调整方向 | 把室外风速直接等同室内通风 |

Ephemeral 模式可用于游客或已登录用户主动临时使用，但不创建用户植物、事实或计划；只有用户显式创建/选择目标植物并完成对应 Guest Claim 或 Authenticated Ephemeral Promotion，结果才获得长期归属解释。
