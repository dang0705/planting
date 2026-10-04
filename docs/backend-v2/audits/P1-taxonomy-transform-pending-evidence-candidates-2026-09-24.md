# P1 四条待转换植物身份：官方证据候选与缺口

> 审核票据：`z8v0kmr9gm`<br>
> 核查日期：2026-09-24（Asia/Shanghai）
> 性质：只读证据盘点；不是新审批，也不构成准入建议或 seed 制品。

## 结论与边界

本次核对发现，29、73、98、123 的证据成熟度不同，不能把四条记录作为一次普通批量名称替换处理。尤其 123「绯牡丹」的旧身份与已批准目标之间出现当前权威分类源的实质冲突，必须先由产品负责人重新裁决实际植物身份；73、98 的园艺栽培品种证据也不能把 RHS 植物资料页或 RHS Award of Garden Merit（花园优异奖，AGM）直接当作国际栽培品种登记证据。

状态保持不变：人工审批仍为 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`，`seedEligible=106`。以下四条**仍未批准、仍未进入 seed**；active release 继续 `STOP`。不修改审批 JSON、审批清单、seed、manifest、数据库、CMS、CloudBase 或其他激活产物。旧测试资料只用于解释此次审计对象，**不是 v2 迁移来源**。

## 本次证据的可复核边界

- WCVP 采用 2026-06-04 发布包；在本机临时回放目录读到的文件哈希为：压缩包 `6ff1e084d7e1de5bce526a9952c96fbb0f13b4f2c615b0fc30c055f88bfb5483`，解出 `wcvp_taxon.csv` 为 `71d5662935deeb25aaff03e512fc2437d79984ed738e85f03da83afdd168d704`，EML 为 `aa6dc4c18d3cd127f477a041777357435b86fea6da7c342f301902cb994a6c85`。
- WFO 采用 Zenodo record `20782718` 的 2026-06 数据；临时回放文件哈希为：压缩包 `75f1ad1f371978c9e46f3044152c07ed276fe57be9fb9a15b3621b19cf231987`，`taxon.tsv` 为 `0d23bddb2ab8d7e6505e741acb54b6603ca9523751be555a734ee4019fa61c23`，`name.tsv` 为 `c506eb9e21efe9e268e20f8cd9bc65f91b55e1722d19c27d58a6681f8b680ed8`，`synonym.tsv` 为 `dba9a8562d173971ae57705dbdb68aa866e76295294742834b6f55f7182595ca`。
- 上述原始压缩包和解出文件位于本机 `/tmp/qinghuazhi-taxonomy-z8v0kmr9gm/` 临时目录，不是本仓库中的持久证据制品。本报告记录哈希只是标识本次读取的输入，不能替代把各目标记录的原始响应、版本、父链及逐记录 SHA-256 固化到受治理目录。
- Kew POWO、iPlant、RHS、ISHS 与 IAS 网页在本次核查日实时读取；当前未保存每条网页的响应字节快照及 SHA-256。因此下表属于可追溯的候选证据，不满足实施规范中“可回放原始制品”的最终准入条件。
- 已有实施规范与审批文件仍是门禁依据：[人工裁决](P1-taxonomy-human-decision-2026-09-20.md)、[待转换重建规范](../implementation/taxonomy-transform-pending-rebuild.md)、[权威来源回放记录](P1-taxonomy-authority-pipeline-z8v0kmr9gm.md)。

## 逐条核查

| 来源记录 | 本次可复核证据 | 仍缺少的准入证据 | 必须保留的人工裁决 |
|---|---|---|---|
| **29 水仙** | WCVP 2026-06 行给出 accepted `Narcissus tazetta subsp. chinensis`、`taxonid=310501`、父种 `parentnameusageid=282289`、IPNI `77189681-1`。WFO 2026-06 名称 ID 为 `wfo-0000771854`，父种 ID 为 `wfo-0000700066`。当前 POWO 页面明确显示完整层级 `Amaryllidaceae → Narcissus → Narcissus tazetta → N. tazetta subsp. chinensis`，并标记亚种 accepted。iPlant 页面标题为“水仙”，显示同一拉丁名，另列“中国水仙”“水仙花”为俗名。 | 把科、属、种、亚种逐边关系及源版本保存成逐记录原始制品；WCVP/WFO 临时快照不能作为持久档案；生成新 authority key 与不透明公开引用后需机器回放校验。 | 决定产品规范展示名用“水仙”还是“中国水仙”；另一个名称是否作为有来源的别名。分类候选证据支持该亚种，但本报告不替用户确认展示名。 |
| **73 银皇后** | WCVP 有接受种 `Aglaonema commutatum`，`taxonid=4614`、父属 `4599`、IPNI `84050-1`；WFO 2026-06 `taxon.tsv` 中有物种实体 `wfo-0000916353`。当前 RHS 页面存在 `Aglaonema commutatum 'Silver Queen'` 资料页，列出 Araceae 与相关异名，但同时将 `Name Status` 标为 `Synonym`。ISHS 官方分类目录将 `Aglaonema` 登记类别指向 International Aroid Society（IAS）；IAS 说明正式记录需有 `Accepted: Yes`，发布后才达到 `Established: Yes`。iPlant 页面使用“银后亮丝草”作标题、`Aglaonema 'Silver Queen'` 作名称，并将“银皇后万年青”列为俗名。 | 尚未取得 IAS 对应栽培品种的具体登记/legacy 记录、稳定记录标识、接受/既定状态、父种关系与可版本化原始制品。IAS 搜索页面是动态页面；本次页面文本未呈现具体命中，**不能据此断言没有登记**。RHS 页面不是本次所需的 IAS 登记记录，且其自身“Synonym”标记必须查明指向。 | 确认 `Silver Queen` 所指园艺身份及规范父种；裁决“银皇后”“银后亮丝草”“银皇后万年青”的展示名和别名关系；确认登记证据标准是必须 IAS 记录，还是允许以 RHS 页面等其他证据补充。 |
| **98 狐尾天门冬** | WCVP 有接受种 `Asparagus densiflorus`，`taxonid=275016`、父属 `274909`、IPNI `531072-1`；WFO 2026-06 `taxon.tsv` 中有物种实体 `wfo-0000632151`。当前 RHS 页面将 `Asparagus densiflorus 'Myersii'` 标为 `Name Status: Accepted`。RHS 2024 AGM 清单及其历史清单都列有该名称；这支持园艺使用与认可，但 AGM 是园艺奖项，不等同于栽培品种登记。ISHS 官方目录说明 RHS 仅负责九组（包括水仙等），不包括 `Asparagus`；当前 ISHS 属级登记类别清单中没有 `Asparagus` 项。 | 缺少适用 ICRA 对应记录或负责人批准的替代证据规则，以及 RHS 页面的版本化原始快照、页面内容 SHA 和逐边种级父项证据。当前 RHS 页面“Accepted”可支持名称用法，不证明 RHS 是 `Asparagus` 的 ICRA，也不能单独满足“ICRA 登记制品”条件。 | 确认在适用 ICRA 不明/当前官方清单没有 `Asparagus` 项时，是否允许用已版本化的 RHS 接受名资料与 AGM 作为替代证据；确认“狐尾天门冬”的中文规范展示名与别名。 |
| **123 绯牡丹** | WCVP 2026-06 将旧名 `Gymnocalycium mihanovichii`（`taxonid=2835702`，IPNI `115434-2`）列为 accepted species；目标 `G. stenopleurum`（`taxonid=2835856`，IPNI `115502-2`）也另列为 accepted species。两者具有相同属父级 `2835511`，不是同一行的接受名/异名指向。WFO 名称表有旧种 `wfo-0000712540` 和目标名称 `wfo-0000712693`；当前 2026-06 WFO `taxon.tsv` 有旧种实体行，但未找到目标名称 ID 对应的 taxon 实体行，因此**仅凭该 WFO 名称表不能证明目标的接受状态或旧种到目标的分类关系**。当前 POWO 分别把 `G. mihanovichii` 与 `G. stenopleurum` 标为 accepted species；目标的异名表包含若干 `G. mihanovichii` **变种**（如 `var. friedrichii`），但不包含 `G. mihanovichii` 本种。 | 已批准的“`G. mihanovichii` → `G. stenopleurum`”说法缺少可复核的本种分类关系证据，且与本次读取的 Kew/WCVP 当前分类状态冲突。必须补直接说明物种关系的权威来源及其版本，解释“绯牡丹”产品名对应的实际物种/栽培身份，再重建完整父链和别名关系。仅有共同属级、某些下位变种归入目标，均不等于旧种本身是目标异名。 | **必须由产品负责人重新确认：源记录“绯牡丹”究竟指哪一分类或栽培身份，以及目标是否应改为其他身份。** 在裁决前不得把 `G. mihanovichii` 自动改写成 `G. stenopleurum`，也不得把二者合并为异名。中文商品/园艺名与规范分类身份的映射同样需单独确认。 |

## 官方来源索引

- Kew POWO： [水仙亚种](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A77189681-1)、[Aglaonema commutatum](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A84050-1)、[Asparagus densiflorus](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A531072-1)、[Gymnocalycium mihanovichii](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A115434-2)、[Gymnocalycium stenopleurum](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A115502-2)。
- iPlant 植物智： [水仙亚种记录](https://www.iplant.cn/info/Narcissus%20tazetta%20subsp.%20chinensis?t=z)、[银后亮丝草记录](https://www.iplant.cn/info/Aglaonema%20cv.%20Silver%20Queen?id=FC6DE63DF9D2938F)、[狐尾天门冬记录](https://www.iplant.cn/bk/8BEEB02F5A906EA1)。这些记录用于中文名称及园艺用名候选，不代替 Kew/WCVP/WFO 分类关系。
- RHS： [Silver Queen 植物页](https://www.rhs.org.uk/plants/704/aglaonema-commutatum-silver-queen/details)、[Myersii 植物页](https://www.rhs.org.uk/plants/28198/asparagus-densiflorus-myersii/details)、[RHS 登记职责范围](https://www.rhs.org.uk/plants/horticulture-hub/plant-registration)、[2024 AGM 清单](https://www.rhs.org.uk/plants/pdfs/agm-lists/agm-ornamentals.pdf)。
- ISHS / IAS： [ICRA 目录](https://www.ishs.org/sci/icralist/icralist.htm)、[有 ICRA 的属/科清单 A](https://www.ishs.org/sci/taxlist/ataxlist.htm)、[IAS 栽培品种登记规则](https://www.aroid.org/cultivarregistry)、[IAS 栽培品种搜索页](https://www.aroidcultivars.org/search-cultivars)。
- 发布数据： [WCVP/Kew 数据库](https://sftp.kew.org/pub/data-repositories/WCVP/)、[WFO 2026-06 Zenodo 数据集](https://zenodo.org/records/20782718)。本次 WFO/本地 WCVP 哈希见上节及[权威来源回放记录](P1-taxonomy-authority-pipeline-z8v0kmr9gm.md)。

## 可并行工作与唯一准入顺序

可并行但不能提前激活：

1. **29**：固化 WCVP/WFO/POWO 的原始记录、数据版本、稳定 ID 与完整父链；将水仙中文规范名选择留给负责人。
2. **73**：向 IAS 目录/登记来源取得 `Silver Queen` 的确切记录或书面状态，解释 RHS 的 `Synonym` 标签；并整理中文显示名候选。
3. **98**：核对 ISHS 当前登记类别和可能的历史登记出版物；若没有适用 ICRA 记录，先取得负责人对替代证据标准的明确裁决。
4. **123**：不得继续自动转换；先由负责人裁决来源名与目标种的关系，再按裁决收集权威证据。

每条仍按已冻结顺序闭环：版本化权威原始制品和 SHA-256 → 稳定 authority key → 完整父链与名称关系 → 新不透明公开引用 → 机器校验 → 中文名/冲突人工复核 → 重新生成待审批 batch/manifest。任何来源冲突、父链不完整、Cultivar 登记证据不足或负责人未裁决，该条均继续保持 `TRANSFORM_PENDING`，不改变其他三条或当前 `seedEligible=106`。本单票据门禁不阻塞 P2 或不依赖 active taxonomy 的其他后端任务。

## 2026-09-24 补充核查：123 映射、73 登记检索与 98 原始园艺证据

以下补充仍是只读审计。新增网页/文件快照均留在本机 `/tmp`，没有复制有版权风险的网页全文或 RHS PDF 到仓库；因此哈希用于复核本次读取的原始字节，不能代替未来正式审批所要求的受治理、可重放证据制品。

### 123 绯牡丹：源记录不足以支持原目标映射

- 遗留参考快照 `/tmp/qinghuazhi-taxonomy-z8v0kmr9gm/plant_catalog.HEAD.csv` 中的原始行：

  ```text
  123,绯牡丹,null,常见仙人掌/多肉，适合家庭园艺/盆栽场景。,仙人掌/多肉,Succulent,Gymnocalycium mihanovichii,仙人掌科,Cactaceae,Gymnocalycium,1,null,2026-03-21 20:32:54,2026-03-21 20:32:54
  ```

  逐行 SHA-256 为 `b8d5e715f08baaccf1e6c693a0f430b7c8e4c884c02ea0bbe9677654ff001b35`，与 admission manifest 的 `legacyRowSha256` 一致。该行只有“绯牡丹”中文名、旧学名、科属及泛化描述；没有栽培品种名、照片、标本、来源或能区分 `G. mihanovichii` 与 `G. stenopleurum` 的特征。manifest 将此参考文件用途锁为“仅做 P1 遗留参考审计；不得恢复到工作树、不得直接导入 v2”。
- 人工审批包中的 123 仅为 `TRANSFORM_PENDING`，目标候选写作 `Gymnocalycium stenopleurum`，级别为 `species`，但 `authorityRefs` 只有 WFO 首页 `https://wfoplantlist.org/`，没有该种具体记录、关系证据或原始制品。人工决定文档把理由概括为“Kew/WFO 当前接受关系；历史名保留为 alias”，这不是可复核的种级 synonym 证据；admission manifest 同时仍将源行判为 `QUARANTINE`，原因是缺权威证据且发布条件不满足。
- 本次直接回读 Kew POWO 的两个具体页面：`G. mihanovichii`（IPNI `115434-2`）与 `G. stenopleurum`（IPNI `115502-2`）都标为 accepted species，并各有不同的首次发表信息与独立异名清单；`G. stenopleurum` 清单包含若干 `G. mihanovichii` **变种**，不包含 `G. mihanovichii` 本种。WCVP 2026-06 同样有两个独立 accepted species 行（ID `2835702` 与 `2835856`，同属父 ID `2835511`）。注意 POWO 与 WCVP 均属 Kew/WCVP 体系，不能把它们算作两个独立分类权威。WFO 2026-06 有两个名称记录，但只在 `taxon.tsv` 找到旧种实体，未找到目标名 `wfo-0000712693` 的 taxon 实体，不能据 WFO 名称表确认目标 accepted 状态或两者关系。IPNI 是命名学记录，并不单独裁定接受分类关系。

