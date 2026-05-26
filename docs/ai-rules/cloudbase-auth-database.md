# CloudBase 认证与数据库规则

## 定位

本文件只保存认证与数据库访问的稳定边界规则。

详细云端排障、schema 错位、diagnose-http、replay、CloudBase 网关、MCP、函数日志问题，不在本文件展开；相关任务读取：

`docs/ai-rules/diagnose-http-cloud-debugging.md`

## 1. 适用范围

登录、注册、身份认证、OPENID、鉴权、NoSQL、MySQL / TDSQL-C、CloudBase 数据访问和认证配置检查。

## 2. 小程序优先规则

1. 当前项目优先按 uni-app / 微信小程序项目处理。
2. 小程序天然 login-free。
3. 在云函数中获取 `wxContext.OPENID`。
4. NoSQL 可参考 `rules/no-sql-wx-mp-sdk/rule.md`。
5. MySQL / TDSQL-C 通过工具或服务端逻辑访问，参考 `rules/relational-database-tool/rule.md`。

## 3. 配置优先原则

涉及认证需求时：

1. 先读取 `auth-tool` 规则。
2. 检查当前认证配置状态。
3. 必要时启用对应认证方式。
4. 验证配置有效。
5. 最后再实现前端认证代码。

## 4. 数据库操作原则

1. 读写数据前必须确认数据源类型：NoSQL、MySQL、TDSQL-C 或云函数间接访问。
2. 涉及 MySQL / TDSQL-C 时，必须检查 schema 环境。
3. 本地脚本需要数据库凭证时，不得裸跑，必须走项目 wrapper。
4. 涉及诊断 replay 或历史 session 调试时，额外读取 `diagnosis-replay.md`。
5. 不允许把临时测试表或非正式环境数据误当生产证据。
