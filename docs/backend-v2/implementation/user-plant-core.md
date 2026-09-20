# 用户植物核心实施入口

## 1. 任务与当前切片

- ClickUp：[`[P2] 用户植物核心实现`](https://app.clickup.com/t/90182453517/z8v0kmr9mj)
- 当前切片：登录用户明确“加入花园”时，创建一株 `active + unidentified + version 1` 的用户植物公开投影。
- 该初态不依赖 active taxonomy；“暂未识别”是合法业务状态，不是脏数据或错误。

## 2. 实施入口

- 领域源码：`cloudfunctions-v2/src/user-plant/domain/create-unidentified-user-plant.ts`
- 领域测试：`cloudfunctions-v2/test/user-plant/create-unidentified-user-plant.spec.ts`
- 公开 DTO/AJV：`cloudfunctions-v2/src/contracts/types.ts`、`schemas.ts`、`index.ts`
- 公开合同测试：`cloudfunctions-v2/test/contracts/create-user-plant-contract.spec.ts`
- API 真相源：`docs/backend-v2/api/route-registry.json`，生成器派生 `openapi.p1.json`
- MySQL Repository：`cloudfunctions-v2/src/user-plant/repository/mysql-user-plant-repository.ts`
- Repository 测试：`cloudfunctions-v2/test/user-plant/mysql-user-plant-repository.spec.ts`
- Expected：`contracts/user-plant.md`、`contracts/principal-and-capability.md`、`data/state-machines.md`

## 3. 已实现边界

- 只允许登录用户主体；游客或服务主体不能创建长期用户植物。
- 能力快照必须属于同一 `user_id`、尚未过期并包含 `USER_PLANT_CREATE`。
- active 数量上限只读取请求级能力快照，不在领域代码硬编码免费用户上限。
- 公开投影不返回 `user_id`、数据库内部主键、快照引用或已确认植物身份。
- 快照时间、active 数量或服务端公开引用损坏时失败关闭。
- `CreateUserPlantRequest` 已冻结为严格空 JSON 对象；幂等键只允许出现在 Header。
- `CreateUserPlantResponse` 已冻结为六个公开字段和 `active + unidentified + version 1` 初态。
- OpenAPI 请求、成功响应和必填 `Idempotency-Key` 已引用具体 Schema，不再使用空泛型对象。
- Repository 固定先锁定 `users` 行、再统计 active 数量，作为所有增加 active 数量路径的串行化入口。
- Repository 已实现固定初态插入与按统一用户归属的脱敏创建投影读回。

## 4. 未覆盖与继续条件

当前已实现纯领域决策和公开合同，但尚未完成 HTTP 应用用例与持久化，因此不得宣称创建接口已经可调用。

共享幂等与应用用例的同事务编排、真实并发数量上限、提交结果未知对账、HTTP、outbox、档案、资产、时间线、游客认领和身份确认必须在后续独立切片完成。其中身份确认只有在目标 taxonomy identity 已发布后才能进入 `confirmed`。
