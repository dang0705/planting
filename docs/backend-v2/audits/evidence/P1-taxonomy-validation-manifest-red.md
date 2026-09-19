# P1 植物身份验证清单合并 RED 证据

- 时间：2026-09-20 03:06（Asia/Shanghai）
- 测试层次：`unit_real_data`
- Expected：Master Plan 5.3 的 `plant-identity-validation-manifest/v1`、全量终态处置和输入/证据/裁决/转换 SHA-256 要求。
- 命令：`npm test -- --run test/p1-taxonomy-validation-manifest.spec.ts`
- 结果：2 个首批用例全部按预期失败。
- RED 原因：`taxonomy-validation-manifest.mjs` 尚不存在，Vitest 报 `Cannot find module`。
- 证明范围：实现前没有可执行合并器来阻止缺项、重复或错位，也没有机制确保代理准入建议在人类批准前继续隔离。
- 未证明：不证明任何真实人工批准、种子导入、active release、MySQL 或 CloudBase 已验收。
