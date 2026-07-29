# 环境上下文 v7 运行约束

## 范围

本轮只落地 v7 环境上下文运行边界，不部署云端函数。小程序本地开发仍走本地云函数网关，PR 后再按发布流程部署。

## 天气窗口

- `weather-http/weather/environment-context` 返回 D-10 ~ D-1 历史天气和 D0 ~ D+14 未来 15 天预报。
- D0 同时记录 `todaySource`：优先说明是否合并了 `weather/now` 当前天气。
- 历史天气不补造 UV；和风历史接口没有 UV 字段时保持缺省。
- 适配层只归一化和风天气字段，不写诊断、浇水或施肥规则。
- 每次最多处理 10 条历史 daily records 与 15 条预报 daily records。

## v7 摘要

- 历史摘要字段限定为 `highHumidityDays`、`lowHumidityDays`、`coldHumidDays`、`hotDryDays`、`hotHumidDays`、`rainyDays`、可选 UV 字段。
- 未来摘要字段同上，窗口为 15 天。
- 温度、湿度阈值来自属级养护基线。
- UV 只在用户存在真实受光场景时参与属级 UV 上限判断。

## Planner

- 浇水只输出三类上下文：`likely_too_wet`、`likely_too_dry`、`keep_baseline_or_check_soil`。
- 施肥 MVP 不读取天气，只看施肥事件、浓度、`last_fertilized_bucket`、换盆、弱生长等门控。
- 施肥固定基线为 30–45 天薄肥一次，输出 `pause`、`thin_after_due`、`normal_baseline`、`possible_deficiency_check`。
- 光照风险必须合并用户真实受光场景；单独 UV 高不触发光照风险。

## 验证

- `node test-weather-environment-context.mjs`
- `node test-environment-care-context.mjs`
- `node test-care-behavior-payload.mjs`
