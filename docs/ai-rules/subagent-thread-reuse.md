# Subagent 线程复用规则

## 1. 定位

本文件定义同一会话内 subagent 线程复用规则，避免同角色重复开线程导致上下文膨胀、模型配置漂移和 handoff 断裂。

本文件只描述当前可用角色，不包含已删除角色。

## 2. 当前可复用角色

| logical_role | 用途 | 是否可重开 |
|---|---|---|
| ``main agent`` | 技术方向裁决、Implementation Contract、Test Contract、实现后代码 review | 默认复用；职责边界改变或线程失效才重开 |
| `code_explorer` | 可选低成本代码定位、调用链 / 依赖来源 / 影响范围定位 | 默认复用；只在定位目标明显变化时重开 |
| `implementer_fast` | 低风险局部契约执行 | 默认复用；同一批文件未完成前不得重开 |
| `implementer_deep` | 高风险 / 多文件 / 诊断流 / CloudBase 等契约执行 | 默认复用；同一批文件未完成前不得重开 |
| `qa_reviewer` | 测试执行、smoke、e2e、UI/Figma 验收、失败归因 | 默认复用；同一验收范围内不得重开 |
| `docs_keeper` | 文档落地、索引同步、术语一致性、完整文档交付 | 默认复用；文档目标完全变化时可重开 |

## 3. 复用原则

1. 同一会话内同一 `logical_role` 只能保留一个活跃线程。
2. 继续同一角色任务时，优先把新输入追加到已有线程。
3. 只有以下情况才允许重开：
   - 既有线程失效。
   - 既有线程明确绑定了错误角色。
   - 职责边界发生实质变化。
   - 既有线程上下文污染，继续复用会造成错误。
   - 用户明确要求重开。
4. 重开时必须在 handoff 或最终汇总中记录原因。

## 4. fallback 线程绑定

如果专用角色不可用，并使用 `default` 线程替代，必须绑定 `logical_role`。

记录字段：

```text
fallback_thread:
- logical_role:
- requested_agent_type:
- actual_agent_type:
- agent_id/thread_id:
- fallback_reason:
- expected_model:
- expected_reasoning:
- expected_sandbox:
- observed_or_requested_model:
- observed_or_requested_reasoning:
- observed_or_requested_sandbox:
- config_match: false
```

一个 `default` 替代线程绑定某个 `logical_role` 后，不得混用为其他角色。

## 5. 线程复用输入规则

继续复用同一角色线程时，`main agent` 应传递最小输入：

```text
Thread Reuse Input:
- logical_role:
- existing_thread_id:
- 本轮目标:
- 与上一轮差异:
- 需要复用的上轮结论:
- 本轮新增上下文:
- 不需要重复读取的内容:
- 输出要求:
```

不得把完整历史对话重新发送给同一角色。

## 6. 与 role_context_packets 的关系

线程复用时优先传递对应角色的 `role_context_packet`：

- ``main agent``：Technical Scope Slice、Implementation Contract、Test Contract、Review Scope。
- `implementer_fast/deep`：Implementation Contract、Implementation Packet、允许/禁止修改文件。
- `qa_reviewer`：Test Contract、QA Acceptance Slice、测试计划、证据路径。
- `docs_keeper`：文档同步触发依据、目标文档、需同步索引。
- `code_explorer`：最小搜索目标、候选目录、需要回答的问题。

不得广播完整 ClickUp、完整 Figma、完整规则、完整日志或完整历史 handoff。
