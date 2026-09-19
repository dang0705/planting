# P1 公共合同基线 RED 证据

- 时间：2026-09-20（Asia/Shanghai）
- 命令：`node test/unit/backend-v2/p1-contract-foundation.mjs`
- 退出码：`1`
- 独立 Expected：Canonical Master Plan 的 P1 退出条件，以及用户植物、游客认领、积分、AI 额度和可靠奖励事件规则。
- 首个失败：`AssertionError: 缺少 P1 合同注册表 contract-registry.json`
- 当时状态：测试已先于合同注册表和 `principal-and-capability.md` 落盘；未修改业务实现、数据库或云端。

该 RED 仅证明 P1 合同制品尚未完整，不代表业务实现失败。后续不得通过删除断言或从旧实现反推 Expected 使其变绿。
