# P2 诊断知识发布包与撤销并发合同草案

- **状态：待主代理及用户裁决；不是已冻结合同，不得据此直接修改 DDL 或实现发布服务。**
- **范围：**仅提出诊断知识发布包字段、摘要输入、发布状态和审核撤销并发的最小合同；不实现代码、不改既有持久化合同、不访问 CloudBase/CMS。
- **唯一计划源：**根目录《青花植后端 v2 底层架构重构计划（完整融合闭环终版）》，通过 `node docs/backend-v2/verify-entrypoint.mjs` 核对，基线 SHA-256 为 `0b94c71ea83e02134237c9c41b357e0a30e7d60250d6bc21eedca73d2d4c0732`。
- **渐进读取：**按 `docs/backend-v2/README.md` → `BASELINE.lock` → `phases/P2-core-domains.md` → 本草案列明的诊断合同、DDL、候选 Schema。未递归阅读其余模块资料。

## 一、已有事实与边界

计划将黄叶、萎蔫、疑似虫害定义为症状入口而非病因；来源主张、园艺原因、Outcome、Action 及受审映射分开治理。诊断发布包须不可变，包含来源、原因、Outcome、Action、映射，并经过 diagnosis 单一写者的兼容性、适用范围和禁忌校验（Master Plan 第 84、279–300、539–543 行）。

当前可直接沿用的持久化事实：

- 候选内容是经版本化 Schema 校验的完整快照；候选摘要绑定完整候选 JSON。既有摘要规则递归排序对象键、保留候选数组原顺序、紧凑 JSON 转 UTF-8 后计算 SHA-256；该规则只锁定候选摘要，不自动定义发布包摘要（`contracts/diagnosis-knowledge-persistence.md:33–38`）。
- 发布表已经区分候选摘要、发布结构版本、完整 `package_json`、`package_sha256`、发布版本和发布状态，并以 `(bundle_code, version)`、`(bundle_code, package_sha256)` 唯一约束去重（`schema/009_diagnosis_knowledge.sql:196–222`）。
- 活动指针有独立乐观并发版本；发布审计有唯一命令引用（`schema/009_diagnosis_knowledge.sql:224–255`）。
- 审核撤销是独立追加记录，唯一绑定已批准审核；保存撤销请求摘要、管理员主体摘要、理由、证据引用和服务端时间，原批准不改写（`schema/010_diagnosis_review_revocations.sql:5–23`）。
- 当前候选 Schema 已锁定症状题包精确发布引用、原因、Outcome、Action、映射和逐条来源主张引用的形状（`contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json:3–18, 23–37, 96–169`）。
- 当前持久化合同要求批准不等于发布、发布与撤销按同一审核目标串行化、事务提交结果不明时使用新连接按幂等引用只读对账；撤回知识以新发布和指针切换表达（`contracts/diagnosis-knowledge-persistence.md:40–54`）。审核交换合同另明确：撤销不在审核请求中暗改在线指针，在线发布退出服务须另有明确合同（`contracts/diagnosis-cms-review-exchange.md:21–35`）。

以上事实足以锁住业务边界，但不足以冻结发布包具体 JSON、摘要的规范字节、撤回状态变化和首版指针并发方案。以下是供裁决的最小草案，不是现行事实。

## 二、建议的发布包 Envelope v1

建议新增独立 `diagnosis-knowledge-release.v1.schema.json`。`package_json` 保存下面完整内容对象；字段名沿用现有候选 Schema 的英文标识符，中文解释只在 Schema `description` 和开发文档中提供。Schema 顶层采用 `additionalProperties: false`，未知字段必须先升新 Schema 版本，不能被静默忽略。以下 JSON 仅为字段层次示意，摘要文字是占位符，空数组也不是有效业务样例，不能作为测试 fixture 或已冻结 DTO。

```json
{
  "schemaVersion": "diagnosis-knowledge-release/v1",
  "bundleCode": "yellow-leaf-core",
  "candidate": {
    "candidateRef": "cand_public_ref",
    "contentSha256": "64位小写十六进制摘要",
    "content": {
      "schemaVersion": "diagnosis-knowledge-candidate/v1",
      "bundleCode": "yellow-leaf-core",
      "revisionNo": 1,
      "symptomModeRefs": [],
      "causes": [],
      "outcomes": [],
      "actions": [],
      "mappings": [],
      "claimLinks": []
    }
  },
  "sourceClaims": []
}
```

