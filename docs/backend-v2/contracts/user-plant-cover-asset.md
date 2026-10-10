# 用户植物封面资产合同

- 合同版本：`user-plant-cover-asset/v1`
- 所有者：`user-plant`（云存储能力经 shared-storage 受控适配器）；所属票据：E03 / `z8v0kmr9mj`。
- 冻结：2026-10-10 用户审定（草案按推荐通过）。
- 路由：`POST /api/v2/user-plants/{userPlantRef}/assets`（operationId `bindUserPlantAsset`，`authenticated`，`required_header`）。
- 依据：`schema/003_user_plant.sql` 的 `user_plant_assets`；配置目录 `user-plant.assets.max_count_per_plant`、`storage.upload.allowed_mime_types`、
  `storage.upload.max_image_bytes`、`storage.read_url.ttl_seconds`、`user-plant.assets.replaced_cover_cleanup_days`（均 2026-10-10 用户审定 confirmed）。

## 1. 范围

- 每株用户植物最多**一张**有效封面（`asset_purpose='profile'`、`status='active'`）。换封面 = 同一事务内旧封面转 `pending_cleanup`（7 天后可清理）+ 新封面 `active`。
- 不提供成长相册、养护证据上传入口；诊断证据沿用自身链路。
- 数据库只存 CloudBase 私有 `fileID`；任何响应、日志、事件都不返回 `fileID`、云存储路径或桶名。

## 2. 上传流程：前端直传私有目录 + 服务端登记校验

1. 前端用小程序云存储能力把图片上传到私有目录（封面专用前缀）。目录前缀如何与平台无关的 `user_id` 绑定、以及对应的存储安全规则，属于 §4 前置条件，确认后补入本节，不改变下列登记语义。
2. 前端调用本接口登记：

```ts
export type BindUserPlantAssetRequest = {
  /** 固定 profile（第一期只有封面）。 */
  purpose: 'profile'
  /** 刚上传的云存储 fileID；只在服务端校验与落库。 */
  fileId: string
  /** 客户端计算的文件 SHA-256（64 位小写十六进制），服务端回读后复核。 */
  contentSha256: string
}

export type UserPlantAssetResponse = {
  assetRef: string        // ast_… 高熵公开引用
  purpose: 'profile'
  url: string             // 临时访问链接，600 秒有效
  urlExpiresAt: string
  createdAt: string
}
```

3. 服务端校验：文件位于该用户的封面目录；服务端回读的 MIME ∈ `image/jpeg|image/png|image/webp`；大小 ≤ 5,242,880 字节；回读哈希与 `contentSha256` 一致。
   任一不满足 → `400 VALIDATION_FAILED` 且**不落库**。`uq_user_plant_storage_file` 保证同一文件不能绑到两株植物或两个用户。

## 3. 规则

- 归属：事务内按 `user_id + user_plant_id` 加锁；跨用户、`deleting`/`deleted` → 404 `USER_PLANT_NOT_FOUND`；归档植物允许换封面。
- 幂等：同键同参重放首次结果（链接重新签发）；同键异参 `409 IDEMPOTENCY_CONFLICT`。
- 失败回滚：登记事务失败不留 `active` 行；已上传未登记的孤儿文件由清理任务回收（清理任务另立）。
- 公开读：单株读取增加可选 `cover: { assetRef, url, urlExpiresAt }`；列表项只增加 `hasCover: boolean`，不逐项签链接。
- 删除植物（`deleting`）时封面随将来的删除清理清单统一处理，本期不动。

## 4. 实施前置条件（未满足前不实现，待用户/主代理提供）

- 服务端需要读取云存储文件元数据（大小、MIME、内容）与签发临时链接：仓库当前**没有** CloudBase 服务端 SDK 依赖，也没有为 HTTP 云函数配置的
  云存储服务端凭证。实现需要：① 新增 npm 依赖（候选 `@cloudbase/node-sdk`，须按宪章 §6.4 审依赖并经用户确认）或改用已审的 HTTP API 适配；
  ② 受控凭证引用（`credential_ref`）及 user-plant 函数对私有目录的读权限；③ 前端可写目录的存储安全规则。上述均须用户授权，代理不得自行配置。

## 5. 错误集合

`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`IDEMPOTENCY_CONFLICT`、`PAYLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`、`SERVICE_UNAVAILABLE`。
