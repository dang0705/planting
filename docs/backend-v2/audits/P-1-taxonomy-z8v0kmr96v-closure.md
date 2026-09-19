# P-1 植物分类权威来源与身份准确性审计收口

> ticket：`z8v0kmr96v`（`[P-1] 植物分类权威来源与身份准确性审计`）  
> 收口时间：2026-09-19（Asia/Shanghai）  
> 范围：本地只读复核已有分类审计和 CloudBase 实时只读证据制品；没有重新登录、执行云端查询或任何写入。

## 1. 可审计结论

`P-1` 的**否决性审计结论可验收**：当前 200 条目录候选及其线上 192 条身份实体**不得进入 v2 active release**。这不是“环境未知”或“样本通过”的结论，而是由已记录证据明确支持的 `NOT_ADMITTED` 结论。

但 Phase P1 的“植物身份准确性审计通过”退出条件**不可验收**，原因不是 ClickUp 同步受限，而是全量权威证据与运行时隔离尚未完成。ClickUp 配额只影响回填，不影响本地审计判断。

| 结论对象 | 结论 | 可复核事实 |
|---|---|---|
| 目录候选输入 | 200 条，不能视为权威种子 | `docs/plant_catalog.csv` 恰有 200 行，SHA-256 已与原审计一致 |
| 风险分层 | 可作为全量审计与隔离的输入 | 9 条 `spp.`、6 条 variety、3 条 subspecies、8 条 hybrid、4 条 cultivar、1 条 mixed/group；8 组重复科学名 |
| 代表性权威登记 | 只能证明模型/风险覆盖，不能证明全量身份 | 原报告仅登记有限样本；`Hydrocotyle vulgaris` 尚待抓取，cultivar 尚缺 ICRA 注册记录；原始响应制品未保存，因此页面哈希不能回放 |
| 线上旧身份数据 | 必须隔离，不可发布 | 实时只读制品记录 192 条均为 `pending + is_active=1`，aliases 与 match rules 各有 16 条孤儿引用 |
| 旧运行时读取 | 不符合 v2 准入要求 | 旧查询以 `pie.is_active = 1` 和 alias `is_active = 1` 过滤，未落实 `review_status=confirmed` 与权威证据准入谓词 |

本收口复核了 `P-1-taxonomy-z8v0kmr96v.md`、`P-1-cloudbase-live-readback.md` 及各自 sidecar：SHA-256 均与文件内容相符。实时读回是 2026-09-19 22:33 至 22:40 的已保存本地证据；本次没有把它误报为新的实时查询。

## 2. 发布隔离门（P1 的硬性准入条件）

一条身份只有同时满足以下条件才可进入 v2 active release：

```text
authority_source ∈ {POWO/WCVP, WFO, RHS, ICRA}
AND source_version 非空
AND authority_taxon_id 非空且唯一
AND rank 为合同允许的明确等级
AND accepted/synonym 状态与完整 parent_chain 可读回
AND 原始证据制品存在且 raw SHA-256 验证一致
AND strong alias 无歧义
AND conflict_status = resolved
AND review_decision = confirmed
AND quarantine_reason 为空
```

任一条件不满足即为 `QUARANTINE`。`pending`、`is_active=1`、`matchScore >= 3`、旧链接标为 `reviewed` 或代表性样本成功，均不得单独绕过该门。隔离记录不得被 catalog、identify、CMS、care 或 diagnosis 对外读取。

特别明确：`spp.` 只能是 genus/species_group 候选；`Crassulaceae 等` 必须隔离；跨来源 accepted/synonym 冲突、未证实 cultivar、重复 authority key 与孤儿 alias/rule 均不得自动裁决或发布。

## 3. P0 证伪输入

以下是 ticket `z8v0kmr96x` 的冻结输入。Expected 来源是 `data/phase-1-identity-audit.md` 的 GO/STOP 条件、`contracts/plant-taxonomy.md` 的等级/隔离合同，以及本收口的已记录负向事实；不得从旧实现反推 Expected。

| ID | 层级 | 应证伪的断言 | 当前已知负向证据 / 通过条件 |
|---|---|---|---|
| P0-TAX-01 | `unit_real_data` | 每个拟发布 identity 均有可读取的原始权威证据、版本、稳定 ID、完整父链和 hash 回放 | 现有仅为有限页面 hash，未保存原始制品；应先失败。通过必须是 200 条 evidence manifest 逐条读回，不是样本外推 |
| P0-TAX-02 | `unit_fake` + `e2e_real_api` | `pending` 或 `QUARANTINE` identity 绝不出现在 catalog/identify/CMS/care/diagnosis 公开结果 | 旧运行时只以 `is_active=1` 读取，192 条 `pending+active` 是必须被证伪的反例；实现后以真实 API 验证拒绝/空结果 |
| P0-TAX-03 | `unit_real_data` | `spp.`、mixed/group、种下、hybrid、cultivar 保留正确 rank/parent 或隔离，绝不伪装为 species | 对 31 条 R0 全量运行，而非仅 11 条代表样本；特别包含 ID 32、104、112、131、181/182 |
| P0-TAX-04 | `unit_real_data` | 重复科学名、同 authority key 与跨源 accepted/synonym 冲突不会自动合并或放行 | 8 个重复组逐组给出 `MERGE/SPLIT/QUARANTINE` 可回放决定；181/182 冲突在未裁决前必须隔离 |
| P0-TAX-05 | `unit_real_data` + `e2e_real_api` | alias/match rule 必须归属已发布 identity；孤儿不能命中公开搜索 | 现有 aliases/rules 各 16 条孤儿；先以只读查询精确列单，再验证隔离后的 API 不可命中 |
| P0-TAX-06 | `e2e_real_api` | 空库导入后，公开响应只暴露已准入的最小展示字段，不泄露审计、来源原文或内部 ID | 需在 v2 schema/DTO 冻结后执行；HTTP 200 不能代替断言和持久化读回 |

每个 P0 用例必须报告：Expected 来源、实际经过路径、替换边界、覆盖与未覆盖范围。全量 200 条 manifest、空库导入/读回和运行时门均通过前，不得把任何代表性样本标为“200 条全部通过”。

## 4. 后续准入顺序与回退

1. 先保存可回放的原始权威响应制品，并生成 200 条 evidence manifest；优先处理 R0、R1、重复键、冲突和孤儿引用。
2. 冻结 v2 DTO/schema/查询门与独立 Expected，再先落 RED 测试；不得改 Expected 吞掉负例。
3. 仅把满足隔离门的 identity 生成不可变 release，执行空库导入、持久化读回和真实 API 验收。
4. 在上述步骤全量通过前，回退方式是维持现有候选数据 `QUARANTINE/NOT_ADMITTED`，不迁移、不删除、不切换读取方。

