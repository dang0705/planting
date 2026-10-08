# 多平台身份与访客（guest）身份调研

> 调研日期：2026-10-08；只读网络调研，不含任何实测调用。
> 置信度：**高** = 官方文档原文已核对；**中** = 官方文档有但细节不全或需推断；**低** = 仅第三方资料或未找到官方说明。
> 适用范围：青花植 `identity` 域的平台登录适配器（Provider Adapter）与访客会话设计。

## 0. 一句话结论

- 三个平台都有“前端拿一次性 code → 服务端换取平台用户标识”的登录方式，但**接口形态差异很大**（GET 查询参数 / POST JSON / 先换 access_token 再 GET），必须一个平台一个适配器。
- 只有**抖音**有官方的“匿名登录凭证”（`anonymousCode` → `anonymous_openid`）；微信、小红书官方文档里**没有**匿名凭证。
- CloudBase 匿名登录**官方明确适配**的是微信小程序、uni-app（含抖音小程序）；**小红书没有官方适配器**。
- **推荐方案 (c)：服务端自签发的随机访客令牌（guest session token），不依赖第三方身份。** 抖音 `anonymous_openid` 只作为可选的防滥用信号，不作为访客主键。CloudBase 匿名登录不建议作为访客身份的根。

---

## 1. 微信小程序 `code2Session`

| 项 | 内容 | 置信度 |
|---|---|---|
| 地址/方法 | `GET https://api.weixin.qq.com/sns/jscode2session` | 高 |
| 参数（query） | `appid`、`secret`、`js_code`（`wx.login` 返回的 code）、`grant_type=authorization_code`（固定值） | 高 |
| 成功返回 | `openid`、`session_key`、`unionid`（仅当小程序绑定了微信开放平台账号时才返回） | 高 |
| 失败返回 | `errcode`、`errmsg` | 高 |
| 错误码 | `-1` 系统繁忙稍后重试；`40029` js_code 无效；`40226` 高风险用户、登录被拦截；`45011` 分钟级调用频率超限，下一分钟重试 | 高 |
| 频率限制 | 文档**没有给出具体数字**，只有 `45011` 表示存在“每分钟配额” | 高（“未给数字”这一点） |
| code 有效期 | `wx.login` 文档：code “有效期五分钟” | 高 |
| code 一次性 | 登录流程文档：“临时登录凭证 code 只能使用一次” | 高 |
| 是否需要用户授权 | `wx.login` 对普通小程序不需要用户授权（静默可调）；插件场景另有限制 | 高 |
| 匿名凭证 | **无**。微信没有类似抖音 `anonymousCode` 的匿名登录凭证 | 中（官方文档未提及即视为没有） |
| 安全约束 | 必须在服务端调用；`session_key` 不得下发到小程序、不得对外提供 | 高 |

要点（前端类比）：code 像“一次性取件码”，5 分钟内只能核销一次；重复提交同一个 code 会得到 `40029` 一类错误——这与我们“登录接口不要求 Idempotency-Key、同一 code 重试拒绝”的规则一致。

## 2. 抖音小程序 `code2Session`

| 项 | 内容 | 置信度 |
|---|---|---|
| 正式地址 | `POST https://developer.toutiao.com/api/apps/v2/jscode2session` | 高 |
| 沙盒地址 | `POST https://open-sandbox.douyin.com/api/apps/v2/jscode2session` | 高 |
| 请求头 | `content-type: application/json`（固定） | 高 |
| Body | `appid`、`secret`、`code`（`tt.login` 返回）、`anonymous_code`（`tt.login` 返回的匿名凭证）；另有一个 `refresh`（bool），文档未说明含义 | 高（`refresh` 含义：低） |
| 成功返回 | `{ err_no: 0, err_tips: "success", log_id, data: { session_key, openid, anonymous_openid, unionid } }` | 高 |
| 字段返回条件 | `session_key`/`openid`/`unionid` 仅在传 `code` 时返回；`anonymous_openid` 仅在传 `anonymous_code` 时返回 | 中（官方示例 + 第三方 SDK 注释一致） |
| 错误码（HTTP 都是 200，看 `err_no`） | `0` 成功；`-1` 系统错误；`40014` 缺必要参数；`40015` appid 错误；`40017` secret 错误；`40018` code 错误（常见原因：`tt.login` 用的 appId 与接口传的 appid 不一致）；`40019` anonymous_code 错误 | 高 |
| 频率限制 | 文档页**未写**频率限制 | 高（“未写”这一点） |
| 一次性 | “登录凭证 code，anonymous_code 只能使用一次”；“非匿名需要 code，非匿名下的 anonymous_code 用于数据同步，匿名需要 anonymous_code” | 高 |

`tt.login`（前端）关键事实（官方 JS API 文档）：

