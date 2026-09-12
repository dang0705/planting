---
name: test-matrix-authoring
description: >-
  Non-E2E test matrix: write, review, run, or debug unit, component, or
  integration/contract tests. USE WHEN the user asks to add, change, review,
  or run those tests, or names a runner (Vitest, Jest, pytest, Testing Library,
  Playwright/Cypress Component, JUnit) as the vehicle for that work.
  Isolated component mount—even in a real browser—is still component testing.
  DO NOT USE to explain testing vocabulary (mock vs stub), for deploy/security
  “雷点” with no test work, or for a full-app user journey (hand off to the
  repo E2E skill). Do not expand scope beyond the current ask.
---

# Test Matrix Authoring

只定义测试概念与跨框架义务。不绑定产品域、后端品牌、UI 库或单一 runner。

**按当前任务执行编写、审查或运行；不得因加载本 skill 自动扩大修改范围。**

**先识别当前被测对象的 runner，再只加载这一套实践。禁止通读所有框架百科。**

## 目录（渐进披露 · 一层深）

| 文件 | 何时读 |
| :--- | :--- |
| [product-safety.md](product-safety.md) | §3.8 细则。本轮将改产品、peel/抽 helper、冲覆盖、或对象适用 C7/U7 → **必读**。硬规则 8 始终有效，不必每轮通读 |
| [test-integrity.md](test-integrity.md) | 写/改测试、添加 mock/helper、或交付前检查测试是否真能抓错 |
| [validity.md](validity.md) | 编写/审查防浅测、覆盖率误判、`A=0` 读法 |
| [reporting.md](reporting.md) | 编写推进：排雷表模板与合格率 |
| [examples.md](examples.md) | 需要结构或对/错示例 |
| [frameworks.md](frameworks.md) | 对齐方法名或官方 URL |
| `frameworks/<runner>.md`（例 [vitest.md](frameworks/vitest.md)） | 已识别 runner 且该摘要存在 → **必读** |
| [hosts/wechat-taro.md](hosts/wechat-taro.md) | 本仓经核验的 Taro/微信适配（路径以仓库为准） |

分层目录与脚本以仓库 `AGENTS.md` / 目标包 `package.json` 为准。

## 识别 runner

1. 目标文件所在包的测试命令、最近的 runner 配置（如 `*vitest*` / `*jest*` / `pytest.ini`）
2. 同目录或邻近已有测试的 import / 运行方式
3. 仍不清时，根目录依赖只作**候选**；多 runner 并存则跟**本次被测路径**

写明结果（runner 名 + 依据路径）。识别不到 → 问一句或跟已有测试，不要猜。

上下文优先级：被测源码 + 邻近测试 + 该目标配置 → `frameworks/<runner>.md` → 仍不清再拉 [frameworks.md](frameworks.md) 中与锁定主版本匹配的官网。官网**不得覆盖**本文件的分层、跳过、证明范围、排雷口径。

## 1. 任务模式

| 模式 | 要做 | 不要做 |
| :--- | :--- | :--- |
| **编写 / 修改** | 按 §2–§4 和 [test-integrity.md](test-integrity.md) 补测；命中 [product-safety.md](product-safety.md) 触发则过闸门；跑相关套件；交付 §2.1 + 闸门 0 声明 + 测试真实性记录 + [reporting.md](reporting.md) | 为凑条数发明职责；为覆盖/可测性改产品接线 |
| **审查** | 评风险是否被验证、A/B/C 是否诚实、证明范围是否说清；浅测口径见 [validity.md](validity.md) | 未要求时改产品或测试 |
| **只运行** | 报告通过/失败/跳过/未验证与失败原因 | 把 skip 写成「已验证」；**不修改任何文件** |

失败**不**自动获得修改权限。只有当前任务已授权编写/修复时，才改测试或产品。

排雷全文：仅当本轮被授权「写/改测试或产品」时必出。纯审查、纯只运行 → 报告结果或缺口即可。发现未授权修复的产品缺陷仍须写入表 1（状态「未修」），N 计已修数。

## 2. 分层：按范围与目标，不按是否用浏览器

```text
L3 Integration / Contract  多个真实模块协作；写清哪些依赖真、哪些被替换
L2 Component               隔离挂载的 UI 单元（jsdom / 真浏览器均可）
L1 Unit                    纯函数 / 算法 / 状态机 / 映射；零 I/O
```

| 层 | 要证明 | 不该证明 | 数据默认 |
| :--- | :--- | :--- | :--- |
| **L1** | 输入 → 输出 / 状态转换 | 网络、真实时钟抖动、完整 UI | 内存构造 |
| **L2** | 隔离组件的渲染、交互、空态/禁用 | 全应用路由与旅程 | 确定性 props / 本地 fake |
| **L3** | 模块之间的连接与编排 | 像素验收、系统权限弹窗 | 协作 + 边界是否真实 |

**L3 不是「必须真实联网」或「必须无头」。** 先回答：测哪些模块协作？哪些依赖真、哪些被替换？带 UI 的模块集成仍是 L3。契约验证是 L3 的一种，不是唯一形态。

**跨层断言：** 禁止在多层穷举同一规则。允许同一业务结果在不同层承担不同责任。选错层（该 E2E 却写在矩阵里）→ 停，换层或换 E2E skill。

**E2E 分界：** 仅当验证完整应用旅程、真实页面栈或宿主运行时行为时移交 E2E。隔离 `mount`（含真浏览器 Component）仍是 L2。

### 用例形态

