# P2 平台身份绑定应用事务证据

## 范围与 Expected

- Ticket：`[P2] 统一身份 Principal`。
- Expected：`principal-capability/v1`、`state-machines/v1`、`http-api/v1`、001/008 DDL。
- 应用实现：`cloudfunctions-v2/src/identity/application/manage-platform-identity-binding.ts`。
- `unit_fake`：`cloudfunctions-v2/test/identity/manage-platform-identity-binding.spec.ts`。
- `unit_real_data`：`cloudfunctions-v2/test/e2e/identity-binding-application.mysql.spec.ts`。

## TDD 与真实性证据

- Classic RED：应用测试先落盘，因 `manage-platform-identity-binding.js` 不存在而失败。
- GREEN：应用事务测试 `6/6` 通过，TypeScript 双配置检查通过，目标 oxlint 为 `0 warning / 0 error`。
- 真实 MySQL：一次性 MySQL 8.4 同时加载 001 identity 与 008 foundation DDL；绑定/重放及解绑/会话撤销/版本递增两条用例 `2/2` 通过。
- 执行反写 RED：临时把内部 `IDENTITY_BINDING_CONFLICT` 消息直接返回后，脱敏反向用例准确失败并展示内部用户编号泄露。
- 写回：已经恢复固定泛化中文消息，同一目标套件重新 `6/6` 通过，产品文件不含反写语义。

## 覆盖矩阵

| 风险 | 经过的真实路径 | 结论 |
|---|---|---|
| 首次绑定/恢复 | 事务 runner → 共享幂等 → identity Repository → completed | `unit_fake` 已覆盖顺序；本地真实 MySQL 已读回 |
| 解绑与会话失效 | 共享幂等 → 用户/绑定锁 → 撤销会话 → session_version 递增 → completed | 本地真实 MySQL 已读回 |
| 重复与冲突 | replay、同键异参、处理中、跨用户绑定冲突、最后入口保护 | 确定结果不重复写；确定拒绝可重放 |
| 写入失败 | Repository 异常 → runner rollback | 不写伪 completed 结果 |
| COMMIT 结果未知 | 新连接只读对账 completed；否则 503 | `unit_fake` 已覆盖，真实断网未覆盖 |
| 公开脱敏 | 固定白名单 data/error | 不返回内部用户、BIGINT、主体摘要、密文或内部错误消息 |

## 未验收边界

- identity 独立 HTTP 云函数、DTO/AJV、真实请求大小和媒体类型限制。
- 微信、抖音、小红书、手机号 Provider 与公开凭证字段。
- CloudBase MySQL、网关、日志与真实网络 COMMIT 应答丢失。
- 会话首次签发事务；现有绑定应用不创建或刷新登录会话。
