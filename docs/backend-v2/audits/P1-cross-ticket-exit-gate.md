# P1 合同、身份准确性、Schema 与 Foundation 总退出闸门

- 审计日期：2026-09-20
- 当前结论：`TECHNICAL_PRECONDITIONS_PASS / HUMAN_TAXONOMY_APPROVAL_PASS / TRANSFORM_REBUILD_REVIEW_STOP`
- 适用范围：仅判断 `docs/backend-v2/phases/P1-contracts-identity-foundation.md` 的退出条件；不外推为 P2-P5 业务实现、CloudBase 真实环境或发布完成。

## 退出条件逐项核对

| P1 退出条件 | 当前证据 | 结论 |
|---|---|---|
| 植物身份准确性审计通过 | 产品负责人已把原始 113/7/80 建议改判并采纳为 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`；完整 200 条批准制品和未激活 seed 已生成并通过 SHA-256 读回，当前 `seedEligible=106`、active release STOP | **部分通过：人工裁决已闭环；4 条待转换记录仍须重建并复核** |
| 业务关键变量 100% 分类且 P1 实现依赖项全部冻结 | 162 项全部分类；74 项 confirmed、49 项后续阶段 pending、39 项 hard_rule；P1 pending=0；后续 pending 已按首次消费点改挂 P3/P4/P5 且保留 `blockingScope` | PASS |
| 空库建表通过 | 官方 MySQL 8.4.11 双空库各执行 7 份 DDL，均生成 86 张表；规范化结构导出 SHA-256 完全一致 | PASS |
| 代表性 RED 已保存 | `docs/backend-v2/audits/evidence/` 保存合同、状态/数据、API 与 DDL RED；新百科、诊断 Schema、Prompt、能力目录和配置冻结均先观察 RED 再转绿 | PASS |
| 所有合同与架构制品有 SHA-256 | 合同注册表登记 Markdown 合同、两个 JSON Schema 与诊断 Prompt release；架构 manifest 对导航、架构、配置目录和映射文件保存 SHA-256 | PASS |
| `AGENTS.md` 对齐 TypeScript 与配置治理 | Node.js 22 + TypeScript、TypeScript 测试、TDD、配置前置裁决、中文属性注释和 Provider 治理均为硬规则 | PASS |

## 已完成的关键冻结

- `user-plant-profile/v1`：身份状态、盆器、位置、光照环境、通风与空气环境全部具备，且每个统一用户只发一次首株有效档案奖励。
- `subscription-capability-catalog/v1`：十项精确白名单；未知能力和通配符失败关闭。
- `plant-encyclopedia-display/v1`：只允许展示介绍、外观、分布与 1 至 3 条简短问答；分类、养护、安全与诊断禁区字段拒绝。
- `diagnosis-model-output/v1`：只允许脱敏证据、候选结论、不确定性与待用户确认的建议动作；不得直接形成养护事实或计划。
- `diagnosis-visual/v1`：规范化 Prompt SHA-256 为 `11c58cebe3b3c41097d6f6d6b3c5b5d7eb16248e4f07bacd497868a647ccc964`。
- 百炼精确快照：`qwen3.5-flash-2026-02-23`；产品模型家族与供应商精确代码分层，禁止静默换模。
- Docker 本地 MySQL 验证：Docker 29.8.0、MySQL 8.4.11、无宿主端口、临时数据目录、验证后容器清理。

## 尚未闭合门

人工批准已闭环，不再是 blocker。当前只剩以下四条 `TRANSFORM_PENDING` 的身份重建与复核：

```text
29  水仙       → Narcissus tazetta subsp. chinensis
73  银皇后     → Aglaonema commutatum 'Silver Queen'
98  狐尾天门冬 → Asparagus densiflorus 'Myersii'
123 绯牡丹     → Gymnocalycium stenopleurum
```

本地落盘已经经过 `taxonomy-human-approval-workflow.mjs`：批准主体、时间、200 条逐项处置与审核包 SHA-256 已绑定，结果固定为 `SEED_PARTIALLY_READY_NOT_ACTIVE`、`activeRelease=STOP`。代理名称、缺项、SHA 不一致、待转换目标缺失或任意处置漂移均失败关闭；该工作流本身不激活分类发布。

在四条记录完成 canonical、稳定 ID、`identity_level`、父链和证据哈希重建并重新验证前：

- 不得把当前 `seedEligible=106` 改成 110；
- 不得生成可激活 taxonomy release；
- 不得把本报告状态改为 GO；
- 不得绕过该门进入依赖这四条身份或 active taxonomy 的 P2/P3 路径；不依赖 active taxonomy 的 P2 工作继续推进。

## 验证边界

已证明的是本地合同、Schema、配置分类、真实 MySQL 8.4 空库 DDL 与权威来源离线回放。未证明 CloudBase MySQL、CloudBase CMS/Storage、真实身份、真实供应商调用、支付、并发、端到端 HTTP 或发布切换；这些属于后续阶段。
