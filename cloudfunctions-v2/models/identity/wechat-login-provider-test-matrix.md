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
