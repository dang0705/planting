---
name: dispatch-task
description: "统一任务调度 skill：根据输入是否包含 ClickUp ticket/comment 自动区分工单任务与普通自然语言任务；支持普通开发、bug 修复、需求变更；main agent 默认承担架构裁决与契约生成，按需调用独立架构复核。"
---

# Dispatch Task Skill

## 1. 定位

本 skill 合并原 ClickUp 工单入口与普通 dispatch 执行入口。

它负责：

1. 识别输入是否包含 ClickUp ticket / comment deeplink。
2. 区分任务类型：普通开发 / bug 修复 / 需求变更 / 只读分析 / 文档同步。
3. 对 ClickUp 任务读取 ticket、子任务、指定评论、外部链接和硬约束。
4. 对 bug 修复 / 需求变更判断是否需要原始 ticket 上下文。
5. 生成计划、role_context_packets、Implementation Contract、Test Contract。
6. main agent 默认承担架构裁决与契约生成，按需调用独立架构复核。
7. 协调 implementer / QA / docs。
8. 控制 token，不广播完整 ClickUp、完整 Figma、完整日志、完整规则。
9. 任务完成后按 Git 规则提交本轮变更。

main agent 默认承担 architect 职责：任务理解、技术方向裁决、Implementation Contract、Test Contract、role_context_packets 和最终汇总；但不越权实现、不越权写文档、不越权替 QA 测试。

---

## 2. 输入类型识别

### 2.1 ClickUp 工单任务

如果 prompt 中包含 ClickUp task URL、task id、custom id 或 comment deeplink，进入 ClickUp 工单模式。

可识别：

```text
https://app.clickup.com/t/<workspace>/<task_id>
https://app.clickup.com/t/<workspace>/<task_id>?comment=<comment_id>
task id: ...
clickup ticket: ...
```

必须通过 ClickUp MCP 读取对应任务。不得猜测工单内容。

### 2.2 普通任务

如果 prompt 不包含有效 ClickUp ticket，则进入普通任务模式。

普通任务允许任意自然语言输入，不要求用户显式提供“任务目标 / 任务类型 / 涉及文件 / 验收标准”等结构化字段。

main agent 必须先从自然语言中提取：

```text
Ordinary Task Intent:
- 用户想做什么:
- 可能的任务类型:
- 已知文件 / 模块:
- 隐含验收标准:
- 缺失但必须确认的信息:
- 是否可直接进入计划:
```

如果自然语言足以安全推进，则继续 workflow；如果缺少会影响安全边界、写入权限、外部事实或验收标准的关键信息，才提出最小澄清问题。不得因为 prompt 未结构化就直接拒绝。

---

## 3. 任务类型

### 3.1 普通开发

适用：

- 新功能。
- 新页面 / 新组件。
- 新接口 / 新数据结构。
- 明确没有原始历史 ticket 依赖。

要求：

- 读取当前 ticket / prompt。
- 构建目标验收契约。
- 由 main agent 默认做技术方向裁决、Implementation Contract 和 Test Contract；只有高风险、争议、跨域复杂或需要第二视角时，才调用 architect_reviewer 独立复核。

### 3.2 bug 修复 / 需求变更

适用：

- “修复之前开发的问题”。
- “基于之前 ticket 做调整”。
- “新需求变更原功能”。
- “返工 / 补漏 / UI 未对齐 / 验收不通过”。

如果 prompt / 当前 ticket 中没有包含 Relationships 链接或原始 ticket id 或原始需求链接，必须停止并给用户是 / 否选项：

```text
这是 bug 修复 / 需求变更，但当前输入缺少 Relationships 链接或原始 ticket 上下文。

是否可以提供原始 ticket id / 链接，用于读取原始开发要求并比较本次变更 gap？

A. 是，我会在下一条 prompt 中贴出原始 ticket id / 链接。
B. 否，无法提供；请仅基于当前描述继续，但需标记“缺少原始需求上下文风险”。
```

若用户选择 A：等待原始 ticket，不继续 workflow。  
若用户选择 B：继续但必须在计划、architect、QA 中标记缺口风险。

