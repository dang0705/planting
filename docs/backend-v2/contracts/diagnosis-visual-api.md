# 生成式视觉诊断接口合同

- 合同版本：`diagnosis-visual-api/v1`
- 状态：**合同已冻结、未实现**（ClickUp z8v0kmvhnb「视觉诊断 1/4」；用户 2026-10-11 裁定）
- 所有者：`diagnosis`；协作：`storage`（上传）、`subscription`（AI 额度预占/结算/释放）、`user-plant`（归属与上下文）
- 机器事实源：[diagnosis-visual-api.v1.schema.json](schemas/diagnosis-visual-api.v1.schema.json)；结果结构复用 [diagnosis-result.v2.schema.json](schemas/diagnosis-result.v2.schema.json)
- 关联：[图片输入合同 `diagnosis-visual-image-input/v1`](diagnosis-visual-image-input.md)、[诊断上下文摘要 `diagnosis-context-summary/v1`](diagnosis-context-summary.md)、[AI 点数与额度](care-points-and-ai-quota.md)

## 1. 谁能用

- **游客不能使用**生成式视觉诊断，只限登录用户（路由安全级别全部为 `authenticated`）。
  - 没有凭证、凭证无效或过期：`401 PRINCIPAL_INVALID`；
  - 游客令牌或无该能力的登录主体：`403 CAPABILITY_DENIED`；
  - 都按现有身份合同处理。
- 能力代码 `USER_DIAGNOSIS_VISUAL`：只有试用与会员层级拥有（能力目录 `subscription.capability.catalog`）。免费登录用户调用时返回 `403 CAPABILITY_DENIED`。

## 2. 接口（网关前缀 `/api/v2/diagnosis/visual`）

| # | 方法与路径 | 作用 | 幂等 |
|---|---|---|---|
| 1 | `GET /api/v2/diagnosis/visual/upload-targets?count=1..3` | 取本次上传路径（只读，不落库、不预占） | 不适用 |
| 2 | `POST /api/v2/diagnosis/visual/images` | 登记已上传的图片，返回 `imageRef`（`dvi_…`） | `Idempotency-Key` |
| 3 | `POST /api/v2/diagnosis/visual/sessions` | 发起诊断，返回 `202` 与 `visualDiagnosisRef`（`vds_…`），状态为 `processing` | `Idempotency-Key` |
| 4 | `GET /api/v2/diagnosis/visual/sessions/{visualDiagnosisRef}` | 取状态与结果；完成后结果固定不变 | 不适用 |
| 5 | `GET /api/v2/diagnosis/visual/sessions?userPlantRef=&cursor=` | 本人诊断历史（回放入口） | 不适用 |

### 2.1 上传与登记

沿用封面上传的「前端直传私有目录 + 服务端登记校验」思路（见 `user-plant-cover-asset.md` §2）：

1. 前端调用接口 1，拿到 `cloudPath = diagnosis/{本人用户公开编号 usr_…}/visual/{yyyyMM}/{32 位随机十六进制}`，在末尾追加 `.jpg`、`.png` 或 `.webp` 后，用小程序云存储能力上传。存储权限沿用「仅创建者和管理员可读写」。
2. 前端调用接口 2 登记 1～3 个 `fileId`。服务端校验：目录属于本人（路径中的用户公开编号 = 登录身份）；类型属于 `storage.upload.allowed_mime_types`；大小不超过 `storage.upload.max_image_bytes`。不接受客户端声明的宽高或像素。
3. **客户端不限制像素**。服务端在送模型前统一缩放到 1024² 以内（见图片输入合同）。
4. 唯一例外披露：`cloudPath` 中含本人用户公开编号，只返回给本人，不进入日志、审计或其他响应。不返回桶名和环境 ID。
5. 没有被诊断引用的已登记图片，由孤儿文件清理任务按保留期回收（保留期属于待配置项）。

### 2.2 发起诊断

请求体 `CreateVisualDiagnosisRequest`：

- `subject` 二选一：
  - `{ userPlantRef }`：本人用户植物；
  - `{ ephemeralCaseRef }`：本人登录后的临时案例。**是否开放临时案例待裁决**，见第 6 节。
- `imageRefs`：1～3 个，不能重复（`diagnosis.visual.max_images` = 3）。
- `userQuestionZh`：可选，≤200 字。
- 客户端**不能**提交模型、提示词、上下文或价格相关字段，出现额外字段即 `400 VALIDATION_FAILED`。

处理顺序（服务端）：

1. 身份与能力：游客或无能力 → 401/403。
2. 归属：用户植物不属于本人或不存在 → `404 USER_PLANT_NOT_FOUND`；已归档 → `409 USER_PLANT_ARCHIVED`；图片未登记或不属于本人 → `404 NOT_FOUND`。
3. 幂等：同一 `user_id + Idempotency-Key`，参数相同就返回首次结果；参数不同 → `409 IDEMPOTENCY_CONFLICT`。
4. **预占额度**（在任何模型调用之前）：按成本策略的 `estimatedPoints` 原子预占。余额不足 → `409 AI_QUOTA_INSUFFICIENT`，不创建诊断、不调用模型。
5. 读取上下文摘要（长期植物，接口实现后）→ 图片统一缩放到 1024² 以内 → 估算单次输入不超过 28.8K tokens（超出则释放预占并返回 `400 VALIDATION_FAILED`）。
6. 返回 `202`：`{ visualDiagnosisRef, status: "processing", createdAt }`；之后异步调用模型。

