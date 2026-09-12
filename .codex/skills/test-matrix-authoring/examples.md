# 测试矩阵写法示例（平台无关）

需要结构或交付格式时读本文件。标识符换成当前仓库模块即可。

下列代码块**只演示局部写法**，不代表完整合格 suite。是否合格看 `SKILL.md` §2.1：适用维已写、不适用已 N/A。防浅测细则见 [validity.md](validity.md)。

## 一、L1 Unit

### 对：Happy + 独立 edge 块（仅演示 U1–U3；U4–U6 对本函数 N/A）

`createMoney` 的非法输入应写在 `createMoney` 自己的 suite，不要算进 `sumMoney` 的 U3。

```ts
import { describe, expect, test } from "vitest";
import { sumMoney, createMoney } from "./money";

describe("sumMoney", () => {
  test("happy: sums without binary float drift", () => {
    expect(sumMoney(0.1, 0.2, createMoney(19.99)).amount).toBe(20.29);
  });

  describe("edge / reverse", () => {
    test("U1: no addends yields zero", () => {
      expect(sumMoney().amount).toBe(0);
    });
    test("U2: zeros are preserved", () => {
      expect(sumMoney(0, 0).amount).toBe(0);
    });
    test("U3: non-finite addend is rejected by sumMoney", () => {
      expect(sumMoney(1, Number.NaN)).toBeNull();
    });
  });
});
```

覆盖表示意：U4–U6 = N/A（无命令重复、无异步回滚、无并发职责）。

### 错：L1 打真实网络；或把别的函数的用例算进本对象覆盖

```ts
test("loads user", async () => {
  const user = await fetch("https://api.example.com/me").then((r) => r.json());
  expect(user.id).toBeTruthy();
});
```

## 二、L2 Component

### 对：适用维有用例；不适用列 N/A（含 C6）

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi } from "vitest";
import { SubmitButton } from "./SubmitButton";

describe("SubmitButton", () => {
  test("happy: click fires onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SubmitButton onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  describe("edge / reverse", () => {
    test("C1: missing label keeps accessible name 提交", () => {
      render(<SubmitButton label={undefined} onSubmit={vi.fn()} />);
      expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
    });
    test("C3: disabled does not fire onSubmit", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<SubmitButton disabled onSubmit={onSubmit} />);
      await user.click(screen.getByRole("button", { name: "提交" }));
      expect(onSubmit).not.toHaveBeenCalled();
    });
    test("C5: readOnly hides submit affordance", () => {
      render(<SubmitButton readOnly onSubmit={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "提交" })).not.toBeInTheDocument();
    });
  });
});
```

| 被测对象 | 层 | 维度 ID | 用例名 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| SubmitButton | L2 | C1 | missing label keeps name 提交 | 已写 |
| SubmitButton | L2 | C2 | — | N/A：无数值/图片 |
| SubmitButton | L2 | C3 | disabled does not fire | 已写 |
| SubmitButton | L2 | C4 | — | N/A：无外层点击包裹 |
| SubmitButton | L2 | C5 | readOnly hides submit | 已写 |
| SubmitButton | L2 | C6 | — | N/A：非受控输入 |
| SubmitButton | L2 | C7 | — | N/A：无路由/query/受控源与本地态对打 |

真浏览器隔离 `mount`（Playwright/Cypress Component）写法同层，不升 E2E。

### 错：受控确认测半截；Reverse 只看「还在」

```tsx
// 错 1：父未回流 selectedValues，确认仍断言空 values，却当作「选完确认」
test("select then confirm", async () => {
  const onOptionChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <SkuSheet
      selectedValues={{}}
      onOptionChange={onOptionChange}
      onConfirm={onConfirm}
    />
  );
  await user.click(screen.getByText("黄"));
  await user.click(screen.getByText("确认"));
  expect(onConfirm).toHaveBeenCalledWith({ values: {} }); // 半截链
});

// 错 2：不可选日期只断言月份标题还在，不钉确认 payload
test("disabled day", async () => {
  await user.click(disabledDay);
  expect(screen.getByText("2026年9月")).toBeInTheDocument(); // 未证明日期未变
});
```

对：本地受控壳回流后再确认；不可选路径最终 `expect(onConfirm).toHaveBeenCalledWith(today, slot)`。

### 错：把成功路径塞进 Reverse 分组（标签注水）

```tsx
describe("Reverse 硬度", () => {
  test("pay onSuccess success → thankyou", () => {
    payOnSuccess?.({ orderId: 1, result: "success" });
    expect(goToRoute).toHaveBeenCalledWith("ec-thankyou", expect.anything());
  }); // 这是 Happy，不得放在 Reverse 块
});
```

对：`describe("Happy: 支付成功")` / `describe("Reverse: 支付失败与取消")` 分开；Reverse 内只留 cancel/fail/onError/缺字段且断言副作用未发生。

### 错：只点 disabled；或把 Happy 塞进 reverse 分组

```tsx
// 错 1：按钮已 disabled，点击几乎恒真；handler 内「请先选择」toast 从未执行
test("checkout blocked", async () => {
  render(<CartSummary checkoutDisabled onCheckout={onCheckout} />);
  await user.click(screen.getByRole("button", { name: "立即购买" }));
  expect(onCheckout).not.toHaveBeenCalled();
});

