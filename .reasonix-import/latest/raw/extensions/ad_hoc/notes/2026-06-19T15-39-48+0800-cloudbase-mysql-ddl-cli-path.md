# CloudBase MySQL DDL 建表路径：不要停在 `$runSQLRaw`

项目：`/Users/jay/WebstormProjects/planting`
任务：ClickUp `86exzqc3c`
日期：2026-06-19

本次 `implementer_deep` 在补齐 CloudBase MySQL 表结构时，只围绕 `models.$runSQL` / `$runSQLRaw` 和 MCP 暴露面判断 DDL 能力；CloudBase Manager API 返回 `InvalidParameter`，提示仅支持 `select/insert/update/delete/replace` 后，被误判为最终 blocker。

这个结论不成立：`$runSQL` / `$runSQLRaw` 的限制是接口语义限制，只能证明该路径不适合作为建表主路径，不能证明 CloudBase MySQL 无法执行 DDL。

`implementer_fast` 的有效解决路径：

1. 通过 `test/e2e/terminal-e2e/run-with-cloudbase-env.mjs` 注入 `weather-http` 对应 CloudBase 凭据与 SQL 上下文。
2. 使用官方 CLI 定位 MySQL 实例：
   `npx -y -p @cloudbase/cli tcb db instance list -e cloud1-2grufevs395a9d5e --json`
3. 定位到实例 `cynosdbmysql-ins-nq6qok1d` 后，使用 `tcb db execute` 对目标 instance/schema 执行幂等 DDL。
4. 通过 `npm run ensure:cloudbase-sql-schema:verify` 校验，期望结果包含：
   `weather_locations=ok, plant_care_locations=ok, diagnosis_weather_evidence=ok`

后续规则：CloudBase MySQL DDL blocker 不得停在 `$runSQLRaw` 的 `InvalidParameter`。必须继续核查官方 CLI、MCP、数据模型或管理面路径；只有这些可行路径都被实际验证失败后，才能上报 DDL 能力 blocker。
