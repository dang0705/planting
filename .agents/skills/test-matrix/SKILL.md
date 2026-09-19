---
name: test-matrix
description: >-
  Non-E2E test matrix as TDD: independent Expected from external truth
  (DTO/API docs, design, requirements, approved facts) plus common scenes,
  then verified RED/GREEN evidence. Advanced agents may choose a classic
  stepwise path or a verified fast path; correctness gates remain hard. USE WHEN writing, reviewing, running, or debugging unit,
  component, or integration/contract tests, or a named runner (Vitest, Jest,
  pytest, Testing Library, Playwright/Cypress Component, JUnit) is the vehicle,
  or the user asks to derive Expected from design/DTO/docs. Isolated component
  mount—even in a real browser—is still component testing.
  DO NOT USE to explain testing vocabulary, for deploy/security “雷点” with no
  test work, or for a full-app user journey (hand off to the repo E2E skill).
  Do not expand scope beyond the current ask.
---

# Test Matrix

只写跨框架义务。不绑定产品域、后端品牌、UI 库或单一 runner。

词表与例子在 [jargons.md](references/jargons.md)。下面「高冲突词」表的执行外延以本文件为准，不靠点开词典才生效。其余细则 md 不另下定义。

**按当前任务执行编写、审查或运行；不得因加载本 skill 自动扩大修改范围。**

**只加载当前被测对象对应的 runner 实践；runner 识别可与侦察同轮完成，禁止通读所有框架百科。**

## 0. 本质：这是 TDD skill

本 skill 的一等公民是 **独立 Expected**，不是覆盖率、不是「测还在」、不是从源码抄现状。

**上层先决条件：先进模型应该获得「执行路径自由」，而不是「正确性约束自由」。** Plan、逐 case 推进、是否显式分成 RED→GREEN→REFACTOR、一次还是多次编辑，属于执行路径，不作仪式性硬门禁；独立 Expected、Truth Source、Scope、真实路径、RED/GREEN 证据、Mutation/回归与交付证据仍是硬约束。结构第一次已经合理时，不要求为了流程表演额外 Refactor。

**Agent-native TDD：** 必须在把当前实现当作答案之前，从**外部真相源**写出并固定「应当如何」，叠上 **common scene**（§2.1 固定风险维）。**新增 / 修正产品可观察行为时，至少一条表达该 Expected 的代表性 executable test（新写或已有）必须先于第一次对应产品行为修改落盘；无需先单独运行 RED。** Expected 固定后，代理可自行选择：① Classic：先让宿主用例在当前产品上 RED，再改至 GREEN；② Fast Path：先落上述代表性测试，再可一次性完成其余测试 / 实现，交付前用受控回退或代表性 Mutation 证明目标 Expected 会 RED，再完整恢复并 GREEN。Fast Path 的反事实 RED 失败 → 不得宣称完成，须回滚产品改动或补强测试。
**自己测自己：** `expected = sut(x)`、或读实现/现行 UI 当合同。绿只说明没跟自己打架。

编写 / 修改的每条 case 都必须能回答：Expected 来自哪类真相源（或哪条 common scene）？档位是硬锁还是样例/待确认？可与测试体同轮生成，但答案不得从 SUT 反推；答不出 → 不落盘为完成，去采源或标明 characterization 缺口。

细则：[truth-sources.md](references/truth-sources.md)。设计分档：[design-expected.md](references/design-expected.md)。

### 外部真相源（主动采集，不等用户点名才看）

| 源 | 典型锁 |
| :--- | :--- |
| DTO / 接口文档 / 已批准响应制品 / live 形状 | 字段与协议 |
| 设计 / 原型（硬锁，须分档） | 槽位、交互、动作 → 下游 |
| 需求 / 规格 / 验收 | 业务规则与禁止项 |
| 已批准跨会话 fact（仅当仓库有记忆插件且 fact 为允许形状时） | 稳定合同与跨边界规则 |

