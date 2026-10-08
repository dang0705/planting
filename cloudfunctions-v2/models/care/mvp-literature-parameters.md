# 浇水模型 MVP 文献参数调研（室内盆栽观叶植物）

> 用途：在没有内部标定数据时，为浇水模型 MVP 提供“有出处的”参数初值。
> 产品负责人已授权用公开文献 / 公开数据标定 MVP。
> 规则：每个数字都标出处（URL + 表/图/页）、测量条件和单位。找不到的写“未找到”，并给出最接近的有出处替代值（proxy）及其局限。
> 标注为“推导”的值是本报告用文献数字算出来的，**不是**文献原值，不得当作合同验收依据。
> 置信度：高 = 同行评审 / 推广机构（extension）的原表数字，且条件接近；中 = 原表数字，但条件差别较大（例如苗圃、混合基质）；低 = 二手引用、厂商资料或本报告推导。
> 调研日期：2026-10-08。

---

## 0. 术语与口径（先读：不同文献的“可用水”定义不同）

| 术语 | 含义 | 出处 |
|---|---|---|
| TP 总孔隙度 | 孔隙体积占基质体积的比例（v/v） | Bilderback et al. 2005, Table 1 脚注 |
| CC 容器持水量 | 饱和后自由排水、停止滴水时的含水量（v/v）。**受容器高度影响**：盆越矮，CC 越高、AS 越低 | Bilderback 2005 Table 1 脚注 y；Purdue HO-287-W p.3 Fig.1 |
| AS / AFP 通气孔隙 | AS = TP − CC | 同上 |
| AW 可用水（Bilderback 口径） | AW = CC − θ(1500 kPa)，即 CC 减去 1500 kPa 吸力下仍残留的水 | Bilderback 2005 Table 1 脚注 y |
| AWC（Schabauer 口径） | 最大持水量 − 永久萎蔫点（PWP 定义为 15 000 hPa，即 1500 kPa） | Schabauer et al. 2026 §2.1 |
| EAW / AFD 易利用水（De Boodt 口径） | 吸力从 1 kPa 升到 5 kPa（10→50 cm 水柱）之间释放出的水 | De Boodt & Verdonck 1972（二手引用，见 §2） |
| WBC / AR 缓冲水（储备水） | 吸力从 5 kPa 升到 10 kPa（50→100 cm 水柱）之间释放出的水 | 同上（二手引用） |
| ATD 总可利用水（西语文献） | EAW + WBC，即 1→10 kPa 之间释放的水 | Vargas-Tapia et al. 2008 |

> 前端类比：AW（Bilderback）相当于“账户总余额”，其中有一部分要付很高的“手续费”（植物要用很大吸力才能取出）；EAW（De Boodt）相当于“免手续费额度”。模型若用“可用水耗掉的比例”做浇水触发，**必须先选定用哪一种口径**。本报告第 2 节和第 9 节都会说明换算关系。

---

## 1. 九种用户可选基质的物理参数

### 1.1 推荐的“好基质”范围（全局约束）

| 来源 | TP | AS | CC | AW | 不可用水 | 置信度 |
|---|---|---|---|---|---|---|
| Bilderback, Warren, Owen, Albano 2005, *HortTechnology* 15(4):747–751，正文 p.748 及 Table 1 "Normal ranges"（转引 Yeager et al. 1997 SNA BMP） | 50–85% | 10–30% | 45–65% | 正文 25–35%（表中 23–35%） | 正文 25–35%（表中 23–35%） | 高（苗圃口径；7.6 cm 高样品环） |
| Abad et al. 1993 “最优值”，转引自 Vargas-Tapia et al. 2008, *Rev. Fitotec. Mex.* 31(4):375–381, Cuadro 4 “Óptimo” 行 | > 85% | 10–30%（CA） | 55–70%（CRA） | EAW 20–30%；储备水 4–10%；ATD 24–40% | — | 中（二手引用 Abad 1993） |
| Purdue HO-287-W（Nemali 2018）p.1 | — | 理想 20–25% | — | — | — | 中 |
| FLL 室内绿化指南（2024），转引自 Schabauer 2026 §4.1 | — | 空气容量 ≥ 15 vol.% | 最大持水量 ≥ 20 vol.% | — | — | 中（矿物基质） |
| Matkin / Perlite Institute（珍珠岩 + 泥炭）| — | “15% to 25%” | — | — | — | 低（行业协会资料） |

- URL：Bilderback 2005 https://www.ars.usda.gov/ARSUserFiles/11847/bilderback_etal_2005_Hort%20Tech%2015(4)%20pp%20747-751.pdf
- URL：Vargas-Tapia 2008 https://www.redalyc.org/pdf/610/61031410.pdf
- URL：Purdue HO-287-W https://www.extension.purdue.edu/extmedia/HO/HO-287-W.pdf
- URL：Schabauer 2026（开放获取）https://repositum.tuwien.at/bitstream/20.500.12708/228198/1/Schabauer-2026-Horticulturae-vor.pdf （DOI 10.3390/horticulturae12040501）
- URL：Perlite Institute https://www.perlite.org/wp-content/uploads/2018/03/perlite-gradation-peat-perlite-mixtures.pdf

