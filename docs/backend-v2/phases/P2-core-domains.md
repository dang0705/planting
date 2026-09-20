# P2 核心领域实现

- **局部门禁，不阻断 P2 其他领域**：P1 人工裁决已经冻结为 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`。当前只允许 106 条进入本地、未激活 seed；4 条待转换记录必须重建 canonical、稳定 ID、`identity_level`、父链和证据哈希并复核后才能把 `seedEligible` 提升到 110。active release 仍为 `STOP`，因此 `plant-knowledge` 的正式发布、百科补全和依赖 active taxonomy 的对外读取保持停止；`identity`、`subscription`、`user-plant`、`foundation` 以及不依赖 active release 的 Repository、事务、幂等与隔离读继续并行推进。

- `identity_terra`：Principal、统一用户、平台身份。
- `subscription_terra`：权益、试用、会员、积分、等级、兑换、AI 额度和奖励 inbox。
- `knowledge_terra`：分类、产品身份、证据、CMS 和 release。
- `user_plant_terra`：用户植物、档案、生命周期、环境、资产和时间线。
- `foundation_terra`：共享 HTTP 请求链、DTO/AJV、Repository 事务边界、幂等键、可靠事件 outbox、公开响应脱敏和可观测性基础设施。

禁止跨域 SQL、复制 Capability 规则、业务域直接写积分/AI 余额，以及使用旧 JavaScript 实现新业务。
