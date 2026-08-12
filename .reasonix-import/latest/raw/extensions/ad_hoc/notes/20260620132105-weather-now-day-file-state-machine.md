# planting 天气 now 采样单日状态机

`/Users/jay/WebstormProjects/planting` 的天气 D0 归档已从旧 `working/{date}.json` + `daily/{date}.json` 调整为单一 `days/{date}.json` day file 状态机。

- 白天采样由 QWeather `/v7/weather/now` 提供，追加到 `samples[]` 并更新 `latestSample`，文件保持 `state=working`。
- 定稿仍写同一 `days/{date}.json`，生成嵌套 `dailyRollup`，设置 `state=finalized`、`finalizedAt`、`sourceKind=observed_now_rollup`。
- `/weather/current` 优先读当天 `latestSample`，缺失时降级读最近 finalized day rollup；不能在 current 路由同步调用 QWeather realtime，缺证据时返回空态或 `weatherEvidenceInsufficient` 而不是 500。
- `recent-10d.json` 只聚合 D-1 到 D-10 且 `state=finalized` 的 `days/{date}.json`，D0 当天不得进入 recent，也不得从旧 `dailyArchives` 重建。
- D0 now 采样 timer 主配置为 `weather-d0-now-morning-0920`、`weather-d0-now-forenoon-1220`、`weather-d0-now-noon-1420`、`weather-d0-now-afternoon-1820`、`weather-d0-now-finalize-2130`；旧 `weather-d0-24h-*` 名只作为过渡兼容输入。
