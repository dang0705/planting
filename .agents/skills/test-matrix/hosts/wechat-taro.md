# 微信 / Taro 宿主适配（仓库 customization）

仅当本轮对象对上微信小程序 / Taro，且**宿主语义参与当前决策**时才读本文件，例如编写/修改宿主相关测试，或判断宿主 API、真实路径、mock、runtime、控件约束。纯运行、或与宿主语义无关的静态审查不读。通用义务只认 `SKILL.md`；本文件路径与组件名须用仓库核实后再当事实。找不到则退回通用规则，不要臆造 `MAGENTO_URL` 或 `resetTaroMocks`。  
用语见 [jargons.md](../references/jargons.md)。分层靶点认仓库 `AGENTS.md`（若有）。防浅测细则见 [validity.md](../references/validity.md)。

## 宿主 API

- 业务里的 `Taro.request` / `getStorageSync` / `navigateTo` 在 L1/L2 命中 `test/mocks/taro.ts`。
- L3 不要用这份 mock 冒充后端。若用 Node `fetch` / `fetchLiveJson` 拉数据再喂 mapper：只能证明 **DTO 形状 + 该 mapper**，**不能**证明产品 `http` 封装、拦截器、token 刷新。要把这些算进结论，测试必须走真实客户端。
- 测 mock 副作用：断言调用参数；`afterEach` 已 `resetTaroMocks`。
- `Taro.addInterceptor`、登录刷新链不要当 L1/L2 主路径。

## 页面 L2 挂载前置（本仓核实后再用）

整页 `render` 前确认 `test/mocks/taro.ts`（或等价）具备：

| 能力 | 为何 |
| :--- | :--- |
| `useRouter` + 可设 `params` | 多数 page 入口读路由 |
| `getApp()` 返回真实业务配置形状（如 `APP_CONFIGS`） | page 读 `ec.cart` / `ec.plp` 等，空壳会直接抛 |
| `showLoading` / `hideLoading` / `showToast` | 支付、提交链路会调 |
| `useLoad` / `useReady` / `useDidShow`：**每挂载触发一次**（`useEffect` 空依赖或等价） | 反复随 render 调用 + `setState` 新对象 → 死循环 / OOM |
| `getCurrentInstance().page.getOpenerEventChannel`（若页用 eventChannel） | 定制穿线/配件等入口 |

- **Layout**：page 测默认 mock 成薄壳（勿拖进真实 Header / redux / CustomTabBar），除非本轮目标就是 Layout。
- **导航**：导航内核（本仓 `@itc/navigation/taro` 的 `goToRoute` / `backFromRoute`）按需 mock，并断言调用参数；需要保留的导出用 `importOriginal` 展开。产品若走 `Taro.navigateTo`（结算页协议链等共享打开路径），L2 断言该调用，**禁止**为迁就 `goToRoute` / 图边改共享控件。
- **嵌套文本：** 小程序 `Text` 内嵌 `span` / 原生 html 常导致链不显示或不可点。jsdom 点得到 ≠ 真机可见。禁止把协议/内容链的嵌套 `Text` 改成 `span` 以便测试点击。
- **接线 / C7**：Tabs / Popup mock 可以，但用户动作必须仍打到 page `onChange` / confirm。断言打在 `useEcProductListInfinite` 的 `categoryId`、confirm draft、sheet 开闭。只测 `*.helpers.ts` = C7 缺失。为覆盖改 `PLP.tsx` / hook deps 必须先过 [product-safety.md](../references/product-safety.md)。

## react-query / mutation 替身

- 工厂必须把产品传入的 options 传给 mock：`(opts) => mockFn(opts)`，禁止 `() => mockFn()`。否则 `onError` / `onSuccess` Reverse **整类写不出或假绿**。
- 断言失败路径时：触发产品注册的 `onError`（或 `mutateAsync` reject + 页面 `catch`），钉 toast / 不得进成功路由 / 不得当成功 refetch。
- Vitest 闭包与 `vi.hoisted` 见 [frameworks/vitest.md](../frameworks/vitest.md)。

## 跳过（覆盖 SKILL §3.1，禁止「鉴权失败一律 skip」）

| 情况 | 本仓处理 |
| :--- | :--- |
| 可选 live，无 `MAGENTO_URL` / token / 主机不可达 | skip，报告 **未验证** |
| `yarn test:integration` 被明确要求跑通，环境未就绪 | 失败/阻塞，不当绿 |
| 正在测 401/刷新/权限拒绝 | 断言产品行为，不 skip |

## 组件