如果拿到原始 ticket，必须读取原始任务上下文并生成：

```text
Requirement Gap Analysis:
- original_ticket:
- original_requirements:
- current_bug_or_change:
- gap:
- unchanged_original_requirements:
- newly_added_requirements:
- removed_or_deprecated_requirements:
- conflict:
- required_fix_scope:
- non_goals:
- acceptance_delta:
```

本轮任务诉求应定义为：**填补 original requirements 与当前 bug / change 之间的 gap**。 

#### Relationships / Linked Task 读取规则

遇到 ticket 中存在 Relationships / Linked tasks / Blocking / Blocked by / Related / Parent / Duplicate 必须读取链接中的关联任务。

关联任务读取要求与主 ticket 相同：

1. 必须通过 ClickUp MCP 读取关联任务标题、状态、描述、子任务、附件、评论中明确补充需求的内容。
2. 关联任务中的 Figma、GitHub、ClickUp 内部链接、附件、设计稿、文档链接，必须按本 skill 的链接与 MCP 读取规则处理。
3. 关联任务中出现的硬约束句必须进入 `ClickUp 硬约束摘录`，不得被摘要压缩丢失。
4. 如果关联任务读取失败，必须记录为阻塞项或待确认项，不得假装已读取。
5. 如果关联任务过多，默认只读取与当前 ticket 关系最强的一跳关联任务；超过一跳或超过 3 个关联任务时，必须说明 token 风险并请求 main agent / 用户裁决。

### 3.3 只读分析

不改代码，不 commit。  
但仍要输出分析边界、证据、风险和下一步建议。

### 3.4 文档同步

文档落地交给 docs_keeper。main agent 不直接写文档。

---

## 4. ClickUp 读取规则

### 4.1 主任务与子任务

ClickUp 模式必须读取：

1. 主任务标题。
2. 主任务完整描述。
3. 主任务状态、优先级、标签。
4. 子任务列表。
5. 子任务标题与完整描述。
6. checklist / acceptance criteria，如 MCP 可用。
7. 附件与链接。
8. 作为需求补充的评论。

### 4.2 评论 deeplink

如果 URL 包含 `?comment=<comment_id>`：

1. 必须读取 task comments。
2. 必须定位目标 comment_id。
3. 目标评论是一等事实源。
4. 未定位到目标评论时，必须停止并提示用户补充评论正文或确认忽略该评论。
5. 指定评论与主任务冲突时，必须标记冲突并请求裁决，不得自行合并。

优先级：

```text
用户当前显式补充
→ 指定 comment
→ 当前 ticket 描述
→ 原始 ticket 描述
→ 子任务描述
→ 其他评论 / 附件 / 链接
```

---

## 5. ClickUp 内容保留与输出预算

ClickUp 内容可能已经被人工压缩过，因此不得丢失明确约束。

但也不得把完整长描述、完整评论线程、完整子任务正文广播给所有 agent。

### 5.1 必须逐字保留的硬约束句

出现以下词的句子必须进入 `ClickUp 硬约束摘录`：

```text
必须 / 不得 / 禁止 / 优先考虑 / 验收 / 对齐 / 复用 / 不要 / 仅 / 兼容 / 非目标 / 文件路径 / 测试 / 截图 / 日志 / 证据 / Figma / GitHub / CloudBase / 微信开发者工具
```

### 5.2 不广播完整原文

完整 ClickUp 原文只作为审计证据，不作为默认上下文广播。默认只传：

- 硬约束句。
- 需求摘要。
- Requirement Gap Analysis。
- 链接读取结果。
- role_context_packets。

---

## 6. 外部链接与 MCP

ClickUp、普通 prompt 或指定评论中出现链接时，必须优先判断是否可由 MCP 读取。

处理顺序：

```text
发现链接
→ 判断是否有对应 MCP
→ 优先通过 MCP 获取内容
→ MCP 不可用 / 无权限 / 不支持时记录失败原因
→ 降级为普通链接或待确认项
```

不得直接跳过。

### 6.1 Figma

