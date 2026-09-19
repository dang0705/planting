# HTTP 云函数实施模板

每个函数都必须按以下顺序处理：

```text
解析请求
→ 请求大小和 MIME 限制
→ Token/HMAC 机械校验
→ Principal 解析
→ user_id 解析
→ user_plant_id 归属校验
→ AJV DTO 校验
→ Command/Query
→ 领域规则
→ Repository/事务
→ DTO 白名单响应
→ 脱敏日志与审计
```

路由必须显式声明 public、guest、authenticated 或 service；禁止用函数级通配权限替代路由级授权。