源码只用于识别 SUT 与 Real path。实现注释不是合同。过时 DTO、单帧营销文案、未决 fact 不得升成硬锁。

### Common scene

U/C/I 维是固定场景目录，与真相源正交：合同给正确答案，场景给必须独立覆盖的风险（空、边界、禁用不得副作用、受控回流、写中断等）。只有 Happy 合同或只有从实现抄的 Edge，都不算本 skill 的 TDD。

### 降级：characterization

仅当真相源缺失、又必须防回潮时，允许钉现行行为，**交付必须标明 characterization，不得自称 TDD / 按合同验收**，并列出缺哪类源。  
Characterization 当时不得改产品；一旦有硬锁 Expected 红了，必须转入闸门 2，禁止改 Expected 吞 A。钉现状**不是**编写模式的默认目标。

## 目录（渐进披露 · 一层深）

细则均在 [references/](references/)。**默认只读本 `SKILL.md`；到对应决策点再加载命中的文件。正文出现链接不等于自动加载指令。** 禁止开局通读全部 md，也禁止因为任务是「编写测试」就预读全部细则。已加载主文能直接裁定的事项，不为重复确认再开细则。

正常 TDD 的最小读取链保持完整：**本文件 → 识别当前 runner → 读取该 runner 摘要（若存在）→ 只读当前层对应的 U/C/I 风险段 → 在 Expected、测试真实性、产品改动等决策点按下表增量加载。**

| 文件 | 何时读 |
| :--- | :--- |
| [truth-sources.md](references/truth-sources.md) | Expected **不能由当前已给的单一明确来源直接写出**，或需要主动采源、处理多源/冲突、分档、characterization、L3 契约时读。若需求/DTO/规格已明确给出可审计 Expected，先用主文，不预读本文件 |
| [design-expected.md](references/design-expected.md) | **实际使用设计/原型作为 Expected 来源**，且需要判硬锁 / 样例 / 待确认时读；仅仓库存在设计稿不触发 |
| [jargons.md](references/jargons.md) | 需要 U/C/I、A/B/C、Test Double 细类或高冲突词边界时读；写/审查矩阵只读**当前层对应的 U、C 或 I 段**，不要整文件通读 |
| [product-safety.md](references/product-safety.md) | **准备写产品源码前必读**；或命中 peel、改接线、共享控件、产品授权/冻结判断时读。coverage/KPI **仅在开始考虑产品改动、授权/冻结、peel 或改接线时**触发；纯 coverage 运行/静态审查不读。G1=测试/harness 且本轮不改产品 → 不预读 |
| [test-integrity.md](references/test-integrity.md) | 写/改测试进入**测试实现与真实性验证阶段**时读；添加 mock/helper、Fast Path、Reverse/高风险接线、Mutation/执行反写时必须读相应细则。纯只运行不读；纯审查仅在真实性存疑时读 |
| [validity.md](references/validity.md) | 出现浅测风险、L2/L3 受控回流/壳测、Reverse 分类争议、coverage/水位目标、A=0 或安全上限判断时读。简单 L1 且无这些信号不预读 |
| [reporting.md](references/reporting.md) | **准备交付完整编写/修改结果时**需要排雷表、A/B/C、合格率或水位报告才读；任务开始时不预读，纯审查/只运行不读 |
| [incident-dryrun.md](references/incident-dryrun.md) | 需要对撞已知翻车/验证停工卡，或任务、diff、审查对象出现**可观察事故信号**时读：peel、改接线、共享控件、源状态↔用户本地态同步/deps、宿主真实路径/控件改动、coverage 驱动的产品改动。仅有普通产品改动或正常无冲突 TDD 不读 |
| [examples.md](references/examples.md) | 规则已懂但需要结构或对/错示例时读；不得为了「多看几个例子」预读 |
| [frameworks.md](references/frameworks.md) | runner 摘要/邻近测试仍不能确定方法名、配置或官方 URL 时读 |
| `frameworks/<runner>.md`（例 [vitest.md](frameworks/vitest.md)） | 已识别 runner 且该摘要存在：**写/改/运行前必读**；纯静态审查仅在 runner 语义影响判断时读 |
| `hosts/` | 当前对象确实经过该宿主，且**宿主语义参与当前决策**时读（如编写/修改宿主相关测试、判断宿主 API/真实路径/mock/runtime/控件约束）；纯运行、或与宿主语义无关的静态审查不读。仅仓库/项目使用该技术栈不触发；不存在、对不上 → 只用通用规则 |

