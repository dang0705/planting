# 微信小程序 / uni-app 宿主适配（本仓 customization）

仅当被测对象经过 uni-app 或微信小程序宿主，且宿主语义会影响判断时读取本文件：例如测试 `uni.*` / `wx.*`、页面路由、微信权限、图片上传、编译产物、真实小程序运行时或自动化控件。纯 JavaScript 逻辑、服务端模块、与宿主无关的静态审查只使用上层 `SKILL.md`。

本仓不是 Taro/React 项目。不要引入 `Taro.*`、`test/mocks/taro.ts`、Magento 环境变量或 `src-taro` 路径。通用 TDD、Expected、层级和真实性义务仍以 [../SKILL.md](../SKILL.md) 与仓库根 [AGENTS.md](../../../../AGENTS.md) 为准。

## 宿主事实与真实路径

- 前端是 `uni-app 3 + Vue 3`，入口和分包由 `src/pages.json` 声明，平台配置在 `src/manifest.json`，微信开发者工具项目配置是 `project.config.json`。
- 微信主包 tab 页是 `/pages/index/index`、`/pages/garden/garden`、`/pages/diagnose/diagnose`、`/pages/profile/profile`；提醒页 `/pages/reminder/reminder` 不是 tab。诊断、养护、植物、订阅等页面位于 `src/pages.json` 声明的分包中，不能凭文件名臆造路由。
- 当前开发端上验收产物是 `dist/dev/mp-weixin`。`dist/build/mp-weixin` 只用于构建、CI、上传或预览检查，不能作为 Automator 的验收 `projectPath`。
- `package.json` 的本地微信流程是 `npm run dev:mp-weixin:local-functions:lan`；未部署云端代码时，端上验收必须先跑通这条完整 LAN 本地函数链路，并确认小程序运行时命中新产物和新函数。
- 编译后的宿主合同位于产物 `mp-e2e.contract.json`：平台是 `wechat-miniprogram`，能力包括导航、交互、截图和运行时请求，稳定 id 允许 exact 或 scoped 形式。

## CloudBase 后端事实

本仓后端是腾讯云 CloudBase（微信云开发）服务，不是独立的本地 REST 服务。`project.config.json` 声明了 `cloudfunctionRoot: cloudfunctions/`；各服务在 `cloudfunctions/*/cloudbase-functions.json` 中声明 HTTP 云函数和路由，生产/开发请求由 CloudBase 网关或函数公开 HTTPS 域名承载。

- 当前脚本配置的 CloudBase 环境是 `cloud1-2grufevs395a9d5e`；业务开发数据和关系库语义使用 `cloud1_dev`。环境 id、数据库名和用户身份不是可互换的值，测试不得从请求参数臆造其中任何一个。
- 前端通过 `src/api/env.js` 和 `src/api/http.js` 进入云函数：默认 CloudBase API Gateway 形态为 `/v1/functions`，公开 HTTPS 云函数域名用于手机号引导、题包等明确路由；`VITE_API_BASE_URL` 可被本地 LAN gateway 覆盖。实际调用仍须经过产品的 `httpRequest` / `httpUploadFile` 封装，不能用 Node `fetch` 替代并宣称客户端合同通过。
- 主要 HTTP 云函数包括 `auth-user-http`、`platform-phone-bootstrap-http`、`diagnose-http`、`diagnosis-question-start-http`、`diagnosis-answer-http`、`diagnosis-history-http`、`plant-catalog-http`、`plant-user-http`、`identify-http`、`storage-http`、`weather-http` 和 `subscription-http`。具体路径以对应 `cloudbase-functions.json` 和 API 合同为准，不以函数目录名推导 URL。
- 云函数按 CloudBase Node 18.15 运行时约束编写，使用 `@cloudbase/functions-framework`、`@cloudbase/node-sdk` 和共享 Layer。函数内的 `/opt/utils/cloudbase`、`cloudfunctions/layer`、`mysql2` 和 `SQL_DATABASE_DEV` 共同决定数据库访问路径；小程序前端不能直接访问这些数据库连接或 Layer。
- 关系数据是 CloudBase 侧的 MySQL/TDSQL-C 路径。涉及用户、植物、诊断、天气或养护数据时，测试必须区分真实开发库读写、函数返回合同和端上页面回读；数据库连接成功或 SQL 查询成功不等于页面业务通过。
- 文件链路使用 CloudBase 云存储：微信端优先 `wx.cloud.uploadFile`，再取得 `fileId` 和临时访问地址；`storage-http` 负责受保护的文件、植物图片和诊断图片路由。图片链路的验收必须覆盖文件流上传、授权、文件登记、临时地址、业务使用和清理，不能用 Base64、Node 文件上传或 health route 代替。
- 身份存在边界：微信原生请求可携带 CloudBase 运行时身份；公开 HTTPS 路由仍由函数校验业务会话，例如平台会话头或签名身份票据。`health` 成功只证明函数响应，不证明登录、数据库权限、图片权限或当前用户数据隔离。

### CloudBase 测试与发布边界

