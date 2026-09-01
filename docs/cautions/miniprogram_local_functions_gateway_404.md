# 微信小程序本地函数 404 避坑记录

更新时间：2026-05-26

## 根因

`dev:mp-weixin:local-functions` 和 `dev:mp-weixin:local-functions:lan` 把微信小程序请求指到独立的本地 `3010` gateway；抖音和小红书分别使用 `3020`、`3030`。如果手动把多个平台都指向同一个端口，或只启动了单个函数，本地 gateway 不完整，首页依赖的天气、用户植物、诊断历史等接口就会 404。

另一个本地阻断点是 `weather-http`：本地 development 环境缺少 `QWEATHER_API_KEY` 时会导致首页天气接口失败，进而让“本地接口全部 200”的验收不成立。

CI 密钥治理移除 `cloudbaserc.json` 中的明文密钥后，本地 `tcb-ff` 进程也不再有隐式 CloudBase SQL/Auth/Storage 凭据。此时 gateway 和 health route 可以是 200，但 `/plant-user-http/user-plants` 等业务接口会在 `models.$runSQL` 报 `SIGN_PARAM_INVALID / secret id error`。

如果错误变成 `Database connection failed, please check the corresponding database connection configuration`，说明 SecretId/SecretKey 已经进入 SQL 调用，但数据库连接配置或权限未通过。常见原因是当前 shell 用既有的 `CLOUDBASE_*` / `TENCENT_*` 覆盖了 `.env.local`、密钥账号没有目标环境 SQL 权限，或 CloudBase 控制台使用了非默认数据库连接名但本地没有设置 `CLOUDBASE_SQL_DBLINK_NAME`。

## 修复办法

1. 小程序本地脚本启动前先检查 gateway health 和每个必需函数的 health route。
2. gateway 未运行时，由小程序脚本自动启动完整本地函数集。
3. gateway 已运行但函数不完整时直接失败并提示缺失函数，避免带着 404 进入微信开发者工具。
4. `weather-http` 在 development 且缺少天气密钥时返回本地 fallback 天气数据；生产逻辑保持失败，不隐藏线上配置问题。
5. 本地 gateway 启动前检查 `.env.local` 或 shell 是否存在完整 CloudBase SecretId/SecretKey；缺失时直接失败并提示配置未提交的本地凭据，不能把密钥写回仓库。
6. 各平台本地启动脚本使用独立 gateway/worker 端口，并对 `plant-user-http/user-plants` 和 `weather-http/weather/current` 做轻量业务探针，避免复用其他平台 gateway 时只看 health 200 而漏掉首页业务 500；由于业务接口强制 Bearer 会话，未提供会话令牌时的预期 `401 请先登录` 会跳过，其他错误仍阻断。
7. 本地 SQL 封装支持可选 `CLOUDBASE_SQL_DBLINK_NAME` / `SQL_DBLINK_NAME`，只在控制台确实使用非默认数据库连接名时填写；真实密钥和连接名仍只放未提交的本地环境。

## 验收口径

不能只看 `Build complete`。必须用微信开发者工具 MCP 或等价方式验证首页业务接口实际返回：

- HTTP status 为 `200`
- 业务 `code` 为 `200`
- loopback：`npm run dev:mp-weixin:local-functions`
- LAN：`npm run dev:mp-weixin:local-functions:lan`

如果验收业务接口而不是 health route，必须先在未提交的 `.env.local` 或 shell 中配置已轮换的最小权限 CloudBase 凭据，并在真实小程序登录后验证 Bearer 会话。启动器若要提前做严格业务探针，可临时设置 `CLOUDBASE_LOCAL_SESSION_TOKEN`；不要使用已泄漏的既有密钥。
