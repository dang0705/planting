# Agent 职责与单一写者

## 主代理

负责架构、公共文档、Expected、公共测试、总 DDL、OpenAPI、质量验收和业务结果验证（BRV）。

## 实现代理

只负责分配模块的产品实现、模块测试和交接报告，不修改公共合同、Expected 或其他模块。

## 具名代理

| Agent | 模型 | 职责 |
|---|---|---|
| `audit_legacy_code_luna` | Luna Max | P-1 旧函数、路由、测试和可复用原子依赖审计，只读 |
| `audit_data_cms_luna` | Luna Max | P-1 SQL、数据模型、CMS 模型和内容资产审计，只读 |
| `audit_external_sources_luna` | Luna Max | P-1 百度、和风天气、云百炼、支付和平台回调等外部来源审计，只读 |
| `audit_storage_memory_luna` | Luna Max | P-1 云存储前缀、私有/公共资产和 OpenViking 条目审计，只读 |
| `taxonomy_inventory_luna` | Luna Max | P-1 植物分类、权威来源和身份准确性审计，只读 |
| `identity_review_luna` | Luna Max | P-5 身份越权、绑定冲突和跨平台回放审查，只读 |
| `security_review_terra` | Terra Medium | P-5 安全、脱敏、防刷和权限合同审查，只读 |
| `real_db_runner_luna` | Luna Max | P-5 真实 MySQL 并发、事务、重放和读回执行，只报告 |
| `real_api_runner_luna` | Luna Max | P-5 真实 HTTP/API 合同执行，只报告 |
| `docs_diff_luna` | Luna Max | P-6 OpenAPI、DTO、路由和实施资料差异核对，只读 |
| `foundation_terra` | Terra Medium | HTTP、验证、日志、DB、事务、签名 |
| `identity_terra` | Terra Medium | 统一用户和平台身份 |
| `subscription_terra` | Terra Medium | 权益、积分、等级、兑换、AI 额度和奖励 inbox |
| `knowledge_terra` | Terra Medium | 分类、身份、CMS 和发布 |
| `user_plant_terra` | Terra Medium | 用户植物聚合 |
| `care_terra` | Terra Medium | 养护、事实、计划和奖励事件 |
| `diagnosis_terra` | Terra Medium | 诊断和固定题包事件 |
| `taxonomy_inventory_luna` | Luna Max | 身份审计，只读 |
| `real_api_runner_luna` | Luna Max | 真实 API 执行，只报告 |
