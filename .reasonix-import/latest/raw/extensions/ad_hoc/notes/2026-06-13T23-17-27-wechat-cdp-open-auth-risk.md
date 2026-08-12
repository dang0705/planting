# WeChat MCP 端上 QA：cdp_enabled open 会重启 DevTools 并可能触发扫码授权

- 场景：`planting` 通过 WeChat DevTools MCP 验证 `/diagnosis/question/start` 端上 `wx.request`。
- 新教训：`wechat_ide(status)` 与 `wechat_ide(is_login)` 是非破坏前置检查；但 `wechat_ide(open, cdp_enabled=true)` 在当前 `wechat-devtools-mcp v0.9.8` 实现里会先杀掉已有微信开发者工具进程，再用 `--remote-debugging-port=9222 --project=...` 重启 IDE。
- 影响：即使没有调用 `wechat_ide(login)`，也没有执行 `cache_clean(clean_type="all")`，该重启路径仍可能导致微信开发者工具重新要求扫码登录、项目授权或自动化调试授权。
- QA 规则：保护登录态/授权态时，端上验证必须优先使用非破坏流程：`status -> is_login -> 检查/复用 9420 -> wechat_automator start/page_stack/page_data/evaluate(wx.request)`。不要为了 CDP 基线默认调用 `open(cdp_enabled=true)`。
- 若 9420 不可用，应优先尝试 `wechat_automator start` 或底层 `miniprogram-automator` connect/launch fallback，并保留 raw error；只有在用户明确同意可重启 DevTools 或当前完全没有可复用 IDE/automator 会话时，才使用可能重启的 `open(cdp_enabled=true)`。
- 归因：`open(cdp_enabled=true)` 触发重新扫码/授权应归为 DevTools/automation session side effect，不得误判为产品接口失败或产品通过。
