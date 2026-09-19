# P0 四票交叉覆盖与退出门审计（最终复核）

> 复核时间：2026-09-20（Asia/Shanghai）  
> 复核范围：P0 入口、P0 阶段与 ticket 规格，以及四个 owner ticket 的最新报告、独立退出闸门和 heartbeat。  
> 只读边界：未修改 Master Plan、源码、owner 制品、ClickUp、`tracker/module-status.json` 或云端。  
> 入口复验：`node docs/backend-v2/verify-entrypoint.mjs` 通过；Master Plan 2111 行，SHA-256 为 `e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428`。

## 1. 双轴总判定

**P0“决策与证伪阶段”：`PASS`。** 四个 owner ticket 均为 `done/100`，且各自独立退出闸门已满足 ticket 级验收：

- `z8v0kmr96x` 分类权威来源与身份审计：ticket 证伪 `PASS`；
- `z8v0kmr96w` TypeScript/Node22/CloudBase 构建：本地构建退出闸门 `PASS`；
- `z8v0kmr9dq` 产品参数与成本边界：产品决策票 `PASS`，用户确认完成；
- `z8v0kmr9dv` 外部能力合同与可靠事件：合同/证伪出口 `PASS`。

**真实能力与公开发布轴：继续 `STOP`，且不反向否定上述 P0 ticket PASS。** 当前植物身份 active release、供应商/支付/CloudBase/Storage/MySQL/Agent 真实集成、CMS release、可靠事件 S4、公开 API/发布均没有被本轮 ticket PASS 自动放行。必须按各能力的具体 STOP 门继续限制。

这不是“所有能力已经可用”的结论，而是“P0 决策、合同和最短证伪已完成；真实接通与发布仍未完成”的结论。

## 2. 四票最新状态

| owner ticket | heartbeat | 独立退出闸门 | P0 决策/证伪轴 | 真实集成/发布轴 |
|---|---|---|---|---|
| `z8v0kmr96w` | `done/100` | `P0-typescript-node22-cloudbase-final-exit-gate.md` | `PASS`：strict 类型、构建、Node 22.21.1 测试 8/8、漏洞 0、部署 manifest 通过 | `STOP`：未部署 CloudBase，未验证真实云端入口、日志和读回 |
| `z8v0kmr96x` | `done/100` | `P0-taxonomy-exit-gate.md` | `PASS`：八类映射、代表性证伪、原始证据回放、负向边界和隔离规则通过 | `STOP`：身份 `NOT_ADMITTED`，active release `STOP`，候选保持 `QUARANTINE` |
| `z8v0kmr9dq` | `done/100` | `P0-product-cost-boundaries-exit-gate.md` | `PASS`：D-02/03/04/05/07/08/09/10 已用户确认；无残余待确认项 | `STOP`：支付、Storage、真实成本、连接上限、压测和公开发布仍需能力级验收 |
| `z8v0kmr9dv` | `done/100` | `P0-external-capability-cards-exit-gate.md` | `PASS`：14 卡精确覆盖、双轴字段、五类 mutation、数值/TTL STOP 均通过 | `STOP`：14/14 卡为 `INTEGRATION_STOP`，无正向 S4 |

## 3. “必须冻结”交叉覆盖

| 必须冻结项 | 唯一/主责 ticket | 当前决策/合同轴 | 当前真实轴 | 仍需限制的能力 |
|---|---|---|---|---|
| 24 小时试用 AI 点数、有效期、能力范围 | 产品 `z8v0kmr9dq` D-02 | `GO`：200 点、绝对 24 小时、三项用户生成式能力已确认 | `STOP`：额度预占/结算、成本和真实 AI 验收未完成 | 不开放未经真实验收的试用生成式能力 |
| 免费用户植物数量 | 产品 `z8v0kmr9dq` D-03 | `GO`：最多 1 个 active 用户植物已确认 | `STOP`：归属、并发和真实业务验证仍需完成 | 不绕过用户植物归属和容量门 |
| 积分兑换档位、能力范围、有效期 | 产品 `z8v0kmr9dq` D-04/D-05 | `GO`：奖励 scope 已确认；MVP 公开兑换目录为空 | `STOP`：兑换不启用，直到成本和并发/失败恢复验收 | 只保留策略/合同骨架，不创建可兑换项目 |
| CMS 奖励主题键、全局获奖者、撤销/冲正 | 产品 `z8v0kmr9dq` D-06；技术事件由外部 `EXT-11/14` 承接 | `GO`：主题键、最早资格者、不可变反向 ledger 规则已冻结 | `STOP`：release、inbox 幂等、并发和可靠事件 S4 未完成 | 不发放真实贡献奖励，不宣称闭环完成 |
| 分类权威源、冲突处理、无法证明时隔离 | 分类 `z8v0kmr96x` | `GO`：证伪/回放/冲突不自动裁决/QUARANTINE 边界通过 | `STOP`：active identity admission 未通过，200 条全量未准入 | catalog、identify、CMS、care、diagnosis 不读取隔离身份 |
| CloudBase 匿名身份边界 | 外部 `z8v0kmr9dv` EXT-03 | `GO`：平台匿名主体不等于业务 `user_id`；应用 guest session 独立建模 | `STOP`：目标 Auth 开关、规则、升级/解绑和 TTL 读回未完成；TTL 子项保持 STOP | 不把匿名主体作为长期业务归属键 |
| TypeScript、Node22、CloudBase HTTP 构建 | 构建 `z8v0kmr96w`；网关合同由外部 EXT-13 引用 | `GO`：本地 strict/CommonJS、Node22、9000、manifest 和依赖审计通过 | `STOP`：未部署、未验证目标云端实例与真实 `/api/v2` 路由 | 不把本地 PASS 写成云端或公开 API PASS |
| 百度、和风、Qwen、支付、Storage、Agent 合同 | 外部 `z8v0kmr9dv`；业务数值/范围由产品 `z8v0kmr9dq` | `GO`：合同/证伪登记册闭合；显式未决模型、Prompt、TTL、支付、Agent 数值仍按卡片 STOP | `STOP`：14 张卡均无 S4 集成 GO | 不调用、发布或启用无对应真实证据的能力 |
| outbox/inbox 丢失、重放、乱序、并发 | 外部 `z8v0kmr9dv` EXT-14 | `GO`：至少一次、lease、inbox 唯一键和非 exactly-once 边界已登记；数值子项仍 STOP | `STOP`：真实库同事务、宕机、重放、乱序、并发和读回未完成 | 不宣称可靠奖励闭环或 exactly-once |

