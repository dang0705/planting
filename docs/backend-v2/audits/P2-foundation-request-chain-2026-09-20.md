# P2 共享 HTTP 请求链首个 TDD 切片证据

- ClickUp ticket：`z8v0kmr9mk`
- Expected 来源：`docs/backend-v2/contracts/http-api.md`
- 测试层次：L3 编排合同 / `unit_fake`

## RED

命令：

```bash
npm test -- --run test/foundation/request-chain.spec.ts
```

在实现文件不存在时，Vitest 因无法导入 `src/foundation/http/request-chain.js` 失败；不是通过修改 Expected 或放宽断言制造的 RED。

## GREEN

命令：

```bash
npx oxlint src/foundation/http/request-chain.ts test/foundation/request-chain.spec.ts
npm run typecheck
npm test -- --run test/foundation/request-chain.spec.ts
```

结果：

- 新增源码与测试：0 错误、0 告警；
- TypeScript 源码与测试类型检查通过；
- 1 个测试文件、7 条测试全部通过。

## 真实经过与替换边界

真实经过：`执行请求链` 编排器、公开错误映射、显式不适用检查、公开响应包装和审计事件白名单。

被替换边界：CloudBase 身份、用户植物 Repository、AJV 路由 Schema、领域服务、MySQL 事务和审计存储。

明确未覆盖：真实 HTTP 输入流、CloudBase 认证、MySQL 提交/回滚、并发幂等、outbox 投递和云端部署。

## 同轮合同断层闭环

独立 Expected 仍来自 `http-api/v1`。在修改路由登记表和生成器前，先扩展
`p1-api-skeleton.spec.ts`，得到“登录路由缺少 `PRINCIPAL_INVALID`”的可执行 RED，随后完成：

- 12 条登录路由补齐 `PRINCIPAL_INVALID`；
- OpenAPI 根地址改为 `/`，避免与已经包含 `/api/v2` 的路径重复拼接；
- 六个内部服务签名字段均成为可发现、必填的 header 参数；
- OpenAPI 错误枚举补齐身份绑定冲突和最后登录入口保护；
- 所有路由声明的错误类型都必须存在于 OpenAPI 错误枚举。

重新生成 `openapi.p1.json` 与 `manifest.json` 后，目标测试和 TypeScript 类型检查通过。
