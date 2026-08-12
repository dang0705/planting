# miniprogram-automator 截图卡死问题沉淀（planting）

时间：2026-06-23  
范围：`test/e2e/terminal-e2e/run-diagnose-yellowing-mcp.mjs`

问题现象：`miniProgram.screenshot` 在 9420 automator 会话中偶发长期无返回（>30s），导致运行卡死，未能产出 QA 报告。

根因判断：调用链是 `miniProgram.screenshot -> App.captureScreenshot`，微信工具链在某些运行态（弹窗/渲染切换高频）下不会及时回包，不是业务脚本超时，而是工具 RPC 阻塞。

已落地方案：

- 将截图逻辑集中在 `screenshot()` 辅助函数内，增加 `withTimeout`，默认 `MP_SCREENSHOT_TIMEOUT_MS=12000`，超时则可快速放弃这次抓图；
- 增加重试策略：默认重试 2 次（`MP_SCREENSHOT_RETRIES`）；
- 超时后降级尝试 `miniProgram.screenshot()` 无 path 形式返回 base64，再写入文件；
- 抓图失败时返回 `null`，不再抛出导致主流程卡死（含 `finally` 分支）；
- 仍保留 `console.warn` 记录最后一次失败原因，便于后续归因；
- 建议验证命令：在本地接入 9420 时先跑一次单次截图，确认 `screenshot` 在限定时间内返回；
- 建议配置：若截图仍不稳定，先增大 `MP_SCREENSHOT_RETRIES` 或降低采样频率后再排查弹窗/动画阶段。

代码改动入口（同一线程）：
- `test/e2e/terminal-e2e/run-diagnose-yellowing-mcp.mjs`
  - 新增 `DEFAULT_SCREENSHOT_TIMEOUT_MS`、`DEFAULT_SCREENSHOT_RETRIES`
  - 新增 `withTimeout()`
  - 重写 `screenshot()` 为超时+重试+fallback 机制，并在 `finally` 使用该函数。
