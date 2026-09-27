# v2 用户植物已认证读取：CloudBase 测试环境验收

## 验收边界

- 环境：`cloud1-2grufevs395a9d5e` 的独立库 `qinghuazhi_v2_test`，仅更新函数 `v2-user-plant`；未修改 v1 函数、v1 数据库或前端。
- 用户确认：仅限 v2 测试环境，允许写入隔离验收夹具、更新该测试函数并验证 200／404／401。
- 入口：现有 HTTP 网关 `/api/v2/user-plants` → `WEB_SCF` → `v2-user-plant`；保持原有路径透传、虚拟网络、环境变量与权限配置。
- 会话：仅写入一次性测试会话摘要，不保存原始令牌；测试结束后已撤销有效会话。

## 可回放证据

1. 本次读取验收所部署的 `dist/functions/user-plant/dist/server.cjs` SHA-256 为 `cf3f58c8afdff2a1c532c818295194f81e4621201aa64a34a309818a4f96cf09`；当时从 CloudBase 函数代码包下载并解压的同路径文件摘要一致。后续创建切片已更新同一测试函数，不能把**两次验收记录**视为同一个代码包；但后续[创建验收](v2-user-plant-create-2026-09-27.md)自身已在新包下同时验证 POST 创建与 GET 读回，无需因本次包摘要不同而重复创建验收。
2. 函数回读为 `Active`、`Available`、`Nodejs22.21`，更新时间为 `2026-09-27 09:48:14 +08:00`。代码包使用 CloudBase 官方 `UpdateFunctionCode` 接口以 ZIP 上传，并明确关闭在线依赖安装；运行依赖已随包提供。
3. 测试库读回：本次带 `cbtest` 标记的用户 2 条、用户植物 2 条、会话 2 条。用户植物本人和他人各 1 株，均不关联真实用户。
4. 真实 HTTPS 请求：有效测试会话读取本人植物返回 `200`，公开响应仅含 `user_plant_id`、`lifecycle`、`identityStatus`、`version`、`createdAt`、`updatedAt`；同一会话读取他人植物返回 `404 USER_PLANT_NOT_FOUND`；过期或缺少会话时返回 `401 PRINCIPAL_INVALID`；不支持的 `POST` 返回 `405 METHOD_NOT_ALLOWED`。
5. 有效测试会话撤销后再次读取本人植物返回 `401 PRINCIPAL_INVALID`。因此本次没有仍可使用的测试 Bearer 会话。
6. 本地验证：TypeScript 类型检查通过；默认测试 92 个文件／532 项通过；独立真实 MySQL 测试 20 个文件／82 项通过；lint 退出码为 0（139 条已有警告、无错误）。

## 未被本次证明的范围

- 会话由测试夹具写入，**不证明**微信／抖音／小红书平台凭证验真、真实登录时的会话签发或前端端上行为。
- 不证明测试库剩余不可变触发器、写入路径、长期并发性能或生产环境行为。
- 临时测试用户和植物保留为隔离、可识别的测试记录；只有会话已撤销。本次不清理其他历史测试数据。
