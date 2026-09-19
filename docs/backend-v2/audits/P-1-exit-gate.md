# P-1 出口门独立复核

> 复核角色：`p1_exit_gate_review_luna`  
> 复核时间：2026-09-19 22:49（Asia/Shanghai）  
> 范围：只读复核 P-1 入口、退出条件、五个子 ticket 制品、保存的 CloudBase 只读回读和 SHA-256 sidecar。  
> 变更边界：未修改业务代码、CloudBase/CMS/Storage/OpenViking、既有审计报告或 `tracker/module-status.json`；本次只新增本报告、其 SHA sidecar 和本 ticket heartbeat。

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

后续 P0/P1/P5 的 schema、实现、部署、真实 API、并发和端上验收不作为本报告的通过条件；但若某项原始审计回读、资产清单或删除前置本身缺失，仍是 P-1 的真实缺口，不能以“留给后续阶段”掩盖。

## 2. 现有制品与完整性核对

逐个执行了现有 sidecar 的 `sha256sum -c`。结果如下：

| 制品 | SHA-256 sidecar | 保存的读回/证据范围 | 独立核对结果 |
|---|---|---|---|
| `P-1-legacy-code-z8v0kmr96q.md` | 存在，且包含报告及入口/规则/配置输入 | 本地函数、路由、调用图、单测和主代理函数/网关摘要 | sidecar 全部 `OK`；报告自述仍为约 85%，运行时读回未闭合 |
| `P-1-data-cms-z8v0kmr96r.md` | 存在，且包含报告及本地输入哈希 | 本地数据/CMS/SQL 与主代理的当前计数、模型存在性摘要 | sidecar 全部 `OK`；逐表/逐模型原始读回、release 和反向引用未附带 |
| `P-1-storage-memory-z8v0kmr96u.md` | 存在，且包含报告及输入哈希 | Storage、静态托管、MySQL、CMS、OpenViking 的只读摘要和 URI 清单 | sidecar 全部 `OK`；对象内容 SHA、权属、MIME 和完整反向引用未闭合 |
| `P-1-taxonomy-z8v0kmr96v.md` | 存在 | 200 条输入风险分层、代表性来源页面哈希和线上身份摘要 | sidecar `OK`；原始来源制品及 200 条全量 manifest 未保存 |
| `P-1-taxonomy-z8v0kmr96v-closure.md` | 存在 | 对 taxonomy 报告和 live readback 的收口复核，明确 `NOT_ADMITTED` | sidecar `OK`；收口结论可回放，但不等于全量身份审计通过 |
| `P-1-cloudbase-live-readback.md` | 存在 | 2026-09-19 22:33–22:40 的 MySQL/CMS/Storage/函数/网关/变量名只读摘要 | sidecar `OK`；摘要不是逐条原始 JSON、对象内容哈希或供应商真实调用证据 |
| `z8v0kmr96t` 外部来源审计 | **不存在** | 没有外部来源注册表、回调边界报告或对应 SHA sidecar | 无法通过完整性和范围门 |

因此，已有制品的文件哈希可核对，但“所有七类资产均有带 SHA 的审计制品和读回证据”尚未成立；sidecar 本身不能替代缺失的原始读回。

## 3. 五个子 ticket 的独立判定

### 3.1 `z8v0kmr96q`：旧函数、路由、测试和原子依赖审计 — `PARTIAL`

已有报告 `P-1-legacy-code-z8v0kmr96q.md` 的六域处置矩阵和原子依赖矩阵，为旧函数、路由、测试与依赖记录了调用方、v2 owner、`TRANSFORM/SPLIT/MERGE/QUARANTINE` 等内容决定、`KEEP/ARCHIVE/DELETE` 资源决定、Expected 编号和删除前置条件；其 SHA sidecar 已核对通过。报告也明确禁止直接删除旧资产。

不能判为 `PASS` 的 P-1 缺口是报告自己记录的事实：

- `check-http-function-paths.mjs` 仍为 `FAIL`（67 个引用、5 个动态未解析、1 个未声明的 `agent-http`）；
- 旧本地网关集合测试仍失败；
- 18 个本地源资产、23 个云端函数、21 条启用路由和共享目录别名尚未形成逐项可回放映射；
- MySQL/Storage 对象归属、旧别名流量、Agent SSE/工具续接和端上闭环的只读证据未绑定到该 ticket 制品。

这些缺口中，未实现 v2 API 本身不属于本次判定；真正的 P-1 缺口是调用图、旧资产存在性/归属和删除前置所需的读回没有闭合。

