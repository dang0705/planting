# 业务域云函数复制指南

以 `plant-knowledge`（public 只读）和 `user-plant`（authenticated 只读）两条已接通的纵向切片为样板，新增业务域函数按本文复制。请求处理顺序以 [HTTP 云函数实施模板](http-function.md) 与 `contracts/http-api.md` §1 为准。

## 1. 文件布局

| 文件 | 职责 | 样板 |
| --- | --- | --- |
| `src/<domain>/http/<operation>-route.ts` 或 `src/<domain>/application/<operation>.ts` | 冻结路由常量 + 路由处理器：把 9 个请求链阶段逐一声明为 `execute` 或带理由的 `not_applicable` | `user-plant/http/get-user-plant-route.ts`、`plant-knowledge/application/get-published-plant.ts` |
| `src/<domain>/http/server.ts` | 组装 Repository、事务驱动与路由分发，提供 `/health`，不监听端口 | `user-plant/http/server.ts` |
| `src/entries/<domain>.ts` | 读取连接配置（缺失即启动失败）、注入日志与生产端口、监听 `0.0.0.0:9000` | `entries/user-plant.ts` |
| `scripts/build.mjs` 的 `functionEntries` | 登记函数名与入口，构建产物位于 `dist/functions/<domain>/` | — |

路由常量必须与 `docs/backend-v2/api/route-registry.json` 的 `method`、`path`、`operationId`、`security` 完全一致，并有单测逐字段比对。

## 2. 请求链装配规则

- 路由分发器只负责 404（路由不存在）、405（方法不支持）与路径参数解码失败 400；业务错误全部由请求链产生。
- public 路由的三个身份阶段声明 `not_applicable`，理由引用 `http-api.md` §2。
- authenticated 路由：
  - `identityValidate`：先从 `Authorization: Bearer <token>` 提取原文，缺失或格式不符直接 401；此阶段不信任客户端自行提交的平台身份头。
  - `principalResolve`：调用 identity 域 `createResolveUserPrincipalUseCase`，仅凭会话令牌摘要读取已签发会话与统一用户归属；平台凭证只应在登录／签发会话时验真。
  - 只有 `PlatformCredentialEvidenceError` / `UnifiedUserPrincipalResolveError` 的 `PRINCIPAL_INVALID` 映射为 401 `身份凭证无效或已过期`，其他身份错误由请求链泛化为 500。
- 用户植物类路由的 `objectOwnership` 先校验路径引用（非法即 400），再执行 owner-scoped 查询；他人、不存在与不可见统一 404 `USER_PLANT_NOT_FOUND`。只读路由直接复用该查询结果作为持久化阶段输出，不开第二个事务。
- 公开响应只做白名单映射；枚举越界等数据损坏按 500 处理。

## 3. 数据库访问

- 连接参数只来自函数环境变量 `V2_MYSQL_HOST`、`V2_MYSQL_PORT`、`V2_MYSQL_DATABASE`、`V2_MYSQL_USER`、`V2_MYSQL_PASSWORD`，全部必填；错误信息只含变量名。
- 使用 `createMysql2ConnectionSource`：每次请求新建一条独占连接，用完关闭；失败时销毁。`observability.db.pool_size` 与 `deployment.cloudbase.mysql.connection_deadline_ms` 在配置目录中仍为 pending，因此不建连接池、不设超时数值、不设最大实例或预置并发，也不做并发性能承诺。
- 只读查询用 `withReadConnection`；需要事务的用例用 `createMysqlTransactionDriver(connectionSource, recordRollbackFailure)`。Repository 的 `unknown[]` 参数经 `toSqlParameters` 收窄后再绑定。
- 只读函数的写执行器必须直接抛错，防止读路由意外写库。

## 4. 平台身份

