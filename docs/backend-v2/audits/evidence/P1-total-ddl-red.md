# P1 总 DDL RED 证据

- 时间：2026-09-20T00:21:00+08:00
- 命令：`node test/unit/backend-v2/p1-total-ddl.mjs`
- 结果：RED，退出码 1。
- 首个失败：缺少 `docs/backend-v2/schema/manifest.json`。
- Expected 来源：Master Plan P1 的总 DDL、空库建表和 SHA-256 退出条件，以及 `backend-v2-data/v1` 数据字典。
- 证明范围：实现前失败；尚未连接或修改 CloudBase MySQL。
