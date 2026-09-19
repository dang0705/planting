# P0 植物分类权威来源与身份审计证伪

> ticket：`z8v0kmr96x`  
> 执行时间：2026-09-19（Asia/Shanghai）  
> 目标：证伪“已有代表样本即可支撑 Phase 1 全量发布”的错误命题，而非为当前候选集背书。

## 结论

**ticket 证伪结论：`PASS`。当前身份准入结论：`STOP / NOT_ADMITTED`。** 官方来源可支持代表样本的分类模型检查，却不能满足当前 active release 的全量准入要求；这两项结论不能混写。

`P0-taxonomy-evidence-z8v0kmr96x.json` 与 `evidence/p0-taxonomy/*.body` 保存了本轮可取得的 WFO/RHS 2xx 原始响应。它只覆盖 6 组本地记录，绝不推断 200 条全量通过。

## 八类验收要求到六组样本的映射

一个样本可以覆盖多个分类维度；这只减少代表样本数，不减少任何一条全量身份的证据要求。

| 验收类别 | 样本组 | 为什么覆盖 | 当前身份准入 |
|---|---|---|---|
| 科 | ID 1 `Epipremnum aureum` | WFO parent chain 为 Araceae → Epipremnum → species | `QUARANTINE`：缺可用 POWO/WCVP 原始 record 制品 |
| 属 | ID 112 `Lithops spp.` | WFO 2xx body 是 Lithops genus，parent 为 Aizoaceae | `QUARANTINE`：属级证据不能变成具体 species |
| 种 | ID 1 `Epipremnum aureum` | 同一 WFO 链末端为 species | `QUARANTINE`：代表样本不等于全量放行 |
| 种下 | ID 181/182 `Brassica rapa subsp. chinensis` | WFO chain 含 Brassica rapa 与该 subspecies | `QUARANTINE`：与 POWO/WCVP synonym 结论冲突 |
| 杂交 | ID 131 `Viola × wittrockiana` | POWO 官方网页检索确认 hybrid 名称与稳定 ID | `QUARANTINE`：POWO 直接 403，未取得可回放 2xx hybrid/亲本证据 |
| 栽培品种 | ID 104 `Chlorophytum comosum 'Bonnie'` | RHS 191491 的 2xx body；RHS guide 表述为 compact cultivar | `QUARANTINE`：RHS 为 `NO_VERSION_PUBLISHED`，且未取得适用 ICRA/物种 parent 证据 |
| 异名 | ID 1 `Epipremnum aureum` | WFO body 列出 Pothos aureus 等 synonyms | `QUARANTINE`：别名事实不等于 release 准入 |
| `spp.` | ID 112 `Lithops spp.` | 同一属级样本证明 `spp.` 不指向 concrete species | `QUARANTINE`：合同禁止把它作为具体种 |

| 验收项 | 结果 | 证据与裁决 |
|---|---|---|
| 八类代表样本 | `PARTIAL` | 有可审计的样本和明确的负向隔离决定；杂交的 POWO 请求为 403，不能作为放行证据 |
| 无法证明可进入 `QUARANTINE` | `PASS` | manifest 中所有样本均明确给出 `QUARANTINE`，未作自动补全或归并 |
| 来源版本与哈希可回放 | `FAIL` | WFO/RHS 可记录当次响应 body hash，但原始制品未保存；POWO 被 403 拒绝，不能以拒绝页 hash 冒充分类证据 |
| 冲突不由模型自动裁决 | `PASS` | `Brassica rapa subsp. chinensis` 的 WFO/POWO-WCVP accepted/synonym 冲突保持隔离 |

## 来源与原始引用边界

- WFO 的稳定 ID 与页面引用年份为 `WFO 2026`；Epipremnum、Brassica 的 HTTP 200 响应分别记录 body SHA-256。Lithops 页面首次为 HTTP 200，但同 URL 的 body 获取返回 500，故没有捏造成功 body hash。
- RHS `191491` 的 HTTP 200 body hash 已记录；页面没有可见 release version，不能把访问时间伪装成版本。RHS 页面与官方 guide 支持它是 cultivar 的展示/园艺事实，但不替代物种 parent 的权威分类证据。
- POWO/WCVP 官方页面的检索结果显示 WCVP 2026、稳定 ID 和部分分类结论；本机直接 HTTP 请求为 403。403 body hash 仅记录访问边界，**不是**权威分类 record hash。
- ISHS ICRA 目录没有产出能证明 `'Bonnie'` 注册状态的适用记录；不能从“未找到”推导为未注册或已注册。

## 核心证伪

1. `Epipremnum aureum` 可由 WFO 读到 Araceae → Epipremnum → species 及异名；它证明别名关系必须独立保存，**不证明**其余候选身份。
2. `Lithops spp.` 只支持 genus/species-group 候选，不能自动生成具体种。
3. `Brassica rapa subsp. chinensis` 在 WFO 为种下分类链，而 POWO/WCVP 的官方检索结果称其为 `Brassica rapa` synonym；冲突未裁决前必须隔离。
4. `Viola × wittrockiana` 是杂交命名；缺失可回放 POWO 2xx record 和 hybrid formula/亲本关系时不得发布为 species。
5. `Chlorophytum comosum 'Bonnie'` 的 RHS 园艺资料不足以自动满足分类/注册/parent 证据；保持隔离。
6. `Crassulaceae 等` 没有单一 taxon，直接隔离。

## 给 P1 的固定输入

任何 v2 active release identity 必须具备：可保存并读回的原始权威响应、来源版本、稳定 taxon ID、明确 rank、完整 parent chain、accepted/synonym 关系、冲突决定、别名歧义结论和审核决定。缺任一项即 `QUARANTINE`，并且 catalog、identify、CMS、care、diagnosis 不得读取。

下一步不是扩大样本推断，而是对 200 条候选逐条制作 evidence manifest，先解决 R0/R1、8 个重复科学名组、Brassica 冲突及 alias/match-rule 孤儿，再做空库导入、持久化读回和真实 API 隔离验证。
