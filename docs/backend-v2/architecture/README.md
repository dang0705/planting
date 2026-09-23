# 架构实施入口

- [业务领域架构](business-domain.md)
- [最新版分层业务架构（L0/L1/L2）](business-domain-layers.md)
- [后端基础设施架构](infrastructure.md)
- [业务到技术映射](business-to-technical-map.md)
- [架构硬规则](architecture-rules.md)
- [业务策略与第三方 Provider 配置架构](configuration-and-providers.md)
- [业务关键变量目录（中文阅读版）](configuration-variable-catalog.md)
- [业务关键变量目录（机器事实源）](configuration-variable-catalog.json)

OpenViking 的分层检索副本入口：`viking://resources/projects/planting/backend-v2/architecture/_index.md`。L0、各 L1/L2 和后端基础设施总图分别存储；每份资源先写清业务/技术语义，再附原 Mermaid 图。资源只用于检索与理解，不提升为实现或合同事实源；若与本仓库当前文件冲突，以本仓库为准。

README 中的两张 Mermaid 图是事实源；本目录只解释如何实施和验收各节点。涉及数值、阈值、开关、版本、期限、上限、排序、预算、重试、超时、Provider 或密钥引用时，必须先按领域读取业务关键变量目录；禁止从源码现状或旧实现猜值。

分层业务架构展开 README 的业务图；首版状态只表示当前开放深度，不能删去目标架构节点或改变用户植物归属。
