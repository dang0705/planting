# TDD 与测试分层

固定顺序：

```text
独立 Expected
→ 可执行测试先落盘
→ 保存 RED 证据
→ TypeScript 实现
→ GREEN
→ 真实数据库读回
→ e2e_real_api
→ 安全和脱敏审查
```

Expected 必须来自业务架构、已冻结合同、CMS release、真实数据制品或稳定的 OpenViking 事实；不能从现有实现和现有输出反推。

mock、内存仓库和 HTTP 200 不得冒充真实数据库或业务闭环验收。

## 测试语言与执行入口

- 后端正式测试统一使用 TypeScript `*.spec.ts` 与 Vitest；合同、领域、Repository、HTTP、迁移结构和安全行为测试不得使用 JavaScript/`.mjs`。
- 默认绿色回归执行 `npm --prefix cloudfunctions-v2 test`。
- 尚未实现的 Expected 使用 `*.red.spec.ts`，由 `npm --prefix cloudfunctions-v2 run test:red` 显式执行；RED 套件不计入通过证据，也不得靠降低 Expected 变绿。
- `.mjs` 只用于文档生成、哈希/读回、构建/部署校验等机械工具；工具输出不能替代正式测试。
- 历史 RED 证据可以保留当时的 `.mjs` 命令以保证可回放，但从本规则生效后新增或转绿的测试必须迁入 TypeScript/Vitest。
