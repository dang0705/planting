# P1 AI 额度批次到期字段 RED 证据

- Expected 来源：`care-points-and-ai-quota.md` 已冻结所有额度批次的有效区间为 `[grantedAt, expiresAt)`；六类发放来源均必须绑定绝对到期事实。
- 测试层次：`unit_real_data`（直接读取当前合同制品，不使用 mock）。
- RED 命令：`npm test -- --run test/p1-contract-foundation.spec.ts`
- RED 结果：1 个测试失败；合同仍声明 `expiresAt?: string`，与有效区间硬规则矛盾。
- 修复边界：只把额度批次 `expiresAt` 收紧为必填，并同步合同注册表哈希；不改变额度数值、扣减顺序或会员周期。