- L1/L2 不访问线上 CloudBase，不把完整 CloudBase SDK、云函数框架或真实数据库塞进 Vue/jsdom 替身；只验证产品请求封装对请求参数、认证失败、业务错误和恢复动作的处理。
- `test/e2e/batch/**` 的真实服务链路使用 `e2e_real_api`，必须显式校验真实函数基地址、`cloud1_dev` 开发环境和真实身份。缺少环境变量、身份或服务不可用时是 `BLOCKED_ENV`，不能退回 fixture、匿名默认值或内存仓库。
- 未部署云端代码时，正式小程序端上验收必须先运行 `npm run dev:mp-weixin:local-functions:lan`，让微信运行时通过 LAN gateway 命中本轮函数和 `dist/dev/mp-weixin`。只启动单函数、直接 curl、Node HTTP 或 gateway health 都只能作为诊断。
- 云函数发布使用 `scripts/deploy-cloudbase-functions.mjs`；必须显式指定环境。关键函数发布还要证明数字版本、`$DEFAULT` 指向该版本、`$LATEST`/数字版本/`$DEFAULT` 的 `CodeSha256` 一致，以及网关运行时命中相同版本；只上传 `$LATEST` 或看到 HTTP 200 不算发布完成。
- CloudBase 操作、数据库、云存储、身份或部署相关任务应先读取 [CloudBase skill](../../cloudbase/SKILL.md) 及匹配的子技能；不要把 Web CloudBase SDK、微信端 `wx.cloud`、HTTP 云函数和数据库管理 API 混为一个调用边界。

## 测试层选择

### L1：模块逻辑

用于纯函数、状态计算、序列化、DTO 映射和边界规则。不得依赖真实 `uni`、`wx`、页面栈或网络。若使用源码读取、正则或人工构造输入，报告标记为 `data_mode=unit_fake`、`test_kind=source_contract`；它不能冒充页面交互或微信运行时证明。

本仓的 Node 单元测试主要是 `test/unit/frontend/**/*.mjs`、`test/unit/backend/**/*.mjs` 和少量 `.cjs`，由 `node test/unit/run-all.mjs` 执行。前后端测试必须分别镜像 `src/**` 与 `cloudfunctions/**`，不能交叉导入；文件名不得使用 `test-` 前缀。真实开发数据/API/数据库用例标记 `unit_real_data`，通过 `npm run test:unit:real-data` 或明确的 `--real-data-only` 入口运行。

### L2：Vue 组件/组合式逻辑

本仓使用 `Vitest 3.2.7 + @vue/test-utils + jsdom`；依据 `vitest.config.mjs`，`npm run test:vitest` 只收集 `test/unit/frontend/**/*.test.js`。它可以验证 Vue props、emits、响应式状态、用户可见文案、稳定 id 和被测模块注册的动作，但不证明真实 WXML、页面栈、微信弹窗或 `wx.request`。

宿主替身规则：

- 测试中按需用 `vi.stubGlobal('uni', ...)` 提供最小 API，并在 `afterEach` 清理；不要假设仓库存在一套通用 Taro mock 或完整微信 mock。
- `uni.request`、`uni.getStorageSync/setStorageSync`、`uni.navigateTo/switchTab/navigateBack`、`uni.showToast/showModal`、`uni.chooseImage/uploadFile`、定位和权限 API 的断言必须检查参数、状态变化和失败后的用户可观察结果，不能只断言“函数被调用”。
- `showModal`、确认弹层、取消/重试按钮的替身必须保留可触发的确认和取消通道；不能用永远返回空值的替身把失败路和取消路覆盖掉。
- `src/http-functions/core/httpRequest.js` 会按运行环境选择 `wx.request` 或 `uni.request`，上传也会选择对应的 `wx/uni.uploadFile`；`src/http-functions/storage/client.js` 使用微信 `wx.cloud` 文件能力。L2 只能验证本模块的选择、参数和错误映射，不能宣称真实上传、云文件或后端合同通过。
- `vitest.config.mjs` 当前把 `picker`、`scroll-view`、`switch` 作为自定义元素交给 jsdom 编译。不要为了让 jsdom 点击通过而把 uni-app 控件改成浏览器 `span` 或普通 HTML；控件真实可见性、滚动、选择器和编译后节点交给端上验收。

### L3：真实服务链路

`test/e2e/batch/**` 可验证跨模块真实 API、开发库和数据合同，数据模式标记 `e2e_real_api`。必须显式使用当前配置的真实 API、`cloud1_dev` 开发数据和真实身份；缺少 `TERMINAL_E2E_FUNCTION_BASE_URL`、环境或身份时标记阻断，不退回 fixture、内存仓库或默认匿名用户。

L3 仍不证明真实小程序页面、微信登录态、响应式更新、页面跳转、截图或控件点击。完整页面旅程转交端上 Automator，不在 L2/L3 用 Node HTTP、宿主 `fetch` 或直接写库冒充端上通过。

## uni-app / 微信 API 边界