// 错 2：分组标签注水
describe("edge / reverse", () => {
  test("card opens detail", async () => {
    await user.click(screen.getByText("订单编号"));
    expect(goToRoute).toHaveBeenCalled(); // 这是 Happy
  });
});
```

对：另开「强制调用」入口触达 handler 防御 toast，并断言 `goToRoute` 未调用；Happy 导航放在 `describe("happy")`（或无 reverse 标签的块）。

### 错：page 壳 mock 掉编排 hook 却声称 CTA 已覆盖

```tsx
vi.mock("./useAfterSaleProgressPage", () => ({
  useAfterSaleProgressPage: () => ({ progress: vm, handlePrimaryCta: vi.fn() }),
}));
test("progress page", () => {
  render(<AfterSaleProgress />);
  expect(screen.getByText("等待商家审核")).toBeInTheDocument();
  // 未证明空运单号 toast / cancel onError
});
```

对：壳测只报门闸；CTA Reverse 写在 `useAfterSaleProgressPage` 单测（或解开 mock）。

### 错：peel 只测 helper，宿主 effect 把本地态放进 deps

```ts
// helper 钉成 route !== active → true，看起来「该同步」
expect(shouldSyncActiveCategory(30, 10)).toBe(true);

// 产品接线：
useEffect(() => {
  if (shouldSyncActiveCategory(routeId, activeId)) setActive(routeId);
}, [routeId, activeId]); // 点 tab 改 activeId → 立刻被路由盖回去
```

页面 L2 若 mock 掉 Tabs / 不点 tab，这条回归永远绿。对：宿主断言「点 tab 后 query/本地 id 保持用户选择」。删掉 helper 测后该宿主用例仍必须能红。完整闸门：[product-safety.md](product-safety.md)。

### 错：为冲覆盖改产品接线，再只补 helper 测

```ts
// 任务是 Lines%：把 page effect 抽成 shouldSync 并改 deps，测试只打 helper
export function shouldSync(route: number, active: number) {
  return route > 0 && route !== active;
}
test("syncs when route differs", () => {
  expect(shouldSync(30, 10)).toBe(true); // 把错误语义钉成 Happy
});
```

停工：闸门 1 冻结控制流；要 peel 必须先有「点 tab 后 categoryId 保持」的红/绿宿主测（闸门 2–3）。测不了 Tabs → 加厚 mock 的 `onChange`，或标缺口，**不许改 page 迁就**。

### 错：L2 套 live API / 只断言 class

```tsx
test("shows price", async () => {
  const data = await fetchLiveProduct();
  render(<Price tag={data} />);
  expect(container.firstChild).toHaveClass("text-orange");
});
```

## 三、L3 Integration / Contract

### 局部演示：可选 live + skip（**不是**完整 I1–I5 suite）

只演示「未配环境则未验证」。I2/I3 应另用构造体打在**产品 mapper/客户端**上；本块故意不写满。

```ts
const live = Boolean(process.env.API_BASE_URL) && process.env.SKIP_LIVE !== "1";
const describeLive = live ? describe : describe.skip;

describeLive("order contract (optional live)", () => {
  test("I1: list DTO maps through mapOrderList", async () => {
    const raw = await fetch(`${process.env.API_BASE_URL}/orders`).then((r) =>
      r.json()
    );
    const page = mapOrderList(raw);
    expect(page.items.length).toBe(raw.items.length);
  });
});
```

证明范围须写明：经过 `mapOrderList`；**未经过**产品 HTTP 封装时不得声称拦截器/鉴权已测。

### 局部演示：协作 + 替换网络（仍是 L3）

真实组件 + 真实 store + MSW，断言列表渲染。这是集成，不是「必须无头、必须真联网」。

### 错：臆造 DTO 冒充协议 Happy；鉴权失败用例却 skip

```ts
const raw = { items: [{ id: 1, status: "paid" }] };
expect(mapOrderList(raw).items[0].status).toBe("paid");
```

## 四、排雷表示意

回归列：能证明修前失败则写用例名；否则写限制。

| 雷点 | 触发场景 | 后果 | 源码是否已修 | 修复位置 | 回归证据 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 空集合读 `.length` | 可选 `addons` 缺失 | 行崩溃 | 已修 | `AddonRows.tsx` 默认 `[]` | `renders without addons`：修前 TypeError，修后通过 |

发现 M 条、已修 N 条分开写。未授权修改的缺陷仍列表 1，标「未修」，不算进 N。无缺陷时写「无」，并明示 N=0。
