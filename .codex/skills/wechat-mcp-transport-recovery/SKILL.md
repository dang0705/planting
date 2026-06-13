---
name: wechat-mcp-transport-recovery
description: "处理 WeChat DevTools MCP `Transport closed`：区分工具层 transport 失败、DevTools/automator 未启动、与产品页面问题；必要时切换到底层 miniprogram-automator 直连继续端上验证。"
---

# WeChat MCP Transport Recovery

## 1. 定位

本 skill 用于处理微信小程序端上验证时的：

```text
Transport closed
connect mode failure
launch mode failure
```

它只负责：

1. 判断失败层级。
2. 恢复 WeChat DevTools / automator。
3. 在 Codex 内置 WeChat MCP transport 失活时，切到底层 `miniprogram-automator` 继续验收。
4. 输出清晰归因，避免把工具问题误判成产品失败。

它不做：

1. code review。
2. 技术方案裁决。
3. 产品行为对错判断以外的实现讨论。

## 2. 适用触发

当出现以下任一情况时使用：

1. `mcp__wechat_dev_tools.*` 返回 `Transport closed`。
2. main agent 或 QA 需要继续做小程序端上验证。
3. 同一项目上 main 线程能连，当前线程不能连，需要判断是线程 transport 问题还是 DevTools 问题。

## 3. 先分清 MCP 实现来源

不要先假设当前会话使用的是 Python `wechat-devtools-mcp`。

先检查运行时配置，例如：

```toml
[mcp_servers.wechat-dev-tools]
command = "npx"
args = ["-y", "@yfme/weapp-dev-mcp"]
```

如果实际使用的是 `@yfme/weapp-dev-mcp`，恢复动作必须针对这个实现。

## 4. 三层归因模型

### A. DevTools 未启动

特征：

1. `9420` 无监听。
2. 没有 `wechatwebdevtools` / automator 相关进程。

结论：

```text
devtools_automator_blocker
```

### B. DevTools 已启动，但 automator 不通

特征：

1. 有 DevTools 进程。
2. `9420` 无监听，或原始 WebSocket 无法握手。

结论：

```text
devtools_automator_blocker
```

### C. automator 已通，但内置 MCP transport 失活

特征：

1. `9420` 正常监听。
2. 原始 WebSocket 或 `miniprogram-automator` 可连接。
3. `mcp__wechat_dev_tools.*` 仍然 `Transport closed`。

结论：

```text
tool_session_blocker
```

此时不得把问题误判成产品失败。

### D. status 假阳性 / 项目路径偏差

特征：

1. `wechat_ide/status` 返回 success。
2. `status.data.project_path` 不是本项目固定 MCP 路径 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`。
3. 或者 `9222` CDP 可访问，但 `9420` automation port 不监听。

结论：

```text
devtools_configuration_blocker
```

不得把 `status success`、`project_exists=true`、`9222 /json/version` 当成端上验收通过。它们只说明前置环境部分可见，不说明当前验收项目路径、automator 或小程序运行时 `wx.request` 已可用。不得把 `dist/build/mp-weixin` 作为本项目 MCP 自动化 projectPath。

### E. 登录态 / token 失效

特征：

1. CLI 或 MCP 返回 `INVALID_TOKEN`。
2. 返回 `需要重新登录`。
3. 之前 `is_login=true`，后续 open / auto 又失败并提示登录态失效。

结论：

```text
devtools_auth_blocker
```

出现上述信号后必须重新执行 `is_login`。未登录时停止端上 QA 并要求扫码登录，不得继续重试 endpoint 或把失败归为产品 blocker。

## 5. 标准检查顺序

只按这个顺序执行，不要来回盲试。

### Step 1：检查端口、进程、项目路径

优先命令：

```bash
lsof -nP -iTCP:9420 -sTCP:LISTEN
lsof -nP -iTCP:9222 -sTCP:LISTEN
ps aux | rg -i 'wechatwebdevtools|9420|miniprogram-automator|automator'
ls -la <projectPath>/project.config.json
```

判断：

1. `project.config.json` 不存在：项目路径错误。
2. `wechat_ide/status` 中的 `project_path` 不是 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`：先修正 MCP 环境或显式传入固定 `project_path`，不得继续验收。
3. 无 DevTools 进程、无 `9420`：先拉起 DevTools。
4. 有 DevTools 进程、无 `9420`：先恢复 automator。
5. 只有 `9222` 可用：只能说明 CDP 可用，不能说明 automator 可用。
6. 有 `9420`：继续验证原始连接。

### Step 2：确认 WeChat MCP 配置足够

对 `@yfme/weapp-dev-mcp`，至少应有：

```toml
[mcp_servers.wechat-dev-tools.env]
WEAPP_WS_ENDPOINT = "ws://localhost:9420"
WEAPP_AUTOLAUNCH = "true"
WEAPP_PROJECT_PATH = "/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin"
WECHAT_DEVTOOLS_CLI_PATH = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
WEAPP_TRUST_PROJECT = "true"
WEAPP_LAUNCH_TIMEOUT = "90000"
WEAPP_CONNECT_TIMEOUT = "90000"
```

