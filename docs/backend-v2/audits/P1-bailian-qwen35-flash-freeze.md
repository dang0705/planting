# P1 百炼 Qwen 3.5 Flash 精确模型冻结证据

- 审计标识：`p1-bailian-qwen35-flash-freeze`
- 核验日期：2026-09-20（Asia/Shanghai）
- 范围：阿里云百炼官方文档中的 Qwen 3.5 Flash 精确快照模型 ID、能力边界、上下文/输出上限和中国内地公开调用价。
- 本轮结论：`OFFICIAL_MODEL_SNAPSHOT_EVIDENCE_COMPLETE / CONFIG_ACTIVATION_STOP / REAL_CALL_STOP`
- 建议 `provider.bailian.model_code`：`qwen3.5-flash-2026-02-23`
- 本文件只新增证据，不修改业务关键变量目录、tracker、ClickUp、Provider release 或任何代码。

## 1. 结论先行

产品模型家族仍是 `qwen3.5-flash`，但供应商精确模型标识应使用不可变日期快照：

```text
productModelFamily = qwen3.5-flash
provider.bailian.model_code = qwen3.5-flash-2026-02-23
```

阿里云官方模型页明确说明 `qwen3.5-flash-2026-02-23` 是 2026-02-23 快照，推理服务供应商为阿里云百炼；官方定价页也单独列出该完整快照 ID。因此不建议把可滚动别名 `qwen3.5-flash` 写入 `provider.bailian.model_code`，也不应静默替换成其他 Qwen 版本。

这个结论只冻结“供应商文档中的模型标识证据”。它不等于凭证有效、目标 endpoint 可达、真实请求成功、账户配额已读回、账单已对账，也不等于 Prompt、输入/输出 Schema、AI 成本策略或产品动作上限已经验收。配置目录中的 `provider.bailian.model_code` 本轮保持 `P1_PENDING`，待主代理按治理流程另行更新和审批。

## 2. 入口与本地合同上下文

按 `docs/backend-v2/README.md` 的唯一入口渐进读取并核对：

```text
node docs/backend-v2/verify-entrypoint.mjs
→ 入口校验通过：青花植后端 v2 底层架构重构计划（完整融合闭环终版），2199 行，
  SHA-256 1a8382b83eb7720425f201afef9920e148e8eda3b15618e112516839fac10357
```

本轮只读取了与 P1 Provider 模型冻结直接相关的入口、P1 阶段、配置变量目录、P0 Qwen 外部能力卡和 AI 额度合同；没有把任何旧实现、旧别名或独立 `my-agent` 仓库当作百炼模型事实源。

本地合同的关键现状：

| 本地项 | 当前事实 | 本轮处理 |
|---|---|---|
| `diagnosis.model.family` | 已冻结为 `qwen3.5-flash` | 保留为产品模型家族，不替代供应商精确 ID |
| `provider.bailian.model_code` | `P1_PENDING` | 只在本审计中给出官方证据和建议值，不改目录 |
| `bailian_qwen_diagnosis.modelCode` | `P1_PENDING` | 不生成可激活 Provider release |
| Prompt release、结果 Schema、成本策略、额度结算 | `P1_PENDING` 或尚未完成真实核验 | 继续保持相应能力 STOP |

相关本地事实源（只读快照）如下：

```text
docs/backend-v2/README.md                                      08aa9079cc0091c72529013880e1979d59ff00c90a605fc139138634ae465dbe
docs/backend-v2/BASELINE.lock                                  8a8b54b9eebb7b46b87141563988b6b07a51b06aaf63f2a891679dbabfa36b2a
docs/backend-v2/phases/P1-contracts-identity-foundation.md     dd0dc2f82e11fd7c9caf9295372d297ab57e95515eddeef41a955ccb5bf9921c
docs/backend-v2/architecture/configuration-variable-catalog.md 9c1ac390c1b61110d2cb9b1f545a3a26d2e849f9bf36a1f6e0d8f4dab5f9c2c9
docs/backend-v2/architecture/configuration-variable-catalog.json a8afd6a267dd14fd282eed70799416630ab04a6ebb8dead9017bd50380d72a7f
docs/backend-v2/decisions/P0-external-capability-cards.md     978aab7dbcd2bc05dc1a2bb56b8c65986553758c797561b929d0a47224ef7025
docs/backend-v2/contracts/care-points-and-ai-quota.md         3f1f240781f2e65d483a9a5a611d40b2f7d2b8c34fb43814f0b1e513f2476ac3
```

## 3. 阿里云官方证据

以下页面均为阿里云百炼（Model Studio）官方帮助文档，核验时间统一为 2026-09-20（Asia/Shanghai）。

