# 微信小程序本地函数 404 避坑记录

更新时间：2026-05-26

## 根因

`dev:mp-weixin:local-functions` 和 `dev:mp-weixin:local-functions:lan` 只把小程序请求指到本地 `VITE_API_BASE_URL`，但没有自动启动完整本地 CloudBase HTTP 函数 gateway。开发者如果没有先跑 `npm run dev:functions`，或只启动了单个函数，本地 `3010` gateway 不完整，首页依赖的天气、用户植物、诊断历史等接口就会 404。

另一个本地阻断点是 `weather-http`：本地 development 环境缺少 `QWEATHER_API_KEY` 时会导致首页天气接口失败，进而让“本地接口全部 200”的验收不成立。

## 修复办法

1. 小程序本地脚本启动前先检查 gateway health 和每个必需函数的 health route。
2. gateway 未运行时，由小程序脚本自动启动完整本地函数集。
3. gateway 已运行但函数不完整时直接失败并提示缺失函数，避免带着 404 进入微信开发者工具。
4. `weather-http` 在 development 且缺少天气密钥时返回本地 fallback 天气数据；生产逻辑保持失败，不隐藏线上配置问题。

## 验收口径

不能只看 `Build complete`。必须用微信开发者工具 MCP 或等价方式验证首页业务接口实际返回：

- HTTP status 为 `200`
- 业务 `code` 为 `200`
- loopback：`npm run dev:mp-weixin:local-functions`
- LAN：`npm run dev:mp-weixin:local-functions:lan`
