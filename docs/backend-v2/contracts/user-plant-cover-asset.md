# 用户植物封面资产合同

- 合同版本：`user-plant-cover-asset/v1`
- 所有者：`user-plant`（云存储能力经受控存储适配器）；所属票据：E03 / `z8v0kmr9mj`。
- 冻结：2026-10-10 用户审定（草案按推荐通过）；同日用户裁决实现方案：不引入 SDK，用 Node 22 原生 `fetch` 调 CloudBase 云存储 HTTP API；
  临时链接有效期以平台默认为准；前端直传目录按 `user-plant/{用户公开编号}/` 隔离。
- 路由：`POST /api/v2/user-plants/{userPlantRef}/assets`（operationId `bindUserPlantAsset`，`authenticated`，`required_header`）。
- 依据：`schema/003_user_plant.sql` 的 `user_plant_assets`；配置目录 `user-plant.assets.max_count_per_plant`、`storage.upload.allowed_mime_types`、
  `storage.upload.max_image_bytes`、`storage.read_url.ttl_seconds`、`user-plant.assets.replaced_cover_cleanup_days`；Provider `cloudbase_storage`；
  依赖审查 `.codex/backend-v2/evidence/E03-cover-sdk-dependency-review-2026-10-10.md`。

## 1. 范围

- 每株用户植物最多**一张**有效封面（`asset_purpose='profile'`、`status='active'`）。换封面 = 同一事务内旧封面转 `pending_cleanup`
  （`cleanup_after_ms` = 换下时刻 + 7 天，之前不得清理）+ 新封面 `active`。本期只做清理**标记**，不删除云存储文件（清理任务另立）。
- 不提供成长相册、养护证据上传入口；诊断证据沿用自身链路。
- 数据库只存 CloudBase 私有 `fileID`；任何响应、日志、事件都不返回 `fileID`、云存储路径或桶名。唯一例外是临时访问链接本身：平台签发的下载链接 URL 中天然包含对象路径（含本人用户公开编号），只返回给植物主人本人，不进入日志与审计。

## 2. 上传流程：前端直传私有目录 + 服务端登记校验

1. 前端用小程序云存储能力把图片上传到私有目录 `user-plant/{用户公开编号}/covers/{文件名}`（用户公开编号即 `usr_…`）。
   存储安全规则见 `docs/backend-v2/storage/user-plant-cover-storage-rules.json`：只允许已登录用户写入该目录形状且只能写自己上传的文件，客户端一律不可读。
   规则无法把目录里的用户公开编号与登录身份绑定，因此“目录属于谁”由服务端登记时校验（见第 3 步）。
2. 前端调用本接口登记：

```ts
export type BindUserPlantAssetRequest = {
  /** 固定 profile（第一期只有封面）。 */
  purpose: 'profile'
  /** 刚上传的云存储 fileID：cloud://{环境}.{桶}/user-plant/{本人用户公开编号}/covers/{文件名}；只在服务端校验与落库。 */
  fileId: string
  /** 客户端计算的文件 SHA-256（64 位小写十六进制），服务端下载后复核。 */
  contentSha256: string
}

export type UserPlantAssetResponse = {
  /** ast_… 高熵公开引用。 */
  assetRef: string
  purpose: 'profile'
  /** 临时访问链接（有效期以平台默认为准）。 */
  url: string
  /** 平台给出的到期时间；CloudBase 云存储 HTTP API 当前不返回到期时间，因此为 null，前端每次进入页面重新获取链接。 */
  urlExpiresAt: string | null
  createdAt: string
}
```

3. 服务端校验（任一不满足 → `400 VALIDATION_FAILED` 且**不落库**）：
   - `fileId` 路径必须是 `user-plant/{当前登录用户公开编号}/covers/` 下的文件；
   - 经云存储 HTTP API 换取下载链接并下载（最多 5,242,880 字节，超过即拒绝）；文件不存在 → 400；
   - 下载内容的 SHA-256 与 `contentSha256` 一致；
   - 文件魔数判定类型 ∈ `image/jpeg`、`image/png`、`image/webp`（不信任上传方声明的类型）；
   - 同一文件已登记给其他植物或其他用户 → 400（`uq_user_plant_storage_file` 兜底）。
4. 云存储 Provider 不可用（未配置凭证、网络失败、超时、HTTP 错误、响应非法）→ `503 SERVICE_UNAVAILABLE`，不落库。

## 3. 规则

- 归属：事务内按 `user_id + user_plant_id` 加锁；跨用户、`deleting`/`deleted` → 404 `USER_PLANT_NOT_FOUND`；归档植物允许换封面。
- 同一文件已是本植物当前封面 → 200 返回当前封面，不重复登记、不改动旧封面。
- 幂等：同键同参重放首次结果（含首次签发的链接，可能已过期，前端重新读取单株即可拿到新链接）；同键异参 `409 IDEMPOTENCY_CONFLICT`。
- 失败回滚：登记事务失败不留 `active` 行；已上传未登记的孤儿文件由清理任务回收（清理任务另立）。
- 公开读：
  - 单株读取在植物有封面时增加 `cover: { assetRef, url, urlExpiresAt }`；读取时现场换链接。Provider 不可用时**不让单株读取失败**，
    返回 `cover: { assetRef, url: null, urlExpiresAt: null }`。无封面时省略 `cover`。
  - 列表每项只增加 `hasCover: boolean`，不逐项签链接。
- 删除植物（`deleting`）时封面随将来的删除清理清单统一处理，本期不动。

## 4. 部署前置条件

- 用户在 CloudBase 控制台创建专用服务端 API Key（建议名 `http-function-user-plant-storage`），写入环境变量 `V2_CLOUDBASE_STORAGE_API_KEY`；
  代码只通过 Provider `cloudbase_storage` 的 `credentialRef = env:V2_CLOUDBASE_STORAGE_API_KEY` 读取，不打印、不记录、不返回。
- 环境变量 `V2_CLOUDBASE_ENV_ID`：用于云存储 HTTP API 网关域名 `https://{环境}.api.tcloudbasegateway.com`。
- 按 `docs/backend-v2/storage/user-plant-cover-storage-rules.json` 在控制台「云存储 → 权限设置 → 自定义安全规则」下发（人工执行）。
- 未满足前：登记接口返回 503；单株读取的 `cover.url` 为 null。

## 5. 错误集合

`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`IDEMPOTENCY_CONFLICT`、`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`、`SERVICE_UNAVAILABLE`。
