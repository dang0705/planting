# 奖励事件合同

```text
user_plant.profile_completed.v1
care.soil_check_completed.v1
care.fertilizing_check_completed.v1
diagnosis.fixed_package_completed.v1
knowledge.contribution_released.v1
```

生产域只声明业务行为已完成，不携带奖励点数；`subscription` 根据事件发生时间和生效策略计算奖励。

事件至少包含：事件 ID、类型、版本、生产域、用户引用、可选用户植物引用、聚合引用、发生引用、发生时间、载荷和载荷哈希。

投递语义为至少一次；通过 inbox 唯一键和业务唯一键保证不重复。