- `force` 默认 `true`：用户没在抖音 App 登录时会弹宿主登录框，用户取消回调 `113001 host login fail`。若想静默做访客，应传 `force: false`。（高）
- “只有宿主登录的用户 success 才有 code，否则只有 anonymousCode”。（高）
- `anonymousCode`：“用于标识当前设备，无论登录与否都会返回，有效期 5 分钟”；“同一台手机 anonymous_openid 是相同的”。（高）
- `isLogin`：用户在当前宿主 App（抖音/头条）是否已登录。（高）

**anonymous_openid 能否当访客身份？** 能当“设备级弱标识”：它由抖音服务端签发、同一手机稳定，伪造成本比客户端随机数高。但它是“设备”不是“人”，换手机/清数据行为文档未说明；且仅抖音有，不能作为三端统一方案。

## 3. 小红书小程序 code 换取

官方文档公开可读（无需登录控制台），但登录分两步：**先用 appid+secret 换应用级 access_token，再用 access_token + code 换 openid**。

### 3.1 获取应用调用凭证（文档更新时间 2025-03-18）

| 项 | 内容 | 置信度 |
|---|---|---|
| 地址/方法 | `POST https://miniapp.xiaohongshu.com/api/rmp/token` | 高 |
| Body | `appid`、`secret` | 高 |
| 返回 | `{ data: { access_token, expire_in }, success, msg, code }`，`code=0` 为成功 | 高 |
| 约束 | 有效期 2 小时需定时刷新；生成新 token 后旧 token 有效期缩短到 5 分钟；同一时间最多两个 token 生效；存储至少预留 128 字符 | 高 |

### 3.2 code2Session（文档更新时间 2025-08-05）

| 项 | 内容 | 置信度 |
|---|---|---|
| 地址/方法 | `GET https://miniapp.xiaohongshu.com/api/rmp/session` | 高 |
| Query | `app_id`、`access_token`（上一步获得）、`code`（`xhs.login` 获得） | 高 |
| 返回 | `{ data: { openid, session_key }, success, msg, code }`，`code=0` 为成功 | 高 |
| 错误码 | 页面写“参见错误码”，统一错误码表本次**未能读取到具体条目** | 低（需开发时补读） |
| 频率限制 | 文档未写 | 中 |
| code 有效期/一次性 | code 有效期 5 分钟；“临时登录凭证 code 只能使用一次” | 高 |
| unionid | 登录态管理文档（2024-11-13）：“暂不提供用户在小红书开放平台帐号下的唯一标识” | 高 |
| 匿名凭证 | 官方文档**未发现**任何匿名 code / 匿名 openid | 中 |
| 字段名注意 | 登录态管理文档写 `open_id`，接口文档返回字段写 `openid`，以接口文档为准并做实测确认 | 中 |
| `xhs.login` 前端细节 | 是否静默、失败码等**未读到**官方 JS API 页面 | 低 |

适配器影响（前端类比）：小红书适配器像“先拿后台通行证再去换用户票”——需要一个**应用级 access_token 缓存**（类似前端全局缓存的 token，2 小时过期、提前刷新、并发刷新要去重），这是三端里唯一需要额外缓存层的一家。

## 4. CloudBase 匿名登录

### 4.1 能否在抖音、小红书小程序里用？

| 结论 | 置信度 |
|---|---|
| `@cloudbase/js-sdk` 本身只支持浏览器，非浏览器平台需要“适配器（adapter）” | 高 |
| 官方适配器：微信小程序（JS SDK 已默认集成）、uni-app、Node、React Native、Cocos；快应用为社区仓库 | 高 |
| uni-app 适配器官方声明支持：H5、微信、支付宝、**抖音小程序**、iOS、Android | 高 |
| **小红书小程序没有官方适配器**，需要自写适配器（实现网络请求、存储、平台标识） | 高（“没有官方适配器”）/ 自写可行性：低 |
| 也可绕开 SDK，直接调 HTTP API `POST /auth/v1/signin/anonymously`（理论上任何能发 HTTPS 的平台都行，需在平台后台配置合法请求域名）；未实测 | 中 |

### 4.2 匿名登录 HTTP API 关键事实

- `POST https://{envId}.api.tcloudbasegateway.com/auth/v1/signin/anonymously`，请求头必须带 `x-device-id`；`client_id` 可选（默认环境 ID）；Body `{}`。（高）
- “同一个设备ID最多只能注册一个匿名用户”；“设备ID需要客户端随机生成并缓存”。（高）——**注意：设备 ID 由客户端自己生成，所以匿名身份的可信度本质上等于“客户端随机数”。**
- 返回 `token_type: Bearer`、`access_token`、`expires_in: 7200`、`scope: anonymous`、`sub`（匿名用户 ID）。（高）
- 控制台未开启匿名登录时返回 `unimplemented`。（高）
- 匿名用户可通过绑定其他登录方式“升级”为正式用户，文档未给步骤。（中）
- access_token 是 JWT：含 `sub`、`role`（匿名为 `anon`）、`aud`（envId）、`iss`、`exp`、`is_anonymous`；**未公开签名算法与公钥（JWKS）**，无法离线验签。（中）

