# 数据表所有权

| 所有者 | 允许写入 |
|---|---|
| identity | users、platform_identities、user_sessions、service_replay_nonces；不另建 principal_mappings |
| plant-knowledge | taxonomy、identity、alias、evidence、CMS、release、enrichment、三轴筛选预计算索引（031，离线回填写入、HTTP 只读） |
| user-plant | user_plants、profile、care_context、assets、timeline projection、guest 及 authenticated Ephemeral backing case / promotion / binding |
| care | facts、plans、reminders、weather、soil evidence、environment observations/snapshots/derivations、care decision derivations、temporary care；Care 只读 plant-knowledge 已发布的 Internal Care Knowledge / Reference Profile，不直接写知识表 |
| diagnosis | diagnosis、answers、evidence、results、temporary diagnosis；诊断来源与主张、原因/Outcome/Action 候选修订、逐项来源关联、CMS 审核凭据、专用 release/active 指针与激活审计（逻辑合同见[诊断知识持久化与发布](../contracts/diagnosis-knowledge-persistence.md)，当前未建表） |
| subscription | entitlement、payment、care points、AI quota、reward inbox |

禁止跨函数直接写表。跨域读取使用带用户范围、版本和服务签名的内部 API。

`platform_identities` 是平台主体到统一用户的唯一映射事实源，`user_sessions` 保存已认证会话；二者共同承担旧计划中 `principal_mappings` 的语义，禁止再建重复映射表。


## 2026-10-03 Care / Ephemeral 增量所有权

- `authenticated_ephemeral_plant_cases`、`authenticated_ephemeral_promotion_commands`、`authenticated_ephemeral_case_bindings` 由 `user-plant` 单一写入。游客旧 `guest_*` 表继续由 `user-plant` 拥有，两套 backing case 不合并。
- `temporary_care_*` 由 `care` 写，`temporary_diagnosis_*` 由 `diagnosis` 写；二者只保存自己的 Ephemeral 外键，不跨域更新 binding。
- `care_environment_observations / snapshots / derivations` 与 `care_decision_derivations` 均由 `care` 写。前者只承载环境/栽培派生；`growth_activity_state / personal_calibration / dry_progress` 进入后者。`growth_activity_state` 虽消费植物知识与植物事实，也只是本次 Care 决策派生，不是 `plant-knowledge` 可直接写回的永久植物属性。
- `plant-knowledge` 负责结构化性状证据的来源保留、归一、审核与不可变知识发布；`care` 只能按 release 引用读取，不得运行时直接把 `tropicals_species_encyclopedia_ref` 展示字段当规则。
