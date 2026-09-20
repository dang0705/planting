# Phase 与 Ticket 绑定规则

每个 Phase 的可执行条目必须拥有一个 ticket；每个 ticket 必须反向记录 Master Plan 章节、实施文档、agent 和验收标准。

```text
Phase 文档
→ Ticket 索引
→ 模块实施文档
→ Expected/测试
→ tracker 模块
→ ClickUp 状态
→ 主代理验收
```

没有 ticket、没有负责人、没有验收标准或没有实施文档入口，不得进入开发。

## Phase-P1 当前绑定（2026-09-20）

| Ticket | 模块 | 负责 agent | 实施/Expected 入口 | ClickUp 状态 |
|---|---|---|---|---|
| `z8v0kmr96y` [用户植物、身份和游客认领合同](https://app.clickup.com/t/z8v0kmr96y) | user-plant | `user_plant_terra` | `contracts/user-plant.md`、`contracts/guest-session-claim.md` | `review needed` |
| `z8v0kmr96z` [统一 AI 额度和奖励事件合同](https://app.clickup.com/t/z8v0kmr96z) | subscription | `subscription_terra` | `contracts/care-points-and-ai-quota.md`、`contracts/reward-events.md` | `done` |
| `z8v0kmr9ge` [公共 HTTP 合同与 OpenAPI 路由骨架](https://app.clickup.com/t/90182453517/z8v0kmr9ge) | foundation | `root` | `contracts/http-api.md`、`api/README.md`、`cloudfunctions-v2/test/p1-api-skeleton.spec.ts` | `codex running` |
| `z8v0kmr9gm` [植物分类与身份准入硬门](https://app.clickup.com/t/90182453517/z8v0kmr9gm) | plant-knowledge | `taxonomy_gate_terra + root` | `contracts/plant-taxonomy.md`、`audits/P1-taxonomy-human-decision-2026-09-20.md`、`audits/taxonomy-approval-2026-09-20/seed-manifest.json` | `review needed` |
| `z8v0kmr9gn` [业务策略与统一 Provider 配置架构](https://app.clickup.com/t/90182453517/z8v0kmr9gn) | foundation | `root + config_business_luna + provider_config_terra` | `contracts/http-api.md`、`implementation/http-function.md`、外部来源审计 | `codex running` |

本表只记录 ticket 绑定与状态，不替代负责人 heartbeat、Expected 或主代理验收。新增 ticket 的具体描述、验收和未授权 CloudBase 边界见 `ticket-specs.md`；未有负责人 heartbeat 的 ticket 不得伪装成已完成或已验收。

## Phase-P2 完整绑定（taxonomy 仅局部阻断）

P1 人工裁决已完成：当前 `seedEligible=106`，4 条 `TRANSFORM_PENDING` 完成重建和复核后才允许提升为 110，active release 仍为 `STOP`。它只阻断 `plant-knowledge` 的正式发布、百科补全和依赖 active taxonomy 的读取路径；`identity`、`subscription`、`user-plant`、`foundation` 继续推进。下表记录已核实的远端 ClickUp 绑定；状态仍由专职状态维护代理回读。

| Ticket | 模块 | 负责 agent | 实施/Expected 入口 | 本地登记 |
|---|---|---|---|---|
| `z8v0kmr970` [统一身份 Principal](https://app.clickup.com/t/z8v0kmr970) | identity | `identity_terra` | `ticket-specs.md`、`contracts/principal-and-capability.md`、`schema/001_identity.sql` | 已创建；远端状态由专职状态维护代理回读 |
| `z8v0kmr971` [CMS 分类、百科和发布](https://app.clickup.com/t/z8v0kmr971) | plant-knowledge | `knowledge_terra` | `ticket-specs.md`、`contracts/plant-taxonomy.md`、`schema/002_plant_knowledge.sql` | 已创建；正式发布受 4 条待转换与 active release 门禁阻断，非发布基础设施可推进 |
| `z8v0kmr9mh` [订阅、积分与 AI 额度核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mh) | subscription | `subscription_terra` | `ticket-specs.md`、`contracts/care-points-and-ai-quota.md`、`contracts/reward-events.md`、`schema/005_subscription.sql` | 已创建；远端状态由专职状态维护代理回读 |
| `z8v0kmr9mj` [用户植物核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mj) | user-plant | `user_plant_terra` | `ticket-specs.md`、`contracts/user-plant.md`、`contracts/guest-session-claim.md`、`schema/003_user_plant.sql` | 已创建；远端状态由专职状态维护代理回读 |
| `z8v0kmr9mk` [共享基础设施实现](https://app.clickup.com/t/90182453517/z8v0kmr9mk) | foundation | `foundation_terra` | `ticket-specs.md`、`contracts/http-api.md`、`implementation/http-function.md`、`schema/006_reliable_events.sql` | 已创建；远端状态由专职状态维护代理回读 |
