# ClickUp Ticket 索引

目标空间/文件夹：

https://app.clickup.com/90182453517/v/o/f/1100440000000586

当前状态：`CREATED`。原有 27 个后端重构 ticket、P1 诊断知识合同票据与本轮新增的 P2 植物身份公开搜索票据，共 29 个，均有真实任务 ID 和链接。本轮 ClickUp MCP 完整回读 29/29；P2 搜索票据为 `review needed`，统一身份 Principal 保持 `codex running`，P3 游客/试用闭环为 `codex running`。P3 正在进行本地按需能力快照组合器切片；尚未接入 user-plant runtime entry，未完成真实微信→POST→GET 或整票验收。原有 19 个通过 ClickUp 官方 MCP 创建；P0 覆盖审计发现两项既有计划要求没有 ticket 后，通过用户 Chrome `default/main` 主 profile 补建“关键产品参数”和“外部能力合同”；此前又补建 P1 公共 HTTP 合同、植物分类身份准入硬门和统一 Provider 配置架构三项 ticket。原有后 12 个仍保留“尚未逐项详情回读”的证据边界，不以创建成功冒充验收完成。状态与进度的完整权威快照见 `tracker/module-status.json` 及 keeper 心跳；ClickUp 没有原生进度字段，不把本地进度当作远端进度。

阶段列表：

- `Phase-P-1`：`1100440000000759`
- `Phase-P0`：`1100440000000760`
- `Phase-P1`：`1100440000000761`
- `Phase-P2`：`1100440000000764`
- `Phase-P3`：`1100440000000765`
- `Phase-P4`：`1100440000000766`
- `Phase-P5`：`1100440000000767`
- `Phase-P6`：`1100440000000768`

每个 ticket 的完整目的和验收标准见 [ticket-specs.md](ticket-specs.md)。

P1“诊断知识来源、园艺原因及 Outcome/Action 合同”已绑定远端票据并回读为 `backlog`；负责人记录为 `diagnosis_terra`，依据是现有 P4 diagnosis 任务的负责人约定。ClickUp 未解析出同名用户，因此未设置平台 assignee。P2 CMS 与 P4 问诊票据已追加该合同的跨域发布边界和诊断验收要求，回读状态均为 `backlog`。本次未修改 `tracker/module-status.json` 或 `clickUpTaskStatuses`。

| Phase | Ticket 标题 | 模块 | Agent | 状态 |
|---|---|---|---|---|
| P-1 | [旧函数、路由、测试和原子依赖审计](https://app.clickup.com/t/z8v0kmr96q) | foundation | audit_legacy_code_luna | 已创建 |
| P-1 | [SQL、数据模型、CMS 和内容资产审计](https://app.clickup.com/t/z8v0kmr96r) | plant-knowledge | audit_data_cms_luna | 已创建 |
| P-1 | [外部供应商、来源和回调边界审计](https://app.clickup.com/t/z8v0kmr96t) | foundation | audit_external_sources_luna | 已创建 |
| P-1 | [云存储、私有资产和 OpenViking 审计](https://app.clickup.com/t/z8v0kmr96u) | foundation | audit_storage_memory_luna | 已创建 |
| P-1 | [植物分类权威来源与身份准确性审计](https://app.clickup.com/t/z8v0kmr96v) | plant-knowledge | taxonomy_inventory_luna | 已创建 |
| P0 | [TypeScript/Node22/CloudBase 构建证伪](https://app.clickup.com/t/z8v0kmr96w) | foundation | foundation_terra | 已创建 |
| P0 | [植物分类权威来源与身份审计证伪](https://app.clickup.com/t/z8v0kmr96x) | plant-knowledge | taxonomy_inventory_luna | 已创建 |
| P0 | [关键产品参数与成本边界冻结](https://app.clickup.com/t/90182453517/z8v0kmr9dq) | foundation | product_decisions_terra | 已创建并回读 |
| P0 | [外部能力合同与可靠事件证伪](https://app.clickup.com/t/90182453517/z8v0kmr9dv) | foundation | integration_probe_terra | 已创建并回读 |
| P1 | [用户植物、身份和游客认领合同](https://app.clickup.com/t/z8v0kmr96y) | user-plant | user_plant_terra | 已创建 |
| P1 | [统一 AI 额度和奖励事件合同](https://app.clickup.com/t/z8v0kmr96z) | subscription | subscription_terra | 已创建 |
| P1 | [公共 HTTP 合同与 OpenAPI 路由骨架](https://app.clickup.com/t/90182453517/z8v0kmr9ge) | foundation | root | 已创建并回读，`codex running` |
| P1 | [植物分类与身份准入硬门](https://app.clickup.com/t/90182453517/z8v0kmr9gm) | plant-knowledge | taxonomy_gate_terra + root | 已创建并回读，`backlog` |
| P1 | [业务策略与统一 Provider 配置架构](https://app.clickup.com/t/90182453517/z8v0kmr9gn) | foundation | root + config_business_luna + provider_config_terra | 已创建并回读，`codex running` |
| P1 | [诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a) | diagnosis | diagnosis_terra | 已创建并回读，`backlog` |
| P2 | [统一身份 Principal](https://app.clickup.com/t/z8v0kmr970) | identity | identity_terra | 已创建并回读，`codex running` |
| P2 | [CMS 分类、百科和发布](https://app.clickup.com/t/z8v0kmr971) | plant-knowledge | knowledge_terra | 诊断知识边界已同步并回读，`backlog` |
| P2 | [[P2] 已发布植物身份公开搜索纵向切片](https://app.clickup.com/t/z8v0kmrp1w) | plant-knowledge | knowledge_search_readiness | 本地切片待主代理审阅，`review needed`；90% 为本地心跳，不是远端进度 |
| P2 | [订阅、积分与 AI 额度核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mh) | subscription | subscription_terra | 已创建并逐项回读 |
| P2 | [用户植物核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mj) | user-plant | user_plant_terra | 已创建并逐项回读 |
| P2 | [共享基础设施实现](https://app.clickup.com/t/90182453517/z8v0kmr9mk) | foundation | foundation_terra | 已创建并逐项回读 |
| P3 | [游客、试用、会员和奖励闭环](https://app.clickup.com/t/z8v0kmr972) | subscription | subscription_terra | 本地按需能力快照组合器切片进行中，`codex running`；MySQL 测试通过但 user-plant runtime entry 未接入，整票未验收且无 owner 进度上报 |
| P4 | [盆土视觉和四类养护能力](https://app.clickup.com/t/z8v0kmr973) | care | care_terra | 已创建 |
| P4 | [固定/动态问诊与小青工具](https://app.clickup.com/t/z8v0kmr974) | diagnosis | diagnosis_terra | 诊断知识验收已同步并回读，`backlog` |
| P5 | [身份越权、绑定冲突和跨平台回放审查](https://app.clickup.com/t/z8v0kmr975) | identity | identity_review_luna | 已创建 |
| P5 | [安全、脱敏、防刷和权限合同审查](https://app.clickup.com/t/z8v0kmr976) | foundation | security_review_terra | 已创建 |
| P5 | [真实 MySQL 并发、事务、重放和读回](https://app.clickup.com/t/z8v0kmr977) | foundation | real_db_runner_luna | 已创建 |
| P5 | [真实 MySQL/API/安全/性能验收](https://app.clickup.com/t/z8v0kmr978) | foundation | real_api_runner_luna | 已创建 |
| P6 | [OpenAPI 冻结与精确清理](https://app.clickup.com/t/z8v0kmr979) | foundation | docs_diff_luna | 已创建 |