可执行收口：保留现有源快照，生成本地 18 项 ↔ 云端 23 项 ↔ 网关 21 路由的逐项映射；逐一解释动态引用与两个共享目录别名；附上旧路由/回调/Agent 的只读调用证据、Storage/MySQL 归属摘要及其 SHA；保留失败测试，不得改 Expected 吞掉失败。

### 3.2 `z8v0kmr96r`：SQL、数据模型、CMS 和内容资产审计 — `PARTIAL`

已有报告 `P-1-data-cms-z8v0kmr96r.md` 已形成数据/CMS 内容与资源双轴矩阵。目录、养护、诊断内容、题包、身份表、旧 SQL、CMS 模型和运行流水均有 v2 owner、处置决定、Expected/替代合同和删除前置条件；报告明确把运行流水标为 `REJECT` 的 v2 内容迁移源，并明确内容资产不能因“测试数据”直接删除。其报告及输入 SHA sidecar 已核对通过，`P-1-cloudbase-live-readback.md` 也提供了当前数量和模型存在性的只读摘要。

不能判为 `PASS` 的缺口同样已在报告中明确列出：

- `INFORMATION_SCHEMA.TABLES/COLUMNS/STATISTICS` 的当前原始 JSON 和 SHA 未附带；
- CMS 逐模型 schema、题库/选项/路由交叉、不可变 release hash/批次及 Storage 反向引用未固化；
- `pending+active` 身份 192 条、题库 `pending+active` 55 条以及各 16 条孤儿 alias/match rule 只有摘要和负向判断，尚无精确修复/隔离清单；
- 本地与 live 的内容计数差异仍待 source batch/hash 对账。

可执行收口：在同一 EnvId/schema 只读保存 Q-DB-00 至 Q-DB-12 和 C-CMS-01/02 的原始 JSON，记录执行时间、schema、响应 SHA；补全题包/路由交叉、release 控制表和 Storage 引用清单。不得执行 DDL/DML、发布、批量停用或删除来“解决”审计缺口。

### 3.3 `z8v0kmr96t`：外部供应商、来源和回调边界审计 — `FAIL`

当前只有 CloudBase live readback 对脱敏环境变量名称的存在性摘要；该摘要明确不能证明百度植物识别、和风天气、云百炼、微信支付或平台身份回调的账户可用性、签名、额度、失败恢复或真实调用。仓库中没有该 ticket 的独立审计报告，也没有报告 SHA sidecar。因此不能从其他 ticket 的摘要推断该 ticket 已完成。

可执行收口：新增独立 `P-1-external-sources-z8v0kmr96t.md` 和对应 `.sha256`，至少逐项记录真实调用方/回调入口、v2 owner/替代 adapter、来源与内容处置决定、Expected 来源、超时/失败/费用边界、签名/幂等/重放边界、删除或下线前置、脱敏配置存在性和只读/沙箱证据哈希。禁止把凭证值写入报告；不能用变量名存在或 HTTP 200 冒充真实供应商合同证明。

### 3.4 `z8v0kmr96u`：云存储、私有资产和 OpenViking 审计 — `PARTIAL`

已有报告 `P-1-storage-memory-z8v0kmr96u.md` 已按精确 Storage 前缀、静态托管前缀和 OpenViking URI 给出内容决定、资源决定、调用方、v2 owner、替代/Expected 和删除回退前置；用户/诊断对象保持 `KEEP_PRIVATE`，开发 smoke 对象保持 `QUARANTINE/DELETE_CANDIDATE`，OpenViking 旧树保持 `ARCHIVE/HISTORICAL`，没有执行删除。Storage/OpenViking 清单哈希和报告 sidecar 已核对通过。

仍不能判为 `PASS`：

- 7345 个对象只有 metadata/ETag/大小/时间清单，没有对象内容 SHA-256、真实 MIME、恶意文件扫描、权属/许可证读回；
- 完整 DB/CMS/代码/测试反向引用和用户/诊断归属映射未闭合；
- 静态托管的逐前缀权限、CMS 发布历史/不可变 release 和端上 upload→bind→URL→expiry→delete/reconcile 未验证。

可执行收口：在受控只读环境生成逐对象 manifest（key、ETag、size、MIME、content SHA、归属、引用、许可证/来源），补齐 DB/CMS/代码/测试反向索引和公开前缀负向回放；在这些证据完成前保持 `KEEP/KEEP_PRIVATE/QUARANTINE`，不得删除或提升为公共 release。

### 3.5 `z8v0kmr96v`：植物分类权威来源与身份准确性审计 — `PARTIAL`

已有报告和 closure sidecar 均通过核对。`P-1-taxonomy-z8v0kmr96v-closure.md` 的 `NOT_ADMITTED` 结论是有效的安全裁决：200 条目录候选及线上 192 条身份实体不能进入 v2 active release；`pending + active`、孤儿 alias/rule、跨源冲突和未验证 cultivar 均不得绕过隔离门。该负向结论不能被误写成“代表性样本通过”或“全量身份通过”。

