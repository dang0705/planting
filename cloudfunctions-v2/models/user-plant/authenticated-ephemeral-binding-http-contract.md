# 已登录临时案例显式绑定已有植物公开合同

归属 E03 原票 `z8v0kmr9mj`。新增 `POST /api/v2/user-plants/ephemeral-cases/{ephemeralCaseRef}/bindings`，操作名 `bindAuthenticatedEphemeralCase`，仅接受 identity 验真的 user 主体。游客继续使用既有游客认领接口，两者不能混用。

路径案例引用为 `epc_` 加至少八个 ASCII 字母、数字、下划线或连字符，总长最多 64。正文target严格互斥：已有目标为 `{"type":"existing_user_plant","user_plant_id":"upl_…"}`；显式新建为 `{"type":"new_user_plant"}`，不能指定植物引用。植物引用同样后缀至少八字符、总长最多64。不接受额外属性、用户归属、服务端时间、有效期、命令引用或来源结果。

请求必须单值 `Idempotency-Key`，沿用现有八至128字符ASCII合同，只在服务端保存SHA-256。同案例同键同目标重放原成功，不改变原时间或结果；异目标冲突。命令引用由服务端使用随机高熵引用生成，不返回调用者。成功固定为200 `{"data":{"user_plant_id":"upl_…"}}`；不公开命令引用、案例内部状态、平台主体、结果原文或数据库键。

固定链顺序：已发布字节/媒体限制 → Bearer认证 → 统一主体 → 案例归属 → DTO与幂等头 → 服务端命令 → 原绑定应用事务 → 严格公开投影。案例不存在、跨用户和事务内目标不存在/跨用户统一404 `NOT_FOUND`。案例归属不判断期限，原收据仍可重放；新绑定资格仍由事务核验。目标归属由事务在实际读取植物前检查，不依赖客户端声明。不存在的案例先于正文DTO校验拒绝，避免以错误差异枚举他人案例。

稳定错误：非法输入400 `VALIDATION_FAILED`；凭据无效401 `PRINCIPAL_INVALID`；内容超限413 `PAYLOAD_TOO_LARGE`；媒体不支持415 `UNSUPPORTED_MEDIA_TYPE`；同键异目标409 `IDEMPOTENCY_CONFLICT`；本人案例不能新绑定409 `EPHEMERAL_CASE_NOT_BINDABLE`（不区分过期、失败或已绑定）；存储/发布限制不可用503 `SERVICE_UNAVAILABLE`；不合法应用结果或未分类异常500 `INTERNAL_ERROR`。响应和审计不得拼接异常原文或请求内容。

新建分支由服务端生成候选upl_引用并获取subscription能力。能力读取失败或未发布明确传null；原成功收据仍可重放，新请求没有能力则503。能力无创建资格或数量满为403 `CAPABILITY_DENIED`，能力快照到期为409 `CAPABILITY_SNAPSHOT_EXPIRED`。同键从新建切换已有目标属于冲突；新建重放可以返回第一次目标，而不返回本次候选。两分支成功投影一致。新建完整事务见 `authenticated-ephemeral-new-plant-contract.md`。

没有新默认时限、奖励或额度。正文限制来自已发布HTTP写策略，缺失则在认证及数据库访问前503。本接口不签发TTL、不创建案例，不使pending创建策略获得准入资格。已有目标不新增活跃植物或消耗创建名额；新建目标在同事务检查数量。两分支都不写计划、实际行为或积分。正式用户会话、案例创建策略和真实HTTP持久化分别验收，只有处理器或替身测试通过不能宣布整个E03完成。
