# care 定时任务合并与退役清单（care-maintenance-sweep）

- 日期：2026-10-10；依据：用户裁定。
  - 背景：测试库是 TDSQL-C Serverless（`8.0.30-cynos`），空闲一段时间后自动暂停，按醒着的时长计费，最低 0.25 核约 85 点/小时。
  - 问题：`care-outbox-dispatch` 每分钟、`care-plan-expiry` 每小时都会把库叫醒，夜里本可休眠 9～12 小时。
- 性质：**只写文档与代码，不删除云端资源、不部署**。旧函数代码保留在仓库，作为回退手段，直到验收后按本清单删除。
- 合同：`cloudfunctions-v2/models/care/long-term-care-contract.md` §12.3、§12.5、§13；`docs/backend-v2/contracts/user-plant-timeline.md` §5。
- 配置目录：`care.maintenance_sweep`（cron 必须与触发器一致）、`care.outbox_dispatch.inline_budget_ms`（默认 1500 毫秒，可由 `V2_CARE_OUTBOX_INLINE_BUDGET_MS` 在 200～3000 内覆盖）、
  `care.outbox_dispatch`、`care.plans.expiry_scan`（cron 字段已同步为新 cron）。

## 1. 新机制一句话

- 写入时顺带派发：用户记录浇水、完成计划时，提交后**在同一请求里**把刚写的时间线事件投递掉（最多等 1.5 秒）。所以平时时间线是立即可见的，不需要每分钟轮询。
- 低频补扫：漏掉的事件（派发失败或超时）和过期计划，由 `care-maintenance-sweep` 一天 8 次统一补上。
- 过期语义不变：完成计划时实时判断“是否已超 72 小时”，不依赖补扫写入的 `expired` 状态。

## 2. cron 对齐方案（证据）

仓库里能找到的定时任务：

| 函数 | 证据 | cron（7 段：秒 分 时 日 月 星期 年） | 是否连 v2 测试库 |
|---|---|---|---|
| `weather-ingestion-scheduler` | `cloudfunctions/weather-ingestion-scheduler/config.json` | `0 20 0/6`（00/06/12/18:20）、`0 */10 4-7`（04:00～07:50 每 10 分钟）、07:20、11:20、14:20、16:20、`0 */10 17-20`（17:00～20:50 每 10 分钟）、21:30 | 使用 `$runSQL`（v1 数据模型 MySQL）。**是否与 v2 测试库同一 TDSQL-C 实例，需要你在控制台确认** |
| `plant-knowledge-tropicals-cover-sync` | `.codex/backend-v2/evidence/E02-cover-sync-boundary.json`（2026-10-05 读回） | `0 * * * * * *` **每分钟** | **是**（写 `qinghuazhi_v2_test`） |
| `care-outbox-dispatch`（旧） | `user-plant-timeline.md` §5 | 每分钟 | 是 |
| `care-plan-expiry`（旧） | `long-term-care-contract.md` §12.5 | 每小时 | 是 |

新 cron：`0 25 0,4,7,11,14,16,19,21 * * * *`，即北京时间每天 00:25、04:25、07:25、11:25、14:25、16:25、19:25、21:25，共 8 次。

- 每个时刻都落在 weather 任务的醒库窗口内或紧邻它：00:20 之后、04:00～07:50 扫描期内、07:20 之后、11:20 之后、14:20 之后、16:20 之后、17:00～20:50 扫描期内、21:30 之前 5 分钟。
- 两次运行最大间隔 4 小时（00:25→04:25、07:25→11:25），所以合同写“过期计划最长约 4 小时后显示为过期”。
- 夜间 21:30 之后只在 00:25 运行一次。这次与 weather 00:20 任务紧邻，不会额外叫醒库。

> ⚠️ 关键风险：`plant-knowledge-tropicals-cover-sync` 仍然**每分钟**写 v2 测试库。只要它在运行，库就永远不会暂停，本次合并在费用上不会有效果。
> 建议另开票把它改成低频，或改为补完即停。本次不改它（不属于 care 域，也不碰他人未提交工作）。

## 3. 预计每天叫醒数据库的次数

| 来源 | 旧方案 | 新方案 |
|---|---|---|
| care 发件箱派发 | 1440 次（每分钟） | 0 次额外（只在用户写请求内派发，库本来就醒着） |
| care 计划过期 | 24 次（每小时） | 合并到补扫 |
| care 合并补扫 | — | 8 次运行；如果 weather 与 v2 测试库是同一实例，额外叫醒 **0 次**；如果不是同一实例，最多叫醒 **8 次**（每次运行 + 自动暂停延迟） |
| cover-sync | 1440 次 | 不变（需另行处理，见上） |

## 4. 退役清单（删除前证据；本次只写文档，不删除）

| 项 | 目标 | 仍存调用方 | 替代物 | 回退 | 删除后验证 |
|---|---|---|---|---|---|
| 云函数 `care-outbox-dispatch` 与触发器（每分钟） | 停用并删除 | 只有定时触发器；无 HTTP 调用方 | 同请求派发 + `care-maintenance-sweep` 发件箱阶段 | 重新启用旧触发器即可，代码与发件箱表结构不变 | 观察 2 天：`care_outbox` 中 pending 超过 4 小时的事件为 0；死信数不增加 |
| 云函数 `care-plan-expiry` 与触发器（每小时） | 停用并删除 | 只有定时触发器 | `care-maintenance-sweep` 过期阶段 + 完成时实时判定 | 重新启用旧触发器 | 观察 2 天：`planned` 且超 72h+4h 的计划为 0 |
| 代码入口 `src/entries/care-outbox-dispatch.ts`、`src/entries/care-plan-expiry.ts`，以及 `scripts/build.mjs` 中的两条 | 云端删除并验收后再删代码 | 构建脚本 | `src/entries/care-maintenance-sweep.ts` | git 恢复 | 构建、全量测试 0 失败 |

保留不删：发件箱领取/结算 SQL、过期扫描 SQL、两个用例（被新函数复用）。

## 5. 部署步骤（由主代理在获批窗口执行）

1. 构建：`npm run build`，产物中新增 `care-maintenance-sweep` 事件函数包（Nodejs20.19、Handler `index.main`）。
2. 部署 care HTTP 函数（带同请求派发）。可选环境变量 `V2_CARE_OUTBOX_INLINE_BUDGET_MS`，默认 1500。
3. 新建事件函数 `care-maintenance-sweep`：
   - 环境变量与旧两个函数相同：数据库连接参数，以及可选的 `V2_CARE_OUTBOX_*` / `V2_CARE_PLAN_EXPIRY_*`；
   - 函数超时建议 60 秒；
   - 先**手动调用一次**，核对返回摘要（`outbox.outcome`、`expiry.outcome`），并确认运行时上下文提供 `time_limit_in_ms`。拿不到这个值时两阶段都不会启动，返回 `not_started`。
4. 给 `care-maintenance-sweep` 配置定时触发器 `0 25 0,4,7,11,14,16,19,21 * * * *`，必须与配置目录 `care.maintenance_sweep.cron` 一致。
5. 观察 1～2 个补扫周期正常后，**先停用**旧 `care-outbox-dispatch` 触发器，再停用旧 `care-plan-expiry` 触发器。两者短时并存是安全的：领取用 `SKIP LOCKED` 加条件写，不会重复投递；过期是条件写，重复运行幂等。
6. 观察 2 天，按第 4 节验证后删除旧函数，再删除旧代码入口。
7. 另行处理 cover-sync 的每分钟触发器，否则数据库仍不能休眠。
