# 本 skill 用语

**效力：** 词表、维度清单与例子在本文件，**不含某一仓库的组件名或导航图文件名**。冻结 / peel / 点名 / 浅测 / 改接线 / 确认卡 / 安全上限 的**执行外延以 `SKILL.md`「高冲突词」表为准**；本文件只扩例子与边界，不得写反。行为义务仍只认 `SKILL.md`。其它细则 md 不另下定义。宿主专名只写在 `hosts/` 下由仓库自行放置的适配文件，通用正文不得点名那些文件。  
**何时读：** 主文高冲突词表不够，或要查 U/C/I、A/B/C、Test Double 细类。写/审查矩阵时只读当前层对应的 U、C 或 I 段；到排雷分类时再读 A/B/C。禁止当测试百科整文件通读。  
**何时不读：** 用户只问通用测试词汇、且无矩阵任务 → 不加载本 skill。

Cursor 只认 Markdown 标题锚点。每条用语一个 `###` 标题，标题文本经 slug 后等于链接里的 `#id`。

## 对象与路径

### SUT

**SUT。** 本条用例真正要证明的产品代码。

禁止误读：不是整仓；不是 mock 自己。

### stand-in

**替身。** 顶替慢/外部/笨重依赖的假实现（mock、假 Dialog、假 http 等）。

禁止误读：不是 SUT。不得把本轮要证的行为一并替掉。

### Test Double

**Test Double。** 替身总称。细类见文末 Dummy / Stub / Spy / Mock / Fake / Fixture。

禁止误读：不等于「随便 mock 掉 page hook 还声称链路已测」。

### host

**宿主。** 用户动作打到的页面/组件/编排（接线所在层）。

禁止误读：不是抽出的 `*.helpers` 纯函数。

### host-test

**宿主用例 / 宿主证明。** 驱动用户动作并断言下游业务结果的测试。

禁止误读：只调 helper / 只断言「还在」不算。

### wiring

**接线。** 事件 → 本地态 / query / store / mutate 的控制流。

禁止误读：不是「有 import 就算接上」。

### rewire

**改接线。** 改上述控制流（含 deps 方向、打开 API、选择语义）。

禁止误读：KPI / 补测不是改接线许可。

### peel

**peel。** 从宿主抽出 helper，且产品改为调用抽出物。

禁止误读：只抽文件不改调用点仍是 peel 预备；改调用点 = 改控制流。禁止为水位 peel。

### predicate

**谓词。** 抽出的 `shouldX` 一类布尔判断。

禁止误读：只测谓词 ≠ 宿主接线已证。

### deps

**deps。** effect / watch 依赖数组（或等价）。

禁止误读：为可测把 local 塞进 deps = 改接线。

### orchestration

**编排。** 页面/hook 里把查询、mutate、导航拼起来的逻辑。

禁止误读：mock 掉编排 hook 后不得声称编排已测。

### shell-gate

**壳门闸。** 只证明 loading / empty / ready 外壳。

禁止误读：不是整页业务链。

### harness

**harness。** 让测试能跑的 setup / 全局 mock / 假时钟等，非产品。

禁止误读：加厚 harness 合法；把 harness 当产品覆盖不合法。

### empty-mount

**空挂载。** `render` 了但不驱动本轮要证的动作与下游断言。

禁止误读：为刷行而 mount = G0 停。

### forced-entry

**强制入口 / 强制调用。** 测试替身提供的、用于触达 handler 的入口。

禁止误读：禁止加到产品导出上。

### Real path

**Real path。** 断言实际经过的产品代码 + 被替换的边界。

禁止误读：被整段 mock 掉的模块不算已测。

### jsdom

**jsdom。** 测里的 DOM 环境。

禁止误读：jsdom 点得到 ≠ 真机可见。宿主控件嵌套限制见 `hosts/` 下已命中的适配。

## 形态与层

### matrix

**矩阵。** 本 skill 的非 E2E 测试（L1/L2/L3）。

禁止误读：不是 e2e 旅程。

### L1

**L1 Unit。** 纯函数 / 算法 / 状态机 / 映射；零 I/O。证明输入→输出/状态转换。不该证明网络、真实时钟抖动、完整 UI。数据默认内存构造。

禁止误读：按是否用浏览器分层。

### L2

**L2 Component。** 隔离挂载的 UI（jsdom 或真浏览器均可）。证明渲染、交互、空态/禁用。不该证明全应用路由与旅程。数据：确定性 props / 本地 Fake。

禁止误读：真浏览器 mount 仍是 L2。

### L3

**L3 Integration / Contract。** 多个真实模块协作；写清哪些依赖真、哪些被替换。证明连接与编排。不该证明像素验收、系统权限弹窗。契约验证是 L3 的一种。