### 2.3 取结果与回放

`VisualDiagnosisSessionResponse.status`：

| 状态 | 含义 | 结果 | 扣点 |
|---|---|---|---|
| `processing` | 处理中 | 无 | 预占中 |
| `completed` | 已完成 | `result`（`diagnosis-result/v2`）与 `completedAt` | 按实际可审计成本结算：`chargedPoints = ceil(costMicros / 800)`，不超过预估点数 |
| `released_no_charge` | 非植物（`not_plant`）或图片不可用（`image_unusable`） | 可带 `retakeAdviceZh` | **0**，预占全部释放 |
| `failed_no_charge` | 模型失败（`model_failed`）或安全门两次拒绝（`safety_gate_rejected`） | 无 | **0**，预占全部释放；已发生的供应商成本由平台承担并记入对账 |

- **回放**：历史列表与按编号取结果，返回的都是当时保存的结构化结果。**不会重新调用模型**，也不会因为提示词或模型换版而改变。服务端内部记录版本组（模型、提示词 SHA-256、输出 Schema、请求参数、价目快照），只用于审计与复算，不出现在公开响应里。
- 公开响应**不含**：`user_id`、提示词、模型原文、模型代码、预占编号、成本微元等内部字段。

## 3. 额度时序（预占 → 结算 → 释放）

```text
发起诊断（幂等键）
→ 能力快照：USER_DIAGNOSIS_VISUAL
→ 原子预占 estimatedPoints（productActionId = visualDiagnosisRef；同键同参只预占一次）
   └ 余额不足：409 AI_QUOTA_INSUFFICIENT，不调用模型
→ 模型调用（最多 maxModelLoops = 2 次，第 2 次只用于格式校验或安全门拒绝后的重试）
   └ 第 2 次调用前，确认累计成本仍在 maxCostMicros 以内；否则不再调用
→ 结果判定：
   ├ 可用结果（发现问题 / 多病并存 / 未见明显问题 / 证据不足但图片可用）：结算 ceil(实际 costMicros / 800)，释放剩余预占
   ├ 非植物或图片不可用：释放全部预占，不扣点
   ├ 模型失败或两次安全门拒绝：释放全部预占，不扣点
   └ 供应商结果未知：按额度合同进入 pending_reconciliation，对账后才结算或释放
```

- 所有图片和内部模型循环都归到同一个 `productActionId`，不重复扣费（`care-points-and-ai-quota.md`）。
- 缓存命中只会降低实际结算，预占按 0 命中估算。

## 4. 错误码

| 场景 | 错误 |
|---|---|
| 未登录、凭证无效或过期 | `401 PRINCIPAL_INVALID` |
| 游客令牌、免费用户或无能力 | `403 CAPABILITY_DENIED` |
| 请求体不合法、图片超过 3 张、单次输入估算超限 | `400 VALIDATION_FAILED` |
| 用户植物不存在或不属于本人 | `404 USER_PLANT_NOT_FOUND` |
| 用户植物已归档 | `409 USER_PLANT_ARCHIVED` |
| 图片或诊断编号不存在或不属于本人 | `404 NOT_FOUND` |
| 登记的文件超过大小上限 | `413 PAYLOAD_TOO_LARGE` |
| 登记的文件类型不支持 | `415 UNSUPPORTED_MEDIA_TYPE` |
| 额度不足（模型调用前） | `409 AI_QUOTA_INSUFFICIENT` |
| 同幂等键不同参数 | `409 IDEMPOTENCY_CONFLICT` |
| 频率限制 | `429 RATE_LIMITED` |
| 依赖不可用（存储、额度、策略未发布） | `503 SERVICE_UNAVAILABLE` |

模型失败、安全门拒绝、非植物和图片不可用**不是 HTTP 错误**：它们在 `GET` 结果里以 `failed_no_charge` 或 `released_no_charge` 状态呈现。

## 5. 与公开结果 v2 的对应

- `completed` 的 `result` 必须通过 `diagnosis-result/v2` 校验，其中 `generationSource = model_constrained`，并带 AI 生成标注。
- 模型输出先过 `diagnosis-visual-gen-output` 格式校验与服务端安全门，再由服务端投影成 v2。远程参考声明、安全间隔期提醒、「确认后才会记入养护」等固定文案由服务端补写。
- 结果中的养护类建议只是建议，用户确认后由 care 用例写入。

## 6. 待裁决

- **登录用户的临时案例能否诊断**：能力目录中 `USER_DIAGNOSIS_VISUAL` 的 scope 是 `user_plant`。
  - **推荐：允许**，并把 scope 扩为「本人用户植物或本人登录临时案例」。
  - 理由：临时案例是「先诊断、后决定是否加入花园」的常见入口（合同 `user-plant.authenticated_ephemeral.case_ttl_hours` 已有）；扣点仍按登录用户的 `user_id` 结算，归属清楚。
  - 临时案例没有长期上下文，只用临时案例允许的有限事实。
  - 不开放的话，用户必须先建档才能诊断，转化路径更长。