可执行且不混并的裁决选项：

1. **推荐默认：保留两个 accepted species 为两个不同分类实体，不建立二者之间的 synonym 关系；123 暂不映射。** 如果后续产品确需同时提供两个物种，分别创建/保留各自独立的 authority key、等级与父链；来源 123 仍因身份无法判定而留在 `TRANSFORM_PENDING`，既不丢分类候选，也不猜测“绯牡丹”指向。
2. 若负责人确认 123 的来源记录原意就是物种 `G. mihanovichii`，则重新裁决为该 accepted species，更新映射目标与来源证据；`G. stenopleurum` 只有在另有独立业务需求时才单独建档，不作为其替代名。不得仅因中文名常见用法推定。
3. 若负责人确认来源意指商品/栽培身份或嫁接仙人球，则暂停现有 `species` 目标，先决定青花植要表示接穗物种、砧木、栽培品种还是用户购买的组合商品；当前源行不足以确定其中任何一个，不能自动建品种/嫁接关系。
4. 只有在负责人坚持 `G. mihanovichii` 是 `G. stenopleurum` 异名时，才继续寻找明确支持**本种级**关系的版本化权威分类来源，并说明为何与 Kew 当前接受分类不同；取得该证据后仍须重新人工审批，不能把对若干变种的归并扩大为本种归并。

