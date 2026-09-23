# 诊断知识 CMS 人工审核交换合同（P1 增量）

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 上游：[诊断知识持久化与发布合同](diagnosis-knowledge-persistence.md)。
- 状态：**协议语义草案**；尚未确认当前 CloudBase 环境中的 CMS 模型、管理员权限、审核操作入口或真实回调，不能宣称已完成 CMS 发布闭环。

## 控制面与事实源

CMS 是诊断草稿的**人工编辑与审阅控制面**，不是运行时知识库，也不直接写 `diagnosis` 专属的候选、审核凭据、release 和 active 指针表。编辑中的 CMS 草稿可改；提交审核后，`diagnosis` 必须从受控接口读取完整草稿，校验 Schema 与逐项引用，生成自己持有的不可变候选修订及完整内容 SHA-256。审核员看到的必须是这一**确切候选修订与摘要**；对 CMS 草稿继续编辑只会生成新修订，不能改变已经送审的内容。

[CloudBase 数据模型文档](https://docs.cloudbase.net/model/introduce)确认内置 CMS 可用于内容编辑；它没有由此保证诊断知识的不可变审核证据。[数据模型事件处理文档](https://docs.cloudbase.net/model/event-handler)把自动触发审批流列为企业版及以上能力，因此本合同**不依赖**付费审批流或“修改状态字段即自动发布”。若当前环境没有该能力，仍通过受控的人工审核命令完成，不以此为停工理由；但必须在真实环境验证 CMS 草稿读取、管理员身份和权限，未验证前只算本地协议。

## 人工审核决定的最小输入

| 字段 | 中文含义与必须校验的边界 |
|---|---|
| `protocolVersion` | 审核交换协议版本；未知版本拒绝，不能猜字段语义 |
| `reviewRef` | 本次审核决定的不透明唯一引用；重复同参幂等，同引用异参冲突 |
| `candidateRef` | `diagnosis` 已冻结的候选修订引用；不能只传 CMS 可变行号 |
| `contentSha256` | 审核员看到并批准或驳回的**完整候选内容** SHA-256；服务端从不可变候选重算并作完全相等比较 |
| `decision` | `approved`、`rejected` 或 `revoked`；撤销只能阻止未来发布/使用，不能抹掉历史审核与结果 |
| `reviewerRef` | 审核记录中的管理员主体引用，由服务端从已验证的管理员身份生成；请求体自报姓名或 CMS 页面字符串无效 |
| `reviewedAtMs` | 审核记录中的 UTC 毫秒时间，由受控服务端生成；请求体时间不能充当审核事实 |
| `reasonZh` | 中文审核理由；驳回或撤销时必填，不能出现凭证或私有图片路径 |
| `reviewEvidenceRef` | 指向受控审核记录/页面快照的内部引用；只用于追责，不进入用户响应 |

传输层必须经内部服务身份和权限范围校验、HMAC/等效服务签名、请求限制、幂等与审计；普通用户、游客、小青工具和展示百科 Worker 均无权提交审核决定。服务端再次读取本域候选并校验 `candidateRef + contentSha256`，不信任调用方传来的已审核全文。若当前 CMS 没有可信管理员身份或不可变审核轨迹，须由已认证管理员在查看冻结候选后，通过专门的受控审核命令作出决定；不能把一枚可编辑的 `approved` 字段当凭据。

## 审核命令的最小合同

审核请求只接受 `protocolVersion`、`reviewRef`、`candidateRef`、`contentSha256`、`decision`、`reasonZh` 和可选的 `reviewEvidenceRef`。`reviewerRef` 与 `reviewedAtMs` **不属于客户端可写 DTO**，只能由已经校验服务身份与管理员权限的服务端填入不可变审核记录。`reviewRef` 是幂等键，不是审核员身份凭据；重复同参返回原审核记录的公开状态，同引用异参返回冲突，不能覆盖原记录。

成功响应只包含受控的 `reviewRef`、`candidateRef`、`decision` 和候选是否仍具发布资格；不得返回内部主键、管理员主体标识、审核截图路径或完整知识包。协议错误按稳定机器码区分：`REVIEW_PROTOCOL_UNSUPPORTED`（未知协议版本）、`REVIEW_FORBIDDEN`（服务或管理员无权）、`CANDIDATE_NOT_FOUND`、`CANDIDATE_HASH_MISMATCH`、`REVIEW_REF_CONFLICT`、`REVIEW_DECISION_INVALID` 和 `REVIEW_EVIDENCE_UNAVAILABLE`。公开错误仍用中文说明，且无权或不存在时不得泄露候选内容。错误码、请求/响应 Schema 与鉴权适配须在 TypeScript 合同测试中固定；本段仅是 P1 协议设计，不代表接口已实现。

## 状态与失败处理

```text
CMS 草稿编辑 → diagnosis 导入并冻结 candidateRef + contentSha256
→ 管理员对该候选作出审核决定 → diagnosis 保存不可变审核凭据
→ 单独的发布命令校验凭据、来源和安全条件 → 原子 release/active/审计
```

- `approved` 仅使**同摘要候选**具备发布资格，不自动发布。候选未找到、摘要不匹配、管理员无权、凭据撤销、来源或禁忌失效均拒绝发布且不切换 active。
- 审核被驳回后修改任何字段，必须生成新 `candidateRef`/摘要并重新审核；不允许重用旧批准。
- 审核决定的重复回放先按 `reviewRef` 对账；发布命令另有自己的幂等引用和活动指针预期版本。两种幂等不能共用一张“已处理”布尔表。
- CMS 或审核入口不可用时，**已有不可变发布仍可读**；新审核与新发布停止，不用 Qwen 生成文本、百科 `cms_review_items` 或旧诊断 QA 审核记录兜底。

## 实施与真实验收门

P1 冻结具体内部 DTO、错误代码、服务权限 scope、规范化哈希规则和审核凭据存储列，并先落 TypeScript RED；P2/P3 才接入 CMS 草稿模型、受控审核命令、`diagnosis` Repository 与发布事务。必须在当前 CloudBase 环境实测：草稿读回与权限、审核主体真实性、同摘要批准、改稿后旧批准失效、撤销、重复/异参请求、无权调用及 CMS 不可用时旧 release 继续可读。若改用平台审批流，还需独立确认套餐可用、回调真伪和所审内容哈希，并保持同一合同；平台能力存在本身不是验收证据。