### Envelope 字段与来源

| 字段 | 建议语义 | 来源/裁决状态 |
|---|---|---|
| `schemaVersion` | 发布包自身结构版本；提议固定为 `diagnosis-knowledge-release/v1` | DDL 有 `schema_version` 列；版本字符串未冻结，**待裁决** |
| `bundleCode` | 兼容知识包范围；必须等于候选 `content.bundleCode` | 候选 Schema 和 DDL 已有；可冻结 |
| `candidate.candidateRef` | 发布来源的公开候选引用，不暴露内部主键 | DDL 已有 `candidate_ref`；可冻结 |
| `candidate.contentSha256` | 审核实际批准的候选完整内容摘要，必须与冻结候选完全相等 | 候选/审核合同与 DDL 已有；可冻结 |
| `candidate.content` | 审核所见的完整候选 JSON 原样嵌入，保留其中数组顺序；不得从关系表重建候选顺序 | DDL 候选快照和候选 Schema 支持；建议作为发布包完整知识内容 |
| `sourceClaims` | 发布时解析 `claimLinks` 对应的、精确到 `sourceCode + claimCode + revisionNo` 的来源主张快照；一条 `claimLink` 必须恰有一个匹配快照 | Master Plan 要求包内含来源；DDL 有来源与主张修订字段；快照字段范围待裁决 |

### `sourceClaims` 最小建议字段

每项包含：`sourceCode`、`claimCode`、`revisionNo`、`sourceOrganizationZh`、`sourceTitleZh`、`sourceLocatorUrl`、`sourceType`、`licenseScope`、`claimLocator`、`claimZh`、`applicability`、`claimRole`、`evidenceSha256`、`verifiedAtMs`。前四至八项映射来源主档 `diagnosis_sources`；其余映射精确的 `diagnosis_source_claim_revisions`。实际 DB 列名见 `schema/009_diagnosis_knowledge.sql:5–40`。

仅允许发布时 `source_state='verified'` 且许可范围允许本包保存/使用对应主张的来源。`sourceClaims` 是有序集合：规范化前按 `sourceCode`、`claimCode`、数值型 `revisionNo` 升序排列；来源元数据及主张内容作为快照随 release 保存，不在运行时按“最新来源行”重查。这里的具体字段和“许可允许保存主张文本”的规则仍需法务/内容 owner 核验，**未核验前不得把 `claimZh` 自动复制进可公开响应**。

候选中的 `symptomModeRefs`、`causes`、`outcomes`、`actions`、`mappings`、`claimLinks` 不在顶层重复，完整保留在 `candidate.content`。精确 `questionPackageReleaseRef` 是当前唯一已落在候选合同里的外部兼容引用；不能由 `schemaVersion` 推断诊断规则引擎版本，也不能擅自添加尚未定义的最小/最大运行时版本字段。

## 三、发布包 SHA-256 规范草案

**建议摘要对象就是完整 `package_json` 内容对象**，不含 `packageSha256` 自身（避免循环摘要）；经发布 Schema 校验后，按以下规则规范化：

1. 对象键递归按稳定的 Unicode 码元序字典序排列；对象键不得重复。
2. `candidate.content` 中所有数组原样保留候选顺序，包括 `stepsZh`、证据条件、复查条件和映射顺序；不得依赖 SQL 行返回顺序重建这些数组。
3. 仅 `sourceClaims` 视作集合，按上节三键排序；相同三键拒绝，不以输入顺序打破并列。
4. JSON 使用紧凑序列化；字符串不做 Unicode 归一化、不去空白、不改写中文。Schema 数值仅接收定义范围内的整数和布尔值，拒绝 NaN、Infinity、浮点数和 `-0` 等非合同数值。
5. 将规范化 JSON 编码为 UTF-8 字节，计算 SHA-256，存为 64 位小写十六进制。

