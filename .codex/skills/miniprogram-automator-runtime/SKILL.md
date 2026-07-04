---
name: miniprogram-automator-runtime
description: "微信小程序端上自动化默认通道：使用 miniprogram-automator / 9420 获取 page_stack、page_data、真实交互和小程序运行时 wx.request 证据。"
---

# Mini Program Automator Runtime

## 1. 定位

本 skill 是本项目微信小程序端上自动化的默认通道。默认执行模式固定为：

```text
npm run dev:mp-weixin:local-functions:lan -> dist/dev/mp-weixin -> 9420 automator -> miniprogram-automator -> page / wx.request evidence
```

微信开发者工具仍是运行载体；项目规则不再使用额外自动化抽象层作为默认路径，也不再要求先走其他工具层、失败后再改用 automator。

如果本轮代码未部署到云端，端上验收必须先成功跑通完整 LAN 本地函数 flow：

```bash
npm run dev:mp-weixin:local-functions:lan
```

只有该命令完成本地 CloudBase 函数 gateway readiness、函数 health route readiness、关键业务探针，并进入 `dist/dev/mp-weixin` watch 状态后，后续 `9420` / `miniprogram-automator` / `wx.request` 证据才可作为本轮端上验收。只启动 `LOCAL_FUNCTIONS=weather-http` 等 scoped gateway、只用 Node/curl 请求、只看 `__local_functions__/health` 或单函数 health，均只能作为排障证据，不得作为验收通过。

## 2. 适用触发

当任务需要以下任一端上证据时使用：

1. 小程序页面点选、输入、跳转、弹窗或组件状态。
2. Figma/UI 对齐的真实页面状态或截图。
3. `/diagnosis/question/start`、`/diagnosis/answer`、question package、诊断入口。
4. 小程序运行时 `wx.request` 验证接口、CloudBase local functions gateway 或 SQL schema 相关链路。

## 3. 固定项目路径

端上自动化项目路径只允许：

```text
/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
```

`dist/build/mp-weixin` 只用于构建、CI、上传、预览类检查，不得作为端上 automator projectPath。

## 4. 标准检查顺序

默认先复用现有微信开发者工具和 `9420` 会话：

```bash
npm run dev:mp-weixin:local-functions:lan
lsof -nP -iTCP:9420 -sTCP:LISTEN
ps aux | rg -i 'wechatwebdevtools|9420|miniprogram-automator|automator'
ls -la /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin/project.config.json
```

只有 `9420` 监听、原始 WebSocket 可握手，并且 `miniprogram-automator` 能连接当前项目，才算 automator ready。`9222` / CDP、截图存在、工具 status success 都只能作为环境信息，不能替代端上验收。

## 5. 受控拉起

默认禁止为了“干净基线”执行 `pkill`、完整重启、全量清缓存或清登录态。

只有用户明确同意，或已经证明没有可复用 IDE / `9420` 会话且 required item 必须端上执行时，才允许用 CLI 拉起 automator：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin \
  --auto-port 9420 \
  --trust-project
```

拉起或重启必须记录原因、副作用、登录态 / 授权态风险和 raw error。

## 6. 原始 WebSocket 探活

```js
const WebSocket = require('ws')
const ws = new WebSocket('ws://127.0.0.1:9420')
ws.on('open', () => { console.log('WS_OPEN'); ws.close() })
ws.on('close', code => console.log('WS_CLOSE:' + code))
ws.on('error', err => { console.error(err.message); process.exit(1) })
```

`WS_OPEN` 只证明 automator transport 可达；通过验收还必须继续执行 page / selector / `wx.request` 断言。

## 7. miniprogram-automator 连接

```js
const automator = require('miniprogram-automator')

;(async () => {
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  const currentPage = await miniProgram.currentPage()
  const systemInfo = await miniProgram.systemInfo()
  console.log({ path: currentPage?.path, systemInfo })
  await miniProgram.disconnect()
})()
```

可继续执行的端上动作包括：

1. `miniProgram.callWxMethod('setStorageSync', key, value)`
2. `miniProgram.reLaunch('/pages/...?...')`
3. `miniProgram.currentPage()`
4. `miniProgram.screenshot({ path })`
5. `page.$(selector)` / `page.$$(selector)`
6. `element.text()` / `element.attribute(name)` / `element.tap()`
7. `page.data(path?)` / `page.setData(data)` / `page.callMethod(method, ...args)`
8. `miniProgram.evaluate(() => new Promise(resolve => wx.request(...)))`

接口验收必须在小程序运行时用 `wx.request` 发起，Node 直接 HTTP、curl、local gateway smoke 只能作为后端 smoke。

当发现 `3010/__local_functions__/health` 返回包含目标函数，但对应函数 health route 502 或提示 `connect ECONNREFUSED 127.0.0.1:900x` 时，必须归因为 stale local gateway / worker 缺失。此时不得绕过完整 LAN flow 用 scoped gateway 直接验收；应先修复并重新跑通 `npm run dev:mp-weixin:local-functions:lan`。

## 8. 诊断流定位

诊断流自动化必须先读取 `docs/ai-rules/frontend-automation-id-policy.md` 第三点“诊断流 id 映射”，并优先使用稳定 id，例如：

```text
diagnose-entry-button-{plant.id}
```

不得把中文文案、截图坐标或页面层级作为首选定位方式。

## 9. 失败归因

输出时必须显式区分：

```text
devtools_automator_blocker
devtools_auth_blocker
devtools_configuration_blocker
product_blocker
recovered
not_verified
```

常见归因：

1. `9420` 无监听、WebSocket 无法握手、CLI auto timeout：`devtools_automator_blocker`。
2. `INVALID_TOKEN` / `需要重新登录`：`devtools_auth_blocker`。
3. projectPath 不是固定 `dist/dev/mp-weixin`：`devtools_configuration_blocker`。
4. automator 已通且 Test Contract required item 失败：按实际断言归为 `product_blocker`。

## 10. 输出建议

```text
Mini Program Automator Runtime Result
- projectPath:
- automator_port_9420:
- wsEndpoint:
- launch_mode: reused / cli_auto / not_started
- pagePath:
- operation_chain:
- runtime_request:
- assertions:
- evidence:
- classification:
- next_action:
```
## 11. 本地 LAN smoke 证据规则

当验收使用本地 HTTP smoke 或 LAN direct HTTP 时，必须读取 `references/local-smoke-test-and-lan-direct-connection-policy.md`。缺少环境/终端头导致的会话未持久化，不得误判为产品 blocker。

