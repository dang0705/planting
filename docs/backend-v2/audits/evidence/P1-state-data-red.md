# P1 状态机与数据字典 RED 证据

- 时间：2026-09-20（Asia/Shanghai）
- 命令：`node test/unit/backend-v2/p1-state-and-data-dictionary.mjs`
- 退出码：`1`
- 首个失败：状态机缺少版本 `state-machines/v1`。
- 后续必然缺口：尚无 `v2-data-dictionary.md`。
- Expected 来源：Canonical Master Plan 第八、九章与 P1 退出条件。

测试先于版本化状态机和数据字典落盘；本 RED 不读取旧实现推导 Expected，也不访问数据库或云端。