**测量条件提醒（高影响）：**
- Bilderback 2005：所有数据都用 3 in（7.6 cm）内径、3 in 高的样品环测得。脚注原文的意思是 AS 和 CC 会随容器高度变化。
- Schabauer 2026：PVC 圆筒，内径 15 cm、高 12 cm，按 FLL 方法测定（24 h 饱和后排水）。所有矿物基质都筛成同一粒径 4–7 mm（浮石另测 1–3 mm 和 7–14 mm）。
- Purdue HO-287-W p.3：perched water zone（盆底滞水层）几乎没有空气；盆越矮，这一层占的比例越大。
- 含义：家用 10–20 cm 高的花盆，大体落在这些测量高度之间。但对很矮的盆或育苗穴盘，CC 会被低估、AS 会被高估。

### 1.2 分材料参数表

> 约定：“v/v”统一写成百分比。除非注明，都是新基质刚装盆时的初始值。

#### (1) 田园土 / 园土 / 壤土（code `general`）

| 指标 | 数值 | 出处 / 条件 | 置信度 |
|---|---|---|---|
| 纯园土装盆后的 CC / AS / TP | **未找到**（没有容器条件下纯矿质壤土的原表） | — | — |
| 替代 1：大田土壤持水 | 粉土 θFC ≈ 0.32、θWP ≈ 0.15；壤质砂土 θFC ≈ 0.15、θWP ≈ 0.06；示例土壤 θFC = 0.23、θWP = 0.10（m³/m³） | FAO-56 Chapter 8, Examples 36–38，https://www.fao.org/4/X0490E/x0490e0e.htm 。Table 19（典型范围表）在网页里显示不出来，未核验 | 中（大田口径，不是盆栽） |
| 替代 2：树皮:土 = 9:1 | TP 74 / AS 15 / CC 59 / AW 33 / 不可用水 26（%vol），Db 0.31 g/cm³ | Bilderback 2005 Table 1（7.6 cm 样品环） | 中（土只占 10%） |
| 推导占位（仅 MVP） | 大田可用水（FC − WP）约 0.09–0.17 m³/m³。装盆后因盆底滞水，CC ≥ 大田 FC，AS 偏低（常常 < 10%） | 推导自上面的 FAO 示例和 Purdue 的滞水层原理 | 低 |

适用限制：园土在盆里容易板结、通气差。物理上这是“CC 高、AS 低、可用水中等”的组合。建议 MVP 把它当成高风险基质（过湿风险高）。

#### (2) 椰糠（code `coco`）

| 指标 | 数值 | 出处 / 条件 | 置信度 |
|---|---|---|---|
| TP | 85.5–89.5%（v/v），5 个菲律宾来源 | Evans, Konduru & Stamps 1996, *HortScience* 31(6):965–967，摘要（AGRIS https://agris.fao.org/search/ar/records/6473582408fd68d546016a22） | 高 |
| AFP（AS） | 9.5–12.6% | 同上 | 高 |
| 充水孔隙（≈ CC） | 73.0–80.0% | 同上 | 高 |
| Db | 0.04–0.08 g/cm³ | 同上 | 高 |
| 7 种墨西哥 / 斯里兰卡椰糠：EPT（TP） | > 92%（92.2–94.9） | Vargas-Tapia 2008 Cuadro 4（De Boodt 水分释放曲线法） | 高 |
| CA（AS） | 12.3–52.6%（随粒径变化很大） | 同上 | 高 |
| CRA（持水量） | 49.5–81.2% | 同上 | 高 |
| EAW（AFD，1–5 kPa） | 17.8–34.6% | 同上 | 高 |
| 储备水（AR，5–10 kPa） | 3.3–13.5% | 同上 | 高 |
| ATD（1–10 kPa） | 21.3–40.3% | 同上 | 高 |
| 难利用水（ADD，> 10 kPa） | 15.8–41.8% | 同上 | 高 |
| 70% 椰糠 + 30% 树皮或珍珠岩，6 in 标准盆 | AS 22%、持水 59%、TP 81% | Argo & Biernbaum 1996, *GrowerTalks* Feb 1996 p.63（NCSU hortscans 扫描件 https://hortscans.ces.ncsu.edu/uploads/c/o/componen_51a50d5fae05b.pdf） | 中（行业杂志，但为 MSU 试验） |

适用限制：产地和粒径造成的变异非常大。Vargas-Tapia 认为粒径的影响大于加工方式。

#### (3) 陶粒 / LECA / 膨胀黏土（code `ceramsite`）

