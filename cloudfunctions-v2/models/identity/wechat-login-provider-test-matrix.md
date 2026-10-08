# 微信小程序登录凭证交换适配器测试矩阵（E03，cases 先于产品）

对象：`createWechatMiniprogramCredentialProvider`，实现既有端口 `PlatformCredentialProvider<string>`（`src/identity/provider/platform-credential-evidence.ts`）。
Runner：Vitest（`cloudfunctions-v2/vitest.config.mjs`）。层次 L3 `unit_fake`：只替换 `fetch` 边界；HMAC 与会话签发不在本对象。
Expected 来源：
- 微信官方《小程序登录 code2Session》：`GET https://api.weixin.qq.com/sns/jscode2session`，参数 `appid`、`secret`、`js_code`、`grant_type=authorization_code`；成功返回 `openid`、`session_key`（可选 `unionid`）；失败返回 `errcode`/`errmsg`，其中 40029 code 无效、40163 code 已被使用、45011 频率限制、40226 高风险用户、-1 系统繁忙。
- 配置目录 `wechat_miniprogram_login` 档案（用户 2026-10-08 批准）：总时限 5000ms、只调用 1 次不重试、凭证引用 `env:WECHAT_MINIPROGRAM_PRIVATE_KEY`。
- 宪章第4节：OpenID、session_key、AppSecret、code 不得出现在错误、日志或公开响应。
未覆盖：真实微信接口（需有效 code，另做 e2e_real_api）。

| 维 | 用例 | 形态 | Expected 来源 | 状态 |
|---|---|---|---|---|
| I1 Happy | 拼装官方参数；成功返回 `{platform:'wechat', appScope, normalizedSubject: openid}`，丢弃 session_key/unionid | Happy | 官方文档 | 待写 |
| I3 错误语义 | errcode 40029、40163 → `PRINCIPAL_INVALID`（凭证无效，前端重新取 code） | Edge | 官方错误码 | 待写 |
| I3 错误语义 | errcode 45011、-1、40226 及其他 → `INTERNAL_IDENTITY_PROVIDER_INVALID` | Edge | 官方错误码＋档案 fallback 拒绝登录 | 待写 |
| I3 错误语义 | HTTP 非 2xx、网络错误、超时 → `INTERNAL_IDENTITY_PROVIDER_INVALID`，只调用 1 次 | Edge | 档案 maxAttempts=1、totalDeadline | 待写 |
| I2 缺字段 | 200 但缺 openid、openid 为空或带首尾空白、响应非 JSON → `INTERNAL_IDENTITY_PROVIDER_INVALID` | Edge | 官方成功响应必含 openid | 待写 |
| I4 范围 | 平台不是 wechat 或 appScope 与配置 AppID 不一致 → 不发请求，`PRINCIPAL_INVALID` | Reverse | 端口合同“禁止跨应用复用主体” | 待写 |
| U3 非法 | code 为空、非字符串或超长（>128） → 不发请求，`PRINCIPAL_INVALID` | Reverse | DTO 白名单＋官方 code 为短字符串 | 待写 |
| 脱敏 | 任一错误的 message 与序列化结果不含 AppSecret、code、openid、session_key | Reverse | 宪章第4节 | 待写 |
| 创建期 | AppID/AppSecret 缺失或空 → 创建时抛 `INTERNAL_IDENTITY_CONFIGURATION_INVALID` | Edge | 档案 fallback：凭证不可用拒绝登录 | 待写 |
| I5 | — | — | — | N/A：只读交换，无写入 |

Break：把 40163（code 已用）当成系统错误会让前端误重试同一 code。Mutation：把 40163 从“凭证无效”集合移除 → 对应用例应红。

## 登录会话策略读取器 `createMysqlIdentitySessionPolicyReader`（E03）

