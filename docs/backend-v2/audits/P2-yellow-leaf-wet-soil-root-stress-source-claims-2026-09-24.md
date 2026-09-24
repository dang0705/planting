# P2 黄叶与盆土过湿：根区胁迫来源主张候选审计

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 唯一目标：审查“长期过湿/积水可能造成根区胁迫，黄叶可为伴随表现”及一个低风险诊断行动的原始来源、适用范围、复用边界和候选字段映射。
- 核验日期：2026-09-24；只使用大学 Extension 的当前公开原始页面/PDF。后文行号为本次打开页面所得定位，重排后以标题/段落为准。
- 状态：**仅供审核的来源主张候选，不是已确认园艺事实、可导入候选实例、CMS 草稿或已发布诊断规则。** 不修改症状题包、Schema、业务代码、数据库或 CMS。
- 范围：室内盆栽黄叶；关注根区持续湿润/积水、通气与排水问题。根腐是潜在生物性病害，不能与非生物性过湿压力合并，也不能由黄叶单征确诊。
- 入口核验：`node docs/backend-v2/verify-entrypoint.mjs` 通过；本切片未读取旧 seed 或模型输出作为园艺真相。

## 来源主档候选

| 临时来源代号 | 机构、准确页面与日期 | 原文定位及适用范围 | 许可/复用边界 |
|---|---|---|---|
| `ISU-HOUSEPLANT-CULTURE-2024-01` | Iowa State University Extension and Outreach，Aaron Steil，[Diagnosing Houseplant Problems Related to Poor Culture](https://yardandgarden.extension.iastate.edu/how-to/diagnosing-houseplant-problems-related-poor-culture)，页面标注 Last reviewed: January 2024。 | `Overwatering`，网页第 66–73 行：第 68–69 行称室内植物根长期处于湿土可能发生根腐，过湿问题可伴叶片黄/褐、落叶、萎蔫等；第 71–73 行还含有检查土壤、湿干循环、排水孔/托盘等照护建议。适用对象是一般室内植物，没有为青花植所涉具体种类逐一验证。 | 本次查看页面未见该文逐页转载许可；没有取得书面许可。仅用自己的中文概括与来源链接作审核记录，不复制其段落、图片或建议文本。网页中“完全干透再浇”等一般化建议不自动采纳。 |
| `ILLINOIS-CONTAINER-DRAINAGE-NODATE` | University of Illinois Extension，[Container Drainage Options](https://extension.illinois.edu/container-gardens/container-drainage-options)，页面未显示发布日期/更新日期。 | `Container Drainage Options` 第 70–73 行及 `Saucers` 第 78–82 行：容器排水可为根部提供空气；不同植物排水需求有差异，少数可耐持续积水；湿土增加根腐风险。页面还讲到外盆/托盘积水。适用范围为容器园艺页面，不专指室内观叶植物；用于补充容器机制，不用来断言黄叶原因。 | 本次查看页面未找到具体复用许可或发布日期；未取得转载授权。仅引用页面标题/链接并以中文概括，不复制文字、图片或图表；正式公开引用前仍须做权利人/机构权利核查。 |
| `CSU-GARDENNOTES-331-2022-10` | Colorado State University Extension，CMG GardenNotes #331，[Plant Pathology](https://cmg.extension.colostate.edu/Gardennotes/331.pdf)，PDF 署名 Mary Small；Revised November 2017；Reviewed October 2022。 | 第 6 页 `Root Rots`（PDF 页内 331-6；网页提取第 181–201 行）：根腐病段列根部变暗、软、易断等症状；下部内侧叶可先黄后褐并落叶；过湿/缺氧胁迫会使根更易受根腐病原侵害。它讨论的是根腐病害过程及诊断，不证明某一盆栽已患根腐，也非专门的室内盆栽处方。 | 页尾明确：CMG GardenNotes 可“without change or additions”用于有署名的非营利教育用途；版权归 CSU Extension。此条不授予商业产品、改编或增加内容的权利。当前只作中文概括与链接，不复用 PDF 图文；青花植商业用途/改编需另行确认授权。 |
| `UMN-SPRING-HOUSEPLANT-2026` | University of Minnesota Extension，Robin Trott，[Spring houseplant care](https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/houseplants/spring-houseplant-care)，Reviewed in 2026。 | `Start with a simple check-in` 第 245–252 行建议先评估再决定是否修剪/换盆；`Water with intention` 第 290–300 行称多数室内植物偏好稳定湿润而非泡湿、清空托盘避免根部泡在水里，并提示以植物和土壤而非日历为准。是上中西部春季室内植物维护说明，不是跨植物/季节统一阈值。 | 页面 © 2026 Regents of the University of Minnesota；[UMN Extension Copyright notice](https://apps.extension.umn.edu/copyright.html) 第 8–12 行称链接其公开网页免费且受欢迎，但内容复制须提交书面请求并获书面许可。没有取得许可；只链接并用中文概括，不复制原文/图片。 |

以上代号仅是本审计的临时定位，不是正式 `sourceCode`、`claimCode` 或已登记来源修订。来源的 URL 可访问，不等于文字/图片获得青花植转载权，也不等于来源内容适用于任一已识别植物。

## 原子来源主张候选

| 候选主张 | 支持、限制与反证边界 | 候选用途 / 不可推断项 |
|---|---|---|
| `C-WET-ROOT-01`：对于一般室内盆栽，根区长期处于湿土中与根腐风险相关；黄/褐叶、落叶或萎蔫可伴随过湿问题。 | Iowa State Extension，`Overwatering` 第 68–69 行直接支持关联。CSU Extension GardenNotes #331 第 6 页描述根腐病的根部征象与叶片表现，并指出过湿/缺氧胁迫会增加易感性。反证/限制：黄色是非特异表现；Iowa 同页的过量施肥也可引起黄叶/褐叶及萎蔫（第 75–81 行）。CSU 讲的是病原性根腐，不可用来把普通过湿直接称为根腐。 | 可作为“持续过湿/根区胁迫”原因方向的来源候选，并要求水分/排水独立证据。不可仅凭黄叶或一次表层潮湿断言过浇、根缺氧、根坏死或确诊根腐；不排除其他水分、光照、温度、肥盐、病虫因素。 |
| `C-WET-AIR-02`：容器长期积水/介质饱水可能减少根区空气；各植物的排水需求并不一致。 | Illinois Extension，`Container Drainage Options` 第 70–71、78–82 行支持容器排水与根部空气的关系，且页面明确提示植物排水需求有差异和有耐湿例外。UMN Extension `Water with intention` 第 296–300 行补充多数室内植物不宜处于泡湿状态、托盘积水值得检查。适用边界：Illinois 页面范围是容器栽培而非某个室内植物种；不能将“多数”扩为全部。 | 可支持把托盘/套盆积水、排水结构作为待收集的证据维度。不可从观察到表层湿或排水孔存在/缺失直接得出根部氧状态，更不能据此给所有植物设定“完全干透”的水分阈值。 |
| `C-WET-ACTION-03`：在决定是否调整养护前，检查并记录普通花盆托盘/外套盆是否有积水；若明确为非水生、非蓄水式栽培，托盘确有残水，可把清除托盘残水列为条件化行动候选。 | UMN Extension 第 290–300 行支持以植物和土壤为依据，并清空托盘以避免根持续泡水；Iowa State 第 71、73 行也提及先查土壤实际湿度及避免容器/套盆积水。Illinois Extension 第 78–82 行提供容器场景支持及双盆结构信息。 | 首先是证据采集动作，不是对黄叶的治疗。清除托盘积水只可在植物身份/栽培方式已核实、确属普通托盘积水时供人工审核；水生植物、设计为蓄水的自浇盆、特殊栽培系统、身份未知时不得自动执行。不能自动连带停水、补水、换土、换盆或剪根。 |

## 与 Outcome/Action Schema 的候选映射

Schema 依据：[diagnosis-knowledge-candidate.v1.schema.json](../contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json)。下述只说明可审核语义；不生成完整候选 JSON，不创建正式代码或 claim 注册记录。

| Schema 字段路径 | 可准备的候选语义 | 未经人工/其他事实确认不得填入或推出 |
|---|---|---|
| `/causes/*/causeCategory`、`causeCode`、`parentCauseCode`、`definitionZh` | “根区持续过湿/积水导致的非生物性根区胁迫”可作为 `abiotic` 原因草案；根腐若另行诊断，应是不同的 `pathogen` 方向，不能合并。`C-WET-ROOT-01`、`C-WET-AIR-02` 可为来源审核输入。 | 代码、原因父级和正式措辞未冻结；不能把 `root rot` 作为本切片已证实结论，或由湿土直接补成 `pathogen`。 |
| `/causes/*/applicablePlantScope` | 这些来源大致涉及室内植物与容器园艺，可供审查范围。 | Schema 没有待审核范围状态；不得用 `all_reviewed` 偷渡全植物适用性，也不得臆造 `taxa` 或 `allowUnknownIdentity`。需由植物身份/领域审核确定。 |
| `/outcomes/*/causeCode`、`displayNameZh`、`summaryZh`、`problemTypeCode` | 候选可表达“水分/排水方向仍待核对”而非“过浇确诊”。只有黄叶、无可信根区状态时，语义应落在待判定，而不是本原因 Outcome。 | 正式 Outcome/问题类型代码未冻结；不得使用症状代码充当原因，或声称黄叶证明根部受损。 |
| `/outcomes/*/evidenceRules.required`、`supporting`、`opposing` | 设计待审证据维度：根区湿度观察及其位置/时间、近期浇水事实、盆器/托盘是否积水、植物身份与其需水范围。反证可包括根区并未持续湿、来源/观察时点不可靠、植物为耐湿/蓄水系统等。 | 本 Schema 的 `evidenceCondition` 不表达测量方法、深度、时效和可靠性；尚无已冻结的证据代码。叶面照片、一次表土触摸、黄叶本身都不能被填作“根区持续过湿”的充分证据。 |
| `/outcomes/*/conflictPolicy`、`uncertaintyPolicy`、`differentialOutcomeCodes` | 可审议证据缺失或互相矛盾时 `defer` / 要求补证；保留待判定和差异原因入口。 | 这些是需独立 Expected 的产品规则，不由园艺文章替系统选定；不可把缺少过湿证据自动变成缺水、肥害或病害结论。 |
| `/outcomes/*/affectedPartCodes`、`severityCriteria`、`urgencyPolicy`、`isolationPolicy` | 若个案确实观察到黄叶，可仅记录受影响叶部。 | 黄叶不证明根部受损、受累比例、严重度、紧急程度或传播性；无依据时 urgency 必须保持 Schema fallback `unknown`，isolation 必须 `undetermined`。 |
| `/actions/*` | 单条 Action 草案方向：检查并记录托盘/外套盆是否存水及可见排水状况；若确认为普通花盆、非水生/非蓄水式系统且存在积水，可由人工审核是否建议移除托盘残水。`C-WET-ACTION-03` 是其候选来源。 | 不得凭空填写正式 `actionCode`、`riskLevel`、步骤、禁忌或停止条件。没有目标植物/容器适用性、采集步骤和安全审核时，保留 `actions: []`。不得生成固定浇水量、间隔、完全干透阈值、停肥/用药、剪根、强制脱盆或换介质。 |
| `/actions/*/applicabilityConditions`、`contraindications`、`stopConditions` | 可在独立证据字典中审议普通托盘、非蓄水盆器、已确认植物身份等条件；未知身份、蓄水设计或相反水分证据应阻断原因性操作。 | 当前没有可引用的受控条件代码；空数组不能解释成已确认“无禁忌”。由人工审核每一项是否应填、是否留空。 |
| `/mappings/*` | 可审议把一个诊断性检查 Action 映射到待补证据的路径，而不是把过湿 Outcome 无条件映射到停水/换盆。 | Schema 不定义未知结果自动展示 Action 的运行语义；正式 mappingCode、命中条件、禁忌优先级及顺序均未批准。没有主张支持任何统一浇水处置映射。 |
| `/claimLinks/*` | 概念上可分别把来源主张以 `support` / `limit` 挂到 cause、outcome、action；需按目标与关系拆成原子引用。 | 本文 `C-*` 和 `ISU-*` / `UMN-*` 等仅为临时审计代号；不是正式 `sourceCode`、`claimCode` 或修订号。许可限制需记在来源主档，不能伪装成园艺 `safety` claim。映射本身尚无独立来源主张。 |

## 相互限制、不能推出的处置

- Iowa 页面包含“湿干循环/完全干燥后再浇”等通用照护句（第 71–72 行），而 UMN 页面使用“多数室内植物喜欢稳定湿润而非泡湿”“由植物与土壤指导”的表述（第 296–300 行）；Illinois 页面也指出排水需求因植物而异，并记载耐湿/蓄水容器情形。三者不构成可合并成同一固定阈值的规则。此候选不采用“必须完全干透”、固定浇水日历、次数或水量。
- CSU 所述的根腐病属病原性病害；黄色/褐色内侧下叶是病害可能表现，不是充分诊断。根部外观、病原鉴定或专业检查缺失时，不发布“根腐”结论、杀菌剂/生物制剂建议、剪根或换盆步骤。
- 湿土/托盘积水并不排除缺水误判、施肥盐害、光照/温度因素、害虫或其它病害。未观察到某征象也不等于排除整株或未拍部位问题。
- 许可核查不是法律意见：UMN 给出明确“先书面申请、获书面许可”的要求；CSU 仅明确允许无改动的非营利教育复用；Iowa State 与 Illinois 页面本次未找到逐页许可声明。所有来源均未取得青花植的文字、图片或改编授权。可内部记录并链接；面向用户发布/复用前仍需核对链接呈现政策、来源有效性和权利条件。

## 自检与下一道审核门

- 每项园艺因果语义均连到准确标题、URL、日期/未显示日期及可核对段落；植物范围、来源支持和反证/限制分开记录。
- 已映射到现有 `cause`、`outcome`、`action`、`mapping`、`claimLink` 字段，并指出未知值不能填充的原因；未构造伪 CMS 内容或 active release。
- 仅创建本文件与其 SHA-256 sidecar；没有改公共合同、候选 Schema、DDL、ClickUp、CloudBase、症状题包或业务代码；没有运行产品测试。
- 后续准入前仍需：核对真实植物身份与栽培方式、冻结可观察证据代码及有效性、人工决定 Action 适用性/禁忌与 mapping、注册准确来源/主张修订并完成许可核查，再编写独立 Expected。
