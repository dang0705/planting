# 业务到技术映射清单

本清单承接 README 中的业务领域架构与后端基础设施架构：业务语义由前者定义，技术落点由后者承载。完整目标架构按首版范围与各 Phase 的合同、验收门逐步开放；目标节点出现在映射中不代表已经运行或验收。

| 业务节点 | 应用服务 | 领域核心 | 数据/事件 | 验收入口 |
|---|---|---|---|---|
| 统一用户与访问主体 | identity | Identity Domain | users/platform_identities/user_sessions/service_replay_nonces；不创建 principal_mappings | P1 合同门 / P2 identity |
| 植物业务入口与临时/长期选择 | identity 解析主体；user-plant（UserPlantApp）编排入口与晋升 | Principal 与 User Plant Core | 临时案例（结构待 P1 冻结）/ user_plants / promotion command | 首版核心；已登录临时案例补充门未完成前不验收 |
| 运行时植物上下文（Runtime Plant Context） | 既有业务用例按能力只读组装与消费；user-plant 校验长期植物归属 | 临时与长期上下文统一只读视图 | 临时案例输入与有效证据 / 归属校验后的用户植物身份、配置、事实与状态投影 | P1 上下文合同；P3 消费路径真实验收 |
| 用户植物与显式晋升 | user-plant（UserPlantApp） | User Plant Core | user_plants / promotion 与必要结果认领 | P2 user-plant；同会话认领合同 |
| 植物分类 | plant-knowledge | Knowledge Domain | plant_taxa/identity release | P1 identity audit |
| CMS 展示百科 | plant-knowledge | Knowledge Domain | enrichment/release | P3 CMS |
| 积分和等级 | subscription | Reward Domain | care_point_ledger | P3/P4 目标态；首版运行延后 |
| AI 额度 | subscription | Entitlement/Reward Domain | ai_quota_* | P2/P5 quota |
| 养护 | care | Care Domain | facts/plans/evidence | P4 care |
| 诊断 | diagnosis | Diagnosis Domain | sessions/results | P4 diagnosis |
| 症状入口 → 园艺原因 → Outcome/Action | diagnosis 拥有内容语义与结果归约；plant-knowledge 复用 CMS 编辑发布通道 | Diagnosis Domain | 来源证据 / 原因目录 / Outcome / Action / 审核映射 / 兼容 release；结果锁定版本 | P1 诊断知识来源增量合同 / P2 CMS 发布基础设施 / P4 诊断内容底线 / P5 真实回放 |
| 诊断生成式丰富解释 | diagnosis + subscription | 诊断证据账本与 AI 额度合同 | versioned prompt/schema/cost policy；按单一 productActionId 归集成本与额度 | P4 受控实验；动作级成本/额度上限、真实成本对照与回退门 |
| 小青 | CloudBase Agent | 受控工具合同 | signed internal API | P4 agent |
| 领域业务策略 | 各所属应用服务 | 各领域规则 | typed policy release / active pointer | P1 config contract + 各 Phase |
| 第三方 Provider 配置 | shared foundation + 对应 Adapter | 不承载领域规则 | provider config release / request snapshot | P1 config contract / P5 real API |
| 密钥与签名材料 | CloudBase 受控环境/凭证系统 | 不进入领域 | credential_ref / rotation audit | P0 security / P5 real API |
| 业务关键变量目录 | 各变量所属业务域；共享层只做机械校验 | 类型化不可变策略或不可配置硬规则 | configuration-variable-catalog / typed release | P1 configuration gate |

机器门禁：业务节点覆盖率 100%；每条关系必须有 owner、API/事件、表和 Expected；共享层不得承担业务事实。任何新业务常量必须先进入关键变量目录并完成状态分类。