分层目录与脚本以目标包 `package.json` 为准；仓库根若另有分层规则文件（如 `AGENTS.md`）则一并遵守，没有则只用本 skill。

## 高冲突词（本文件自洽）

与常识反向的外延。执行时以本表为准；[jargons.md](references/jargons.md) 只扩例子与边界，不得写反。

| 词 | 执行外延 |
| :--- | :--- |
| **独立 Expected** | 外部真相源 ∪ common scene 写出的「应当如何」。禁止用 SUT/同一 mapper 生成。无来源不得宣称 TDD。 |
| **TDD** | 独立硬锁 Expected 必须先于实现答案被固定；新增 / 修正产品可观察行为时，至少一条表达该 Expected 的代表性 executable test（新写或已有）须先于对应产品行为修改落盘；并有可审计 RED/GREEN 证据。可走 Classic（当前产品先 RED → 确认卡 → GREEN）或 §0 Fast Path（代表性测试先落盘 → 一次实现 → 受控回退/Mutation RED → 完整恢复 GREEN）。钉现状、无独立 Expected、源码先改后补代表性测试、无 RED 证据、为 % 改产品都不是 TDD。 |
| **characterization** | 缺真相源时钉现行行为。必须标明；不得当编写默认；不得自称合同验收。 |
| **冻结** | 无独立硬锁 Expected，或无法满足 G3 的 RED 证据要求时，不得改产品控制流。**不是**禁止 TDD / Fast Path。 |
| **peel** | 从宿主抽出 helper，且产品改为调用抽出物。只抽文件、不改调用点仍是预备。禁止为水位 peel。 |
| **点名** | 用户原话写出该文件**且**该行为。「冲到 X% / 补测 / 允许」不是点名改控件。未点名文件仍须按选择协议写测，不得读成禁止由红转绿。 |
| **浅测** | 写了用例但没证明适用风险，或 Expected 不独立。绿屏 + 高覆盖不能抵消。 |
| **改接线** | 改事件 → 本地态 / query / store / mutate 的控制流（含 deps 方向、打开 API、选择语义）。KPI / 补测不是许可。 |
| **确认卡** | Cursor `preToolUse` 的 `ask`：同意 = **该文件本次**写入。不是整仓授权。禁止为水位 / % / 可测性去弹卡。 |
| **安全上限** | 合法补测后仍低于 X%、再往上必须在无独立 Expected / 无 RED 证据下改接线 → 交当前% + exclude + miss 分类并**停止**。不是「已到 X%」；不是改产品凑满。 |
| **执行反写** | 交付前突变抽检四步：临时改一行 → 预期用例须红 → **完整写回** → 再绿。本轮新写 Reverse / 半截受控链 / 高风险接线至少 1 条；Happy / 纯 Edge 展示允许心智 Mutation。交付须同时有红证据与写回证据；缺写回 = 未完成。**不是** Reverse case，也不自动构成产品改动授权；仅在 §0 Fast Path 满足闸门 2 时可作为反事实 RED 证据。细则：[test-integrity.md](references/test-integrity.md) §4.1。 |

## 识别 runner

