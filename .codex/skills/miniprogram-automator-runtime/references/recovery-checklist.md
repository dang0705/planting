# Mini Program Automator Recovery Checklist

## 快速判断

1. 查 `9420` 是否监听：

```bash
lsof -nP -iTCP:9420 -sTCP:LISTEN
```

2. 查微信开发者工具 / automator 进程：

```bash
ps aux | rg -i 'wechatwebdevtools|9420|miniprogram-automator|automator'
```

3. 查本轮 Contract 允许的 `projectPath` 是否有效：

```bash
ls -la <projectPath>/project.config.json
```

`<projectPath>` 规则：

1. 普通本地任务默认是 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`
2. Web/云端 external implementer 且要求 automator 端上验收时，必须是 `<planned_worktree_path>/dist/dev/mp-weixin`

## 恢复动作

默认恢复原则：

1. 先复用现有 IDE / `9420` automator 会话。
2. 先做 `projectPath -> 9420 -> 原始 WebSocket -> miniprogram-automator -> page / wx.request` 归因，并确认这些证据来自同一个工作区。
3. 不得连接失败就默认 `pkill`、完整重启、全量清缓存或清登录态。
4. 只有用户明确同意，或已证明无可复用会话且 required item 必须端上执行时，才允许 CLI auto，并记录副作用。

受控例外：已验证目标项目的 CLI 调用。`--port` 为从 main DevTools 进程 `--remote-port` 读取的控制端口，不是 `9420`；CLI 没有 `--auto-port` 参数：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project <projectPath> \
  --port <verifiedDevToolsControlPort> \
  --trust-project
```

截图 RPC 失效时，单独 `auto` 不能作为 restart 证据。仅在 9420 listener、main DevTools PID、控制端口和唯一 `<projectPath>` 已被同一进程拓扑证明后，才可一次执行 `close --project <projectPath> --port <controlPort>`、`open`、`auto`；若没有进程 `--project` 或已打开 config，可用同一 main `--app-session-id` 的近期 WeappLog 作唯一补充：`AUTO` 精确 port `9420` 和路径，另有同 session `FileUtils` 精确路径，并记录 source / file / timestamp。过期、不同 session、端口或路径不符的日志均拒绝。随后重新观察 main PID / 9420 listener PID / projectPath，并重试截图和 `wx.request`。任一项未证明或 PID 均未变化时，记录 `devtools_automator_blocker`，不得操作其他项目。

## 不要误判

以下情况都不能直接判产品失败：

1. `9420` 没监听。
2. 微信开发者工具没进程。
3. 原始 WebSocket 都没握手。
4. 只有 `9222` / CDP 或工具 status 可见。
5. Node HTTP / curl 通过，但没有小程序运行时 `wx.request`。

## 必须补齐的证据

1. `projectPath`
2. `wsEndpoint` 或 automation port
3. `pagePath`
4. 操作链或运行时 `wx.request` 路径
5. HTTP status / 业务 code / 关键响应字段
6. selector / page_data / screenshot / log 引用
7. 失败归因
