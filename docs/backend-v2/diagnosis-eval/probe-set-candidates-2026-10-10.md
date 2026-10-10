# 视觉诊断探针集候选清单（2026-10-10）

> **状态：候选清单，未下载。** 按用户 2026-10-10 裁定：先列清单，下载需主代理/用户确认后执行。
> 用途：评测方案 R0 探针（30 个案例），用于实测 token、缓存命中、JSON 合法率和参数兼容性，并做首轮定性检查。**不用于验收统计。**
> 规划：`docs/backend-v2/architecture/visual-diagnosis-plan-2026-10-10.md` §7。病因编号见 `cloudfunctions-v2/models/diagnosis/visual-diagnosis-prompt.v1.draft.md`【4】。

## 1. 检索方法与许可口径

- **来源**：只用 Wikimedia Commons。2026-10-10 通过 MediaWiki API（`action=query&generator=search&prop=imageinfo&iiprop=url|size|mime|extmetadata`）只读取元数据，**没有下载任何图片**。作者、许可证、尺寸、字节数都取自 API 返回的 `extmetadata` 和 `imageinfo`。
- **许可筛选**：只保留 CC0、Public domain、CC BY *、CC BY-SA *。这几类都允许商用和研究用途，CC BY 和 CC BY-SA 要求署名；CC BY-SA 还要求「演绎作品以相同许可共享」。我们只在内部做离线评测，不再分发图片或其改编版，因此不触发相同方式共享的义务。如果将来要在产品里展示这些图（例如做示例图），需要另行评估。
- **未纳入的来源**：PlantVillage（Mendeley 上的 Hughes & Salathé 数据集，标注为 CC BY 4.0）和 PlantDoc（GitHub，CC BY 4.0）这次没有逐张核验。PlantDoc 的图片是从网络抓取的，原图版权链条不清楚，**不建议用于商用相关评测**；PlantVillage 是实验室纯色背景，与用户实拍差距大。二者暂不纳入探针集，作为 S2 正式评测集的候选来源，届时另行核验。
- **下载前必须逐张复核**：打开说明页，确认许可证模板与 API 返回一致、没有附加的「人格权/商标」限制，确认画面内容与标注一致；下载记录需保存说明页 URL、许可证、作者署名文本和下载日期。
- **标注口径**：「标注病因编号」只依据说明页的描述和分类，**属于候选标注**，必须两人独立复核看图后确认；描述和画面不一致的，按难例处理或替换。

## 2. 类别分布（30 个）

虫害 6、真菌 5、细菌 2、病毒 1、线虫 1、生理性 3、环境性 3、营养 2、药害/肥害 1、根部 2、非问题 2、非植物 1、多病并存 1。

覆盖的 11 大类中，这次没有虫害里的潜叶蝇、蕈蚊、咀嚼式害虫，以及真菌里的炭疽和霜霉；S2 正式评测集要补齐。

## 3. 候选清单

