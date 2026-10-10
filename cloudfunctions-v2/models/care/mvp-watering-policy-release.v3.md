# `care-watering-mvp/v3` 发布正文取值依据

正文：`mvp-watering-policy-release.v3.json`。依据：用户 2026-10-10 审定——盆型（体积与几何）与基质参与干湿循环（`mvp-watering-policy-contract.md` 第 8 节）。除下表新增字段与 `cultivationRetention` 语义收窄外，其余数值与 `care-watering-mvp/v2` 完全相同（取值依据见 v1.md / v2.md）。整体置信度 `low`。

| 字段 | 取值 | 依据 | 置信 |
|---|---|---|---|
| referencePot | 盆口内径 15、盆底内径 11、内深 13（cm），不透气、有排水孔 | 约 1.7 L 常见 15cm 塑料盆；文献调研 §8 用 15cm/1.5～2 L 核对 5～14 天周期量级；用户 2026-10-10 审定 | 低（定义锚点） |
| referenceAvailableWater | 0.30 | 已发布泥炭可用水（AW，Bilderback 2005 口径） 0.25～0.35 的中点，作为定义点值；用户 2026-10-10 审定 | 低（定义锚点） |
| plantDemandVolumeExponent | 0～0.52 | Poorter et al. 2012：盆容积翻倍生物量平均 +43%（log₂1.43≈0.52）；0 表示刚换盆植物未长；用户 2026-10-10 审定 | 中 |
| cultivationRetention | 0.8～1.25（数值同 v2） | v3 起只用于“几何齐备但未选基质”的兜底存量比；用户 2026-10-10 确认保留 | 低 |

不包含：盆壁材质蒸发系数 κ 与 `wallMaterial`（待验证票 ClickUp z8v0kmvewm，验证通过前不得进入模型）；无孔盆存量上端规则（仍 pending）。环境缺段 ≤6 小时保守补齐为代码硬规则（`MVP_DRYING_GAP_FILL_MAX_HOURS`），不在正文中。发布到数据库由主代理执行，本文件不代表已发布。