禁止误读：L3 ≠ 必须联网或无头；带 UI 的模块集成仍是 L3。

### Happy

**Happy。** 主成功路径。主断言=成功业务结果发生了。L1/L2 用内存数据；L3 按该用例真实边界选数据。

禁止误读：放进 reverse 块；只用「渲染出来了」冒充。

### Edge

**Edge。** 边界、空缺、极值。主断言=该职责在边界下仍正确。数据围绕对象职责与已知契约字段。

禁止误读：再写一条与 Happy 同断言的成功导航/mutate。

### Reverse

**Reverse。** 失败/取消/禁用/回滚。主断言=不该发生的副作用未发生。

禁止误读：loading/empty 文案（那是 Edge）；onSuccess / 成功页导航 / 成功 mutate。

### morph-gate

**形态闸。** 落盘前按主断言三选一：Happy / Edge / Reverse。

禁止误读：标签、`describe` 名、盖某行都不是形态。

### risk-dim

**风险维度 / 适用维。** U/C/I 清单。适用 → 至少 1 条独立用例；不适用 → 覆盖表 `N/A` + 原因即合格。

禁止误读：按文件均摊条数。

### independent-case

**独立用例。** 单独的 `test` / `it` / `def test_*`（或断言新分支的参数化行）。

禁止误读：一条 Happy 里顺手多一个 `expect` 算另一维。

### u-dims

**U1–U7。** L1：U1 空缺 · U2 边界 · U3 非法（对象负责校验时）· U4 幂等 · U5 失败回滚 · U6 并发（若适用）· U7 源不覆盖用户态（持有源+本地时）。

**U1 对「列表/集合 mapper」的强制外延：** 空缺不只含「数组缺失 / 空数组 / 字段为 null」。凡把 DTO/API 数组 `.map` / `.forEach` / `.find` 成域模型的函数，**适用**「**数组元素洞**」：元素为 `null` / `undefined`（稀疏或脏列表）。Expected：不抛；跳过洞或显式 fortify 后再映射。  
**禁止误读：** 只测 `special_price: null`（字段空）≠ 已覆盖 `items: [null, valid]`（元素洞）。`?? []` 只护数组本体，不护元素。

禁止误读：把别的函数的维算进本对象。

### c-dims

**C1–C7。** L2：C1 空缺防御 · C2 极值呈现 · C3 禁用与边界 · C4 事件边界 · C5 条件显隐 · C6 受控回流（若适用）· C7 源不覆盖用户态（页/弹层持有源+本地时）。

禁止误读：只点 disabled 当 C3/防御已测。

### i-dims

**I1–I5。** L3：I1 协作链 Happy · I2 缺字段/空集合 · I3 错误语义 · I4 鉴权失败的产品处理 · I5 写中断无半成品。

**I2 对「列表响应」的强制外延：** 空集合之外，若契约/live 可能出现 **items 含 null 元素**（脏列表），适用维须有独立用例：映射/页面不得因 `null.field` 崩掉。根因 fortify 优先在 L1 mapper；页面若直接 `.map(DTO)`，须证明走 fortify 后的入口。

禁止误读：I4 因 401 skip。

### u7-c7

**U7 / C7。** 源不覆盖用户态。

禁止误读：只测 helper = 该维缺失。

### controlled-reflow

**受控回流。** 父把更新后的 props 传回子，确认看到回流后的业务值。

禁止误读：父未回流就断言 confirm = 测半截。

### shallow

**浅测 / 硬度。** 写了用例但没证明适用风险（义务见 `validity.md` §1）。

禁止误读：绿屏 + 高覆盖不能抵消浅。

### E2E

**E2E。** 完整应用旅程 / 真页栈 / 宿主运行时。

禁止误读：不归本 skill；隔离 mount 不是 E2E。

## 覆盖与水位

### waterline

**水位。** 覆盖率数字（任务里常指 Lines%）。

禁止误读：水位不是完成定义；不能替代覆盖表/排雷。

### KPI

**KPI。** 用户只给「冲到 X%」一类指标、可不点名文件。

禁止误读：不是改产品授权。

### miss

**miss。** 未被执行到的产品行/分支。是选对象的候选。

禁止误读：不是改产品或编造 Edge 的许可。

### exclude

**exclude / 分母。** 覆盖统计包含/排除哪些文件。

禁止误读：改 exclude 假装到 X% = 假完成。

### safety-ceiling

**安全上限。** 合法补测后仍低于 X%、再往上必须在无独立 Expected / 无 RED 证据下改接线时：交当前% + exclude + miss 分类并停止。

禁止误读：不是「已到 X%」；不是改产品凑满。

### select-protocol

