# CloudBase 规则路径解析

## 1. 路径解析顺序

当文档引用 `{rule-name}` 时，按以下顺序查找：

1. `.codebuddy/rules/tcb/rules/{rule-name}/rule.md`
2. `rules/{rule-name}/rule.md`
3. 搜索 `*{rule-name}*rule.md`

## 2. 常用规则名

| 简写 | 用途 |
|---|---|
| `auth-tool` | 认证工具配置 |
| `auth-web` | Web 认证 |
| `auth-wechat` | 微信小程序认证 |
| `miniprogram-development` | 小程序平台规则 |
| `relational-database-tool` | MySQL 工具操作 |
| `no-sql-wx-mp-sdk` | 小程序 NoSQL |
| `ui-design` | UI 设计 |
| `cloud-functions` | 云函数 |
| `cloudbase-platform` | CloudBase 平台知识 |

## 3. 约束

1. 不要因为路径解析失败就跳过规则；必须说明已尝试的路径。
2. 对当前 uni-app / 微信小程序项目，不能把 Web / Native / CloudRun 规则无条件套用。
