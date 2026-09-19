# P0 植物分类权威来源与身份审计证伪：最终独立出口门

> ticket：`z8v0kmr96x`  
> 独立复验时间：2026-09-19 23:17（Asia/Shanghai）  
> 复验结论：**`PASS`（P0 证伪出口）**  
> 身份准入：**`STOP / NOT_ADMITTED`**  
> active release：**`STOP`**

本 gate 的 `PASS` 只表示 ticket 的代表性证伪、原始制品可读回、负向边界和隔离规则已经通过独立复验；它不表示任何候选身份获得 active release。当前仍必须把候选保持在 `QUARANTINE`，不能把代表证据外推为 200 条全量准入。

## 1. 复验边界与事实源

- 已先读取 `docs/backend-v2/README.md`、`docs/backend-v2/BASELINE.lock` 和 `docs/backend-v2/clickup/ticket-specs.md` 的 P0 分类 ticket。P0 ticket 的验收是：八类代表样本、无法证明时进入 `QUARANTINE`、来源版本与证据哈希可回放、权威来源冲突不由模型自动裁决。
- `node docs/backend-v2/verify-entrypoint.mjs` 通过：Master Plan 为 2111 行，SHA-256 为 `e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428`。
- 随后只读了 `P0-taxonomy-falsification-z8v0kmr96x.md`、`P0-taxonomy-evidence-z8v0kmr96x.json`、`evidence/p0-taxonomy/` 下 manifest 引用的四份 body、现有 SHA-256 sidecar 和旧 `P0-taxonomy-exit-gate.md`。
- 原 falsification 报告及 evidence manifest 未修改。旧 gate 中关于“原始 body 未保存、Lithops 无 hash、缺逐类映射”的结论属于修复前状态；本 gate 以当前仓库内的四份 body、manifest 字段和独立读回为准，不以旧 gate 的缺口文字覆盖现状。

## 2. 八类到六组映射

八类验收要求全部有明确的 `localRecordIds` 映射；同一组被多个类别复用只减少样本组数量，不减少逐条身份证据要求。六组中的 ID 32 是额外的混合群组负例，不冒充八类中的具体 taxon。

| 验收类别 | manifest 样本组 | 可回放的覆盖理由 | 当前准入 |
|---|---|---|---|
| 科 | ID 1：`Epipremnum aureum` | WFO body 含 `Araceae → Epipremnum → Epipremnum aureum` | `QUARANTINE` |
| 属 | ID 112：`Lithops spp.` | WFO body 将 `Lithops` 识别为 genus，父级含 `Aizoaceae` | `QUARANTINE` |
| 种 | ID 1：`Epipremnum aureum` | 同一 WFO body 的末端名称为 species | `QUARANTINE` |
| 种下 | ID 181/182：`Brassica rapa subsp. chinensis` | WFO body 的父链含 `Brassica rapa` 与该 subspecies | `QUARANTINE` |
| 杂交 | ID 131：`Viola × wittrockiana` | manifest 保留 POWO/WCVP 稳定 ID 和 hybrid 名称，但请求为 403 | `QUARANTINE` |
| 栽培品种 | ID 104：`Chlorophytum comosum 'Bonnie'` | RHS 191491 body 可读回 cultivar 页面及属/科 parent | `QUARANTINE` |
| 异名 | ID 1：`Epipremnum aureum` | WFO body 明列 `Pothos aureus`、`Rhaphidophora aurea`、`Scindapsus aureus` 等 synonyms | `QUARANTINE` |
| `spp.` | ID 112：`Lithops spp.` | genus body 不能指向 concrete species，保留 `spp.` 隔离 | `QUARANTINE` |
| 混合群组负例（额外） | ID 32：`Crassulaceae 等` | 不是单一 taxon，不能作为具体 species | `QUARANTINE` |

结论：**八类 → 五个复用样本组 + 一个额外负例组 = 六组，映射完整。**

## 3. 四份原始 2xx body 与 manifest 一致性

以下四份制品均存在于仓库，并逐一用文件实际字节数和 SHA-256 与 `P0-taxonomy-evidence-z8v0kmr96x.json` 比对；四项均一致。WFO body 内的引用页显示 `WFO (2026)` 和 `Accessed on: 19 Sep 2026`，RHS body 内的 canonical URL、profile identifier 和 parentTaxon 与 manifest 对应。`HTTP 200` 是本次抓取记录的响应元数据；body 本身不伪造响应头。

| 原始制品 | URL | capturedAt | HTTP | 版本 | stable ID | bytes | body SHA-256 | 复验 |
|---|---|---:|---:|---|---|---:|---|---|
| `epipremnum-wfo.body` | `https://www.worldfloraonline.org/taxon/wfo-0000952367` | `2026-09-19T23:10:26+08:00` | 200 | `WFO 2026` | `wfo-0000952367` | 51017 | `510d8b595a9c892fc4265a4f5c71f4500d39c62155f31f18ed3ebc8a918ec0d6` | `PASS` |
| `brassica-wfo.body` | `https://www.worldfloraonline.org/taxon/wfo-0000571556` | `2026-09-19T23:10:39+08:00` | 200 | `WFO 2026`；页面数据提供者含 Brassicaceae 2022 与 WFO 2026 | `wfo-0000571556` | 28468 | `a6a3833cc8e1d801e886124dca867048ed7ae86f9ad0c37ab458414a7df905d9` | `PASS` |
| `lithops-wfo.body` | `https://www.worldfloraonline.org/taxon/wfo-4000021986` | `2026-09-19T23:10:45+08:00` | 200 | `WFO 2026` | `wfo-4000021986` | 31116 | `fac0f0c822e617335a27fbe4885e19623962956e7d064657774836c1911a0e94` | `PASS` |
| `rhs-bonnie.body` | `https://www.rhs.org.uk/plants/191491/chlorophytum-comosum-bonnie-v/details` | `2026-09-19T23:10:51+08:00` | 200 | `NO_VERSION_PUBLISHED` | `RHS plant profile 191491` | 206652 | `88fec6d7e5fe596a9b9a4ffedfdbfe2b77b727942e48c9f23a10b8b7b2aec7c2` | `PASS` |

