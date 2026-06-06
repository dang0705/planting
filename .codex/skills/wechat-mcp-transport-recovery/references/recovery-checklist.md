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

3. 查项目根是否有效：

```bash
ls -la <projectPath>/project.config.json
```

## 恢复动作

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

2. 清掉旧 DevTools：

```bash
pkill -f wechatwebdevtools || true
```

3. 手动拉起 automator：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project <projectPath> \
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