- 产品代码的跨平台入口通常是 `uni.*`；平台专属能力包括 `wx.cloud`、`wx.getFileSystemManager`、`wx.getImageInfo`、`wx.compressImage`、`wx.login` 等。测试应根据被测模块实际调用选择替身，不能把所有调用统一改写为 `Taro.*` 或浏览器 API。
- `uni.switchTab` 只用于 `pages.json` 的 tab 页；普通页面和分包页按真实产品路径使用 `uni.navigateTo`、`uni.redirectTo` 或 `uni.navigateBack`。测试断言完整路径和页面栈语义，不只断言“发生了跳转”。
- 图片流程必须区分选图、压缩/读取、上传、临时地址或文件 id、模型/接口请求、持久化和清理。L2 可测每一段的输入输出和失败恢复；真实微信文件流、`wx.cloud`、模型请求、临时文件生命周期必须由真实端上或真实 API 用例证明。
- 定位/天气/权限逻辑要分别覆盖已授权、拒绝、设置不可用、已有城市保留和网络失败；“请求返回 200”不能替代权限状态、数据来源和页面最终文案的断言。

## 交互控件与稳定 id

新增或修改带 `@click`、`@change`、`@focus`、`@blur` 等事件的元素或 `uni-ui` 控件时，必须同时设置语义化稳定 `id`，并更新 [docs/ai-rules/frontend-automation-id-policy.md](../../../../docs/ai-rules/frontend-automation-id-policy.md) 的对应映射。优先使用稳定 id，其次才是语义 class；不得首选中文文案、Tailwind class、坐标或页面层级。

自动化定位遵循：

1. 先用精确稳定 id；UniApp 编译后若带作用域后缀，再用包含稳定片段的 scoped 选择器。
2. 自定义组件内部控件先定位组件宿主，再在组件作用域内定位子控件；页面根查询不到内部节点不等于控件不存在。
3. 交互后重新读取当前页面句柄；导航后重新获取 `currentPage()`，不要继续使用旧 page 对象。
4. 超过一屏的普通页面或 `scroll-view` 必须先产生真实滚动证据，再点击目标；不能直达目标路由、`setData` 或坐标点击来替代入口操作。

## 端上 Automator 交接

真实微信页面、页栈、tabBar、WXML、自定义组件、原生弹窗、真实 `wx.request`、截图和端到端用户路径不属于本宿主矩阵的 L1/L2 证明范围。应使用本仓正式 catalog：

- 叶子精确登记在 `test/e2e/automator/catalog.json`，按 catalog 选择执行，不裸跑脚本宣称验收；报告明确 `automator_live_real_api` 或 `fixture_diagnostic`。
- 正式 QA 使用测试专属持久化 DevTools profile、目标 `dist/dev/mp-weixin`、LAN watcher lease、test-owned DevTools owner 和隔离控制端口 `9421`；`9420` 仅属于用户交互调试会话，不能作为正式 QA fallback。
- 端上接口验收必须由小程序运行时真实发出 `wx.request`，记录 `elapsed_ms`、HTTP 状态、业务码、关键字段和响应体大小。Node HTTP、curl、局部 gateway、函数内部耗时或 health 只能诊断，不能替代端上结论。
- 包含入口、跳转或完整流程时，从真实入口页开始，真实定位并点击，再断言 `currentPage().path`、页面数据、关键用户文案和有效 PNG。截图失败应单独记为视觉证据未通过，不能因此跳过交互链。

若使用 `qa/e2e` 套件，入口是 `qa/e2e/run.mjs`，产物仍是 `dist/dev/mp-weixin`，adapter 的正式端口策略为测试专属 `9421/9422/3010`；其 `live_real` / `fixture_diagnostic` CLI 数据模式必须在报告中映射为仓库规则的真实 API 或诊断夹具，不得混称。

## 证明范围与常见误判

| 证据 | 只能证明 | 不能证明 |
| --- | --- | --- |
| `Vitest` / `@vue/test-utils` 通过 | Vue 组件或模块在 jsdom 下的逻辑、渲染和事件接线 | 真机 WXML、页栈、微信弹窗、真实网络、截图 |
| `node test/unit/run-all.mjs` 通过 | 仓库镜像单元测试与其声明的数据模式 | 端上页面和真实微信能力 |
| `test/e2e/batch` 通过 | 真实 API/开发库的跨模块服务链路 | 小程序登录态、页面交互、端上响应式状态 |
| build 成功、HTTP 200 或 health 成功 | 构建/响应性诊断信号 | 当前 DevTools 加载的产物、业务字段、文件上传、诊断闭环 |
| Automator 叶子通过 | catalog 范围内的真实页面、交互、请求和截图证据 | 未覆盖的分支、未执行的 catalog 叶子或 fixture 路径的真实业务 |

每次交付都要分开列出前端单元逻辑、真实 API 链路和 `automator_live_real_api` 端上证据。任一层未执行、数据来源不明、只覆盖 happy path 或仅有构建/HTTP 200 时，整体只能写“部分验证/未验收”，不能写“功能通过”。
