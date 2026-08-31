---
description: Codex AI Team Rules - global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# Repository Agent Rules

## 1. 项目技术上下文

- Language：JavaScript,Node.js。
- Frontend：UniApp 3.0，Vue 3，Tailwind CSS 3，uni-ui。
- Backend / Cloud：Tencent CloudBase、Cloud Functions、MySQL / TDSQL-C。
- Lint: oxlint
- formatter: oxformat
- State：Pinia。
- Build：Vite。
- Platform：微信小程序优先。
- AI：视觉识别与诊断链路涉及 Qwen / 混元 Vision 等能力。
- AI memories: ByteRover

## 2. 全局行为硬规则

1. 迭代过程中的业务逻辑、数据结构变动，如 `{a:{b:1}}` 改为 `{a:[1]}` 这种结构性调整的，优先采取最彻底的解决方案，避免使用保守策略如兼容、兜底代码应对此类变动从而导致无谓的代码膨胀。
2. 计划模式和实际开发过程中必须遵循 `如无必要、勿增实体` 的开发原则。以合理复用、扩展已有的表结构、字段、功能模块、组件为优先。确认以上实体或相似度超过80%的实体不存在、无法复用和扩展该实体或此类操作对原有实体存在污染风险的才考虑新增。
3. 开发过程中涉及到的文件超过 500 行的必须解耦拆分模块，拆分遵循高内聚、低耦合的设计思路，以提高维护性和复用性为最终目的。要求命名和目录划分合理并保证加载的性能。
4. 新增或重构复杂功能的，优先探索并复用现有组件或模块，现有不满足的需联网探索 `npm`/ `github` 上成熟的插件。避免复杂组件/模块手搓，其为最末位兜底。
5. 如需依赖新插件，必须考证其适配微信小程序、包体积、npm / GitHub 状态、周下载量、star 数和最近 3 年 release 记录，并提供简短介绍，征得用户同意。
6. 所有端上验收如果本轮代码未部署到云端，必须先成功跑通 `js npm run dev:mp-weixin:local-functions:lan` 的完整 LAN 本地函数 flow，并让小程序运行时命中新代码；只启动 scoped/local 单函数 gateway、backend curl、Node HTTP 或 gateway health，不得算端上验收完成。
7. 除非用户明确要求外部桥接，否则不得创建、派发或复用任何内部 subagent；所有工作由 main agent 完成。
8. 当运行时模型为 GLM 系列时，调用 `mcp__Figma_Desktop__get_design_context`、`get_metadata`、`get_variable_defs` 等 Figma 读取类工具后，禁止/跳过调用 `get_screenshot`；除非用户在当前会话中明确要求查看截图。
9. 具备完整开发生命周期或明显涉及业务逻辑的开发任务必须由 `main agent` 触发 `$dispatch-task` ，再由其内部判断不同的 `dispatch-tier` 执行各自工作流。已经处于 `$dispatch-task` 的任务严禁在后续的多轮会话中嵌套调用该skill。任何 `subagent` 严禁触发该 skill。
10. 客户端显示的文案必须从用户角度出发并符合常识，严禁将内部讨论用语、计算公式，拗口或难理解的文案暴露在界面中。必须遵循用户友好、利于用户操作的思想设计出最优的展示文案。
11. 输出的文案、用语减少专业词汇，尤其在 plan 模式或用户显式要求 planning时，要注重用词以通俗易懂的白话结合举例代替专业词汇。
12. Web/云端 external implementer 即使运行时自称 main/root，也必须在本项目中承担 external implementer 角色：只按 handoff 修改代码，完成后执行实现者自检和 unit tests；有 `figma_link` 的 UI 任务必须直接使用可用的 Figma 插件 / MCP / 工具读取设计并对齐 UI，不能依赖 main 的转述。外部桥接失败不得自动改派内部 subagent。
13. 严禁任何可能的黑箱行为，所有的设计方案都必须可视、可审计、可追溯、可回放。

## 3. 前端行为硬约束

