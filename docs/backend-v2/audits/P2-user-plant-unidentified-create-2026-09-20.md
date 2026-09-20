# P2 用户植物暂未识别初态 TDD 证据

- ClickUp ticket：`z8v0kmr9mj`
- Expected 来源：`user-plant/v1`、`principal-capability/v1`、`state-machines/v1`
- 测试层次：L1 / `unit_fake`

## RED / GREEN

RED：领域实现文件不存在时，目标测试因无法导入模块失败。

GREEN：

```bash
npx oxlint src/user-plant/domain/create-unidentified-user-plant.ts test/user-plant/create-unidentified-user-plant.spec.ts
npm run typecheck
npm test -- --run test/user-plant/create-unidentified-user-plant.spec.ts
```

结果：新增源码与测试 0 错误、0 告警；TypeScript 类型检查通过；1 个测试文件、7 条测试通过。

覆盖正常初态、游客拒绝、用户不匹配、缺少能力、快照恰好过期、达到 active 上限、内部时间/数量损坏和公开响应脱敏。

## 未覆盖

未经过 HTTP、Repository、MySQL、通用幂等、并发、outbox、CloudBase 身份或 taxonomy。测试提供的时间、引用、能力快照和 active 数量均为显式输入；不得将本证据解释为真实创建接口或数据持久化已经完成。