1. 目标文件所在包的测试命令、最近的 runner 配置（如 `*vitest*` / `*jest*` / `pytest.ini`）
2. 同目录或邻近已有测试的 import / 运行方式
3. 仍不清时，根目录依赖只作**候选**；多 runner 并存则跟**本次被测路径**

写明结果（runner 名 + 依据路径）。识别不到 → 问一句或跟已有测试，不要猜。

上下文优先级：被测源码 + 邻近测试 + 该目标配置 → `frameworks/<runner>.md` → 仍不清再拉 [frameworks.md](references/frameworks.md) 中与锁定主版本匹配的官网。官网**不得覆盖**本文件的分层、跳过、证明范围、排雷口径、**§0 Expected 本质**。

## 1. 任务模式

| 模式 | 要做 | 不要做 |
| :--- | :--- | :--- |
| **编写 / 修改** | 满足 §0 的独立 Expected 与证据义务、§3.3 停工卡、§2–§4；**按「目录」的决策点增量加载细则**：进入测试实现/真实性验证时读 [test-integrity.md](references/test-integrity.md)，准备写产品源码前读 [product-safety.md](references/product-safety.md)，需要完整排雷/合格率模板时再读 [reporting.md](references/reporting.md)。执行顺序、是否显式 Plan、逐条还是批量由代理按任务确定，但须满足 §0 的 executable Test First 底线。跑相关套件；交付 §2.1 + 闸门 0 + 真实性记录（含 Expected 来源）。任务含水位目标时按 §3.12 合法路径追，追不到则交安全上限 | 从源码发明 Expected；为水位 peel / 改接线 / 空挂载；把 characterization 写成 TDD；开非具名子代理写测或改产品；未到 X% 却宣称已到 |
| **审查** | 评 Expected 是否独立、真相源是否够、风险是否被验证、A/B/C 是否诚实、证明范围是否说清；**发现浅测/受控回流/Reverse/coverage 等信号时**再读 [validity.md](references/validity.md) | 未要求时改产品或测试 |
| **只运行** | 报告通过/失败/跳过/未验证与失败原因 | 把 skip 写成「已验证」；**不修改任何文件** |

失败**不**自动获得修改权限。只有当前任务已授权编写/修复时，才改测试或产品。硬锁 Expected 与产品冲突 = 表 1 的 A；有编写授权时须取得确认卡并满足 §0 的 RED/GREEN 证据（Classic 或 Fast Path），不得改 Expected 吞掉。

排雷全文：仅当本轮被授权「写/改测试或产品」时必出。纯审查、纯只运行 → 报告结果或缺口即可。发现未授权修复的产品缺陷仍须写入表 1（状态「未修」），N 计已修数。

## 2. 分层与形态（义务）

按范围选层，不按是否用浏览器。层名与 Happy / Edge / Reverse 的清单见 [jargons.md](references/jargons.md)，此处只定义必须执行的选择。

每个被测对象必须能回答：它是 L1 / L2 / L3 哪一层；L3 还须写清哪些依赖真、哪些被替换。可与测试实现同轮判断。

**跨层断言：** 禁止在多层穷举同一规则。允许同一业务结果在不同层承担不同责任。选错层（该 E2E 却写在矩阵里）→ 停，换层或换 E2E skill。

**E2E 分界：** 仅完整应用旅程、真实页面栈或宿主运行时 → 移交 E2E。隔离 `mount`（含真浏览器 Component）仍走本 skill 的 L2。

Happy / Edge / Reverse 宜分块。形态只看主断言，落盘前过形态闸（按主断言三选一，不是看 `describe` 名）。Happy 的正确答案仍须来自真相源，不是「点了就成功」。

### 2.1 风险维度 = common scene 目录（审查清单，不是条数门禁）

