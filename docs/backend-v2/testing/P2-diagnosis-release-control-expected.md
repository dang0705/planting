# P2 诊断知识发布撤回与禁用：独立 Expected / RED 计划

- **状态：** P2 整体仍未冻结；本文件仅为测试先行计划，未新增可执行测试、未取得 RED/GREEN，不能称为验收证据。
- **Expected 主来源：** 主代理本轮接受的 P2 设计方向、待确认的 [P2 发布控制合同草案](../contracts/diagnosis-knowledge-release-control-p2.md)、持久化合同第 50–54 行、CMS 审核交换合同第 33 行、009/010 DDL 及 `test-matrix` common scene。
- **范围边界：** 仅 diagnosis 发布撤回/禁用。不上 CloudBase/CMS，不新增 HTTP 路由，不改前端、不执行 ClickUp 操作，不更改 P1 合同或 009/010 DDL。
- **当前硬度：** 已接受方向不是已冻结 API 合同。错误码字面值、disable 命令 `protocolVersion`、安全回退资格读回细节、011 DDL 仍须先经主代理批准；这些不得提前写成正式合同测试常量。

## 一、结构与语义测试的分界

| 检查 | 适合层 | 结构 Schema 可直接断言 | 必须由领域/Repository 校验 |
|---|---|---|---|
| disable 请求必需字段、类型、长度、未知属性 | `unit_real_data`（读取真实 Schema 文件） | `protocolVersion`、`commandRef`、`bundleCode`、`expectedPointerVersion`、`reasonZh` 形状；禁止客户端自报操作者、内部 ID、release 状态或新 release ref | 不验证授权或活动包是否存在 |
| 撤销是否仍被当前活动 release 使用 | `unit_fake` 与后续 `unit_real_data` | 不适用 | 解析批准、当前 pointer、release 关联审核；若匹配则拒绝且不插入 revocation |
| rollback / disable 选择 | `unit_fake`、后续 `unit_real_data` | 不适用 | rollback 只能指定同 bundle 且符合既有回滚资格的旧版；有合格旧版不得借 disable 绕过回滚；无合格旧版才可 disable |
| 禁用后的服务选择与历史读取 | `unit_fake`、后续 Repository/application 测试 | 不适用 | 当前指针缺失或 `release_internal_id = NULL` 时新诊断失败关闭；历史按固定 `releaseRef` 读取时不依赖 active pointer |
| MySQL 原子性、CAS、审计/状态一致 | `unit_real_data` | DDL 检查可验证 `disable ⇒ new_release_internal_id IS NULL` 等行级形状 | 必须经过真实 Repository 事务；不能用直接 SQL 写入冒充业务命令通过 |

## 二、代表性 RED 用例

以下 `*.spec.ts` 是建议落盘边界，不表示文件已经存在。实现任何产品控制流前，至少先落一条代表性可执行合同/领域测试，取得审计 RED 后再改产品；后续 MySQL 测试须跑在隔离本地 MySQL，不声称覆盖 CloudBase。

