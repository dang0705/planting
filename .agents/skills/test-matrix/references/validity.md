# 测试有效性与覆盖率读法

**何时读：** 出现浅测风险、L2/L3 受控回流/壳测、Reverse 分类争议、coverage/水位目标、A=0 或安全上限判断时读；简单 L1 且无这些信号不预读。

行为义务以 `SKILL.md` 为准（含 §0）。用语见 [jargons.md](jargons.md)。本文件展开防浅测与水位误判细则。独立 Expected 从哪来见 [truth-sources.md](truth-sources.md)。测试是否能抓真实错误改动、替身是否越界、交付前突变检查见 [test-integrity.md](test-integrity.md)。

## 1. 防浅测（对应 SKILL 硬规则「证明硬度」）

§2.1 保证「维有没有写」；本条保证「写了是否真证明」。下列任一命中 → **不得宣称该对象编写完成**，须加深或在覆盖表标「浅 / 缺口」：

1. **替身后仍属 SUT 的分支未触达。** Mock 外壳（Popup / Cascader / Dialog / Tabs）合法，但替身后，**与本轮目标或已识别适用风险相关的** SUT 分支（如 lazy load、cache 回填、confirm 组装、失败兜底）仍须触达。只测「点开外壳 + 直通 happy」= 浅。
2. **受控回流测半截。** 对象以受控 props 为准（如 `selectedValues`）时：不得用「父未回流的旧 props」去断言确认 payload，冒充「选完再确认」。须驱动宿主完成真实受控回流（如受控壳、`rerender`、`setProps` 等），使确认断言看到**回流后的业务结果**。
3. **Reverse 只证明「还在」。** 禁用/不可选/取消路径必须钉业务结果（回调参数、选中 id、提交 payload），禁止只断言「文案还在 / 月份标题还在 / 节点仍挂载」。
4. **覆盖表不可用摘要糊弄适用维。** 对本轮每个被测对象，适用维须逐条 `已写` 或 `缺失`；不适用维须 `N/A + 原因`。禁止只交一张「摘要表」却漏掉已识别的适用维。
5. **`disabled` ≠ 防御分支已测。** UI 禁用只证明控件不可点；若 SUT 在 handler 内另有 toast / early-return（防御纵深），须另开用例触达该 handler（例如测试替身提供「强制调用」入口），并断言禁止的副作用未发生。只点 disabled 按钮不算该防御维已写。
6. **替身不得拆掉本轮要测的确认/取消通道。** Dialog / Alert mock 成空组件合法，但若本轮 Reverse 是「取消不 mutate / 确认才提交」，替身仍须暴露可点的 cancel/confirm（或等价回调入口）；`null` 替身导致交互树物理消失 = 测不到，不是已覆盖。
7. **壳测 mock 掉 page hook 时不得冒充 hook 已证。** 页面 L2 若替换 `useXxxPage` 一类编排 hook，证明范围仅限壳门闸（loading / empty / ready）；CTA、onError、半成品回滚须在 hook 单测（或解开 mock 的编排测）里另证，禁止在交付里写成「整页业务链路已覆盖」。
8. **用例分组标签须与断言类型一致。** `describe("edge / reverse")` 下不得塞纯 Happy 导航；标签注水会使 §2.1 审查误判硬度。
9. **`describe("reverse"|"Reverse…")` 块内禁止成功主路径。** 主断言若是「成功 mutate / 成功导航 / onSuccess 刷新 / 成功页」→ 必须放在 `happy`（或无 reverse 字样的）块。把 success 塞进 Reverse 分组 = **未完成**，不得声称本轮硬度审查通过。
10. **loading / empty / 仅展示文案不得标 Reverse 或 Happy。** 仅「出现骨架/空态文案」标成 reverse/happy = 标签违规。
11. **水位目标不豁免标签与硬度。** 「冲到 X%」合法，但仍须遵守本条与 §2。不得先凑水位再改标签。交付前自检：Reverse 块内是否含 onSuccess/成功页/成功 mutate。
12. **接线只测 helper = 未完成。** 抽出谓词或改 effect deps 时，适用 [product-safety.md](product-safety.md) 闸门 2–3：必须有用户动作打到宿主的用例，且删光 helper 单测仍能抓住「源覆盖用户态」。只钉 `shouldX`、mock 掉 Tabs/Popup/宿主 effect = 缺口。典型反例：`route !== local` + deps 含 local → 点 tab 被回写。
13. **Expected 从 SUT 或源码抄。** `expected = mapX(input)`、或断言值来自同一实现的另一导出 = 自己测自己。须改手写期望并标明真相源，否则该条未完成（`SKILL.md` §0 / GE）。
14. **列表字段空 ≠ 列表元素洞。** 只断言 `field: null` 或 `items` 缺失/`[]`，却未喂 `[null, valid]` → U1/I2 对列表 mapper **未完成**（运行时可 `null.xxx` 崩）。细则与对/错样例：[examples.md](examples.md)、[jargons.md](jargons.md) `u-dims`。