| 指标 | 数值（4–7 mm） | 出处 / 条件 | 置信度 |
|---|---|---|---|
| 体积含水量（最大持水） | 11.04 vol.% | Schabauer 2026 Table 2, No.1（12 cm 高圆筒，FLL 法） | 高 |
| TP（P） | 56.41 vol.% | 同上 | 高 |
| 空气容量（A） | 45.37 vol.% | 同上 | 高 |
| PWP（1500 kPa） | 8.30 vol.% | 同上 | 高 |
| AWC | **2.74 vol.%** | 同上 | 高 |
| 干容重 | 0.67 g/cm³ | 同上 | 高 |
| 参考：膨胀页岩 4–7 mm | θv 12.44 / P 58.24 / A 45.80 / PWP 9.39 / AWC 3.06 | 同上 No.2 | 高 |
| 参考：树皮 + PermaTill（膨胀页岩）70:30 | TP 75 / AS 25 / CC 50 / AW 23 | Bilderback 2005 Table 1 | 中（混合基质） |

适用限制：Schabauer 用 SEM 显示陶粒外壳的孔是封闭的，所以内部大量孔隙“在水力上不起作用”（§4.2.1）。纯陶粒几乎没有可用水，必须高频少量浇水，或依赖盆底储水。

#### (4) 泥炭基混合基质（code `peat`）

| 指标 | 数值 | 出处 / 条件 | 置信度 |
|---|---|---|---|
| 70% 泥炭 + 30% 树皮或珍珠岩，6 in 标准盆 | AS 24%、持水 52%、TP 73% | Argo & Biernbaum 1996 p.63（同上扫描件） | 中 |
| 泥炭 + 珍珠岩（P-P） | 固相 38.6%、孔隙 61.4%；水占孔隙的 62%，空气占孔隙的 38% | Purdue HO-287-W Table 1 | 中（注意：Purdue 表中空气和水是按“占孔隙的比例”表示，不是 v/v） |
| P-P 中被 > 1500 kPa 束缚（不可用）的水 | 约 20% 的水 | Purdue HO-287-W p.4 正文 + Fig.2 | 中 |
| 泥炭 + 树皮 + 珍珠岩 + 蛭石（P-B-P-V） | 孔隙 59.1%；水 72% 孔隙、空气 28% 孔隙；约 10% 的水被 > 1500 kPa 束缚 | 同上 | 中 |
| 树皮:泥炭:稻壳 = 3:2:2 | TP 88 / AS 19 / CC 69 / AW 34 / UAW 35 | Bilderback 2005 Table 1 | 中 |
| 纯泥炭藓泥炭（sphagnum peat） | TP 90–95%、AFP 18–25%、Db 0.07–0.11 g/cm³ | 搜索引擎摘要，来源页可能是 PRO-MIX / PT Horticulture 教程（https://www.pthorticulture.com/en-us/training-center/greenhouse-herb-and-vegetable-production-part-44-growing-media），原页未打开核对 | 低 |
| 其他（未核验） | 泥炭 + 珍珠岩 TP ≈ 93%、空气 20、持水 73；泥炭 + 蛭石 TP ≈ 94%、空气 13、持水 81 | UC ANR 图（https://ucanr.edu/node/101887）返回 403，仅见搜索摘要 | 低 |

适用限制：Purdue p.5 指出，泥炭变干后导水率会骤降（含水从 60% 降到 20% 时，导水率下降 100 倍；da Silva et al. 1993）。所以“彻底干透”后再浇，很多水会直接流走。

#### (5) 珍珠岩（code `perlite`）

| 指标 | 数值 | 出处 / 条件 | 置信度 |
|---|---|---|---|
| 纯珍珠岩 4–7 mm | θv 24.23 / P 91.50 / A 67.27 / PWP 12.43 / **AWC 11.79** vol.%；干容重 0.10 g/cm³ | Schabauer 2026 Table 2, No.6 | 高（粒径偏粗，园艺常用 1–5 mm） |
| 树皮:珍珠岩 = 70:30 | TP 85 / AS 29 / CC 56 / AW 23 / UAW 33 | Bilderback 2005 Table 1 | 中 |
| 75% 珍珠岩 + 25% 泥炭 | 排水后游离孔隙（≈ AS）：细珍珠岩 21%，粗珍珠岩 46.1% | Matkin / Perlite Institute | 低 |

#### (6) 松树皮 / 兰花树皮（code `bark`）

| 指标 | 数值 | 出处 / 条件 | 置信度 |
|---|---|---|---|
| 熟化松树皮，过 1/4 in 筛 | TP 81 / AS 11 / CC 70 / AW 37 / UAW 33（%vol） | Bilderback 2005 Table 1 | 高 |
| 熟化松树皮，过 1/2 in 筛 | TP 84 / AS 19 / CC 65 / AW 33 / UAW 32 | 同上 | 高 |
| 熟化松树皮（Harrelson 2004） | TP 87.3 / AS 25.2 / CC 61.1 / AW 26.3 / UAW 35.8 | Bilderback 2005 Table 2 | 高 |
| 新鲜松树皮 | TP 88.3 / AS 39.3 / CC 49.0 / **AW 9.8** / UAW 39.2 | 同上 | 高 |
| 纯松树皮（Warren & Bilderback 1992） | TP 79.9 / AS 29.2 / CC 50.7 / AW 20.4 / UAW 30.3 | Bilderback 2005 Table 3（arcillite 用量 0 的那一行） | 高 |
| 单组分松树皮推荐 AS | 20–30% | Bilderback 2005 p.749 正文（引 Bilderback & Jones 2001） | 中 |
| 兰花用粗块树皮（> 1/2 in） | **未找到**原表 | 推测 AS 高于 1/2 in 那一档、CC 和 AW 更低（推导，低） | 低 |

