# 天气 D0 now 采样字段与 latestSample 规则

在 `/Users/jay/WebstormProjects/planting` 的 weather cache 中，D0 `days/{date}.json` 的 `samples[]` 不再只保留压缩字段，而应保留 QWeather `/v7/weather/now` 的完整关键观测字段，便于后续诊断、回放和排障追溯。`latestSample` 必须从最终 `samples[]` 中按采样时间取最新样本生成，不能沿用写入前的旧值。
