# `user-plant-profile-progress/v1` 发布正文取值依据

正文：`profile-progress-policy.v1.json`；Schema：`profile-progress-policy.v1.schema.json`；合同：`docs/backend-v2/contracts/user-plant-profile-completeness.md`。
依据：用户 2026-10-10 审定（完整度草案按推荐采纳、必须可配置；追加植物位置 Lux 计分，权重由 user-plant 子代理给出方案）。

| 项 | 权重 | 依据 |
|---|---:|---|
| catalog_binding | 30 | 无品种绑定即无浇水基线，建议恒为证据不足（用户采纳草案值） |
| measured_pot | 25 | 浇水量区间与排水安全提示（用户采纳草案值） |
| substrate | 15 | 干燥存量收窄（用户采纳草案值） |
| location | 12 | 草案 20 − 8：调给 Lux；仍高于 Lux，因为 Lux 需城市辐射才能换算全天光照 |
| plant_light | 10 | 用户 2026-10-10 追加；有效期复用 care/mvp_watering `luxAnchorMaxAgeDays` |
| ventilation | 5 | 用户采纳草案值 |
| lighting | 3 | 草案 5 − 2：当前算法不消费朝向 |

档位：starter 0 / good 50 / great 80 / complete 100（用户采纳草案值）。文案为面向用户的中文说明，随版本固定。
发布到数据库由主代理执行，本文件不代表已发布。