如果明确涉及 UI 开发 / 页面实现 / 组件实现 / 视觉还原 / Figma 对齐 / UI QA，必须触发：

```text
figma-layered-ui-contract
```

要求：

- 人工压缩版 Figma 摘要不能替代 Figma Layered Contract。
- 必须形成 Figma Design Facts / UI Implementation Scope Map / Implementation Packet / QA Acceptance Slice。
- 如果上游已经提供完整 Figma Layered Contract，不得重复读取 Figma。
- 如果缺失分层数据，必须补齐后再进入实现。

### 6.2 GitHub

GitHub issue / PR / commit / file / discussion 链接必须通过 GitHub MCP 获取。  
无法读取时记录阻塞或待确认项。

### 6.3 CloudBase / 微信开发者工具

涉及部署、SQL、诊断 session、云函数、DB 证据、smoke、replay、小程序 UI 验收、e2e 时，必须在计划中标记对应 MCP / 工具调用计划。

---

## 7. 计划输出

必须输出：

```text
Dispatch Task Plan:
- input_type: clickup_ticket / clickup_comment / ordinary_prompt
- task_type: 普通开发 / bug修复 / 需求变更 / 只读分析 / 文档同步
- ticket:
- comment_context:
- original_ticket_required: no / yes
- original_ticket:
- Requirement Gap Analysis:
- ClickUp 硬约束摘录:
- 外部链接读取记录:
- Figma Layered Contract:
- 复杂度: 简单 / 非简单 / 高风险
- role_context_packets:
  - main_architect:
  - implementer:
  - qa_reviewer:
  - docs_keeper:
- Git 工作区 / 提交计划:
- 验收标准:
- 最终交付标准:
- 风险:
- 阻塞项:
```

---

## 8. role_context_packets

必须按角色分发上下文，不得把完整 ClickUp、完整 Figma、完整规则摘要、完整日志广播给所有角色。

```text
role_context_packets:
- main_architect:
  - 技术方向约束:
  - Requirement Gap Analysis:
  - Figma Architecture Scope Slice:
  - 冲突 / 边界:
  - 需要裁决问题:
- implementer:
  - Implementation Contract:
  - Implementation Packet:
  - 允许修改文件:
  - 禁止修改文件:
  - 必要局部 Drilldown:
- qa_reviewer:
  - ClickUp 状态更新要求:
  - Test Contract:
  - QA Acceptance Slice:
  - 用户路径:
  - 测试证据要求:
  - 失败归因要求:
- docs_keeper:
  - 文档同步触发依据:
  - 目标文档:
  - 术语 / 规则 / 索引同步点:
```

---

## 9. code_explorer 成本路由

不得把 code_explorer 固定为第一步。

默认由 main agent 以 architect capacity 判断：

```text
自行 read-only 定位
or
请求低成本 code_explorer 定位
```

main agent / architect_reviewer 必须知道 code_explorer 参考配置：

```text
model: gpt-5.3-codex-spark
reasoning: low
sandbox: read-only
```

只有入口文件、调用链、依赖来源或影响范围不清，且低成本定位比 main agent 自行探索更划算时，才派发 code_explorer。

---

## 10. architect / implementer / QA 闭环

1. main agent 默认输出技术方向、Requirement Coverage Matrix、Implementation Contract、Test Contract；如调用 architect_reviewer，则由其独立复核或补充。
2. implementer 严格按 Contract 执行，不做技术方向裁决。
3. 实现后 code review 默认由 main agent 以 architect capacity 完成；高风险、争议或用户要求时调用 architect_reviewer 独立复核。
4. qa_reviewer 不审 diff，只按 Test Contract、用户路径和证据做 QA。
5. QA 不通过时，main agent 原样转发最小返工指令给同一 implementer。
6. 文档落地由 docs_keeper 执行。

---

## 11. Git 工作区与最终提交

1. 会修改文件的任务开始前必须检查 Git 工作区。
2. 工作区 very_dirty 时必须先询问用户是否允许继续。
3. 任务确认完成后必须做一次 Git commit。
4. commit 只能包含本轮任务范围内变更。
5. 禁止 `git add .`。
6. 无法隔离本轮变更时必须停止并请求用户确认。