注意：

1. 不能只配 `WEAPP_WS_ENDPOINT`。
2. 缺 `WEAPP_PROJECT_PATH` 时，自动拉起可能拿不到目标项目。
3. 缺 `WECHAT_DEVTOOLS_CLI_PATH` 时，auto launch 可能直接失败。

### Step 3：清理旧 DevTools 进程

```bash
pkill -f wechatwebdevtools || true
```

### Step 4：用 CLI 直接拉起 automator

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin \
  --auto-port 9420 \
  --trust-project
```

成功信号通常包含：

```text
✔ auto
```

再次确认：

```bash
lsof -nP -iTCP:9420 -sTCP:LISTEN
```

若返回 `CLI auto 执行失败 (rc=-1)`、`wait IDE port timeout`、`appServiceSDKScriptError timeout` 或超时，优先归类为 `devtools_automator_blocker` / `devtools_auth_blocker`，不得判为产品接口失败。

### Step 5：验证原始 WebSocket

最小 Node 探活：

```js
const WebSocket = require('ws')
const ws = new WebSocket('ws://127.0.0.1:9420')
ws.on('open', () => { console.log('WS_OPEN'); ws.close() })
ws.on('close', code => console.log('WS_CLOSE:' + code))
ws.on('error', err => { console.error(err.message); process.exit(1) })
```

若 `WS_OPEN`，说明底层 automator 正常。

### Step 6：验证 `miniprogram-automator`

如果需要进一步确认不是产品问题，而是内置 MCP transport 失活，直接测试：

```js
const automator = require('miniprogram-automator')

;(async () => {
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  const currentPage = await miniProgram.currentPage()
  const systemInfo = await miniProgram.systemInfo()
  console.log({ path: currentPage?.path, systemInfo })
  miniProgram.disconnect()
})()
```

如果这一步成功，而内置 `mcp__wechat_dev_tools.*` 仍失败，则归因为：

```text
tool_session_blocker
```

## 6. 直连 automator 兜底

当内置 MCP transport 仍坏，但底层 `9420` 已通时，切到底层 `miniprogram-automator`。

### 临时安装

不要污染项目依赖，装到临时目录：

```bash
mkdir -p /tmp/weapp-qa-connect
cd /tmp/weapp-qa-connect
npm init -y
npm install miniprogram-automator@0.12.1 --no-save
```

### 可继续执行的动作

1. `miniProgram.callWxMethod('setStorageSync', key, value)`
2. `miniProgram.reLaunch('/pages/...?...')`
3. `miniProgram.currentPage()`
4. `miniProgram.screenshot({ path })`
5. `page.$(selector)` / `page.$$(selector)`
6. `element.text()`
7. `element.attribute(name)`
8. `element.tap()`
9. `page.data(path?)`
10. `page.setData(data)`
11. `page.callMethod(method, ...args)`
12. `element.setData(data)`
13. `element.data(path?)`
14. `element.callMethod(method, ...args)`

## 7. QA / dispatch 规则

### 规则 1

不要因为 `Transport closed` 就直接判产品失败。

### 规则 2

输出时必须显式区分：

```text
tool_session_blocker
devtools_automator_blocker
product_blocker
recovered
```

### 规则 3

如果 main 线程已经拿到：

1. 同项目
2. 同页面路径
3. 同一轮运行
4. 真实 WeChat MCP 端上证据

则 QA 不得仅因自身 transport 失活把任务长期 blocked。

### 规则 4

如果底层 automator 已通，应继续完成端上验证，而不是停在内置 MCP transport。

### 规则 5

后端 `curl`、Node HTTP、local gateway smoke 即使返回 200，也只能记为：

```text
backend_smoke_pass_only
```

涉及 `/diagnosis/question/start`、`/diagnosis/answer`、question package 或 SQL schema regression 的验收，必须取得小程序运行时 `wx.request` 或真实端上交互证据。

### 规则 6

原 QA 线程或替换 QA 线程报：

```text
Instructions are required
```

这属于 subagent 调用 / 线程请求层 blocker，不是 WeChat DevTools、automator 或产品接口的通过 / 失败证据。必须保留 raw error，并按同角色线程失效规则处理；替换线程存在不等于验收完成。

## 8. 输出建议

```text
WeChat MCP Recovery Result
- transport_status:
- devtools_process:
- status_project_path:
- expected_project_path:
- cdp_port_9222:
- automator_port_9420:
- raw_websocket:
- built_in_mcp_transport:
- fallback_automator:
- login_status:
- classification:
- can_continue_qa:
- next_action:
```

## 9. 结束条件

满足以下任一条件即可结束：

1. 内置 WeChat MCP 恢复可用。
2. 底层 automator 直连可用，且已切换过去继续完成任务。
3. 已证明 CLI auto 拉不起、`9420` 不监听、原始 WebSocket 也不可握手，此时才可判真正的 DevTools/automator blocker。