不能判为 `PASS` 的 P-1 缺口：

- 全量 200 条权威 evidence manifest 尚未生成；现有仅为有限代表性来源页面哈希，原始响应制品未保存，不能完整回放；
- 重复科学名、authority key、accepted/synonym 冲突、cultivar ICRA 证据和 16+16 孤儿引用尚无逐条可回放决定；
- quarantine gate、空库导入读回和公开查询隔离尚未形成真实 API 证据。

可执行收口：保存每条原始权威响应及 raw SHA，生成 200 条 manifest；逐条给出 `MERGE/SPLIT/QUARANTINE` 和孤儿处置决定；冻结 gate Expected 后再以 RED、`unit_real_data` 和 `e2e_real_api` 验证，期间保持 `NOT_ADMITTED/QUARANTINE`。

## 4. 四项 P-1 退出条件

| 退出条件 | 判定 | 证据与理由 |
|---|---|---|
| 1. 每项资产有处置决定、替代物、Expected 来源和删除前置条件 | **FAIL** | q/r/u/v 的矩阵大部分覆盖了各自范围，但 `z8v0kmr96t` 整类外部供应商、来源和回调没有审计制品；同时 r/u/v 仍有逐项原始证据缺口，不能声称“每项资产”已闭合。 |
| 2. 内容资产不因测试数据身份被一刀切删除 | **PASS** | live readback 将当前业务记录标为测试数据，同时明确植物主数据、题包、症状、养护知识仍须审计；r 对内容采用 `KEEP/TRANSFORM/REBUILD/QUARANTINE`，u 对公共/私有/测试对象分轴处置，v 对候选身份保持 `NOT_ADMITTED`，没有一刀切删除决定。 |
| 3. 用户运行流水不被当作 v2 迁移源 | **PASS** | r 明确把诊断、用户植物、养护、视觉、订单和缓存运行流水标为 `REJECT` 的 v2 内容源；q/u/v 同样要求统一 `user_id/user_plant_id`、精确清单或权威证据后才能另行处理，没有将旧运行流水提升为知识或身份事实。 |
| 4. 全部审计制品有 SHA-256 和读回证据 | **FAIL** | 现有 q/r/u/v、closure 和 live readback sidecar 均 `OK`，但 t 没有报告或 sidecar；r/u/v 的原始表/CMS/release、对象内容和全量 taxonomy manifest 读回仍缺失。既有 sidecar 的完整性通过不能补齐缺失制品或缺失读回。 |

## 5. 独立出口结论与范围分流

### 5.1 P-1 出口结论

**`FAIL（未退出）`。** 当前可以确认 P-1 已完成了大量只读盘点、测试数据边界判断、运行流水迁移拒绝、内容/资源双轴处置和制品哈希核对；但五类子 ticket 不是全量闭合，尤其 `z8v0kmr96t` 制品缺失，且原始读回/全量证据仍不足以通过第 1、4 项硬退出条件。

这是“P-1 资产审计出口尚未满足”的结论，不是“v2 业务代码错误”的结论，也不是允许用后续实现结果反向改写 P-1 Expected 的理由。未执行任何清理、迁移、发布、DDL、DML 或云端写入。

### 5.2 不应混入本门的后续工作

下列事项在本报告中不作 PASS/FAIL 结论，也不能反向伪造为 P-1 已通过：Node.js 22/TypeScript 构建、v2 六域实现、DTO/API 冻结后的真实 HTTP、MySQL 并发/幂等、CMS 发布闭环、端上微信验收及 P5 影子集成。这些属于后续阶段的独立验收门。

但本报告列出的外部来源制品、逐项审计清单、原始只读读回、对象内容/引用 manifest 和 taxonomy 全量 evidence 属于 P-1 自身缺口；不能以“后续 P0/P1/P5”标记为已完成。

### 5.3 回退与继续条件

- 在 P-1 退出门通过前，继续保持内容 `KEEP/TRANSFORM/QUARANTINE`、私有资产 `KEEP_PRIVATE`、运行流水 `REJECT` 迁移源、植物身份 `NOT_ADMITTED`；不删除、不迁移、不发布。
- 先补 `z8v0kmr96t` 独立报告和 SHA，再补 q/r/u/v 的原始读回、逐项 manifest 和全量 taxonomy evidence；每份制品保存执行时间、EnvId/schema 或来源版本、输入哈希和回放命令。
- 收口后重新执行入口校验、所有 sidecar 校验和读回完整性检查；主代理验收前不得把 P-1 状态改成 `done`。

