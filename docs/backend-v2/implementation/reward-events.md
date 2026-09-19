# 奖励事件可靠投递

只有积分和 AI 奖励事实使用 outbox/inbox；不建设通用消息总线。

```text
本域业务事务
→ 同事务写本域 outbox
→ dispatcher 租约领取
→ 带签名调用 subscription
→ reward_event_inbox 幂等去重
→ 积分账本/账户/等级/AI grant 同事务入账
→ 返回确认
→ outbox 标记 delivered
```

生产域只能写自己的 outbox；`subscription` 只能写 inbox、积分、等级和 AI 额度。失败可重放，重复不可重复奖励。

