# P1 植物身份人工审核采纳结论

> 审核票据：`z8v0kmr9gm`  
> 人工采纳主体：青花植产品负责人  
> 采纳时间：2026-09-20（Asia/Shanghai）  
> 绑定原审核包：`plant-identity-validation-manifest/v1`

## 最终裁决

原审核包的 `113 REUSE_AS_IS + 7 TRANSFORM + 80 QUARANTINE` 不直接批准。人工审核同时核对分类学身份与中文植物名、园艺商品名语义后，改判为：

| 最终处置 | 数量 | 是否立即进入 seed |
|---|---:|---|
| `REUSE_AS_IS` | 99 | 是 |
| `TRANSFORM` | 7 | 是；沿用原审核包已经给出的接受名转换 |
| `TRANSFORM_PENDING` | 4 | 否；必须重新生成 canonical、稳定 ID、`identity_level` 与证据哈希并复核 |
| `QUARANTINE` | 90 | 否 |
| 合计 | 200 | 当前 `seedEligible=106` |

4 条新增转换完成并通过复核后，目标为 `seedEligible=110`、`quarantined=90`。在此之前不得把 4 条待转换记录算入可导入种子。

## 原 7 条转换：批准进入 seed

| source ID | 中文名 | 原名 | 接受名 |
|---:|---|---|---|
| 50 | 散尾葵 | `Dypsis lutescens` | `Chrysalidocarpus lutescens` |
| 67 | 凤眼莲 | `Eichhornia crassipes` | `Pontederia crassipes` |
| 99 | 鹅掌柴 | `Schefflera arboricola` | `Heptapleurum arboricola` |
| 103 | 白脉椒草 | `Peperomia puteolata` | `Peperomia tetragona` |
| 122 | 金琥 | `Echinocactus grusonii` | `Kroenleinia grusonii` |
| 128 | 碰碰香 | `Plectranthus amboinicus` | `Coleus amboinicus` |
| 190 | 豌豆 | `Pisum sativum` | `Lathyrus oleraceus` |

原名必须保留为 synonym 或 legacy alias，不得静默覆盖。

## 从原 REUSE_AS_IS 改为 TRANSFORM_PENDING 的 4 条

| source ID | 中文名 | 原记录 | 待转换 canonical | 身份层级 | 权威依据 |
|---:|---|---|---|---|---|
| 29 | 水仙 | `Narcissus tazetta` | `Narcissus tazetta subsp. chinensis` | subspecies | iPlant / 中国植物志体系、WFO 2026 |
| 73 | 银皇后 | `Aglaonema commutatum` | `Aglaonema commutatum 'Silver Queen'` | cultivar | RHS |
| 98 | 狐尾天门冬 | `Asparagus densiflorus` | `Asparagus densiflorus 'Myersii'` | cultivar | RHS |
| 123 | 绯牡丹 | `Gymnocalycium mihanovichii` | `Gymnocalycium stenopleurum` | species | Kew/WFO 当前接受关系；历史名保留为 alias |

这 4 条不得沿用旧 WCVP ID。后续转换任务必须重新生成稳定 ID、`canonical_identity_name_cn`、`identity_level`、父链与证据哈希，并再次通过机器校验和人工复核。

## 从原 REUSE_AS_IS 改为 QUARANTINE 的 10 条

| source ID | 中文名 / 原学名 | 隔离原因摘要 | 关键依据 |
|---:|---|---|---|
| 79 | 海芋 / `Alocasia macrorrhizos` | `A. macrorrhizos` 与 `A. odora` 的中文名和分类概念存在历史冲突 | [Kew POWO](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A60469948-2) |
| 84 | 冷水花 / `Pilea cadierei` | 规范中文对应存在冲突，不能作为强唯一映射 | [iPlant 深圳植物志](https://www.iplant.cn/fsz/info/Pilea%20cadierei) |
| 87 | 紫露草 / `Tradescantia pallida` | 原中文名不是安全的唯一业务身份名 | [Kew MPNS](https://mpns.science.kew.org/mpns-portal/plantDetail?dbs=wcs&filter=latinKewPrefName%3A%22Tradescantia+pallida+%28Rose%29+D.R.Hunt%22&fuzzy=false&nameType=all&plantId=270389&query=r%2Fmollyflowers) |
| 90 | 鹿角蕨 / `Platycerium bifurcatum` | 中国植物志区分鹿角蕨与二歧鹿角蕨 | [中国植物志](https://www.iplant.cn/frps/pdf/6%282%29/294.PDF) |
| 92 | 铁线蕨 / `Adiantum raddianum` | “铁线蕨”已有其他规范对应，不能强唯一命中 | [Kew POWO](https://powo.science.kew.org/taxon/17012580-1) |
| 102 | 金钻蔓绿绒 / `Philodendron erubescens` | 权威材料仅支持 `Philodendron sp.`，原映射证据不足 | [中国科学院昆明分院](https://kmb.cas.cn/kpyd/201202/t20120216_3441194.html) |
| 114 | 瓦松 / `Orostachys japonica` | 中文规范对应冲突 | [Flora of China / iPlant](https://www.iplant.cn/foc/fam/123226) |
| 124 | 白鸟 / `Mammillaria plumosa` | 权威植物库将该学名对应为“白星”，原映射不能成立 | [台北植物园](https://tpbg.tfri.gov.tw/plants/plants_info.php?rid=415) |
| 169 | 百里香 / `Thymus vulgaris` | 商品身份与中国植物志规范中文身份冲突 | [Kew POWO](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A461765-1) |
| 171 | 鼠尾草 / `Salvia officinalis` | 商品身份与中国植物志规范中文身份冲突 | [Kew POWO](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A456833-1) |

原审核包中的 80 条 `QUARANTINE` 全部保持隔离，因此最终隔离数量为 90。

## 治理规则

- 不新增字段、不重做分类表结构。
- WCVP/WFO 决定 taxon 身份；中国植物志/iPlant 等决定规范中文植物名；RHS/ICRA 决定园艺栽培品种。
- 商品名、俗名、历史名进入 `plant_identity_aliases`；不得反向污染 `canonical_identity_name_cn`。
- 本结论只批准生成本地、未激活的 seed 制品；不授权 CloudBase/CMS 写入，不授权 active release。
- `plant-knowledge` 中依赖 active taxonomy 的路径继续停止；P2 其他领域不受此门禁阻断。

## 来源链接

- WCVP / Kew：https://sftp.kew.org/pub/data-repositories/WCVP/
- iPlant 水仙：https://www.iplant.cn/info/Narcissus%20tazetta%20subsp.%20chinensis?t=z
- RHS 银皇后：https://www.rhs.org.uk/plants/704/aglaonema-commutatum-silver-queen/details
- RHS 狐尾天门冬：https://www.rhs.org.uk/plants/28198/asparagus-densiflorus-myersii/details
- 其余逐条权威来源保留在产品负责人本次提交的完整人工审核结论中；结构化落盘时只保留裁决、来源 URL 和必要摘要，不复制外部正文。
