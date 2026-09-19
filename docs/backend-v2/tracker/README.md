# 后端架构模块进度追踪

在项目根目录运行 `npm run tracker:backend-v2`。脚本会先汇总当前 ticket 心跳，在 `http://127.0.0.1:8765/index.html` 启动本地监听并自动打开页面；服务运行期间每 30 分钟重新汇总一次。可用 `npm run tracker:backend-v2 -- --no-open --port=8766` 禁止自动打开或改用其他端口。

`index.html` 只读取 `module-status.json`，按后端架构模块列举职责、Phase、负责 agent、ClickUp ticket 和进度条，不还原 Mermaid。

`module-status.json` 中的 `plannedAgent` 是计划角色，`agentRegistry[].name` 和 ticket 的 `agent` 才是当前实际子代理。页面不得把计划角色显示成当前负责人；当前没有运行时绑定时必须显示“未分配”。

进度由 ticket 负责人写入 `heartbeats/<ticket-id>.json`，开始时、重大里程碑以及不晚于 30 分钟更新一次；主代理 `/root` 运行 `node docs/backend-v2/tracker/sync-heartbeats.mjs` 校验并汇总到 `module-status.json`，同时负责漏报、超时、冲突裁决和最终兜底。代理重启不得把已有进度归零；若证据推翻原结论，必须用 `allowRegression: true` 明确说明降级。页面每 30 分钟重新读取汇总快照，但不会凭空生成进度。ClickUp 不可用时必须标记 `CLICKUP_BLOCKED`，不得伪造同步。ClickUp 仍为 `backlog` 的任务，不得在本地伪装成已经进入 `codex running`。Phase-P-1 当前状态全集固定为：`backlog`、`ready for codex`、`codex running`、`human required`、`blocked`、`review needed`、`done`。

模块进度条显示“已有明确进度的 ticket 平均值”，并同时显示已报告任务数/模块总任务数。尚未进入当前 Phase、没有负责人或没有进度报告的未来任务不参与平均值，但仍计入总任务数；当一个模块没有任何已报告 ticket 时，页面显示“尚未启动”，不再显示容易误判的 `0%`。