### 4.3 服务端（云函数）如何验证 CloudBase 匿名用户

| 方式 | 说明 | 置信度 |
|---|---|---|
| `GET /auth/v1/token/introspect` | 请求头 `Authorization: Bearer <access_token>`；有效返回 `{ token_type, client_id, sub, scope }`，无效返回 `{}`。官方建议“避免频繁调用” | 高 |
| `GET /auth/v1/user/me` | 同样 Bearer；返回用户资料、绑定身份源等 | 高 |
| HTTP 网关身份认证 | 网关可开启身份认证，未带凭证返回 `MISSING_CREDENTIALS`；但**文档未说明网关校验后如何把 uid 传给 HTTP 云函数** | 中 |
| Node SDK `auth().getUserInfo()` | 返回 `uid/openId/appId/customUserId`，示例都在 `exports.main(event, context)` 事件函数中；**是否适用于 HTTP 云函数（原生 node:http、端口 9000）文档未说明** | 低 |
| Node SDK `getEndUserInfo(uid)` | 按 uid 查资料（SDK ≥ 2.2.5），需服务端凭证初始化 | 中 |
| 自定义登录 `createTicket` | 服务端用“自定义登录私钥文件”（`tcb_custom_login.json`）签 ticket，客户端用 `POST /auth/v1/signin/custom` 换 token；这是“我方身份 → CloudBase 身份”的方向，不是验证匿名用户 | 高 |

凭证：introspect / user/me 只需用户自己的 Bearer token（不需要 SecretId/SecretKey）；Node SDK 的管理类接口需按仓库宪章使用受控显式凭证（SecretId/SecretKey 或对应私钥文件），不得入库/入日志。

**实际代价**：每个访客请求要么多一次对 CloudBase 认证服务的网络往返（introspect），要么依赖未文档化的网关透传行为。

## 5. 多平台访客身份方案对比

| 维度 | (a) 三端统一 CloudBase 匿名登录 | (b) 平台原生匿名标识 | (c) 服务端自签访客令牌（推荐） |
|---|---|---|---|
| 三端覆盖 | 微信 ✅；抖音 ✅（经 uni-app 适配器）；小红书 ❌ 官方无适配器，需自写或直调 HTTP API | 仅抖音有 `anonymous_openid`；微信、小红书无 → **无法统一** | ✅ 完全平台无关，只需 HTTPS |
| 身份可信度 | 设备 ID 由客户端随机生成 → 与 (c) 同级；多了一层第三方签发 | 抖音侧最高（平台服务端签发、同机稳定） | 高熵随机令牌 + 服务端只存哈希；可信度=“持有令牌即访客本人” |
| 防滥用 | 依赖 CloudBase 侧限制（文档未给匿名注册频控）；无法按我方规则控 | 抖音：可按 `anonymous_openid` 限流；其他端无 | 我方可控：签发频控（IP/设备指纹）、访客会话短 TTL、每访客临时病例数量上限；可**可选**叠加抖音 `anonymous_openid` 哈希作为限流键 |
| 服务端验证 | 每请求 introspect（网络往返）或依赖未文档化网关透传；JWT 无公开公钥无法离线验 | 只在签发时换一次，之后仍需我方会话 → 实际上还是 (c) | 本地查表/比哈希，无外部依赖，可写进 MySQL 事务 |
| 登录后认领（claim） | 需要把 CloudBase `sub` 映射到我方 guest 记录，再迁到 `user_id`；多一层映射 | 抖音可用同机 `anonymous_openid` 关联；其他端不行 | 登录请求同时携带“访客令牌 + 新平台 code”，服务端在同一事务里：验证访客令牌 → 解析 `user_id` → 原子转移临时病例 → 作废访客令牌（一次性） |
| 与宪章冲突 | 业务数据不能以第三方主体为键，需额外隔离；新增对 CloudBase Auth 的运行期依赖与认证配置 | 违背“三端平等身份地位” | 符合“平台无关 `user_id`、身份集中在 identity 域” |
| 实现工作量 | 中-高（小红书适配器、introspect 缓存、控制台开关、多一套 token 生命周期） | 低（抖音）但不完整 | 低-中（令牌签发/哈希存储/TTL/认领事务，均为我方已有能力） |

关于微信的特殊点：微信 `wx.login` 是**静默**的，不需要用户点击授权就能拿 code → openid。也就是说在微信端“访客”与“静默登录”只隔一步；是否让微信端跳过访客直接静默登录属于产品决策，本报告不替代该决策。

