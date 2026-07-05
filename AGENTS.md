---
description: Codex AI Team Rules - global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# Repository Agent Rules

## 0. 规则层级与 Skill 使用边界

1. 本文件只定义仓库级全局硬规则、入口规则和安全边界，不承载具体任务执行流程。
2. 复杂任务、跨文件修改、Figma 实现、端上 QA、ZCode 外部实现、subagent 协作等，必须优先进入 `.codex/skills/dispatch-task`。
3. skill 是可被显式调用的执行能力；reference 只是 skill 内部支撑资料，不得把 reference 当作独立任务入口。
4. 当 AGENTS.md 与具体 skill 出现冲突时：安全、付费、部署、数据、读取边界以 AGENTS.md 为准；具体执行步骤、handoff、validator、receipt 以当前被调用的 skill 为准。
5. 不得把 `.codex/skills/**/references/`、archived docs 或历史设计默认全量读入上下文；必须按任务选择最小必要文件。

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

## 2. 全局行为硬规则

1. 业务逻辑、数据结构的变动，优先采取最彻底的解决方案，实现时对齐定义和消费两端。如采用保守方案必须说明彻底解决的风险，征得用户同意后才可执行保守操作。
2. 模块命名合理，模块的拆分遵循高内聚、低耦合的设计思路。以提高维护性和复用性为前提，保证模块加载的性能。
3. 开发结束后，只针对业务代码范围内的`src/*`和`cloudfunctions/*`下所改动的文件路径精准执行`npm run lint`和`npm run fmt`。
4. 超过 500 行的代码必须合理解耦拆分模块。
5. 新增或重构复杂功能的，实现前须优先复用现有组件或模块，现有实现不满足的可考虑依赖 `npm`/ `github` 上成熟的插件，手搓是最末位考虑。
6. 如需依赖新插件，必须考证其适配微信小程序、包体积、npm / GitHub 状态、周下载量、star 数和最近 3 年 release 记录，并提供简短介绍，征得用户同意。
7. 今后所有端上验收如果本轮代码未部署到云端，必须先成功跑通 `npm run dev:mp-weixin:local-functions:lan` 的完整 LAN 本地函数 flow，并让小程序运行时命中新代码；只启动 scoped/local 单函数 gateway、backend curl、Node HTTP 或 gateway health，不得算端上验收完成。
8. 除非用户显式要求，否则 subagent 在条件允许的情况下优先考虑线程复用。
9. subagent尤其是非gpt系的第三方模型如GLM在执行任务的过程中，main agent应当避免主动催促和询问进度。这些行为可能会造成第三方模型的未知行为，如抛异常和超长等待。
10. 当运行时模型为 GLM 系列时，调用 `mcp__Figma_Desktop__get_design_context`、`get_metadata`、`get_variable_defs` 等 Figma 读取类工具后，禁止/跳过调用 `get_screenshot`；除非用户在当前会话中明确要求查看截图。
11. 对于任何的需求，不能天然认为一定正确，必须有强烈的风险意识。当识别到任务有关键风险和方向的错误时需第一时间交由用户决定实施方向。
12. 客户端显示的文案必须以用户角度以及常理判断，严禁将内部讨论用语、计算公式，拗口或难理解的文案暴露给用户。必须遵循用户理解友好，利于用户操作的思想设计最优的展示文案。

## 3. dispatch-task 触发规则

以下任务必须优先进入 `.codex/skills/dispatch-task`，不得直接实施：

1. 跨多个业务模块、多个文件或多个系统的实现任务。
2. 涉及 schema、数据结构、诊断链路、状态机、缓存、云函数、数据库的任务。
3. 涉及 Figma design → 代码实现 → 端上截图验收的 UI 任务。
4. 涉及 ClickUp / Figma / GitHub / CloudBase / WeChat DevTools / ByteRover 多工具协作的任务。
5. 用户明确要求使用 subagent、ZCode、GLM、外部实现者或 QA reviewer 的任务。
6. 存在明显架构风险、业务方向风险、数据一致性风险、部署风险或付费风险的任务。

轻任务可不进入完整 dispatch-task 流程：单文件低风险修正、文案、import、类型标注、简单样式、只读分析任务。但一旦发现影响范围扩大，必须升级为 dispatch-task。

## 4. 前端行为约束

1. 开发`Vue`组件时参考`skills/uni-app`及`skills/vue-best-practices`，如有概念冲突的采纳前者。
2. css优先使用 `Tailwind Css` 组织样式并参考 `skills/tailwindcss-base-use` ，进阶布局则参考 `skills/tailwindcss-advanced-layouts`。
3. 合理利用前端缓存释放服务端开销，参考 `skills/pinia`。
4. 考虑到 `miniprogram-automator` 端上测试，凡是涉及点击、交互的元素均需绑定语义化的id，必须并更新到 `docs/ai-rules/frontend-automation-id-policy.md`。

