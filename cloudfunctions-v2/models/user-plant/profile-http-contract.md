# 用户植物档案修改 HTTP 合同

> 2026-10-10 起：请求 Schema 由 `profile-patch/v1` 升级为 `profile-patch/v2`（v1 字段语义不变，合并为一套校验），新增环境分组、城市目录校验、可信策略须含完整度策略原文与首株奖励事件，见 `docs/backend-v2/contracts/user-plant-environment-profile.md`。本文其余协议顺序、幂等与脱敏条款继续有效。

本合同冻结本轮已授权的 `PATCH /api/v2/user-plants/{userPlantRef}`、操作标识 `updateUserPlant`。认证主体为平台无关统一用户。客户端只可提交 `profile-patch/v1` 的旧聚合版本 `version`，以及至少一项昵称 `nickname` 或完整实测盆器 `measuredPot`。省略保留原值；空昵称表示清除。不得提交归属、策略版本、服务端时间或未知字段。盆器测量以同目录唯一 JSON Schema 为准。

```text
已发布请求限制 → JSON媒体与实际字节大小
→ 青花植会话认证 → 统一用户 → 目标植物归属读取
→ 严格客户端事实与幂等头 → 可信发布策略构造命令
→ 同事务应用保存 → 严格完整UserPlantDto → 脱敏请求结果事件
```

请求体字节上限由 `maxBodyBytes` 提供，未发布或非法时第一阶段返回 `503 SERVICE_UNAVAILABLE`。`resolveWritePolicy` 必须提供有效 `profileVersion` 与正整数幂等保留毫秒数。缺失或非法策略返回503且禁止调用保存端口；本路由不定义默认值或新增配置项。策略接线和发布由主代理维护。

`Idempotency-Key` 必须为单值、8至128个可打印 ASCII 字符；重复头即使被运行器合并也拒绝。幂等范围由主体摘要、固定方法PATCH、路径模板和操作标识隔离。主体与幂等键以 SHA-256 摘要传入用例。请求摘要为规范化 JSON `{userPlantRef,version,nickname?,measuredPot?}` 的 SHA-256，不包含服务端时间或策略；字段排序、正文空白不改变摘要。

成功只允许200与完整 `UserPlantDto`，可包含严格 `profile`，不能用内部昵称或测量子集替代。应用完成错误仅允许404 `USER_PLANT_NOT_FOUND`、409 `USER_PLANT_VERSION_CONFLICT`、409 `IDEMPOTENCY_CONFLICT`、503 `SERVICE_UNAVAILABLE`，均使用严格公开错误结构。无登记错误、状态不一致、额外受限字段或损坏收据泛化为500，不暴露原始异常。

请求阶段错误包括400非法DTO/幂等头、401会话失效、404对象不归属、413实际字节超限、415媒体不支持。归属拒绝先于正文DTO，所有拒绝均不得进入保存端口。请求结果审计仅包含允许/拒绝/失败类别与公开错误类型，不记录令牌、主体、正文或内部编号。

验证层为 L3 集成、`unit_fake`：真实 `node:http`、路由分发、固定请求链、严格事实及公开响应校验；身份、归属读取、发布策略与事务应用端口为替身。覆盖正常协议、非法输入、失败即停、归属隔离、摘要稳定及公开响应脱敏。不证明真实MySQL持久化、事务回滚、幂等恢复、微信凭证验真或部署；这些属于应用和后续纵向验证边界。