| # | 槽位 | 文件名 | 来源页 | 作者 | 许可证 | 大小 | 标注病因编号 | 标注依据（说明页） | 评测关注点 |
|---|---|---|---|---|---|---|---|---|---|
| 01 | pest_spider_mite | `Mit Wasser benetzt.png` | [说明页](https://commons.wikimedia.org/wiki/File:Mit_Wasser_benetzt.png) | Ohm Raumzeit | CC BY-SA 4.0 | 18.6 MB，4302×2420 | `pest_spider_mite` | 说明页描述为叶螨在植物上结网；可见网丝（fine_webbing） | 直判标记 fine_webbing；单靠网丝需配合针点才算直判组合，期望把握 possible～likely |
| 02 | pest_thrips | `Chili thrips damage on Hydrangea macrophylla.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Chili_thrips_damage_on_Hydrangea_macrophylla.jpg) | m.borden | CC BY-SA 2.0 | 2.5 MB，3024×4032 | `pest_thrips` | 说明页：绣球上的辣椒蓟马（chili thrips）危害样本 | 期望识别危害痕迹；未必可见虫体，期望 possible |
| 03 | pest_whitefly | `CSIRO ScienceImage 1359 Silverleaf whitefly Bemisia tabaci biotype B.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:CSIRO_ScienceImage_1359_Silverleaf_whitefly_Bemisia_tabaci_biotype_B.jpg) | Entomology, CSIRO | CC BY 3.0 | 3.1 MB，2000×2627 | `pest_whitefly` | CSIRO：烟粉虱成虫位于叶背 | 直判标记 white_flies；期望 likely |
| 04 | pest_aphid | `Aphid infestation rose bush. Southern California.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Aphid_infestation_rose_bush._Southern_California.jpg) | Sabalo22 | CC0 | 1.0 MB，3239×3156 | `pest_aphid` | 说明页：月季蚜虫侵染 | 直判标记 aphids_visible；期望 likely |
| 05 | pest_mealybug | `Mealybugs on Phalaenopsis 20080203.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Mealybugs_on_Phalaenopsis_20080203.jpg) | Wolfgang H. Wögerer, Wien | CC BY 3.0 | 0.3 MB，2201×1512 | `pest_mealybug` | 说明页：蝴蝶兰上的粉蚧 | 直判标记 visible_mealybug_colony；室内花卉，贴近目标用户 |
| 06 | pest_scale_insect | `Coccus hesperidum01.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Coccus_hesperidum01.jpg) | Whitney Cranshaw, Colorado State University, United States, Bugwood.org | CC BY 3.0 us | 1.7 MB，3072×2048 | `pest_scale_insect` | 说明页：软蚧（Coccus hesperidum）多个虫态及蜜露，寄主为榕属 | 直判标记 scale_shells；可能同时出现蜜露 |
| 07 | fungal_powdery_mildew | `Powdery mildew 9.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Powdery_mildew_9.jpg) | Dmitry Brant | CC BY-SA 4.0 | 15.0 MB，6000×4000 | `fungal_powdery_mildew` | 说明页：南瓜叶白粉病 | 直判标记 powder_white；期望 likely |
| 08 | fungal_leaf_spot | `Tomato septoria leaf spot 3006.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Tomato_septoria_leaf_spot_3006.jpg) | Wolan268 | CC0 | 4.2 MB，3840×2160 | `fungal_leaf_spot` | 说明页：番茄叶上的 Septoria 叶斑病 | 可食用作物；检查安全间隔期提示 |
| 09 | fungal_rust | `Phragmidium mucronatum on Rosa in Dnipro by baby-bear.org.jpg 02.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Phragmidium_mucronatum_on_Rosa_in_Dnipro_by_baby-bear.org.jpg_02.jpg) | Natalka Ukraine (baby-bear.org) | CC BY 4.0 | 0.3 MB，1200×1600 | `fungal_rust` | 说明页：月季叶背的 Phragmidium mucronatum（锈病） | 直判标记 rust_pustules；图为系列中的第 2 张 |
| 10 | fungal_gray_mold | `Basilikum Botrytis cinerea Topfpflanze-2-JS.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Basilikum_Botrytis_cinerea_Topfpflanze-2-JS.jpg) | Schlaghecken Josef | CC BY-SA 4.0 | 1.4 MB，3394×2574 | `fungal_gray_mold` | 说明页：盆栽罗勒枝条被灰葡萄孢（Botrytis cinerea）破坏，可见灰霉 | 直判标记 gray_fuzzy_mold；可食用香草 |
| 11 | fungal_sooty_mold | `Sooty mold Schefflera 1.JPG` | [说明页](https://commons.wikimedia.org/wiki/File:Sooty_mold_Schefflera_1.JPG) | Amnon Shavit | CC BY-SA 3.0 | 0.6 MB，1600×1200 | `fungal_sooty_mold` | 说明页：鹅掌藤叶片煤污病 | 期望同时提示排查蜜露类害虫 |
| 12 | bacterial_leaf_spot | `Hibiscus Bacterial leaf spot (17912751016).jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Hibiscus_Bacterial_leaf_spot_(17912751016).jpg) | Scot Nelson | CC0 | 10.1 MB，3648×4864 | `bacterial_leaf_spot` | 说明页：扶桑细菌性叶斑，病原 Pseudomonas cichorii | 文件约 10.6 MB；评测时需按 max_pixels 缩放 |
| 13 | bacterial_soft_rot | `Kale Bacterial soft rot of stem (39935058221).jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Kale_Bacterial_soft_rot_of_stem_(39935058221).jpg) | Scot Nelson | CC0 | 2.2 MB，4199×3145 | `bacterial_soft_rot` | 说明页：羽衣甘蓝茎细菌性软腐，病原 Erwinia carotovora | 可食用作物 |
| 14 | viral_mosaic | `Yellow Mosaic Virus on yellow squash leaf.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Yellow_Mosaic_Virus_on_yellow_squash_leaf.jpg) | Babahu | CC0 | 0.2 MB，1698×1722 | `viral_mosaic` | 说明页：西葫芦黄花叶病毒 | 期望不推荐药剂治疗病毒，建议隔离/淘汰 |
| 15 | nematode_root_knot | `Meloidogyne sp. on Cucumis sativus.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Meloidogyne_sp._on_Cucumis_sativus.jpg) | Scot Nelson | CC0 | 1.6 MB，2560×1920 | `nematode_root_knot` | 说明页：黄瓜根上的根结线虫 | 根部照片；检查模型是否只在拍到根时给出线虫 |
| 16 | physio_edema | `Edema on a Ficus lyrata leaf.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Edema_on_a_Ficus_lyrata_leaf.jpg) | BezierBaby | CC BY-SA 4.0 | 3.6 MB，3024×4032 | `physio_edema` | 说明页：琴叶榕叶片水肿 | 室内观叶；与介壳虫、锈病的鉴别 |
| 17 | physio_low_light | `Etiolation in Hedera helix & a normal section.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Etiolation_in_Hedera_helix_%26_a_normal_section.jpg) | Rosser1954 | CC BY-SA 4.0 | 7.1 MB，4608×2596 | `physio_low_light` | 说明页：常春藤在黑暗中徒长的枝段与正常枝段对比 | 图中同时有正常与徒长两段 |
| 18 | physio_underwatering | `Gurken Kälteschaden bei 9°C, Josef Schlaghecken.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Gurken_K%C3%A4lteschaden_bei_9%C2%B0C,_Josef_Schlaghecken.jpg) | Schlaghecken Josef | CC BY-SA 4.0 | 4.7 MB，4608×3456 | `physio_underwatering` | 说明页描述为黄瓜缺水萎蔫，但文件名写「9°C 冷害」 | **标注冲突**：下载前须人工复核，冲突不能消除时替换为备选或改标 env_cold_damage 作为难例 |
| 19 | env_sunburn | `Sunburnt rubber plant leaf aug 21.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Sunburnt_rubber_plant_leaf_aug_21.jpg) | Secretlondon | CC BY-SA 4.0 | 3.4 MB，3024×4032 | `env_sunburn` | 说明页：橡皮树日灼 | 室内观叶；与炭疽、叶斑的鉴别 |
| 20 | env_cold_damage | `Rosenkohl nach -9°C Frost-Josef Schlaghecken.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Rosenkohl_nach_-9%C2%B0C_Frost-Josef_Schlaghecken.jpg) | Schlaghecken Josef | CC BY 4.0 | 5.8 MB，4624×2604 | `env_cold_damage` | 说明页：抱子甘蓝经 -9°C 霜冻后幼叶受损 | 可食用作物 |
| 21 | env_mechanical_damage | `Starr-110502-5417-Solanum melongena-leaves with hail damage-Hawea Pl Olinda-Maui (24467751583).jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Starr-110502-5417-Solanum_melongena-leaves_with_hail_damage-Hawea_Pl_Olinda-Maui_(24467751583).jpg) | Forest and Kim Starr | CC BY 3.0 us | 4.0 MB，3648×2736 | `env_mechanical_damage` | 说明页：茄子叶片冰雹伤 | 期望不推荐药剂 |
| 22 | nutrient_iron_deficiency | `Chlorose ferrique sur Citrus aurantium.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Chlorose_ferrique_sur_Citrus_aurantium.jpg) | Eiku en exil | CC BY-SA 4.0 | 1.4 MB，2304×4096 | `nutrient_iron_deficiency` | 说明页：酸橙缺铁黄化 | 叶脉间黄化、叶脉保持绿色 |
| 23 | nutrient_nitrogen_deficiency | `Phaseolus vulgaris nitrogen deficiency.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Phaseolus_vulgaris_nitrogen_deficiency.jpg) | Rasbak | CC BY-SA 3.0 | 3.3 MB，2448×3264 | `nutrient_nitrogen_deficiency` | 说明页：菜豆缺氮 | 与正常老化、浇水过多的鉴别 |
| 24 | chem_fertilizer_burn | `Blueberry nitrogen burn.JPG` | [说明页](https://commons.wikimedia.org/wiki/File:Blueberry_nitrogen_burn.JPG) | Cityside189 | CC BY-SA 4.0 | 2.4 MB，2448×3264 | `chem_fertilizer_burn` | 说明页：高丛蓝莓施氮过量（肥害） | 可食用作物 |
| 25 | root_rot | `Root rot awa.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Root_rot_awa.jpg) | Scot Nelson | CC0 | 5.4 MB，2848×4252 | `root_rot` | 说明页：卡瓦胡椒幼株因 Pythium 根腐而萎蔫 | 图中只有地上部萎蔫：期望把握不高于 possible，并要求补拍根部（测试保守性） |
| 26 | root_bound | `Root-bound Chlorophytum comosum.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Root-bound_Chlorophytum_comosum.jpg) | Keith Williamson | CC BY 2.0 | 2.0 MB，2341×3161 | `root_bound` | 说明页：吊兰根团盘结、亟需换盆 | 根部照片 |
| 27 | none_healthy | `A close-up image of an Oyster Plants.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:A_close-up_image_of_an_Oyster_Plants.jpg) | Bim24 | CC0 | 0.1 MB，2000×1128 | `none_no_obvious_problem` | 说明页：紫背万年青（Tradescantia spathacea）观赏植株近景，未提及病害 | 期望不给处置；需人工确认画面无病斑 |
| 28 | none_variegation | `Fittonia TP2.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Fittonia_TP2.jpg) | Tangopaso | Public domain | 1.7 MB，4416×3312 | `none_natural_variegation` | 说明页：网纹草叶片（品种天然网纹） | 容易被误判为病毒花叶或缺素 |
| 29 | not_plant | `Orange Tabby Cat sitting on a couch.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Orange_Tabby_Cat_sitting_on_a_couch.jpg) | LauraDelga | CC BY 4.0 | 4.8 MB，6000×4000 | `（无，期望 not_plant）` | 说明页：坐在沙发上的橘猫 | 期望 not_plant，不出候选，不扣额度 |
| 30 | multi_aphid_sooty | `Auberginen Blattläuse-Rußtau-1-DLR-NW-Jochen Kreiselmaier.jpg` | [说明页](https://commons.wikimedia.org/wiki/File:Auberginen_Blattl%C3%A4use-Ru%C3%9Ftau-1-DLR-NW-Jochen_Kreiselmaier.jpg) | Jochen Kreiselmaier, Pflanzenschutzberater am Dienstleistungszentrum Ländlicher  | CC BY 4.0 | 1.2 MB，2560×1920 | `pest_aphid + fungal_sooty_mold` | 说明页：茄子上昆虫（蚜虫、粉虱等）排泄物诱发煤污病 | 多病并存：期望 multiple_problems，首选害虫或煤污均算命中，需人工确认害虫种类 |

## 4. 已知问题与下一步

1. **#18 标注冲突**：文件名写「9°C 冷害」，说明页却写「缺水萎蔫」。下载前必须人工确认；如果无法确定，改作难例，或用另一张明确是缺水的图替换。
2. **#01、#07 原图较大**（18.6 MB、15.0 MB）：下载后先在本地缩放到 1024×1024 像素以内再上传到临时存储，模型请求里再设 `max_pixels`。
3. **全是单图案例**：多图（2～3 张）案例需要从同一作者、同一植株的系列图组合（例如 #09 是同系列中的第 2 张，#02 绣球系列也有多张），在 S2 中补充。
4. **场景偏差**：一半左右是农作物或户外植物，与「家庭盆栽」的目标场景有差距。正式评测集需要补充室内盆栽实拍（自拍并由专家标注，或使用经授权的用户图片）。
5. **获取方式**：确认后由主代理统一下载到本地评测目录（不进仓库，图片目录加入 `.gitignore`），通过 HTTPS 临时 URL 供模型读取。评测结束后按保留期策略删除。
