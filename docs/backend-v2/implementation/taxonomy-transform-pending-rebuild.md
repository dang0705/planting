# P1 四条待转换植物身份重建

## 目标与当前门禁

产品负责人已批准 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`。本任务只处理来源记录 29、73、98、123；在每条记录完成重建、机器校验和人工复核前：

- 当前未激活种子保持 `seedEligible=106`；
- 四条记录保持 `TRANSFORM_PENDING`，不得进入 seed；
- active release 保持 `STOP`；
- 不修改已经批准的 106 条记录，也不解除 90 条隔离记录。

## 四条独立待裁决候选

下列号码是旧目录首列的 `sourceRecordId`，不是物理行号。Tropicals 的分类名和俗名只提供候选关联；同名结果必须分别保留。`taxon_rank` 与分类学名称不一致时不得照抄，应由对应版本的权威记录核实等级。

| 来源记录 | Tropicals 与旧记录中的候选 | 应核实的等级 | 最小处理规则 |
|---:|---|---|---|
| 29 水仙 | 旧学名 `Narcissus tazetta`；俗名“水仙”命中 `Narcissus sp.`；“中国水仙”命中 `Narcissus tazetta subsp. chinensis` | `N. tazetta` 为种；`Narcissus sp.` 只表明 Narcissus 属内具体种未定；`subsp. chinensis` 为亚种，即使 Tropicals 标为 `species` 也不能照录 | 分开保存三个候选；“水仙”不能自动改成“中国水仙”亚种。仅在负责人选定具体业务身份并补齐亚种证据后，才可建立到该亚种的映射。 |
| 73 银皇后 | “银皇后”分别命中 `Aglaonema commutatum` 和 `Aglaonema sp. 'Silver Queen'` | 前者为种；后者是属级园艺栽培品种候选，分类登记和亲本关系待核 | 不把栽培品种挂到单一 `A. commutatum` 父种。将多亲本杂交证据作为候选关系逐项核验；取得适用栽培品种登记证据并完成名称裁决前不准入。 |
| 98 狐尾天门冬 | 旧学名 `Asparagus densiflorus`；同一中文俗名还命中 `A. densiflorus 'Myersii'`、`A. densiflorus`、`A. alopecurus`、`A. vulpicaudatus` | `Myersii` 为栽培品种候选；其余为不同种候选。各等级须按权威记录核实，不采信与名称冲突的 `taxon_rank` | 四个候选保持分立。旧学名只支持 `A. densiflorus` 种级候选，不能据俗名将它升级为 `Myersii`。RHS 的 `Accepted` 或 AGM 荣誉不是栽培品种登记。 |
| 123 绯牡丹 | 旧学名 `Gymnocalycium mihanovichii`；“绯牡丹”命中 `G. mihanovichii var. friedrichii` 和 `G. mihanovichii 'Hibotan'`；`G. stenopleurum` 是另一独立分类记录 | 旧学名和 `G. stenopleurum` 均为种候选；`var. friedrichii` 为变种候选；`'Hibotan'` 为栽培品种候选 | 不把“绯牡丹”自动映射到任一变种、栽培品种或 `G. stenopleurum`，也不把后者设为 `G. mihanovichii` 的同义名。负责人须先确认源记录表达的业务身份。 |

## 每条记录必须完成的原子步骤

1. 对拟准入的具体分类单元或栽培品种获取真实的 `(authority_source, authority_taxon_id)`。该组合才是权威身份键；禁止复用旧 WCVP ID、中文名、URL、访问时间或历史 SHA-1。候选名称和俗名不能代替身份裁决。
2. 保存权威来源原始响应制品，并记录 `raw_artifact_ref`、原始字节 SHA-256、来源版本、抓取时间和具体记录 URL。访问时间不能代替来源版本。
3. 按权威制品逐边保存可核实的分类父链。物种、亚种和变种按其真实等级记录；栽培品种或杂交栽培品种按登记证据记录其父本，支持多个亲本时保存全部亲本，不得从名称推定单一父本。所需关系缺证时，该条继续隔离。
4. 分开记录分类实体、栽培品种身份、来源证据、人工裁决、产品身份关系及名称关系；同名俗名只能形成候选边，不能替代分类或产品身份关联。
5. 生成新的不透明公开引用。公开引用不能由旧记录 ID 或可猜测序号构造；权威身份仍以新的 authority key 为准。
6. 执行机器校验：唯一键、等级、父链、accepted/synonym 状态、证据哈希、隔离读、seed 准入和 active release 负向检查。
7. 人工复核中文规范展示名、跨来源冲突、历史名或商品名关系。每条记录独立完成后才可从 `TRANSFORM_PENDING` 改为 `TRANSFORM`；其他待裁决记录保持原状态。

## 分记录规则

### 29 水仙

- 旧源记录同时包含“水仙”和 `Narcissus tazetta`；当前 Tropicals 中“水仙”是属内未定种候选，“中国水仙”才对应 `N. tazetta subsp. chinensis`。三种字符串/实体关系必须分别保留，不能同名自动合并。
- 若负责人选择亚种作为产品身份，WCVP 候选稳定标识为 `310501`，WFO 交叉核对候选为 `wfo-0000771854`；待固化的链为 Amaryllidaceae → Narcissus → `N. tazetta` → `N. tazetta subsp. chinensis`。`N. tazetta` 是父种，不是该亚种的同义名。
- iPlant/中国植物志只用于中文名称与中国分类语义核对；需保存版本化权威制品、父边证据和新稳定引用。由负责人决定规范展示名采用“水仙”还是“中国水仙”，以及另一名称是否作为有证据的别名。
- 在具体身份与中文名裁决完成前，source ID 29 保持 `TRANSFORM_PENDING`，不得进入 seed。

### 73 银皇后

- Tropicals 将“银皇后”关联到种 `Aglaonema commutatum`，也关联到 `Aglaonema sp. 'Silver Queen'` 园艺栽培品种候选；这是两个不同候选，不能因共用中文名而合并。
- 将 `Silver Queen` 暂记为属级栽培品种身份候选，不预设 `A. commutatum` 为其唯一父种。Chen 等 2004 年研究提出的亲本组合 `A. commutatum 'Treubii' × A. nitidum 'Curtisii'` 仅作为多亲本来源证据候选，须与登记记录及其版本核对；不得压成单一 `cultivar_parent`。
- RHS profile 704 将该名称标为 `Synonym`，不是栽培品种登记证明。`Aglaonema` 的登记机构为 IAS；需取得该栽培品种的精确登记记录、稳定标识、状态及父本证据。未查到记录不能推断其不存在。缺少登记证据时，不得以 RHS 页面或共同俗名替代。
- 负责人须确认是否将 `Silver Queen` 作为独立园艺身份、采用何种父本表达，以及“银皇后”等中文名称的展示和别名关系。完成前 source ID 73 保持 `TRANSFORM_PENDING`。

### 98 狐尾天门冬

- Tropicals 中“狐尾天门冬”对应 `A. densiflorus 'Myersii'`、`A. densiflorus`、`A. alopecurus` 和 `A. vulpicaudatus` 四个独立候选。旧记录的 `A. densiflorus` 不足以证明它指向其中的栽培品种。
- RHS profile 28198 将 `A. densiflorus 'Myersii'` 标为 `Accepted`，2024 AGM 清单也列有该名称；这能支持名称用法和园艺认可，不等同 ICRA 登记。当前公开 ICRA 清单未列 `Asparagus`，但这不能证明不存在其他登记或历史记录。
- 准入前须取得适用登记机构的版本化记录；若无适用 ICRA，须先由负责人批准一套可复用的替代证据规则，再依该规则固化 RHS 来源、独立佐证和正确的分类父项。不得为 source ID 98 单独豁免。
- 负责人须裁决“狐尾天门冬”规范展示名及别名关系，并明确 source ID 98 对应上述哪一候选。完成前该条保持 `TRANSFORM_PENDING`。

### 123 绯牡丹

- 旧源学名 `G. mihanovichii` 是种级候选；Tropicals 的“绯牡丹”另关联变种 `G. mihanovichii var. friedrichii` 与栽培品种 `G. mihanovichii 'Hibotan'`。这些候选不得合并，中文俗名不能判定产品实际指向哪一个。
- `G. stenopleurum` 是独立种级记录，不能仅凭“绯牡丹”名称或旧审批目标映射到 source ID 123。WCVP 2026-06 将 `G. mihanovichii`（`2835702`）和 `G. stenopleurum`（`2835856`）分别列为接受种；WFO 对相关名称的关系不同。现有材料不证明 `G. mihanovichii` 本种是 `G. stenopleurum` 的同义名。
- 只有针对具体分类实体、来源版本和本种级关系的直接证据，才能建立接受名/同义名关系；某个下位变种的关系不能外推到整个种。分别保存各候选的稳定标识、父链和证据，不建立未经证明的 synonym 边。
- 产品负责人必须确认 source ID 123 表示原种、变种、栽培品种或园艺商品组合，或决定继续不映射；并单独裁决中文规范展示名。完成前该条保持 `TRANSFORM_PENDING`。

## 现有字段映射与禁止事项

- 本轮不新增数据库字段。`canonical_identity_name_cn` 的业务语义映射到 `plant_identities.display_name_zh`，仅表示产品规范中文展示名，不是分类唯一键。
- `identity_level` 映射到 `plant_taxa.taxon_rank`；等级按核验后的分类学来源填写，不能照抄错误的 Tropicals `taxon_rank`。栽培品种还要求 `plant_identities.identity_kind=cultivar`；杂交栽培品种须按已核实证据记录多个亲本关系。
- `public_taxon_ref` 与 `public_identity_ref` 是对外不透明引用，不等于权威分类稳定标识。
- 商品名、俗名、历史名进入独立名称/别名记录；仅经审核的来源关系可将名称连到身份。不得污染规范分类名或据字符串相同自动合并。
- 禁止根据中文名、旧记录 ID、旧 WCVP ID、页面 URL、Tropicals `taxon_rank` 或模型输出自动合并、替换、推定亲本或解除隔离。

## 验收与失败处理

- 每条记录拥有完整、可回放的权威制品和 SHA-256，authority key、等级、父链、名称关系与中文展示名均可解释。
- 73 必须核实适用的 IAS 登记及多亲本关系；98 必须取得适用登记记录，或先满足负责人批准的通用替代证据规则。RHS `Accepted`、AGM 荣誉或单一父种推测均不能替代这些证据。
- 任一来源冲突、稳定标识缺失、所需父本关系缺失、证据哈希不一致或人工未确认时，该条继续 `TRANSFORM_PENDING`，不影响其余候选和现有 106 条本地 seed。
- 四条分别验收、互不捆绑。任一条单独满足本文件的证据、机器校验和人工复核要求后，主代理为该条生成新的不可变批准批次与完整 seed manifest；既有 manifest 不原地修改，其他待处理记录继续为 `TRANSFORM_PENDING` 且 `seedEligible=false`。每通过一条，新的本地 seed 数量按该条增加一条；四条全部通过时才达到 `seedEligible=110`。
- 现有 `seedEligible=106` 是已批准的本地未激活 seed；4 条待转换记录不得计入其中，但不阻断这 106 条及后来逐条通过的记录进入本地 seed。`activeRelease=STOP` 由 P2 数据库导入、持久化读回、发布切换和回退验收门控制；本文件不授权 CloudBase、MySQL、CMS 或 active release 写入。
- 本任务不授权 CloudBase、CMS、MySQL、云函数、网关或线上发布写入。