| 形态 | 定义 | 数据 |
| :--- | :--- | :--- |
| **Happy** | 主成功路径 | L1/L2 内存数据；L3 按该用例真实边界选择 |
| **Edge** | 边界、空缺、极值 | 围绕对象实际职责与已知契约字段 |
| **Reverse** | 失败/取消/禁用/回滚 | 断言不该发生的副作用未发生 |

### 2.1 风险维度（审查清单，不是条数门禁）

写或审查前扫全表。**适用 → 至少 1 条独立用例（或等价参数化行，且断言新分支）。不适用 → 覆盖表写 `N/A` + 一句原因。**  
对象职责达不到某维时，**N/A 即合格**。以职责为准，不以文件均摊条数。

**独立用例** = 单独 `test`/`it`/`def test_*`。Happy 与 Edge/Reverse 宜分块。

**L1：** U1 空缺 · U2 边界 · U3 非法（对象负责校验时）· U4 幂等 · U5 失败回滚 · U6 并发（若适用）· **U7 源不覆盖用户态**（hook/编排持有源+本地时）  
**L2：** C1 空缺防御 · C2 极值呈现 · C3 禁用与边界 · C4 事件边界 · C5 条件显隐 · C6 受控回流（若适用）· **C7 源不覆盖用户态**（页/弹层持有源+本地时）  
**L3：** I1 协作链 Happy · I2 缺字段/空集合 · I3 错误语义 · I4 鉴权失败的产品处理 · I5 写中断无半成品

| 被测对象 | 层 | 维度 ID | 用例名 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| `Foo` | L2 | C1 | `…` | 已写 |
| `Foo` | L2 | C4 | — | N/A：无外层点击目标 |

适用维为「缺失」→ 不得宣称编写完成。

## 3. 硬规则（完整定义在此；细则链出）

1. **L1 / L2 不打真实外网。** 需要外边界 → L3，或对明确边界使用 Test Double。
2. **L3 Happy 不臆造契约。** 声称验证外部协议时：字段须来自真实响应或已批准制品。制品可追溯 ≠ provider 已验证；未跑须写明。
3. **跳过 ≠ 验证完成。** 见 §3.1。
4. **适用风险必须验证，未覆盖必须报告。** 见 §2.1。禁止固定条数凑数。
5. **声明证明范围。** 写清经过哪些产品代码、替换了哪些边界。
6. **编写推进结束**须满足 §2.1、[product-safety.md](product-safety.md) 闸门与 [validity.md](validity.md)；未满足则报告缺口，不得宣称完成。合格率不能替代覆盖表与（若适用）排雷表。
7. **证明硬度优先于条数。** 禁止半截受控链、替身后躲开 SUT、或「页面还在」式 Reverse。细则：[validity.md](validity.md) §1；水位误判：[validity.md](validity.md) §2。
8. **矩阵不得制造源码 bug。** 补测/冲覆盖默认冻结产品控制流；改产品须先红后改，同 diff 须有宿主证明（删掉 helper 测仍能抓回归）。细则：[product-safety.md](product-safety.md)。peel 只测纯函数、或为可测性改 deps = **未完成 / 须回滚**。
9. **测试必须能抓真实错误改动。** 每条声称完成的测试都要能说出 `Break`、独立 `Expected`、真实经过的 `Real path` 和代表性 `Mutation`；只测 mock/helper、用 SUT 生成 expected、或无法指出会变红的突变 = **未完成**。细则：[test-integrity.md](test-integrity.md)。
10. **执行主体：禁止非具名子代理。** 在仓库提供**经本 skill 白名单点名**的具名矩阵子代理之前，命中本 skill 的编写 / 修改 / 审查改文件 / 冲覆盖 / peel / 授权改产品，**只许当前对话主代理执行**。禁止用 `Task` 开启 `generalPurpose`、`explore`、`shell`、`best-of-n-runner` 等**非具名**子代理并行写测、改 harness、改产品或冲覆盖。只读侦察默认主代理自做；若误开非具名子代理，其产出不得直接落盘，须主代理按 §3.8 / [product-safety.md](product-safety.md) 重审后再改。具名子代理上线后须在本条增补白名单名称；未列名 = 禁止。本条不豁免主代理：主代理仍须完整过闸门，不得以「已读 SKILL」代替 [product-safety.md](product-safety.md)。

### 3.1 跳过与失败

| 情况 | 处理 |
| :--- | :--- |
| 本地可选真实服务，未配凭据 / 主机不可达 | 可 skip，结论标 **未验证** |
| CI 或用户明确要求执行的套件，环境未就绪 | **环境失败 / 阻塞** |
| 用例目标就是鉴权失败、超时、4xx/5xx、降级 | **断言预期行为**，禁止因出错而 skip |

### 3.2 Test Double 与时间

Stub / Mock / Spy / Fake / Dummy / Fixture。假时钟 / 假随机用完必须在 `afterEach`（或等价）恢复。API 对照见 [frameworks.md](frameworks.md)。

**L2 断言：** 用户可观察行为优先；断言须区分对错；禁用/取消后断言**被禁止的**业务副作用未发生。

## 4. 各层写法

**L1** 紧邻源码或仓库惯例目录。只测该函数/状态机的职责。  
**L2** props/slots/events 驱动。隔离挂载；浏览器只是环境。  
**L3** 写清协作图与替身边界。契约类 Happy 用真响应或已批准制品；Edge 用构造风险数据打在**实际经过的** mapper/编排/客户端上。

示例：[examples.md](examples.md)。

## 5. 排雷结论（编写推进）

分类：**A** 产品缺陷（仅「已修」算已排雷）· **B** 逻辑本正确、测试钉死 · **C** harness/mock。  
发现与修复分开；表模板与合格率见 [reporting.md](reporting.md)。先表后合格率；禁止把 B/C 写成已修复的排雷。
