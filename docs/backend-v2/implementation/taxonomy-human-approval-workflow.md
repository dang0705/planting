# P1 植物分类人工批准落盘与种子清单工作流

## 目的与边界

当前 P1 分类审核包是代理审核建议，不是产品负责人批准记录。现有
`taxonomy-review-validator.mjs` 负责核对代理批次，
`taxonomy-validation-manifest.mjs` 负责在内存中合并建议；它们都不能证明真实人工批准，
也不能把批准制品和审核包版本、批准范围、种子输出绑定在一起。

本工作流补齐这一个本地审计边界：

```text
不可变审核包与分片 SHA
→ 显式人工批准制品
→ 审核包 SHA 和逐条范围校验
→ 113 条 REUSE_AS_IS + 7 条 TRANSFORM + 80 条 QUARANTINE 精确校验
→ 新目录原子落盘批准记录、种子清单和 SHA
→ SEED_READY_NOT_ACTIVE / activeRelease=STOP
```

本工具不会：

- 代替产品负责人作出批准；
- 把 `reviewerAgent`、ClickUp 状态或代理建议当成人工批准；
- 修改现有 `plant-identity-validation-manifest-v1.json`、`seedEligible=0`、active release STOP、ClickUp、tracker 或配置目录；
- 写入 CloudBase MySQL、CMS、云存储或任何线上发布指针；
- 自动批准 `QUARANTINE`，或从部分批准推导其余记录的批准。

## 输入合同

### 审核包

默认审核包为：

`docs/backend-v2/audits/plant-identity-validation-manifest-v1.json`

工作流会逐个回读该文件声明的 `recordShards`，并核对：

- 顶层结构版本为 `plant-identity-validation-manifest/v1`；
- `agentRecommendationIsHumanApproval=false`；
- 不存在预置 `humanApprovals`；
- 每个分片的路径、原始字节 SHA、记录数量和连续 `manifestIndex`；
- 200 个唯一 `sourceRecordId` 和来源行 SHA；
- 代理建议集合恰为 113 条原样复用、7 条名称转换、80 条隔离。

审核包的 SHA 必须由批准制品显式提供，工作流会重新计算原始字节 SHA；只要不一致就失败关闭。

### 人工批准制品

批准制品版本为 `p1-taxonomy-human-approval/v1`，必须包含以下结构：

```json
{
  "approvalVersion": "p1-taxonomy-human-approval/v1",
  "batch": {
    "batchId": "产品负责人填写的唯一批次引用",
    "ticketId": "z8v0kmr9gm",
    "recordCount": 200
  },
  "approver": {
    "reviewerRef": "human:受控审核主体引用",
    "approvedAt": "带时区的 ISO 8601 时间"
  },
  "scope": {
    "kind": "FULL_REVIEW_PACKET",
    "sourceRecordIds": ["按审核包顺序列出 200 个来源引用"],
    "dispositionBySourceRecordId": {
      "来源引用": "REUSE_AS_IS | TRANSFORM | QUARANTINE"
    },
    "approvedRecordCount": 200
  },
  "reviewPacket": {
    "path": "docs/backend-v2/audits/plant-identity-validation-manifest-v1.json",
    "sha256": "审核包原始字节 SHA-256"
  }
}
```

`scope` 必须显式覆盖全部 200 条记录；其中 80 条 `QUARANTINE` 也必须逐条写出，表示人工明确保持隔离。工作流不接受只写“批准全部建议”、只写 120 条准入记录或只引用代理名称的简写。

`reviewerRef` 必须是 `human:` 开头的受控引用。不得把真实姓名、登录凭证、Cookie、token 或其他敏感资料写入制品。

## 输出合同

调用成功后，工具在一个此前不存在的新目录内写入：

- `approval-record.json`：规范化后的人工批准制品；
- `approval-record.sha256`：批准制品 SHA-256；
- `seed-manifest.json`：200 条逐条种子候选，包含批准处置和 `seedEligible`；
- `seed-manifest.sha256`：种子清单 SHA-256；
- `commit.json`：提交状态与两份制品 SHA。

种子清单的固定状态为：

```json
{
  "summary": {
    "total": 200,
    "reuseAsIs": 113,
    "transform": 7,
    "quarantine": 80,
    "seedEligible": 120
  },
  "releaseStatus": "SEED_READY_NOT_ACTIVE",
  "activeRelease": "STOP"
}
```

这里的 `seedEligible=120` 只属于新生成的本地“待导入种子清单”，不回写当前 admission manifest，也不代表数据库或 CMS 已经有 120 条活动身份。

## 运行方式

只有产品负责人完成真实人工核阅并生成批准制品后，才允许在隔离的输出目录执行：

```bash
node docs/backend-v2/audits/taxonomy-human-approval-workflow.mjs \
  --project-root /绝对路径/planting \
  --approval /绝对路径/approval.json \
  --output-dir /绝对路径/临时输出目录/plant-taxonomy-seed-批次号
```

当前没有真实人工批准制品，因此本次只提交工作流、测试和说明，不执行该命令，不生成批准记录或种子输出目录。

目标目录必须不存在。工作流先在同级临时目录中写齐全部文件，再一次性重命名目录；审核包缺失、SHA 错误、范围不完整、处置数量不精确、代理主体、目标已存在或写入失败时，临时目录会被清理，既有文件不覆盖。

## TDD 与验证

测试文件为 `cloudfunctions-v2/test/p1-taxonomy-human-approval-workflow.spec.ts`，测试层次为 `unit_real_data`：

- 使用仓库真实审核包和真实分片 SHA 验证 113/7/80 精确集合；
- 用内存构造的测试批准制品验证人工批准绑定，不把该测试夹具当作产品批准；
- 验证完整批准才能生成 `SEED_READY_NOT_ACTIVE`；
- 验证缺少人工批准、代理主体、范围篡改、审核包 SHA 错误时失败关闭；
- 验证成功只写入隔离的新目录，现有审核包字节保持不变。

最小验证命令：

```bash
(cd cloudfunctions-v2 && npm test -- --run test/p1-taxonomy-human-approval-workflow.spec.ts)
(cd cloudfunctions-v2 && npm run typecheck)
(cd cloudfunctions-v2 && npx --no-install oxlint test/p1-taxonomy-human-approval-workflow.spec.ts)
```

未覆盖边界：真实产品负责人签署过程、ClickUp 人工核阅内容、真实分类学复核、MySQL/CMS 导入和 active release 发布均仍需独立验收；本地工作流不会把这些边界伪装成已完成。