#### (7) 水苔 / 水草（code `sphagnum`，指活体或未分解的长纤维水苔）

| 指标 | 数值 | 出处 / 条件 | 置信度 |
|---|---|---|---|
| v/v 的 TP / CC / EAW | **未找到**同行评审原表 | — | — |
| 定性 | 未分解 Sphagnum 的持水量主要由容重决定，压实后大孔减少、持水增加 | Univ. Helsinki，*Sphagnum moss in growing media: water retention and plant performance*（https://researchportal.helsinki.fi/en/publications/sphagnum-moss-in-growing-media-water-retention-and-plant-performa/） | 中（定性） |
| 定性 | 三种 Sphagnum 基质的空气孔隙在 0.2–3.2 kPa 区间变化很大；通气充足时 EAW 偏低 | Turunen et al. 2019, *Vadose Zone J.* 18(1), DOI 10.2136/vzj2019.04.0033（摘要） | 中（定性） |
| 厂商宣称 | 可持水“up to 25 times its own weight”（按重量计，不是 v/v） | Kekkilä-BVB（https://www.kekkila-bvb.com/our-growing-media-25/what-raw-materials-do-we-use/sphagnummoss-in-our-growing-media/） | 低（营销资料） |
| 替代 | 用泥炭藓泥炭（见 (4)）：TP 90–95%、AFP 18–25% | 见 (4) | 低 |

建议：水苔的“松紧”（装填容重）决定一切。MVP 可以按“高 CC、中等 AS”处理，等待用户数据回填。

#### (8) 颗粒土：赤玉土 / 浮石 / 火山岩（code `gritty`）

| 指标（Schabauer 2026 Table 2） | θv（最大持水） | P（TP） | A（空气） | PWP | **AWC** |
|---|---|---|---|---|---|
| 浮石 1–3 mm（No.3） | 32.11 | 76.25 | 44.15 | 10.60 | 21.50 |
| 浮石 4–7 mm（No.4） | 29.86 | 74.19 | 44.33 | 20.33 | 9.52 |
| 浮石 7–14 mm（No.5） | 27.64 | 70.34 | 42.70 | 16.03 | 11.62 |
| 火山岩颗粒 4–7 mm（No.9） | 17.02 | 70.30 | 53.28 | 6.96 | 10.06 |
| 烧结黏土颗粒 4–7 mm（Seramis，No.11；可作赤玉土的近似） | 38.79 | 86.80 | 48.01 | 7.86 | 30.93 |
| 沸石 4–7 mm（No.7） | 20.55 | 56.51 | 35.96 | 2.08 | 18.47 |

- 单位：vol.%。条件：12 cm 高圆筒，FLL 法，23 °C 实验室。
- 赤玉土 / 鹿沼土：**未找到**同行评审的 v/v 数据。只有盆景论坛的非正式测试（例如 1 L 样品的保水量按重量排序：Turface 42 g > 赤玉 32 g > 鹿沼 30 g > 浮石 28 g > 火山岩 22 g），置信度低，不建议采用。
- 适用限制：颗粒都是 4–7 mm 的单一粒径。家用颗粒土常混入 1–3 mm 细颗粒，可用水会更高（浮石 1–3 mm 的 AWC 是 21.5，4–7 mm 只有 9.5）。

#### (9) 粗砂 / 河沙（code `coarse_sand`）

| 指标 | 数值 | 出处 / 条件 | 置信度 |
|---|---|---|---|
| 洗净的建筑用砂（约 56% 颗粒在 2.0–0.5 mm，≤ 10% 颗粒 < 0.2 mm） | AS 约 9%、TP 约 36%，湿重 120 lb/ft³ | Bilderback 2005 p.750（引 Bilderback 1982） | 中 |
| 推导 CC | ≈ TP − AS ≈ 27% | 推导 | 低 |
| 另一来源 | Db 1.6 g/cm³、TP 35%、AFP 7% | 搜索摘要（PT Horticulture 教程），未打开核对 | 低 |
| 树皮:砂 = 80:20 | TP 77 / AS 11 / CC 66 / AW 41 / UAW 25 | Bilderback 2005 Table 1 | 中 |
| 大田砂土（壤质砂土） | θFC ≈ 0.15、θWP ≈ 0.06 | FAO-56 Example 36 | 中（大田口径） |

适用限制：Bilderback 2005 p.750 提醒，细砂（砌墙砂）会填满树皮颗粒之间的孔隙，降低 AS。砂掺进树皮通常会提高 AW、降低 AS。

---

## 2. 浇水触发：可用水耗掉多少再浇（allowable depletion）

