# P1 植物分类与身份准入硬门：当前种子逐条裁决

> ClickUp：`z8v0kmr9gm`（`[P1] 植物分类与身份准入硬门`）  
> 审计时间：2026-09-20（Asia/Shanghai）  
> 审计性质：`unit_real_data` 输入完整性与准入审计；不写 CloudBase、CMS、MySQL、公共合同、总 DDL 或运行时代码。  
> Expected 来源：`contracts/plant-taxonomy.md` 的 release 准入谓词、`data/phase-1-identity-audit.md` 的 GO/STOP 条件、P0/P-1 的“代表性证据不可外推”结论。

## 1. 结论

**当前没有任何植物身份种子可准入 v2 active release。**

| 裁决 | 数量 | 含义 |
|---|---:|---|
| `ADMIT` | 0 | 没有一条具备可读回种子行、逐条权威证据、完整父链、冲突裁决与发布输入。 |
| `QUARANTINE` | 200 | 仅保留为待补证或待人工裁决的候选，禁止 catalog、identify、CMS、care、diagnosis 与 Agent 读取；包含 ID 32 的混合群组负例。 |
| `REJECTED` | 0 | 本轮没有擅自作最终删除/拒绝裁决；ID 32 仅被禁止作为单一 taxon 准入，后续如仍有产品展示价值，须走独立 `product_group` 人工建模。 |

逐条裁决的机器可读证据在 [P1-taxonomy-admission-manifest.json](P1-taxonomy-admission-manifest.json)。清单包含 `sourceRecordId=1..200` 的 200 个独立对象，每条均绑定到 `git:HEAD:docs/plant_catalog.csv` 的原始行与行级 SHA-256；**没有通过范围、代表样本或名称字符串推断其他记录**。该历史对象只能作为遗留参考输入，不得恢复到旧路径，更不得直接导入 v2。

## 2. 输入完整性：可复核遗留输入不等于可准入 v2 种子

既有 P-1 审计登记的唯一种子输入是：

| 预期输入 | 预期 SHA-256 | 当前工作树核验 | 裁决 |
|---|---|---|---|
| `git:HEAD:docs/plant_catalog.csv` | `de5ad55fa4589ac56481ce684b030d46213fc2bf6d3838d5217248c813f3fac1` | `git show` 可读，200 条无表头记录；实际 SHA 一致 | `LEGACY_REFERENCE_ONLY` |

这份遗留快照解决了“输入对象无法定位”的问题，但不改变 v2 的语义重建边界：旧 CSV 没有逐条 authority ID、来源版本、原始制品、父链、accepted/synonym 状态、冲突裁决或审核决定。因此，任何后续候选导入都必须先校验其 SHA-256；不匹配即是**新的审计批次**，必须重新生成本清单，不能沿用本轮行号、风险标签或裁决。

## 3. 逐条裁决方法与已知风险覆盖

每一行默认具备两个独立隔离原因：

```text
AUTHORITY_EVIDENCE_MISSING
AND RELEASE_PREDICATE_UNSATISFIED
→ QUARANTINE
```

这不是“旧数据存在即放行”的反向默认值。只有以本快照中的原始行及 SHA-256 精确绑定、逐条补齐下列字段，才可重新送审：权威来源、稳定标识、来源版本、原始响应制品及 SHA-256、明确 rank、accepted/synonym、父链、别名歧义判定、冲突裁决和人工审核决定。

已由 P-1 报告定位的风险行仍被逐行保留为额外标签，不改变上述保守结论：

| 风险层 | 逐条行号 | 本轮结果 |
|---|---|---|
| R0：`spp.`、种下等级、杂交、栽培品种或混合群组 | 12、19、28、31、32、41、54、63、66、69、70、104、112、131、132、133、145、147、155、156、157、180、181、182、183、192、195、196、197、198、199 | 31 条均为 `QUARANTINE`；ID 32 被明确禁止作为单一 taxon 使用，尚不做最终删除裁决。 |
| R1：重复科学名待人工 merge/split | 9、14、45、46、47、65、68、69、72、75、76、77、165、181、182、195 | 全部 `QUARANTINE`；不得按字符串自动去重。 |
| R1：canonical family 缺失 | 23、24、26、27、32 | ID 23、24、26、27 `QUARANTINE`；ID 32 拒绝作为分类种子。 |
| R2：其余未有逐条权威制品的记录 | 其余行号 | 全部 `QUARANTINE`；双名格式不是权威分类确认。 |

P0 的 6 组代表性制品引用只写入清单的 `representativeEvidenceRef`，没有改变任一 `decision`。特别是 ID 1、104、112、131、181、182 虽有部分来源制品，也仍是 `QUARANTINE`；ID 32 的混合群组负例同样保持 `QUARANTINE`，但不得作为单一 taxon 导入或对外读取。

## 4. 已保存的权威制品核验

本次复核了 P0 manifest 引用的四个原始 HTTP 200 body，所有实际字节 SHA-256 均与 manifest 一致：

