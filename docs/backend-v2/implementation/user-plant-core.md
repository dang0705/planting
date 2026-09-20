# 用户植物核心实施入口

## 1. 任务与当前切片

- ClickUp：[`[P2] 用户植物核心实现`](https://app.clickup.com/t/90182453517/z8v0kmr9mj)
- 当前切片：登录用户明确“加入花园”时，创建一株 `active + unidentified + version 1` 的用户植物公开投影。
- 该初态不依赖 active taxonomy；“暂未识别”是合法业务状态，不是脏数据或错误。

## 2. 实施入口

- 领域源码：`cloudfunctions-v2/src/user-plant/domain/create-unidentified-user-plant.ts`
- 领域测试：`cloudfunctions-v2/test/user-plant/create-unidentified-user-plant.spec.ts`
- Expected：`contracts/user-plant.md`、`contracts/principal-and-capability.md`、`data/state-machines.md`

## 3. 已实现边界

- 只允许登录用户主体；游客或服务主体不能创建长期用户植物。
- 能力快照必须属于同一 `user_id`、尚未过期并包含 `USER_PLANT_CREATE`。
- active 数量上限只读取请求级能力快照，不在领域代码硬编码免费用户上限。
- 公开投影不返回 `user_id`、数据库内部主键、快照引用或已确认植物身份。
- 快照时间、active 数量或服务端公开引用损坏时失败关闭。

## 4. 未覆盖与继续条件

当前只实现纯领域决策。`CreateUserPlantRequest` 的公开字段合同尚未冻结，因此不得抢先实现 HTTP body 或宣称创建接口完成。

Repository、通用幂等、真实事务、并发数量上限、outbox、档案、资产、时间线、游客认领和身份确认必须在后续独立切片完成。其中身份确认只有在目标 taxonomy identity 已发布后才能进入 `confirmed`。
