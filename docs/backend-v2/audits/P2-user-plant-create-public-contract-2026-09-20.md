# P2 创建用户植物公开合同 TDD 审计

- 关联任务：`z8v0kmr9mj`（用户植物核心实现）。
- Expected 来源：`user-plant/v1` 创建用户植物章节、`http-api/v1`。
- 测试层次：`unit_real_data`。
- 测试入口：`cloudfunctions-v2/test/contracts/create-user-plant-contract.spec.ts`。

## 已冻结

1. `CreateUserPlantRequestDto` 只接受严格空 JSON 对象 `{}`。
2. `Idempotency-Key` 只允许作为必填 Header，不得放入 JSON 请求体。
3. `CreateUserPlantResponseDto` 只返回 `user_plant_id`、生命周期、身份状态、版本、创建时间和更新时间六个字段。
4. 新建初态固定为 `active + unidentified + version 1`，客户端不能指定或覆盖。
5. 路由登记的响应合同改为 `CreateUserPlantResponse`，并补齐 `CAPABILITY_SNAPSHOT_EXPIRED`。
6. OpenAPI 使用具体请求、响应和成功信封 Schema；幂等 Header 限制为 8–128 个可打印 ASCII 字符。

## RED、GREEN 与负向验证

- RED：测试先落盘，三个用例均失败；两个校验器不存在，路由仍指向泛型 `UserPlantResponse`。
- GREEN：DTO、AJV、路由登记和 OpenAPI 生成器完成后，目标测试 `3/3` 通过。
- 负向验证：临时把响应生命周期常量从 `active` 改为 `archived`，合法响应测试按预期失败；随后完整恢复，探针未保留。
- 相关门禁：合同注册、API 骨架、中文 TSDoc、TypeScript 类型检查均通过。

## 明确未覆盖

- 本切片不证明身份解析、能力快照、active 数量上限或公开引用生成。
- 不证明 HTTP 请求链、共享幂等 Repository、用户植物 Repository 或 MySQL 事务。
- 不证明并发创建、相同幂等键重放、CloudBase MySQL 或真实网关响应。
