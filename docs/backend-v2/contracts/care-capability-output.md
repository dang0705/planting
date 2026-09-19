# 统一养护能力输出合同

适用于浇水、施肥、光照和通风。

```ts
/**
 * 统一养护能力结果外壳。
 * 内部算法可以变化，但同一合同版本不得删除字段、改变单位或改变枚举语义。
 */
type CareCapabilityResult = {
  /** 能力类型：浇水、施肥、光照或通风。 */
  capabilityType: string;
  /** 对外合同版本。 */
  contractVersion: string;
  /** 当前结论状态。 */
  status: string;
  /** 可信程度，不允许伪造精确分数。 */
  confidence: string;
  /** 参与结论的证据摘要。 */
  evidenceSummary: string[];
  /** 用户可执行的建议动作。 */
  recommendedActions: string[];
  /** 结果生成时间。 */
  generatedAt: string;
  /** 结果有效截止时间。 */
  validUntil: string | null;
  /** 能力专属字段，随新合同版本演进。 */
  details: Record<string, unknown>;
};
```

光照必须使用用户环境、植物需求和天气光照证据；通风必须使用室内空气交换、空间开放度、局部风源和直吹风险，不能把室外风速直接等同为室内通风。

