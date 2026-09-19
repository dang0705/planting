# P1 API 骨架 RED 证据

- 时间：2026-09-20（Asia/Shanghai）
- 测试层次：`unit_real_data`
- Expected 来源：Canonical Master Plan 第十章、`http-api/v1` 和 P1 退出条件。

先落盘 `p1-api-skeleton.mjs`，要求具体路由登记表、OpenAPI 3.1 骨架、两者逐路由一致以及 SHA-256 清单；此时 `docs/backend-v2/api/` 尚不存在，测试必须因缺少具体路由登记表而失败。随后才允许创建 API 制品。