1. 开发 `Vue` 组件时参考 `skills/uni-app` 及 `skills/vue-best-practices` ，如有概念冲突的采纳前者。
2. css优先使用 `Tailwind CSS` 组织样式并参考 `skills/tailwindcss-base-use` ，进阶布局则参考 `skills/tailwindcss-advanced-layouts`。
3. 合理利用前端缓存释放服务端开销，参考 `skills/pinia`。
4. **组件/页面的新增/更新中绑定了如 `@click` 、 `@change` 、 `@focus` 、 `@blur` 等交互事件的元素或 `uni-ui` 组件（非自定义组件）须同时绑定语义化的id，还需将此id的映射关系更新到 `docs/ai-rules/frontend-automation-id-policy.md` 以保证端上 `miniprogram-automator` 测试时能快速定位元素并正确触发事件**，示例代码如下
   ```vue
   <view id="example-id" class="flex " @click="toggleSubstrate(option.value)">
       <text
         class="text-[10px]"
         :class="
           isSubstrateSelected(option.value)
             ? 'font-semibold text-[#2f8f57]'
             : 'text-[#1f2933]'
         "
       >
         {{ option.label }}
       </text>
   </view>
   ```

## 4. 后端行为硬约束

1. 涉及部署环境、数据库、云函数、云存储、身份权限的参考 `.codex/skills/cloudbase`
2. 未经允许严禁开启 `CloudBase` 或任何可能导致付费的功能如云函数的预置并发。

## 5. QA行为约束

1. 使用端上 `miniprogram-automator` / `9420` 做诊断相关自动化测试时，先读取 `docs/ai-rules/frontend-automation-id-policy.md` 的“第三点 元素 id 映射”，并按该映射执行入口定位与关键断言。
2. `miniprogram-automator` 的目的若为了验证UI，必须对比截图。
3. `9420` 只属于用户交互调试会话：正式 catalog `qa-run` / `qa-preflight` 不得连接、重配、关闭或以其为 fallback。正式 QA 必须先验证 LAN watcher lease、目标 `dist/dev/mp-weixin`、测试专属 persistent profile、test-owned DevTools owner 与官方 IDE plugin，再仅通过隔离控制端口启用 test-owned `9421` 并用真实 PNG、项目 identity、page data 和运行时 `wx.request` 验证。用户调试会话仍应先读取 PID、控制端口和项目路径；不得为正式 QA 复用、切换或关闭该进程。
4. QA 不运行 unit tests；QA 负责运行时、端上、UI/Figma、E2E 和用户可观察行为验证。
5. automator QA 必须通过 `test/e2e/automator/catalog.json` 精确选择叶子脚本，并在 LAN/DevTools/automator 前校验 automation id policy、脚本 hash 和 execution id；直接裸跑 automator 脚本只能作为排障，不能作为验收证据。
6. dispatch-task flow 中 QA owner 为 main；main 执行 QA 不授权其修改业务代码。发现产品问题必须退回原 implementer 或 external implementer；只有经 `dispatch-task` §1.3 判定为受限 maintenance patch 的格式、lint/build、typo 或机械冲突修复，main 才可在终态后处理。
7. `src/**` 或 `cloudfunctions/**` 文件移动、拆分或重命名时，必须同步移动对应 `test/unit/frontend/**` 或 `test/unit/backend/**` 镜像测试；frontend/backend unit 使用同一递归镜像约定：`test/unit/frontend/<src 相对目录>/...` 对应 `src/<相对目录>/...`，`test/unit/backend/<cloudfunctions 相对目录>/...` 对应 `cloudfunctions/<相对目录>/...`。unit 文件名不得使用 `test-` 前缀；无单一源目录映射或跨 `src` 与 `cloudfunctions` 的行为必须放入 `test/e2e/batch` 或 `test/e2e/automator`。

## 5.1 测试层级与真实性边界（强制）

