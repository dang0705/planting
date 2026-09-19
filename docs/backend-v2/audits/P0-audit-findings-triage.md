# P0 审计发现分诊

> 审计票据：`p0-audit-findings-triage`  
> 审计时间：2026-09-19（Asia/Shanghai）  
> 审计范围：天气配置值的本地跟踪边界、P-1 外部来源审计 sidecar 的 `README.md` 输入哈希一致性。  
> 只读边界：未读取 `.env.local`、`cloudbaserc.json` 或其他凭证内容；未修改源文件、既有报告、既有 sidecar、代码、ClickUp、云端或数据库。

## 1. 结论

本分诊报告自身交付：`PASS`。两个发现的风险处置结论如下：

| 发现 | 结论 | 含义 |
|---|---|---|
| `QWEATHER_API_KEY` 曾出现在工具输出 | `SECURITY_STOP` | 来源代理已在不重读值的情况下确认其属于天气供应商 API 密钥/凭证材料。仓库跟踪文件中没有发现该类明文凭证，但该密钥必须按潜在泄露处理，不能继续传播。 |
| P-1 外部来源 sidecar 的 `README.md` 哈希不一致 | `RE_SIGN_REQUIRED`，不是篡改判定 | 当前差异来自合法的准备状态更新，未发现架构或计划语义被修改；旧 sidecar 不能继续作为“所有输入未变化”的证明，应在输入冻结后重新生成并复核。 |

总体发布结论：`STOP`。本报告不解除任何外部能力、凭证或 P-1/P0 发布门。

## 2. 天气配置值分诊

### 2.1 可核对事实

本次只检查版本库索引、路径元数据和不含值的文本匹配，不打开本地配置内容：

| 检查项 | 结果 |
|---|---|
| Git 跟踪文件中的天气凭证名/配置名 | 存在环境变量名和读取逻辑；未发现明文天气凭证值。 |
| `.env.local` | 存在于工作区，未纳入 Git 跟踪，且被 `.gitignore` 忽略；本次未读取内容。 |
| `cloudbaserc.json` | 存在于工作区，未纳入 Git 跟踪，且被 `.gitignore` 忽略；本次未读取内容。 |
| `.env.local.example` | 对应天气密钥示例为空值；不是凭证。 |
| 跟踪文件秘密扫描 | 只能说明跟踪文件没有发现明文秘密，不能证明被忽略的本地文件或工具输出安全。 |
| 工具输出中的原始值 | 已确认变量名为 `QWEATHER_API_KEY`，类别为天气供应商 API 密钥/凭证材料；本次不复现、不复制、不尝试从历史输出恢复，也不判断值本身。 |

### 2.2 风险判断

当前证据不能证明该值来自 Git 跟踪文件；可能来自被忽略的本地运行配置或运行时输出，但本分诊不读取这些配置。由于变量类别已经确认是天气供应商 API 密钥/凭证材料，必须按已泄露处理；当前安全门保持 `SECURITY_STOP`。

### 2.3 最小处置建议

1. 由有权限的操作者在供应商控制面轮换 `QWEATHER_API_KEY`，并撤销旧 key；不得在终端、报告、ClickUp、OpenViking、日志或交接材料中显示或复制任一 key。
2. 在批准配置中更新新 key，保持本地配置和部署包不进入 Git；认证仍只使用 Chrome `default/main`。
3. 通过脱敏回放确认旧 key 被拒绝、新 key 成功；只保留供应商、操作类型、状态类别、时间和结果哈希等非秘密证据，不保留请求头、完整 URL、key 或响应原文。
4. 轮换前后继续使用 `scripts/security/check-no-secrets.mjs` 做跟踪文件扫描，并单独确认被忽略文件不会进入 v2 部署包；清理可控制的终端日志、临时输出和交接材料。
5. `SECURITY_STOP` 的关闭条件是：供应商控制面已轮换并撤销旧 key、批准配置已更新、脱敏回放证明旧 key 被拒绝且新 key 成功；本分诊不执行这些云端或本地配置变更。

## 3. P-1 外部来源 sidecar 哈希分诊

### 3.1 精确差异

核对对象：`docs/backend-v2/audits/P-1-external-sources-z8v0kmr96t.sha256`。

| 对象 | 哈希 |
|---|---|
| sidecar 记录的 `docs/backend-v2/README.md` 哈希 | `cfe9aca1ce164495f9248c806faec63ab646f934b635187bbc076a913699a006` |
| 当前 `docs/backend-v2/README.md` 哈希 | `6368671243d2f687e773e3583e1df17a7d944351f3d5f7f224dd6820b430e670` |
| 当前 `P-1-external-sources-z8v0kmr96t.md` 哈希 | `9c8f9115fc94080b38bedeade1053e3e18db9abd554e6b320973780ba972ccc6` |
| sidecar 自身完整性 | 除 `README.md` 外，其余列出的输入和报告均通过；`README.md` 一项失败。 |

`README.md` 当前相对工作树基线只有 2 行新增、2 行删除，内容是“P-1 资产审计已通过、P0 正在执行、ClickUp 任务已创建并由专职状态代理每 15 分钟同步”的准备状态更新。没有发现架构图、Master Plan 基线、业务语义或合同规则被改写。

### 3.2 结论与边界

这是合法文档状态更新造成的输入漂移，不是当前证据支持的篡改风险。旧 sidecar 仍可证明其他列出的输入和报告在其生成时的哈希，但不能证明当前 `README.md` 未变化。因此：

- `P-1-external-sources-z8v0kmr96t` 报告内容不因该单项差异自动失效；
- 旧 sidecar 不能作为当前全量输入快照证明；
- 应在 `README.md` 状态更新冻结后重算该 sidecar，并对引用同一 README 快照的 P-1 报告/sidecar 一并复核；
- 重签前不得把旧 sidecar 的全量 `sha256sum -c` 结果标成通过；
- 本次不直接改写既有 sidecar，避免越权改变历史证据。

## 4. 最小复核命令

以下命令只读且不显示任何配置值：

```bash
sha256sum docs/backend-v2/README.md
sha256sum -c docs/backend-v2/audits/P-1-external-sources-z8v0kmr96t.sha256
git ls-files --error-unmatch .env.local cloudbaserc.json
node scripts/security/check-no-secrets.mjs
```

最后一条只扫描版本库跟踪边界；不能代替本地忽略配置和工具输出的秘密处置。

## 5. 交接状态

- 本报告、哈希文件和 heartbeat 是本次唯一新增制品。
- 未改动天气源代码、配置值、P-1 报告、P-1 sidecar、Master Plan、tracker、ClickUp、CloudBase、MySQL、CMS、Storage 或 OpenViking。
- `QWEATHER_API_KEY` 已确认属于天气供应商 API 密钥/凭证材料；在完成“控制面轮换/撤销旧 key→更新批准配置→脱敏验证旧 key 被拒绝、新 key 成功”前保持 `SECURITY_STOP`。
- P-1 sidecar 等待输入冻结后重签；不得把该合法 README 更新误报为篡改。
