# v2 用户植物创建纵向切片验收

## 结论与边界

- 已在 CloudBase v2 测试环境完成 `POST /api/v2/user-plants → MySQL 写入 → GET /api/v2/user-plants/{user_plant_id}` 纵向验收；同一幂等键重试返回同一株植物，SQL 核对只产生一条用户植物记录。
- 验收范围仅为测试环境 `cloud1-2grufevs395a9d5e` 的 `v2-user-plant` 函数与 `qinghuazhi_v2_test` 数据库。未修改 v1、生产环境、前端或网关路由。
- 本次使用标记为 `cbtest` 的隔离用户、平台绑定、会话及能力快照夹具。它证明函数能读取**已有**可信服务端快照，不证明真实平台登录验真、会话签发或能力快照生成；后者仍需各自的纵向切片验收。

## TDD 与本地验证

- Expected 来自已冻结的用户植物创建合同。实现前，合同测试对未登录 `POST` 得到 `404`，预期为 `401`；加入创建路由后同一测试通过，属于经典 RED → GREEN。
- 隔离 MySQL 8.4 的真实 HTTP 测试 `get-user-plant-http.mysql.spec.ts` 共 8 项通过，覆盖创建并读回、同键重试、无能力快照拒绝、会话失效与撤销、他人植物拒绝及连接清理。
- `npm run typecheck`、`npm run build`、对应 RED 探针恢复后 GREEN 均通过；完整默认测试曾通过 92 个文件、532 项。构建机为 Node.js 24，目标函数运行时为 Node.js 22，本机构建不能代替云端验收。

## CloudBase 部署与回读

- 云函数新版 ZIP 通过 CloudBase 官方 `UpdateFunctionCode` 接口上传，`CodeSource=ZipFile`，`Code.ZipFile` 为 ZIP 原始字节的 Base64 编码；接口返回请求编号 `a03bbbd6-d5bf-469c-9e17-d58759680683`。函数随后显示 `Active / Available`。
- 云端回读 ZIP 中 `dist/server.cjs` 的 SHA-256 为 `66cb611798cce3b2e705804597b87959fae16fe6c76e33189c202940dfbe6913`，与本地构建产物一致。原有函数环境变量仅核对键存在，未读取或记录值。
- 未登录 `POST` 实际返回 `401 PRINCIPAL_INVALID`，证明云端创建路由已生效。

## 云端 HTTP 与数据库核对

| 检查 | 实际结果 |
| --- | --- |
| 有效测试会话首次创建 | `200`，返回 `upl_s3voVVPFKREsSiTyWmpwLxhc`、`active`、`unidentified`、版本 `1` |
| 相同会话、相同幂等键再次创建 | `200`，返回同一 `user_plant_id` 和创建时间 |
| 同一会话 GET 新植物 | `200`，公开投影与创建结果一致 |
| SQL 独立读回 | `user_plants` 中该测试用户和该公开植物引用对应记录数为 `1`，状态 `active`、版本 `1` |
| 撤销测试会话后 GET | 会话更新影响 `1` 行；再次 GET 返回 `401 PRINCIPAL_INVALID` |

测试会话原始 Bearer 只用于当次验收，没有写入文件或日志；数据库仅保留其 SHA-256 摘要，且会话已撤销。测试植物和策略夹具保留在 v2 测试库中，以 `cbtest` 引用隔离，不属于可发布业务数据。

## 后续仍未验收的边界

1. 真实微信等平台凭证验真、统一用户会话签发与自动生成能力快照，不能由本次预置夹具代替。
2. 创建后的档案编辑、植物身份确认、临时植物转长期植物、养护与诊断数据归属，均须按各自纵向切片单独验收。
