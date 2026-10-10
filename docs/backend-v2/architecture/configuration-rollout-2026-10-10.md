# 配置分层迁移上线顺序清单（2026-10-10）

- 适用范围：用户 2026-10-10 第三轮裁定的「环境变量 + 策略发布」迁移（见 `configuration-layers.md` v2 §7–§8）。
- 本清单只描述顺序与检查点。本轮**未部署、未执行任何云端 SQL**，每一步写库或部署前都需要用户另行授权。
- 一句话原则：**新代码依赖的新策略先上线，旧代码读不懂的新版本最后再切。**
  - 新代码读不到策略会返回 503，而不是回退默认值。
  - 旧代码只认识浇水策略 v1–v3 和 HTTP 写入策略 v1。若先切到浇水 v4 或 HTTP 写入 v2，旧代码会因读不懂而返回 503。

## 0. 前置检查（本地）

1. 在「HEAD + 本次改动」的隔离目录里跑全量 `vitest`、`tsc`（两套）、`oxlint`、`node scripts/build.mjs`，要求 0 失败。
2. 本机 Docker 跑 `npm run test:mysql`，至少包含 `policy-release-cli`、`care-plan-expiry`、`guest-claim-lease` 三组。
3. 逐个校验发布文档，并记录每个的 `contentSha256`：

```bash
cd cloudfunctions-v2
node scripts/policy-release.mjs validate models/policy-releases/<文件>.release.json
```

## 1. 环境变量（可选；不设置时用代码默认值，行为不变）

| 云函数 | 变量 | 默认 | 范围 |
|---|---|---|---|
| care-outbox-dispatch | `V2_CARE_OUTBOX_LEASE_SECONDS` / `V2_CARE_OUTBOX_BATCH_SIZE` / `V2_CARE_OUTBOX_MAX_ATTEMPTS` | 30 / 100 / 5 | 10–120 / 20–500 / 3–10 |
| care-plan-expiry | `V2_CARE_PLAN_EXPIRY_BATCH_SIZE` / `V2_CARE_PLAN_EXPIRY_RUN_BUDGET_PERCENT` | 500 / 50 | 100–2000 / 20–80 |
| user-plant | `V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS`、`V2_CLOUDBASE_STORAGE_TOTAL_DEADLINE_MS` | 30、10000 | 10–120、2000–20000 |
| identity（以及将来所有签名调用方，如 subscription） | `V2_SERVICE_SIGNATURE_CLOCK_SKEW_SECONDS` / `V2_SERVICE_SIGNATURE_NONCE_TTL_SECONDS` | 300 / 600 | 60–300 / 600–900，且 nonce ≥ 2 × 偏差 |
| identity | `V2_WECHAT_LOGIN_TOTAL_DEADLINE_MS` / `V2_DOUYIN_LOGIN_TOTAL_DEADLINE_MS` | 5000 / 5000 | 2000–10000 |
| care | `V2_OPEN_METEO_TOTAL_DEADLINE_MS` | 8000 | 2000–15000 |

- **服务签名两项必须在签名方与验证方的所有云函数中部署同一取值**，否则会互相拒签。
- 任何变量越界时，函数启动即失败，错误信息只写变量名和允许范围。

## 2. 先发布并激活 5 个新策略（旧代码不读取它们，可以提前上线）

每个策略按以下顺序执行。先看 dry-run 输出，确认无误后再加 `--apply`：

```bash
# 1) 预演发布（只读）
node scripts/policy-release.mjs publish models/policy-releases/<文件>.release.json
# 2) 真正发布：插入一条 verified 版本，不切换指针
node scripts/policy-release.mjs publish models/policy-releases/<文件>.release.json --apply
# 3) 预演激活
node scripts/policy-release.mjs activate --domain <d> --policy <p> --version <v> --expect-current none --actor <操作者> --reason v1_launch --evidence <票号>
# 4) 真正激活：条件切换指针 + 写审计
node scripts/policy-release.mjs activate --domain <d> --policy <p> --version <v> --expect-current none --actor <操作者> --reason v1_launch --evidence <票号> --apply
# 5) 核对当前活动版本
node scripts/policy-release.mjs list --domain <d> --policy <p>
```