“GO”在上表仅表示已冻结的决策/合同/证伪边界；“STOP”表示真实集成、active release 或公开能力仍不可用。两轴不可合并。

## 4. 重复、遗漏与冲突复核

### 已关闭的覆盖遗漏

- 上一版缺少全局 `source_requirement → owner → 设计轴 → 真实轴 → 阻断范围` 映射；本次已逐条建立，并确认四个 owner ticket 的 P0 范围合计覆盖“必须冻结”全部九项。
- 上一版把构建票的本地缺口延续为旧 `PARTIAL`；最新最终闸门已证明本地构建 ticket PASS，未把未部署 CloudBase 错判为构建 ticket 失败。
- 上一版把产品待确认状态延续为旧 `PARTIAL`；最新登记册和退出闸门已确认用户在 `2026-09-19T23:42:35+08:00` 完成确认，产品 ticket PASS。

### 有意保留的双轴边界

- 分类 `ticket PASS` 与身份 `active release STOP` 同时成立；代表样本证伪不等于 200 条全量身份通过。
- 外部合同/证伪 `PASS` 与 14 张卡 `INTEGRATION_STOP` 同时成立；合同登记册闭合不等于供应商、支付、CloudBase、Storage、MySQL、Agent 或故障恢复接通。
- 产品决策 `PASS` 与技术能力 `STOP` 同时成立；用户确认值不替代真实 API、sandbox、压测、账单、连接上限或删除补偿证据。
- 构建 `PASS` 与云端部署/发布 `STOP` 同时成立；`npm run verify` 和 Node 22 测试不替代目标环境读回。

### 仍需关注的交叉依赖

- 产品 D-07/D-08/D-09/D-10 的最终值已确认，但 Storage TTL、支付 callback/sandbox、数据删除补偿、连接容量和成本告警仍由外部能力卡逐项 STOP；这不是产品票失败。
- 外部 EXT-03/09/11/12/13/14 的 TTL、租约、连接、预算和告警数值子项仍是精确 STOP；不得因外部 ticket PASS 而隐式升级为 GO。
- `@types/node` 版本差异属于旧构建复核中的历史问题；最终构建闸门已以 `cloudfunctions-v2/` 独立包实际验证通过为准，不再用旧根仓候选差异否定当前构建 ticket。

## 5. P0 阶段出口与后续限制

| 判断问题 | 当前结论 |
|---|---|
| 四票 ticket 级验收是否全部满足？ | 是，四票均 `done/100`，独立闸门均 PASS。 |
| P0 决策与证伪阶段是否 PASS？ | 是，`P0_DECISION_AND_FALSIFICATION_PASS`。 |
| 植物身份是否可 active release？ | 否，`STOP / NOT_ADMITTED`；继续 `QUARANTINE`。 |
| 供应商、支付、CloudBase、Storage、MySQL、Agent 是否真实接通？ | 否，按外部卡 `INTEGRATION_STOP`。 |
| 是否获得公开发布授权？ | 否，`PUBLIC_RELEASE_STOP`。 |

可以继续：按已确认产品值推进不触发外部副作用的合同、DTO、状态机、构建和负向测试；逐能力准备脱敏 S4。不能继续：把任一 ticket PASS 扩写为 active release、真实集成 GO、生产部署或公开发布 GO。

**最终判定：`P0_DECISION_AND_FALSIFICATION_PASS`；`IDENTITY_ACTIVE_RELEASE_STOP`；`EXTERNAL_INTEGRATION_STOP`；`PUBLIC_RELEASE_STOP`。**
