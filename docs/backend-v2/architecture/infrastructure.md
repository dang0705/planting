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

完整目标架构保持稳定，按 [首版运行边界](../phases/first-release-scope.md) 的阶段与验收门逐步开放；目标节点存在不代表首版已运行或已验收。首版优先闭合“临时解决问题 → 用户显式保存/绑定 → 后续养护与复访”，受控实验须独立满足合同、成本和回退门。

## 运行时植物上下文（Runtime Plant Context）只读组装

临时植物与长期用户植物统一形成只读的运行时植物上下文（`Runtime Plant Context`），供识别、养护、诊断和受控 Agent 消费。现有业务用例按本次主体、作用域和能力读取已授权来源并形成请求级快照；组装过程不创建 `user_plant_id`、不写植物事实、不改变来源归属，也不把临时案例伪装成长期植物。临时上下文只含本次可用的植物候选、用户输入和有效证据；长期上下文须先由 `user-plant` 校验 `user_id` 对 `user_plant_id` 的归属，再按需组合用户植物身份、配置、事实、状态及相关记录。下游只能消费快照，写入归属或晋升均回到拥有相应用例的业务服务。

```text
游客或登录用户 + 本次作用域
→ 按当前能力只读组装 Runtime Plant Context
   ├─ 临时案例：本次候选 / 输入 / 有效证据，不含 user_plant_id
   └─ 长期植物：user-plant 归属校验后的身份 / 配置 / 事实 / 状态
→ 识别 / 养护 / 诊断 / CloudBase Agent 只读消费
```

临时案例可由游客或已登录用户使用；是否持有 `user_id` 与本次是否选择临时作用域是两个独立条件。`identity` 负责解析访问主体，植物入口的临时/长期选择与显式晋升由既有 `user-plant` 的 UserPlantApp 编排；登录状态不自动选中或写入长期植物。游客选择保存时须先登录取得统一 `user_id`；已登录用户可直接选择创建新用户植物或绑定本人已有植物。只有用户明确选择保存/绑定后，UserPlantApp 才按冻结合同创建/绑定并执行必要结果认领。已登录临时案例的 DTO、数据字典、幂等与 Expected 尚处 P1 补充门时，相关实现和验收保持未完成。

## care 内部环境证据管线

原子环境事实与派生环境指标都属于 `care`，不新增云函数，也不得下沉到无业务规则的 shared foundation。

```text
Weather / 盆土视觉 / 用户植物配置 / 已确认养护事实
→ EnvironmentEvidenceAssembler（来源、范围、单位、新鲜度校验）
→ 原子环境事实 Repository
→ 不可变输入快照
→ EnvironmentDomain（版本化纯计算）
→ 派生环境指标 Repository
→ CareDomain / Diagnosis 冻结合同消费
```

网络与 Provider 调用只发生在 Adapter；`EnvironmentDomain` 不访问网络和数据库。Repository 是观察、快照和派生记录的唯一 SQL 入口。室外天气快照保持 `outdoor` 范围，不能在组装层被重标记为室内证据。算法变化不得更新旧派生行或原子事实，而是基于同一 `inputSnapshotHash` 与新的算法 release 追加派生记录。

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

`diagnosis` 生成式丰富解释只按受控实验开放：事实边界、版本发布、独立 Expected、成本对照、关闭与回退遵循[诊断内容增强实验合同](../contracts/diagnosis-rich-response-experiment.md)。一次用户产品动作以同一个 `productActionId` 归集图片、模型循环、Token、预占与结算；达到已冻结的动作级成本/额度上限时，必须在下一次模型调用前停止，不得把内部追加调用重复计费。上限未进入已确认变量目录且真实成本门未通过时，增强版保持关闭，继续使用最近已验证版本。

诊断知识由 `diagnosis` 域拥有语义与发布准入，复用 CloudBase CMS 的编辑/审核通道，不让 CMS 热表成为运行时事实源。症状题包、园艺原因、Outcome、Action 和映射构成一个可兼容校验的不可变发布包；`diagnosis` 请求只读取锁定的 release 快照并在结果里记录来源版本。`plant-knowledge` 的 Qwen 展示百科补全 Worker 不得触碰这条知识链；模型仅能整理受限证据和已发布知识。合同见[诊断知识来源](../contracts/diagnosis-knowledge-sources.md)。

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
