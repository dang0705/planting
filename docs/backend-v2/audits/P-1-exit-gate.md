# P-1 出口门独立复核

> 复核角色：`p1_exit_gate_review_luna`  
> 复核时间：2026-09-19 23:12（Asia/Shanghai，纳入 t 制品后的最终复核）
> 范围：只读复核 P-1 入口、退出条件、五个子 ticket 制品、保存的 CloudBase 只读回读和 SHA-256 sidecar。  
> 变更边界：未修改业务代码、CloudBase/CMS/Storage/OpenViking、既有审计报告或 `tracker/module-status.json`；本次只新增本报告、其 SHA sidecar 和本 ticket heartbeat。

本次修订依据 Master Plan 第 4.3、5.3 和第十五章：P-1 只判断七类处置清单、当前资产/身份输入快照、内容来源审计、测试数据与原子依赖候选及其 SHA/只读回读；P0 的代表性权威来源证伪、P1 的身份全量准确性硬门/RED/空库、P5 的真实 API/安全/端上/并发不再作为 q/r/u/v 的 P-1 缺口。`z8v0kmr96t` 外部来源审计制品已补齐并纳入本次最终复核；当前没有新增的 P-1 资产审计硬缺口。

## 1. 复核前置与判定口径

已先读取 `docs/backend-v2/README.md`，随后执行：

```text
node docs/backend-v2/verify-entrypoint.mjs
```

结果：入口校验通过；Master Plan 标题、2111 行和 SHA-256
`e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428`
一致。

按入口逐步读取了：

- `docs/backend-v2/BASELINE.lock`、`phases/P-1-audit.md`、`data/legacy-disposition.md`；
- `clickup/ticket-specs.md` 中 P-1 目的、四项验收和五个子 ticket 规格；
- 当前已有的 P-1 报告、taxonomy closure、CloudBase 只读回读报告及其 `.sha256` 文件；
- 五个 ticket heartbeat 仅用于判断报告是否存在及其声明的进度，不把 heartbeat 当作审计制品。

本报告采用以下口径：

| 判定 | 含义 |
|---|---|
| `PASS` | 当前 P-1 审计制品已经满足该项退出门；不代表 v2 代码、真实业务 API 或端上验收通过。 |
| `PARTIAL` | 已有可核对的审计制品和处置判断，但仍有明确的 P-1 证据或资产范围缺口。 |
| `FAIL` | 必需的审计制品缺失，或该退出条件无法据现有证据成立。 |

后续 P0/P1/P5 的 schema、实现、部署、真实 API、并发和端上验收不作为本报告的通过条件。P-1 只要求可回放的资产/来源清单、处置判断、责任边界、Expected/替代物、删除前置、输入/输出 SHA 和当次只读读回；P0 的代表性权威样本、P1 的全量身份硬门/RED/空库、P5 的真实 API/安全/端上/并发属于后续阶段。只有 P-1 自身的清单、处置字段、制品哈希或最小只读读回缺失，才算本门真实缺口。

## 2. 现有制品与完整性核对

逐个执行了现有 sidecar 的 `sha256sum -c`。结果如下：

| 制品 | SHA-256 sidecar | 保存的读回/证据范围 | 独立核对结果 |
|---|---|---|---|
| `P-1-legacy-code-z8v0kmr96q.md` + manifest | 存在，且包含报告、确定性 manifest 及入口/规则/配置输入 | 本地函数、路由、调用图、单测和主代理函数/网关摘要 | sidecar 全部 `OK`；足以支持 P-1 旧能力处置；Agent 真实业务闭环不属于本门 |
| `P-1-data-cms-z8v0kmr96r.md` | 存在，且包含报告及本地输入哈希 | 本地数据/CMS/SQL 与主代理的当前计数、模型存在性摘要 | sidecar 全部 `OK`；足以支持 P-1 内容来源和测试数据处置；逐字段 schema/release 属后续阶段 |
| `P-1-storage-memory-z8v0kmr96u.md` | 存在，且包含报告及输入哈希 | Storage、静态托管、MySQL、CMS、OpenViking 的只读摘要和 URI 清单 | sidecar 全部 `OK`；足以支持 P-1 前缀/URI 处置；对象内容 hash、权限和端上闭环属后续阶段 |
| `P-1-taxonomy-z8v0kmr96v.md` | 存在 | 200 条输入风险分层、代表性来源页面哈希和线上身份摘要 | sidecar `OK`；足以支持 P-1 身份输入快照和隔离候选；全量权威硬门属 P0/P1 |
| `P-1-taxonomy-z8v0kmr96v-closure.md` | 存在 | 对 taxonomy 报告和 live readback 的收口复核，明确 `NOT_ADMITTED` | sidecar `OK`；`NOT_ADMITTED` 是 P-1 的安全处置结论，不等于 P1 全量身份通过 |
| `P-1-cloudbase-live-readback.md` | 存在 | 2026-09-19 22:33–22:40 的 MySQL/CMS/Storage/函数/网关/变量名只读摘要 | sidecar `OK`；摘要不是逐条原始 JSON、对象内容哈希或供应商真实调用证据 |
| `P-1-external-sources-z8v0kmr96t.md` | 存在，且包含报告及完整输入哈希 | 外部来源注册表、调用方、配置键名、失败/回调边界、处置矩阵和 live-readback 证据 | sidecar 全部 `OK`；真实供应商/沙箱请求是后续阶段，不是 P-1 缺口 |

