# P-1 植物分类字段模型、风险分层与 quarantine 门审计

> ticket：`z8v0kmr96v`（`[P-1] 植物分类权威来源与身份准确性审计`）  
> 运行时 agent：`/root/run_taxonomy_audit_luna`  
> 审计时间：2026-09-19（Asia/Shanghai）  
> 范围：只读模型审查、风险分层、隔离门合同、权威证据模板和最小抽样方案；没有修改业务代码、公共合同、Expected、DDL、CMS 或数据库。

## 0. 结论先行

本轮不把“尚未完成全量权威证据”笼统写成环境阻断。以下本地工作已经完成：

1. 对 200 条目录输入的字段模型、rank 表达、重复键、别名和下游映射完成审查。
2. 形成互斥风险分层和 11 条最小抽样方案。
3. 形成仅供评审的 quarantine 隔离门合同；未写入代码或数据库。
4. 使用公开的 POWO/WCVP、WFO 和 RHS 页面完成代表性样本的来源登记，记录稳定 ID、来源版本/页面访问时间、父链和原始响应 SHA-256。
5. 纳入主代理提供的 CloudBase 实时只读读回，作为线上状态证据，不自行登录或读取凭证。

当前状态应拆成三项，而不是混为一个 STOP：

| 项目 | 状态 | 说明 |
|---|---|---|
| 本地字段模型与风险审查 | `COMPLETE` | 200 条输入、mapper、运行时查询和静态 DDL 已读回 |
| quarantine 门合同 | `DRAFT_FOR_APPROVAL` | 合同已形成，尚未进入实现；隔离记录不得进运行时 |
| v2 active release | `NOT_ADMITTED` | 仍需完成全量权威证据、冲突处置、空库读回和主代理验收 |

唯一明确的外部环境剩余项：ClickUp MCP 仍为 `100/100` 限流（无法写状态/评论）；CloudBase 登录、续期和授权由主代理统一处理。本报告不执行这些操作。

## 1. 输入与证据等级

### 1.1 本地输入哈希

| 输入 | SHA-256 |
|---|---|
| `docs/backend-v2/phases/P-1-audit.md` | `eb968b32823d3e76c8c3d9dcab0cc8ef786ab72be660934c084c9ce4e96d0090` |
| `docs/backend-v2/data/phase-1-identity-audit.md` | `0977a615567874053cfe6bfee980b08b4cb113348c7db4a4088c7bc996f21725` |
| `docs/backend-v2/contracts/plant-taxonomy.md` | `4146ac534569927b84343e401f204248d05d38f341b7c9d5ea0e323512df2e69` |
| `docs/plant_catalog.csv` | `de5ad55fa4589ac56481ce684b030d46213fc2bf6d3838d5217248c813f3fac1` |
| `src/data-system/config/tables.js` | `7ecd0e15cbba239e68b26f1305307aff24bdf0a29a25e53b740de27a9b578143` |
| `src/data-system/importer/excel-importer.js` | `13198a82b3d9eb2eea98251afece44416f36a3c58333c580911eab1f1176b418` |
| `cloudfunctions/layer/utils/plant-knowledge.js` | `bfc1a0b46c02a45fb80d1241964843c043f5bac89c816e904f276219e8456ff3` |
| `cloudfunctions/plant-catalog-http/app.js` | `695f7c0e3eae1a387c226dd4cf0cfb83f111f0de688a13775f00f1be01a88917` |
| `cloudfunctions/identify-http/app.js` | `2307d38711748c5c229cfde0c34c89ab0e4f7fdac3809c3e0adceb5d5ef32a6a` |
| `cloudfunctions/layer/utils/identify-runtime.js` | `eb2cda274b011b6ad4350e6faa3d58e4e32ab643562f1f2e6165c0fbffb72476` |
| `scripts/sql/ensure-formal-taxonomy-tables.sql` | `86e7c3a77861590f8df6a5088b939c35bcbe6476fbcff8fc96ae29e177c40d11` |
| `docs/plants_v13_user_friendly_full_v7.xlsx` | `aa41c7cf1f97be22a3f35e4ca9cc8def65ded9e1b33067a5f613dfeedd2d8d20` |
| `docs/genus_care_profile.csv` | `63cf2e16ffbd21170d3bf7f6cb660226eaa3097594b1cd87e15c6a03ff145032` |

### 1.2 线上证据边界

以下数值由主代理在 2026-09-19 22:33（Asia/Shanghai）提供的 CloudBase 只读读回得到；本 agent 没有登录、续期、读取凭证或执行云端查询：

