# 微信小程序本地函数 404 避坑记录

更新时间：2026-05-26

## 根因

`dev:mp-weixin:local-functions` 和 `dev:mp-weixin:local-functions:lan` 只把小程序请求指到本地 `VITE_API_BASE_URL`，但没有自动启动完整本地 CloudBase HTTP 函数 gateway。开发者如果没有先跑 `npm run dev:functions`，或只启动了单个函数，本地 `3010` gateway 不完整，首页依赖的天气、用户植物、诊断历史等接口就会 404。

另一个本地阻断点是 `weather-http`：本地 development 环境缺少 `QWEATHER_API_KEY` 时会导致首页天气接口失败，进而让“本地接口全部 200”的验收不成立。

CI 密钥治理移除 `cloudbaserc.json` 中的明文密钥后，本地 `tcb-ff` 进程也不再有隐式 CloudBase SQL/Auth/Storage 凭据。此时 gateway 和 health route 可以是 200，但 `/plant-user-http/user-plants` 等业务接口会在 `models.$runSQL` 报 `SIGN_PARAM_INVALID / secret id error`。

## 修复办法

1. 小程序本地脚本启动前先检查 gateway health 和每个必需函数的 health route。
2. gateway 未运行时，由小程序脚本自动启动完整本地函数集。
3. gateway 已运行但函数不完整时直接失败并提示缺失函数，避免带着 404 进入微信开发者工具。
4. `weather-http` 在 development 且缺少天气密钥时返回本地 fallback 天气数据；生产逻辑保持失败，不隐藏线上配置问题。
5. 本地 gateway 启动前检查 `.env.local` 或 shell 是否存在完整 CloudBase SecretId/SecretKey；缺失时直接失败并提示配置未提交的本地凭据，不能把密钥写回仓库。
6. 小程序本地启动脚本对 `plant-user-http/user-plants` 做轻量业务探针，避免 3010 上已有旧 gateway 时只看 health 200 而漏掉业务 500。

## 验收口径

不能只看 `Build complete`。必须用微信开发者工具 MCP 或等价方式验证首页业务接口实际返回：

- HTTP status 为 `200`
- 业务 `code` 为 `200`
- loopback：`npm run dev:mp-weixin:local-functions`
- LAN：`npm run dev:mp-weixin:local-functions:lan`

如果验收业务接口而不是 health route，必须先在未提交的 `.env.local` 或 shell 中配置已轮换的最小权限 CloudBase 凭据。`CLOUDBASE_*`、`TENCENT_*`、`TENCENTCLOUD_*` 三套命名都可用；不要使用已泄漏的旧密钥。
