# Subagent 线程复用规则

## 1. 定位

本文件保留为历史兼容入口。当前 dispatch-task 不创建、派发或复用内部 subagent；所有实现、QA、docs 和 ByteRover 影响处理由 main 执行。只有用户明确要求时才使用 external implementer bridge。

本文件只描述 main 与显式 external bridge，不提供内部角色复用规则。

## 2. 当前可复用角色

| logical_role | 用途 | 是否可重开 |
|---|---|---|
| ``main agent`` | 技术方向裁决、Implementation Contract、Test Contract、实现后代码 review | 默认复用；职责边界改变或线程失效才重开 |
| `external_implementer` | 用户明确授权后的 provider bridge | 每个 external dispatch 只保留一个 provider 会话 |

## 3. 复用原则

1. 同一会话内只允许 main 作为内部执行角色；external provider 只通过 bridge 合同存在。
2. 同一 external dispatch 只保留一个 provider 会话。
3. 只有以下情况才允许重开：
   - 既有线程失效。
   - 既有线程明确绑定了错误角色。
   - 职责边界发生实质变化。
   - 既有线程上下文污染，继续复用会造成错误。
   - 用户明确要求重开 external provider bridge。
4. 重开时必须在 handoff 或最终汇总中记录原因。

## 4. fallback 线程绑定

不得使用 default/worker/generic 线程替代内部角色。external provider 不可用时保持 blocked，等待用户决定。

记录字段：

```text
fallback_thread: forbidden
```

一个 `default` 替代线程绑定某个 `logical_role` 后，不得混用为其他角色。

## 5. 线程复用输入规则

进入 external bridge 时，main 应传递最小输入：

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
- `external_implementer`：External Contract、允许/禁止修改文件、provider transport 与 handoff manual 路径。

不得广播完整 ClickUp、完整 Figma、完整规则、完整日志或完整历史 handoff。
