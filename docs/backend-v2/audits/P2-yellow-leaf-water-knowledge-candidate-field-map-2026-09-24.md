# P2 黄叶水分知识候选：Schema 字段映射审计

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 唯一目标：把已核验的黄叶/水分来源边界映射到当前 `diagnosis-knowledge-candidate.v1` Schema，供领域审核和独立 Expected 准备。
- 证据基线：[P1 黄叶水分方向来源主张候选审计](./P1-yellow-leaf-water-source-claims-2026-09-24.md)，核验日期 2026-09-24；Schema：[diagnosis-knowledge-candidate.v1.schema.json](../contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json)。
- 状态：本文件是**非发布字段映射审计**，不是一个可导入候选实例，也不是已确认园艺事实。未创建 CMS 内容、claim 注册记录、来源主张 ID、active release 或运行时输出。
- 范围：根区持续过湿、根区持续偏干、现有证据不足三类黄叶候选。许可、逐植物适用性和领域审核未完成；不得将此文档当作发布批准。

## 总体结论

当前来源支持把“持续偏湿”“持续偏干”作为水分方向候选，也支持黄叶证据不足时保持待判定；来源不支持只凭黄叶或单张叶面照定因。Schema 可容纳 `causeCategory: undetermined`、证据冲突退路、空 `actions` / `mappings`，并强制 urgency 与 isolation 的安全 fallback。

当前不得构造完整候选 JSON：题包精确 release、植物范围、受控证据代码、稳定 source/claim 修订、具体候选的正式代码及人工审核尚未完成。Schema 字段结构合格本身不等于这些事实存在。

## 按 Schema 区块映射