- `plant_identity_entities`：192 条；`genus=9`、`species=183`。
- 192 条全部为 `review_status=pending` 且 `is_active=1`。
- `data_source` 全部为 `plant_catalog.csv`。
- `family` 缺失 5 条；`species` 缺失 9 条（对应 9 条 genus-level 记录）。
- `plant_identity_aliases`：400 条；其中 16 条孤儿引用。
- `plant_identity_match_rules`：400 条；其中 16 条孤儿引用。
- CMS 模型存在：entities、aliases、match_rules；未读到隔离门、权威证据或父链模型。

这组读回证明当前线上候选状态，不等于 release 通过；它也与本地 mapper 的 `pending + active` 默认行为一致。

## 2. 200 条输入的字段模型审查

### 2.1 现有源字段

`RAW_PLANT_CATALOG_COLUMNS`（`src/data-system/config/tables.js:26-40`）只有：

```text
session_plant_id, primary_display_name, cover_image_ref,
basic_description, category_name_cn, category_name_en,
scientific_name, family_name_cn, family_name_canonical,
genus_name, session_status_flag, session_reserved_field,
created_at, updated_at
```

缺少 v2 分类身份所需的：

- `rank`、accepted/synonym 关系和 nomenclatural status；
- `authority_source`、稳定 `authority_taxon_id`、source version；
- 父链的 family/genus/species/infraspecific IDs；
- 权威来源获取时间、原始响应地址和证据 SHA-256；
- alias 类型、别名来源、ambiguity 状态；
- cultivar/garden group/hybrid formula；
- `QUARANTINE` 原因和 release decision。

### 2.2 mapper 的可观察行为

`inferIdentityLevel()`（约 108-118 行）只有 `genus/species/unknown` 三类，不能识别 `subspecies/variety/form/hybrid/cultivar/species_group`。当前 200 行按 mapper 生成 191 条 species、9 条 genus。

`extractSpeciesName()`（约 120-130 行）会把 `var. grossum`、`subsp. chinensis`、`× wittrockiana`、`'Bonnie'` 和 `等` 作为 species name 的尾部，而不是独立 rank 或混合类群。

`mapPlantIdentityEntity()`（约 161-194 行）固定写入：

```text
is_active = 1
review_status = pending
data_source = plant_catalog.csv
version = null
```

alias mapper 只产生中文展示名和 scientific name 两类 alias；reserved field 中的 `招财树`、`黑金刚` 没有进入 alias 关系。diagnosis link mapper 对身份、属、科链接固定写为 reviewed/active，但没有权威身份门。

### 2.3 当前输入的互斥分类

| 类别 | 数量 | 记录 |
|---|---:|---|
| `spp.` | 9 | 19、28、31、41、54、63、66、112、156 |
| `variety` | 6 | 12、69、70、180、183、195 |
| `subspecies` | 3 | 181、182、192 |
| hybrid/`hybrida`/`hybridum` | 8 | 131、132、133、145、147、155、157、196 |
| cultivar 字符串 | 4 | 104、197、198、199 |
| mixed/group string | 1 | 32：`Crassulaceae 等` |
| 未显式特殊等级 | 169 | 不是已证明的 species，只是剩余输入 |

本分类是输入风险分层，不是权威分类结论。

## 3. 200 条记录风险分层

风险层可以重叠；任何一层命中都不能直接 release。

### R0：语义层级高风险，必须先隔离（31 条）

包含 `spp.`、种下分类、杂交、栽培品种和混合类目：

```text
12, 19, 28, 31, 32, 41, 54, 63, 66, 69, 70,
104, 112, 131, 132, 133, 145, 147, 155, 156, 157,
180, 181, 182, 183, 192, 195, 196, 197, 198, 199
```

最低处置要求：

- `spp.` 只能成为 genus 或 species_group 候选；
- `variety/subspecies` 必须保留 rank 和 parent taxon；
- hybrid 必须记录 hybrid status/formula 或进入 quarantine；
- cultivar 必须有 RHS/ICRA 园艺证据和物种 parent；
- `Crassulaceae 等` 只能 quarantine，不能作为 species。

### R1：父链/唯一键/归属冲突

缺 canonical family：`23、24、26、27、32`。

重复科学名 8 组、16 条：

```text
Hydrocotyle vulgaris                 14, 68
Nelumbo nucifera                     65, 165
Brassica rapa subsp. chinensis       181, 182
Solanum lycopersicum var. cerasiforme 69, 195
Syngonium podophyllum                45, 75
Philodendron hederaceum              46, 76
Thaumatophyllum bipinnatifidum       47, 77
Aglaonema modestum                   9, 72
```

