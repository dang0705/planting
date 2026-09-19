# ClickUp Ticket 模板

标题格式：

```text
[Phase][模块] 动词 + 业务目标
```

必填：任务目的、业务架构节点、后端模块、Master Plan 章节、实施文档路径、计划角色 agent、当前运行时子代理名、协作 agent、ClickUp ticket ID、输入 SHA、依赖 ticket、产物、正常/权限/非法输入/幂等/失败恢复/读回/脱敏验收标准、不包含范围、状态、完成百分比和最后更新时间。

任务创建后默认是 `backlog`。完成依赖核对和运行时代理绑定后进入 `ready for codex`；任何子代理开始工作前，必须先把该任务改为 `codex running`。环境或依赖阻断进入 `blocked`，需要用户决策进入 `human required`，产物提交等待验收进入 `review needed`，验收通过后才进入 `done`。状态变更失败时只能在本地标记 `CLICKUP_BLOCKED`，不能自报 ClickUp 已进入其他状态。

状态：

```text
backlog → ready for codex → codex running → review needed → done
```

无法继续时进入 `blocked`，需要用户输入时进入 `human required`；两者都必须记录原因和恢复条件。
