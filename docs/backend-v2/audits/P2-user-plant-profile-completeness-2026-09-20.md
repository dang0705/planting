# P2 用户植物最低档案完整度证据

- Expected：`user-plant/v1` 与配置项 `user-plant.profile.minimum_completeness`。
- 测试层次：L1 / `unit_fake`；直接执行纯领域规则，不替换依赖。
- RED：实现文件不存在时，目标测试因无法解析 `evaluate-profile-completeness.js` 失败。
- GREEN：最低档案严格包含身份状态、盆器与介质、位置、光照环境、通风环境；9 项测试全部通过。
- 变异证据：临时移除通风缺项判断后，指定测试按 Expected 失败；完整恢复后 9/9 通过。
- 奖励边界：领域只返回资格布尔值，不计算积分或 AI 额度；同一统一用户终身只允许首株完整档案产生奖励资格。
- 稳定性：策略版本、字段顺序、可接受身份状态或“一用户一次”语义被改变时失败关闭。

## 尚未覆盖

- 盆器、位置、光照、通风字段各自的 AJV Schema。
- 用户行锁、首次完成时间持久化、与奖励 outbox 的同一 MySQL 事务。
- HTTP 幂等、CloudBase MySQL、subscription inbox 和奖励最终入账。
