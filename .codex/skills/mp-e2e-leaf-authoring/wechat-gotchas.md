# WeChat automator gotchas（本仓适用摘录）

来源：微信开放文档 Automator（Page / Element）、业界对 Shadow DOM / 自定义组件的实践（京喜等）、以及 `miniprogram-automator` 社区 skill（whinc/miniprogram-automation）。只留写叶子仍成立的事实。

## 官方能力边界

- SDK 控制的是小程序，不是浏览器 DOM。选择器「同 WXSS，仅部分 CSS」。
- `page.$` / `page.$$` 作用域是页面根；自定义组件内部必须 `element.$`。后代选择器 `host inner` 经常无效，不要赌。
- `element.trigger` 只触发响应、不模拟用户手势，也不能改变组件状态。点击用 `tap`，长按用 `longpress`。
- `element.input` 仅 `input` / `textarea`。
- `scrollTo` / `scrollHeight` 仅 `scroll-view`；页面滚动用 `miniProgram.pageScrollTo`。
- `screenshot()` 主要覆盖开发者工具模拟器。

## 连接（叶子不要自己做）

本仓 adapter 只连日常 automator **9420**。

- 安全设置「服务端口」（常为 9423、改不了）= wechatide / CLI HTTP。`connect(9423)` 会失败。
- **9421 / 9422 / 9424 是青花植正式 QA**，禁止本仓探测或当 fallback。`cli auto` 必须带 `--auto-port 9420`，否则工具可能落到 9421。
- `launch()` 不能和已开的 DevTools 共存；本仓禁止叶子 launch。
- `connect()` 的断开只关 WebSocket，不应退出开发者工具，也不动青花植 QA 进程。
- automator 建议 `>= 0.12`。

## 等待

官方三种 `waitFor`：选择器出现、毫秒、函数返真。

- 列表/首页异步渲染：先条件等待，再短毫秒兜底。
- `wx:if` 未渲染时 `$` 得 `null`，加长 sleep 解决不了「没渲染」。
- 不要对可能永不出现的选择器死等；记当前 `path` 后失败。

## 跳转与页栈

- 每次路由或 tap 导致换页后：`currentPage()` 换句柄。
- tabBar 页：`switchTab`；误用 `navigateTo` 会失败或行为不符。
- 非 tab 深链：`navigateTo` 会堆栈，长流程优先 `redirectTo` 或从入口 `reLaunch` 再 tap，避免栈溢出。
- 对 `switchTab` / `redirectTo` 加超时（`Promise.race`），工具偶发不返回。

## Taro / NutUI

- 编译后稳定 id 可能变成 `scope--id`，先 exact 再 `*=`。
- NutUI / 业务自定义组件：先宿主再内部；不要假设 `page.$('.nut-xxx')` 能穿透。
- 本仓用原生 html + NutUI 功能控件；叶子按编译后 WXML 查，不要按 React 组件名查。

## 运行时注入

- `evaluate` 跑在 AppService。函数体会被序列化，闭包无效。
- 本仓要求注入函数为 ES5 `function`，参数显式传入。
- `mockWxMethod` 的函数同样被序列化；用固定对象 mock 更稳。结束必须 `restoreWxMethod`。
- 官方示例用 `evaluate` 改 `getApp().globalData` 做测试开关；本仓没有统一开关前，不要把假登录写成产品通过条件。真实鉴权页应注入约定 storage，或走游客链路。

## 网络证据

- 端上验收：`wx.request`（`runtimeHttpClient` 或 `evaluate` 槽位轮询）。
- Node / curl / Magento 直连只能排障。
- 本仓会话探活已打 `GET /rest/default/V1/directory/currency`；叶子不要重复当唯一断言，除非这条叶子就是在验该接口。

## 常见误判

| 现象 | 先查 |
| --- | --- |
| `$` 为 null | 组件作用域、wx:if、旧 page 句柄、选择器被编译改写 |
| tap 无跳转 | 没滚进视口、点到覆盖层、该走 `switchTab` |
| evaluate 得到 null | 箭头函数/现代语法被运行时丢掉，或 `wx.request` 包在 Promise 里直接 await |
| 截图超时 | 记 `devtools` 环境问题，继续交互链，不要改直达路由 |
| 9420 连不上 | `yarn e2e:doctor` 的 `liveReady`，不要改叶子补 launch |