逐项 body 检查结果：

- `epipremnum-wfo.body`：稳定 ID、学名、WFO 2026、访问日、Araceae/Epipremnum 父链及三条代表异名均在 body 中可读回。
- `brassica-wfo.body`：稳定 ID、学名、WFO 2026、访问日、Brassicaceae/Brassica/Brassica rapa 父链均在 body 中可读回。
- `lithops-wfo.body`：稳定 ID、`Lithops`、WFO 2026、访问日、Aizoaceae、`Included Species` 均在 body 中可读回；因此修复后的 Lithops 2xx body 可回放。
- `rhs-bonnie.body`：canonical URL、identifier `191491`、`Chlorophytum` genus parent 和 `Asparagaceae` family parent 均在 body 的 JSON-LD 中可读回。页面没有发布来源版本；manifest 的 `NO_VERSION_PUBLISHED` 是明确的负向版本状态，不把网站代码版本 `1.130.0` 冒充分类来源版本。

2026-09-19 23:17:25+08:00 对 Lithops URL 的现场 GET 返回 HTTP 200、最终 URL 与 manifest 一致，且 stable ID、学名、WFO 2026、Aizoaceae 和 Included Species 可读回。WFO 页面包含动态 `jsessionid`，现场响应的传输内容因此不用于替换已保存 body 的 SHA；仓库内保存的原始制品仍以 manifest 的 31116 bytes 与上述 SHA 为准。

## 4. sidecar 与完整性

以下既有 sidecar 均独立执行 `sha256sum -c` 并通过：

- `P0-taxonomy-falsification-z8v0kmr96x.sha256` → `P0-taxonomy-falsification-z8v0kmr96x.md`：`PASS`。
- `P0-taxonomy-evidence-z8v0kmr96x.sha256` → `P0-taxonomy-evidence-z8v0kmr96x.json`：`PASS`。
- 本文件对应的 `P0-taxonomy-exit-gate.sha256` 在本 gate 写入后重新计算：`PASS`。

四份 body 没有额外隐藏的 per-body sidecar；它们的字节数和 SHA 已由 manifest 的 `evidenceArtifacts` 行级字段及本次实际读回直接覆盖。POWO 403 的 hash 不在四份 2xx body 集合内，也不作为分类 evidence。

## 5. 负向边界、冲突与身份准入

| 检查项 | 判定 | 独立裁决 |
|---|---|---|
| POWO/WCVP 403 是否被当作分类证据 | `PASS` | ID 131 的 403 只证明当前访问被拒绝；其 hash 只能做访问边界，不证明 hybrid、亲本或 formula。ID 131 保持 `QUARANTINE`。 |
| RHS 无来源版本 | `STOP`（身份准入） | `NO_VERSION_PUBLISHED`；访问时间和网站代码版本不能替代来源版本。RHS 页面可支持园艺 cultivar 事实，但不能单独放行分类/注册身份。 |
| Brassica 跨来源冲突 | `STOP`（身份准入） | WFO body 保留 infraspecific accepted 链；POWO/WCVP 结果被记录为 synonym 冲突，但 endpoint 为 403。未由模型自动裁决，ID 181/182 保持 `QUARANTINE`。 |
| 代表样本是否外推为 200 条 | `PASS`（边界） | manifest 明确 `scope` 为代表性证伪，`sources=6`；没有声明 200 条通过，所有样本 decision 均为 `QUARANTINE`。 |

因此，ticket 证伪完成与身份准入 STOP 是两个并行结论：

1. **ticket 证伪：`PASS`**。代表样本足以支撑 Phase 1 全量发布这一命题已被证伪；可回放 body、映射、403 非证据边界、RHS 版本缺失和冲突隔离均有明确制品或负向裁决。
2. **身份准入：`STOP / NOT_ADMITTED`**。POWO/WCVP 没有可回放的 2xx 分类 record，RHS 没有发布版本及适用 ICRA/物种 parent 的完整权威证据，Brassica 冲突未解决；当前候选不得进入 active release。

## 6. 范围与后续硬门

- 本 gate 只覆盖 P0 的代表性证伪和 evidence replay，不是 200 条候选的全量 authority manifest。
- P1 必须对 200 条候选逐条建立 evidence、stable ID、rank、parent chain、accepted/synonym、冲突决定和审核决定；缺任一项继续 `QUARANTINE`。
- 在身份准入 STOP 解除前，catalog、identify、CMS、care、diagnosis 不得读取这些隔离身份；不得以本 gate 的 `PASS` 绕过该硬门。
