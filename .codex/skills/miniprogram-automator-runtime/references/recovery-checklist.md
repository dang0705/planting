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

3. 查固定项目根是否有效：

```bash
ls -la /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin/project.config.json
```

## 恢复动作

默认恢复原则：

1. 先复用现有 IDE / `9420` automator 会话。
2. 先做 `projectPath -> 9420 -> 原始 WebSocket -> miniprogram-automator -> page / wx.request` 归因。
3. 不得连接失败就默认 `pkill`、完整重启、全量清缓存或清登录态。
4. 只有用户明确同意，或已证明无可复用会话且 required item 必须端上执行时，才允许 CLI auto，并记录副作用。

受控例外：手动拉起 automator：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin \
  --auto-port 9420 \
  --trust-project
```

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