- `@tarojs/plugin-html`：业务多用 `div`/`span`；功能控件才是 NutUI / `Image`。
- `test/mocks/taro-components.tsx` 把 `View`/`Text`/`Image`/`Button` 落成 DOM。缺组件就补 mock，不要拉真小程序运行时。
- NutUI Dialog / Popup 在 jsdom 里重。能测薄壳或 footer 回调就不要整页 Dialog。
- **Alert / Dialog 替身**：若本轮要测取消/确认，替身须保留可点通道（见 [validity.md](../references/validity.md) §1.6）；不要默认 `() => null`。
- 不要按编译后 `scope--id` 写矩阵测试。

## 页面 L2 共享 mock 注册器（本仓）

- 路径（以仓库核实为准）：`src-taro/src/domains/ec/pages/__tests__/registerPageL2Mocks.tsx`。
- **新/改 EC page L2**（含 `__tests__/*Page*.test.tsx`、售后步测）应优先 `import` 该注册器（相对路径按文件位置调整），复用其 NutUI `Button` / `Dialog`（须渲染 `content` 与 `footer`）等共享替身。
- **禁止**另起一套更薄、吞掉 Dialog `content`/`footer` 的 `@nutui/nutui-react-taro` mock，除非本轮证明范围明确写清「不含弹窗确认/取消链」，且仍满足上条可点通道义务。
- 另起局部 mock 时：NutUI 被 `inline` 后可能绕过 vitest alias 拉到真实 class `View`，jsdom 下会 `Class constructor View cannot be invoked without 'new'`——优先复用注册器，而不是再补一层残缺 Dialog。

## 相关套件 / stop 全量闸（本仓对号）

- 窄跑义务见 [SKILL.md](../SKILL.md) §3.5；Vitest 命令见 [vitest.md](../frameworks/vitest.md)。
- 本仓测试包 cwd：`src-taro`；全量命令优先 `yarn test`（`vitest run`）。stop hook 脚本：`.codex/hooks/scripts/ut-stop-gate.mjs`（由 `.codex/hooks.json` 的 `stop` 触发）。
- L3 相关 integration 目录线索：`src-taro/test/integration`、`src-taro/test/live`（改 mapper/客户端/编排且存在对应套件时窄跑须带上）。

## 覆盖率命令（本仓水位）

跑综合水位时，exclude 约定与数字一起报告（示例线索，以当前 `vitest` CLI / `vitest.config.*` 为准）：

- 常排除：`ScrollJumpLab`、`domains/ec/api/**/*[Mm]ock*`、`domains/ec/skeletons/**`
- **故意不刷 `api/*` 真客户端**时：Lines% 不得暗示契约层已矩阵覆盖；契约 Happy 仍按 `AGENTS.md` L3 live / e2e。

## 环境

- 默认 `TARO_ENV=weapp`（`test/setup.ts`）。测 h5 分支须设回并在 `afterEach` 还原。
- 不要假设 Node `Intl` 等于真机。

## 本层证明不了的（E2E）

真实 `wx` 弹窗、tabBar / 页栈、自定义组件 WXML、automator 端口。  
L1/L2 只证明「调用了对应 `Taro.*`」。真机弹窗 / 页栈 / 编译后节点 → `mp-e2e-leaf-authoring`。

## 本仓对号（不是通用词）

通用义务只认 `SKILL.md`。[incident-dryrun.md](../references/incident-dryrun.md) 写模式；下面是本仓文件名，供对撞，不写进 `jargons.md`。

| 通用说法 | 本仓 |
| :--- | :--- |
| 导航图 | 常为 `src-taro/.../flows.ts`（以仓库为准） |
| 图探针 | 边表测试（如 `flows.edges.test.ts`） |
| 共享打开路径 / K1·K8 | 结算页 `CheckoutFooter` 协议链（`PrivacyPolicy` / `UserAgreement`）；产品走 `Taro.navigateTo`，不是 `goToRoute`。禁止为迁就探针把 `Text` 改成内嵌 `span` + 另一套路由 |
| K2 追加被回写成独占 | `Cart.tsx` / `applyExclusiveSkuSelection` |
| K3 恒等 peel | `PLP.tsx` / `shouldShowPlpFilterEntry` |
| K4 无红改受控同步 | `ExchangeSkuSheet` / `PickupTimeSheet` / `wasOpenRef` |
| K5 臆造契约字段 | `short_description_images` |
| P20 删打开函数换路径 | `openPolicy` |
| 机器闸门产品路径 | `src-taro/src/**`；脚本 `.codex/hooks/scripts/matrix-gate/codex-pre-tool-use.mjs`；夹具 `yarn matrix:gate`（`src-taro`） |
