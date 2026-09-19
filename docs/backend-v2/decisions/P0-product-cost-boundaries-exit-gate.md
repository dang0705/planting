# P0 产品参数与成本边界独立出口门（用户确认后复核）

> Ticket：`z8v0kmr9dq`  
> 独立复核代理：`p1_exit_gate_review_luna`  
> 复核时间：2026-09-19（Asia/Shanghai）  
> 复核范围：产品参数登记册、登记册 SHA、用户确认记录、Master Plan、P0 票据合同及技术停止矩阵  
> 本复核不修改产品登记册、Master Plan、业务代码、测试、云端或 ClickUp

## 1. 结论

**P0 产品参数与成本边界票据：PASS。**

本次 `PASS` 只表示产品决策层已经闭环：D-02、D-03、D-04、D-05、D-07、D-08、D-09、D-10 的推荐值已由用户通过主代理明确确认，登记册已记录确认时间、来源、范围和边界；没有仍处于 `PROPOSED_NEEDS_USER` 的当前决策状态。

**技术能力和公开发布：仍按登记册中的能力级 `STOP` 执行。**

支付 sandbox、真实模型/供应商账单、Storage 私有上传与删除补偿、MySQL 连接上限、真实压测、告警演练等未因用户确认而自动通过，也不阻断本产品参数票据关闭。任何代理不得把本 gate 的 `PASS` 写成“已部署”“已接通”或“可以发布”。

## 2. 复核输入与完整性

| 输入 | 当前证据 | 判定 |
|---|---|---|
| 唯一实施入口 | `node docs/backend-v2/verify-entrypoint.mjs` 通过 | PASS |
| Master Plan | `e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428` | PASS |
| 产品登记册 | `docs/backend-v2/decisions/P0-product-cost-boundaries.md` | PASS |
| 登记册 SHA | `e301b0970c9d7f54972e74f5acd20c431e9682f48031edc81c8b90419efda252`，与 sidecar 一致 | PASS |
| 票据合同 | `docs/backend-v2/clickup/ticket-specs.md` 的“关键产品参数与成本边界冻结” | PASS |
| 用户确认 | `2026-09-19T23:42:35+08:00`；“全部确认，允许安装，AI 月预算 500 元” | PASS |

确认范围与登记册第 0 节一致：上一轮推荐值全部确认；D-09 采用修订后的数据生命周期口径；D-10 采用 500 元月预算及 80%/90%/100% 阈值。允许安装只代表依赖安装获得授权，不代表云端部署授权。

## 3. 决策覆盖与状态核对

| 决策项 | 当前冻结值 | 当前登记状态 | 复核 |
|---|---|---|---|
| D-01 | P0 验证显式使用 `cloud1-2grufevs395a9d5e`、`ap-shanghai`；生产环境仍 STOP | `CONFIRMED_FROM_REQUIREMENT` | PASS |
| D-02 | 首次创建用户起绝对 24 小时、一次性 200 AI 点；仅三项用户生成式能力 | `CONFIRMED_FROM_USER` | PASS |
| D-03 | 登录免费用户最多 1 个 `active` 用户植物；归档/删除不占额度 | `CONFIRMED_FROM_USER` | PASS |
| D-04 | 奖励 AI 点仅用于 `USER_AGENT_TEXT`、`USER_DIAGNOSIS_TEXT`、`USER_DIAGNOSIS_VISUAL` | `CONFIRMED_FROM_USER` | PASS |
| D-05 | MVP 无公开积分兑换档位；只保留策略读取和兑换合同骨架 | `CONFIRMED_FROM_USER` | PASS |
| D-06 | CMS 实际 immutable release 后按全局主题唯一、最早资格者奖励；支持反向冲正 | `CONFIRMED_FROM_REQUIREMENT` | PASS |
| D-07 | 私有 Storage 直传、登记 `fileID`、服务端验证后绑定，不走 Base64/任意 URL | `CONFIRMED_FROM_USER` | PASS |
| D-08 | MVP 仅微信小程序支付；支付实现、验签、查单、sandbox、对账仍 STOP | `CONFIRMED_FROM_USER` | PASS |
| D-09 | 未绑定 24 小时、失败/隔离 7 天、诊断/盆土原始证据 30 天；删除后私图和业务结果 30 天清理窗口；支付/法定审计另行治理 | `CONFIRMED_FROM_USER` | PASS |
| D-10 | 非 AI `p95≤800ms/p99≤1500ms`；生成式首事件 `p95≤3s`、总 deadline `≤60s`；AI 月预算 500 元，400 告警、450 限制新增消费、500 停止新增消费 | `CONFIRMED_FROM_USER` | PASS |

