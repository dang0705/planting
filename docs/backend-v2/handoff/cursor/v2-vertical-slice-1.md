# Handoff：v2 第一条纵向切片

| 项 | 值 |
| --- | --- |
| 任务 | `v2-vertical-slice-1`（计划：v2 纵向切片，两段） |
| Agent | Cursor 主代理 `07e39ed8-57a8-4f6e-850c-55ed329d5445` |
| 环境 | CloudBase `cloud1-2grufevs395a9d5e`（上海） |
| 状态 | 公开只读纵向路径已在云端验收；用户植物仅验收未认证拒绝路径，已认证成功读取尚未验收 |
| 心跳 | `docs/backend-v2/tracker/heartbeats/v2-vertical-slice-1.json` |
| 更新 | 2026-09-27 |

## 一句话交付物

在 CloudBase 上证明：真实 HTTP → 冻结路由 → 固定请求链 → Repository → 测试库 MySQL → 脱敏响应。  
已上线两个前缀为 `v2-` 的 HTTP 云函数；植物百科公开读可用；「我的植物」只验收拒绝路径。

## 完成清单

### 0. 前置门（已确认）

- [x] `mysql2@3.24.4` 生产依赖审查并写入 `cloudfunctions-v2` 依赖与构建清单
- [x] 最小 `PublishedPlantResponse`（5 字段）冻结并获用户确认；合同见 `docs/backend-v2/contracts/plant-knowledge-public-read.md`
- [x] CloudBase 只读预检：无既有 `v2-` 冲突函数；MySQL 私有地址 `172.17.0.8:3306`
- [x] 连接参数裁决：仅函数环境变量 `V2_MYSQL_*`；密码不进仓库/日志；连接池与超时因配置目录 pending 不实现
- [x] 用户确认：独立库 `qinghuazhi_v2_test`、函数名前缀 `v2-`、不碰 v1 库/函数、VPC `vpc-oq2xmdvo` / 子网 `subnet-9hg8hmpn`

### 1. 第一段：公开只读 `plant-knowledge`

- [x] Expected + 测试（`unit_fake` / `unit_real_data`），快速路径反事实 RED 后恢复
- [x] 路由分发 `src/foundation/http/route-dispatcher.ts`
- [x] 每请求单连接 `src/foundation/database/mysql2-connection-source.ts` + `database-config.ts`
- [x] 用例与仓库：`get-published-plant`、`mysql-published-plant-repository`
- [x] HTTP 服务与入口：`plant-knowledge/http/server.ts`、`entries/plant-knowledge.ts`
- [x] `build.mjs` 多入口，产物 `dist/functions/plant-knowledge/`

### 2. 第二段：已认证只读 `user-plant`

- [x] 微信网关身份 Provider 调研 → **BLOCKED_ENV**（官方文档无法证实 HTTP 云函数身份头可信且不可伪造）
- [x] 生产入口注入 `rejectUnprovenPlatformIdentity`（`identity/http/request-identity.ts`）
- [x] 路由接满固定请求链：`user-plant/http/get-user-plant-route.ts`、`server.ts`、`entries/user-plant.ts`
- [x] Expected + 测试（路由 `unit_fake` 17；真实 MySQL HTTP `unit_real_data` 6）；快速路径 RED 证据已留
- [x] 因 Provider 阻塞，**未写** `seed-test-session.mjs`（计划允许）

### 3. 构建与本地门禁

- [x] `npm run build` 产出两个函数包；P0 构建门禁 pass
- [x] 部署包不含 `src/`、测试与开发依赖；运行时 `Nodejs22.21`、`scf_bootstrap`、端口 9000
- [x] 本地冒烟：缺连接变量启动失败；`/health` 200；日志不含 Bearer / 平台主体 / 连接参数

### 4. 云端测试库与夹具

- [x] 创建库 `qinghuazhi_v2_test`（utf8mb4）
- [x] 限定库名后逐条应用 DDL：103 表、183 外键列均指向测试库；v1 两库表数/表名哈希前后不变
- [x] 脚本：`cloudfunctions-v2/scripts/apply-schema-cloudbase-test.mjs`；审计日志 `docs/backend-v2/audits/cloudbase-v2-test-schema-apply-2026-09-24.json`
- [x] 应用账号 `qhz_v2_app`：仅 `qinghuazhi_v2_test.*` 的 SELECT/INSERT/UPDATE/DELETE
- [x] 已发布植物夹具（`cbtest` 标记）：`scripts/seed-published-plant-cloudbase-test.mjs`
- [x] 11 个 `CREATE TRIGGER` 因 `tcb db execute` 错误 1295 **未建**；补建 SQL：`docs/backend-v2/audits/cloudbase-v2-test-deferred-triggers-2026-09-24.sql`

### 5. 云端部署与 `e2e_real_api`

