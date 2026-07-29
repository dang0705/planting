# Intake and Project Constraints

## Gate A — Intake

main 只读取：用户输入/显式 source、`git status --short`、目标路径最近的 AGENTS.md。UI 任务再定向读取 package.json、Tailwind 配置和组件库入口。

形成短 Brief：

```text
objective / dispatch_tier / code_changes_required / ui_task / figma_link / risk / acceptance / likely_paths / implementation_mode
```

普通任务不得先读完整历史、完整 ClickUp、完整 Figma、全仓规则或旧 INDEX。输入含有效 ClickUp ticket 时读取 `references/clickup-workflow.md`。

## Project Constraints

代码任务必须形成 `Project Constraints`：

```text
rule_refs              # 路径 + 相关章节，不复制整份 AGENTS.md
framework
styling_system         # UI 必填
new_scss_policy        # UI 必填：forbidden / explicit_exception_only
scss_exceptions        # 默认 []
component_library      # UI 必填；若为 uni-ui 且存在 figma_link，必须触发 uni-ui 映射合同
dependency_policy
test_commands
```

项目声明 Tailwind CSS 时，必须原样写入 `styling_system`；不得因 Vue/uni-app 习惯默认 SCSS。实现者还需独立核对 `rule_refs`。

## 读取边界

1. `rule_refs` 只写路径和相关章节，不复制整份 AGENTS.md。
2. `.codex/context-packs.yml` 是任务上下文选择入口；不得默认全量读取 docs、BRV 或 references。
3. 当前事实源、事实优先级、ByteRover 内容资格及 Topic 的当前事实使用方式统一执行 `AGENTS.md`；dispatch-task 不重新定义。