| 规则 | 数值 | 出处 | 置信度 |
|---|---|---|---|
| 无土基质 EAW 吸力区间 | 0 到 −100 hPa（−10 kPa），其中大部分自由可用水在 0 到 −50 hPa（−5 kPa） | Frontiers 研究转引 De Boodt & Verdonck 1972 和 Argo 1998（搜索摘要）；原文为 *Acta Hort.* 26:37–44，未直接核验 | 中 |
| 容器 TDR 自动灌溉 | −10 kPa 开始浇，−1 kPa 停止（杜鹃） | ISHS Acta Hort. 633_8（https://ishs.org/ishs-article/633_8/，搜索摘要） | 中 |
| 温室观赏植物传感器阈值 | −5、−3.5、−2 kPa，选在 EAW 到缓冲水之间 | Greenhouse Grower, *Sensor-Based Irrigation for Greenhouse Ornamental Crop Production*（https://www.greenhousegrower.com/?p=180347，搜索摘要） | 中 |
| MAD（管理允许亏缺）苗圃试验 | 以“耗掉可用水的百分比”计（可用水 = 容器持水时重量 − 萎蔫时重量）。木本观赏植物在 MAD 20%（sweet viburnum）、30%（Japanese ligustrum）、40%（Indian hawthorn）时，生长与对照无差异；更高的 MAD 会减慢生长。混栽苗圃建议保守取 20% | Beeson（UF），Garden Center Magazine 转述（https://www.gardencentermag.com/news/fine-tune-irrigation-volume--frequency-to-save-water---part-1-of-2） | 中（木本、户外；二手报道） |
| 作物通用 | RAW = p·TAW；“p = 0.50 是很多作物常用的值”；p 可按 p = p_Table22 + 0.04·(5 − ETc) 修正，限定 0.1 ≤ p ≤ 0.8；暖季草坪 p = 0.50，冷季草坪 0.40 | FAO-56 Chapter 8 Eq.83、Table 22（https://www.fao.org/4/X0490E/x0490e0e.htm） | 中（大田口径） |
| 室内植物运维 | 从表面浇透，“after which the soil should be allowed to dry as much as possible without stressing the plant or allowing it to wilt”（之后让土壤尽量干，但不要让植物受胁迫或萎蔫） | FNGLA FCHP Manual p.478（https://fngla.org/file/157） | 中（定性） |

**口径换算（推导，低-中）：** 以椰糠为例（Vargas-Tapia Cuadro 4），EAW 占 ATD（1–10 kPa）的 17.8/23.4 ≈ 0.76 到 34.6/40.3 ≈ 0.86。也就是说，“吸力到 −5 kPa 就浇”约等于耗掉 1–10 kPa 可用水的 75–85%。但如果改用 Bilderback 的 AW 口径（到 1500 kPa），耗掉的比例会小得多。因此模型的“耗水分数”必须绑定一种口径。

---

## 3. 淋洗分数（Leaching Fraction, LF）与施水量

| 规则 | 数值 | 出处 | 置信度 |
|---|---|---|---|
| 苗圃长期标准 | LF 10–20%，可作为起点 | Michigan State Univ. Extension, *Container Nursery Production*（https://www.canr.msu.edu/christmas_trees/uploads/files/56_Container%20Nursery%20Production%20(1).pdf，搜索摘要） | 中 |
| 测量法 | 盆下集水应约为空盆集水量的 10–20% | NC State Extension, *Managing Drought on Nursery Crops*（https://content.ces.ncsu.edu/managing-drought-on-nursery-crops-1） | 中 |
| SNA BMP | LF 15–20%；分布均匀度（DU）应约 80% | Alabama Extension（https://www.aces.edu/?p=68651，搜索摘要） | 中 |
| 节水研究 | 目标 LF 从 20% 降到 10%，灌水量减少 25%、排水减少 65% | 搜索摘要中转引的研究（UTIA / UF 相关文献），原文未核对 | 低 |
| 试验用值 | Harrelson 2004 的松树皮试验维持 LF = 0.2 | Bilderback 2005 p.749 | 高 |

**公式（定义式，推导）：**
LF = 排出水量 / 施加水量 ⇒ 施加水量 = 净亏缺 / (1 − LF)。
LF = 0.15 时系数为 1.18；LF = 0.20 时为 1.25。
若需要考虑分布不均（苗圃顶喷），常用写法为 毛施水量 = 净亏缺 / [DU × (1 − LF)]，DU ≈ 0.8 来自上表 Alabama 资料。家庭单盆手浇的 DU 接近 1，但这一点**未找到文献**。

**室内适用限制：** FCHP Manual p.479 说明，多数室内绿化场景里，中到重度淋洗“impractical and sometimes impossible”（不现实，有时做不到）；托盘积水不能回渗。MVP 可取 LF 0.10–0.20 作为“浇透”的定义。

---

## 4. 光照响应：k（半饱和常数）与室内观叶植物的补偿点 / 饱和点