所有 P0 票据验收主题均有对应的最终值、影响域、回退条件和状态；没有发现被实现者自行填充的默认产品数值。

## 4. “无残余待用户确认”核对

### 4.1 状态字段

独立检索登记册确认：

- D-02、D-03、D-04、D-05、D-07、D-08、D-09、D-10 均为 `CONFIRMED_FROM_USER`。
- D-01、D-06 是已有需求/测试范围事实，分别为 `CONFIRMED_FROM_REQUIREMENT`。
- 登记册中没有 `PROPOSED_NEEDS_USER` 状态。
- 第 5 节明确写出“产品层不再保留待用户确认项”。

### 4.2 历史说明与当前决策的关系

D-02 的“点数与范围未确认”、D-09 的“具体天数未确认”等句子位于“已确认事实”栏，描述的是登记册形成前的输入缺口；同一决策项后续的“推荐值”与 `CONFIRMED_FROM_USER` 状态已给出最终决定。它们不构成当前待用户确认状态，也没有把技术停止条件错误升级为产品待确认。

D-05 “待成本数据完整后再由用户批准具体档位”指的是未来新增公开兑换档位需要另行发起新决策；当前 MVP 明确“不开放公开兑换档位”，不构成本票据遗漏。

## 5. 产品确认与技术停止边界

下列状态是有意保留的技术门，不是产品决策失败：

- 24 小时试用生成式能力：须完成真实成本、额度预占/结算、资产归属和降级验证。
- 奖励 AI 额度：须完成 scope、到期、预占和真实 API 验收。
- CMS 贡献奖励：须完成 release、全局唯一约束、inbox 幂等、冲正账本和并发验证。
- 图像能力：须完成私有上传、验证、绑定、临时链接到期和删除补偿回放。
- 会员购买：须完成唯一回调 owner、验签、sandbox、查单和对账。
- 数据删除：须完成逐对象 manifest、引用反查、清理补偿和回放。
- 容量与成本扩张：须读回真实连接/实例上限，完成压测、供应商账单映射和告警/降级演练。

因此本 gate 的判定规则是：产品值确认后，票据可 `PASS`；相关能力没有真实证据时继续 `STOP`；不得因为技术 STOP 重新要求用户确认同一产品参数，也不得因产品 `PASS` 放宽技术 STOP。

## 6. 关键一致性检查

1. 会员 9.9 元与每周期 2,000 点，与 Master Plan 的会员/统一额度规则一致；不设日、周、滚动窗口且不结转。
2. 百度识别、天气、确定性算法、固定题包和 CMS 补全不扣用户 AI 点，与游客/免费用户边界一致。
3. CMS 新身份 100 点、基础展示内容 50 点直接进入统一 AI 额度，不进入积分账本，也不享等级倍率；只在实际 release 后入账。
4. 500 元是平台 AI 月预算，不是单个用户可获得的点数，也不改变会员每周期 2,000 点、试用 200 点或 CMS 奖励数值。
5. 400/450/500 是成本控制阈值；达到阈值后的告警、限制或停止不能绕过必要对账，也不能删除已有用户植物、事实、积分或账本。
6. “仅微信支付”与“支付实现 STOP”同时成立：前者是产品平台范围，后者是技术准入状态。
7. 当前测试数据不被当作生产用户数据，不触发迁移保留、上线审计或生产阻断。

## 7. 未覆盖项与下一步

本 gate 没有验证也没有宣称已验证：真实供应商单价/余额、支付资质与 sandbox、真实 Storage 上传/删除、数据库总连接上限、函数最大实例数、真实负载 P95/P99、预算告警演练和端到端业务闭环。

后续实施必须读取本登记册的最终状态，并分别满足各能力的 `STOP` 解除条件。任何新产品数值、公开兑换档位、支付平台或数据生命周期变更，必须创建新的用户确认记录和 policyVersion，不能在实现中静默改写。

## 8. 独立结论摘要

```text
P0_PRODUCT_DECISION_TICKET = PASS
USER_CONFIRMATION = COMPLETE
RESIDUAL_USER_DECISION = NONE
TECHNICAL_ACCEPTANCE = STOP_BY_CAPABILITY
PUBLIC_RELEASE = STOP
```
