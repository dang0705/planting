# 后端架构模块进度追踪

在项目根目录运行 `npm run tracker:backend-v2`。脚本会先汇总当前 ticket 心跳，在 `http://127.0.0.1:8765/index.html` 启动本地监听并自动打开页面；服务运行期间每 30 分钟重新汇总一次。可用 `npm run tracker:backend-v2 -- --no-open --port=8766` 禁止自动打开或改用其他端口。

`index.html` 只读取 `module-status.json`，按后端架构模块列举职责、Phase、负责 agent、ClickUp ticket 和进度条，不还原 Mermaid。

`module-status.json` 中的 `plannedAgent` 是计划角色，`agentRegistry[].name` 和 ticket 的 `agent` 才是当前实际子代理。页面不得把计划角色显示成当前负责人；当前没有运行时绑定时必须显示“未分配”。

进度由 ticket 负责人写入 `heartbeats/<ticket-id>.json`，开始时、重大里程碑以及不晚于 30 分钟更新一次；主代理 `/root` 运行 `node docs/backend-v2/tracker/sync-heartbeats.mjs` 校验并汇总到 `module-status.json`，同时负责漏报、超时、冲突裁决和最终兜底。代理重启不得把已有进度归零；若证据推翻原结论，必须用 `allowRegression: true` 明确说明降级。页面每 30 分钟重新读取汇总快照，但不会凭空生成进度。ClickUp 不可用时必须标记 `CLICKUP_BLOCKED`，不得伪造同步。ClickUp 仍为 `backlog` 的任务，不得在本地伪装成已经进入 `codex running`。Phase-P-1 当前状态全集固定为：`backlog`、`ready for codex`、`codex running`、`human required`、`blocked`、`review needed`、`done`。

只有 `done` 任务可以显示 `100%`。`review_needed` 最高显示 `95%`；`in_progress`、`codex running`、`human required` 和 `blocked` 最高显示 `94%`；其他未识别的非完成状态最高显示 `99%`。这项限制在汇总脚本中强制执行，旧心跳中的 `100%` 不能让未验收任务伪装成完成。

模块进度条按模块内全部 ticket 求平均，尚未进入当前 Phase、没有负责人或没有进度报告的任务统一按 `0%` 计入；页面同时显示已报告任务数/模块总任务数。总体完成度按所有模块的全部 ticket 直接求平均，不先计算模块平均值再二次平均，避免不同模块任务量不同造成权重失真。

ClickUp 状态由专职次级模型代理 `clickup_status_keeper_gpt6` 维护，固定使用 `gpt-6-luna / max`，每 30 分钟核对一次。该代理是 `module-status.json.clickUpTaskStatuses` 的唯一维护者；业务代理只写自己的 ticket heartbeat，不得直接改 ClickUp 状态快照。汇总脚本按 heartbeat 内容中的 `agent` 字段识别 keeper，优先使用 `clickup_status_keeper_gpt6`，并兼容旧代理名 `clickup_status_keeper_luna`；保留已有 `heartbeats/clickup-status-keeper.json` 文件名，不要求随代理更名。每轮先通过已连接的 ClickUp MCP 批量读取目标 folder 的全部任务，核对任务 ID、标题、阶段、状态和链接；再与 `module-status.json`、`heartbeats/*.json`、当前实际代理、可验证产物及 `index.html` 的实际渲染逐票据比较。远端状态只采用 ClickUp 回读结果，本地心跳和进度不得冒充远端状态或进度。仅当 ClickUp MCP 明确不可用或当日额度耗尽，且能够确认复用用户 Chrome `default/main` 主 profile 中既有且已登录的 ClickUp 标签页时，才允许以 Chrome MCP 后备；禁止新建窗口、标签页或 profile、另行登录或使用 Codex 内置浏览器。Chrome 浏览器家族连接或 profile 名称单独不能证明 `default/main`；无法确认指定 profile 或登录态时，必须记录 `BLOCKED_PROFILE_OR_AUTH` 并保留上次已验证的远端映射，不根据页面推测未回读的状态。ClickUp 没有可读写的原生或自定义进度字段时，不得声称远端进度已同步，也不得通过覆盖任务描述模拟进度。每轮回读远端最终状态，把覆盖全部已登记 ticket 的 `ticketStatuses` 完整映射写入 `heartbeats/clickup-status-keeper.json`，然后运行 `sync-heartbeats.mjs`；核对 28 票或实际总票数、链接、标题、状态、进度、汇总百分比及 H5 呈现。汇总脚本只接受已登记 ticket 和 ClickUp 合法状态。任务只有经主代理验收后才可标记为 `done`。