**选择协议。** 未点名文件时：适用维缺失且有职责 → 再按 miss；无职责死代码计入上限。

禁止误读：不是选最好刷绿的行。

### live

**live。** 打真实服务/真实响应（该仓库 L3 Happy 契约，环境变量名以仓库为准）。

禁止误读：无环境 skip = 未验证，不是已通过。

## 产品改动与 TDD

### TDD

**TDD / RED↔GREEN 证据。** 独立硬锁 Expected（外部真相源 ∪ common scene）须先于实现答案固定，并证明错误实现会 RED、目标实现会 GREEN。可走 Classic 先 RED 后 GREEN，或 `SKILL.md` §0 Fast Path 一次实现后用受控回退/Mutation 补反事实 RED，再恢复 GREEN。

禁止误读：执行路径自由 ≠ Expected/Scope/证据自由；钉现状 ≠ TDD；`expected = sut(x)` ≠ TDD。细则：[truth-sources.md](truth-sources.md)。

### Characterization

**Characterization。** 缺外部真相源时，钉现行行为、当时不改产品。交付必须标明，并列出缺哪类源。

禁止误读：≠ TDD；≠ 编写默认；≠ 按合同验收。测红不得改 Expected 吞 A；硬锁已红须转入 TDD。

### user-visible-fail

**用户可观察失败。** 用户路径上结果不对（提交错、导航错、态被源毁掉等）。

禁止误读：图缺边、断言选错 API、jsdom 点不到 ≠ 用户可观察失败。

### named

**点名。** 用户原话写出该文件且该行为。

禁止误读：「允许 / 补测 / 冲 X%」不是点名改控件。

### scope-creep

**扩权。** 用审查建议或 KPI 把未点名的产品改动做掉。禁止。

### confirm-card

**确认卡。** Cursor `preToolUse` 的 `ask`：同意 = 该文件本次写入。

禁止误读：不是整仓授权；禁止为水位/%/可测性去弹卡。

### machine-gate

**机器闸门。** hooks + 路径脚本，产品写入 ask；测试 allow。

禁止误读：拦不住 Shell/人手改文件。

### freeze

**冻结（控制流）。** 无独立硬锁 Expected，或无法满足 `product-safety.md` 闸门 2 的 RED 证据时，不得改产品控制流。

禁止误读：不是禁止 TDD。独立 Expected 与产品冲突 → 确认卡 + `product-safety.md` 闸门 2（Classic 或 Fast Path）完成 RED/GREEN 证明。

### appease

**迁就。** 改产品让测试好写/变绿。

禁止误读：应对齐测到真实路径。

### write-back

**回写。** 用测试命名、审查结论或错误谓词改产品语义。

禁止误读：测试不得定义业务。

### nav-graph

**导航图。** 声明「从哪到哪」的边表（文件名随仓库，义务不绑某一文件）。

禁止误读：用户点名补边 / 改边表 ≠ 点名改打开该边的页面控件，也 ≠ 换一套导航 API。

### graph-probe

**图探针 / 图边。** 对导航图声明边做的 L1 测试（边是否在声明里、键是否对上）。

禁止误读：边与产品打开路径不符时改探针、标缺口，或先证明用户可观察失败。禁止改打开控件、换 DOM 形态、换另一套导航 API 来迁就边。

### artifact

**制品。** 已批准的真实响应当作契约样本。

禁止误读：可追溯 ≠ provider 已验证。

### contract

**契约。** 外部协议字段/语义（来自真实响应或制品）。

禁止误读：L3 Happy 禁止臆造字段。

### flake

**flake。** 不稳定失败。

禁止误读：禁止为去 flake 改产品语义。

## 交付与停工

### land

**落盘。** 把测试或产品改动写入仓库。

禁止误读：停工卡未过不得落盘。

### stop-card

**停工卡 G0–G5。** `SKILL.md` §3.3 落盘前问题。先命中先停。

禁止误读：不是闸门 0–5 的另一套编号（闸门见下条）。

### gates

**闸门 0–5。** 产品安全闸：声明 / 冻结 / RED 证据 / 宿主证明 / 迁就 / 三问。

禁止误读：闸门 0 必须恰好一句。

### mine-clear

**排雷。** 把测出的问题按 A/B/C 交表。

禁止误读：合格率不能替代表 1。

### class-a

**A。** 测试暴露的产品缺陷（无论本轮是否改代码）。仅状态「已修」算已排雷。

禁止误读：把 B/C 写成已排雷。

### class-b

**B。** 逻辑本正确，测试钉死。不算已排雷。

### class-c

**C。** 仅 harness / mock / 选择器。不算已排雷。

### n-m

**N / M。** 表 1：M=发现 A 条；N=本轮产品源码已修条数。