写或审查前只扫 [jargons.md](references/jargons.md) 中**当前层对应的风险段**：L1→U1–U7，L2→C1–C7，L3→I1–I5；同一对象跨层时再增量读对应段，禁止因此通读整份词典。**适用 → 至少 1 条独立用例，且该用例 Expected 独立。不适用 → 覆盖表写 `N/A` + 一句原因。**  
以职责为准，不以文件均摊条数。维的「测哪类错」不能代替真相源的「何为正确」。  
**列表/集合 mapper：** U1 必须区分「字段空」与「**元素洞**」；只写前者 = U1 未完成。事故样例与对/错写法见 [examples.md](references/examples.md)。

| 被测对象 | 层 | 维度 ID | 用例名 | Expected 来源 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Foo` | L2 | C1 | `…` | 设计硬锁 / 需求 | 已写 |
| `Foo` | L2 | C4 | — | — | N/A：无外层点击目标 |

适用维为「缺失」，或已写但 Expected 从 SUT 抄 → 不得宣称编写完成。

## 3. 硬规则（完整义务在此；细则链出文件，不链词典）

1. **独立 Expected 先于实现答案；行为改动还须 executable Test First。** Expected 来源须是 §0 真相源 ∪ common scene；允许与测试体同轮生成，但禁止从 SUT/当前输出反推。若新增 / 修正产品可观察行为，至少一条表达该 Expected 的代表性 executable test（新写或已有）必须先于第一次对应产品行为修改落盘；无需先单独运行 RED。纯测试任务、characterization（不得改产品）和已有回归保护下的纯行为保持重构不要求新写测试。细则：[truth-sources.md](references/truth-sources.md)。
2. **L1 / L2 不打真实外网。** 需要外边界 → L3，或对明确边界使用 Test Double。
3. **L3 Happy 不臆造契约。** 声称验证外部协议时：字段须来自真实响应或已批准制品。制品可追溯 ≠ provider 已验证；未跑须写明。DTO 与 live/文档不一致时以可核对响应为准。
4. **跳过 ≠ 验证完成。** 见 §3.1。
5. **适用风险必须验证，未覆盖必须报告。** 见 §2.1。禁止固定条数凑数。禁止用第二条 Happy 冒充缺失的 Edge/Reverse。
6. **声明证明范围。** 写清经过哪些产品代码、替换了哪些边界。
7. **编写推进结束**须满足 §0、§2.1 与 §3.3 主文闸门；若命中「目录」中的产品安全或防浅测/水位触发条件，再读取并满足 [product-safety.md](references/product-safety.md) / [validity.md](references/validity.md) 对应细则。未满足则报告缺口，不得宣称完成。合格率与行覆盖不能替代覆盖表、Expected 来源与（若适用）排雷表。
8. **证明硬度优先于条数。** 禁止半截受控链、替身后躲开本轮 SUT、或「页面还在」式 Reverse。细则：[validity.md](references/validity.md) §1；水位误判：[validity.md](references/validity.md) §2。
9. **矩阵不得制造源码 bug。** 无独立硬锁 Expected 不得改产品控制流；新增 / 修正产品可观察行为还须先满足 §0 executable Test First 底线。改产品须有可审计 RED 证据：Classic 先红后改，或满足 §0 Fast Path 后用受控回退/Mutation 补出反事实 RED；同 diff 须有宿主证明（删掉 helper 测仍能抓回归）。细则：[product-safety.md](references/product-safety.md)。peel 只测纯函数、或为可测性改 deps = **未完成 / 须回滚**。
10. **测试必须能抓真实错误改动。** 每条声称完成的测试都要能说出 Break、独立 Expected（含来源）、真实经过的 Real path 和代表性 Mutation；只测 mock/helper、用 SUT 生成 expected、或无法指出会变红的突变 = **未完成**。本轮新写 Reverse / 半截受控链 / 高风险接线须至少 1 条**执行反写**，并同时交**红证据 + 写回证据**；仅纸面心智 Mutation、或红了不写回 = **未完成**。细则：[test-integrity.md](references/test-integrity.md)。设计作源须分档：[design-expected.md](references/design-expected.md)。
11. **执行主体：禁止非具名子代理。** 在仓库提供**经本 skill 白名单列名**的具名矩阵子代理之前，命中本 skill 的编写 / 修改 / 审查改文件 / peel / 授权改产品，**只许当前对话主代理执行**。禁止用 `Task` 开启 `generalPurpose`、`explore`、`shell`、`best-of-n-runner` 等未列名子代理并行写测、改 harness、改产品。只读侦察默认主代理自做；若误开，其产出不得直接落盘，须主代理按 §3.9 / [product-safety.md](references/product-safety.md) 重审后再改。具名子代理上线后须在本条增补白名单名称；未列名 = 禁止。本条不豁免主代理：主代理仍须完整过闸门；**命中「目录」的 product-safety 触发条件时**，不得以「已读 SKILL」代替 [product-safety.md](references/product-safety.md)。
12. **水位是合法次要目标，不能替换 §0。** 「冲到 X%」要执行，不得整句拒绝，也不得改成「从 miss 行发明 Expected」。对象由 [validity.md](references/validity.md) §2 选出，但每条仍须独立 Expected。无独立硬锁 Expected 不得改产品；需要改产品时须确认卡 + §0 RED/GREEN 证据（Classic 或 Fast Path）。禁止为水位 peel、改接线、空挂载、非具名子代理、改 exclude、或仅为 % 去弹确认卡。测完仍低于 X%、再往上只能靠无独立 Expected 的产品改动 → 交**安全上限**。细则：[validity.md](references/validity.md) §2、[product-safety.md](references/product-safety.md)。
13. **交付缺件 = 未完成。** 编写/修改缺任一项不得宣称完成：§0 Expected 来源、§2.1 覆盖表、闸门 0 仅一句、真实性表（Break / Expected / Real path / Mutation）、相关套件结果。把 characterization 写成 TDD、缺 Mutation、或命中执行反写档却无红证据或无写回证据、或答不出闸门 5 → 该对象标缺口。改了产品源码却未经用户确认卡同意 = 违规；执行反写探针未完整写回 = **等同未授权产品改动残留**，禁止把探针当交付改动。

### 3.1 跳过与失败

| 情况 | 处理 |
| :--- | :--- |
| 本地可选真实服务，未配凭据 / 主机不可达 | 可 skip，结论标 **未验证** |
| CI 或用户明确要求执行的套件，环境未就绪 | **环境失败 / 阻塞** |
| 用例目标就是鉴权失败、超时、4xx/5xx、降级 | **断言预期行为**，禁止因出错而 skip |

### 3.2 Test Double 与时间

种类见 [jargons.md](references/jargons.md)。假时钟 / 假随机用完必须在 `afterEach`（或等价）恢复。方法名见 [frameworks.md](references/frameworks.md)。

**L2 断言：** 用户可观察行为优先；断言须区分对错；禁用/取消后断言**被禁止的**业务副作用未发生。

### 3.3 停工卡（落盘前须满足；可一次性自检）

写测试或产品文件之前须能回答。无需为了流程逐条表演；任一条命中「停」→ 本步不得落盘。

| # | 问题 | 停 |
| :--- | :--- | :--- |
| GE | 本条 Expected 是否来自外部真相源 ∪ common scene，且不是 SUT 生成？ | 否 → 不得落盘为 TDD 完成。去采源，或明确落盘为 characterization 并列入缺口 |
| G0 | 追水位时是否要用非具名子代理、peel、改接线或空挂载？ | 是 → §3.11 / §3.12 停。仅有「冲到 X%」目标 → 不停，走合法路径（仍过 GE） |
| G1 | 将改的文件是测试 / harness，还是产品源码（含 `*.helpers` peel、导航图声明、共享打开控件）？ | 产品 → 必须再过 G2–G5 |
| G2 | （仅 G1=产品）用户原话是否**点名**该文件且点名该行为？ | 「冲到 X% / 补测 / 补边 / 补探针」**不含**改控件、打开 API、选择语义、抽 helper。未点名 → 冻结，**除非**存在独立硬锁 Expected 与目标行为冲突，且 G3 能以 Classic 或 Fast Path 提供 RED 证据（解冻见 [product-safety.md](references/product-safety.md)）。确认卡同意仍过不了 G4（为 % 改产品） |
| G3 | 产品改动是否已有可审计 RED 证据，或满足 §0 Fast Path（独立 Expected 已先固定；若新增 / 修正行为，表达该 Expected 的代表性 executable test（新写或已有）已先于对应产品行为修改落盘；交付前将以受控回退/Mutation 证明反事实 RED）？ | 两者都否 → 只许加测或标缺口，禁止改产品。源码先改后补代表性测试不满足 Fast Path；须回滚对应产品改动后重新以测试先行进入，或按非 TDD 补测如实报告。Fast Path 最终未得到 RED → 产品改动须回滚。图缺边、断言选错 API、jsdom 点不到 ≠ 用户可观察失败 |
| G4 | 改动是否为了让某条断言、某条编译边、某个 %、某种可测性变绿？ | 是 → 闸门 4 停；改测对齐产品，不改产品迎合测 |
| G5 | 是否回写共享控件 / 跨页约定 / 未在真实响应出现的字段？ | 是 → 停。共享实现以既有路径为准 |

授权改产品且 G2–G3 通过后，仍须 [product-safety.md](references/product-safety.md) 闸门 0–5。对撞记录：[incident-dryrun.md](references/incident-dryrun.md)。

### 3.4 机器闸门（改产品源码必须问用户）

无配置、无白名单、不能关掉。代理不得用 JSON 自行放行。

**实现：** 项目 `.cursor/hooks.json` → `preToolUse`（Write / StrReplace / Delete / EditNotebook），`failClosed: true`。闸门脚本路径以仓库为准；需要脚本/路径线索时，再读 `hosts/` 下本轮已命中的适配文件。

| 将写的文件 | 闸门 |
| :--- | :--- |
| 仓库闸门脚本认定的产品源码（含 `*.helpers.*`、导航图声明、共享打开控件） | `permission: ask`（Cursor 确认卡；用户不同意则不落盘） |
| `*.test.*` / harness | allow |
| `.cursor/hooks.json` 或闸门脚本本身 | `ask`（防止代理拆闸门） |
| stdin 空 / JSON 坏 | `deny` |

通知方式就是确认卡，不是填 paths。确认卡效力见上方高冲突词表。

**自测：** 仓库若提供闸门路径夹具，按该包 `package.json` 里的脚本名跑（无 git、无 json 的判定测）。命令名不写在本文件。

**拦不住：** IDE 里人手改文件；Shell 重定向改文件（仍靠停工卡）。Hook 崩溃时 failClosed，按拦截处理。

## 4. 各层写法

**L1** 紧邻源码或仓库惯例目录。只测该函数/状态机的职责。Expected 以 DTO/规格/手算为主。  
**L2** props/slots/events 驱动。隔离挂载；浏览器只是环境。Expected 以设计硬锁 + 需求交互 + C 维为主。  
**L3** 写清协作图与替身边界。契约类 Happy 用真响应或已批准制品；Edge 用构造风险数据打在**实际经过的** mapper / 编排 / 客户端上。

层与形态不在此重复释义。示例：[examples.md](references/examples.md)。

## 5. 排雷结论（编写推进）

A/B/C 分类见 [jargons.md](references/jargons.md)（查 class-a 等条即可）。发现与修复分开；表模板与合格率见 [reporting.md](references/reporting.md)。先表后合格率；禁止把 B/C 写成已修复的排雷。A=0 且全是 characterization → 须声明未做 TDD，不得暗示产品已按合同验过。
