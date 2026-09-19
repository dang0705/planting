# P1 身份绑定公开错误 RED 证据

- Ticket：`z8v0kmr9ge`（公共 HTTP 合同）与后续 `z8v0kmr970`（统一身份实现）
- Expected 来源：`principal-capability/v1`、`state-machines/v1` 与 `http-api/v1`
- 测试层级：`unit_real_data`（读取真实 TypeScript/AJV 合同及路由登记制品；未访问 HTTP、MySQL 或 CloudBase）
- RED 时间：2026-09-20（Asia/Shanghai）

先新增以下独立 Expected：

1. 身份绑定冲突使用 `IDENTITY_BINDING_CONFLICT`，公开响应不得携带原绑定用户引用。
2. 最后一个有效登录入口禁止通过解绑接口删除，使用 `IDENTITY_LAST_BINDING_REQUIRED`。
3. `createIdentityBinding` 与 `deleteIdentityBinding` 必须分别声明对应错误。

执行：

```bash
npm --prefix cloudfunctions-v2 test -- --run test/p1-public-contracts.spec.ts test/p1-api-skeleton.spec.ts
```

实现前结果：2 个测试文件均失败；一项因 AJV 不接受新的稳定错误类别，一项因绑定路由未声明身份冲突错误。其余 8 项通过。随后才修改 TypeScript 类型、AJV Schema、HTTP 合同、身份合同与路由登记表，并重新生成 OpenAPI。

本证据未覆盖绑定事务、平台凭证验证、真实会话撤销、MySQL 唯一约束竞争或 CloudBase 网关响应；这些由 P2/P5 验收。