---

## 12. 禁止事项

1. 禁止无 ticket id 时假装进入 ClickUp 模式。
2. 禁止 bug 修复 / 需求变更在缺少原始 ticket 且用户未确认的情况下继续。
3. 禁止丢失 ClickUp / comment 硬约束句。
4. 禁止在 Figma UI 任务中只传人工压缩版 Figma 摘要。
5. 禁止 dispatch-task 已有完整 Figma Layered Contract 时重复读取 Figma。
6. 禁止 main agent 越过 implementer 直接改代码。
7. 禁止 main agent 直接写文档。
8. 禁止 main agent 代替 QA 测试。
9. 禁止 QA 做代码 review。
10. 禁止把完整日志、完整 Figma Drilldown、完整 ClickUp 原文广播给所有角色。

## Main-as-Architect Protocol

本节是 main agent 默认承担 architect 职责的详细执行协议。完整 `architect-reviewer.toml` 不应被 main agent 默认读取；main agent 只执行本节压缩协议。

### 1. 适用范围

当任务进入 `dispatch-task`，且未触发独立 `architect_reviewer` 时，main agent 默认承担：

1. 自然语言任务理解。
2. 技术方向裁决。
3. Requirement Coverage Matrix。
4. Implementation Contract。
5. Test Contract。
6. Review Scope。
7. role_context_packets。
8. 实现后 code review。
9. 是否需要独立 `architect_reviewer` 复核的升级判断。

### 2. 普通自然语言意图提取

普通任务允许任意自然语言输入。main agent 必须先提取：

```text
Ordinary Task Intent:
- 用户想做什么:
- 可能的任务类型: 普通开发 / bug修复 / 需求变更 / 只读分析 / 文档同步
- 已知文件 / 模块:
- 隐含验收标准:
- 风险:
- 缺失但必须确认的信息:
- 是否可直接进入计划:
```

只有缺少安全边界、写入权限、外部事实、原始 ticket 或关键验收标准时，才提出最小澄清问题。

### 3. 技术方向裁决

main agent 必须判断当前实现方向：

```text
Technical Direction Decision:
- 推荐方向: 复用 / wrapper / adapter / 插件 / 原生能力 / 轻量新增 / 手搓 / 删除旧逻辑
- 项目已有实现:
- uni-app 生态插件:
- 微信小程序原生能力:
- 成熟方案:
- 手搓是否允许:
- 裁决理由:
```

默认优先级：

1. 删除或收敛不必要旧逻辑。
2. 复用项目已有组件、composable、Pinia store、service、mapper、formatter、云函数模块或工具函数。
3. 通过 wrapper、props、adapter、配置化扩展已有实现。
4. 优先评估 uni-app 生态插件或微信小程序原生能力。
5. 轻量新增独立模块。
6. 最后才允许手搓复杂实现。

直接手搓复杂功能必须说明为什么不能复用、不能 wrapper/adapter、不能使用插件或原生能力。

### 4. Requirement Coverage Matrix

涉及 bug 修复、需求变更、UI 替换、兼容投影、旧 UI 接管、旧数据兼容或 runtime 契约时，main agent 必须输出：

```text
Requirement Coverage Matrix:
- 原始任务约束:
- 当前 bug / change:
- 目标用户路径:
- 新契约字段 / 新触发条件:
- legacy source / old UI / old options:
- 新 UI / 新组件 / 新契约:
- 接管范围:
- 例外范围:
- fallback 规则:
- 真实运行时对象示例:
- 必须验证的用户路径:
- 是否存在触发条件过度收窄风险:
```

禁止为了避免误伤普通场景，把触发条件过度收窄到只匹配新字段、新 source、新 uiVariant 或理想路径，导致旧题、旧数据或真实 runtime object 漏接管。

### 5. Implementation Contract

非简单实现必须输出精简 Implementation Contract。不得输出完整 patch、完整规则、完整 Figma Drilldown 或完整 ClickUp 原文。