123 最小人工问题：**“绯牡丹”这条遗留业务记录究竟要表达什么植物身份，是否必须保留为未映射？** 在回答前不需要为了把它变成 seed 而新造别名或身份。

### 73 银皇后：IAS 精确登记记录仍未取得，且原父种假设有冲突

- ISHS 当前 ICRA 目录把 `Aglaonema` 的登记机构指向 International Aroid Society（IAS）。IAS 官方规则区分 `Accepted: Yes`（委员会接受）和 `Established: Yes`（接受记录已在 IAS newsletter 发布）。本次检索 IAS 当前搜索页、legacy 页面和公开动态页面目录，没有取得 `Silver Queen` 的具体登记编号/页面，也没有取得 IAS 对其是否属于 legacy cultivar 的书面答复；**不能从搜索页空白、目录未列或某条 URL 404 推断它不存在**。
- 可复核的检索痕迹：静态搜索页快照 SHA-256 `336670b7f63d73eab9c6e46f5fbccce60b1324b2a71976a0f2e45c055321c34c`，legacy 说明页快照 `18108b95f19c13b5dc93293036a35ab117dc51cd3c3a3514315eb947383aed7f`；Wix 动态页 sitemap 快照 `8822ae29e35702473ce188bcf150563f94794c3cb7d1fdd0fdb6194a31482f32` 只可见 Aglaonema 的 `Maria Cecilia` 项，未见 `Silver Queen`；尝试的 `/aroid-cultivars/aglaonema/silver-queen` 路径返回 HTTP 404，响应体 SHA-256 `1134638deac427e527d1ea7e9fc273f5ea4b8f82d798b5ccd80a2491670add28`。该网站有动态搜索和图片型 legacy 页面，以上负向结果都不构成“无登记”的证明。
- 原重建规范中的 `Aglaonema commutatum → 'Silver Queen'` 单一父种假设也不能直接作为已核实事实。RHS profile 704 将 `Aglaonema commutatum 'Silver Queen'` 标为 `Name Status: Synonym`，并列出 `A. commutatum`、`A. nitidum`、`A. treubyi` 三种属名组合。IAS 规则明确允许种间杂交后经稳定无性繁殖形成栽培品种；Chen 等发表于 *Annals of Botany* 2004、DOI `10.1093/aob/mch025` 的研究把 `Silver Queen` 列为 interspecific hybrid，并给出 `A. commutatum 'Treubii' × A. nitidum 'Curtisii'` 来源。该同行评审研究是园艺身份/亲本来源证据候选，但不是 IAS 登记记录；也意味着不能把它只建模成 `A. commutatum` 的种内栽培品种而不记录杂交来源。