1. `test/unit/**` 仍以单个模块或函数的逻辑、映射和边界为主要验证对象，但允许直接使用真实 `cloud1_dev` 数据、真实 CloudBase API 和真实数据库读写；这类结果必须标记为 `unit_real_data`，不得再强制使用 mock 或假数据。真实微信运行时、真实页面交互和截图仍属于 Automator，不因使用真实数据而转化为 unit-test。unit-test 通过不等于端上功能通过，也不得单独作为端上验收证据。
2. `test/e2e/**` 验证跨模块的真实链路，禁止伪造被测接口响应、用内存植物仓库替代服务端数据，或把 fixture 响应冒充真实 API 返回。跑批 e2e 至少调用真实配置的 API 和开发库；它只能证明服务链路，不能覆盖真实小程序 UI、登录态、页面数据和用户交互。
3. 端上验收必须使用真实小程序运行时、真实用户登录态、真实开发环境数据（当前开发验收为 `cloud1_dev`）、真实 LAN gateway 和真实 `wx.request`。不得注入假植物、假提醒、假接口返回或绕过页面直接写库来宣称端上通过。正式证据必须来自 catalog `qa-run`，并包含项目 identity、页面数据、有效截图和运行时请求记录。
4. 使用 fixture 或 mock 的 Automator 叶子只能作为回归排障或组件交互诊断，必须在 catalog/报告中明确其非真实验收性质；不能与 live e2e 混称，也不能计入“端上通过”。如果 acceptance 要求真实数据，必须另有 `automator_required` 的 live 叶子覆盖同一用户路径。
5. 测试报告或其 catalog/qa-run 证据必须明确可核验数据模式：`unit_real_data`、`unit_fake`、`e2e_real_api`、`automator_live_real_api` 或 `fixture_diagnostic`。项目默认优先使用 `unit_real_data`；只有明确需要隔离边界或离线验证时才使用 `unit_fake`。数据来源不明或接口响应被替换时，状态只能是未验收/阻断，不能记为 PASS。

## 5.2 前端 UT 与真实 API E2E 硬规定

1. 前端 UT 只能证明前端单模块逻辑、数据映射、状态计算、序列化和源码契约。使用 `readFileSync`、正则或源码字符串断言的用例必须标记为 `data_mode=unit_fake`、`test_kind=source_contract`，不能称为页面交互测试。
2. 前端 UT 不得宣称已经验证真实小程序页面。它不能替代以下验证：Vue 响应式状态变化、组件真实渲染、点击/输入/禁用状态、Popup 展示、页面跳转、编译产物行为、真实 `wx.request` 和截图。
3. 只要需求包含用户可见交互，必须至少补一个 Automator live 用例；仅前端 UT 通过时，功能状态最多为“前端逻辑通过”，不得写成“功能验收通过”。
4. `test/e2e/**` 中标记为 `e2e_real_api` 的用例必须调用真实配置的 API、真实 `cloud1_dev` 数据库和真实用户身份。必须显式校验 `TERMINAL_E2E_FUNCTION_BASE_URL`、开发环境和身份信息；缺失时阻断，不能回退到假接口、内存仓库、fixture 响应或默认匿名用户。
5. 真实 API E2E 禁止 monkey-patch 被测接口响应、替换网络客户端、把 fixture 当服务端结果或绕过 API 直接写库。测试必须从真实 API 读取数据，并对 HTTP 状态、业务码、关键业务字段和数据来源进行断言。
6. 真实 API E2E 只能证明跨模块服务链路和真实数据契约，不能证明真实小程序 UI、登录态、页面响应式状态、跨页面操作或截图；这些仍由 `automator_live_real_api` 负责。
7. 每个前端交互功能的测试记录必须分层列出：前端 UT、`e2e_real_api`、`automator_live_real_api`。任何一层未执行或使用了不符合该层边界的数据，状态必须标记为未验收或阻断，不得合并成一个笼统的 PASS。

## 5.3 业务导向测试与缺口发现硬规定