| 函数 | VPC / 子网 | 路由 | 已验收 |
| --- | --- | --- | --- |
| `v2-plant-knowledge` | `vpc-oq2xmdvo` / `subnet-9hg8hmpn` | `/api/v2/plant-knowledge`，`WEB_SCF` + 路径透传 | 200 / 404 / 400 / 405 |
| `v2-user-plant` | 同上 | `/api/v2/user-plants`，同上 | 无凭证、假 Bearer、伪造网关头、Basic、非法引用 → 401；POST → 405 |

- 访问域名：`https://cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com`
- `service.tcloudbase.com` 对 HTTP 函数会返回 `FUNCTIONS_PARAM_INVALID`，勿用
- 环境变量键存在：`V2_MYSQL_HOST|PORT|DATABASE|USER|PASSWORD`（值不进仓库）
- 函数日志近期窗口抽查：无密码 / 伪造 OpenID / 伪造 Bearer
- 当前只读回读显示两个函数均为 `Active` / `Available`、`Nodejs22.21`，网关路由均为 `WEB_SCF` 且开启路径透传。公开夹具再次请求得到五字段响应 `200`，缺失引用得到 `404`；假 Bearer 与伪造身份头访问用户植物得到 `401 PRINCIPAL_INVALID`。这证明当前云端配置及行为，不证明云端代码与当前未提交工作区逐字节相同。

### 6. 文档与复制指南

- [x] `docs/backend-v2/implementation/domain-function-replication.md`（含建表、路由、域名踩坑）
- [x] 心跳 `v2-vertical-slice-1.json`（progress 90，status `blocked`）
- [x] 本 handoff

## 关键路径与夹具（验收用）

公开读（夹具身份）：

```text
GET .../api/v2/plant-knowledge/plants/pid_cbtest_monstera_001  → 200
GET .../api/v2/plant-knowledge/plants/pid_cbtest_missing_999 → 404
GET .../api/v2/plant-knowledge/plants/bad%20ref              → 400
```

已认证读（当前一律拒绝）：

```text
GET .../api/v2/user-plants/upl_cbtest_00000001  （无 Authorization 或假 Bearer）→ 401 PRINCIPAL_INVALID
```

## 未完成 / 阻塞（接棒必读）

| 项 | 等级 | 说明 |
| --- | --- | --- |
| 测试库 11 个不可变触发器 | 写路径结构验收 | 控制台执行 deferred SQL 后回读 `information_schema.TRIGGERS`；不阻断公开只读路径 |
| 已认证正常路径云端验收 | 高（计划内 BLOCKED_ENV） | 需可信身份 Provider 证据，或受控实验证明网关剥离伪造头 |
| `v2-user-plant` 网关层匿名可达 | 低 | 靠函数内拒绝；接入 Provider 前须重审网关 `enableAuth` |
| 函数日志全量敏感扫描 | 低 | CLI 只返回近期少量条目 |
| `V2_MYSQL_*` 登记配置目录 | 低（边界） | 部署凭证引用，尚未写入 catalog |
| 网关响应头 `x-request-id` / `x-cloudbase-session-id` | 低 | 平台行为，函数无法剥离 |

**明确不在本任务范围：** 自签登录、创建用户植物、能力快照、改前端、`src/**` 小程序、根目录 `mysql2` 升级、OpenAPI 全量重生成。

## 关键文件索引

| 类别 | 路径 |
| --- | --- |
| 入口 | `cloudfunctions-v2/src/entries/plant-knowledge.ts`、`user-plant.ts` |
| 路由/链 | `foundation/http/route-dispatcher.ts`、`request-chain.ts` |
| 连接 | `foundation/config/database-config.ts`、`foundation/database/mysql2-connection-source.ts` |
| 身份拒绝 | `identity/http/request-identity.ts` |
| 用例 | `plant-knowledge/application/get-published-plant.ts`、`user-plant/http/get-user-plant-route.ts` |
| 构建 | `cloudfunctions-v2/scripts/build.mjs` |
| 云端 DDL/夹具 | `scripts/apply-schema-cloudbase-test.mjs`、`seed-published-plant-cloudbase-test.mjs` |
| 测试 | `test/plant-knowledge/get-published-plant.spec.ts`、`test/user-plant/get-user-plant-route.spec.ts`、`test/e2e/get-published-plant.mysql.spec.ts`、`test/e2e/get-user-plant-http.mysql.spec.ts` |
| 合同 | `docs/backend-v2/contracts/plant-knowledge-public-read.md` |
| 复制指南 | `docs/backend-v2/implementation/domain-function-replication.md` |

## 建议下一步

1. 确定不依赖可伪造请求头的最小可信会话验证方式及其测试环境边界。当前已认证用户植物 `200` 尚无云端证据；本地 MySQL 测试中的验真替身不能算作真实平台认证。
2. 以真实 HTTP 请求验收 `user-plant → Repository → CloudBase MySQL → 脱敏响应` 的已认证成功、他人植物拒绝及过期会话。
3. 单独完成测试库 11 个触发器的建成读回与写路径结构验收；它们不阻断公开只读纵向路径。