| 项 | 数值 | 出处 | 置信度 |
|---|---|---|---|
| 气孔导度或蒸腾对 PPFD 的双曲线半饱和常数 k（L(q) = q/(q+k)） | **未找到**可直接引用的室内观叶植物数值 | — | — |
| Hosta minor（耐阴，韩国） | 光补偿点 17 ± 6.16 µmol m⁻² s⁻¹；光饱和点 200–350 µmol m⁻² s⁻¹；最低需光 10–30 µmol m⁻² s⁻¹（需 4 周低光驯化） | Univ. of Seoul, *Growth responses of Korean endemic Hosta minor under sub-optimal…*（https://pure.uos.ac.kr/en/publications/growth-responses-of-korean-endemic-hosta-minor-under-sub-optimal-/，摘要） | 中 |
| 观叶植物（厂商资料） | 补偿点约 10 µmol；饱和点约 300–500 µmol | Nikki 灯具页（https://www.nikki-tr.com.tw/en/html/plantlights_nlss.html） | 低 |
| 室内观赏植物补光 | 10–50 µmol m⁻² s⁻¹（视品种） | JIRCAS JARQ 33(3):163–176（https://www.jircas.go.jp/sites/default/files/publication/jarq/33-3-163-176_0.pdf，搜索摘要） | 中 |
| Dieffenbachia | 恒定 20/40 µmol 下 CO₂ 同化约 0.2–0.6 µmol CO₂ m⁻² s⁻¹ | ISHS 956_26（https://www.ishs.org/ishs-article/956_26，搜索摘要） | 中 |
| 室内植物需光分级（fc） | 低光：最低 25 fc、偏好 75–200 fc；中光：最低 75–100、偏好 200–500 fc；高光：最低 200、偏好 500–1000 fc。品种表口径：低光 50–100 fc、中光 100–300 fc、高光 > 300 fc | FNGLA FCHP Manual pp.471–472（https://fngla.org/file/157） | 中 |
| fc → PPFD（日光） | 日光换算系数 5.01（示例：2000 µmol 对应 10 020 fc，即 PPFD ≈ fc / 5.01） | Virginia Tech SPES-720 Table 2（https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/spes/spes-720/SPES-720.pdf） | 高 |

**推导 k（低置信度，仅作 MVP 初值）：** 设光饱和点 q_sat 处 L = f，则 k = q_sat·(1 − f)/f。
取 Hosta 的 q_sat = 200–350：
- f = 0.8 时，k ≈ 50–88 µmol m⁻² s⁻¹；
- f = 0.9 时，k ≈ 22–39 µmol m⁻² s⁻¹。

建议 MVP 取 k ≈ 50–100 µmol m⁻² s⁻¹，并标记为待标定。

另：DO3SE / UNECE 臭氧通量模型使用 f_light = 1 − exp(−a·PPFD)，常被引用的 a = 0.006（等效半饱和 ln2/a ≈ 116 µmol）。**这个值来自记忆，未核验，不得引用**。如需使用，请核对 UNECE Mapping Manual Chapter 3（https://www.umweltbundesamt.de/sites/default/files/medien/4038/dokumente/manual_complete_english.pdf）。

---

## 5. 气孔导度对 VPD 的响应（Oren et al. 1999）——已核实

- 文献：Oren R., Sperry J.S., Katul G.G., Pataki D.E., Ewers B.E., Phillips N., Schäfer K.V.R. 1999. Survey and synthesis of intra- and interspecific variation in stomatal sensitivity to vapour pressure deficit. *Plant, Cell and Environment* 22:1515–1526。PDF：https://sperry.biology.utah.edu/publications/PCE99_Oren.pdf
- 函数（摘要与 Eqn 1）：g_s = g_sref − m·lnD。其中 m 是气孔敏感度（= −dg_s/dlnD），g_sref 是 **D = 1 kPa** 时的 g_s（摘要："gsref = gs at D = 1 kPa"）；D 的单位是 kPa（叶面外的水汽压亏缺；叶面上的写作 Ds）。
- 比例关系：叶尺度孔度计数据的 −dg_s/dlnD 对 g_sref 斜率为 **0.60**（Fig.3，r² = 0.92，n = 23）；树液流冠层尺度，湿润区物种的斜率为 **0.59**（Fig.4b，r² = 0.84，n = 31）；摘要中写作 "slope of approximately 0·6"，平均 r² = 0.75。荒漠灌木例外：0.42 和 0.38（p.1521）。
- 理论斜率：水力模型在 ΔD = 1–4 kPa 时得到 0.59；ΔD = 1–3 kPa 时 0.68，1–5 kPa 时 0.53（p.1522，Fig.6a）。
- 隐含零导度点：g_s = 0 出现在 D = e^(b/m)。斜率取 0.6 时，D ≈ e^(1/0.6) ≈ 5.3 kPa（推导）。Fig.3 的 99% 置信线对应 5.1 和 6.1 kPa。论文也指出 Eqn 1 预测 g_s 在接近环境最大 D 时归零，这一点从未被观测到（p.1523）。所以模型应在 D 很大时设下限，不要让导度变负。
- E 与 g·D：论文 p.1523 写明，在最简模型中 g_l·D = E 为常数（叶片完美调节水势时）。一般情况下 E ≈ g·D（边界层导度远大于气孔导度时）。适用于室内低风速时需谨慎（边界层导度偏小）。
- 置信度：**高**。