反例口径：绿屏 + 高覆盖率 + 零雷点，**不能**抵消上述浅测。代码反例见 [examples.md](examples.md)。

## 2. 水位目标怎么做到（合法路径）

「冲到 X%」要执行，不拒绝。用户未点名文件时同样执行。顺序固定：

1. **量。** 跑覆盖，写下当前%、exclude、按文件/职责的 miss。miss 是候选，不是许可改产品。
2. **选。** 排序：有外部真相源或适用 common scene、且职责用户可观察 → 再按 miss。禁止优先「最好刷绿的行」，禁止从 miss 行发明 Expected。无独立职责的死代码 / 已被 Happy 蕴含的 early-return → 计入安全上限，**不编造 Edge**。
3. **写。** 满足 [truth-sources.md](truth-sources.md)、`SKILL.md` §0、§2.1 + [test-integrity.md](test-integrity.md) §0–§4；执行顺序自决。硬锁独立 Expected 与产品冲突 = A → 确认卡 + `product-safety.md` 闸门 2（Classic 或 Fast Path）。禁止无独立 Expected / 无 RED 证据改产品凑绿，禁止改 Expected 吞 A，禁止把钉现状写成水位完成。
4. **再量。** 记录新水位。重复 2–4。
5. **封顶。** 剩余 miss 只能归为：壳未以合格 L2 挂载、死代码、已声明 exclude、须真机/e2e、再盖必须改接线。到此交**安全上限**，停止。

**未点名文件 ≠ 可改源码。** 产品改动义务：[product-safety.md](product-safety.md)。覆盖率增量不是改 deps 的许可。

形态闸用语见 [jargons.md](jargons.md)。落盘前主断言必须与形态一致。已有合格 Happy 时，本轮下一刀必须补缺失的 Edge/Reverse 维，禁止堆第二条 Happy 刷行。标签与断言不一致 → 该条未完成（§1.8–1.11）。

报告数字时：必须写 exclude；不得暗示被排除层已测够。未到 X% 且闸门未破、安全上限已说明 = 本轮诚实完成。谎报已到 X%、或破闸门凑满 = 未完成。

禁止：为水位 peel / 空挂载 smoke / 改 deps / 为 % 申请确认卡 / 非具名并行刷行。miss 在未执行的 page 上 → 写合格 L2，或接受该壳计入上限。把已测 helper wire 进从未挂载的 page 可能 covered↑、denom↑、**百分比回落**——这不是改接线的许可。

编排壳大波挂载后 A=0 很常见，不能当产品质量证明。A=0 先问探针是否打到可变语义。

从源码抄 Expected、或 characterization peel，都不是 TDD，更不是为水位改接线的许可。完整停工线：[product-safety.md](product-safety.md)。