```text
Implementation Contract:
- 实现目标:
- 文件级改动计划:
  - 文件:
  - 动作: 新增 / 修改 / 删除
  - 目标函数 / 组件 / store / service / 云函数模块:
  - 改动说明:
  - 禁止改动:
- 数据流 / 调用链:
  - 输入:
  - 中间处理:
  - 输出:
  - 不得改变的契约:
- 模块拆分要求:
  - 必须拆出的模块:
  - 不得继续膨胀的文件:
  - 单文件行数风险:
- 复用 / 插件 / 手搓裁决:
- 删除 / 收敛旧逻辑:
- 关键伪代码:
  - 只写关键流程，不写完整代码
- 给 implementer 的硬限制:
```

如果 Contract 无法明确到文件 / 函数 / 模块级，main agent 应先自行 read-only 定位；若范围仍不清，再按成本路由派发 `code_explorer`。

### 6. Test Contract

main agent 负责设计测试契约，但不执行测试。

```text
Test Contract:
- unit-test:
  - 必测点:
  - 负向用例:
  - 旧行为回归:
- smoke-test:
  - 入口:
  - 关键断言:
  - 必验字段 / 证据:
- e2e-test:
  - 用户路径:
  - 断言点:
  - 截图 / 日志证据:
- UI / Figma:
  - 必测状态:
  - 允许偏差:
  - 不允许偏差:
- API / DB / runtime:
  - 必验字段:
  - 不允许破坏的契约:
- 发布 / CloudBase 证据复核点:
```

QA 只执行和取证，不替 main agent 或 `architect_reviewer` 设计测试契约。

### 7. Review Scope

实现后 code review 默认由 main agent 以 architect capacity 完成。规则：

```text
Review Scope:
- base_ref:
- 本轮 diff 文件:
- 允许扩展读取的依赖上下文:
- 实际扩展读取文件与原因:
- excluded dirty files:
- 无法区分的脏改动:
```

代码 review 是 diff-first，但不是 diff-only。允许读取最小依赖上下文，包括直接调用方、直接被调用方、契约文件、类型/schema、mapper/formatter、store/service/composable、相关测试入口和必要规则摘要。不得默认 review 整个 dirty workspace。

### 8. role_context_packets

main agent 必须按角色分发上下文：

```text
role_context_packets:
- main_architect:
  - 技术方向裁决:
  - Requirement Coverage Matrix:
  - Review Scope:
- implementer:
  - Implementation Contract:
  - Implementation Packet:
  - 允许修改文件:
  - 禁止修改文件:
  - 必要局部 Drilldown:
- qa_reviewer:
  - ClickUp 状态更新要求:
  - Test Contract:
  - QA Acceptance Slice:
  - 用户路径:
  - 测试证据要求:
  - 失败归因要求:
- docs_keeper:
  - 文档同步触发依据:
  - 目标文档:
  - 术语 / 规则 / 索引同步点:
```

不得把完整 ClickUp、完整 Figma、完整规则摘要、完整日志、完整 Drilldown 广播给所有角色。

### 9. 独立 architect_reviewer 升级条件

只有以下情况才调用 `architect_reviewer`：

1. 高风险跨域复杂变更。
2. main agent 对技术方向不确定。
3. 需要独立第二视角。
4. 实现后 diff 争议较大。
5. Contract 与 QA 结果冲突。
6. 返工后仍无法收敛。
7. 用户明确要求独立架构复核。

调用 `architect_reviewer` 时，只传递必要的 role_context_packet，不传完整历史上下文。

### 10. 输出预算

main agent 的 architect 输出必须精简：

1. 不复制完整规则。
2. 不复制完整 Figma Drilldown。
3. 不复制完整 ClickUp 原文。
4. 不输出完整 patch。
5. 不把完整 Implementation Contract 转给 QA，只给 Test Contract 和风险摘要。
6. 长日志、截图、DevTools dump、完整证据放入审计附录或证据路径。

## QA 通过后的 ClickUp 状态更新规则

当任务来自 ClickUp ticket / ClickUp comment deeplink，且 QA 已明确通过时，必须由 `qa_reviewer` 负责将当前任务状态更新为 `done`。