因此，q/r/t/u/v 五个子 ticket、CloudBase live-readback、taxonomy closure 和 legacy manifest 的文件哈希、责任范围和 P-1 级别只读回均可核对；“所有七类资产均有带 SHA 的审计制品和读回证据”成立。P0/P1/P5 的原始权威响应、全量硬门、对象内容 hash、恶意扫描和真实端上闭环不作为已有制品的 P-1 缺口。

## 3. 五个子 ticket 的独立判定

### 3.1 `z8v0kmr96q`：旧函数、路由、测试和原子依赖审计 — `PASS`

已有报告 `P-1-legacy-code-z8v0kmr96q.md` 的六域处置矩阵和原子依赖矩阵，为旧函数、路由、测试与依赖记录了调用方、v2 owner、`TRANSFORM/SPLIT/MERGE/QUARANTINE` 等内容决定、`KEEP/ARCHIVE/DELETE` 资源决定、Expected 编号和删除前置条件；其 SHA sidecar 已核对通过。报告也明确禁止直接删除旧资产。

报告自己记录的动态路径失败、旧本地网关测试失败、Agent SSE/工具续接和 MySQL/Storage/端上闭环未完成，不能改写为成功；但这些属于后续真实运行/切换验收，不是 P-1 清单出口条件。P-1 所需字段已经具备：

- 旧函数、路由、测试和原子依赖已有调用图与处置矩阵；
- 每类资产已有 v2 owner、`TRANSFORM/SPLIT/MERGE/QUARANTINE` 或 `KEEP/ARCHIVE/DELETE` 决定、Expected 编号和删除前置；
- 18 项本地源资产、主代理回传的云端函数/网关摘要、失败的动态 path gate 和 characterization 测试均已作为可审计的当前事实保留；
- 报告及 SHA sidecar、入口/规则/配置输入哈希均已读回核对。

因此，q 的“约 85%”是后续实时闭环进度，不应作为 P-1 资产审计未完成的证据。

后续执行项：保留失败测试，待 P1/P5 合同和真实运行验收分别处理动态路径、旧流量、Agent、MySQL/Storage 与端上闭环；不得改 Expected 吞掉失败。该执行项不阻断本 ticket 的 P-1 出口。

### 3.2 `z8v0kmr96r`：SQL、数据模型、CMS 和内容资产审计 — `PASS`

已有报告 `P-1-data-cms-z8v0kmr96r.md` 已形成数据/CMS 内容与资源双轴矩阵。目录、养护、诊断内容、题包、身份表、旧 SQL、CMS 模型和运行流水均有 v2 owner、处置决定、Expected/替代合同和删除前置条件；报告明确把运行流水标为 `REJECT` 的 v2 内容迁移源，并明确内容资产不能因“测试数据”直接删除。其报告及输入 SHA sidecar 已核对通过，`P-1-cloudbase-live-readback.md` 也提供了当前数量和模型存在性的只读摘要。

报告列出的逐表/逐模型原始 JSON、题库/路由交叉、immutable release hash、Storage 反向引用和 source batch/hash 对账，是 P1/P2/P5/P6 的实现、发布或真实集成验收，不是 P-1 资产来源清单的前置条件。P-1 所需字段已经具备：

