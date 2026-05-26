# Cloud Function Deployment Guide

本文档记录本项目云函数发布的可靠路径，重点避免 `diagnose-http` 出现“命令显示成功，但线上代码未变化”的假发布。

## 结论

发布 `diagnose-http` 等云函数代码时，使用：

```bash
node scripts/deploy-function.js diagnose-http
```

该脚本内部使用 CloudBase CLI 的代码更新命令：

```bash
npx --package @cloudbase/cli@3.2.2 tcb fn code update diagnose-http --dir cloudfunctions/diagnose-http -e cloud1-2grufevs395a9d5e --json
```

这个命令只更新函数代码，不更新 runtime、timeout、envVariables。

## 禁止使用的方式

不要使用下面这种命令作为发布方式：

```bash
npx @cloudbase/cloudbase-mcp@latest updateFunctionCode --name diagnose-http --functionRootPath cloudfunctions
```

原因：`@cloudbase/cloudbase-mcp` 是 MCP server 包，不是可靠的 CloudBase CLI 子命令入口。本项目曾出现该命令退出码为 0、脚本打印“部署成功”，但云端函数 `Modification time` 和真实诊断行为均未变化的情况。

## 发布后必须验证

发布后至少做三步确认：

1. 查看函数详情：

```bash
npx --package @cloudbase/cli@3.2.2 tcb fn detail diagnose-http -e cloud1-2grufevs395a9d5e
```

2. 确认 `Modification time` 和 `Code size` 相比发布前已变化。

3. 跑真实 HTTP smoke，而不是只看命令退出码。

示例：

```bash
npm run check:diagnose-smoke:non-problematic
```

如果本次改动涉及问诊流、黄叶分流、视觉证据或数据层题库，还必须额外跑覆盖该业务分支的 smoke，并查询 `diagnosis_sessions` / `diagnosis_follow_ups` 确认落库字段符合预期。

## 本次事故记录

时间：2026-04-29

现象：脚本打印 `云函数 "diagnose-http" 部署成功`，但用户真实诊断 session 没有任何新逻辑变化。

根因：旧脚本把 `@cloudbase/cloudbase-mcp` 当作命令行发布工具使用，实际没有更新云端函数代码。

修复：`scripts/deploy-function.js` 已改为调用 `@cloudbase/cli` 的 `tcb fn code update`。

验证：重新发布后，云端 `diagnose-http` 的 `Modification time` 变为 `2026-04-29 12:17:54`，`Code size` 变为 `13829131`，随后黄叶数据层 smoke session `diag_1777436343159_k39m3egw` 已确认新题干、默认选项和 `single_select_accordion` 元数据进入落库。
