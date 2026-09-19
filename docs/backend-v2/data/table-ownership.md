# 数据表所有权

| 所有者 | 允许写入 |
|---|---|
| identity | users、platform_identities、user_sessions、service_replay_nonces；不另建 principal_mappings |
| plant-knowledge | taxonomy、identity、alias、evidence、CMS、release、enrichment |
| user-plant | user_plants、profile、care_context、assets、timeline projection |
| care | facts、plans、reminders、weather、soil evidence、temporary care |
| diagnosis | diagnosis、answers、evidence、results、temporary diagnosis |
| subscription | entitlement、payment、care points、AI quota、reward inbox |

禁止跨函数直接写表。跨域读取使用带用户范围、版本和服务签名的内部 API。

`platform_identities` 是平台主体到统一用户的唯一映射事实源，`user_sessions` 保存已认证会话；二者共同承担旧计划中 `principal_mappings` 的语义，禁止再建重复映射表。