- 目录、养护、诊断内容、题包、身份表、旧 SQL、CMS 模型和运行流水已有内容/资源双轴处置；
- 每类资产已有 owner、处置决定、Expected/替代合同和删除前置；运行流水明确 `REJECT` 为 v2 内容迁移源；
- 本地来源统计、CloudBase 当前计数/模型存在性摘要、报告输入 SHA 和输出 sidecar 均已保存并核对；
- `pending+active`、孤儿 alias/rule 和本地/live 数量差异均被记录为待后续合同/发布验收处理的事实，没有被误当作删除授权。

后续执行项：P1/P2/P5/P6 按原报告中的 Q-DB/C-CMS 查询包补充原始 JSON、release、交叉和引用回放；不得执行 DDL/DML、发布、批量停用或删除来“解决”后续验收项。该执行项不阻断本 ticket 的 P-1 出口。

### 3.3 `z8v0kmr96t`：外部供应商、来源和回调边界审计 — `PASS`

新生成的 `P-1-external-sources-z8v0kmr96t.md` 已独立登记百度、和风天气、CloudBase AI/百炼/TokenHub/混元、微信支付和三平台身份来源的调用者/入口、配置键名、来源与输出边界、v2 owner、内容/资源处置、Expected 来源、失败/超时/重试/成本/签名/幂等边界和 archive/delete 前置。报告与输入 SHA sidecar 已由 `sha256sum -c` 全部核对通过，且引用了已保存的 CloudBase 脱敏只读回读。

报告明确未把配置键名存在、供应商账户/额度、支付沙箱、线上单一回调 owner 或真实请求成功误写成已验收；这些属于 P0/P1/P5 的后续关闭门。P-1 外部来源清单及处置边界已经闭合，禁止把后续真实调用未执行误判为本 ticket 的缺失。

### 3.4 `z8v0kmr96u`：云存储、私有资产和 OpenViking 审计 — `PASS`

已有报告 `P-1-storage-memory-z8v0kmr96u.md` 已按精确 Storage 前缀、静态托管前缀和 OpenViking URI 给出内容决定、资源决定、调用方、v2 owner、替代/Expected 和删除回退前置；用户/诊断对象保持 `KEEP_PRIVATE`，开发 smoke 对象保持 `QUARANTINE/DELETE_CANDIDATE`，OpenViking 旧树保持 `ARCHIVE/HISTORICAL`，没有执行删除。Storage/OpenViking 清单哈希和报告 sidecar 已核对通过。

报告同时记录了对象内容、权限、权属、反向引用和端上上传删除的未验证项。这些属于后续发布/真实集成/精确清理验收；P-1 要求的是可审计的对象/URI 清单和候选处置边界，当前已满足：

- Storage 前缀有对象数量/大小/格式和脱敏 owner 标签读回，且有清单 SHA；
- 每个前缀已有 `TRANSFORM/REBUILD/QUARANTINE/DEPRECATE_CANDIDATE` 与 `KEEP/KEEP_PRIVATE/ARCHIVE/DELETE_CANDIDATE` 决定、调用方/依赖和删除回退前置；
- OpenViking 有精确 URI 清单、`ARCHIVE/HISTORICAL` 处置和 URI 清单 SHA；
- 报告及输入 SHA sidecar 已核对，未执行删除或 OpenViking 写入。

后续执行项：P5/P6 再补逐对象内容 hash、MIME/权属/许可、反向索引和端上闭环；在此之前保持 `KEEP/KEEP_PRIVATE/QUARANTINE`，不得删除或提升为公共 release。上述后续证据不阻断本 ticket 的 P-1 出口。

### 3.5 `z8v0kmr96v`：植物分类权威来源与身份准确性审计 — `PASS`

已有报告和 closure sidecar 均通过核对。`P-1-taxonomy-z8v0kmr96v-closure.md` 的 `NOT_ADMITTED` 结论是有效的安全裁决：200 条目录候选及线上 192 条身份实体不能进入 v2 active release；`pending + active`、孤儿 alias/rule、跨源冲突和未验证 cultivar 均不得绕过隔离门。该负向结论不能被误写成“代表性样本通过”或“全量身份通过”。

报告和 closure 还列出全量 authority evidence、quarantine gate、空库导入和公开查询隔离等工作。这些分别属于 P0 可行性证伪和 P1 身份准确性硬门；P-1 只要求身份输入快照、来源风险审计和处置候选，当前已满足：

