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

Vendor 压缩当前只允许显式 QA 构建验证，日常开发命令不自动开启：

```bash
npm run build:mp-weixin:vendor-minify-qa
MP_VENDOR_MINIFY_QA=1 node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs qa-run \
  --catalog-id=user.review.subpackage_routing \
  --execution-id=vendor-minify-review-routing \
  --dispatch-run-id=main-package-slim-vendor-minify \
  --allow-live
```

`MP_VENDOR_MINIFY_IDENTIFIERS=1` 仍是第二级显式开关，只有在语法/空白压缩收益不足且真实端上验证通过后才考虑启用。

`npm run test:ci` 与 `npm run test:all` 只运行递归 unit 镜像：`test/unit/frontend/<src 相对目录>/...` 与 `test/unit/backend/<cloudfunctions 相对目录>/...`。unit runner 会拒绝 `test-` 前缀、无源目录映射、frontend/backend 交叉 import；跨 `src` 与 `cloudfunctions` 或只覆盖 workflow/scripts 的合同检查属于 batch E2E，使用独立入口，例如：

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

Automator catalog 是完整层级映射，固定顶层 domain 包括 `ai-vision`、`diagnosis`、`care`、`user`、`plants`；watering 叶子必须位于 `care.watering.*`。迁移完整性可用以下命令校验：

```bash
node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs validate-e2e-migration
```

### 2.1 Automator v3 端上启动与同号 profile 规则

正式启动的 ready 判定必须同时满足：主进程使用系统安装的原生 DevTools 可执行文件和原生 `package.nw`，QA-owned 扩展快照的 `manifest.json` 可读、`devtools_page` 文件存在、`inspector` 目录存在、快照 marker 与系统安装包扩展源哈希一致；主进程命令带有该快照的 `--load-extension` 与 `--custom-devtools-frontend`；并且在同一 QA owner 进程树中观察到真实 `--extension-process`，且该子进程使用同一 profile 与原生 bundle。QA CLI 副本只允许作为隔离 HOME 下的 `open`/`quit` 路由适配器，不能作为 DevTools runtime executable 或 runtime package。仅有 `9421/9422/9424` 监听、能访问 control endpoint 或存在旧 profile 缓存，都不能算启动成功；9424 还必须由 QA 主进程持有，并在进入项目之前通过原生 `userInfo/updateUserInfo` 重绑定校验；缺少扩展子进程统一终止为 `qa_extension_load_failed`。

冷启动稳定性门固定为 3 次；每次都必须先停止上一轮 QA-owned runtime，再完成
`bootstrap -> doctor×3 -> 首张有效 PNG + 小程序运行时 wx.request -> stop`。正式验收还要在
同一 supervisor generation 上先连续跑 5 个 warm `qa-run`，再对当前 catalog 的每个 live 叶子连续跑 3 次 `qa-run`；所有运行均不得重建、重开 DevTools 或使用
恢复路径，且每个 warm preflight 从取得 generation 到 preflight 完成不超过 15 秒：

认证消费回执的 120 秒新鲜窗口只约束 suite 启动时的认证并行采样；同一 supervisor generation 的后续 warm/live 叶子可以复用该回执，但每条叶子都必须证明 QA PID、进程启动身份、profile、identity hash、认证代次和 ticket hash 完全一致，且消费时间不晚于叶子证据捕获时间。长时间运行不以墙上时间单独使同一稳定进程失效。

长 live/soak 阶段采用“新鲜启动 + 原生日常官方续期 + 观察消费”的有界模式：认证票据无需静态覆盖整个阶段，但必须在启动时保留至少 60 秒的新鲜余量，并且日常 owner、capability、固定 3798 listener 与 identity 可验证。票据进入 120 秒窗口后，broker 通过日常 owner 的官方 `Tool.refreshTicket` 续票，再只读观察 profile/session log；最多 15 秒内必须出现同一 identity 的更高 generation 和有效票据，之后 watchdog 还必须在 30 秒窗口内观察到 QA 精确消费回执。调用失败、端口 ownership 不明、代次未提升、日常进程变化、identity 变化、代次回退和 QA 未消费都会尽早阻断；最终 gate 要求 live 与 soak 报告的 `auth_watchdog.status=passed`。

正式验收不要分别启动这些 runner；使用下面的 suite 入口，让认证、基础设施压力、业务矩阵和最终 Gate 共享同一个 lease 和执行实例：