| 官方来源 | 用途 | 关键证据 |
|---|---|---|
| [qwen3.5-flash 模型信息](https://help.aliyun.com/zh/model-studio/qwen3-5-flash) | 精确快照、服务商、北京能力、上下文限制、快照价格和快照限流 | 快照 ID 为 `qwen3.5-flash-2026-02-23`；服务商为阿里云百炼；快照专属能力和限制见第 4 节 |
| [阿里云百炼模型价格](https://help.aliyun.com/zh/model-studio/model-pricing) | 中国内地按量价格交叉核对 | 华北2（北京）单独列出 `qwen3.5-flash-2026-02-23`，按输入 Token 区间计价 |
| [视觉理解模型](https://help.aliyun.com/zh/model-studio/vision-model) | 多模态输入、输出、图片/视频数量上限交叉核对 | Qwen3.5 Flash 快照行列出文本/图像/视频输入、文本输出、1M 上下文、64K 最大输出、256 张图片、64 个视频、Function Calling、内置工具和结构化输出 |
| [文本生成模型](https://help.aliyun.com/zh/model-studio/text-generation-model) | 文本能力表交叉核对 | `qwen3.5-flash` 对应快照 `qwen3.5-flash-2026-02-23`，上下文为 1M，支持思考模式、Function Calling、内置工具和结构化输出 |
| [模型上下架与更新](https://help.aliyun.com/zh/model-studio/newly-released-models) | 生命周期与模型代码交叉核对 | 2026-02-23 条目同时列出别名 `qwen3.5-flash` 和完整快照 `qwen3.5-flash-2026-02-23` |

## 4. 精确快照的能力边界（中国内地华北2/北京）

下表优先采用官方模型页中“快照版本 → `qwen3.5-flash-2026-02-23` → 华北2（北京）”的专属段落。它比可滚动别名的总览行更适合作为本次精确模型冻结依据。

| 能力或限制 | 官方值 | 对 Provider 合同的含义 |
|---|---:|---|
| 输入模态 | Text、Image、Video | 供应商具备文本和多模态输入能力；不代表青花植产品动作必须开放全部模态 |
| 输出模态 | Text | 公开响应仍必须经过 v2 结果 Schema 脱敏和校验 |
| Function Calling | 支持 | 仅证明供应商能力；不授权开放任意工具或越过青花植工具 allowlist |
| 结构化输出 | 支持 | 不等于青花植结果 Schema 已冻结或模型输出已通过真实校验 |
| 联网搜索 | 支持 | 不等于本产品已启用联网搜索，也不改变知识权威和审核边界 |
| 前缀续写 | 支持 | 不等于本产品允许模型续写用户内容 |
| 上下文缓存 | **不支持**（快照专属能力段） | 本次 Provider release 不应预置缓存命中计价或缓存依赖 |
| 批量推理 | **不支持**（快照专属能力段） | 本次 Provider release 不应按 Batch 路径或 Batch 半价核算 |
| 模型调优 | 支持（快照专属能力段） | 不在青花植本阶段范围；不等于已训练或已部署自定义模型 |
| 最大图片数 | 256（视觉模型表） | 供应商上限，不是青花植 `maxImages` 产品策略值 |
| 最大视频数 | 64（视觉模型表） | 供应商上限；青花植当前问诊合同是否允许视频仍需独立冻结 |
| 中国内地快照限流 | RPM 600；TPM 1,000,000 | 供应商文档上限，不等于账户实际配额或产品限流策略 |

### 4.1 上下文和输出上限

官方快照页给出精确数值（不是把 `1M`、`64K` 当作近似值）：

| 参数 | 官方值 |
|---|---:|
| 最大输入长度 | 991,808 tokens |
| 最大输出长度 | 65,536 tokens |
| 上下文长度 | 1,000,000 tokens |
| 思考模式最大输入长度 | 983,616 tokens |
| 思考模式最大输出长度 | 65,536 tokens |
| 最大思维链长度 | 81,920 tokens |

这些是供应商能力上限。它们不是青花植产品动作的 `maxInputTokens`、`maxOutputTokens`、`maxModelLoops` 或 `maxCostMicros`；后者必须从 Prompt、Schema、视觉证据数量、预算和 AI 额度合同共同产生不可变 cost policy，不能直接把供应商上限当作产品默认值。

## 5. 当前中国内地公开调用价

计价地域：华北2（北京）；计价口径：按量调用原价；单位：人民币元/百万 tokens；价格核验日期：2026-09-20。

| 单次请求输入 Token 区间 | 输入单价 | 输出单价 |
|---|---:|---:|
| `0 < Token ≤ 128K` | ¥0.2 / 百万 tokens | ¥2 / 百万 tokens |
| `128K < Token ≤ 256K` | ¥0.8 / 百万 tokens | ¥8 / 百万 tokens |
| `256K < Token ≤ 1M` | ¥1.2 / 百万 tokens | ¥12 / 百万 tokens |

官方模型页明确这是调用原价，不包含限时活动；控制台活动价、账号免费额度、合同折扣和账单结算均不在本审计内。视觉输入的图片/视频 Token 折算、思考模式实际用量、供应商账单延迟和未知结果对账，仍须在 cost policy 与真实回放中单独证实。

## 6. 官方页面存在的别名/快照字段冲突

同一官方 `qwen3-5-flash` 页面同时给出了可滚动别名总览和精确快照段落，两者在能力和限流字段上不完全相同：

| 页面段落 | 上下文缓存 | 批量推理 | 模型调优 | 北京限流 |
|---|---|---|---|---|
| `qwen3.5-flash` 别名总览 | 支持 | 支持 | 不支持 | RPM 30,000；TPM 10,000,000 |
| `qwen3.5-flash-2026-02-23` 快照段落 | 不支持 | 不支持 | 支持 | RPM 600；TPM 1,000,000 |

模型价格总表还在快照行附近标出了 Batch/上下文缓存折扣提示，而快照专属能力段落标为不支持。这个冲突不能由本地配置、mock 或本审计自行裁决为真实运行时行为。为满足“精确快照、禁止静默换模”的要求，本审计对 Provider 能力边界采取保守且可追溯的解释：

1. `provider.bailian.model_code` 使用完整快照 ID，而不是别名。
2. 以快照专属段落作为当前冻结的能力和限流证据；不在 release 中预置缓存或 Batch 计价。
3. 若后续真实 endpoint 返回与快照段落不同的能力，必须记录供应商文档版本/响应证据，重新发布 Provider release；不能把别名总览或活动价当作静默覆盖。

## 7. 证据边界与未验收事项

### 已证明

- 阿里云官方文档给出完整快照模型 ID：`qwen3.5-flash-2026-02-23`。
- 该快照的官方推理服务供应商是阿里云百炼。
- 官方文档给出北京地域的输入/输出模态、结构化输出、Function Calling、联网搜索、上下文/输出上限和快照限流。
- 官方文档给出北京地域当前公开按量调用价及输入 Token 分档。
- 产品模型家族 `qwen3.5-flash` 与供应商精确 `model_code` 可以、且应当分层记录。

### 尚未证明

- `credential_ref` 是否存在、有效、权限正确、未过期或具备余额。
- 青花植实际目标 endpoint 是否将 `qwen3.5-flash-2026-02-23` 路由到同一快照，以及真实请求是否成功。
- 真实账户 RPM/TPM、免费额度、余额、账单、视觉 Token 计算和未知结果对账。
- Prompt release SHA-256、输入/输出 JSON Schema、内容安全规则、额度预占/结算/释放和产品动作成本上限。
- 真实文本/视觉成功、拒绝、超时、断流、重试、供应商错误和脱敏公开响应。
- 模型输出不会绕过诊断建议边界、用户确认、植物身份准入或 CMS 禁区。

因此本审计不能把 P0 的 Qwen `CONTRACT_STOP` 或 `INTEGRATION_STOP` 改为 GO，也不能授权部署、真实调用、写入 CMS 或扣减用户额度。它只提供后续 Provider release 所需的模型 ID/能力/价格证据。

## 8. 后续使用建议（不在本轮执行）

主代理后续若取得用户确认并更新配置目录，建议把以下字段放入同一不可变 Provider release，并由真实合同测试锁定：

```text
productModelFamily: qwen3.5-flash
modelCode: qwen3.5-flash-2026-02-23
maxInputTokens: 991808       # 供应商能力上限；不是产品动作默认值
maxOutputTokens: 65536       # 供应商能力上限；不是产品动作默认值
maxImages: 256               # 视觉模型表供应商上限
```

思考模式上限、视频上限、北京 RPM/TPM 和分档价应作为同一证据快照的来源字段保存；产品动作仍需更小且经批准的 cost policy。Prompt、Schema、凭证、endpoint、重试、熔断、预算和审计保留不得因为本文件而获得隐式默认值。

## 9. 复核记录

本轮只执行了入口核验、只读本地证据读取、官方网页核验和本文件哈希生成；没有读取或记录任何凭证、Cookie、Token、Prompt 原文、模型原文、用户数据或外部响应。

复核命令：

```bash
node docs/backend-v2/verify-entrypoint.mjs
sha256sum docs/backend-v2/audits/P1-bailian-qwen35-flash-freeze.md
sha256sum -c docs/backend-v2/audits/P1-bailian-qwen35-flash-freeze.sha256
```
