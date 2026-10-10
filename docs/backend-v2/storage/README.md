# 云存储安全规则

> **状态：未采用（用户 2026-10-10 裁定）。** 存储桶保持现有「仅创建者和管理员可读写」，不下发下面的自定义规则。
> 原因：自定义规则作用于整个存储桶，会影响 weather-cache、plants、diagnose 等既有文件；现有规则已保证用户只能读写自己上传的文件，
> 封面目录归属由 user-plant 登记接口校验。以下内容仅作历史草案保留。

## `user-plant-cover-storage-rules.json`（user-plant-cover-asset/v1 §2、§4）

- `read: false`：客户端一律不能直接读；封面链接只由 user-plant 服务端用专用 API Key 换取后返回。
- `write`：必须是已登录、非匿名用户；只能写自己上传的文件（`resource.openid == auth.openid`，防止覆盖别人的文件）；
  路径必须是 `user-plant/usr_…/covers/{文件名}` 形状。
- 规则无法校验路径中的 `usr_…` 是否就是当前用户（CloudBase 规则只认 openid/uid），因此 user-plant 登记接口会再次校验
  “目录里的用户公开编号 = 当前登录用户”，不一致拒绝登记。别人往你的目录里传的文件永远无法被登记，由孤儿文件清理任务回收。

## 下发步骤（人工、获批窗口）

1. 控制台 → 云存储 → 权限设置 → 选择「自定义安全规则」。
2. 粘贴本文件 JSON 原文（注意正则中的反斜杠已按 JSON 字符串转义）。
3. 保存后验证：小程序登录用户上传到 `user-plant/{本人 usr_…}/covers/x.jpg` 成功；上传到其他前缀失败；客户端 `getTempFileURL` 被拒。
4. 回退：恢复为下发前导出的原规则。
