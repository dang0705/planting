# P1 公开 DTO 与 AJV Schema RED 证据

- 时间：2026-09-20T00:17:24+08:00
- 命令：`cd cloudfunctions-v2 && npm test -- --run test/p1-public-contracts.spec.ts`
- 结果：RED，退出码 1。
- 失败原因：代表性合同测试已经落盘，但 `src/contracts/index.ts` 尚不存在，Vitest 无法解析 `../src/contracts/index.js`。
- Expected 来源：`principal-capability/v1`、`user-plant/v1`、`guest-session-claim/v1`、`care-points-ai-quota/v1`、`reward-events/v1`。
- 证明范围：实现前失败；不是通过修改 Expected 或跳过用例制造的 RED。