---

## 6. 基质表面蒸发 vs 植物蒸腾的占比

| 项 | 数值 | 出处 | 置信度 |
|---|---|---|---|
| 360 L 容器（有根团、覆盖或不覆盖）灌溉后头 3 天 | 蒸发约占 4%，其余约 96% 为蒸腾（依据类似的有树研究） | Virginia Tech SPES-750（https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/spes/spes-750/SPES-750.pdf，搜索摘要） | 低（大容器、户外，与室内小盆差别大） |
| 定性 | 表面蒸发是容器失水的重要组成，但蒸腾是主要来源 | 同上 | 中 |
| 室内对照 | 多肉 Sansevieria 的 ET 与“裸基质”无显著差异；Epipremnum 的 ET 最高；30% RH 下所有 ET 都高于 50/70% RH | Univ. of Reading 2024（https://reading-clone.eprints-hosting.org/115288，摘要） | 中 |
| 裸矿物基质蒸发（1500 mL，15 cm 直径，23 °C，风速 0.19 m/s） | 第 0–24 h 平均 1.9–5.6 g/h（30% RH）；50% RH 下例如珍珠岩 4.37、陶粒 3.30、烧结黏土颗粒 4.16 g/h；之后指数衰减（48 h 内衰减 37–66%） | Schabauer 2026 Table A1 | 高（但为饱和起点的裸基质，偏上限） |
| 室内小盆观叶植物的蒸发占比 10–30% | **未找到** | — | — |

**推导提示（低）：** 一个 15 cm 口径的盆，表面积约 0.0177 m²。Schabauer 0–24 h 的数据折合 1.9–5.6 g/h × 24 h ≈ 46–134 g/d，相当于 2.6–7.6 mm/d，这是饱和面加风扇条件下的上限。之后迅速降到 < 1 g/h，因为干表层形成了“蒸发屏障”（§4.3.2）。这说明刚浇完的 1–2 天里蒸发占比可能很高，随后变低。MVP 若需要固定占比，只能作为待标定参数。

---

## 7. 室内参考条件

### 7.1 DLI（日光积分）

| 项 | 数值 | 出处 | 置信度 |
|---|---|---|---|
| 户外（弗吉尼亚） | 7 月 40–45、12 月 15–20 mol m⁻² d⁻¹；"DLI in a residential space could be far lower in most cases"（住宅室内通常低得多） | VT SPES-720 p.4（Faust & Logan 2018 地图） | 高（户外） |
| 温室透光损失 | 30–50% | VT SPES-720 p.5 | 高 |
| 作物推荐 DLI | Impatiens 8–12、Begonia 12–19（温室盆花） | VT SPES-720 Table 3 | 高（不是观叶植物） |
| 室内窗边分区 | 高光：大型南、东、西窗 4 ft 以内；中光：南、东窗 4–8 ft，或无直射的西窗；低光：离窗 > 8 ft，北向即使近窗也常属低光 | FCHP Manual p.471 | 中 |

**推导 DLI（低）：** FCHP 要求在 11:00–13:00 测量，所以它的 fc 值近似一天中的峰值。按 PPFD ≈ fc/5.01（VT 换算），并假设 12 h 光期、正弦日变化（日均值 ≈ 0.637 × 峰值）：DLI ≈ 峰值 PPFD × 0.0275。
- 低光 75–200 fc（15–40 µmol）→ 约 0.4–1.1 mol m⁻² d⁻¹
- 中光 200–500 fc（40–100 µmol）→ 约 1.1–2.8
- 高光 500–1000 fc（100–200 µmol）→ 约 2.8–5.5

MVP 参考值可取窗边中高光约 2–5 mol m⁻² d⁻¹，远离窗户约 0.5–1。

### 7.2 参考 VPD

- 室内推荐 RH 40–60%（Schabauer 2026 §1，引用 [28,29]），属于中置信度二手引用。
- 饱和水汽压 e° = 0.6108·exp(17.27T/(T+237.3))（kPa），来自 FAO-56 Chapter 3 Eq.11（https://www.fao.org/4/X0490E/x0490e07.htm，公式为业内标准，本次未重新打开页面核对）。推导结果：

| T | e° | VPD @ RH 40% | 50% | 60% | 65% |
|---|---|---|---|---|---|
| 22 °C | 2.644 | 1.59 | 1.32 | 1.06 | 0.93 |
| 23 °C | 2.809 | 1.69 | 1.40 | 1.12 | 0.98 |
| 24 °C | 2.984 | 1.79 | 1.49 | 1.19 | 1.04 |