| 编号 / 层级 | 建议测试边界 | 独立输入与 Expected | 会让测试变红的代表性错误 |
|---|---|---|---|
| `RC-S1` / `unit_real_data` | `cloudfunctions-v2/test/contracts/diagnosis-knowledge-release-disable.spec.ts` | 使用未来受批准的 disable JSON Schema。有效形状通过；缺字段、字段越界、额外 `operatorRef`/内部 ID/客户端 release 字段拒绝。来源：P2 disable DTO 草案和 DDL `command_ref`、`bundle_code`、`version`、`reason_zh` 类型范围。 | Schema 把内部操作者或 release 状态变成客户端可写，或默许缺 CAS 版本/理由。 |
| `RC-U1` / `unit_fake` | `cloudfunctions-v2/test/unit/backend/diagnosis/domain/review-revocation-eligibility.spec.ts` | 给一条已批准 review，当前活动 release 的 `review_attestation_internal_id` 正是该 review。撤销判定返回稳定冲突结果；不调用撤销写入。来源：P2 接受方向与 CMS 合同第 33 行的“撤销不得暗改指针”；具体错误码冻结前仅断言领域结果类别。 | 删除 active-release 守卫后，仍会将该批准记为已撤销。 |
| `RC-U2` / `unit_fake` | 同上 | 当前没有 active 指针，或 active release 使用另一条批准；只有前置鉴权已成功时，撤销可进入追加事实路径；不得因为 bundle 曾有历史 release 就错误拒绝。来源：P2 状态合同。 | 把历史 release 误当作当前活动 release，导致可撤销状态永久锁死。 |
| `RC-U3` / `unit_fake` | `cloudfunctions-v2/test/unit/backend/diagnosis/domain/resolve-active-diagnosis-release.spec.ts`（若该领域服务存在） | pointer 行存在但 `release_internal_id = NULL` 时，新诊断 fail closed；不得选择 bundle 内最新、其他 bundle 或 CMS 草稿。来源：P2 明确禁用语义。 | 将 NULL 当作“未配置”并回退到最新或其他内容。 |
| `RC-U4` / `unit_fake` | `cloudfunctions-v2/test/unit/backend/diagnosis/domain/select-release-retirement-command.spec.ts`（建议） | 当前 release 有至少一个符合既有回滚资格的同范围旧 release 时，disable 判定拒绝并要求调用 rollback；不得把“安全回退存在”当成禁用许可。具体错误码待 API 合同冻结。来源：主代理本轮对 safe fallback 与 disable 的区分。 | 删除 fallback eligibility 检查后，能绕过可回滚版本直接禁用整个 bundle。 |
| `RC-R1` / `unit_real_data` | `cloudfunctions-v2/test/e2e/diagnosis-release-withdrawal.mysql.spec.ts` | 在真实 Repository/MySQL 路径上，对仍 active 的批准发 revoke：拒绝；`diagnosis_review_revocations`、release 行、pointer row/version、activation audit 均不变。来源：P2 接受方向；持久化合同发布/撤销事务要求。 | Repository 只查 approval 是否存在，不核对活动指针使用关系。 |
| `RC-R2` / `unit_real_data` | 同上 | 若同 bundle 存在仍符合已冻结 rollback 资格的旧 release，应执行现有 rollback：pointer 指向目标旧版、CAS version 精确加一、追加 `rollback` 审计；不得新建一条内容相同的 release。之后对被移出 active 的 review 撤销才可成功。来源：持久化合同第 53 行与 P2 决策。 | 把 rollback 实现成 package 更新、忽略版本 CAS，或借 disable 绕过有效回退。 |
| `RC-R3` / `unit_real_data` | 同上 | 没有合格旧版时 disable：同一事务将当前 release 状态改为 `withdrawn`、保持 release 内容字段/摘要逐字节不变、保留 pointer 行并将 `release_internal_id` 置空、`version + 1`、追加 `action_kind='disable'` 且 `new_release_internal_id=NULL` 的审计；`active_diagnosis_knowledge_releases.activated_at_ms` 保持禁用前值，disable 时刻只记入审计 `created_at_ms`。来源：P2 接受的状态转换与本轮时间字段裁决。 | 只清 pointer 不记审计、审计先提交导致半状态、误把最后激活时间改成禁用时间，或禁用时改写 package 内容/摘要。 |
| `RC-R4` / `unit_real_data` | 同上 | disable 使用错误/过期 `expectedPointerVersion`、已空 pointer 或不存在 pointer 时失败，所有表均无写入；最大 `INT UNSIGNED` 版本无法加一时失败关闭，不发生溢出/绕回。来源：CAS 合同、009 的 `INT UNSIGNED` 版本列及 U2/U3。 | 先更新 release 状态后才检查 CAS，或无视整数上界继续写。 |
| `RC-R5` / `unit_real_data` | 同上 | 在 disable 事务完成 release 状态和 pointer 更新后、写审计前制造受控写入故障；整个事务回滚，release/pointer/version/audit 恢复原值。来源：I5 写中断无半成品。 | catch 错误后部分提交，产生 `withdrawn` release 仍 active 或无审计的 disabled pointer。 |
| `RC-R6` / `unit_real_data` | 同上，两个真实 MySQL 连接 | 用事务屏障构造 revoke 与 disable 竞争。提交状态只能是：① revoke 看到原批准仍 active 而拒绝，随后 disable 成功；或 ② disable 先将 pointer CAS 置空，随后 revoke 成功。禁止两者都成功后仍有 active pointer 指向被撤销 review。不可用任意 sleep 猜赢家。来源：P2 状态约束与 I5/U6。 | 锁/重读缺失，出现 revocation 已提交而同批准 release 仍由 active pointer 服务。 |
| `RC-R7` / `unit_real_data` | 同上 | disable 后以原固定 `releaseRef` 读取历史包，`package_json`/`package_sha256` 与禁用前相等；读取不得先解析 active pointer，也不得因 release 状态为 `withdrawn` 而拒绝历史回放。来源：P2 接受方向及持久化合同历史快照规则。 | 历史路径只查当前 pointer 或拒绝读取 withdrawn release。 |
| `RC-R8` / `unit_real_data` | `cloudfunctions-v2/test/e2e/schema-manifest.mysql.spec.ts` 与 011 迁移结构测试 | 新 011 必须排在 010 后，保留 009/010 文件摘要不变；全量 manifest 空库顺序执行后，disable/null 审计组合约束成立，错误 action/null 组合被 MySQL 拒绝，009 `activated_at_ms` 原列保留且不新增/改名时间字段。来源：当前 manifest 顺序门和 P2 迁移及时间字段裁决。 | 顺序跳过 010、只改 manifest 不改制品摘要、MySQL 允许不匹配的 action/null 行，或迁移引入第二种禁用时间来源。 |

