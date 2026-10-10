# 用户植物资产（封面图）合同（草案，待用户审）

- 所属票据：E03 / `z8v0kmr9mj`；起草：2026-10-10（用户裁决 B：第一期只允许一张封面）。
- 状态：**草案，待用户审**。不实现、不建 DDL、不改配置目录状态（三项配置仍为 `pending`）。
- 已登记路由：`POST /api/v2/user-plants/{userPlantRef}/assets`（operationId `bindUserPlantAsset`，`required_header`）。
- 依据：`schema/003_user_plant.sql` 的 `user_plant_assets`（`asset_ref`、私有 `storage_file_id`、`asset_purpose`、`status`、`content_hash`、`cleanup_after_ms`）；
  配置目录 `user-plant.assets.max_count_per_plant`、`storage.upload.allowed_mime_types`、`storage.upload.max_image_bytes`（均 pending）。

## 1. 第一期范围

- 每株用户植物**最多一张有效封面**（`asset_purpose='profile'`、`status='active'`）。换封面 = 旧封面转 `pending_cleanup` + 新封面 `active`，同一事务。
- 不做成长相册、养护证据、诊断证据的上传入口（诊断证据已有自己的链路）。
- 资产只保存**受控引用**：数据库存 CloudBase 私有 `fileID`，公开响应只给 `asset_ref` 和短时可读链接（见 §3），永不返回 `fileID`、云存储路径或桶名。

## 2. 上传流程（推荐：两步式，待确认 Q1）

1. 客户端用小程序云存储 SDK 上传到服务端规定的私有目录（目录前缀由服务端按 `user_id` 派生，客户端不能指定别人的目录）。
2. 客户端调用本接口登记：

```ts
/** 登记封面；服务端会回读云存储文件元数据并校验，不信任客户端声明的大小与类型。 */
export type BindUserPlantAssetRequest = {
  /** 固定为 profile（第一期只有封面）。 */
  purpose: 'profile'
  /** 刚上传的云存储 fileID；只在服务端校验与落库，不出现在任何响应、日志或事件中。 */
  fileId: string
  /** 客户端计算的 SHA-256，服务端回读后复核（不一致 → 400）。 */
  contentSha256: string
}

/** 登记成功只返回受控引用与短时读取链接。 */
export type UserPlantAssetResponse = {
  assetRef: string            // ast_… 高熵公开引用
  purpose: 'profile'
  url: string                 // 临时访问链接
  urlExpiresAt: string        // 链接过期时间
  createdAt: string
}
```

## 3. 推荐配置值（待审，审定后再写入配置目录并改为 confirmed）

| 配置项 | 推荐值 | 理由 |
|---|---|---|
| `user-plant.assets.max_count_per_plant` | `1`（仅封面） | 用户裁决第一期只允许一张封面 |
| `storage.upload.allowed_mime_types` | `["image/jpeg","image/png","image/webp"]` | 小程序相机/相册常见输出；不收 HEIC、GIF、SVG（SVG 可内嵌脚本） |
| `storage.upload.max_image_bytes` | `5242880`（5 MiB） | 小程序 `chooseMedia` 压缩后通常 < 2 MiB，留余量；成本可控 |
| 读取链接有效期（新增，待定名） | 600 秒 | 够页面展示，泄露后很快失效 |
| 换下的旧封面清理等待（新增，待定名） | 7 天后可清理 | 给“误换回滚”留时间 |

## 4. 规则（草案）

- 归属：事务内按 `user_id + user_plant_id` 加锁；跨用户、deleting/deleted → 404。归档植物推荐**允许**换封面（Q3）。
- 文件必须位于该用户派生目录、MIME 与大小在白名单内、哈希一致；否则 400，且**不落库**。
- `uq_user_plant_storage_file` 保证同一文件不能被绑到两株植物或两个用户。
- 失败回滚：登记事务失败时不留下 `active` 行；已上传但未登记的文件由清理任务按“孤儿文件”回收（清理任务另立）。
- 公开读：单株读取 `UserPlantDto` 是否增加 `cover` 字段——待确认 Q4。

## 5. 需要用户拍板

- Q1：采用“客户端直传私有目录 + 服务端登记校验”的两步式？（另一种是服务端签发一次性上传凭证，安全更强但多一个接口。）
- Q2：§3 三项推荐值是否通过？两项新增配置是否同意登记？
- Q3：归档植物能否换封面？推荐可以。
- Q4：单株读取/列表是否返回封面短链（会让列表接口每项都签一次链接）？推荐单株返回、列表只返回 `hasCover` 布尔值。
- Q5：删除植物（deleting）时封面何时清理？推荐跟随将来的删除清理清单统一处理，本期不动。
