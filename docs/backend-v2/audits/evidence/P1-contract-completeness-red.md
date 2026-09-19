# P1 合同完整性 RED 证据

- 时间：2026-09-20T00:19:00+08:00
- 命令：`node test/unit/backend-v2/p1-contract-foundation.mjs`
- 结果：RED，退出码 1。
- 首个失败：`plant-taxonomy.md` 缺少 `plant-taxonomy/v1` 合同版本；该合同和统一养护输出合同也尚未进入 SHA-256 注册表。
- Expected 来源：Master Plan P1 必须冻结 Taxonomy/Identity/Provenance 与 Care Capability Result，且所有合同必须有版本和 SHA-256。

# 补充 RED：AI 点数和额度生命周期

2026-09-20 在实现前先扩展合同完整性测试，要求 `1.25`、`向上取整`、`aqg_` 和 `expiresAt 为开区间`。测试以退出码 1 失败，首个缺失项为 `1.25`；随后才补充点数整数换算、产品动作上限、来源唯一键、撤销和策略时间解析合同。