R1 不能自动归并：需要确定是同一权威 taxon 的产品别名、重复记录、园艺商品身份还是错误分类。

### R2：未显式特殊等级但缺 authority evidence（169 条）

这些行看起来像双名，但没有权威 source ID、父链或版本证据；不能把语法形态当作分类学确认。所有 R2 行均需经过最小字段模板和唯一 key 检查。

### R3：当前线上完整性风险

主代理实时读回显示 192 条实体全部 `pending + active`，且 aliases/match_rules 各有 16 条孤儿引用。R3 是运行时和持久化风险，不依赖某一条植物名称是否正确；在隔离门落地前，任何强 alias 命中都不能视为正式身份确认。

## 4. quarantine 隔离门合同（仅供评审，未实现）

### 4.1 记录状态

沿用 taxonomy 合同的确认路径：

```text
unidentified → candidate_pending → confirmed
                         ↘ QUARANTINE
```

`QUARANTINE` 不是 pending 的别名，而是明确的非运行时状态。它可以被审计、补证和重新判定，但不能被 catalog、identify、CMS、care 或 diagnosis 读取。

### 4.2 最小 evidence 对象

建议的只读合同形状：

```text
taxonomy_evidence = {
  evidence_id,
  local_source_record_key,
  local_name_raw,
  normalized_name,
  authority_source,
  authority_record_url,
  authority_taxon_id,
  source_version,
  retrieved_at,
  evidence_sha256,
  accepted_name,
  accepted_taxon_id,
  nomenclatural_status,
  rank,
  parent_chain: [{ rank, taxon_id, name }],
  synonym_of_taxon_id,
  crosscheck_source,
  crosscheck_taxon_id,
  crosscheck_version,
  alias_evidence,
  conflict_status,
  review_decision,
  quarantine_reason,
  reviewed_at
}
```

`evidence_sha256` 必须是保存的原始响应字节 SHA-256；如另行做规范化 JSON，应增加独立的 `canonical_record_sha256`，不可用规范化摘要冒充原始响应哈希。

### 4.3 release predicate

只有同时满足下列条件，身份才允许进入 active release：

```text
authority_source in {POWO/WCVP, WFO, RHS, ICRA}
AND source_version IS NOT NULL
AND authority_taxon_id IS NOT NULL
AND rank IN {family, genus, species, subspecies, variety, form,
             hybrid, cultivar, species_group}
AND parent_chain_complete = true
AND authority_evidence_hash_verified = true
AND (authority_source, authority_taxon_id) UNIQUE
AND alias_ambiguity = false
AND conflict_status = 'resolved'
AND review_decision = 'confirmed'
AND quarantine_reason IS NULL
```

以下任意情况都必须隔离：

```text
source/version/ID/parent chain missing
rank unknown or mixed
spp. represented as concrete species
unverified cultivar or garden group
unresolved accepted/synonym conflict
duplicate authority key
ambiguous strong alias
evidence hash mismatch
```

### 4.4 运行时门

这是合同要求，不是本轮实现：

1. catalog list/detail/match 只能读取 release predicate 为 true 的身份。
2. identify 的 `matchScore >= 3` 不能单独产生 `formally_admitted`；必须先通过 release predicate。
3. quarantine/pending 只能作为内部审计结果，不能进入公开响应、CMS、care 或 diagnosis。
4. diagnosis/care links 必须引用已 release 的权威 identity key；不能因 link 行自身标记 `reviewed` 而绕过 identity gate。
5. gate 拒绝必须写结构化原因码，例如：

```text
TAXONOMY_SOURCE_MISSING
TAXONOMY_VERSION_MISSING
TAXONOMY_PARENT_CHAIN_INCOMPLETE
TAXONOMY_RANK_UNRESOLVED
TAXONOMY_SPP_NOT_GROUP
TAXONOMY_CULTIVAR_UNVERIFIED
TAXONOMY_AUTHORITY_CONFLICT
TAXONOMY_DUPLICATE_KEY
TAXONOMY_ALIAS_AMBIGUOUS
TAXONOMY_EVIDENCE_HASH_MISMATCH
```

## 5. 权威来源证据模板与已完成代表性样本

### 5.1 来源规则