73 最小人工问题：负责人需确认是否仍以 `'Silver Queen'` 为待建身份，以及是否接受“属级园艺身份 + 多亲本杂交来源”的表示；同时确定缺少公开 IAS 精确记录时是否允许其他证据标准。之后应先修订/明确栽培品种父级与杂交来源合同，再分别审核中文展示名。可通过 IAS registry 检索或请求书面确认补足具体登记证据；在得到前保持待定，不能声称未注册。

### 98 狐尾天门冬：已取得 RHS 当前原始园艺证据，但仍不是 ICRA 登记证据

- RHS 官方植物页 `https://www.rhs.org.uk/plants/28198/asparagus-densiflorus-myersii/details` 原始 HTML 保存于 `/tmp/z8v0kmr9gm-rhs-myersii.html`，SHA-256 `5c47b30a53c174216f594f001ecb7785ea6153c34e5c02105ae8e2fc497b9ee4`；记录名称为 `Asparagus densiflorus 'Myersii'`、RHS identifier `28198`、`Name Status: Accepted`，结构化数据将父级写为属 `Asparagus`、科 `Asparagaceae`。响应 `Last-Modified: Wed, 23 Sep 2026 13:12:44 GMT`。这是名称用法与园艺身份来源候选，不是 ICRA 登记记录。
- RHS 官方 2024 AGM ornamentals PDF 原始文件保存于 `/tmp/z8v0kmr9gm-rhs-agm-ornamentals.pdf`，SHA-256 `0b709b30a9a8639b1bd7da41db198225547adec2cee3dc1fc294857bcf2891a4`，文件 1,114,424 字节；HTTP `Last-Modified: Tue, 28 Jul 2026 09:22:26 GMT`，ETag 为 `"en-gb|a010aae6-f430-462f-a2ee-8773d79e00bf|28/07/2026 09:22:26|LiveSite"`。RHS PDF 第 6 页列出 `Asparagus densiflorus ‘Myersii’` 与 AGM；这是园艺奖项，不证明栽培品种登记。
- ISHS 当前 ICRA 属级目录未列 `Asparagus`；RHS 自述登记职责仅含九组且不含 `Asparagus`。这支持“本次未找到适用 ICRA”，但不证明所有可能的国家/地区登记或历史记录都不存在。iPlant 页面 `https://www.iplant.cn/bk/8BEEB02F5A906EA1` 原始 HTML 快照 SHA-256 `7f5ecc8241698dbf92b78e3a797d54231575d18e81f9dece9eb9692851eac172`，写作“狐尾天门冬 Asparagus densiflorus 'Myersii'”；可补中文名称使用，但不是 ICRA 登记证据。父种 `A. densiflorus` 的 WCVP/WFO 稳定分类行及原始数据包哈希已记录在本报告前述证据边界及 98 表格。