禁止误读：未修仍须留在表 1。

### a-zero

**A=0。** 本轮没挖到产品缺陷。

禁止误读：≠ 无产品风险。

### mine

**雷点。** 表 1 的一条产品缺陷。

禁止误读：不是部署/安全空谈。

### proof-scope

**证明范围。** 经过哪些产品代码、替换了哪些边界。

禁止误读：禁止把 mock 掉的编排算进去。

### coverage-table

**覆盖表。** §2.1：对象 × 维度 → 已写 / 缺失 / N/A。

禁止误读：禁止只交摘要漏适用维。

### integrity-table

**真实性表。** Break / Expected / Real path / Mutation（命中执行反写档须含红证据 + 写回证据）。

禁止误读：缺 Mutation，或缺红证据，或缺写回证据 = 该对象缺口。

### Break

**Break。** 产品发生何种错误改动时本条会红。

禁止误读：「这一行变了」不合格。

### Expected

**Expected。** 独立期望：外部真相源（DTO/接口/制品/live、设计硬锁、需求、允许形状的 fact）∪ common scene。禁止用 SUT 生成。

禁止误读：`expected = sut(x)` = 实现镜像；读源码当合同；设计帧上每句文案都当死合同；未分档就用设计逼改产品；characterization 冒充 TDD。见 [truth-sources.md](truth-sources.md)、[design-expected.md](design-expected.md)。

### truth-source

**外部真相源。** DTO/接口文档/制品/live、设计硬锁、需求规格、允许形状的跨会话 fact。

禁止误读：源码、实现注释、现行 UI 观感不是真相源。跨会话 fact 仅当仓库有记忆插件时才采，且仅允许形状；无插件不得假装有 fact。

### common-scene

**Common scene。** §2.1 U/C/I 固定风险维目录。

禁止误读：不是从 miss 行发明的场景；不能代替「何为正确」。

### impl-mirror

**实现镜像。** 用 SUT 或其 mapper/builder 生成 expected，或把现行实现当合同。

禁止误读：这不是独立 Expected，不是 TDD。

### Mutation

**Mutation。** 代表性错误改动 + 会因此变红的用例名。命中执行反写档时须另附红证据与写回证据。

禁止误读：不是必须上 mutation 工具；纸面 Mutation 不能替代 §4.1；有红无写回不算完成。

### mental-mut

**心智突变。** 先想「改错哪行会红」。适用于 Happy / 纯 Edge 展示；想不出 = 缺口。

禁止误读：Reverse / 半截受控链 / 高风险接线不得只用心智突变交差。

### executed-sabotage

**执行反写。** 四步：临时改一行 → 预期用例须红 → **完整写回** → 再绿。交付须红证据 + 写回证据。

禁止误读：≠ Reverse case；普通执行反写 ≠ 产品改动授权；Fast Path 可把合格的受控反写作为闸门 2 RED 证据；缺写回 = 未完成 / 等同未授权产品残留；探针不得留进提交。

### pass-rate

**合格率。** 套件 passed/failed/skipped。

禁止误读：skipped = 未验证；不能替排雷。

### gap

**缺口 / 浅。** 适用维未证或证明不够硬。

禁止误读：不得宣称该对象编写完成。

### unverified

**未验证。** skip 或环境未跑。

禁止误读：禁止写成已通过。

### unnamed-agent

**非具名子代理。** `Task` 开 `generalPurpose` / `explore` 等未在 §3.11 白名单的代理。

禁止误读：禁止用来写测/改产品。只读侦察默认主代理自做。

### dry-run

**dry-run / 第一停点。** 用停工卡逐步对撞已知翻车，写下第一步不得落盘的位置。

禁止误读：不是运行时强制拦截。

## Test Double 细类

方法名对照见 `frameworks.md`。假时钟用完必须恢复（义务在 `SKILL.md` §3.2）。

### Dummy

**Dummy。** 占位参数，测试不依赖其行为。

禁止误读：当 SUT 用。

### Stub

**Stub。** 预定返回值，让 SUT 走某分支。

禁止误读：断言 stub 自己存在。

### Spy

**Spy。** 包真实或假函数并记录调用。

禁止误读：只 spy 外壳、不打宿主 handler。

### Mock

**Mock。** 口语常=模块/函数替身；严格义还可带调用期望。

禁止误读：本 skill 不靠 mockist 教条；越界仍按「替身不替 SUT」。

### Fake

**Fake。** 能工作的简化实现（内存仓库等）。

禁止误读：用 Fake 冒充外部契约 Happy。

### Fixture

**Fixture。** 固定数据或测试环境。

禁止误读：用 SUT 产出当 fixture expected。
