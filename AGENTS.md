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

1. 业务逻辑、数据结构的变动，优先采取最彻底的解决方案，避免使用保守策略如兼容、兜底代码应对此类变动从而导致无谓的代码膨胀。
2. 开发结束后，只针对业务代码范围内的 `src/*` 和 `cloudfunctions/*` 下所改动的文件路径精准执行 `js npm run lint` 和 `js npm run fmt` 。
3. 开发过程中涉及到的文件超过 500 行的必须解耦拆分模块，拆分遵循高内聚、低耦合的设计思路，以提高维护性和复用性为最终目的。要求命名和目录划分合理并保证加载的性能。
4. 新增或重构复杂功能的，优先探索并复用现有组件或模块，现有不满足的需联网探索 `npm`/ `github` 上成熟的插件。非常不鼓励复杂组件/模块手搓，其为最末位兜底。
5. 如需依赖新插件，必须考证其适配微信小程序、包体积、npm / GitHub 状态、周下载量、star 数和最近 3 年 release 记录，并提供简短介绍，征得用户同意。
6. 所有端上验收如果本轮代码未部署到云端，必须先成功跑通 `js npm run dev:mp-weixin:local-functions:lan` 的完整 LAN 本地函数 flow，并让小程序运行时命中新代码；只启动 scoped/local 单函数 gateway、backend curl、Node HTTP 或 gateway health，不得算端上验收完成。
7. 除非用户显式要求，否则 subagent 在条件允许的情况下优先考虑线程复用。
8. 当运行时模型为 GLM 系列时，调用 `mcp__Figma_Desktop__get_design_context`、`get_metadata`、`get_variable_defs` 等 Figma 读取类工具后，禁止/跳过调用 `get_screenshot`；除非用户在当前会话中明确要求查看截图。
9. 对于任何的需求、任务、用户决策，严禁主观认为一定正确，必须有强烈的风险意识。当识别到任务有较大地风险或用户的决策方向存在严重错误时必须第一时间暂停开发并提供多个解决方案给用户，同时给出推荐顺序，由用户决定最后的实施方向。
10. 具备完整开发生命周期或明显涉及业务逻辑的开发任务必须经 `$dispatch-task` 触发，再由其内部判断不同的 `dispatch-tier` 执行各自工作流。
11. 客户端显示的文案必须从用户角度出发并符合常识，严禁将内部讨论用语、计算公式，拗口或难理解的文案暴露在界面中。必须遵循用户友好、利于用户操作的思想设计出最优的展示文案。
12. 输出的文案、用语减少专业词汇，尤其在 plan 模式或用户显式要求 planning时，要注重用词以通俗易懂的白话结合举例代替专业词汇。
13. `dispatch-task` 当前只允许实现阶段使用 subagent 或 external implementer；QA、端上验收、docs 同步和 ByteRover 影响处理均由 main 执行，不再派发 QA 或 docs 专用 subagent。main 自守门不写角色 receipt；仅跨 agent 边界与机器可校验证据（含端上 `runtime-qa-evidence.json`、一份 implementation postflight）才写产物。

## 3. 前端行为硬约束

1. 开发 `Vue` 组件时参考 `skills/uni-app` 及 `skills/vue-best-practices` ，如有概念冲突的采纳前者。
2. css优先使用 `Tailwind CSS` 组织样式并参考 `skills/tailwindcss-base-use` ，进阶布局则参考 `skills/tailwindcss-advanced-layouts`。
3. 合理利用前端缓存释放服务端开销，参考 `skills/pinia`。
4. **组件/页面的新增/更新中绑定了如 `@click` 、 `@change` 、 `@focus` 、 `@blur` 等交互事件的元素或 `uni-ui` 组件（非自定义组件）须同时绑定语义化的id，还需将此id的映射关系更新到 `docs/ai-rules/frontend-automation-id-policy.md` 以保证端上 `miniprogram-automator` 测试时能快速定位元素并正确触发事件**，示例代码如下
   ```vue
   <view class="flex " @click="toggleSubstrate(option.value)">
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
3. QA 不运行 unit tests；QA 负责运行时、端上、UI/Figma、E2E 和用户可观察行为验证。
4. dispatch-task flow 中 QA owner 为 main；main 执行 QA 不授权其修改业务代码，发现产品问题必须退回原 implementer 或 external implementer。

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

ByteRover 的具体存取机制、Topic Schema 和操作能力由当前安装的 `ByteRover V4 Skill` 定义，本节只负责项目级内容资格和事实使用边界。

BRV 内容资格必须遵守本节边界。`dispatch-task` 只负责具体任务中的调用时机、结果验证、记忆影响判断和验收流程，不得放宽本节内容边界。

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
- AGENTS.md、Skill、validator、dispatch gate 或 Handoff Contract 的规则副本；
- 临时 bug 修复、一次性排障过程、当前 Sprint 状态、短期 TODO 和任务执行日志；
- 测试命令、测试文件索引、断言写法、覆盖率要求、mock/fixture 实现和 QA 执行步骤；
- 通用工程知识、公开行业知识、外部文档内容或一般领域知识，除非已经被当前项目明确采纳并形成稳定项目决策或契约；
- 整段源码、完整文档、日志、issue、会话记录、测试输出或其他未经提炼的原始材料；
- API key、token、密码、Cookie、私钥、生产凭据以及不必要的个人敏感信息；
- 易变化的运行状态、临时环境值、部署状态和监控数据；
- 未经当前事实源验证或用户明确确认的推测。

代码、测试、schema、配置、package scripts 和 Active docs 可以作为 Topic 的来源证据，但来源文件本身的存在、路径或实现方式不得成为录入理由。录入理由必须是这些来源共同证明了允许范围内的稳定项目知识。

### BRV 治理例外

在 ByteRover 审计、迁移、纠错、合并或清理任务中，允许读取和查询全部已有 Topic，包括已经越界、过期或错误的 Topic。此类读取只用于治理，不代表其内容可以作为当前事实使用或继续保留。
