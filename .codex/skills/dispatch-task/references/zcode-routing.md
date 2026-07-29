# ZCode Routing Policy

仅当 `external_contract.provider=zcode` 或旧 `implementation_mode=zcode_external` 时读取。本文只定义 ZCode provider adapter，不重复外部实现者公共 handoff 协议。

## 触发

命中“用 ZCode / 走 ZCode / ZCode 写代码 / zcode_external / GLM 在 ZCode 里跑”等正向触发词，且任务需要代码修改时，设置：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode
external_contract.target_session = current_open_chat
```

旧字段 `implementation_mode=zcode_external`、`dispatch_tier=zcode_external`、`zcode_contract.external_implementer=zcode_glm` 继续兼容，但新合同优先使用 `external_contract`。

明确出现“不用 ZCode / 禁用 ZCode / no zcode / disable zcode”，或任务只是询问流程、配置、故障时，不触发。

## 所有权

1. main 负责 Architecture Direction、Implementation Contract、路径边界、项目约束、统一 external prompt 生成、发送、回收、diff review 与 Completion Gate。
2. ZCode provider external implementer 只负责按 prompt 修改代码和写 handoff manual。
3. QA 由 Codex main 在本地或 worktree 中独立执行；ZCode 不替代 QA。
4. ZCode 聊天中的“完成”不是完成依据，main 必须重新读取真实 git diff、测试证据和 handoff manual。
5. ZCode 失败、无 diff、越权修改、无法读取必要 Figma 数据、prompt 未完整发送或 computer-use 不可用时，不得自动 fallback 为 main 自己写代码。

## Prompt 来源

使用：

```text
统一模板：`dispatch-task/assets/templates/external-implementer-prompt-template.md`
ZCode 兼容 alias：`dispatch-task/assets/templates/zcode-prompt-template.md`
```

ZCode prompt 必须使用统一 external implementer sentinel，并保留统一 section 结构；ZCode adapter 只额外校验发送前的会话、输入框、sentinel 可见性和发送动作。

## Handoff Manual

`handoff_manual.path` 必须位于：

```text
.tmp/dispatch-task/{dispatch_run_id}-handoff-manual.json
```

ZCode 开始任务后置 `status=working`，完成或阻塞时更新为 `completed|blocked`。main 低频回收时必须先读该 JSON，再判断是否进入 recovery。若文件缺失或 JSON 损坏，不得用聊天状态补判完成；recovery result 必须记录 `zcode_handoff_manual.status=missing|invalid` 并返回 `blocked`。

### provider_status 与 dispatch 完成状态分离

本轮 legacy manual 仍用 `status=working|completed|blocked`，`completed` 只表示本次 provider 交付结束。未来生成的 provider 合同改用 `provider_status=running|delivered|blocked`：`delivered` 只触发 recovery，绝不等于 dispatch 完成。dispatch 完成由 episode `lifecycleStage=completion_ready` 经 `validate-completion-readiness` 唯一记录。唯一标识只能是 `dispatch_run_id`；不接受 `dispatch_id` 别名，不允许 `delivered`/`completed` 语义混用。

## Continuation contract

ZCode provider 返回终态后进入 `lifecycleStage` 严格转移（见 SKILL.md §7.1）。`episode provider-delivered` 只记录交付 + recovery_required，不 finish；`completion_ready` 只能由成功验证的 `validate-completion-readiness` 记录；`episode finish --status=completed` 在 `completion_ready` 之前被拒绝。ZCode 聊天中的“完成”不是完成依据。

## Recovery

ZCode 结束后，Codex main 生成 recovery result，并执行：

```bash
# handoff manual 存在且可解析时执行；缺失/损坏时由 recovery result 记录 missing/invalid 并 blocked。
node .codex/skills/dispatch-task/scripts/validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>
node .codex/skills/dispatch-task/scripts/validate-implementation-postflight.mjs <handoff.json> <zcode-recovery-result.json> <worktree-baseline.json> > .tmp/dispatch-task/<dispatch_run_id>-postflight-report.json
```

若 recovery result 为 `blocked`，它是合法阻断结果，但不能进入 Completion Gate。
