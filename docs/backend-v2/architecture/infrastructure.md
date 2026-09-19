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

## 配置解析与 Provider 注册

配置治理不新增第七个云函数：

- 各领域持有自己的类型化业务策略和 active release；共享层只能机械解析、校验和缓存，不能决定业务值。
- 共享 `ProviderRegistry` 管理百度、和风、百炼、微信支付、通知、CloudBase Storage/CMS/Agent 等第三方配置；Adapter 只接受请求级 `ConfigSnapshot`。
- 配置只保存 `credential_ref`，实际密钥由 CloudBase 受控环境或凭证系统注入 Adapter。
- `endpointProfile` 必须映射到代码白名单，禁止配置任意 URL 或动态加载任意模块。
- 请求开始后锁定配置快照；业务结果记录策略和 Provider release 引用。发布失败保留最近一个已验证版本，安全敏感能力无可用版本时失败关闭。

完整合同见[业务策略与第三方 Provider 配置架构](configuration-and-providers.md)，逐项数值与状态见[业务关键变量目录](configuration-variable-catalog.md)。Provider 注册表、领域策略注册表和部署/密钥配置必须分层，禁止以一个通用 JSON/KV 表承载全部配置。

## 奖励事件基础设施

只有奖励事实使用本域 outbox → `subscription` inbox；它不是全项目消息总线。

生产域独占：

- `user_plant_outbox_events`
- `care_outbox_events`
- `diagnosis_outbox_events`
- `knowledge_outbox_events`

`subscription` 独占 `reward_event_inbox`、积分账本、等级和 AI 额度账本。
