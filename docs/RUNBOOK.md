---
doc_id: runbook
status: current
doc_type: runbook
owner: main
sync_policy: active
last_verified_date: 2026-06-06
last_verified_commit: unknown-from-upload
source_of_truth:
  - package.json
  - scripts/dev/**
  - scripts/deploy-*.mjs
  - scripts/security/check-no-secrets.mjs
  - test/unit/**
  - test/e2e/batch/**
  - test/e2e/automator/catalog.json
  - .codex/hooks.json
  - .codex/skills/dispatch-task/scripts/dispatch-gate/**
  - docs/deploy-pipeline.md
  - docs/local-cloudbase-functions-debugging.md
  - docs/cautions/cloudfunctions_local_root_dependencies.md
stale_if_changed:
  - package.json
  - scripts/dev/**
  - scripts/deploy-*.mjs
  - scripts/security/**
  - test/unit/**
  - test/e2e/batch/**
  - test/e2e/automator/catalog.json
  - .codex/hooks.json
  - .codex/skills/dispatch-task/scripts/dispatch-gate/**
  - cloudfunctions/**/package.json
---

# Runbook

本文只保留当前常用运行、验证、调试、发布入口。一次性 handoff、既有排查记录和大文档不再作为默认操作手册。

## 1. 安装

```bash
npm ci --session-peer-deps
```

如果 CloudBase 本地函数依赖缺失：

```bash
npm run dev:functions:install
```

## 2. 最小本地质量门

常规代码任务优先使用：

```bash
npm run check:secrets
npm run lint
npm run test:ci
npm run build:mp-weixin:ci
```

`npm run test:ci` 与 `npm run test:all` 只运行 `test/unit/frontend` 和 `test/unit/backend`。跨 `src` 与 `cloudfunctions` 的合同检查属于 batch E2E，使用独立入口，例如：

```bash
npm run e2e:route-planning
npm run e2e:route-sql
npm run e2e:user-plant-edit-contract
npm run e2e:dispatch-gate-contract
```

automator 端上脚本必须先通过 catalog gate 选择精确叶子，并带 execution id：

```bash
npm run check:e2e-catalog
node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs qa-run --catalog-id=<leaf-id> --execution-id=<run-id> --dry-run
```

## 3. 本地 CloudBase HTTP 函数调试

默认本地 gateway：

```text
http://127.0.0.1:3010
```

启动全部本地函数：

```bash
npm run dev:functions
```

只启动诊断函数：

```bash
npm run dev:functions:diagnose
```

让前端走本地函数：

```bash
npm run dev:mp-weixin:local-functions
npm run dev:mp-weixin:local-functions:lan
npm run dev:h5:local-functions
```

当前端口表：

| 函数 | 端口 |
|---|---:|
| `diagnose-http` | 9000 |
| `plant-catalog-http` | 9001 |
| `plant-user-http` | 9002 |
| `identify-http` | 9003 |
| `diagnosis-history-http` | 9004 |
| `auth-user-http` | 9005 |
| `weather-http` | 9006 |
| `storage-http` | 9007 |

事实源：`scripts/dev/local-functions-gateway.mjs` 与 `scripts/dev/run-local-api-env.mjs`。

### 3.1 CloudBase MySQL 表结构建立与校验（最小操作）

官方 SQL 建表流程统一走 CloudBase 凭据注入包装脚本，不直接用 `$runSQLRaw` 判定建表能力：

```bash
npm run ensure:cloudbase-sql-schema:verify
```

脚本路径：

```text
scripts/dev/run-with-cloudbase-env.mjs --function=weather-http -- node scripts/ensure-cloudbase-sql-schema.mjs --verify-only
```

如需初始化/修复表结构，仍走：

```bash
npm run ensure:cloudbase-sql-schema
```

底层可复用 DDL 源：

```text
scripts/sql/ensure-weather-history-cache-tables.sql
```

运行时约束：

- `run-with-cloudbase-env` 负责注入 `CLOUDBASE_*` 凭据与 `SQL_DATABASE*` 上下文。
- `run-with-cloudbase-env` 会向上查找仓库根目录（`package.json` + `cloudbaserc.json`）以稳定解析 `node` 子进程路径。
- CLI 实际执行采用官方 CloudBase CLI 命令链（`tcb db execute`），而不是 `$runSQL` / `$runSQLRaw`。
- 仅允许幂等建表行为；不得把 `$runSQLRaw` 作为建表可行性判定依据。

故障经验与排障顺序：

1. 若遇到 `models.$runSQL/$runSQLRaw` 或 MCP 暴露面判断不通过，先确认这是 Manager API 语义限制（通常仅 `select/insert/update/delete/replace`），不要直接判定 DDL 不可执行。
2. 无论 `$runSQLRaw` 是否返回 `InvalidParameter`，继续执行官方运维路径：`run-with-cloudbase-env` 注入凭据后，先 `tcb db instance list` 定位实例，再 `tcb db execute` 在目标 instance/schema 上执行 DDL。
3. 用幂等建表脚本与结果核对；确认 `weather_locations`、`plant_care_locations`、`diagnosis_weather_evidence` 三表存在且可读写时，再认为校验通过。

本次执行经验：implementer_deep 的坑是把 `runSQL/runSQLRaw` 的 `InvalidParameter` 与 MCP 暴露面不足误判为 DDL 阻断；implementer_fast 的解法是改走官方 CLI 路径（`tcb db instance list` + `tcb db execute`）并以 `ensure:cloudbase-sql-schema:verify` 三表核验通过作为结论。

