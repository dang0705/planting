# ZCode Routing Policy

仅当内部路由字段 `implementation_mode=zcode_external` 时读取。该字段由 dispatch-task 自动推断或由用户强制指定；用户不必每次逐字输入。本文只定义外部实现者路由，不重复完整 prompt 模板。

## 触发

命中“用 ZCode / 走 ZCode / ZCode 实现 / 交给外部实现者 / GLM 在 ZCode 里跑”等自然语言正向触发词，或用户显式写入 `zcode_external` / `implementation_mode=zcode_external`，且任务需要代码修改时，main 自动设置：

```text
implementation_mode = zcode_external
external_implementer = zcode_glm
zcode_target = current_open_chat
```

明确出现“不用 ZCode / 禁用 ZCode / no zcode / disable zcode”，或任务只是询问流程、配置、故障时，不触发。

## 所有权

1. main 负责 Architecture Direction、Implementation Contract、路径边界、项目约束、ZCode prompt 生成、发送、回收、diff review 与 Completion Gate。
2. ZCode external implementer 只负责按 prompt 修改代码和写 handoff manual。
3. QA 仍由 Codex `qa_reviewer` 独立执行；ZCode 不替代 QA。
4. ZCode 聊天中的“完成”不是完成依据，main 必须重新读取真实 git diff、测试证据和 handoff manual。
5. ZCode 失败、无 diff、越权修改、无法读取必要 Figma 数据、prompt 未完整发送或 computer-use 不可用时，不得自动 fallback 为 main 自己写代码。

## Prompt 来源

使用：

```text
dispatch-task/assets/templates/zcode-prompt-template.md
```

prompt 必须包含 start/end sentinel、Implementation Contract、Allowed/Forbidden Paths、Project Constraints、Handoff Manual Contract、Validation Commands 和 Result JSON Contract。

## Handoff Manual

`handoff_manual.path` 必须位于：

```text
.tmp/dispatch-task/{dispatch_run_id}-handoff-manual.json
```

ZCode 开始任务后置 `status=working`，完成或阻塞时更新为 `completed|blocked`。main 低频回收时必须先读该 JSON，再判断是否进入 recovery。

## Recovery

ZCode 结束后，Codex main 生成 recovery result，并执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <zcode-recovery-result.json>
node .codex/skills/dispatch-task/scripts/validate-worktree-scope.mjs <handoff.json>
```

若 recovery result 为 `blocked`，它是合法阻断结果，但不能进入 Completion Gate。