摘要纳入 `schemaVersion`、`bundleCode`、候选公开引用/候选摘要/完整候选、精确题包发布引用与解析后的来源主张快照。建议不纳入数据库 `release_ref`、`version`、审核内部主键/审核人/审核时间、发布时间、`release_state`、active pointer/CAS 版本和切换审计；这些是发布/运行元数据，不是包内容。是否将 `candidateRef`、`revisionNo` 纳入完整发布包摘要随 `candidate.content` 已含 `revisionNo` 一并考虑；本草案因 `candidateRef` 是来源追溯字段而建议纳入。

**待裁决的规范细节：**候选摘要用“字典序 + 紧凑 JSON”的既有描述没有定义 Unicode 键比较和 JSON 数值序列化细节；发布包是否复用同一序列化器、是否使用 RFC 8785，须由主代理选定并写出固定黄金字节/摘要向量。以上码元序、整数限制和数组差异均为建议，不应被实现者自行当成事实。改规范须有版本升级，不得重解释已有摘要。

## 四、与 009/010 DDL 列的映射

| 发布包/发布流程字段 | DDL 位置 | 约束建议 |
|---|---|---|
| `candidate.candidateRef` | `diagnosis_knowledge_candidates.candidate_ref` → 发布表 `candidate_internal_id` FK | 先由公开 ref 查本域行；内部 id 仅在库内使用 |
| `candidate.contentSha256` | `candidate_content_sha256`、审核表 `content_sha256` | 发布前必须同时匹配候选及 `approved` 审核凭据 |
| `candidate.content` | 候选表 `candidate_json` | 发布快照只读，按候选 Schema 校验，并与 `contentSha256` 重算相等 |
| `schemaVersion` | `diagnosis_knowledge_releases.schema_version` | 必须等于包内 `schemaVersion`；现表未约束相等 |
| 完整 Envelope | `diagnosis_knowledge_releases.package_json` | 插入后不得改包体；DDL 目前未阻止 UPDATE |
| 包体摘要 | `package_sha256` | `(bundle_code, package_sha256)` 唯一；摘要规范待冻结 |
| `bundleCode` | `bundle_code` | 列值必须等于包体顶层和候选内值 |
| 发布序号 | `version` | 同 bundle 唯一、建议严格递增；它不是 active pointer 的 `version` |
| 发布状态 | `release_state` | 当前允许 `published|withdrawn`，改变语义待裁决 |
| 发布/回滚 | active pointer `release_internal_id/version` + `diagnosis_release_activation_audit` | 预期 pointer 版本 CAS；审计与切换同事务 |
| 撤销事实 | `diagnosis_review_revocations` | 不改原 review，不单独 UPDATE release 或 active pointer |

DDL 复合外键只能保证关联行和审核决定存在；不能保证 release 包内 JSON 与各列一致、审核当前未撤销、active pointer 指向 `published` release，或审计字段与 CAS 实际变化相符。以上必须由 release Schema、Repository 和事务测试校验，不能宣称由现有 DDL 单独保障。

## 五、撤销、release_state 与并发顺序草案

### 已可冻结的审核撤销语义

- 撤销只对已批准审核生效，是独立不可变事实；不删除或改写 approval。
- 撤销提交后，该 approval 不再准许**新建**发布；发布与撤销同一审核目标串行化，禁止发布方用撤销前快照越过已提交撤销。
- 审核撤销本身不得隐式更改已发布 release 或 active pointer。已在线包是否立即停止服务是独立的“发布撤回”决策；不能把 review revocation 偷换成 release withdrawal。
- 同 `revocationRef`、同请求摘要重放返回原撤销结果；同引用异摘要冲突；同一 target review 仅允许一条撤销事实。010 有唯一键和请求摘要列，但服务语义仍须实现/测试。

### 建议的事务锁顺序

每个审核命令使用一个数据库事务；`publish` 和 `revoke` 使用相同首锁，避免检查后插入造成竞态：

