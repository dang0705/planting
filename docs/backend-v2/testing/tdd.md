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

