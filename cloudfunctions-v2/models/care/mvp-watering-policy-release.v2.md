# `care-watering-mvp/v2` 发布正文取值依据

正文：`mvp-watering-policy-release.v2.json`。依据：用户 2026-10-09 裁决 U6（固定 24 小时盆土证据有效期是缺陷，改为按干湿循环）。除下表两项替代 v1 的 `soilEvidenceTtlHours` 外，其余数值与 `care-watering-mvp/v1` 完全相同，取值依据见 `mvp-watering-policy-release.v1.md`。整体置信度 `low`。

| 字段 | 取值 | 依据 | 置信 |
|---|---|---|---|
| soilEvidenceFallbackHours | 24 小时 | 湿/微湿观察在缺光照或环境时段、推算不出离开该状态时刻时的回退；沿用 v1 的室内盆土约一天内显著变化（Reading 2024） | 低 |
| soilEvidenceMaxHours | 72 小时 | 任何盆土观察的统一封顶，用户 2026-10-09 裁决；超过即视为过期并提示重新观察 | 低（产品裁决） |

有效期规则（`long-term-care-contract.md` §8）：湿/微湿 → 以最快干燥速率消耗该状态剩余比例跨度所需时间，推不出回退 24 小时；干（含仅表土干）→ 有效到晚于观察时刻的已确认浇水事实；统一封顶 72 小时。发布由主代理执行，本文件不代表已发布。