1. 所有测试脚本，无论是 `test/unit/**`、`test/e2e/**` 还是端上 Automator，都是为实际业务服务的质量工具。最终目的不只是让 happy path（正常路径）通过，而是主动发现实际业务中可能隐藏的边缘情况、失败情况、异常状态和需求断层。只覆盖 happy path 的脚本不得作为完整业务验收依据。
2. 每个 MVP 功能都必须从多维度设计测试矩阵，至少同时检查：用户入口与可见状态、前端交互和响应式更新、页面布局与文案渲染、接口状态码与业务码、数据字段和数据来源、持久化及读回一致性、跨页面串联、缓存和异步竞态、重复操作、慢网络、超时、空数据、部分数据、过期数据、非法数据、权限/登录失效以及失败后的恢复路径。具体维度应根据该功能的真实需求和数据合同补充，不得机械套用单一模板。
3. 断言必须验证业务语义和用户可观察结果，不能只断言 HTTP 200、接口被调用、数组非空、页面发生跳转或组件存在。涉及日期、身份、来源、状态、数量、顺序、计算结果或提示文案时，必须核对其与需求、接口合同、数据库状态和实际渲染是否一致。
4. 测试脚本未命中真实业务流程、测试数据不足、运行时未启动、登录态失效或环境不满足时，必须标记为 `BLOCKED_ENV`、`BLOCKED_FIXTURE` 或“未验收”，不得用脚本通过、基础设施通过或接口可达来替代业务通过。脚本进入业务断言后发现功能与需求不一致，必须标记为业务/产品失败，不得改称脚本问题。
5. 每次测试都必须检查“已覆盖什么”和“明确未覆盖什么”。发现测试遗漏、断言过宽、只测了表象、没有覆盖失败路径或无法证明用户可感知闭环时，必须将其记录为测试缺口，并在同一变更中补充用例，或明确列为阻断项及优先级；不得把未覆盖当作通过。
6. 业务功能的最终状态必须分层报告前端单元逻辑、真实 API 链路和真实端上交互证据。任一层缺失、使用了不符合真实性边界的数据，或只验证了正常路径，整体最多只能写“部分验证/逻辑通过”，不得写成“功能验收通过”或“全量通过”。
7. 测试设计和复盘必须反向审视“实现、接口、数据、界面、文案、用户目标”之间的 gap（差距），优先验证最可能造成错误决策、错误展示、数据丢失、状态误导或流程中断的路径。测试脚本自身的可运行性不是终点；没有发现业务问题不等于业务没有问题。

## 5.4 端上接口性能验收硬规定

1. 所有接口响应速度、性能优化和“是否达标”的判定，一律以真实小程序运行时实际发出的 `wx.request` 从发起到 `success`/`fail` 回调的端到端 `elapsed_ms` 为唯一验收口径。Node、curl、宿主机 HTTP、局部 gateway、云函数内部耗时和单元测试只能作为诊断证据，不能代替端上性能结论。
2. 列表、详情及其他关键接口必须分别测量，至少覆盖冷请求与热请求；报告每次端上耗时、HTTP 状态码、业务码、关键业务字段、响应体字节数，并汇总最小值、p50、p95 和最大值。列表响应不能用详情响应的结果代替，反之亦然。
3. 优化前后的对比必须保持相同开发环境、真实登录身份、数据集、请求参数和端上运行时；只要缺少真实 `wx.request` 端到端证据，或 p95 未达到目标，状态只能写“未达标/未验收”，不得以服务端较快的诊断结果宣称达标。
4. 任何为降低耗时而做的字段裁剪、缓存、并行化或懒加载，都必须同时复核用户可见字段、跨页面串联、失败恢复和数据来源；不能为了数字牺牲业务闭环，也不能把缓存命中或请求未发出误报为接口响应达标。

## 6. 读取边界

1. `docs/code-logics/` 不得全量读取；先读 `INDEX.md`。
2. `docs/new-rules/` 不得全量读取；先读 source index，再按需读取指定章节 / Sxx。

## 7. 知识治理边界

1. 代码、测试、schema、配置和 package scripts 是事实源。
2. Active docs 只解释当前契约和操作方式，不是第二事实源。
3. archived / superseded / stale 文档或 ByteRover Topic 不得作为当前实现依据。
4. 不得默认全量读取 `docs/`、遗留 `.brv/`、`.codex/skills/**/references/`、`docs/code-logics/`、`docs/new-rules/`、`docs/ai-runs/`、`docs/route规划及outcome瘦身计划/`。
5. 任务上下文必须优先通过 `.codex/context-packs.yml` 选择最小文件包。
6. 发生冲突时，当前事实源优先；若 ByteRover Topic 已过期，本轮任务应形成明确的更新或治理候选，不得静默沿用错误记忆。

## 8. BRV / ByteRover 内容边界

ByteRover 的具体存取机制、Topic Schema 和操作能力由当前安装的 `ByteRover V4 Skill` 定义，严禁在系统环境中调用V3的运行时 `brv`。本节只负责项目级内容资格和事实使用边界。

BRV 内容资格必须遵守本节边界。用户已明确确认：本项目应长期记录经过当前事实源与实际验收验证的 dispatch-task 工作流契约，以及可复现、跨文件、会导致重复返工的 Automator/QA 卡点与解决方法。`dispatch-task` 负责调用时机、结果验证、记忆影响判断和验收流程；本条允许其将上述稳定工作流知识纳入 BRV，但不得把临时日志或未验证推测写入 BRV。

