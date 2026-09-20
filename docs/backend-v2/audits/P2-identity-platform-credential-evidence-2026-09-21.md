# P2 身份 Provider 与主体摘要边界证据

## 范围

- Ticket：`[P2] 统一身份 Principal`。
- 实现：`cloudfunctions-v2/src/identity/provider/platform-credential-evidence.ts`。
- 测试：`cloudfunctions-v2/test/identity/platform-credential-evidence.spec.ts`。
- Expected：`principal-capability/v1`、`configuration-provider-architecture/v1` 与 `state-machines/v1`。

本切片只实现“受控 Provider 验真结果 → 平台/应用范围复核 → 当前与退役中密钥 HMAC-SHA-256 → 最小安全证据”。它没有实现真实 CloudBase Auth、平台公开凭证 DTO、Provider 超时/重试、数据库读取、会话签发或 HTTP 路由。

## TDD 证据

- Classic RED：测试先落盘后因 `platform-credential-evidence.js` 不存在而失败；没有测试被执行。
- GREEN：Provider 与 Principal 应用目标 Vitest 套件合计 `6/6` 通过；TypeScript 双配置检查通过；目标 oxlint 为 `0 warning / 0 error`。
- 真实 MySQL：identity 隔离 MySQL 套件 `4/4` 通过，证明轮换输入形状没有削弱既有摘要命中、撤销拒绝和绑定事务；它不等于 CloudBase 或真实 Provider 验收。
- 执行反写 RED：临时取消 Provider 平台/应用范围复核后，`拒绝 Provider 返回不同平台或应用范围，避免跨应用主体混淆` 用例按预期失败，错误表现为 Promise 错误地返回了跨平台证据。
- 写回：已恢复范围复核，目标套件重新 `3/3` 通过，反写语义没有留在产品文件。

## 风险覆盖矩阵

| 对象 | 层级 | 风险维度 | 证据 | 当前结论 |
|---|---|---|---|---|
| Provider 验真与 HMAC 编排 | L2 / `unit_fake` | I1 协作链 Happy | fake Provider + 真实 Node HMAC；固定摘要向量和候选顺序 | 已覆盖 |
| Provider 输出校验 | L2 / `unit_fake` | I2 缺字段/空值 | 空规范主体失败关闭 | 已覆盖 |
| Provider 错误语义 | L2 / `unit_fake` | I3 错误语义 | 跨平台、跨 `app_scope` 与损坏密钥配置使用稳定内部错误 | 已覆盖 |
| 外部凭证鉴权失败 | L2 / `unit_fake` | I4 鉴权失败处理 | Provider 本身被替换，真实凭证失败分类尚未冻结 | 未覆盖；留给具体 Adapter |
| 写中断无半成品 | L2 / `unit_fake` | I5 写中断 | 当前切片无数据库或外部写操作 | 不适用 |
| Principal 多版本查找 | L2 / `unit_fake` + 本地真实 MySQL | I2/I3 | 零命中拒绝、唯一退役版本命中、多命中失败关闭 | 已覆盖本地边界 |

## 安全不变量

1. 原始短时凭证只传给 Provider，不进入摘要证据。
2. Provider 规范主体只在当前调用栈用于 HMAC，不进入输出。
3. 密钥使用 Node `KeyObject` 受控句柄；输出和数据库只允许密钥版本引用。
4. 当前密钥优先，退役中密钥只用于兼容旧摘要查找；重复版本在处理凭证前失败关闭。
5. 不为 `cloudbase_auth` 的 pending 超时、重试、端点、费用或凭证引用设置任何默认值。

## 未验收边界

- 微信、抖音、小红书、手机号真实凭证与 Provider 原始响应。
- Chrome `default/main` 授权后的 CloudBase Auth 配置读回。
- 密钥托管、轮换迁移和旧密文原子重算。
- 首次登录的用户、绑定、会话与幂等记录单事务。
- 真实 CloudBase MySQL、HTTP、日志脱敏和提交结果未知对账。
