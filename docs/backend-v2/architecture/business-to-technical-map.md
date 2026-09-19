# 业务到技术映射清单

| 业务节点 | 应用服务 | 领域核心 | 数据/事件 | 验收入口 |
|---|---|---|---|---|
| 统一用户 | identity | Identity Domain | users/platform_identities | P2 identity |
| 用户植物 | user-plant | User Plant Core | user_plants | P2 user-plant |
| 植物分类 | plant-knowledge | Knowledge Domain | plant_taxa/identity release | P1 identity audit |
| CMS 展示百科 | plant-knowledge | Knowledge Domain | enrichment/release | P3 CMS |
| 积分和等级 | subscription | Reward Domain | care_point_ledger | P3/P4 reward |
| AI 额度 | subscription | Entitlement/Reward Domain | ai_quota_* | P2/P5 quota |
| 养护 | care | Care Domain | facts/plans/evidence | P4 care |
| 诊断 | diagnosis | Diagnosis Domain | sessions/results | P4 diagnosis |
| 小青 | CloudBase Agent | 受控工具合同 | signed internal API | P4 agent |

机器门禁：业务节点覆盖率 100%；每条关系必须有 owner、API/事件、表和 Expected；共享层不得承担业务事实。