```bash
npm run qa:automator:v3-suite -- \
  --allow-live
```

suite 会自动生成唯一 `dispatch_run_id`、`run_instance_id`、lease、证据目录和最终汇总；如需审计命名可额外传
`--dispatch-run-id=<dispatch-run-id>`。`stress`、`warm-stability`、`live-matrix`、`auth-concurrency` 和 `soak`
仍可单独用于排障，但单独报告不能与其它轮次拼成最终证据。

如需在业务覆盖尚未完成时单独诊断运行平面，可显式使用：

```bash
npm run qa:automator:v3-suite -- --allow-live --infra-only
```

该模式只执行认证、冷启动、warm 和 soak，成功终态为 `diagnostic_passed`，不执行 live matrix、不执行最终 Gate，不能标记 Automator 完成。full 模式会先快速校验业务覆盖清单，清单不完整时立即阻断，不启动长时认证和 soak；清单通过后才执行完整证据链。

以上 3 次只是短门禁。最终可靠性门改为两层：20 次完整真实冷启动（每轮总耗时预算 5 分钟，必须完成三连 doctor、首张有效 PNG 和真实 `wx.request`，然后停止并核对无残留），以及同一新 generation 上的 1000 次快速 control-plane probe（检查 supervisor、lease、profile owner、固定端口、manifest、LAN owner 和 identity 不漂移）。1000 次 probe 在一个有界 Node 批处理中执行，不为每次 probe 重启进程或扫描全量进程表；快速 probe 不冒充冷启动，阶段预算 10 分钟；整个可靠性门预算 45 分钟，任一层首次失败立即阻断。参数不能缩减，报告不能写到既有 `.e2e-artifacts`：

可靠性门由上述 suite 在同一 `run_instance_id` 下自动执行，不需要人工复制 lease 或单独拼报告。下面的命令仅用于基础设施排障，不是正式验收入口：

```bash
npm run qa:automator:soak -- --allow-live --dispatch-run-id=<dispatch-run-id> \
  --run-instance-id=<run-instance-id> --run-lease-token=<run-lease-token>
```

最后必须使用同一个 `<dispatch-run-id>` 汇总并执行最终门禁；不能从不同轮次挑选旧报告拼接：

```bash
npm run qa:automator:final-gate -- \
  --dispatch-run-id=<dispatch-run-id> \
  --run-instance-id=<本次执行实例> \
  --auth-report=<同一dispatch-run-id>/qa-artifacts/<run-instance-id>/automator-auth-concurrency/auth-concurrency-report.json \
  --cold-start-report=<同一dispatch-run-id>/qa-artifacts/<run-instance-id>/automator-stress/stress-report.json \
  --warm-report=<同一dispatch-run-id>/qa-artifacts/<run-instance-id>/automator-warm-stability/warm-report.json \
  --live-report=<同一dispatch-run-id>/qa-artifacts/<run-instance-id>/automator-live-matrix/live-matrix-report.json \
  --soak-report=<同一dispatch-run-id>/qa-artifacts/<run-instance-id>/automator-soak/soak-report.json
```

该命令是放行门，不是启动前置步骤；它不会启动、停止或重配 DevTools。报告必须位于当前仓库的
`.tmp/dispatch-task/<dispatch-run-id>/qa-artifacts/<run-instance-id>/` 下，最终输出为
`automator-v3-final-gate/automator-v3-final-gate.json`；leaf record 则位于同一 dispatch 的
`qa-runs/<run-instance-id>/` 下。

suite 的基础设施阶段会先执行同号并行的 3 次启动采样，再执行固定 30 分钟、至少 300 次控制面连续采样。它只读检查受控日常与 QA 是否使用不同 realpath、不同端口、
不同 owner PID，同时验证同一 identity hash、同一 fresh auth generation、broker 单写入 capability
和 QA 真实运行态；原生日常进程或过期票据会稳定返回阻断，不会被旧 shared 状态掩盖：

```bash
# 仅用于排障，不是正式验收入口
npm run qa:automator:auth-concurrency -- --allow-live --dispatch-run-id=<dispatch-run-id>
```

