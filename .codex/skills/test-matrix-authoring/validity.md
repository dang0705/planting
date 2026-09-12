# 测试有效性与覆盖率读法

行为义务以 `SKILL.md` 为准。本文件展开防浅测与水位误判细则；编写/审查命中相关风险时再读。测试是否能抓真实错误改动、期望值是否独立、替身是否越界、交付前突变检查见 [test-integrity.md](test-integrity.md)。

## 1. 防浅测（对应 SKILL 硬规则「证明硬度」）

§2.1 保证「维有没有写」；本条保证「写了是否真证明」。下列任一命中 → **不得宣称该对象编写完成**，须加深或在覆盖表标「浅 / 缺口」：

1. **替身后仍属 SUT 的分支未触达。** Mock 外壳（Popup / Cascader / Dialog / Tabs）合法，但替身后，**与本轮目标或已识别适用风险相关的** SUT 分支（如 lazy load、cache 回填、confirm 组装、失败兜底）仍须触达。只测「点开外壳 + 直通 happy」= 浅。
2. **受控回流测半截。** 对象以受控 props 为准（如 `selectedValues`）时：不得用「父未回流的旧 props」去断言确认 payload，冒充「选完再确认」。须驱动宿主完成真实受控回流（如受控壳、`rerender`、`setProps` 等），使确认断言看到**回流后的业务结果**。
3. **Reverse 只证明「还在」。** 禁用/不可选/取消路径必须钉业务结果（回调参数、选中 id、提交日期/sku），禁止只断言「文案还在 / 月份标题还在 / 节点仍挂载」。
4. **覆盖表不可用摘要糊弄适用维。** 对本轮每个被测对象，适用维须逐条 `已写` 或 `缺失`；不适用维须 `N/A + 原因`。禁止只交一张「摘要表」却漏掉已识别的适用维。
5. **`disabled` ≠ 防御分支已测。** UI 禁用只证明控件不可点；若 SUT 在 handler 内另有 toast / early-return（防御纵深），须另开用例触达该 handler（例如测试替身提供「强制调用」入口），并断言禁止的副作用未发生。只点 disabled 按钮不算该防御维已写。
6. **替身不得拆掉本轮要测的确认/取消通道。** Dialog / Alert mock 成空组件合法，但若本轮 Reverse 是「取消不 mutate / 确认才提交」，替身仍须暴露可点的 cancel/confirm（或等价回调入口）；`null` 替身导致交互树物理消失 = 测不到，不是已覆盖。
7. **壳测 mock 掉 page hook 时不得冒充 hook 已证。** 页面 L2 若替换 `useXxxPage` 一类编排 hook，证明范围仅限壳门闸（loading / empty / ready）；CTA、onError、半成品回滚须在 hook 单测（或解开 mock 的编排测）里另证，禁止在交付里写成「整页业务链路已覆盖」。
8. **用例分组标签须与断言类型一致。** `describe("edge / reverse")` 下不得塞纯 Happy 导航；标签注水会使 §2.1 审查误判硬度。
9. **`describe("reverse"|"Reverse…")` 块内禁止成功主路径。** 主断言若是「成功 mutate / 成功导航 / onSuccess 刷新 / thankyou」→ 必须放在 `happy`（或无 reverse 字样的）块。把 success 塞进 Reverse 分组 = **未完成**，不得声称本轮硬度审查通过。
10. **loading / empty / 仅展示文案 → Edge（C1），不得标 Reverse 或 Happy。** Reverse 必须钉「不该发生的副作用未发生」；Happy 必须钉成功业务结果。仅「出现骨架/空态文案」标成 reverse/happy = 标签违规。
11. **覆盖率目标任务不豁免标签与硬度。** 「冲到 X% Lines」仍须遵守本条与 §2；不得用「先凑水位再改标签」当交付完成。交付前应用用例名/describe 自检：Reverse 块内是否含 onSuccess/thankyou/成功 mutate。
12. **接线只测 helper = 未完成。** 抽出谓词或改 effect deps 时，适用 [product-safety.md](product-safety.md) 闸门 2–3：必须有用户动作打到宿主的用例，且删光 helper 单测仍能抓住「源覆盖用户态」。只钉 `shouldX`、mock 掉 Tabs/Popup/宿主 effect = 缺口。典型反例：`route !== local` + deps 含 local → 点 tab 被回写。

反例口径：绿屏 + 高覆盖率 + 零雷点，**不能**抵消上述浅测。代码反例见 [examples.md](examples.md)。

## 2. 覆盖率与排雷的读法（防误判）

覆盖率是观测值，不是合格证明。编写/冲水位时遵守：

1. **分母约定与数字绑定解读。** 若任务或仓库故意排除 `api/*`、skeleton、实验页等，报告 Lines% 时必须同时写清 exclude；不得暗示被排除层「也已测够」。
2. **miss 堆在未执行的 page/壳时，只 peel helpers 往往冲不到目标水位。** 把已测 helpers wire 进从未挂载的 page，可能出现 covered↑ 但 denom↑ 更多、**百分比回落**。要动 page 语句 → 质量合格的 L2 挂载（或接受该壳不进分母）；禁止为抬百分比做空挂载 smoke。
3. **编排壳大波挂载后 `A=0` 很常见，不能当产品质量证明。** 门闸文案 + 重 mock query/子树时，真雷多在已 peel 的纯函数或被 mock 掉的 hook 里。`A=0` 先问「探针是否打到可变产品语义」，再问「有没有雷」。
4. **Characterization peel ≠ TDD，更不是改接线许可。** 先抽 helpers 再补测可以钉**当时**行为、涨覆盖，但不是 RED→GREEN，也不得在同一步改 deps/同步方向。用户要求 TDD 或要改产品：先宿主红，再改。完整停工线：[product-safety.md](product-safety.md)。禁止把 peel 交付说成严格 TDD。