| Schema 路径 | 可由现有来源支持的候选语义 | 当前不可安全填写 / 必须保留的值 | 准入前条件 |
|---|---|---|---|
| `/symptomModeRefs`、`/outcomes/*/symptomModeRefs` | 症状入口应表达黄叶；黄叶不等于病因。 | 不知道当前有效黄叶题包的稳定 `symptomModeCode` 与精确 `questionPackageReleaseRef`；不得猜版本或继承旧题包。 | 从已批准题包发布目录读取真实代码、release 引用与兼容性。 |
| `/causes/*/causeCode`、`parentCauseCode` | 可准备“根区过湿”“根区偏干”“原因待判定”三个概念草案。过湿/偏干方向可暂归非生物原因候选，待判定需保留 `undetermined` 类别。 | 不得将临时代号或来源审计代号当作正式 `causeCode`；原因父子目录及无环关系尚未冻结。 | 由 diagnosis 领域审核稳定代码、父级与代码含义；不得在本文件中固化成机器真值。 |
| `/causes/*/causeCategory` | 两种水分压力概念可候选 `abiotic`；证据不足候选可用 `undetermined`。 | 若出现虫体、病斑或根腐推断，本批来源不能支持 `pest` / `pathogen` 归因；不能因水分证据不足就自动判成其他原因。 | 领域审核确认代码语义和原因目录；病原/虫害需独立证据切片。 |
| `/causes/*/displayNameZh`、`definitionZh` | 可用审慎中文草案描述“根区持续偏湿/偏干是黄叶的可能水分因素”；待判定应解释目前缺少能区分原因的证据。 | 不得写成“浇水过多导致黄叶”“缺水确诊”等因果定论，也不得写入未经证实的根腐、肥害或病虫病名。 | 人工审核文字是否准确区分观察事实、原因假设与结论。 |
| `/causes/*/applicablePlantScope`、`/outcomes/*/applicablePlantScope` | 现有来源范围是一般室内植物/盆栽养护，可作为候选来源背景。 | 当前没有经青花植审核的植物范围。Schema 的 `plantScope.mode` 只有 `all_reviewed` 或 `taxa`，没有“范围待审核”；不得用空 `taxa` 或 `all_reviewed` 偷渡普适结论，也不得擅设 `allowUnknownIdentity`。 | 先逐植物或经明确审核的宽范围核验；未知身份的允许策略须有独立依据和产品决策。 |
| `/outcomes/*/outcomeCode`、`causeCode` | 可有三个候选方向，但不强迫对同一黄叶证据选唯一病因。 | 正式代码与结论—原因绑定尚未登记；不能用症状模式充当 Outcome code。 | 冻结稳定代码及与同候选 cause 引用的一致性。 |
| `/outcomes/*/displayNameZh`、`summaryZh`、`problemTypeCode` | 待判定摘要可表述“现有证据不足以区分水分方向”；过湿/偏干仅可用“可能/候选”语气。 | 不得输入模型自评概率、静态“低风险”、单因结论或自由拼接的病因类别。`problemTypeCode` 的展示投影也未冻结。 | 由 diagnosis 审核候选文案、原因类别投影和用户可理解性。 |
| `/outcomes/*/affectedPartCodes` | 只有当本次证据确实观察到叶片泛黄时，才可记录叶部受影响。 | 叶片照片不能推出根部受损、根腐或“整株健康区域比例”；Schema 的 code 必须来自受控部位词典，不能临时造 code。 | 明确部位代码词典；区分本次观察部位与推断原因部位。 |
| `/outcomes/*/evidenceRules` | 来源支持这些**待设计证据维度**：根团/基质是否持续湿润或干燥、排水情况、近期浇水事实、植物需水范围；黄叶本身是入口/表现，不是水分判据。 | 不能把网页文字转成已验证的 `evidenceCode` / `findingCode`。`visual` 叶面照片不能默认代表根区测量；表土一次触摸不等于根团持续状态；当前也无有效期、测量方法、最低可靠性规则。 | 由题包/真实证据采集链冻结受控代码、`sourceKind`、部位、时间/有效性和必需/支持/反驳关系；独立 Expected 覆盖冲突与缺失。 |
| `/outcomes/*/conflictPolicy`、`uncertaintyPolicy` | 对水分证据冲突，`defer` 是可评审的安全候选；证据不足可评审 `unconfirmed_when_insufficient` 或 `ask_for_evidence`。 | 这些是候选政策选择，不是外部园艺来源的固定事实；目前没有已冻结的冲突 Expected 或可引用的补问列表。 | 先冻结归约规则及题包后续问题；冲突时不得静默选一个候选。 |
| `/outcomes/*/severityCriteria`、`urgencyPolicy`、`isolationPolicy` | Schema 明确允许空规则；`urgencyPolicy.fallback` 必须 `unknown`，`isolationPolicy.fallback` 必须 `undetermined`。本批水分来源没有紧急程度或隔离阈值。 | 不得把无规则改成 `low` / `false`；不得因黄叶或水分压力建议隔离，也不得把未知受损范围标为轻微。 | 若未来增加规则，逐条需要观察依据、source claim、安全审核和独立 Expected。 |
| `/outcomes/*/differentialOutcomeCodes`、`followUpCriteria` | 可在未来引用同一兼容包中真正存在、能区分的原因结论；可以暂不提供复查时限。 | 当前未冻结差异结论代码、复查指标代码或可靠时间依据；空数组表示未提供规则，**不表示无需鉴别或复查**。 | 由领域审核确定差异项及复查指标；不得编固定天数。 |
| `/actions` | 来源审计只支持把“检查与植物相符的根区水分、浇水事实和排水状况”列为**行动草案方向**。Schema 允许 `actions: []`。 | 尚无经批准的检查方法、深度、工具、频率和风险评估；不填 `riskLevel`、`stepsZh` 或安全说明的正式实例。宁可空 actions，也不制造操作步骤。 | 人工确认安全、植物适用性、具体步骤、风险等级、禁忌与停止条件后再录入。 |
| `/actions/*/applicabilityConditions`、`contraindications`、`stopConditions` | 可在领域审核时考虑“水分证据缺失/互相冲突、植物身份未知、症状恶化”等是否阻止或暂停行动。 | 目前没有相应受控条件码；空禁忌/停止条件容易被误解为“无禁忌”。不可借空数组宣称已完成风险审查。 | 先建受控条件和 Expected；审核人确认每个数组为空的理由或具体条件。 |
| `/mappings` | Schema 允许空映射；证据不足结果可以不附任何行动。 | 没有证据证明“过湿→停水”“偏干→浇水”可作为无条件映射；没有通过禁忌优先级与排序审核。 | 仅在 Outcome 证据命中、行动适用、反证和禁忌通过后建立映射；顺序与优先级需可回放。 |
| `/claimLinks/*` | 已有来源审计可作为人工登记 source claim 的依据。每条连接需选择 `targetKind`（cause/outcome/action/mapping）及 `linkRole`（support/oppose/limit/safety）。Schema 要求顶层 `claimLinks.minItems: 1`。 | 审计中的 `ISU-*`、`UCIPM-*` 是临时代号，不是正式 `sourceCode` / `claimCode`；没有稳定来源修订号。来源审计不构成 Schema 中的 source registry。许可不属于 `linkRole`，不得把版权限制冒充园艺 `safety` 主张。 | 先在获准的来源主档/主张注册流程登记精确来源、定位、claim 修订与许可状态；再按目标条目分别挂 `support`、`limit` 等角色。未注册前，不能用占位 claim 通过 Schema。 |