认证报告的连续门不能通过参数缩短：必须记录 `required_duration_ms=1800000`、
`required_samples=300`、`status=passed`，并且每条连续采样的进程/profile/identity/端口身份都要与基线一致。
三次短采样只证明启动瞬间，连续门才证明同号共存期间没有身份漂移。两条命令的报告只允许写入对应 `.tmp/dispatch-task/<dispatch-run-id>/qa-artifacts/`；任一报告不是
`status=passed`，或存在 `recovery/rebuild/restart/identity_changed`，都不能宣称“拉起即用”。
`live-matrix` 必须逐一执行 catalog 中全部 `automator_live_real_api` 叶子；warm 的 5 个叶子只是同一 generation 的稳定性抽样，不能替代全量业务验收。每次 preflight 的截图尝试记录也必须显示第 1 次成功；如果第 1 次失败后靠重试得到 PNG，报告只能阻断，不能计入“首次成功率 100%”。
此外，最终门禁还必须读取 `test/e2e/automator/business-coverage.json`，将其与当前 `src/pages.json` 的全部注册页面逐项比对。该清单同时记录页面入口和用户可完成的业务能力；任何页面或能力为 `blocked`、清单状态为 `incomplete`、catalog id 不存在或 data mode 不匹配，最终门禁都必须阻断。catalog 数量不能替代页面/能力覆盖。
业务叶子内部的每一张截图也必须在原始报告中记录 `screenshots` 与 `screenshot_attempts`，两者数量一致，且每条尝试记录只能是 `attempt=1,status=passed`。预检首图通过而业务截图靠重试成功，不算正式 live 通过。
最终门还会逐项核对叶子记录的 `catalog_id`、`data_mode=automator_live_real_api`、
`auth_mode=persisted_real_wechat`、真实身份字段，以及 manifest 与当前 catalog 的 live 集合；
首张 PNG 必须是带完整 CRC/IHDR/IDAT/IEND 的真实文件，不能用只有 PNG 签名的占位文件。

正式 QA 只使用测试专属 profile、固定端口 `9421/9422/9424/3799/3011/9100-9107`，不会关闭或接管日常 DevTools。9424 是 QA 专属原生认证桥接端口，不是 Automator 或日常调试端口；它被占用、监听者身份不明或原生认证状态不一致时，启动在短门内阻断。QA 的账号票据由本机 broker 单写入协调：

```bash
npm run qa:automator:status -- --json
npm run qa:automator:bootstrap
npm run qa:automator:doctor -- --json
npm run qa:automator:stop
```

同一个微信号可以同时存在日常与 QA profile，但目录隔离本身不能隔离 DevTools 服务端票据。受控日常 DevTools 通过固定 3798 服务端的官方 `Tool.refreshTicket` 自己续票，broker 只在 owner、listener、profile、capability 和 identity 全部匹配时触发，并只读观察新票据后发布共享代次；QA 绝不直接刷新官方票据。调用失败或观察不到新票据时 QA 在有界窗口内阻断，绝不拿旧 shared 状态冒充日常仍在线。两边都关闭后，QA broker 可以在确认日常进程不存在后安全刷新共享票据，之后各自重启无需再次扫码。请求体写 `role=daily` 但没有匹配 capability 会被拒绝。若日常不是受控启动器持有的 owner，则只能 `native_daily_read_only`，不能计入同号持续并行放行：

同号并行报告中的 QA 认证材料必须标记为 `auth_material_source=broker_effective_shared`。这表示 QA runtime 实际消费的是 broker 发布的当前共享票据，而不是只因为 QA profile 目录里留有一份相同或过期的本地缓存；QA 主进程仍必须使用原生 DevTools executable/package。缺少该来源证明时，即使 identity、ticket hash 和过期时间看起来一致，也只能阻断，不能计入“互不顶号”或“拉起即用”证据。

```bash
npm run devtools:daily
```

首次受控启动可能需要扫码；之后保留日常 profile 和 QA profile，不执行 `reset-login`，即可在各自关闭后重启并复用登录态。`npm run qa:automator:reset-login -- --confirm=重置测试登录态` 只清理测试专属登录态，不能清理日常 profile。

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

| 函数                     | 端口 |
| ------------------------ | ---: |
| `diagnose-http`          | 9000 |
| `plant-catalog-http`     | 9001 |
| `plant-user-http`        | 9002 |
| `identify-http`          | 9003 |
| `diagnosis-history-http` | 9004 |
| `auth-user-http`         | 9005 |
| `weather-http`           | 9006 |
| `storage-http`           | 9007 |

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