### 1. 触发条件

同时满足以下条件时触发：

1. 当前 workflow 关联了 ClickUp task id。
2. `qa_reviewer` 已完成 QA。
3. QA 结论为通过，且不存在 blocking issue。
4. 未验证项不存在，或用户已明确接受未验证项。
5. 必要文档同步已完成，或已明确说明无需同步。
6. Git commit 已完成，或本轮任务明确不需要 commit / 用户明确禁止 commit。

### 2. 更新方式

`qa_reviewer` 应通过 ClickUp MCP 更新任务状态：

```text
clickup_update_task:
- task_id: <current_task_id>
- status: done
```

不得由 implementer 更新任务状态。main agent 只负责传递 task_id、QA 结论和必要上下文，不替 QA 宣称通过。

### 3. 更新失败处理

如果 ClickUp MCP 不可用、权限不足、`done` 不是当前 list 的有效状态，或状态更新失败：

1. `qa_reviewer` 必须记录失败原因。
2. 不得伪造任务已完成。
3. 最终汇总必须显示 `ClickUp status update: failed`。
4. main agent 可请求用户确认有效 done 状态名称，或要求手动更新。

### 4. QA 输出要求

QA 最终输出必须包含：

```text
ClickUp Status Update:
- task_id:
- qa_passed: yes / no
- should_update_done: yes / no
- update_attempted: yes / no
- target_status: done
- update_result: success / failed / skipped
- failure_reason:
```

### 5. 跳过条件

以下情况不得更新为 done：

1. QA 未通过。
2. 存在 blocking issue。
3. Test Contract 未覆盖关键路径。
4. UI/Figma 验收未通过。
5. DevTools / smoke / e2e 等必须验证项未执行且用户未接受。
6. 当前不是 ClickUp 任务。
7. 当前任务是只读分析或用户明确禁止状态更新。

## Unit Test Ownership / 单元测试职责边界

单元测试拆成三段，不允许 implementer 和 QA 重复做同一件事：

```text
main agent / architect capacity:
- 设计 Test Contract
- 定义必须测什么、负向用例、旧行为回归和是否需要 full unit

implementer:
- 按 Test Contract 新增 / 修改 unit test
- 执行 focused unit self-check
- 输出命令、退出码、关键失败和测试证据摘要

qa_reviewer:
- 不写 unit test
- 默认复用 implementer 的 unit test 证据
- 判断证据是否覆盖 Test Contract
- 只有证据不足、高风险、范围错误、代码变更后或 Contract 要求 full unit 时才补跑
```

### 1. implementer 默认职责

implementer 必须：

1. 按 Test Contract 补充或修改必要 unit test。
2. 执行与本次改动直接相关的 focused unit self-check。
3. 不默认执行完整测试矩阵。
4. 如果 Test Contract 不清楚，停止并请求 main agent 补测试契约。
5. 不得为了测试通过削弱断言、绕过真实路径或删除有效测试。

### 2. qa_reviewer 默认职责

qa_reviewer 必须：

1. 检查 implementer 是否按 Test Contract 补充 / 修改了 unit test。
2. 默认复用 implementer 的 focused unit self-check 证据。
3. 判断 unit test 证据是否覆盖 Test Contract。
4. 不直接写 unit test。
5. 缺少 unit test 时输出返工指令给 implementer。

### 3. QA 何时补跑 unit test

只有以下情况，QA 才补跑 focused 或 full unit test：

1. implementer 没跑。
2. implementer 跑错范围。
3. implementer 证据不可信或缺少命令 / 退出码。
4. 高风险任务。
5. QA 之后发生代码改动。
6. Test Contract 明确要求 full unit。
7. smoke / e2e / UI 结果与 unit 证据冲突。

### 4. 输出要求

role_context_packets 必须传递：

```text
unit_test_context:
- Test Contract unit requirements:
- implementer focused unit command:
- implementer unit exit_code:
- implementer unit evidence_summary:
- QA should_reuse: yes / no
- QA should_rerun: no / focused / full
- rerun_reason:
```
