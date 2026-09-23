# ClickUp Ticket 索引

目标空间/文件夹：

https://app.clickup.com/90182453517/v/o/f/1100440000000586

当前状态：`CREATED`。现有 27 个后端重构 ticket 均具备真实任务 ID 和链接；本轮通过用户 Chrome `default/main` 主 profile 新建的三项 P2 ticket 已逐项详情回读，远端状态均为 `backlog`。原有 19 个通过 ClickUp 官方 MCP 创建；P0 覆盖审计发现两项既有计划要求没有 ticket 后，通过用户 Chrome `default/main` 主 profile 补建“关键产品参数”和“外部能力合同”；此前又补建 P1 公共 HTTP 合同、植物分类身份准入硬门和统一 Provider 配置架构三项 ticket。原有后 12 个仍保留“尚未逐项详情回读”的证据边界，不以创建成功冒充验收完成。

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

新增的 P1“诊断知识来源、园艺原因及 Outcome/Action 合同”目前仅有[本地待建规格](ticket-specs.md)，尚无远端 ClickUp ID、未进入下表 27 张已创建任务或模块进度分母；真实建票与回读完成后再登记 ID 和负责人。P2 CMS 与 P4 问诊既有票据的增量验收须同步更新远端描述，不能因本地规格变更宣称远端已同步。

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
| P2 | [统一身份 Principal](https://app.clickup.com/t/z8v0kmr970) | identity | identity_terra | 已创建 |
| P2 | [CMS 分类、百科和发布](https://app.clickup.com/t/z8v0kmr971) | plant-knowledge | knowledge_terra | 已创建 |
| P2 | [订阅、积分与 AI 额度核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mh) | subscription | subscription_terra | 已创建并逐项回读 |
| P2 | [用户植物核心实现](https://app.clickup.com/t/90182453517/z8v0kmr9mj) | user-plant | user_plant_terra | 已创建并逐项回读 |
| P2 | [共享基础设施实现](https://app.clickup.com/t/90182453517/z8v0kmr9mk) | foundation | foundation_terra | 已创建并逐项回读 |
| P3 | [游客、试用、会员和奖励闭环](https://app.clickup.com/t/z8v0kmr972) | subscription | subscription_terra | 已创建 |
| P4 | [盆土视觉和四类养护能力](https://app.clickup.com/t/z8v0kmr973) | care | care_terra | 已创建 |
| P4 | [固定/动态问诊与小青工具](https://app.clickup.com/t/z8v0kmr974) | diagnosis | diagnosis_terra | 已创建 |
| P5 | [身份越权、绑定冲突和跨平台回放审查](https://app.clickup.com/t/z8v0kmr975) | identity | identity_review_luna | 已创建 |
| P5 | [安全、脱敏、防刷和权限合同审查](https://app.clickup.com/t/z8v0kmr976) | foundation | security_review_terra | 已创建 |
| P5 | [真实 MySQL 并发、事务、重放和读回](https://app.clickup.com/t/z8v0kmr977) | foundation | real_db_runner_luna | 已创建 |
| P5 | [真实 MySQL/API/安全/性能验收](https://app.clickup.com/t/z8v0kmr978) | foundation | real_api_runner_luna | 已创建 |
| P6 | [OpenAPI 冻结与精确清理](https://app.clickup.com/t/z8v0kmr979) | foundation | docs_diff_luna | 已创建 |