## 5. 后端行为约束

1. 涉及部署环境、数据库、云函数、云存储、身份权限的参考`.codex/skills/cloudbase`
2. 未经允许严禁开启 `CloudBase` 或任何可能导致付费的功能如云函数的预置并发。

## 6. QA行为约束

1. 使用端上 `miniprogram-automator` / `9420` 做诊断相关自动化测试时，先读取 `docs/ai-rules/frontend-automation-id-policy.md` 的“第三点 诊断流 id 映射”，并按该映射执行入口定位与关键断言。
2. `miniprogram-automator` 的目的若为了验证UI，必须对比截图。
3. QA 不运行 unit tests；QA 负责运行时、端上、UI/Figma、E2E 和用户可观察行为验证。

## 7. 读取边界

1. `docs/code-logics/` 不得全量读取；先读 `INDEX.md`。
2. `docs/new-rules/` 不得全量读取；先读 source index，再按需读取指定章节 / Sxx。

## 8. 知识治理边界

1. 代码、测试、schema、配置和 package scripts 是事实源。
2. Active docs 只解释当前契约和操作方式，不是第二事实源。
3. BRV 记忆只作为索引使用；不得覆盖代码事实。
4. archived / superseded / stale 文档不得作为当前实现依据。
5. 不得默认全量读取 `docs/`、`.brv/`、`.codex/skills/**/references/`、`docs/code-logics/`、`docs/new-rules/`、`docs/ai-runs/`、`docs/route规划及outcome瘦身计划/`。
6. 任务上下文必须优先通过 `.codex/context-packs.yml` 选择最小文件包。
7. `docs_keeper` 负责知识卫生、活文档维护、索引同步和既有文档归档；不得维护既有蓝图为当前事实。

## 8. BRV / ByteRover 召回边界

1. BRV 只负责业务知识和真相的召回：产品决策、历史约定、诊断链路事实、schema / 数据语义、跨文件业务不变量、ClickUp / Figma / 会议沉淀后的当前事实入口。
2. 不得为了通用工程规则或当前代码事实调用 BRV。以下事项直接使用 AGENTS.md、当前 skill、代码、测试、schema、配置、package scripts 或 `.codex/context-packs.yml`：
   - 500 行拆分、模块解耦、lint/fmt、Tailwind / SCSS、依赖策略、CloudBase 付费边界；
   - subagent 等待、dispatch gate、validator 用法、ZCode 操作协议；
   - 文件位置、当前实现、函数调用关系、import/export、测试入口、package script。
3. `brv-query` 前必须能写出一句 `brv_query_reason`，且该理由必须指向业务事实/真相；如果理由只是“需要上下文”“需要规则”“需要看代码”，禁止调用 BRV。
4. BRV 返回内容只作为索引和线索，必须回到代码、测试、schema、配置或 active docs 核验；不得用 BRV 记忆覆盖当前事实源。
5. `brv-curate` 只写入稳定业务知识、当前有效契约、重要决策和事实入口；不得写入临时执行日志、通用工程规则、一次性 bug、agent 行为偏好或已由 AGENTS.md / skill 表达的规则。

<!-- BEGIN BYTEROVER RULES -->

# ByteRover 工作流程说明

你是通过 MCP（模型上下文协议）与 ByteRover 集成的编码代理。

## 核心规则

1. **Query First**: 当您需要查询任务的上下文而您没有上下文时，自动调用 mcp 工具“brv-query”。
2. **Curate Later**: 完成任务后，如果知识非常重要，请调用 brv-curate 来存储知识。

## 记忆写入语言规则

1. 所有写入 ByteRover 的长期记忆必须使用简体中文。
2. 中文是主语言；英文术语只允许作为括号补充，例如：记忆召回（recall）、上下文树（context tree）。
3. 禁止生成英文主导的 memory entry、summary、index、decision、pattern、skill。
4. 文件标题、段落标题、事实描述、决策描述、约束描述必须优先中文。
5. 代码符号、文件路径、命令、API 名称、包名、类名、函数名、配置键可以保留英文原文。
6. 如果 ByteRover 自动抽取出的记忆为英文，agent 必须先翻译并重写为中文后再执行 `brv curate`。
7. 若无法确认某条英文内容是否属于代码符号或必要术语，默认改写为中文表达。

## 工具使用

- `brv-query`: 查询上下文树。
- `brv-curate`: 将上下文存储到上下文树中。

---

Generated by ByteRover CLI for Codex

<!-- END BYTEROVER RULES -->