平台凭证只在登录时交给可信 Provider 验真；青花植签发自己的高熵会话令牌，后续业务请求只验证令牌摘要、会话状态和用户归属，不要求每次重新提交平台身份。HTTP 请求中的 `x-wx-openid`、`x-cloudbase-context` 等自报身份头不得用于解析 `user_id`。当前测试环境的已认证读取使用一次性会话夹具通过 CloudBase 网关和 MySQL 验收；真实平台登录与会话签发仍须独立验收，不得把测试夹具视为真实登录证明。

## 5. 部署隔离

- 测试部署使用同实例独立库 `qinghuazhi_v2_test`，不得触碰 v1 库与 v1 函数。应用账号 `qhz_v2_app` 只有该库的 `SELECT, INSERT, UPDATE, DELETE`。
- 建表：`tcb db execute` 每次只执行一条语句且默认库为生产库，因此使用 `cloudfunctions-v2/scripts/apply-schema-cloudbase-test.mjs`：先 `--dry-run` 审阅改写结果（表名、外键目标、触发器名及触发器体内 FROM/JOIN 全部限定到测试库），再 `--apply <审计日志>` 逐条执行，同一日志中已成功语句按 SHA-256 跳过。执行前后以只读查询比对 v1 库表名哈希，并确认外键 `REFERENCED_TABLE_SCHEMA` 全部为测试库。
- 触发器：`tcb db execute` 经预处理语句协议执行，MySQL 不支持该协议下 `CREATE TRIGGER`（1295），脚本将其记录为 `deferred_prepared_statement_unsupported`；需经 TDSQL-C 控制台 SQL 窗口或其他直连通道补建；已限定到测试库的 11 条语句见 `docs/backend-v2/audits/cloudbase-v2-test-deferred-triggers-2026-09-24.sql`，补建后以 `information_schema.TRIGGERS` 回读计数。
- 云端函数名追加 `v2-` 前缀（如 `v2-plant-knowledge`、`v2-user-plant`），构建产物目录不改名。
- 代码更新优先走当前已连接的 CloudBase 管理通道；现有测试函数已通过官方 `UpdateFunctionCode` 接口以 ZIP 包更新，明确设置 `InstallDependency=FALSE`，保留既有 VPC、环境变量和路由。部署后回读函数 `Active/Available`、运行时、网络配置与环境变量**键名**，并下载远端代码包核对入口摘要。不得从仓库、日志或命令输出读取／复制 `V2_MYSQL_*` 的值。
- 若需新建函数或路由，先单独审阅 CloudBase 函数权限与网关路径透传；上游应为 `WEB_SCF`，不能把普通 `SCF` 路由视为可用 HTTP 路由。环境级公开权限变更会影响其他函数，不得作为单函数代码更新的顺手操作。
- 访问域名为 `https://cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com`；`service.tcloudbase.com` 域名对 HTTP 函数返回 `FUNCTIONS_PARAM_INVALID`。

## 6. 测试分层

| 层次 | 内容 | 样板 |
| --- | --- | --- |
| `unit_fake` | 真实 `node:http` + 分发器 + 请求链 + AJV，只替换会话 Principal 解析、数据库读取端口 | `test/user-plant/get-user-plant-route.spec.ts` |
| `unit_real_data` | Docker `mysql:8.4` 全量 DDL + 仅 DML 应用账号，经 `create<Domain>Server` 真实连接；会话和归属查询不使用替身 | `test/e2e/get-user-plant-http.mysql.spec.ts`（`vitest.mysql.config.mjs` 运行） |
| `e2e_real_api` | 部署到 CloudBase 后真实 HTTPS 验收；公开读取与用户植物均使用带 `cbtest` 标记的隔离夹具 | `v2-plant-knowledge`：200 / 404 / 400 / 405；`v2-user-plant`：有效测试会话本人植物 200、他人植物 404、过期／撤销会话 401。详见 `audits/v2-user-plant-cloudbase-read-2026-09-27.md`；真实平台登录不在该证明范围。 |
