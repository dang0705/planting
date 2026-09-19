# P1 植物分类准入 DDL RED 证据

- 时间：2026-09-20T01:45:26+08:00
- 命令：`cd cloudfunctions-v2 && npm test -- --run test/p1-taxonomy-ddl.spec.ts`
- 结果：RED，`6` 条中 `3` 条失败。
- Expected 来源：`plant-taxonomy/v1` 的 P1 分类身份准入硬门，以及 `P1-taxonomy-admission-audit.md` 的 `ADMIT=0 / QUARANTINE=200` 否决性结论。
- 失败对象：权威来源和证据绑定、`species_group`/`spp.`/release 准入约束、准入 manifest 的本地静态合同边界。
- 证明范围：测试先于本轮 `002_plant_knowledge.sql` 的对应约束补足落盘；未连接或修改 MySQL、CloudBase、CMS、Storage 或真实供应商。
