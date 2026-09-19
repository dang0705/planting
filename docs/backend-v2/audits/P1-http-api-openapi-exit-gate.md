# P1 HTTP API 与 OpenAPI 骨架退出闸门

- 日期：2026-09-20（Asia/Shanghai）
- 当前结论：`P1_HTTP_API_SKELETON_PASS / LOCAL_STATIC_AND_FOUNDATION_HTTP_ONLY`
- 审计性质：只证明本地公共合同、具体路由登记、OpenAPI 骨架、构建基线和 foundation HTTP 探针；不代表真实 `/api/v2` 业务路由、CloudBase 网关、MySQL、支付、模型或前端已经实现或验收。
- 重要边界：`cloudfunctions-v2/src/server.ts` 当前只提供 `/health` 与 `/probe` 的 9000 端口构建基线；登记表中的 50 条 `/api/v2` 路由是合同/OpenAPI 骨架，不是该 server 已经挂载的运行路由。

## 1. 当前冻结事实

- `http-api/v1` 固定请求大小/MIME/认证/归属/DTO/用例/持久化/脱敏顺序，并冻结公开、游客、登录和内部服务四类边界。
- `api/route-registry.json` 登记 50 条具体 `method + path`，每条都有 owner、Phase、安全级别、请求/响应合同、幂等策略和错误集合；没有 `/**` 通配路由。
- `api/openapi.p1.json` 为 `3.1.0` P1 骨架，由 route registry 机械生成；route registry、OpenAPI 和 API manifest 的 SHA 当前一致。
- 客户端 AI 动作与内部额度预占命令分离；客户端不能提交点数、成本策略、grant 或预占值。
- 公开错误固定为 `{ error: { type, message } }`；严格 Schema 拒绝 `ok`、内部 `code`、trace 和其他额外字段。
- `server.ts` 的 foundation 探针只证明 9000 端口的 `/health`、`/probe`、JSON/MIME/1 MiB 请求体边界、稳定错误结构和日志脱敏；它不实现上述 50 条业务路由。

## 2. TDD 与可追溯证据

- [HTTP 合同 RED](evidence/P1-http-api-contract-red.md)：合同注册表缺项、真实 HTTP 错误结构、公开 AI 动作校验器和严格错误 Schema 均先有独立失败证据。
- [API 骨架 RED](evidence/P1-api-skeleton-red.md)：测试先要求具体路由、OpenAPI 和 manifest，制品不存在时失败，随后才生成骨架。
- [普通 JSON 请求体 RED](evidence/P1-http-json-body-limit-red.md)：精确 1 MiB 与超限 1 字节的真实 9000 端口边界先失败，随后才修复为当前 1,048,576 字节合同。
- 已保留的变异证据：临时放宽 `ErrorResponse` 顶层 `additionalProperties` 后，严格公开错误测试会失败；本次不把变异探针当作运行时业务验收。

## 3. 最新本地验证

以下结果均为本工作树当前制品的本地验证；`unit_real_data` 只读取版本化文件，`e2e_real_api` 只指向本地 9000 foundation 进程。

| 命令 | 结果与边界 |
|---|---|
| `npm --prefix cloudfunctions-v2 run typecheck` | PASS；源码与正式 TypeScript 测试配置通过严格检查。 |
| `npm --prefix cloudfunctions-v2 run build` | PASS；生成 foundation `dist/server.cjs`，不生成 `/api/v2` 业务实现；本机 npm 默认 Node v24.21.0 产生 package engine 要求 Node 22.x 的 warning，以 Node v22.21.1 直接运行同一构建脚本通过。 |
| `npm --prefix cloudfunctions-v2 test -- --run test/foundation-http.spec.ts test/p1-api-skeleton.spec.ts test/p1-public-contracts.spec.ts test/p1-contract-foundation.spec.ts test/p1-audit-freshness.spec.ts` | PASS；当前覆盖本地 9000 HTTP、合同、路由/OpenAPI、注册表和审计制品新鲜度。 |
| `npm --prefix cloudfunctions-v2 test` | PASS，15 个测试文件 / 58 个测试；另以 Node v22.21.1 直接运行同一 Vitest 配置通过。此结果仍不等于真实 CloudBase 或 MySQL 证据。 |
| Node v22.21.1 下 `tsc --noEmit -p tsconfig.json` 与 `tsconfig.test.json` | PASS；仅证明 TypeScript 编译检查通过，不证明 `/api/v2` 运行时已挂载。 |
| `sha256sum -c docs/backend-v2/audits/P1-http-api-openapi-exit-gate.sha256` | PASS；正文 sidecar 与本文件字节一致。 |

未在本闸门中执行 CloudBase Gateway、真实 `/api/v2` 业务请求、CloudBase MySQL、支付、CMS release、供应商账单/模型或前端接入；这些仍是后续真实环境门。

## 4. 当前制品与测试 SHA-256

| 制品 | SHA-256 |
|---|---|
| `docs/backend-v2/contracts/http-api.md` | `0ecf6dc11211f9276bde005bdcd92f0ae5a30e82c9b65888dd54c74a6058a8ee` |
| `docs/backend-v2/api/route-registry.json` | `ead51c05bb77cd8b192f4c3950f83b26c154c7c4db40a6f7e4acc8a42646cba9` |
| `docs/backend-v2/api/openapi.p1.json` | `07ed21c725dba784bcabd64638c193d278f53d4886218ab6e4e14afb8d322624` |
| `docs/backend-v2/api/manifest.json` | `1bc13a3183127afd432fc508b1fc2a97fef81545d70722ab3d12c0452590fa48` |
| `cloudfunctions-v2/src/contracts/types.ts` | `81ed6d656be12ce6bdeaa2870d6b33c96819953e5f6534a4dcfd11869d374b75` |
| `cloudfunctions-v2/src/contracts/schemas.ts` | `d156dd0d224234669975e9e239fd8de04827192c2ee2db79188baf90d30892af` |
| `cloudfunctions-v2/src/server.ts` | `8d2bc6a74952cd6fcd1e7c2c2030291f5c568aa0acfe5c2d5fece7f3fab2f091` |
| `cloudfunctions-v2/test/foundation-http.spec.ts` | `863eb7f8a23adc63aaf8d65b5a55c92c025408e2e64a8308db537e31e2b13b12` |
| `cloudfunctions-v2/test/p1-api-skeleton.spec.ts` | `d1bd593d2db4e83982ca948ad6f9aff1d8750c425846b996a2796e8b463b679e` |
| `cloudfunctions-v2/test/p1-public-contracts.spec.ts` | `e0d063d7b00d56b5050d09ff2bba4d626713841cd9b4a2a6e2f289c1becfb1cb` |
| `cloudfunctions-v2/test/p1-contract-foundation.spec.ts` | `f915fb1c66d9995083b1a223a08eeac7ba3992f278f482267965ce82b4f74fb8` |
| `cloudfunctions-v2/test/p1-audit-freshness.spec.ts` | `ba707b07d2c8f73a3c6eea7a9f6eda6de54043ab5570e6f5cafe78be8307295c` |

## 5. 后续硬门

- P2-P5 必须按登记表实现具体业务路由，并补齐真实服务签名、统一 `user_id` 与 `user_plant_id` 归属、事务、幂等和失败恢复。
- P5 必须以真实 CloudBase Gateway、CloudBase MySQL 和供应商/支付回放验证；本地 9000 foundation 端口不能替代这些证据。
- P6 再补字段级 OpenAPI schemas、示例、完整错误目录、发布/回退和前端接入文档。
