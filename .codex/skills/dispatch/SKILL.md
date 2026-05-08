---
name: dispatch
description: 按 AGENTS.md 的主代理调度协议处理任务：先分类，输出 Dispatch Plan，再按需派发 subagent。适用于复杂开发、架构、诊断流、部署、文档、QA、代码定位等任务。
---

# Dispatch Skill

## 目标

当用户要求处理非简单任务时，先执行主代理调度，而不是直接实现。

## 使用方式

当用户输入以下意图时，应使用本 skill：

- “按调度处理”
- “先派发”
- “自动选择 subagent”
- “复杂任务先规划”
- “根据 AGENTS.md 调度”
- “先输出 Dispatch Plan”
- 涉及架构、诊断流、outcome、gate、replay、CloudBase、部署、测试、文档、多文件改造

## 执行规则

1. 先读取根目录 `AGENTS.md`。
2. 只提取与调度相关的规则，不把完整 `AGENTS.md` 作为长期工作上下文。
3. 判断任务类型。
4. 输出 `Dispatch Plan`。
5. 明确选择哪些 subagent。
6. 明确每个 subagent 需要读取哪些规则文件。
7. 默认要求 subagent 不读取完整 `AGENTS.md`。
8. 优先只读探索，再进入实现。
9. 高风险实现使用 `implementer_deep`。
10. 低风险、小范围实现使用 `implementer_fast`。
11. subagent 返回后，main agent 必须汇总结论、证据、冲突点、风险点和下一步建议。

## Dispatch Plan 格式

```text
Dispatch Plan:
- 任务类型:
- 选择的 subagent:
- 选择原因:
- 需要读取的规则文件:
- 是否需要读取 AGENTS.md: 默认否；仅在缺少派发上下文、规则冲突、线程恢复或角色边界不清时为是
- 预期输出:
- 写入权限:
```