98 最小人工/政策问题：**若确认当前官方目录无适用 ICRA，是否允许青花植采用通用、可复用的“无适用 ICRA”替代证据包？** 若允许，须先定义全局标准（例如版本化的专业园艺机构接受名记录 + 独立园艺文献/实物目录佐证 + 分类父项证据），不得为单条记录临时豁免；RHS profile 与 AGM 同属一个机构，不能伪装成两家独立来源。若不允许，则 98 继续 pending，等待适用 registrar 的直接原始记录或后续政策变更。

### 负责人可执行的窄裁决表

| 记录 | 可立即执行的保守动作 | 仍需负责人作出的最小决定 | 当前不允许 |
|---|---|---|---|
| 123 | 将两个 accepted species 保持为不同实体候选，不建立 synonym 边；123 保持未映射 | “绯牡丹”业务上指向哪个身份，或继续不映射 | 自动以目标种替换旧种、合并两种、由共同属级推导 synonym |
| 73 | 继续取得 IAS 精确记录；未命中不等同未注册；将杂交亲本纳入模型合同审查 | 是否继续以 Silver Queen 为目标、是否支持多亲本杂交表示、接受何种登记证据 | 按现有单物种父级假设直接放行，或声称“无登记” |
| 98 | RHS accepted + AGM 作为候选证据并保留原始 SHA；明确其不是 ICRA 记录 | 是否建立通用“无适用 ICRA”替代证据政策 | 把 RHS AGM 等同注册、单条私下豁免 |

以上没有任何一项改变人工审批、manifest、seed 或 active 状态。29/73/98/123 继续保持 `TRANSFORM_PENDING`、`seedEligible=106`、active release `STOP`，直到证据包完成且相关人工裁决完成。