ByteRover Topic 是长期项目知识，不是代码索引、通用知识库、执行规则仓库、项目日志、附件库或第二事实源。查询结果只能作为长期上下文和事实线索；涉及当前实现时，必须回到代码、测试、schema、配置或 package scripts 验证。

### 允许在常规任务中查询，并在满足记录条件时写入

- 已由当前项目采纳，并影响产品或业务行为的稳定业务事实；
- 仍约束当前或未来设计，或能解释当前架构、迁移边界及废弃原因的历史决策；
- 用户明确确认、长期有效并与当前项目直接相关的稳定事实；
- `stable_architecture_contract`；
- `stable_product_contract`；
- `stable_api_contract`；
- `stable_schema_contract`；
- `stable_data_flow_contract`；
- `stable_validation_contract`；
- 经跨文件验证、具有重复发生风险且不容易从局部源码直接发现的 `validated_recurring_gotcha`；
- 经跨文件验证、可在多个模块或未来功能中复用的 `validated_reusable_project_pattern`；
- 经跨文件验证、未来任务不召回便容易误判、破坏契约或重复推导的稳定业务行为边界。
- 用户明确采纳、经当前源码、合同和实际运行证据共同验证，并会约束后续任务的 `stable_workflow_contract`，包括 dispatch episode、主流程职责、返工与等待边界、BRV 召回/记录责任；
- 经至少一次失败与一次修复后复现验证、且可跨任务复用的 `validated_recurring_workflow_gotcha`，包括 Automator/DevTools/QA 的卡点、根因、判定信号和已验证解决方法。

候选知识只有同时满足以下条件时才允许记录：

1. 已被当前事实源验证，或由用户明确确认；
2. 在当前任务结束后仍具有长期价值；
3. 不属于可从单个当前源码文件直接、无歧义恢复的普通实现事实，或其关键 WHY 无法从代码直接恢复；
4. 未来 Agent 不召回时，存在重复踩坑、破坏契约、错误决策或重复推导的现实风险；
5. 没有在 AGENTS.md、Skill、validator、Handoff Contract 或其他权威规则中被完整定义。

### 禁止作为 BRV Topic 查询依据或记录内容

- 每次都应从当前源码确认的 code fact；
- 仅描述当前实现位置的文件、函数、组件、路由、调用关系或 import/export 清单；
- lint、format、style、500 行拆分、普通机械重构和依赖安装流程；
- 仅把 AGENTS.md、Skill、validator、dispatch gate 或 Handoff Contract 原文复制成规则副本；但经用户确认并由源码、合同和运行证据共同证明的稳定工作流契约，不属于此禁项；
- 仅描述一次性的临时 bug 修复、当前 Sprint 状态、短期 TODO 和任务执行日志；若已提炼为跨任务可复现的根因、识别信号和经验证解决方法，可按 `validated_recurring_workflow_gotcha` 记录；
- 测试命令、测试文件索引、断言写法、覆盖率要求、mock/fixture 实现和 QA 执行步骤；
- 通用工程知识、公开行业知识、外部文档内容或一般领域知识，除非已经被当前项目明确采纳并形成稳定项目决策或契约；
- 整段源码、完整文档、日志、issue、会话记录、测试输出或其他未经提炼的原始材料；
- API key、token、密码、Cookie、私钥、生产凭据以及不必要的个人敏感信息；
- 易变化的运行状态、临时环境值、部署状态和监控数据；
- 未经当前事实源验证或用户明确确认的推测。

代码、测试、schema、配置、package scripts、Active docs 和实际端上验收可以作为 Topic 的来源证据，但来源文件本身的存在、路径或实现方式不得成为录入理由。录入理由必须是这些来源共同证明了允许范围内的稳定项目知识。不得录入凭据、原始日志、临时执行 ID、PID、一次性时间戳、缓存内容或未经复核的模型推测。

### BRV 治理例外

在 ByteRover 审计、迁移、纠错、合并或清理任务中，允许读取和查询全部已有 Topic，包括已经越界、过期或错误的 Topic。此类读取只用于治理，不代表其内容可以作为当前事实使用或继续保留。