## unknown / undetermined 必须保留的情形

1. 只有黄叶图或黄叶描述，没有植物身份、根区状态和近期浇水事实：原因保持待判定，不映射至过湿或偏干。
2. 盆土表层湿/干与浇水记录、萎蔫表现相互矛盾，或只观察到一次状态：不静默选方向，执行受审的 `defer` 候选。
3. 根区观测来源、时间、测量位置或有效性未知：该证据不能满足来源主张的持续湿/干条件。
4. 黄叶范围、严重度、紧急性或隔离需求没有可观察标准：不填低/无；按 Schema 保留 urgency=`unknown`、isolation=`undetermined` fallback。
5. 不能因水分原因证据不足而补成病原、害虫、肥料或光照诊断；这些属于独立候选及其独立来源链。

## 必须经人工审核的 Action 禁忌

| 禁止自动生成/映射 | 审核理由 |
|---|---|
| 固定停水、立即浇水、统一间隔/水量/深度，或“土必须完全干透” | 来源强调室内植物需求受物种、介质、盆器和环境影响；已审核材料没有可用于全植物的数值门槛。 |
| 强制脱盆、按根色直接确诊过湿/缺水、自动换盆 | Illinois Extension 的根色建议注明有例外；来源审计所列材料显示根异常可有多种成因，且脱盆本身不是默认低风险检查。 |
| 固定停肥两周、自动施肥、按黄叶自动冲洗或换介质 | 黄叶也可能来自肥盐或根系问题；现有来源不足以支持统一施肥时间、剂量或处理。 |
| 剪叶、剪根、施用杀菌剂/杀虫剂/粉剂，或提供药剂剂量 | 本切片不包含具体病原/虫害鉴定、药剂安全资料、植物标签和本地适用许可。 |
| 仅凭黄叶隔离或断言“无需隔离”；仅凭表层湿度诊断根腐 | 水分来源不能证明传播性病虫害，也不能排除其存在。隔离或病原诊断需独立证据和规则。 |
| 用“低紧急度”“轻微”“无需处理”填补空证据 | Schema 要求无证据时 urgency 保持 `unknown`、isolation 保持 `undetermined`；其他严重度也不能由颜色或模型自评推断。 |

## Schema 层面的待决缺口（仅记录，不在此修改）

- `plantScope` 没有待审核/未知范围状态；若选 `all_reviewed` 会表达已审核广范围，若选 `taxa` 则需真实 taxa 代码。此切片不能靠默认值绕过。
- `evidenceCondition` 只约束证据代码、发现代码、证据类别和受损部位；根区采样位置、湿度测量方法、持续时长、时间有效性与可靠性门须在受控字典/规则层另行冻结。
- `claimLink` 只保存来源/主张代码和修订号；URL、标题、作者、日期、页内定位、许可及核验人必须由独立来源主档支持。临时代号不能进入发布候选。
- `followUpCriteria` 没有固定时间字段是可接受的；在时间依据未审核前留空，但不得把留空解释为无需复查。
- `actions`、`mappings` 允许为空，这是当前安全边界；不要为了填满字段制造 action。

## 自检与下一道门

- 已按当前 Schema 的 `cause`、`outcome`、`action`、`mapping`、`claimLink` 逐区块检查；每项建议都标出可填边界、未知值和前置审核条件。
- 来源只取自已存在的黄叶水分来源审计；没有新增病虫害事实、药剂、剂量、固定时限或 CMS 发布事实。
- 后续先由领域审核确认植物范围、题包 release、证据字典、source/claim 稳定修订和安全规则，再写 independent Expected；未经授权不得改本 Schema 或创建发布包。
- 最小验证：人工核对本审计引用的 JSON Pointer 与候选 Schema 当前字段一致，并确认其引用的来源审计仍是非发布候选。此处不运行产品测试。