## 6. 推荐

**采用 (c)：服务端自签发的访客会话令牌，替换当前设计中的 `authProvider: 'cloudbase_anonymous'`。**

理由（按重要性）：

1. 三端唯一能统一落地的方案；CloudBase 匿名登录在小红书没有官方适配路径。
2. CloudBase 匿名身份的根是“客户端随机生成的 `x-device-id`”，可信度并不高于我方自签随机令牌，却多了外部依赖、每请求校验成本和未文档化的网关行为。
3. 认领流程可以完全在我方 MySQL 事务内完成，满足“重复提交/幂等、失败恢复、持久化读回”的宪章要求。

建议形态（供 identity 域合同讨论，非最终合同）：

- 访客令牌：≥256 bit 随机数，只在签发响应中返回一次；服务端只存 SHA-256 哈希 + 过期时间 + 状态（active/claimed/expired）。
- 可选平台信号：抖音端可在签发时附带 `anonymous_code`，服务端换出 `anonymous_openid` 后 **HMAC 哈希**存为防滥用键（不作业务主键、不进响应/日志）。微信/小红书不提供。
- 认领：登录接口接收可选的访客令牌；验证通过后在同一事务内把临时病例转给 `user_id` 并把令牌置为 `claimed`；同一令牌再次认领拒绝。
- 需要主代理裁决并登记到 `configuration-variable-catalog.json` 的变量（本报告**不设默认值**）：访客令牌 TTL、签发频控阈值、单访客临时病例上限、是否启用抖音匿名信号。

## 7. 未确认事项（开发前需补证）

1. 小红书服务端统一错误码表具体条目；`xhs.login` 是否静默、失败码。
2. 三端 code2Session 的具体频率配额（文档均未给数字）。
3. 抖音 `refresh` 参数含义。
4. 若仍考虑 (a)：CloudBase HTTP 网关开启身份认证后，HTTP 云函数如何拿到调用者 `sub`（需实测）。

## 8. 来源

| # | 来源 | 日期 |
|---|---|---|
| S1 | 微信 code2Session：https://developers.weixin.qq.com/miniprogram/dev/server/API/user-login/api_code2session.html | 页面未标更新日期 |
| S2 | 微信登录接口索引：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html | 未标 |
| S3 | 微信 wx.login：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html | 未标 |
| S4 | 微信登录流程：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html | 未标 |
| S5 | 抖音 code2Session：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/basic-abilities/log-in/code-2-session | 示例 log_id 含 2024-10-21 |
| S6 | 抖音 tt.login：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/open-interface/log-in/tt-login | 未标 |
| S7 | 第三方 Go SDK（字段返回条件佐证）：https://pkg.go.dev/github.com/Caiqm/bytedance | — |
| S8 | 小红书登录态管理：https://miniapp.xiaohongshu.com/doc/DC473950 | 2024-11-13 |
| S9 | 小红书 code2session：https://miniapp.xiaohongshu.com/doc/DC414670 | 2025-08-05 |
| S10 | 小红书获取应用调用凭证：https://miniapp.xiaohongshu.com/doc/DC010382 | 2025-03-18 |
| S11 | CloudBase 匿名登录 HTTP API：https://docs.cloudbase.net/http-api/auth/auth-sign-in-anonymously | 未标 |
| S12 | CloudBase 验证 token：https://docs.cloudbase.net/http-api/auth/auth-token-introspect | 未标 |
| S13 | CloudBase 当前用户：https://docs.cloudbase.net/http-api/auth/user-me | 未标 |
| S14 | CloudBase 自定义登录：https://docs.cloudbase.net/http-api/auth/auth-sign-in-custom | 未标 |
| S15 | CloudBase AccessToken：https://docs.cloudbase.net/http-api/basic/access-token | 未标 |
| S16 | CloudBase JWT 声明（PG 身份认证）：https://docs.cloudbase.net/authentication-v2/auth/auth-pg | 未标 |
| S17 | CloudBase Node SDK auth：https://docs.cloudbase.net/api-reference/server/node-sdk/auth | 未标 |
| S18 | CloudBase 适配器指引：https://docs.cloudbase.net/api-reference/webv3/adapter/ | 未标 |
| S19 | CloudBase 微信适配器：https://docs.cloudbase.net/api-reference/webv3/adapter/weixin-adapter | 未标 |
| S20 | CloudBase uni-app 适配器（支持平台列表）：https://docs.cloudbase.net/api-reference/webv3/adapter/uniapp-adapter | 未标 |
| S21 | CloudBase 云函数调用方式：https://docs.cloudbase.net/cloud-function/function-calls/ | 未标 |
| S22 | CloudBase 云函数 FAQ（MISSING_CREDENTIALS）：https://docs.cloudbase.net/en/cloud-function/faq | 未标 |