1. 认证及请求 Schema 校验；解析受控 `reviewRef`，不得信任请求自报审核人或内部主键。
2. 按 `review_ref` 对 `diagnosis_review_attestations` 目标行执行 `SELECT ... FOR UPDATE`；必须是已经通过、绑定同一不可变候选修订和摘要的审核。
3. `revoke`：在持有审核行锁期间按 `revocation_ref` 重查幂等记录并比对 `request_sha256`；若无冲突且目标尚无撤销，插入一条撤销记录后提交。唯一键仍作最后防线。
4. `publish`：在持有同一审核行锁期间检查对应撤销记录不存在，重新核对候选摘要、Schema、来源许可/状态和所有精确题包/来源引用；其后取得 bundle 活动指针锁并检查调用方的 expected pointer version。
5. 同一事务内插入不可变 release、CAS 切换指针、追加 activation audit；任一步失败全部回滚。提交结果不明时按既有合同用新连接只读对账，不能盲目重试。

**首版空指针竞态仍待裁决：**既有活动指针行缺失时不能靠 `SELECT ... FOR UPDATE` 锁不存在的行。可以只依赖 `(bundle_code, version)` 与 `uq_diag_active_bundle` 唯一约束让竞争插入方整体回滚后读回重试，也可增加 bundle 锁实体；当前证据不足以选择后者。本草案建议先用既有唯一键/CAS 方案，但必须在隔离 MySQL 双连接 Expected 中验证首次激活、并发版本唯一性和无半写；验证失败再单独裁定是否增锁表。

### `release_state` 与不可变性冲突（必须裁决）

009 同时把表称为“不可变发布包”，又提供允许 `published → withdrawn` 的 `release_state` 列。建议将不可变边界定义为：**候选引用、版本、Schema、包体与摘要在发布后永久不可变；`release_state` 若允许改变，只能是当前可服务状态投影，必须通过独立受权命令和追加审计完成。** 但现有 activation audit 的动作枚举仅有 `activate|rollback`，也没有“当前 release 被撤回后的指针/服务决策”合同，因此这项建议仍为 **pending**：

- review revocation 不改 `release_state`，不改 active pointer。
- 只有独立 release-withdrawal 命令可停用在线内容；不得把 `withdrawn` 当作内容改写或删除历史。
- 必须另定：撤回活动包时，是指向安全替代包、清空指针还是由 serving gate 拒绝；谁可执行、如何审计、如何恢复。现表的 `release_state` 是否作为可变投影，及审计表是否需新增 `withdraw` 动作/独立撤回事件，待主代理/用户裁决。
- 在裁决前，不写 `release_state` 更新实现或撤回 Expected；正常发布插入时写 `published`，其余语义不得假设。

## 六、独立 Expected 与分层测试草案

测试规范使用现有 `test-matrix`：Expected 必须来自合同/计划/common scene，不由当前实现反推；每条测试注明经过路径、替换边界与未覆盖范围。现阶段先冻结 Expected 草案，不代表测试已编写或通过。

| 层级 / 类型 | 独立 Expected 来源及代表场景 | 必须证明 / 不得声称 |
|---|---|---|
| `unit_fake`：发布包 Schema 与摘要规范测试，建议 `cloudfunctions-v2/test/contracts/diagnosis-knowledge-release-envelope.spec.ts` | Master Plan 第84/295/542行；候选 Schema v1；本草案经裁决的 Envelope/摘要向量 | 合法完整包可通过；缺/错 `schemaVersion`、候选 hash 不匹配、bundleCode 不一致、未知字段、缺来源快照或重复 `sourceClaims` 精确三元组拒绝；多个 `claimLink` 可以复用同一精确主张。键顺序变化不变、sourceClaims 输入行顺序变化归一、候选语义数组变序会改候选摘要/发布包摘要；改任一参与摘要字段会改变摘要。只证明类型与纯函数，不证明 SQL、CMS、事务或真实数据目录 |
| `unit_real_data`：发布/撤销 Repository + 本地隔离 MySQL 双连接测试，建议新文件 `cloudfunctions-v2/test/e2e/diagnosis-knowledge-publish-revocation.mysql.spec.ts` | 持久化合同第50–54行的串行化、无半写、幂等与提交未知恢复；I5 写中断 common scene；两个并发交错构造，不以 sleep 猜赢家 | 撤销先持审核行锁并提交时，publish 后继必须失败且无 release/pointer/audit 半写；publish 先获锁提交时，release/pointer/audit 同成，若该批准仍被 active release 使用，后继 revoke 必须拒绝且不追加撤销事实，先由独立受权命令把活动包安全切换或停用；相同撤销/发布 idempotency key 同参回读、异参冲突；CAS 冲突无半写；首包并发只产生一个有效指针/唯一版本。真实经过 Repository 和 MySQL 事务，不替换 DB；不证明 CloudBase MySQL/权限 |
| `e2e_real_api`：未来受控 CMS 管理审核 API + diagnosis 发布 API | 审核交换合同 I4：真实 CMS 管理员身份与服务身份均需通过；审核撤销和发布接口语义 | 需真实 CMS 管理员认证及目标环境 API；目前无路由/集成证据，暂不执行、不算本草案验证 |