常规内容更正必须另有回归断言：创建新候选/审核/完整 release 后按 CAS 切换；不能借 rollback 或 disable 偷换。该测试依赖独立发布包 Schema、canonical bytes 与审核/来源语义先冻结，不与本次 disable 测试混成一个 Expected。

## 三、分层、场景与未覆盖范围

| 对象 | 层 / 风险维 | 覆盖目标 | 不覆盖 / 状态 |
|---|---|---|---|
| disable 请求 Schema | `unit_real_data` / U1、U2、U3 | 必填缺失、版本边界、未知字段、内部身份字段拒绝 | 不证明操作者真实权限、release 关联或 SQL 事务 |
| 撤销/回滚/禁用领域判定 | `unit_fake` / U1、U2、U3、U4、U6 | 空/禁用/越界状态、错误命令、幂等判定与状态冲突 | Fake Repository 不证明 MySQL 约束与锁 |
| release control Repository | `unit_real_data` / U4、U5、U6、I5 | 唯一命令引用、CAS、真实两连接交错、事务故障回滚、审计读回 | 不证明 CloudBase MySQL、CMS 权限、线上 API |
| 新诊断与历史 release 解析 | `unit_fake` + 未来 `unit_real_data` / I2、I3 | disabled pointer 必须拒绝新选择；固定历史引用仍可读 | 当前无该发布服务实现；本计划不添加路由 |
| 用户/植物归属 U7 | `N/A` | N/A：本对象只操作 diagnosis 知识 bundle，不持有用户或用户植物状态 | 不把其他域的归属测试计入本对象 |
| 真实 HTTP/CMS 鉴权 I1/I4 | `N/A（本切片）` | 不在本次草案中模拟 HTTP 200 或 CMS 操作 | 未来有已冻结路由与真实身份后另做 `e2e_real_api`；当前未验收 |

## 四、迁移与事务证据门

在 P2 代码实现后才执行以下验证；本文件不声称已执行：

1. 009/010 原文件与 manifest SHA-256 保持不变；011 是新顺序迁移。全量隔离 MySQL 8.4 空库顺序执行后，读回 nullable pointer、disable audit null target、009 `activated_at_ms` 保持最近成功激活时间、disable 时间读自 audit `created_at_ms`、FK/CHECK 和中文列注释。
2. Repo Happy/Edge/Reverse 都通过同一真实 MySQL transaction path；禁用成功后检查 release 状态、内容摘要、指针 NULL/CAS 版本、审计记录、revocation 事实及历史按 ref 读回。
3. 失败恢复必须在真实事务提交边界读回，不能用 mock、内存仓库、直接 SQL 单独成功或 HTTP 200 冒充 Repository 验收。
4. 只完成当前 P2 本地 MySQL 后仍未覆盖 CloudBase 权限、CMS 管理员身份、HTTP 错误响应或线上时序；其状态必须继续标为未验收。

来源快照复用边界：仅重复 `(sourceCode, claimCode, revisionNo)` 的 `sourceClaims` 快照三元组应拒绝；不同 `claimLink` 对同一精确三元组的多对一引用合法，不得以链接条数判定快照重复。发布包草案已列入对应结构/语义 Expected，本撤回/禁用切片不重复测试其闭合实现。

**目前未验证：**本计划尚未落 executable test，也未取得 RED/GREEN、MySQL 双连接或 011 迁移证据。整体 P2 合同仍未冻结。现有 `diagnosis-knowledge.mysql.spec.ts` 通过直 SQL 验证 009/010 约束，不能代替本计划中的 Repository Expected。