| 来源 | 用途 | 必存字段 |
|---|---|---|
| POWO/WCVP | 主分类、accepted/synonym、rank、父链 | POWO/LSID ID、WCVP/POWO 版本、URL、accepted status、父链、抓取时间、原始响应 SHA-256 |
| WFO | 稳定 WFO ID 和交叉核对 | WFO ID、WFO release/citation 年份、accepted/synonym、父链、URL、抓取时间、原始响应 SHA-256 |
| RHS | 园艺展示、cultivar/园艺组资料 | RHS profile ID、名称状态、物种 parent、family/genus、URL、页面访问时间、原始响应 SHA-256 |
| ICRA | cultivar/garden group 注册证据 | 注册机构、register 名称/年份、注册号或稳定记录标识、parent species、URL/快照和证据 SHA-256 |

### 5.2 官方样本登记

抓取时间：`2026-09-19T14:37:57Z`。以下哈希是当次官方页面原始 HTTP 响应字节哈希，不等于平台永久快照；后续 release 必须保存原始响应制品并重新读回。

| 本地样本 | 官方来源与稳定 ID | 读回事实 | 父链/冲突 | 原始响应 SHA-256 |
|---|---|---|---|---|
| ID 1 `Epipremnum aureum` | POWO `urn:lsid:ipni.org:names:87014-1`；WFO `wfo-0000952367` | POWO accepted species；WFO 页面为 accepted name | Araceae → Epipremnum → species；可作为正常 species 样本 | POWO `0079071997947f76775d5542b7992f7127aadcfdb24b36f83a17e77437169a22`；WFO `b58397eb64123e2ac8afbfbde0445939b89143012137edd4888a973601295060` |
| ID 112 `Lithops spp.` | POWO genus `16237-1`；WFO genus candidate `wfo-4000021986` | POWO accepted genus；不能指定 concrete species | Aizoaceae → Lithops；本地记录应为 genus/species_group 候选 | POWO `dd78c454faa3b84ff0a0189077584e7d29833ab2018f5b26d38d5412c67345d0`；WFO `b6c9d77d0e33f3280be19c35b719c4f1862ca4a4bf8dd25aaf9e6b1c67e2ef82` |
| ID 23 `Rosa chinensis` | POWO `urn:lsid:ipni.org:names:732029-1` | accepted species；页面列出 53 synonyms | Rosaceae → Rosa → Rosa chinensis；解释本地 family canonical 缺失，但不能直接回填而不保留 evidence | `83ac5858018bb08c22ae836a97ec522e5f55ac9a2738dcc4cd5601412726bacc` |
| ID 181/182 `Brassica rapa subsp. chinensis` | POWO `urn:lsid:ipni.org:names:953223-1`；WFO `wfo-0000571556` | POWO 明确称该名称是 `Brassica rapa` 的 synonym；WFO 页面称其为 accepted infraspecific taxon | Brassicaceae → Brassica → Brassica rapa；存在 accepted/synonym 跨源冲突，必须 quarantine | POWO `47460c37986ba75c0ee9050db1b06378c63af92426cc08bae92a1825482db257`；WFO `7f4050ca382cc5c74a18947d46ed67762f353cb81774daa05f5ce99fadd6827d` |
| ID 131 `Viola × wittrockiana` | POWO `urn:lsid:ipni.org:names:869552-1` | artificial hybrid；页面给出 hybrid formula | hybrid 不是 species；需保留 parent formula 和 hybrid rank | `4ba1da7007602ae487cbb5aa7b0a2063909a26e697c2afe214d02cf4ec70fbe3` |
| ID 104 `Chlorophytum comosum 'Bonnie'` | RHS profile ID `191491`；物种 parent POWO `urn:lsid:ipni.org:names:532810-1` | RHS profile Name Status=Accepted，明确为 cultivar profile；family Asparagaceae、genus Chlorophytum | cultivar 必须与 species parent 分离；本样本尚未取得 ICRA registration record | RHS `88fec6d7e5fe596a9b9a4ffedfdbfe2b77b727942e48c9f23a10b8b7b2aec7c2`；POWO parent `1b75e62bd2d70a38fa60c2663fe6a1c6ae5be87b9c436cdb24ce1bb449110580` |
| ID 14/68 `Hydrocotyle vulgaris` | 待以 POWO/WFO 取同一 authority key | 用于重复产品/别名/merge-or-split 检验 | 两个 local rows 不能因同名自动删除；必须同一 authority key 后再决定 merge | 待抓取 |
| ID 32 `Crassulaceae 等` | 不查询具体 taxon | local mixed/group string | 不属于可发布 species/rank；直接 quarantine | 不适用 |

