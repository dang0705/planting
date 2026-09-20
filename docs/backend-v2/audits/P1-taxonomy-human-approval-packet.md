# P1 分类法人工审核输入包

> 用途：保存产品负责人实施人工裁决时使用的完整 200 条原始审核输入。最终有效裁决、逐条机器可读批准和未激活 seed 分别见 `P1-taxonomy-human-decision-2026-09-20.md`、`P1-taxonomy-human-approval-2026-09-20.json` 与 `taxonomy-approval-2026-09-20/seed-manifest.json`。本文中的 113/7/80 仅是原始代理建议，不是当前准入状态。

## 1. 输入边界与当前裁决

- 代理建议不等于人类批准：以下 REUSE_AS_IS、TRANSFORM、QUARANTINE 仅来自批次审核 JSON 的原始建议。
- 本包覆盖 200 条 legacy source records：113 条 REUSE_AS_IS、7 条 TRANSFORM、80 条 QUARANTINE，合计 113 + 7 + 80 = 200。
- 产品负责人已经完成改判并采纳 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`；当前本地未激活 seed 的 `seedEligible=106`。
- 4 条 `TRANSFORM_PENDING` 在重新生成 canonical、稳定 ID、身份层级、父链和证据哈希并复核前不得进入 seed；active release 继续为 `STOP`。

## 2. 人工批准选项语义与风险

| 选项 | 语义 | 风险与前置条件 |
|---|---|---|
| 批准 REUSE_AS_IS | 接受原始学名作为 WCVP 接受名，使用列出的 WCVP 稳定 ID、科、属和中文名进入候选 seed | 仍可能把遗留中文名/业务身份误当作同一植物；必须核对 WCVP/WFO 双源证据、原始行 SHA 与用户可见中文语义 |
| 批准 TRANSFORM | 以列出的接受名和稳定 ID 作为 canonical，原始学名仅作为异名/来源别名保留 | 学名改名可能影响检索、历史记录和用户认知；必须确认唯一接受目标及原名可追溯关系 |
| 保持 QUARANTINE | 不进入 taxonomy seed，不参与 active release，等待补证或产品身份层 merge/split 裁决 | 暂时无法用于正式业务；但能避免歧义、特殊等级、栽培品种、冲突分类或重复组被错误准入 |
| 批准 QUARANTINE（仅解除隔离） | 仅在补齐所列证据并完成新的人工复核后解除隔离；不代表本包现有建议已获批准 | 不能以本包的代理建议代替补证；不得默认改变 seedEligible 或 active release 状态 |

## 3. REUSE_AS_IS（113 条，待人工逐条批准）

格式：source ID｜中文名｜原学名｜WCVP 稳定 ID｜科｜属。

- 1｜绿萝｜Epipremnum aureum｜WCVP 70476｜Araceae｜Epipremnum
- 2｜生菜｜Lactuca sativa｜WCVP 2912742｜Asteraceae｜Lactuca
- 3｜罗勒｜Ocimum basilicum｜WCVP 136820｜Lamiaceae｜Ocimum
- 5｜香菜｜Coriandrum sativum｜WCVP 2737546｜Apiaceae｜Coriandrum
- 6｜薄荷｜Mentha canadensis｜WCVP 124520｜Lamiaceae｜Mentha
- 8｜橡皮树｜Ficus elastica｜WCVP 2810307｜Moraceae｜Ficus
- 10｜小香葱｜Allium fistulosum｜WCVP 295569｜Amaryllidaceae｜Allium
- 11｜虎皮兰｜Dracaena trifasciata｜WCVP 525228｜Asparagaceae｜Dracaena
- 15｜幸福树｜Radermachera sinica｜WCVP 317294｜Bignoniaceae｜Radermachera
- 16｜金钱树｜Zamioculcas zamiifolia｜WCVP 215525｜Araceae｜Zamioculcas
- 17｜巴西木｜Dracaena fragrans｜WCVP 304662｜Asparagaceae｜Dracaena
- 18｜君子兰｜Clivia miniata｜WCVP 302703｜Amaryllidaceae｜Clivia
- 20｜仙客来｜Cyclamen persicum｜WCVP 2749807｜Primulaceae｜Cyclamen
- 21｜吊兰｜Chlorophytum comosum｜WCVP 302261｜Asparagaceae｜Chlorophytum
- 22｜非洲堇｜Streptocarpus ionanthus｜WCVP 2915120｜Gesneriaceae｜Streptocarpus
- 25｜茉莉花｜Jasminum sambac｜WCVP 351647｜Oleaceae｜Jasminum
- 29｜水仙｜Narcissus tazetta｜WCVP 282289｜Amaryllidaceae｜Narcissus
- 30｜风信子｜Hyacinthus orientalis｜WCVP 278658｜Asparagaceae｜Hyacinthus
- 34｜绣球花｜Hydrangea macrophylla｜WCVP 2855720｜Hydrangeaceae｜Hydrangea
- 35｜杜鹃花｜Rhododendron simsii｜WCVP 2427105｜Ericaceae｜Rhododendron
- 36｜茶花｜Camellia japonica｜WCVP 2694618｜Theaceae｜Camellia
- 37｜蟹爪兰｜Schlumbergera truncata｜WCVP 2486321｜Cactaceae｜Schlumbergera
- 38｜长寿花｜Kalanchoe blossfeldiana｜WCVP 2333913｜Crassulaceae｜Kalanchoe
- 39｜一品红｜Euphorbia pulcherrima｜WCVP 81761｜Euphorbiaceae｜Euphorbia
- 40｜红掌｜Anthurium andraeanum｜WCVP 10633｜Araceae｜Anthurium
- 42｜龟背竹｜Monstera deliciosa｜WCVP 129588｜Araceae｜Monstera
- 43｜马蹄莲｜Zantedeschia aethiopica｜WCVP 215527｜Araceae｜Zantedeschia
- 44｜彩叶芋｜Caladium bicolor｜WCVP 28777｜Araceae｜Caladium
- 48｜琴叶榕｜Ficus lyrata｜WCVP 2811182｜Moraceae｜Ficus
- 51｜棕竹｜Rhapis excelsa｜WCVP 177959｜Arecaceae｜Rhapis
- 52｜发财树｜Pachira aquatica｜WCVP 2412843｜Malvaceae｜Pachira
- 53｜袖珍椰子｜Chamaedorea elegans｜WCVP 37528｜Arecaceae｜Chamaedorea
- 55｜凌霄｜Campsis grandiflora｜WCVP 320344｜Bignoniaceae｜Campsis
- 56｜牵牛花｜Ipomoea nil｜WCVP 481602｜Convolvulaceae｜Ipomoea
- 57｜炮仗花｜Pyrostegia venusta｜WCVP 317830｜Bignoniaceae｜Pyrostegia
- 58｜三角梅｜Bougainvillea spectabilis｜WCVP 2680780｜Nyctaginaceae｜Bougainvillea
- 59｜鸡蛋花｜Plumeria rubra｜WCVP 161631｜Apocynaceae｜Plumeria
- 60｜夹竹桃｜Nerium oleander｜WCVP 135196｜Apocynaceae｜Nerium
- 61｜紫薇｜Lagerstroemia indica｜WCVP 2354050｜Lythraceae｜Lagerstroemia
- 62｜木槿｜Hibiscus syriacus｜WCVP 2850597｜Malvaceae｜Hibiscus
- 64｜木芙蓉｜Hibiscus mutabilis｜WCVP 2850227｜Malvaceae｜Hibiscus
- 71｜白掌｜Spathiphyllum wallisii｜WCVP 193215｜Araceae｜Spathiphyllum
- 73｜银皇后｜Aglaonema commutatum｜WCVP 4614｜Araceae｜Aglaonema
- 74｜黛粉叶｜Dieffenbachia seguine｜WCVP 61779｜Araceae｜Dieffenbachia
- 78｜姬龟背｜Rhaphidophora tetrasperma｜WCVP 177879｜Araceae｜Rhaphidophora
- 79｜海芋｜Alocasia macrorrhizos｜WCVP 6775｜Araceae｜Alocasia
- 80｜滴水观音｜Alocasia odora｜WCVP 6798｜Araceae｜Alocasia
- 83｜网纹草｜Fittonia albivenis｜WCVP 2813190｜Acanthaceae｜Fittonia
- 84｜冷水花｜Pilea cadierei｜WCVP 2546093｜Urticaceae｜Pilea
- 85｜镜面草｜Pilea peperomioides｜WCVP 2546688｜Urticaceae｜Pilea
- 87｜紫露草｜Tradescantia pallida｜WCVP 270389｜Commelinaceae｜Tradescantia
- 88｜文竹｜Asparagus setaceus｜WCVP 275292｜Asparagaceae｜Asparagus
- 90｜鹿角蕨｜Platycerium bifurcatum｜WCVP 3153569｜Polypodiaceae｜Platycerium
- 92｜铁线蕨｜Adiantum raddianum｜WCVP 3144691｜Pteridaceae｜Adiantum
- 93｜孔雀竹芋｜Goeppertia makoyana｜WCVP 494234｜Marantaceae｜Goeppertia
- 94｜青苹果竹芋｜Goeppertia orbifolia｜WCVP 494179｜Marantaceae｜Goeppertia
- 95｜祈祷草｜Maranta leuconeura｜WCVP 253360｜Marantaceae｜Maranta
- 97｜酒瓶兰｜Beaucarnea recurvata｜WCVP 300353｜Asparagaceae｜Beaucarnea
- 98｜狐尾天门冬｜Asparagus densiflorus｜WCVP 275016｜Asparagaceae｜Asparagus
- 100｜福禄桐｜Polyscias fruticosa｜WCVP 162496｜Araliaceae｜Polyscias
- 101｜豆瓣绿｜Peperomia tetraphylla｜WCVP 2558494｜Piperaceae｜Peperomia
- 102｜金钻蔓绿绒｜Philodendron erubescens｜WCVP 151587｜Araceae｜Philodendron
- 105｜卷柏｜Selaginella tamariscina｜WCVP 2902290｜Selaginellaceae｜Selaginella
- 106｜络石｜Trachelospermum jasminoides｜WCVP 207106｜Apocynaceae｜Trachelospermum
- 107｜球兰｜Hoya carnosa｜WCVP 506676｜Apocynaceae｜Hoya
- 110｜乙女心｜Sedum pachyphyllum｜WCVP 2483511｜Crassulaceae｜Sedum
- 111｜胧月｜Graptopetalum paraguayense｜WCVP 2831756｜Crassulaceae｜Graptopetalum
- 113｜条纹十二卷｜Haworthiopsis attenuata｜WCVP 490839｜Asphodelaceae｜Haworthiopsis
- 114｜瓦松｜Orostachys japonica｜WCVP 2387106｜Crassulaceae｜Orostachys
- 115｜长生草｜Sempervivum tectorum｜WCVP 2490030｜Crassulaceae｜Sempervivum
- 116｜吉娃娃｜Echeveria chihuahuaensis｜WCVP 2781089｜Crassulaceae｜Echeveria
- 117｜桃蛋｜Pachyphytum oviferum｜WCVP 2411126｜Crassulaceae｜Pachyphytum
- 118｜玉缀｜Sedum morganianum｜WCVP 2483348｜Crassulaceae｜Sedum
- 120｜量天尺｜Selenicereus undatus｜WCVP 3016262｜Cactaceae｜Selenicereus
- 123｜绯牡丹｜Gymnocalycium mihanovichii｜WCVP 2835702｜Cactaceae｜Gymnocalycium
- 124｜白鸟｜Mammillaria plumosa｜WCVP 2359547｜Cactaceae｜Mammillaria
- 126｜虎刺梅｜Euphorbia milii｜WCVP 80891｜Euphorbiaceae｜Euphorbia
- 129｜不死鸟｜Kalanchoe daigremontiana｜WCVP 2335859｜Crassulaceae｜Kalanchoe
- 130｜落地生根｜Kalanchoe pinnata｜WCVP 2336037｜Crassulaceae｜Kalanchoe
- 134｜长春花｜Catharanthus roseus｜WCVP 35719｜Apocynaceae｜Catharanthus
- 135｜金鱼草｜Antirrhinum majus｜WCVP 2642724｜Plantaginaceae｜Antirrhinum
- 136｜雏菊｜Bellis perennis｜WCVP 2922692｜Asteraceae｜Bellis
- 137｜玛格丽特｜Argyranthemum frutescens｜WCVP 3112191｜Asteraceae｜Argyranthemum
- 138｜金盏花｜Calendula officinalis｜WCVP 2910167｜Asteraceae｜Calendula
- 139｜向日葵｜Helianthus annuus｜WCVP 2910966｜Asteraceae｜Helianthus
- 141｜鸡冠花｜Celosia argentea｜WCVP 2707791｜Amaranthaceae｜Celosia
- 142｜石竹｜Dianthus chinensis｜WCVP 2764027｜Caryophyllaceae｜Dianthus
- 146｜大岩桐｜Sinningia speciosa｜WCVP 2589014｜Gesneriaceae｜Sinningia
- 149｜茑萝｜Ipomoea quamoclit｜WCVP 482262｜Convolvulaceae｜Ipomoea
- 150｜旱金莲｜Tropaeolum majus｜WCVP 2522052｜Tropaeolaceae｜Tropaeolum
- 151｜木香花｜Rosa banksiae｜WCVP 2965732｜Rosaceae｜Rosa
- 158｜大丽花｜Dahlia pinnata｜WCVP 3117675｜Asteraceae｜Dahlia
- 159｜美人蕉｜Canna indica｜WCVP 223906｜Cannaceae｜Canna
- 160｜姜荷花｜Curcuma alismatifolia｜WCVP 235187｜Zingiberaceae｜Curcuma
- 164｜水葱｜Schoenoplectus tabernaemontani｜WCVP 263102｜Cyperaceae｜Schoenoplectus
- 166｜金钱蒲｜Acorus gramineus｜WCVP 2322｜Acoraceae｜Acorus
- 168｜迷迭香｜Salvia rosmarinus｜WCVP 183733｜Lamiaceae｜Salvia
- 169｜百里香｜Thymus vulgaris｜WCVP 205645｜Lamiaceae｜Thymus
- 170｜牛至｜Origanum vulgare｜WCVP 143954｜Lamiaceae｜Origanum
- 171｜鼠尾草｜Salvia officinalis｜WCVP 183353｜Lamiaceae｜Salvia
- 172｜紫苏｜Perilla frutescens｜WCVP 150299｜Lamiaceae｜Perilla
- 175｜细香葱｜Allium schoenoprasum｜WCVP 296525｜Amaryllidaceae｜Allium
- 176｜柠檬香蜂草｜Melissa officinalis｜WCVP 124103｜Lamiaceae｜Melissa
- 178｜芝麻菜｜Eruca vesicaria｜WCVP 2798757｜Brassicaceae｜Eruca
- 185｜黄瓜｜Cucumis sativus｜WCVP 2747062｜Cucurbitaceae｜Cucumis
- 186｜苦瓜｜Momordica charantia｜WCVP 2372864｜Cucurbitaceae｜Momordica
- 187｜丝瓜｜Luffa aegyptiaca｜WCVP 2338901｜Cucurbitaceae｜Luffa
- 188｜南瓜｜Cucurbita moschata｜WCVP 2747174｜Cucurbitaceae｜Cucurbita
- 189｜西葫芦｜Cucurbita pepo｜WCVP 2747186｜Cucurbitaceae｜Cucurbita
- 191｜四季豆｜Phaseolus vulgaris｜WCVP 2538166｜Fabaceae｜Phaseolus
- 193｜秋葵｜Abelmoschus esculentus｜WCVP 2609574｜Malvaceae｜Abelmoschus
- 194｜甜椒｜Capsicum annuum｜WCVP 2698415｜Solanaceae｜Capsicum
- 200｜鹿角海棠｜Oscularia deltoides｜WCVP 2390903｜Aizoaceae｜Oscularia

## 4. TRANSFORM（7 条，待人工逐条批准）

格式：source ID｜中文名｜原名 → 接受名｜WCVP 稳定 ID｜科｜属。原名必须保留为可追溯异名/来源值，不能静默覆盖。

- 50｜散尾葵｜Dypsis lutescens → Chrysalidocarpus lutescens｜WCVP 39866｜Arecaceae｜Chrysalidocarpus
- 67｜凤眼莲｜Eichhornia crassipes → Pontederia crassipes｜WCVP 259467｜Pontederiaceae｜Pontederia
- 99｜鹅掌柴｜Schefflera arboricola → Heptapleurum arboricola｜WCVP 98359｜Araliaceae｜Heptapleurum
- 103｜白脉椒草｜Peperomia puteolata → Peperomia tetragona｜WCVP 2558493｜Piperaceae｜Peperomia
- 122｜金琥｜Echinocactus grusonii → Kroenleinia grusonii｜WCVP 3015166｜Cactaceae｜Kroenleinia
- 128｜碰碰香｜Plectranthus amboinicus → Coleus amboinicus｜WCVP 45846｜Lamiaceae｜Coleus
- 190｜豌豆｜Pisum sativum → Lathyrus oleraceus｜WCVP 2351525｜Fabaceae｜Lathyrus

## 5. QUARANTINE（80 条，按具体原因分组）

以下每组列出该组合原因对应的全部 source IDs；同一 source ID 只出现一次，组合原因按原 JSON 原文保留。

### 1 条：栽培品种缺少 ICRA/RHS 官方登记证据，不能以其基础种的双源 MATCH 代替登记证据。

source IDs：104

### 3 条：本地 WCVP 精确匹配存在歧义，不能确认唯一权威 taxon。；本地 WFO 精确匹配存在歧义，不能完成交叉核对。

source IDs：13, 108, 125

### 1 条：本地 WCVP 没有原始学名的精确匹配。；本地 WFO 没有原始学名的精确匹配，不能完成交叉核对。

source IDs：109

### 9 条：原始学名含 spp.，属于属级商品组，不能映射为单一权威 taxon。

source IDs：19, 28, 31, 41, 54, 63, 66, 112, 156

### 1 条：遗留科 Portulacaceae 与 WCVP 科 Didiereaceae 不一致，因此不能直接准入。

source IDs：119

### 1 条：原始学名属于种下特殊等级；本批规则没有其直接准入所需的单一权威登记证据。；本地 WFO 精确匹配存在歧义，不能完成交叉核对。

source IDs：12

### 3 条：本地 WFO 精确匹配存在歧义，不能完成交叉核对。

source IDs：121, 140, 143

### 1 条：本地 WCVP 与 WFO 的接受名、分类等级、属或科存在冲突，不能择一准入。

source IDs：127

### 2 条：原始学名属于杂交体特殊等级，本批规则禁止直接准入。；本地 WFO 没有原始学名的精确匹配，不能完成交叉核对。；本地 WCVP 状态为 Artificial Hybrid，不是可准入的 Accepted 或可转换的 Synonym。

source IDs：131, 132

### 1 条：原始学名属于杂交体特殊等级，本批规则禁止直接准入。；本地 WFO 没有原始学名的精确匹配，不能完成交叉核对。；本地 WCVP 将原名列为异名但没有唯一接受目标，不能进行异名转换。

source IDs：133

### 1 条：遗留清单标记为重复组 D01_Hydrocotyle_vulgaris；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。；本地 WCVP 精确匹配存在歧义，不能确认唯一权威 taxon。；本地 WFO 精确匹配存在歧义，不能完成交叉核对。

source IDs：14

### 5 条：本地 WFO 精确匹配存在歧义，无法完成双源交叉核对。

source IDs：144, 148, 153, 173, 177

### 1 条：本地 WCVP 状态为 Artificial Hybrid，不属于 Accepted 或 Synonym，不能作为准入依据。；本地 WFO 无精确匹配，无法完成双源交叉核对。；原始学名为杂交体特殊等级；本批规则禁止直接准入。

source IDs：145

### 2 条：本地 WCVP 无精确匹配，缺少 WCVP 证据。；本地 WFO 无精确匹配，无法完成双源交叉核对。

source IDs：147, 161

### 2 条：本地 WCVP 精确匹配存在歧义，无法确认唯一权威 taxon。

source IDs：152, 184

### 5 条：本地 WCVP 精确匹配存在歧义，无法确认唯一权威 taxon。；本地 WFO 精确匹配存在歧义，无法完成双源交叉核对。

source IDs：154, 162, 163, 167, 174

### 1 条：本地 WCVP 无精确匹配，缺少 WCVP 证据。；本地 WFO 无精确匹配，无法完成双源交叉核对。；原始学名为杂交体特殊等级；本批规则禁止直接准入。

source IDs：155

### 1 条：本地 WCVP 状态为 Unplaced，不属于 Accepted 或 Synonym，不能作为准入依据。；本地 WFO 无精确匹配，无法完成双源交叉核对。；原始学名为杂交体特殊等级；本批规则禁止直接准入。

source IDs：157

### 2 条：遗留清单标记为重复组 D02_Nelumbo_nucifera；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。

source IDs：65, 165

### 1 条：本地 WCVP 与 WFO 的接受名、分类等级、属或科存在冲突，不能准入或转换。

source IDs：179

### 1 条：原始学名含种下特殊等级（var./subsp.）；本批规则不能直接准入，原名必须保留。

source IDs：180

### 2 条：本地 WCVP 与 WFO 的接受名、分类等级、属或科存在冲突，不能准入或转换。；原始学名含种下特殊等级（var./subsp.）；本批规则不能直接准入，原名必须保留。；遗留清单标记为重复组 D03_Brassica_rapa_subsp_chinensis；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。

source IDs：181, 182

### 1 条：本地 WCVP 与 WFO 的接受名、分类等级、属或科存在冲突，不能准入或转换。；原始学名含种下特殊等级（var./subsp.）；本批规则不能直接准入，原名必须保留。

source IDs：183

### 1 条：原始学名属于种下或其他特殊等级，本批没有其准入所需的唯一权威登记证据。

source IDs：192

### 1 条：遗留清单标记为重复组 D04_Solanum_lycopersicum_var_cerasiforme；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。；原始学名属于种下或其他特殊等级，本批没有其准入所需的唯一权威登记证据。；本地 WFO 精确匹配存在歧义。

source IDs：195

### 1 条：原始学名属于杂交种特殊等级，本批按规则隔离。

source IDs：196

### 1 条：原始学名包含栽培品种“Variegata”；本批没有其准入所需的 ICRA/RHS 登记证据。；本地 WCVP 与 WFO 的接受名、分类等级、属或科存在冲突。

source IDs：197

### 1 条：原始学名包含栽培品种“Moonshine”；本批没有其准入所需的 ICRA/RHS 登记证据。

source IDs：198

### 1 条：原始学名包含栽培品种“Tricolor”；本批没有其准入所需的 ICRA/RHS 登记证据。

source IDs：199

### 4 条：遗留清单科名与 WCVP 科名不一致或缺失，不能直接准入。

source IDs：23, 24, 26, 27

### 1 条：本地 WCVP 缺少精确匹配。；本地 WFO 缺少精确匹配。

source IDs：32

### 3 条：本地 WFO 精确匹配存在歧义。

source IDs：33, 86, 89

### 4 条：本地 WCVP 精确匹配存在歧义。；本地 WFO 精确匹配存在歧义。

source IDs：4, 7, 49, 81

### 2 条：遗留清单标记为重复组 D05_Syngonium_podophyllum；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。

source IDs：45, 75

### 2 条：遗留清单标记为重复组 D06_Philodendron_hederaceum；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。

source IDs：46, 76

### 1 条：遗留清单标记为重复组 D07_Thaumatophyllum_bipinnatifidum；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。；遗留清单属名与 WCVP 属名不一致或缺失，不能直接准入。

source IDs：47

### 1 条：遗留清单标记为重复组 D01_Hydrocotyle_vulgaris；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。；本地 WCVP 精确匹配存在歧义。；本地 WFO 精确匹配存在歧义。

source IDs：68

### 1 条：原始学名属于 variety 特殊等级；本批没有其准入所需的唯一权威登记证据。；遗留清单标记为重复组 D04_Solanum_lycopersicum_var_cerasiforme；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。；本地 WFO 精确匹配存在歧义。

source IDs：69

### 1 条：原始学名属于 variety 特殊等级；本批没有其准入所需的唯一权威登记证据。；本地 WFO 精确匹配存在歧义。

source IDs：70

### 2 条：遗留清单标记为重复组 D08_Aglaonema_modestum；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。

source IDs：9, 72

### 1 条：遗留清单标记为重复组 D07_Thaumatophyllum_bipinnatifidum；按规则不得仅凭名称合并，留待产品身份层 merge/split 裁决。

source IDs：77

### 1 条：本地 WCVP 状态为 Illegitimate，不是可准入的 Accepted 或可转换的 Synonym。

source IDs：82

### 2 条：本地 WCVP 与 WFO 的接受名、分类等级、属或科存在冲突。

source IDs：91, 96

## 6. 批准记录要求

产品负责人完成核阅后，应在 ClickUp "z8v0kmr9gm" 明确记录：批准选项（按 source ID）、批准人、批准时间、证据版本/哈希、补充约束及是否允许进入 seed。没有该人工记录时，本包不产生批准效力。任何部分批准都不得推导为其余条目的批准。

## 7. 核对结果

- REUSE_AS_IS：113 条。
- TRANSFORM：7 条。
- QUARANTINE：80 条。
- 总数：113 + 7 + 80 = 200 条。
- admission manifest 当前状态：admitted=0、quarantined=200、seedEligible=0、active release STOP。