| 制品 | 结论 | 对本次准入的作用 |
|---|---|---|
| `epipremnum-wfo.body` | `PASS` | 仅可支持 ID 1 的代表性父链/异名风险检查，不能放行。 |
| `brassica-wfo.body` | `PASS` | 保留 ID 181/182 跨源冲突的负向证据，不能自动裁决。 |
| `lithops-wfo.body` | `PASS` | 仅属级，证明 `spp.` 不能被伪装成具体 species。 |
| `rhs-bonnie.body` | `PASS` | RHS 无发布版本且缺 ICRA/物种父级闭环，不能放行 cultivar。 |

POWO/WCVP 的 HTTP 403、网页搜索摘要、百度识别结果与 Qwen 输出都**不是**分类权威原始证据；它们不得进入 `authority_evidence_hash_verified=true` 的判定。

## 5. P1 本地 DDL 静态合同闭环

`002_plant_knowledge.sql` 已以 `plant-taxonomy/v1` 的准入谓词补足以下可静态核验的结构；对应专项 Vitest、RED 证据和出口结论见 [P1-taxonomy-ddl-exit-gate.md](P1-taxonomy-ddl-exit-gate.md)。

| 硬门 | 已冻结的本地 DDL 结构 | 静态边界 |
|---|---|---|
| 权威键与原始证据 | `(authority_source, authority_taxon_id)` 唯一；证据表以复合外键绑定同一 taxon、来源与稳定 ID。 | 不证明原始制品内容真实；仍须读回原始制品并核验 SHA。 |
| accepted/synonym 与名称 | taxon 的命名状态、独立名称类型和权威来源均受 `CHECK` 约束。 | 不自动把同名字符串裁决为同一分类实体。 |
| 等级与父链 | 受控 rank 包含 `hybrid`、`cultivar`、`species_group`；`spp.` 只允许属级或物种组；审核裁决保存完整父链 SHA-256。 | 递归父链完整性、跨审核批次和园艺登记仍须 Repository 事务验证。 |
| 证据、裁决与隔离 | taxon 证据、关系边证据和 taxon 审核裁决均分表保存；`QUARANTINE`/`REJECTED` identity 不得携带 active release 引用。 | 尚未对真实 MySQL 写入做约束拒绝读回。 |
| 不可变 release | release item 锁定证据清单 SHA、裁决引用和 `ACTIVE` 准入状态；active 指针按 release kind 唯一。 | 不证明发布事务、回滚或运行时查询已经实现。 |

这些约束只收紧空库 DDL 合同，不能把 200 条遗留 CSV 参考行变成种子、不能产生 `ADMIT`，也不能替代真实 MySQL 的建表、写入拒绝和持久化读回。

## 6. 可执行验收证据与继续条件

下列条件全部满足前，P1 分类身份出口必须维持 `NOT_ADMITTED`：

1. 将 `git:HEAD:docs/plant_catalog.csv` 的 SHA-256 作为本次遗留参考输入的固定基线；若未来导入候选 hash 不匹配，建立新审计批次。
2. 以本清单已绑定的 200 条源行为基础，生成新的逐条 authority evidence manifest；每行填写真实原始名、规范名、权威稳定 ID、来源版本、原始制品、rank、accepted/synonym、完整父链、冲突/别名裁决和审核决定。
3. 对每条 `ADMIT` 执行 release predicate：读取原始制品、核验 SHA、验证父链/唯一键/别名无歧义，并保存 release input manifest SHA。
4. `QUARANTINE`、`REJECTED`、`spp.`、物种组、cultivar、冲突与重复名的 DDL 静态合同已由 TypeScript + Vitest RED/绿测试覆盖；真实 API 验证 catalog、identify、CMS、care、diagnosis 与 Agent 均不会读到隔离记录仍未执行。
5. 真实 MySQL 空库导入、持久化读回、不可变 release 构建和单一 active 指针切换全部通过，才允许出现任何 `ADMIT`。

最小复核命令（均为只读，不构成发布或种子导入）：

```bash
node docs/backend-v2/verify-entrypoint.mjs
node -e "const m=require('./docs/backend-v2/audits/P1-taxonomy-admission-manifest.json'); if(m.records.length!==200||m.summary.admitted!==0||m.summary.quarantined!==200||m.summary.rejectedFromTaxonomySeed!==0) process.exit(1); console.log(m.summary)"
(cd cloudfunctions-v2 && npm test -- --run test/p1-taxonomy-ddl.spec.ts)
(cd docs/backend-v2/audits && sha256sum -c P1-taxonomy-admission-manifest.sha256)
(cd docs/backend-v2/audits && sha256sum -c P1-taxonomy-admission-audit.sha256)
```

## 7. 本 ticket 的边界

- 本文件完成的是当前可证事实源下的**否决性准入**与本地 DDL 静态合同审计，不把 P0 样本或旧 CloudBase 测试数据伪装成全量权威种子。
- 未写入、迁移、删除 CloudBase MySQL/CMS/Storage 的任何数据；现有均为测试数据这一事实不降低权威分类准确性的要求。
- 未执行真实 MySQL、CloudBase、CMS、Storage、网关、部署或 ClickUp 写入；本地静态合同不等于真实数据库或端侧验收。
