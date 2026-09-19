# 状态机实施入口

DDL、DTO、领域代码和测试必须引用同一份状态定义。

重点状态：

- 用户植物：`active / archived / deleting / deleted`。
- 身份：`unidentified / candidate_pending / confirmed`。
- 游客会话：`active / completed / failed / expired / claimed`。
- CMS 补全：`aggregating / queued / leased / generating / validating / draft_ready / review_pending / approved / released`。
- 积分兑换：`requested / committed / rejected / reversed`。
- AI 预占：`reserved / settled / released / pending_reconciliation`。
- 奖励事件：`received / applied / rejected`。

每个转换必须记录发起者、前置条件、幂等键、事务边界、审计、可重试性和失败返回。

