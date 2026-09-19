# 后端基础设施架构实施说明

## 六个 HTTP 云函数

| 函数 | 唯一职责 |
|---|---|
| `identity` | Principal、统一用户、平台绑定与 session |
| `plant-knowledge` | 分类、产品身份、识别、CMS、展示百科和内部知识 |
| `user-plant` | 用户植物聚合、档案、生命周期、资产和时间线 |
| `care` | 事实、盆土证据、天气、浇水、施肥、光照、通风、计划和提醒 |
| `diagnosis` | 固定/动态题包、证据、结果和建议 |
| `subscription` | 试用、会员、支付、积分、等级、兑换、AI 额度和奖励入账 |

小青继续使用 CloudBase Agent，不新增第七个函数。

## 请求固定流程

```text
请求大小/类型限制
→ 主体解析
→ user_id 解析
→ user_plant_id 归属校验
→ DTO/AJV 校验
→ 用例编排
→ 领域规则
→ Repository/事务
→ 脱敏响应、结构化日志、审计事件
```

## 依赖方向

```text
identity Principal
→ subscription CapabilitySnapshot
→ 业务域
```

领域函数不得导入其他领域函数源码，只能依赖冻结合同和无业务规则的 foundation。

## 奖励事件基础设施

只有奖励事实使用本域 outbox → `subscription` inbox；它不是全项目消息总线。

生产域独占：

- `user_plant_outbox_events`
- `care_outbox_events`
- `diagnosis_outbox_events`
- `knowledge_outbox_events`

`subscription` 独占 `reward_event_inbox`、积分账本、等级和 AI 额度账本。