| 顺序 | 策略 | 发布文档 | 版本 |
|---|---|---|---|
| 2.1 | `care/long_term_rules` | `care.long_term_rules.v1.release.json` | `care-long-term-rules/v1.0.0` |
| 2.2 | `plant-knowledge/public_search` | `plant-knowledge.public_search.v1.release.json` | `plant-knowledge-public-search/v1.0.0` |
| 2.3 | `weather/public_read` | `weather.public_read.v1.release.json` | `weather-public-read/v1.0.0` |
| 2.4 | `user-plant/list_rules` | `user-plant.list_rules.v1.release.json` | `user-plant-list-rules/v1.0.0` |
| 2.5 | `user-plant/asset_rules` | `user-plant.asset_rules.v1.release.json` | `user-plant-asset-rules/v1.0.0` |

- CLI 的连接参数只从 `V2_MYSQL_*` 读取（经 `environment.ts` 校验），输出不含密码。
- 激活时如果实际当前版本与期望不符，CLI 以退出码 2 失败，指针不会被覆盖。
- **全新空库**：执行 007 DDL 后，可以改为执行 `docs/backend-v2/schema/seeds/business_policy_releases.2026-10-10.sql`，一次写入 7 个策略。已有发布的环境禁止用种子，必须走 CLI。

## 3. 部署新代码

所有函数都在第 2 步完成后部署，函数之间的顺序无强约束。建议顺序：

weather → plant-knowledge → care → care-plan-expiry → care-outbox-dispatch → user-plant → diagnosis → identity

部署后冒烟检查（应为 200，不应出现 503）：
- 搜索、目录搜索、百科
- 城市气候推荐（省略 top 时返回 10 条）
- care 计划列表（省略 limit 时默认 20）
- 记录浇水（写接口幂等保留期仍为 168 小时）
- 用户植物列表、时间线、封面上传目标
- 计划过期扫描的运行日志 `outcome ≠ not_started`

新代码仍兼容旧版本：HTTP 写入策略 v1 和浇水策略 v3 照常可读，此时公开行为与迁移前一致。

## 4. 最后切换到新版本（可选，行为不变；必须在第 3 步全部完成之后）

| 顺序 | 策略 | 发布文档 | 期望当前版本 |
|---|---|---|---|
| 4.1 | `http/request_write` → v2 | `http.request_write.v2.release.json` | 先用 `list` 查出现有 v1 版本号，再以它作为 `--expect-current` |
| 4.2 | `care/mvp_watering` → v4 | `care.mvp_watering.v4.release.json` | 先用 `list` 查出现有 v3 版本号（如 `care-watering-mvp/v3.0.0`） |

步骤同第 2 节（publish → activate）。v4 与 v3 在同一输入下公开结果一致，有锁定测试 `test/care/watering/mvp-watering-v4.spec.ts` 保证。

## 5. 回滚

| 情况 | 操作 |
|---|---|
| 某个策略取值有误 | `node scripts/policy-release.mjs rollback --domain <d> --policy <p> --expect-current <当前版本> --actor … --reason … --evidence … --apply`，指针指回上一版并写审计；若是首次激活后需要撤下，就发布一个修正版本再 activate |
| 新代码需要回退 | **必须先把 `http/request_write` 回滚到 v1、把 `care/mvp_watering` 回滚到 v3**（如果第 4 步已执行），再部署旧代码；否则旧代码读不懂 v2 / v4，会返回 503。第 2 步的 5 个新策略可以保留，旧代码不会读取 |
| 环境变量越界导致函数启动失败 | 删除该变量或改回登记范围内的值，然后重启实例 |