- 200 条身份输入已有字段/rank/重复/冲突/风险分层和线上 192 条候选摘要；
- 代表性来源、稳定 ID、父链/冲突类型和 `NOT_ADMITTED/QUARANTINE` 候选处置已记录；
- taxonomy 报告、closure、live readback 和各自 SHA sidecar 均已核对；
- 报告明确没有把代表性样本或 `pending+active` 候选冒充 P1 全量通过。

后续执行项：P0 继续代表性来源证伪，P1 再生成全量 manifest、RED、空库导入和运行时隔离验证；期间保持 `NOT_ADMITTED/QUARANTINE`。这些后续任务不阻断本 ticket 的 P-1 出口。

## 4. 四项 P-1 退出条件

| 退出条件 | 判定 | 证据与理由 |
|---|---|---|
| 1. 每项资产有处置决定、替代物、Expected 来源和删除前置条件 | **PASS** | q/r/t/u/v 的 P-1 制品覆盖旧能力/原子依赖、数据/CMS、外部来源/回调、Storage/OpenViking、测试数据和身份输入；各自记录调用方、owner、处置决定、Expected/替代物和删除前置。 |
| 2. 内容资产不因测试数据身份被一刀切删除 | **PASS** | live readback 将当前业务记录标为测试数据，同时明确植物主数据、题包、症状、养护知识仍须审计；r 对内容采用 `KEEP/TRANSFORM/REBUILD/QUARANTINE`，u 对公共/私有/测试对象分轴处置，v 对候选身份保持 `NOT_ADMITTED`，没有一刀切删除决定。 |
| 3. 用户运行流水不被当作 v2 迁移源 | **PASS** | r 明确把诊断、用户植物、养护、视觉、订单和缓存运行流水标为 `REJECT` 的 v2 内容源；q/u/v 同样要求统一 `user_id/user_plant_id`、精确清单或权威证据后才能另行处理，没有将旧运行流水提升为知识或身份事实。 |
| 4. 全部审计制品有 SHA-256 和读回证据 | **PASS** | q/r/t/u/v、legacy manifest、taxonomy closure 和 CloudBase live-readback 的 sidecar 均 `OK`；报告均保留相应本地静态或脱敏只读回读边界。P0/P1/P5 的真实执行证据不属于本项的 P-1 通过条件。 |

## 5. 独立出口结论与范围分流

### 5.1 P-1 出口结论

**`PASS（P-1 资产审计出口满足）`。** t 制品补齐后，q/r/t/u/v 范围内的七类处置清单、当前资产/身份输入快照、内容来源审计、测试数据与原子依赖候选、处置字段、SHA 和对应只读回读均已形成；四项 P-1 退出条件全部通过。

这是“P-1 资产审计出口满足”的结论，不是“v2 业务代码、真实供应商或端上闭环已通过”的结论，也不是允许用后续实现结果反向改写 P-1 Expected 的理由。未执行任何清理、迁移、发布、DDL、DML 或云端写入。

### 5.2 不应混入本门的后续工作

下列事项在本报告中不作 PASS/FAIL 结论，也不能反向伪造为 P-1 已通过：Node.js 22/TypeScript 构建、v2 六域实现、DTO/API 冻结后的真实 HTTP、MySQL 并发/幂等、CMS 发布闭环、端上微信验收及 P5 影子集成。这些属于后续阶段的独立验收门。

外部来源制品已经补齐并通过 P-1 复核。全量 taxonomy evidence、quarantine/RED/空库、对象内容 hash/恶意扫描、真实 API/安全/端上/并发等明确属于 P0/P1/P5/P6，不能被本报告误写成已验收，也不应前置为 P-1 阻断。

### 5.3 回退与继续条件

- 继续保持内容 `KEEP/TRANSFORM/QUARANTINE`、私有资产 `KEEP_PRIVATE`、运行流水 `REJECT` 迁移源、植物身份 `NOT_ADMITTED`；P-1 通过不授权删除、迁移或发布。
- 后续按各报告交接进入 P0/P1/P5/P6：不把供应商真实请求、全量身份硬门、对象内容 hash 或端上闭环写回为 P-1 已验证事实。
- 本出口报告已重跑入口校验、所有现有 P-1 sidecar 和 heartbeat JSON；等待主代理验收，不自行修改 `module-status.json`。