层次 L3 `unit_fake`：只替换 SQL 连接，策略解析使用真实 `resolveIdentitySessionPolicySnapshot`。Expected 来源：`principal-and-capability.md`（会话 24 小时、续期 0、无有效发布拒签不回退默认）、配置目录 `identity.user.session_ttl_hours`=24 已确认、既有发布表与活动指针结构（与 `care/mvp_glass` 读取器同一模式）。未覆盖：真实 MySQL（另做 mysql 套件）。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 活动指针连发布行 → 返回快照（TTL 24、续期 0、发布版本与摘要一致），查询参数为 identity/identity_sessions | Happy | 待写 |
| I2 缺字段 | 无行 → null（拒签）；多行 → null | Edge | 待写 |
| I3 错误语义 | 域/策略/结构版本不符、指针版本或摘要不符、正文 JSON 损坏、摘要被篡改 → null | Edge | 待写 |
| Reverse | 退役或已过期发布 → null，不回退源码默认 TTL | Reverse | 待写 |
| I3 | 数据库错误向上传播且连接被销毁（不吞成功） | Edge | 待写 |

## 微信登录验真工厂 `createWechatLoginVerifier`（E03）

层次 L3 `unit_fake`：只替换 fetch；HMAC 摘要用真实 `createVerifyPlatformCredentialUseCase`。Expected 来源：`principal-and-capability.md`“平台主体只存不可逆摘要、数据库只存密钥版本”；用户 2026-10-08 批准新建 `PLATFORM_SUBJECT_HMAC_KEY_V1`（版本 v1）；配置目录 `wechat_miniprogram_login` 凭证引用 `env:WECHAT_MINIPROGRAM_PRIVATE_KEY`。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 有效 code → 证据只含平台、应用范围与 `HMAC-SHA256(key, openid)` 摘要及版本 v1，不含 openid 原文 | Happy | 待写 |
| I2 缺配置 | 缺 AppID / AppSecret / HMAC 密钥，或密钥解码后不足 32 字节 → 创建时抛配置错误（拒绝登录，不回退） | Edge | 待写 |
| I3 | 微信返回 40029 → PRINCIPAL_INVALID 原样透出 | Edge | 待写 |

## 抖音登录适配器 `createDouyinMiniprogramCredentialProvider`（E03）

层次 L3 `unit_fake`：只替换 fetch。Expected 来源：`multi-platform-identity-research.md` 第 2 节（抖音官方 `POST https://developer.toutiao.com/api/apps/v2/jscode2session`，JSON `{appid, secret, code, anonymous_code}`，响应 `{err_no, err_tips, data:{openid, anonymous_openid, unionid, session_key}}`，40018 code 无效、40019 anonymous_code 无效）＋配置目录 `douyin_miniprogram_login`（用户 2026-10-09 批准）。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | code 登录：POST JSON 参数正确，返回 `{platform:'douyin', appScope, normalizedSubject: openid}`，丢弃 session_key/unionid | Happy | 待写 |
| I1 Happy | 匿名换取：只传 anonymous_code → 返回 anonymous_openid | Happy | 待写 |
| I3 | err_no 40018/40019 → PRINCIPAL_INVALID；-1/40015/40017/其他 → Provider 不可用；HTTP 非 2xx、网络错误、超时 → Provider 不可用；只调用 1 次 | Edge | 待写 |
| I2 | data 缺 openid（或匿名换取缺 anonymous_openid）→ Provider 不可用 | Edge | 待写 |
| I4 Reverse | 平台不是 douyin、appScope 不符、code 非法 → 不发请求 | Reverse | 待写 |
| 脱敏 | 错误不含 secret、code、openid | Reverse | 待写 |

## 多平台登录分派 `createPlatformLoginDispatcher`（E03）

层次 L3 `unit_fake`：只替换 fetch；HMAC 摘要与各平台适配器为真实实现。Expected 来源：identity-session-issuance.md 多平台请求（用户 2026-10-09 冻结）、配置目录三个登录 Provider 档案、`PLATFORM_SUBJECT_HMAC_KEY_V1`。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | wechat → 调微信端点并返回 HMAC 证据；douyin → 调抖音端点，证据平台为 douyin、应用范围为抖音 AppID、摘要为 HMAC(openid) | Happy | 待写 |
| I2 缺配置 | 只缺抖音配置时微信仍可登录，抖音返回配置错误；小红书一律配置错误（AppSecret 未配置） | Edge | 待写 |
| 隔离 | 同一 openid 在微信与抖音得到的证据平台不同（跨平台不串号） | Reverse | 待写 |
