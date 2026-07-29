# Local Smoke Test And Lan Direct Connection Policy

## 1. 若使用 `payload.skipAuth = true`，则必须在请求中携带：
    - `x-terminal-e2e: true`
    - `x-app-env: development`（或等价的 development 环境标识）
## 2. 或者改用真实登录态/真实认证请求（不使用 skipAuth）。
## 3. 如未满足上面条件，本地 LAN direct HTTP 的 `question/start -> diagnosis/answer` 证据视为无效证据链，`question/start` 未落 session（典型 `skipPersistence=true`）导致的 `diagnosis/answer 404` 仅能归类为“测试构造错误 / 无效证据”，不得作为产品 blocker。
## 4. 结论写入建议明确标注：“本地 smoke 缺少环境/终端头导致会话未持久化，不代表后端能力退化。”
