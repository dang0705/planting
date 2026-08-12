# planting 端上验收必须先跑通完整 LAN 本地函数 flow

用户明确要求：今后最优先的任务是解决问题，而不是只告诉用户如何解决。

在 `/Users/jay/WebstormProjects/planting` 中，所有端上验收如果本轮代码未部署到云端，必须先成功跑通：

```bash
npm run dev:mp-weixin:local-functions:lan
```

只有该完整 LAN flow 完成本地 CloudBase 函数 gateway readiness、函数 health route readiness、关键业务探针，并进入 `dist/dev/mp-weixin` watch/ready 状态后，`9420` / `miniprogram-automator` / 小程序运行时 `wx.request` 才能作为本轮验收通过证据。

只启动 scoped gateway（例如 `LOCAL_FUNCTIONS=weather-http`）、只用 backend curl / Node HTTP、只看 `__local_functions__/health`、只跑单函数 health route，都只能作为排障证据，不能算端上验收完成。

2026-06-15 的 weather-cache QA 暴露了反例：旧 `3010` gateway health 返回包含 `weather-http`，但 `9006` worker 不存在，`weather-http` 实际返回 `502 LOCAL_FUNCTION_PROXY_FAILED / connect ECONNREFUSED 127.0.0.1:9006`。当时 scoped `3013` gateway 通过只能证明单函数路径，不等于完整 LAN flow 通过。
