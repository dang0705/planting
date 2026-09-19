# 业务到技术映射清单

| 业务节点 | 应用服务 | 领域核心 | 数据/事件 | 验收入口 |
|---|---|---|---|---|
| 统一用户与访问主体 | identity | Identity Domain | users/platform_identities/user_sessions/service_replay_nonces；不创建 principal_mappings | P1 合同门 / P2 identity |
| 用户植物 | user-plant | User Plant Core | user_plants | P2 user-plant |
| 植物分类 | plant-knowledge | Knowledge Domain | plant_taxa/identity release | P1 identity audit |
| CMS 展示百科 | plant-knowledge | Knowledge Domain | enrichment/release | P3 CMS |
| 积分和等级 | subscription | Reward Domain | care_point_ledger | P3/P4 reward |
| AI 额度 | subscription | Entitlement/Reward Domain | ai_quota_* | P2/P5 quota |
| 养护 | care | Care Domain | facts/plans/evidence | P4 care |
| 诊断 | diagnosis | Diagnosis Domain | sessions/results | P4 diagnosis |
| 小青 | CloudBase Agent | 受控工具合同 | signed internal API | P4 agent |
| 领域业务策略 | 各所属应用服务 | 各领域规则 | typed policy release / active pointer | P1 config contract + 各 Phase |
| 第三方 Provider 配置 | shared foundation + 对应 Adapter | 不承载领域规则 | provider config release / request snapshot | P1 config contract / P5 real API |
| 密钥与签名材料 | CloudBase 受控环境/凭证系统 | 不进入领域 | credential_ref / rotation audit | P0 security / P5 real API |
| 业务关键变量目录 | 各变量所属业务域；共享层只做机械校验 | 类型化不可变策略或不可配置硬规则 | configuration-variable-catalog / typed release | P1 configuration gate |

机器门禁：业务节点覆盖率 100%；每条关系必须有 owner、API/事件、表和 Expected；共享层不得承担业务事实。任何新业务常量必须先进入关键变量目录并完成状态分类。
