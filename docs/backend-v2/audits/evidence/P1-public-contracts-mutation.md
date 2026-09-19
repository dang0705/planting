# P1 公开 DTO 与 AJV Schema 执行反写证据

- 对象：游客主体字段白名单。
- 临时错误：把 `guestPrincipalSchema.additionalProperties` 从 `false` 改为 `true`。
- RED 命令：`npm test -- --run test/p1-public-contracts.spec.ts -t '游客主体只接受匿名会话合同字段'`。
- RED 结果：退出码 1；带 `user_id` 的游客主体被错误接受，断言由期望 `false` 得到 `true`。
- 写回：已把 `cloudfunctions-v2/src/contracts/schemas.ts` 完整恢复为 `additionalProperties: false`。
- GREEN：TypeScript 严格类型检查通过；合同测试 5/5 通过。
- 证明：测试真实经过 AJV 编译后的产品 Schema，未替换被测校验器。
