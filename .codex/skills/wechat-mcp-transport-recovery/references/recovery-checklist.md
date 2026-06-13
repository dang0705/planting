# WeChat MCP Recovery Checklist

## 快速判断

1. 查 `9420` 是否监听：

```bash
lsof -nP -iTCP:9420 -sTCP:LISTEN
```

2. 查 DevTools / automator 进程：

```bash
ps aux | rg -i 'wechatwebdevtools|9420|miniprogram-automator|automator'
```

3. 查固定项目根是否有效：

```bash
ls -la /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin/project.config.json
```

## 恢复动作

默认恢复原则：

1. 先复用现有 IDE / `9420` automator 会话。
2. 先做 `status -> is_login -> projectPath 校验 -> 原始 WebSocket / miniprogram-automator` 归因。
3. 不得连接失败就默认 `pkill`、完整重启、`wechat_ide(open, cdp_enabled=true)` 或 `cache_clean(clean_type="all")`。
4. 只有用户明确同意，或已证明无可复用会话且任务必须拉起时，才允许 open / kill / CLI auto，并记录副作用。

1. 补齐 MCP 环境变量：

```text
WEAPP_WS_ENDPOINT
WEAPP_AUTOLAUNCH
WEAPP_PROJECT_PATH
WECHAT_DEVTOOLS_CLI_PATH
WEAPP_TRUST_PROJECT
WEAPP_LAUNCH_TIMEOUT
WEAPP_CONNECT_TIMEOUT
```

2. 受控例外：终止旧 DevTools：

默认禁止。只有用户明确同意，或已证明无可复用 IDE / `9420` 会话且 required item 必须端上执行时，才可执行：

```bash
pkill -f wechatwebdevtools || true
```

3. 受控例外：手动拉起 automator：

默认先复用现有 IDE / `9420`。只有用户明确同意，或已证明无可复用会话且任务必须拉起时，才可执行：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin \
  --auto-port 9420 \
  --trust-project
```

4. 验证原始 WebSocket：

```text
ws://127.0.0.1:9420
```

5. 若 WebSocket 可握手、`miniprogram-automator` 可连、内置 MCP 仍 `Transport closed`：

```text
classification = tool_session_blocker
```

## 不要误判

以下情况都不能直接判产品失败：

1. `mcp__wechat_dev_tools.*` 一上来就 `Transport closed`
2. `9420` 没监听
3. DevTools 没进程
4. 原始 WebSocket 都没握手
5. 当前线程内置 MCP 坏了，但 main 线程同轮仍能拿到 WeChat 端上证据

## 兜底执行

如果内置 MCP 坏了，但 `9420` 正常：

1. 临时安装 `miniprogram-automator`
2. 直接 `connect({ wsEndpoint: 'ws://127.0.0.1:9420' })`
3. 用脚本继续做：
   - `setStorageSync`
   - `reLaunch`
   - `currentPage`
   - `page.$`
   - `element.tap`
   - `screenshot`
