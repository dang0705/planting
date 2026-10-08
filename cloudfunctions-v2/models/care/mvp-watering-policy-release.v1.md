# `care-watering-mvp/v1` 发布正文取值依据

正文：`mvp-watering-policy-release.v1.json`。来源细节见 `mvp-literature-parameters.md`。整体置信度 `low`，未经本地盆栽标定（用户 2026-10-08 接受为后续优化）。标“推导”的值不是文献直接值。

| 字段 | 取值 | 依据 | 置信 |
|---|---|---|---|
| referencePpfd | 50 μmol/(m²·s) | 室内中等光照 DLI 约 1.1～2.8 mol/(m²·d)（佛罗里达室内景观手册 75～200～500 fc 分档，推导）；取约 2 mol/d 摊到 12 小时白天 ≈ 46，取整 50 | 低（推导） |
| referenceVpdKpa | 1.4 kPa | 22～24°C、40～50%RH 室内 VPD 1.3～1.8 kPa（推导，饱和水汽压公式） | 中 |
| lightHalfSaturationPpfd | 75 | 无观叶植物直接值；由 Hosta 补偿点 17±6、饱和 200～350 推导 50～100，取中值 | 低（推导） |
| vpdSensitivity | 0.6 | Oren 等 1999 Fig.3（叶片 0.60，r²=0.92）、Fig.4b（冠层 0.59） | 高 |
| transpirationShare | 0.8 | 大容器实测蒸发约 4%；小盆表面积/体积比更大，保守取蒸发 20% | 低 |
| validVpdKpa | 0.1～4 | 0.6 灵敏度下导度归零点 ≈ 1.4·e^(1/0.6) ≈ 7.4 kPa；4 kPa 以上室内罕见且模型外推不可靠 | 中 |
| indoorVpdFallbackKpa | 0.7～2.2 | 18～28°C、35～70%RH 的室内包络（推导）；仅在无室内实测时使用，标为 estimate | 低（推导） |
| cultivationRetention | 0.8～1.25 | 盆器/基质相对参考的未知差异不确定带；无文献直接值，不默认 1 | 低 |
| soilEvidenceTtlHours | 24 | 室内盆土 1 天内显著变化（日耗水 35～68 g/株，Reading 2024） | 低 |
| remainingFraction | 湿 0.6～1、微湿 0.25～0.6、仅表土干 0～0.5 | 四态是粗分；按“耗水分数”对应的周期位置推导 | 低（推导） |
| depletion | 喜湿 0.15～0.25、表土干 0.25～0.35、见干见湿 0.45～0.55、干透 0.7～0.85 | 推广站“表层 1～2 英寸干再浇”；Beeson 消耗 20～40% 无减产；FAO-56 p=0.5 常用 | 低（推导） |
| substrates | 见正文 | Bilderback 2005 表1–3（树皮）、Evans 1996/Vargas-Tapia 2008（椰糠）、Schabauer 2026 表2（陶粒、珍珠岩、颗粒土）、Argo & Biernbaum 1996（泥炭）、Bilderback 2005 p.750（粗砂）；田园土用 FAO-56 农田值、水苔用泥炭近似 | 树皮/椰糠/陶粒/珍珠岩/颗粒土高；泥炭/粗砂中；田园土/水苔低 |
| headspaceCm | 1～3 cm | 盆口留空的常见做法 | 低 |
| leachingFraction | 0.1～0.2 | 苗圃标准 10～20%（MSU、NCSU），南方苗圃协会建议 15～20% | 高 |

约束自检：每种材料易利用水上限 ≤ 持水量下限（例如颗粒土 0.31 ≤ 0.32）。发布前由 `resolveMvpWateringPolicy` 机器校验。

## 单通道光照参数（合同 2a 节）

| 字段 | 取值 | 依据 | 置信 |
|---|---|---|---|
| luxPerPpfd | 50～58 lux / (μmol·m⁻²·s⁻¹) | Thimijan & Heins 1983：日光约 54 lux 对应 1 μmol/(m²·s)；阴天天空光略偏蓝，取 ±7% 包络 | 中 |
| luxAnchorMinGhiWm2 | 50 W/m² | 低于此值时多为清晨/傍晚或极阴，比例对读数误差和时刻偏差极敏感（推导） | 低 |
| luxUncertainty | 测光仪 ±10%，摄像头估算 ±30% | 消费级照度计标称精度约 ±5～10%；摄像头估算为实验来源，三星散射光初步成果未跨机型验证 | 低 |
| luxAnchorMaxAgeDays | 30 天 | 季节变化下室内外比例相对稳定，但家具、窗帘变化需要定期重测（推导） | 低 |
