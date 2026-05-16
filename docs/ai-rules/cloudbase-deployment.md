# CloudBase 部署规则

## 1. 适用范围

本文件适用于 CloudBase 云函数部署、`diagnose-http` 发布、CloudBase 发布回滚、环境变量、运行时配置、函数代码更新、HTTP smoke 与 DB 证据验证，以及诊断流、route、outcome、replay 改造后的发布验证。

## 2. 禁止事项

1. 不要把 `npx @cloudbase/cloudbase-mcp@latest updateFunctionCode ...` 当作 CLI 部署命令；CloudBase MCP 应通过当前会话可用的 MCP 工具执行。
2. 不要把 MCP / CLI / wrapper 的返回成功当作部署事实来源。
3. 不要把不可靠的一次性命令当作发布入口。
4. 不要用临时部署命令覆盖项目 wrapper。
5. 对既有函数，不能随意使用会覆盖 runtime config、timeout、envVariables 的部署方式。
6. 不要用命令返回成功代替真实部署验证。
7. 不要在未完成 smoke / DB 证据验证时宣称 `diagnose-http` 发布通过。

## 3. 标准部署入口

部署、SQL、查诊断 session 等 CloudBase 相关任务，优先使用当前会话可用的 CloudBase MCP 工具。项目 wrapper 仅作为 MCP 不可用、用户明确允许或需要本地打包兼容时的 fallback / convenience path，不能单独作为发布通过证据。

fallback wrapper：

```bash
node scripts/deploy-function.js diagnose-http
```

wrapper 内部应使用 CloudBase CLI code update：

```bash
npx --package @cloudbase/cli@3.2.2 tcb fn code update <functionName> --dir cloudfunctions/<functionName> -e <envId> --json
```

## 4. 发布前检查

发布前必须确认目标函数名、目标 CloudBase 环境、是否为既有函数、是否会覆盖 runtime config / timeout / envVariables、是否涉及诊断流 / route / outcome / replay 行为变化、是否需要 DB-backed smoke 或 replay 证据、是否需要回滚方案。

## 5. 发布后验证

发布后必须确认真实部署：

```bash
tcb fn detail <functionName> -e <envId>
```

使用 MCP 时必须以对应的函数详情 / 状态查询结果替代或补充上述 CLI detail。必须验证：

1. `Modification time` 已变化。
2. `Code size` 已变化。
3. 目标函数与目标环境一致。
4. 发布结果不是仅由命令返回值推断。

## 6. `diagnose-http` 发布验收

对于 `diagnose-http`：

1. 仅命令返回成功不算发布成功。
2. 必须有真实 HTTP smoke。
3. 当任务涉及诊断行为变化时，必须检查 `diagnosis_sessions` / `diagnosis_follow_ups` DB 证据。
4. publish 只有在真实部署证据、HTTP smoke 和必要 DB 证据均满足时才算通过。
5. 若涉及 ranking → route、outcome 瘦身、gate、问诊路径、replay，必须结合 `docs/ai-rules/diagnosis-replay.md` 的验证要求。

## 7. 参考文档

```text
docs/cloud-function-deployment-guide.md
```
