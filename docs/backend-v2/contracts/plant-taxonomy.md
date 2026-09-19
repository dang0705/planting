# 植物分类与身份合同

- 合同版本：`plant-taxonomy/v1`
- 所有者：`plant-knowledge`
- 目标：把“权威分类实体”“青花植产品身份”“展示百科”“内部养护/安全/诊断知识”分层，禁止互相覆盖。

## 四层模型

1. 权威分类实体。
2. 青花植产品身份。
3. 展示型百科。
4. 内部养护、安全和诊断知识。

四层的写入权限相互隔离：

- 权威分类实体只能由经过审计的权威来源证据和人工裁决更新。
- 青花植产品身份引用一个或多个经裁决的分类实体，用于识别确认和产品展示。
- 展示百科可以由 CMS 补缺流程生成草稿，但不能反向修改分类实体或产品身份。
- 养护、安全、毒性和诊断知识必须内部维护；Qwen 展示草稿无权写入。

## 权威来源

- POWO/WCVP：并列的主要分类依据；两者冲突时必须进入 `QUARANTINE` 并由人工审核，不得自动择一。
- WFO：稳定标识和交叉核对，不能覆盖 POWO/WCVP 的冲突裁决。
- RHS/ICRA：只负责栽培品种和园艺组，不能单独建立物种级分类事实。
- 中文名：展示和别名，不参与分类唯一性判断。

每条权威分类实体至少保存：

```ts
export type PlantTaxon = {
  /** 青花植内部公开分类引用，不是数据库主键。 */
  taxonRef: string
  /** 权威来源代码；不同来源按上方角色分工，不能用简单顺序自动覆盖冲突。 */
  authoritySource: 'POWO' | 'WCVP' | 'WFO' | 'RHS_ICRA'
  /** 来源提供的稳定标识；与 authoritySource 组成唯一键。 */
  authority_taxon_id: string
  /** 来源中的接受名；必须保留作者串和原始拼写证据。 */
  acceptedScientificName: string
  rank: 'family' | 'genus' | 'species' | 'subspecies' | 'variety' | 'form' | 'hybrid' | 'cultivar' | 'species_group'
  /** 除 family 外必须指向同一审计批次中可验证的父级。 */
  parentTaxonRef?: string
  sourceVersion: string
  retrievedAt: string
  evidenceHash: string
  reviewStatus: 'ACTIVE' | 'QUARANTINE' | 'REJECTED'
}
```

## 分类等级

`family / genus / species / subspecies / variety / form / hybrid / cultivar / species_group / unknown`

`spp.` 只能表达属级或物种组，不能作为具体 species。

固定约束：

- `(authority_source, authority_taxon_id)` 唯一。
- 科、属、种及种下等级必须形成可验证父链；缺父链不得 ACTIVE。
- 多个产品身份可以共享一个分类实体；商品名不能冒充权威分类实体。
- 同一规范身份可有多个中文名、学名异名和市场别名；名称是独立记录，不靠字符串外键关联。
- 来源冲突不能自动择一；必须进入人工审核并保存裁决依据。

## P1 分类身份准入硬门

以下谓词是 `plant-knowledge` 域在构建 taxonomy 不可变 release 时必须同时满足的合同；它不授权把任何遗留候选转为 `ACTIVE`。

```text
authority key 唯一
AND 同一 authority key 的已核验原始证据
AND accepted/synonym 状态与独立名称记录一致
AND 完整、可核验的父链摘要
AND 不存在未裁决冲突或别名歧义
AND 最新不可变审核裁决为 ACTIVE
AND release item 锁定证据、父链与裁决摘要
→ 才可写入 taxonomy release
```

- 权威键固定为 `(authority_source, authority_taxon_id)`；证据记录必须绑定同一分类实体和同一权威键，不能以相似名称或供应商名称替代。
- `accepted` 与 `synonym` 是分类名称状态，不是展示标签；必须由分类实体、独立名称记录和权威证据共同表达。
- `family / genus / species / subspecies / variety / form / hybrid / cultivar / species_group` 是可落库的受控分类等级。`spp.` 只允许表达属级或物种组，绝不能以 `species` 进入准入；混合群组不是单一 taxon。
- 除科级外，父级引用和每条 parent 边的原始证据必须形成完整、可复算的父链摘要；父链缺失、断裂或跨审核批次时只能 `QUARANTINE`。
- `hybrid`、`cultivar` 与 `species_group` 仍须具备其各自的父级或园艺登记证据和人工裁决；不能因名称格式看似完整而跳过证据。
- taxonomy release item 只能写入审核状态为 `ACTIVE` 的对象，并锁定证据清单 SHA-256、父链 SHA-256 和裁决引用；`QUARANTINE`、`REJECTED`、`unknown`、混合群组和遗留 CSV 行均不得写入 release item。
- 这组 DDL 静态约束防止错误结构被写入；跨行的完整父链、最新裁决和 release 输入一致性仍须由后续 Repository 事务和真实 MySQL 读回验证，不能被静态检查或 HTTP 200 冒充已经验证。

## 身份状态

```text
unidentified → candidate_pending → confirmed
```

无法证明的记录进入 `QUARANTINE`，不得被识别、CMS、养护或诊断读取。

## 产品身份与候选确认

- 百度植物识别、Qwen、客户端输入都只能产生身份候选，不能修改 `plant_taxa`、审核状态或 active release。
- 用户确认只能选择已经发布且未隔离的青花植产品身份。
- 用户植物当前身份只允许 `unidentified / candidate_pending / confirmed`；`superseded` 只属于身份历史。
- 识别供应商名称必须先经别名和候选映射，证据不足时保持较粗层级或 `unidentified`。

## 发布与读取

- 公开 API、CMS 发布、养护、诊断与 Agent 工具只读取不可变 active release。
- release 必须记录输入清单、证据清单、裁决版本、生成时间和 SHA-256。
- `QUARANTINE`、`REJECTED`、无来源或父链错误的记录不能进入 release。
- 发布切换使用单一指针，不允许原地改写历史 release。
