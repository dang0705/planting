# P1 植物分类人工裁决批次校验 RED 证据

- 时间：2026-09-20 03:00（Asia/Shanghai）
- 测试层次：`unit_real_data`
- Expected：`plant-taxonomy/v1` 的人工审核与 release 准入谓词，以及 `taxonomy-review/README.md` 的批次边界。
- 命令：`npm test -- --run test/p1-taxonomy-human-review.spec.ts`
- 结果：3 个用例全部按预期失败。
- RED 原因：`taxonomy-review-validator.mjs` 尚不存在，Vitest 报 `Cannot find module`。
- 证明范围：校验器实现前，仓库不存在可执行机制来阻止批次错位、来源 SHA 被改写、歧义/重复记录伪装为准入。
- 未证明：不证明任何真实植物分类裁决，也不证明 active release、MySQL 或 CloudBase 已验收。
