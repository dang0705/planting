# 微信 / Taro 宿主适配（本仓可选 · 非通用正文）

先核验仓库是否真有这些约定（如存在 `test/mocks/taro.ts`、对应 setup），再读。  
文中路径、脚本、env 名是**线索**，须用仓库文件核实后才能当事实；找不到则按 `SKILL.md` 通用规则，不要臆造 `MAGENTO_URL` 或 `resetTaroMocks`。  
通用规则只认 `SKILL.md`。分层靶点认仓库 `AGENTS.md`（若有）。防浅测细则见 [validity.md](../validity.md)。

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
- **导航**：`@itc/navigation/taro` 的 `goToRoute` / `backFromRoute` 按需 mock，并断言调用参数；需要保留的导出用 `importOriginal` 展开。
- **接线 / C7**：Tabs / Popup mock 可以，但用户动作必须仍打到 page `onChange` / confirm。断言打在 `useEcProductListInfinite` 的 `categoryId`、confirm draft、sheet 开闭。只测 `*.helpers.ts` = C7 缺失。为覆盖改 `PLP.tsx` / hook deps 必须先过 [product-safety.md](../product-safety.md)。

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
- **Alert / Dialog 替身**：若本轮要测取消/确认，替身须保留可点通道（见 [validity.md](../validity.md) §1.6）；不要默认 `() => null`。
- 不要按编译后 `scope--id` 写矩阵测试。

## 覆盖率命令（本仓 EC 水位）

跑 EC 综合水位时，exclude 约定与数字一起报告（示例线索，以当前 `vitest` CLI / `vitest.config.*` 为准）：

- 常排除：`ScrollJumpLab`、`domains/ec/api/**/*[Mm]ock*`、`domains/ec/skeletons/**`
- **故意不刷 `api/*` 真客户端**时：Lines% 不得暗示契约层已矩阵覆盖；契约 Happy 仍按 `AGENTS.md` L3 live / e2e。

## 环境

- 默认 `TARO_ENV=weapp`（`test/setup.ts`）。测 h5 分支须设回并在 `afterEach` 还原。
- 不要假设 Node `Intl` 等于真机。

## 本层证明不了的（E2E）

真实 `wx` 弹窗、tabBar / 页栈、自定义组件 WXML、automator 端口。  
L1/L2 只证明「调用了对应 `Taro.*`」。真机弹窗 / 页栈 / 编译后节点 → `mp-e2e-leaf-authoring`。
