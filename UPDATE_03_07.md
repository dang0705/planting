进展结论

- 按 README 的 17 个功能点口径统计：已完成 9、部分完成 3、未完成 5。
- 如果把“部分完成”也计入待开发，则待开发共 8 项。
- 已落地的核心链路：登录鉴权、植物库与用户植物 CRUD、图片上传、AI 识别与诊
  断、配额控制、会员权益展示。

对照要点（含证据）

- 已实现：
- AI 识别/诊断云函数已接入并可用（identify/index.js:14、diagnose-http/
  index.js:58）。
- 植物 CRUD 基本完整（getUserPlants/index.js:5、saveUserPlant/index.js:5、
  updateUserPlant/index.js:5、deleteUserPlant/index.js:5）。
- 定位授权 + 实时天气已接通（CustomNavbar.vue:121、getWeather/
  index.js:154）。
- 部分完成：
- 诊断“2-5 张图”前端可选，但诊断实际只上传并使用第 1 张（diagnose.vue:203、
  diagnose.vue:298）。
- 会员配额前后端口径不一致：前端按“5 次”展示，后端 free 配额是“3 次/天 + 月上
  限 90”（user.js:28、quota.js:14）。
- 诊断历史目前主要是本地 Pinia 历史，未形成云端历史列表/详情页闭环
  （diagnose.js:24、profile.vue:243）。
- 未完成：
- 日历页天气/节气仍是静态+TODO（calendar.vue:181、calendar.vue:187）。
- 节气提醒、天气驱动养护建议未落地（同页 TODO）。
- 微信支付仍是占位（profile.vue:215）。
- “手动选择地区+城市输入”未看到完整入口，当前更偏“重新定位/授
  权”（CustomNavbar.vue:265）。

优先级建议

- P0（先做）
- 打通“用户可感知主闭环”：云端诊断历史列表与详情页（现在 profile 里是占位/本
  地历史）。
- 修复关键缺陷：植物详情页修改名称处存在明显代码错误（plant-
  detail.vue:211）。
- 统一产品规则：前后端配额口径统一（5次/月 vs 3次/天）。
- P1（次优先）
- 完成天气与日历真实数据化：7天/14天/30天预报、节气数据、提醒状态更新。
- 完成多图诊断真实多图输入（而不是仅首图）。
- P2（后续）
- 微信支付接入 + 订阅生命周期（开通、续费、到期、回落）。
- 养护知识、设置、帮助等“功能开发中”菜单页完善。