并发用例应使用明确事务屏障控制先后顺序，再另做真实并行争用；至少断言事务提交后的 release 数、包摘要、active pointer、pointer version、审计数和撤销行数。不能只检查“最终状态看起来对”，也不能仅用直 SQL INSERT/UPDATE 代替 Repository 的真实发布路径。

## 七、必须由主代理/用户裁决的项目

| 项目 | 当前建议 | 状态 |
|---|---|---|
| release Envelope 顶层字段和 `sourceClaims` 快照形状 | 按第二节，候选完整内容嵌套，精确引用的来源主张另附发布时快照 | 待批准后才能新增 Schema |
| 发布包 hash 规范字节、JSON 数值/键排序标准 | 复用候选的递归键排序原则，固定稳定 sourceClaims 顺序及黄金向量；明确是否 RFC 8785 | pending；不能交给实现者猜 |
| 来源元数据快照字段和许可边界 | 保存可回放的来源/主张信息；按许可限制内容保存/公开 | 需 CMS/内容治理 owner 核验 |
| 诊断执行器兼容版本 | 目前只确切存在候选 Schema 版本和题包发布引用；不新增伪装成算法版本的字段 | pending；由 runtime 合同提供依据 |
| `release_state` 是否可变及在线撤回方式 | review revoke 不动 release；另立受权撤回命令和审计 | pending；解决与“不可变发布”表意冲突 |
| 首次激活无 pointer 行的并发 | 先试现有唯一键/CAS + 全事务回滚/重试，不默认新增锁表 | pending；须真实 MySQL 双连接验证 |
| 发布 version 分配 | 与 pointer CAS version 分离；已存在 pointer 时在锁内取同 bundle 下一个 version；首包靠唯一键争用失败者全回滚后读回 | 建议；Expected 需验证 |
| 发布幂等请求摘要 | audit 有 command_ref 唯一但无 request hash；需约定同参重放判定依据及异参冲突字段 | pending；现有 DDL 不足以证明 |

## 八、下一步最小 Test First 切片与边界

1. 由主代理先只裁决第七节前四项，至少确定 Envelope 字段、规范化算法/黄金向量、来源快照最小集合；待定项保持 `pending`，不写硬断言。
2. 独立 Expected 固定后，先新增 `unit_fake` 合同用例 `cloudfunctions-v2/test/contracts/diagnosis-knowledge-release-envelope.spec.ts`，用手写固定 package fixture 和固定预期字节/摘要；本草案建议只对应未来的独立 release Schema/序列化器，不改候选摘要实现或测试。
3. 该用例达到可审计 RED 后，再新增 `docs/backend-v2/contracts/schemas/diagnosis-knowledge-release.v1.schema.json` 与 diagnosis 专属纯摘要模块；源代码的确切归属文件由 diagnosis owner 在实施 ticket 中确定。
4. 单独冻结 release-state / 撤回方案后，才新增 Repository 发布/撤销事务及 `unit_real_data` 双连接用例。不要与 Envelope Schema slice 合并，以便各自有清晰 RED/验证边界。

**本草案未做的工作：**未修改 `contracts/diagnosis-knowledge-persistence.md`、009/010 DDL、Schema、应用代码或测试；未重新运行现有测试；未执行真实 MySQL、CloudBase、CMS 或 HTTP 验证。现有 `P1-diagnosis-review-revocation-mysql-evidence.md` 仅报告本地空库/直 SQL 结构验证，并明确不覆盖应用幂等、发布撤销并发、线上撤回策略或 CloudBase 权限。任何人不得引用本草案声称 release contract 已冻结或发布/撤销闭环已验收。