样本结论：官方样本已证明字段模型必须支持 genus、species、infraspecific、hybrid、cultivar、synonym 和 cross-source conflict；它们不能共用当前二值 `genus/species` 模型。`Brassica rapa subsp. chinensis` 是已确认的冲突样本，不应在冲突未解决时进入 release。

## 6. 最小抽样方案

最小抽样为 11 条 local records，覆盖 10 个风险类别（重复组占两条）：

| 样本 | 覆盖目标 | 通过条件 |
|---|---|---|
| ID 1 | 正常 species、family/genus parent chain | accepted taxon、完整父链、唯一 key、双源一致 |
| ID 112 | `spp.`/genus-group | 不生成 concrete species；保留 genus 或 species_group |
| ID 23 | family 缺失的具体 species | authority parent 可回读，local missing field 不靠猜测补齐 |
| ID 181、182 | infraspecific + duplicate + synonym conflict | 记录 POWO/WFO 冲突，保持两条 local product identity，未决前 quarantine |
| ID 12 | variety | rank、parent species、accepted/synonym 状态齐全 |
| ID 131 | hybrid | hybrid rank、formula/parent relation 齐全 |
| ID 104 | cultivar | RHS profile 与 species parent 齐全；没有 ICRA 证据则保持 quarantine |
| ID 14、68 | exact duplicate product rows | authority key、display aliases、merge/split decision 可回放 |
| ID 32 | mixed family/group string | 必须拒绝进入 species、CMS、care、diagnosis |

抽样执行规则：

1. 每行保存原始 local value、规范化值、source URL、stable ID、rank、accepted/synonym、完整 parent chain、抓取时间和 raw SHA-256。
2. 任一样本失败，扩展到该风险层全部记录；不允许用 11 条成功样本推断全量通过。
3. `spp.`、mixed、cultivar、cross-source conflict 必须包含 negative assertion：运行时查询返回空/隔离结果。
4. `Rosa chinensis` 的 53 synonyms 可同时覆盖 alias/synonym 关系；不需要伪造本地 synonym 字段。
5. 通过样本后，再按相同模板扩展到全部 200 条；全量 evidence manifest 的 hash 才能成为 release 输入。

## 7. 当前线上状态与隔离门对照

主代理实时读回的 192 条实体全部 `pending + active`，与 quarantine 合同不相容；因此在实现门之前：

- 不能把 `is_active=1` 当作 release admission；
- 不能把 `matchScore>=3` 当作 authority confirmation；
- 不能把 aliases/match_rules 的 400 行读回当作完整性通过，因为各自有 16 条孤儿引用；
- 不能让 CMS entities/aliases/match_rules 模型成为发布证据，因为缺少 authority evidence、parent chain 和 quarantine state；
- 不能按 192 条实体数量覆盖 200 条源输入，必须解释 8 条重复科学名对应的归并/拆分决定。

## 8. 最小剩余项与责任边界

### 8.1 仅账户/限流或主代理权限导致

1. ClickUp 官方 MCP 当前 `100/100` 限流，无法把本报告、完成度和阻塞状态写回 ticket。
2. CloudBase 登录、续期、凭证和进一步 CMS/MySQL 读回由主代理通过用户 Chrome default/main profile 统一处理；本 agent 不登录、不读取凭证。

### 8.2 不属于账户阻断、仍需完成

1. 保存并冻结上述官方页面为可回放原始 evidence artifact，避免仅依赖动态页面哈希。
2. 对 200 行完成 authority evidence manifest；优先解决 R0/R1，尤其是 POWO/WFO 冲突、cultivar ICRA、重复 key 和 ID 32。
3. 主代理将 quarantine gate 需求映射到 v2 DTO/schema/运行时查询后，补写独立 Expected 和 `unit_fake`/`unit_real_data`/`e2e_real_api` 测试矩阵；本 agent 不修改代码。
4. 对 aliases/match_rules 孤儿引用执行只读定位和回读；任何修复须另行获得授权。
5. 完成主代理验收后，才可把 `NOT_ADMITTED` 改为 release candidate；不能仅因官方样本成功就放行其余 200 条。

## 9. 本轮变更记录

- 业务代码：0 修改。
- 公共合同：0 修改。
- Expected：0 修改。
- DDL/CMS/MySQL：0 写入。
- CloudBase 登录/授权：0 次。
- ClickUp：未写入；受 MCP 限流阻断。
- 新增制品：本报告及其 SHA-256 sidecar。