### 3.2 天气 recent-10d 热门城市缓存运维

天气缓存相关代码变更后，若要让线上/本地真实诊断读到上海热门城市缓存，先重新执行 recent-10d 批量/定时采集，确认 `weather-cache/v1/locations/city:shanghai/recent-10d.json` 已生成且日期窗口匹配，再期待 `/weather/environment-context` 对上海植物返回 `weatherEvidenceInsufficient=false`。既有 `coord:*` 上海缓存属于历史脏 key，不能作为 `city:shanghai` 的有效替代；清理这些脏 key 是独立运维动作，不是诊断请求链路的同步修复步骤。

D0 当前天气不再维护 `working/{date}.json` 与 `daily/{date}.json` 两套文件。采样和归档都写入 `weather-cache/v1/locations/{locationKey}/days/{date}.json`：白天 now 采样保持 `state=working` 并更新 `latestSample`，定稿后写入 `dailyRollup`、`state=finalized`、`finalizedAt`。`recent-10d.json` 只从 D-1 到 D-10 的 finalized day file 聚合，排障时不要用旧 `dailyArchives` 或 D0 文件解释 recent 证据。

线上/本地 D0 now 采样日界线由 sweep timer 控制：`weather-d0-now-sunrise-sweep` 每 10 分钟覆盖 04:00-07:59，`weather-d0-now-sunset-sweep` 每 10 分钟覆盖 17:00-20:59。函数内使用 `suncalc` 按城市计算当日 sunrise/sunset，并只处理距离当前触发时刻 10 分钟内的热门城市；写入的 slot 分别是 `sunrise` 与 `sunset`。`sunset` 是 D0 最后一枪瞬时样本，不是 finalize。其他 D0 timer 为 `weather-d0-now-morning-0720`、`weather-d0-now-forenoon-1120`、`weather-d0-now-noon-1420`、`weather-d0-now-afternoon-1620`；加上 `weather-ingestion-recent-10d` 后线上触发器总数为 7，低于 CloudBase 单函数 10 触发器限制。`weather-ingestion-recent-10d` 不创建 D0 `days/{date}.json`，早晨排障应看 D0 timer 日志与 `weather-cache/v1/locations/{locationKey}/days/{date}.json`，并结合 `weather-cache/v1/season-trigger-state/{safeLocationKey}.json` / `.../season-trigger-audit/{safeLocationKey}/{year}.jsonl`。

开发环境可通过环境变量限制定时任务参与的热门城市：

```bash
WEATHER_HOT_CITY_INGESTION_KEYS=city:shanghai
```

支持值为逗号分隔列表，接受 `city:*` key 或城市名（如 `city:shanghai,上海`）。不设置时默认跑全部 20 个热门城市。

## 4. 诊断 smoke / regression

常用 smoke：

```bash
npm run check:diagnose-smoke
npm run check:diagnose-smoke:uncertain
npm run check:diagnose-smoke:non-problematic
npm run check:diagnose-smoke:stable-marking
npm run check:diagnose-visual-smoke
```

业务防线：

```bash
npm run check:diagnose-business-guards
npm run check:synthetic-follow-up-effect-coverage
npm run check:diagnose-popup-dev-mode-pairwise
```

回归：

```bash
npm run check:diagnose-visual-regression
npm run check:diagnose-outcome-regression
npm run check:diagnose-fast-convergence-regression
npm run check:diagnose-regression:full
```

回放：

```bash
npm run replay:diagnosis-sessions
```

这些脚本可能访问 CloudBase 或使用终端 E2E 身份。没有明确要求时，不要默认跑生产或高成本回归。

## 5. 构建

小程序生产构建：

```bash
npm run build:mp-weixin:ci
```

开发环境构建：

```bash
npm run build:mp-weixin:cloud-dev
```

H5：

```bash
npm run build:h5
```

## 6. 发布

云函数发布：

```bash
npm run deploy:functions:ci
```

小程序 CI 发布：

```bash
npm run deploy:miniprogram:ci
```

发布前至少确认：

```text
1. secrets check 通过。
2. 构建命令通过。
3. 本次变更命中的 smoke / regression 有实际输出。
4. 生产 CloudBase/小程序凭证没有写入仓库。
5. main 已分类是否需要更新 active docs / BRV index。
```

## 7. 环境变量与安全

- 本地 `.env.local`、CloudBase key、小程序上传密钥只允许存在于本地或 CI secret。
- 不要把生产凭证、私钥、access token 写入文档、BRV 或 AI handoff。
- `VITE_API_BASE_URL` 在生产环境必须是 HTTPS；不得指向 localhost/LAN。
- 默认数据库 schema 为 `cloud1_dev`；只有用户明确要求生产验证时才接触生产 schema。

## 8. 排查锚点

诊断问题优先记录：

```text
requestId
diagnosisSessionId
roundId
resultId
visualBatchId / latestVisualCallBatchId
appEnv / x-app-env / x-env
resolved schema/env
function name and deployed version/time
visibleOutcomes
routePrimaryAction
outcomeType
questionPackage / questions
outputEligibility
```

如果文档、BRV、AI 记忆与这些运行锚点冲突，以运行锚点和源码为准。

## 9. 不再默认使用的既有操作材料

以下材料只可按需检索，不作为默认 runbook：

```text
docs/ai-runs/**
docs/ai-tasks/**
docs/route规划及outcome瘦身计划/**
docs/new-rules/**
既有 handoff 中的一次性命令
```