- 结论：在 22–24 °C、RH 40–50% 时，空气 VPD 约 1.3–1.8 kPa，**并不是 ~1 kPa**；约 1 kPa 对应 RH 约 60–65%。建议 MVP 把室内参考 D 取 1.4 kPa（23 °C、50% RH），同时保留 Oren 定义中的 g_ref @ D = 1 kPa。也就是说，参考条件下的导度因子 = 1 − 0.6·ln(1.4) ≈ 0.80（推导）。叶温通常略低于气温，叶-气 VPD 会比空气 VPD 略低。

---

## 8. 室内观叶植物的日耗水量（用于检查 5–14 天浇水间隔）

| 项 | 数值 | 出处 | 置信度 |
|---|---|---|---|
| 英国自然通风办公室（28 m³），Epipremnum / Ficus | 每株每天 ET 35 g（冬）到 68 g（夏）；会议版本写作 35–65 g | Univ. of Reading 2024，*J. Building Engineering*（https://reading-clone.eprints-hosting.org/115288，摘要）；盆径与叶面积未知 | 中 |
| 盆栽观赏植物，运输 / 零售模拟 | 7–91 g pot⁻¹ day⁻¹；RH 70% vs 40%、5 vs 15 °C 时 ET 下降可达 50% | ISHS Acta Hort. 644_39（https://ishs.org/ishs-article/644_39/，页面连接被重置，仅见搜索摘要） | 低-中 |
| 按“mL / L 盆容 / 天”或 mm/d 归一化的室内观叶值 | **未找到** | — | — |

**间隔核对（推导，低）：**
- 15 cm 盆约 1.5–2 L，装泥炭混合基质。按 Bilderback 口径 AW 0.25–0.35 计算，可用水约 375–700 mL。
- 耗掉 50% 时为 190–350 mL；按 35–68 g/d 计，约 3–10 天。
- 冬季、低光、RH 偏高时耗水更低（ISHS 摘要说可降到约一半），间隔会延长到约 6–20 天。
- 结论：**5–14 天的基线间隔与文献量级一致**。

---

## 9. 养护话术与“耗水分数”的对应（新增）

| 话术 | 文献依据 | 建议映射：耗掉的可用水比例（AW 按 Bilderback 口径，即 CC → 1500 kPa） | 置信度 |
|---|---|---|---|
| “表土干了再浇”（surface dry） | UF/IFAS：让表层 1 inch 干再浇（https://ffl.ifas.ufl.edu/resources/ffl-minute-radio/2023-archive/january-2023/watering-and-fertilizing-houseplants）；UNR：表面下 1 inch 变干时浇（https://extension.unr.edu/4h/pub.aspx?PubID=3264）；Arizona：表层几 inch 变干时浇（https://extension.arizona.edu/sites/extension.arizona.edu/files/attachment/IndoorGardening2.pdf）；Illinois：手指探 2 inch（https://extension.illinois.edu/blogs/ilriverhort/2018-01-28-how-water-houseplants） | **0.25–0.35**（推导）。依据：Beeson 的 MAD 20–40% 不影响生长；15 cm 盆的上部 2.5–5 cm 约占体积的 1/5–1/3，且上层先干 | 低 |
| “干湿交替”（dry-wet alternation） | FAO-56：p = 0.5 为常用值；FCHP p.478：浇透后让土尽量干，但不胁迫、不萎蔫 | **≈ 0.50**（推导） | 低-中 |
| “彻底干透再浇”（let dry completely） | Beeson：MAD 60–80% 会减慢生长；FAO-56 p 的上限是 0.8；Espace pour la vie：仙人掌、多肉可以让土更干（https://m.espacepourlavie.ca/node/33500?lang=en）；**未找到**大学推广机构明确说“完全干透” | **0.70–0.85**（推导），不建议超过 0.85。泥炭类基质干透后导水率骤降，会导致回湿困难（Purdue HO-287-W p.5） | 低 |
| 参考：Kansas State | 至少探到 3 inch 深都干再浇（户外容器 / 抬高苗床口径）（https://bookstore.ksre.ksu.edu/download/watering-raised-beds-berms-containers-and-houseplants_MF2805） | 对应约 0.5 以上（推导） | 低 |

**提醒：** 如果模型改用 De Boodt 的 EAW / ATD 口径（1–10 kPa），同一句话术对应的分数会更高（见 §2 的换算）。以上全部是推导映射，需要用户回填数据（称重或观察萎蔫）来标定。

---

## 10. 未找到 / 待补清单

1. 纯田园土、纯水苔、赤玉土、兰花粗树皮在盆栽条件下的 v/v 原表数据。
2. 室内观叶植物气孔导度（或蒸腾）对 PPFD 的半饱和常数 k。
3. 室内小盆的蒸发 / 蒸腾分摊比例（例如 10–30%）。
4. 按盆容归一化的室内观叶耗水率（mL L⁻¹ d⁻¹）。
5. 家庭手浇的施水效率或分布均匀度。
6. 二手引用、未核对原文的：De Boodt & Verdonck 1972 原文、FAO-56 Table 19、UC ANR 图、PT Horticulture 的泥炭 / 砂值、ISHS 644_39 原文。
