# P-1 云存储、私有资产和 OpenViking 审计

> ticket：`z8v0kmr96u`（`[P-1] 云存储、私有资产和 OpenViking 审计`）  
> 审计负责人：`audit_storage_memory_luna`  
> 审计时间：2026-09-19（Asia/Shanghai）  
> 范围：只读；没有修改业务代码、公共合同、Expected、DDL、前端、云资源或 OpenViking。  
> 当前结论：`PARTIAL_AUDIT / P1_GATE_REQUIRED`。实时对象、MySQL、CMS 模型和 OpenViking 可读，但没有足够权属、发布、反向引用和对象内容哈希证据，不得迁移、删除或把旧内容提升为 v2 事实。

## 0. 启动记录、事实源和证据等级

已先核对：`docs/backend-v2/README.md`、`BASELINE.lock`、P-1 计划、存储安全边界和 ticket 规格。入口校验通过，Master Plan 基线为 2111 行，SHA-256=`e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428`。

当前 CloudBase 只读环境：`cloud1-2grufevs395a9d5e`，地域 `ap-shanghai`。本次云端写入、删除、发布、权限变更、迁移和 OpenViking 写入均为 0。

| 证据等级 | 本次证据 | 可以支持的结论 |
|---|---|---|
| `local_static` | 源码、配置、SQL、测试、规则文档 | 旧路径、调用方、删除链、测试替身和合同风险 |
| `e2e_real_api_readonly` | CloudBase Storage、静态托管、MySQL、权限和 CMS 模型只读查询 | 本次环境的对象清单、ACL 摘要、实时表统计和模型字段；不等于端上业务闭环 |
| `openviking_live_read` | OpenViking health/tree/glob/read/search/grep | 当前 URI、迁移 provenance 和语义命中；旧文本不能自动成为 v2 事实 |
| `unit_fake` / `source_contract` | 5 个后端单测 | 代码边界的 characterization；不证明真实上传、下载、权限、发布或删除闭环 |

### 0.1 输入 SHA-256

完整输入集合和输出文件哈希见同名 `.sha256` 文件。核心输入如下：

| 输入 | SHA-256 |
|---|---|
| `docs/backend-v2/phases/P-1-audit.md` | `eb968b32823d3e76c8c3d9dcab0cc8ef786ab72be660934c084c9ce4e96d0090` |
| `docs/backend-v2/implementation/storage-security.md` | `7231dfcb86866b45ad908a911559cfb897fadc1b1ff8091733fad621bedb3376` |
| `docs/backend-v2/README.md` | `cfe9aca1ce164495f9248c806faec63ab646f934b635187bbc076a913699a006` |
| `docs/backend-v2/BASELINE.lock` | `daa8f5c131c37a64b12562679579732b1757b38ebefe682c11368fa7ab5c34d1` |
| `docs/backend-v2/clickup/ticket-specs.md` | `114adf4fffd75222de4127826b6844c32f1f56efdc0fb24399170ea1fd942629` |
| `docs/backend-v2/architecture/business-domain.md` | `aeedf5ba0a7e26765548f2323afd0a9253e730906ef5af438ece51181e6d0941` |
| `docs/backend-v2/architecture/infrastructure.md` | `78d9c452c9160ed9f57e2bd4a1d68e34a6c942fa0dfc99a35bd9903aa1625332` |
| `cloudfunctions/storage-http/app.js` | `e82ad9db9ffb258d48cc746f7aa62b267c7dbac5499acadf4567171c0ff53e1f` |
| `cloudfunctions/layer/utils/catalog-image-url.js` | `7dccc92e06f0cd434a459a9ca163efe46890d87821ae3e83dfe1aea7ffb8401b` |
| `cloudfunctions/plant-catalog-http/app.js` | `695f7c0e3eae1a387c226dd4cf0cfb83f111f0de688a13775f00f1be01a88917` |
| `cloudfunctions/plant-user-http/plant-deletion-service.js` | `5d94723d591314271acb543541f7c0b4e8643963c16807a482c7470061a4df8f` |
| `cloudfunctions/plant-user-http/watering-soil-evidence-service.js` | `2f3f57e3956bab725b79149f3b94757552947322340cdb33ebf82ffebdda3212` |
| `src/vue-query/storage/queries/file-urls.js` | `2ae7fb01444e25bc6ec9ac2be52784e50c2caf04b340a3dbf90d8075b32e298c` |
| `cloudbaserc.json` | `8a8ecd1dee5cbaaf7eab9bd7a5662b8e571d1b8850532733c0215d3e049b4e28` |
| `cloudfunctions/storage-http/cloudbase-functions.json` | `e6d1d89c357f1f3bafe45b5119e0ba8405c6f713ab4293e9e7785313dea2fe4b` |
| `.openviking/config.json` | `3f19c622abbb5e6683a175b84ba63746ab201cb05e09cd8d9ead0ab263d4e04` |

### 0.2 运行时清单摘要哈希

以下哈希只对服务返回的对象元数据或 URI 清单计算，不是对象内容 SHA-256；Storage 的 `ETag` 也不作为内容 SHA-256 使用。

| 清单 | 读回值 | 规范化方式 | SHA-256 |
|---|---:|---|---|
| 主 Storage | 7345 对象，350,449,336 bytes | 服务返回顺序的 `Key/LastModified/ETag/Size/StorageClass` JSON | `b89d949dc98d5d378953d95999f14d8a03f4578944aa2a0c8c2b20cca5ee28cd` |
| 静态托管 | 129 对象，17,055,776 bytes | 服务返回顺序的 `Key/LastModified/ETag/Size/StorageClass` JSON | `a1d7c2eab5f16eed1aa5fdcff66180c4e40f53a21632616068d5d460829fe571` |
| OpenViking 项目 URI | 91 个节点 | 排序后的 URI，换行连接 | `71d8e3a6fe5bf4f61a2481617bd55c7eb613f5bf785e913c165816db21a84f7e` |
| OpenViking Markdown URI | 63 个文件 | 排序后的 URI，换行连接 | `f743fabc072854514cac1c56dfa8d4fc70cdd7d725d67479034573675ab9a961` |
| OpenViking JSON URI | 1 个文件 | 排序后的 URI，换行连接 | `5fd5294095c49385bf9eba467f1337525e815c0b883fd9e0b5460712c328ddd4` |

## 1. Storage 桶、权限和对象前缀

### 1.1 桶级事实

| 位置 | 只读结果 | 边界判断 |
|---|---|---|
| 主 Storage `636c-cloud1-2grufevs395a9d5e-1403815561` | ACL `PRIVATE`；没有读到按前缀 ACL | 作为私有基线保留；不能因目录名称猜测公共资源 |
| 静态托管 `09d8-static-cloud1-2grufevs395a9d5e-1403815561` | hosting `online`，默认站点 `accessUrlReachable=true` | 站点对象按公开可达处理；`queryPermissions(storage)` 返回 bucket 不存在，不能把它当作主 Storage ACL 证据 |
| 主 Storage 临时链接 | 目录封面临时 URL 查询成功，带签名参数 | 临时 URL 不是永久公网 URL；不得写入 v2 公共资源表作为永久地址 |

主 Storage 对象类型：`jpg 844`、`jpeg 30`、`png 6`、无扩展名 `1`、`json 6443`、`jsonl 21`。顶层前缀：`weather-cache/` 6464 个、`plants/` 563 个、`diagnose/` 316 个、`diagnose-smoke/` 1 个、`terminal-e2e/` 1 个。

### 1.2 精确前缀处置清单

路径中的 `legacy-owner-A` 和 `legacy-owner-B` 是有意脱敏的稳定标签；对应原始路径段的 SHA-256 分别为 `50197a376d442163d4510b225aab0651cb082deca5b7af6805b1463f850d0008` 和 `163a164f89f4d1459d801241dba5b5a0ef09ee051563c4ecd704db191521cdb9`。原始平台主体标识不写入报告和公开响应；任何实际删除前必须在受控操作环境重新生成逐对象 manifest 并由两人核对。

| 对象范围 | 当前读回 | 内容处置 | 资源处置 | 调用方/依赖 | 删除或切换前置条件与回退 |
|---|---:|---|---|---|---|
| `plants/catalog/**` | 188 个，138,093,026 bytes；SQL 有 188 个 `cover_image_ref` | `TRANSFORM`：确认权属、许可证、MIME 和 canonical catalog 前缀后再纳入 v2 plant-knowledge | `KEEP`；旧前缀在切换完成前不得删 | `plant_identity_entities`、`plant-catalog-http`、目录图片 URL resolver、目录展示页 | 权属/来源/发布版本/读回哈希完整；先写新资产映射，保留旧 ref 直到调用方归零；回退为恢复旧 ref 和临时 URL 解析 |
| `plants/<legacy-owner-A>/**` | 360 个，125,369,728 bytes；当前全表 `plant_images` 有 44 行，但尚未完成按对象 key 的反向索引，不能据此证明该前缀无引用 | `QUARANTINE`：不能当 v2 用户植物迁移源 | `DELETE_CANDIDATE`，本次不删 | 旧植物上传路径；没有完整反向索引证明无其他引用 | 精确 DB/CMS/代码/测试反查、用户/测试保留策略、逐对象 manifest、两阶段标记删除/阻止新写/清理/对账；失败回退依赖 manifest，未完成前只读保留 |
| `plants/<legacy-owner-B>/**` | 10 个，2,078,936 bytes；对应主体有 123 个 diagnosis session、44 个 result snapshot、3 个 identify session、1 个 user plant | `REBUILD`：登记为私有资产候选，待统一 `user_id`/`user_plant_id` 归属 | `KEEP_PRIVATE`；禁止进入 CMS release | storage-http、diagnosis、identify、user-plant | 完成身份映射、逐对象资产登记和引用迁移；保留旧对象和映射 manifest，验收后才可归档；不得按“测试环境”删除 |
| 根 `plants/多肉.jpg`、`plants/绿萝.jpg`、`plants/虎皮兰.jpg`、`plants/龟背竹.jpeg` | 4 个，1,448,597 bytes；4 个非 canonical `cover_image_ref` | `TRANSFORM/REPLACE`：确认四张图的权属后改到明确 catalog asset boundary | `ARCHIVE` 旧路径；不执行删除 | 4 条 plant identity cover ref、旧目录展示 | 新 canonical ref 写入并读回，旧调用方归零，CMS release 权限/许可证通过；保留旧对象作为回退，不能直接移动覆盖 |
| `diagnose/<legacy-owner-B>/**` | 307 个，58,750,851 bytes；至少 49 个 diagnosis `image_url` 引用该诊断前缀 | `REBUILD`：诊断原图保持私有，建立统一资产、保留期限和 `user_plant_id` 关联 | `KEEP_PRIVATE`；不得进入 CMS | diagnosis session/snapshot、soil evidence 复用链 | 逐 session/visual record/soil evidence 反向核对，完成新资产映射和保留策略；临时 URL 失效不等于对象可删 |
| `diagnose/dev_terminal_mp_local/**` | 5 个，843,059 bytes | `QUARANTINE` 测试工件 | `DELETE_CANDIDATE` | 本地 MP 终端测试 | 测试 manifest、回放/归档策略、全库无引用、对象清单和读回；本次不删 |
| `diagnose/dev_terminal_mp-stream-smoke/**` | 2 个，58,720 bytes | `QUARANTINE` 流式 smoke 工件 | `DELETE_CANDIDATE` | SSE/stream smoke | 证明测试工件不再用于回放/发布，逐对象 ETag 对账后两阶段删除；本次不删 |
| `diagnose/dev_terminal_start_sse_closeout/**` | 1 个，29,360 bytes | `QUARANTINE` 测试工件 | `DELETE_CANDIDATE` | SSE closeout smoke | 同上；本次不删 |
| `diagnose/anon_dev_visual_batch_spider_mites_pair_from_pest_samples_spider/**` | 1 个，799,659 bytes | `QUARANTINE` 开发视觉批次 | `DELETE_CANDIDATE` | 视觉测试批次；未发现业务表直接引用 | 保留测试证据或明确归档后再删；反向索引、保留期和逐对象 manifest 必须通过 |
| `diagnose-smoke/qwen3-vl/largest-plant-sample-20260427.jpg` | 1 个，1,260,158 bytes | `QUARANTINE` | `DELETE_CANDIDATE` | 视觉模型 smoke | 与静态 `smoke/` 副本、报告和回放记录对账；不把测试样本当公共内容 |
| `terminal-e2e/monstera_2.jpg` | 1 个，75,151 bytes | `QUARANTINE` | `DELETE_CANDIDATE` | 终端 E2E | E2E artifact retention 和无引用证明；本次不删 |
| `weather-cache/v1/**` | 6464 个，21,642,091 bytes；含 locations、D0 jobs/audit、solar-term、season-trigger state/audit | `REBUILD/TRANSFORM`：由 weather adapter 产生，不是用户图和 CMS 内容 | `KEEP_OPERATIONAL`；切换后按新 cache schema 归档 | `weather-http`、weather ingestion scheduler、D0/season trigger | 先验证新 adapter、缓存 schema、timer/audit 读回和故障回退；旧缓存不可盲删 |
| `uploads/**`、`identify/**` | 当前主 Storage 无对象 | `DEPRECATE_CANDIDATE`，不能仅凭空前缀删除代码调用方 | `NO_OBJECTS` | 需要 source-wide caller scan | 证明无代码/网关/测试调用，发布后再归档；本次仅记录为空 |

对象内容没有生成 SHA-256；CloudBase list 只提供 ETag/大小/时间。`diagnose/<legacy-owner-B>` 和 `plants/<legacy-owner-B>` 的部分 `info` 探针返回结构化错误，不能用失败探针推断对象不存在，已按存在且私有处理。

### 1.3 Weather cache 子前缀

| 子前缀 | 对象数 | bytes |
|---|---:|---:|
| `weather-cache/v1/locations/` | 1817 | 8,442,264 |
| `weather-cache/v1/d0-slot-jobs/` | 4513 | 6,855,358 |
| `weather-cache/v1/d0-audit/timers/` | 90 | 5,946,130 |
| `weather-cache/v1/solar-term-calendar/cn/` | 3 | 9,384 |
| `weather-cache/v1/season-trigger-state/` | 20 | 14,020 |
| `weather-cache/v1/season-trigger-audit/` | 21 | 374,935 |

已读回 `recent-10d.json`、D0 timer audit 和 season-trigger JSONL；均为服务端 operational cache/audit，不是公共 CMS 资源。

### 1.4 主代理实时根目录回传（只读）

主代理随后在同一环境回传的根目录摘要与本报告分项一致：`diagnose/` 316 个、60,481,649 bytes；`plants/` 563 个、266,990,287 bytes；`weather-cache/` 6464 个、21,642,091 bytes；另有 `diagnose-smoke/` 1 个和 `terminal-e2e/` 1 个。格式分类为：`diagnose/` 仅 jpg/jpeg/png；`plants/` 为 561 jpg、1 jpeg、1 个无扩展名；`weather-cache/` 为 6443 json、21 jsonl。该摘要是实时对象元数据证据，不能替代对象内容 SHA-256、MIME 内容读回、权属或反向索引。

## 2. 静态托管与公共资源

静态托管 `online`，默认站点可达；129 个对象、17,055,776 bytes，清单 SHA-256=`a1d7c2eab5f16eed1aa5fdcff66180c4e40f53a21632616068d5d460829fe571`。

| 静态前缀 | 对象数 | bytes | 处置 |
|---|---:|---:|---|
| `__auth/**` | 8 | 2,980,546 | `KEEP`；平台认证资源，不按业务图片清理 |
| `adminportal/**` | 2 | 3,322 | `KEEP/ACCESS_REVIEW`；管理站点资源，不作为 CMS 公共内容 |
| `assets/**` | 105 | 14,023,563 | `KEEP` 到版本切换和引用归零；旧哈希构建可在发布回退窗口后归档 |
| `cloud-admin/**` | 1 | 2,745 | `KEEP/ACCESS_REVIEW`；管理入口需独立鉴权证明 |
| `smoke/golden_pothos_yellowing_1.jpeg` | 1 | 29,360 | `QUARANTINE`，公开可达测试图片，测试保留/权属核对后才可删除 |
| `static/**` | 11 | 15,396 | `KEEP`；UI logo/tabbar 资源 |
| `index.html` | 1 | 844 | `KEEP`，站点入口 |

仓库 `src/pages.json` 引用了 `static/tabbar/garden.*` 与 `static/tabbar/agent.*`，静态托管当前按前缀查询均为 0；这是发布制品缺口，不能通过删除或替换对象来掩盖，需后续单独 release/readback。

## 3. CMS 公共资源与图片隐私

### 3.1 当前读回

- `manageDataModel list` 读到 23 个模型；`plant_identity_entities` 是 MySQL 模型。
- MySQL `plant_identity_entities`：192 行、192 行 `is_active=1`、0 行 inactive；192 行 `review_status=pending`；188 条引用 `plants/catalog/`，4 条引用根 `plants/*.jpg|jpeg`，无空 cover。
- CMS 模型 schema 只有 8 个 userFields、16 个 totalFields，未公开 `cover_image_ref`；因此当前 CMS 模型定义与 SQL/代码读写存在漂移。
- 没有读到 CMS 的公共发布版本、权属/许可证、图片内容审核或不可变 release hash；不能把 `cover_image_ref` 当作已发布公共资源。

### 3.2 高优先级隐私问题

`cloudfunctions/layer/utils/catalog-image-url.js:6-12` 只校验 `cloud://.../plants/`，没有限制到 `plants/catalog/`；`cloudfunctions/plant-catalog-http/app.js:98-103` 暴露 POST `/catalog/image-urls` 且没有认证门；`src/vue-query/storage/queries/file-urls.js:55-60` 明确使用 `auth:false`。因此，已知的 `plants/<user-prefix>/...` fileId 可被目录图片端点转换成临时 HTTPS 地址。当前主桶是 private 不能抵消这个应用层越界。

这不是本 ticket 内直接修复项，但它是 v2 release 阻断：必须在后续合同/实现中按 server-resolved catalog ref 白名单或明确 public catalog namespace 修复，并加入 unauthenticated private-prefix negative e2e；不能只修改单元测试 Expected。

### 3.3 内容公共边界

- 用户植物图、诊断图、盆土图默认永久私有；不得进入 CMS release。
- 公共百科封面只能使用权属/许可证、MIME、尺寸、内容审核和不可变 release 均可读回的资源。
- 旧根 `plants/*.jpg|jpeg` 只能先迁到明确 catalog 资产边界，不能因为文件名是植物名就认定有公共使用权。
- 用户奖励不等于图片公共授权；未来若允许用户授权，必须有单独授权、撤回、下架和奖励冲正合同。

## 4. 代码调用、删除补偿和回退证据

### 4.1 旧存储路径和入口

- `storage-http` 仍构造 `diagnose/<platform-subject>/<plant>_<timestamp>_<random>.<suffix>` 和 `plants/<platform-subject>/...`。
- 诊断上传同时保留 multipart 和 JSON/Base64 兼容分支；后者在 `storage-http/app.js:333-340` 仍可进入，和 v2 “不允许 Base64 大图”冲突。
- `storage-http/app.js:511-518` 的植物图片删除为校验后直接 Storage hard delete，再删 `plant_images`；`634-674` 的诊断删除也是直接 hard delete，没有 v2 的标记删除、禁止新写、对账和补偿状态机。
- `assertOwnedDiagnoseUpload` 和诊断 DELETE 使用 `includes('/diagnose/<subject>/')`，不是严格解析完整 object key；不能作为 v2 capability/路径隔离合同。
- `plant-images.js` 主要校验 SQL `_openid`/`fileId` 归属和临时植物状态，未证明实际对象 MIME、大小、前缀和签发能力全部匹配。

### 4.2 已有但不完整的回退链

`plant-deletion-service.js` 已提供部分安全模式：事务锁定用户植物，删除 DB 子记录，写入 `user_plant_file_deletion_jobs`，提交后调用 `deleteFile`，失败保留 pending 并以安全错误码重试。最新只读 MySQL 读回（`cloud1_dev`）为：`user_plant_file_deletion_jobs=0`、`plant_images=44`（其中 34 条指向 `diagnose/`、10 条指向非 catalog `plants/`）、`watering_visual_evidences=31`（31 条 `source_file_id` 指向 `diagnose/` 且均已过期）、`visual_raw_image_records=9027`。后者 9027 行的 `file_id` 全为空而 `image_ref` 非空，因此不能作为 Storage 对象逐项反向索引。报告早期快照中的 `plant_images=0`、`watering_visual_evidences=0`、`visual_raw_image_records=237` 已被本次读回明确取代，不得再用作删除安全证据。

该链只能覆盖事务中收集到的 `plant_images.fileId`，不能证明历史孤儿对象、diagnose 临时图、静态 smoke 图和未登记对象已覆盖。`watering-soil-evidence-service.js` 对 temporary evidence 仍有直接删行和 `deleteFile`，失败只写 warning；需由 v2 asset registry/cleanup 统一接管。

### 4.3 任何删除前必须具备的回退证据

1. 在受控环境重新生成逐对象清单：完整 key、ETag、size、MIME/content hash、最后修改时间、数据库/CMS/代码/测试引用。
2. 先阻止新写并标记 deleting，事务完成业务解绑；对象清理失败进入补偿队列，不得 hard delete 后再猜测恢复。
3. 清理后做 Storage 对账、DB/CMS 读回、调用方扫描和 release 回归；任何引用、权限或内容哈希不一致都停止。
4. 保留旧对象 manifest、归档包和回退窗口；验证通过前禁止删除用户/诊断对象。
5. 对测试对象，额外保留测试 manifest、报告、回放输入和测试 owner 批准；“看起来是 smoke”不是删除授权。

## 5. OpenViking URI 审计与处置

### 5.1 实时树和 provenance

`health` 返回 healthy。`viking://resources/projects/planting/context-tree/` 读到 91 个节点，其中 63 个 Markdown、1 个 `migration-manifest.json` 和目录节点。迁移 manifest 显示生成时间 `2026-09-08T04:49:48.128Z`，来源 ByteRover V4，listed/selected/converted 均为 63；这是历史 provenance，不是 v2 当前事实。

处置：

- `viking://resources/projects/planting/context-tree/**` 全部 `ARCHIVE/HISTORICAL`，不删除、不提升为 v2 稳定事实。
- 精确替换候选：`platform/_index.md`、`plant/_index.md`、`docs/code_logics/security_code_logics_and_access_control.md`。这些条目把 openid 作为主体/图片归属，和 v2 统一 `user_id`、用户植物私有边界冲突；只有 P1 合同、代码、schema、测试共同通过后才能写新稳定条目。
- `migration-manifest.json` 作为不可变迁移 provenance `KEEP_ARCHIVE`；不得把 `target_sha256` 当作当前代码/schema/release 证明。
- 其余 60 个 Markdown 先归档；若后续 source-backed review 证明某项稳定，再逐项 `REPLACE`，不批量重写。
- `viking://user/default/peers/planting/memories/` 当前为空，无动作。`viking://user/default/memories/**` 是用户私有记忆，不是项目迁移源，保留且不纳入项目删除。

### 5.2 精确 OpenViking 文件 URI 清单

下列清单为 63 个 Markdown；另有 `viking://resources/projects/planting/context-tree/migration-manifest.json`。完整节点 URI 的排序清单 SHA-256 见第 0.2 节。

```text
viking://resources/projects/planting/context-tree/_index.md
viking://resources/projects/planting/context-tree/architecture/_index.md
viking://resources/projects/planting/context-tree/architecture/adr/_index.md
viking://resources/projects/planting/context-tree/architecture/adr/architecture_decision_register.md
viking://resources/projects/planting/context-tree/architecture/backend/_index.md
viking://resources/projects/planting/context-tree/architecture/backend/watering_reminder_v2_1_schema.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/_index.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/allowed_symptom_keys_full_profile_contract.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/cloudbase_visual_latency_cache_and_thinking.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/evidence_driven_mode_candidate_groups_contract.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/http_route_and_history_scope.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/indoor_light_health_assessment_contract.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/leaf_yellowing_diagnosis_logic.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/mvp_pest_identification_scope.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/pr12-review-fixes.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/question_package_answer_submission/_index.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/root_rot_mode_skeleton_contract.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/specific_pest_refinement_outcome_contract.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/visual_recognition_boundary.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/yellow_leaf_outcome_hydration_effect_injection_pattern.md
viking://resources/projects/planting/context-tree/architecture/diagnosis/yellowing_outcome_root_rot_exclusion_contract.md
viking://resources/projects/planting/context-tree/architecture/dispatch_task_active_episode_contract.md
viking://resources/projects/planting/context-tree/architecture/frontend/_index.md
viking://resources/projects/planting/context-tree/architecture/frontend/wechat_miniprogram_bundle_size.md
viking://resources/projects/planting/context-tree/architecture/system_logic/_index.md
viking://resources/projects/planting/context-tree/architecture/system_logic/plant_knowledge_integration.md
viking://resources/projects/planting/context-tree/architecture/system_logic/system_logic_overview.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/_index.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/server_history_fallback_contract.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/user_plant_watering_history_rule.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/watering_advisor_entry_contract.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/watering_history_window_boundary.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/watering_planner_v2_1_logic.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/watering_reminder_pot_profile_persistence.md
viking://resources/projects/planting/context-tree/architecture/watering_planner/watering_volume_conversion_logic.md
viking://resources/projects/planting/context-tree/architecture/weather/_index.md
viking://resources/projects/planting/context-tree/architecture/weather/diagnosis_logic/weather_diagnosis_logic.md
viking://resources/projects/planting/context-tree/care/_index.md
viking://resources/projects/planting/context-tree/diagnosis/_index.md
viking://resources/projects/planting/context-tree/docs/code_logics/code_logics_and_architecture.md
viking://resources/projects/planting/context-tree/docs/code_logics/security_code_logics_and_access_control.md
viking://resources/projects/planting/context-tree/facts/_index.md
viking://resources/projects/planting/context-tree/facts/project/curated_context_snippet.md
viking://resources/projects/planting/context-tree/optimizations/user_plant_preference_defaults.md
viking://resources/projects/planting/context-tree/plant/_index.md
viking://resources/projects/planting/context-tree/platform/_index.md
viking://resources/projects/planting/context-tree/platform/sql_service_environment_config.md
viking://resources/projects/planting/context-tree/preferences/byterover_sources.md
viking://resources/projects/planting/context-tree/preferences/reply_language.md
viking://resources/projects/planting/context-tree/product/user_plant_preference_defaults.md
viking://resources/projects/planting/context-tree/project/nextjs_docs_before_code.md
viking://resources/projects/planting/context-tree/tooling/_index.md
viking://resources/projects/planting/context-tree/tooling/byterover_desktop_onboarding_state_gotcha.md
viking://resources/projects/planting/context-tree/tooling/mp_toutiao_cloud_dev.md
viking://resources/projects/planting/context-tree/validated_recurring_gotcha/automator_runtime_fixture_and_question_contract_drift.md
viking://resources/projects/planting/context-tree/validated_recurring_gotcha/automator_streaming_response_chunk_capture.md
viking://resources/projects/planting/context-tree/validated_recurring_gotcha/automator_watchdog_preflight_and_artifact_isolation.md
viking://resources/projects/planting/context-tree/validated_recurring_gotcha/devtools_nightly_automator_auth_recovery.md
viking://resources/projects/planting/context-tree/validation/end_side_api_performance.md
viking://resources/projects/planting/context-tree/workflow/formal_qa_persistent_login_profile.md
viking://resources/projects/planting/context-tree/workflow/formal_qa_remote_read_evidence.md
viking://resources/projects/planting/context-tree/workflow/wechat_devtools_qr_prompt.md
viking://resources/projects/planting/context-tree/workflows/plant_video_mac_cost_boundary.md
viking://resources/projects/planting/context-tree/migration-manifest.json
```

## 6. 测试和验证边界

以下命令均通过，未产生 Storage/DB 写入：

```text
node docs/backend-v2/verify-entrypoint.mjs
node test/unit/backend/storage-http/app.mjs
node test/unit/backend/layer/utils/catalog-image-url.mjs
node test/unit/backend/plant-catalog-http/app.mjs
node test/unit/backend/layer/utils/plant-images.mjs
node test/unit/backend/plant-user-http/plant-deletion-service.mjs
```

结果为 storage boundary、catalog resolver、catalog source contract、plant image ownership、plant deletion compensation 单测通过。它们分别是 `unit_fake` 或 `source_contract`，没有覆盖真实 Storage ACL、真实 MIME/size、临时 URL 过期、目录端点私有前缀拒绝、CMS release、对象反向索引、端上上传或删除回放。

## 7. 未覆盖项、阻断和继续条件

- 没有完整的 DB/CMS/代码/测试到 7345 个 Storage 对象的反向索引；当前“无 `plant_images` 行”只能证明登记表为空，不能证明对象安全可删。
- 没有对象内容 SHA-256、真实 MIME 内容读回和恶意文件扫描；ETag 仅用于对象对账线索。
- 没有 CMS 发布历史、公共资源 ACL、许可证、版权/来源证明、审批人、不可变 release hash 或撤回流程读回。
- 静态托管桶的 `queryPermissions` 不返回主 Storage ACL 语义；只能以站点可达性判定其公开风险，不能声称有完整 per-prefix ACL。
- 没有真实端上 upload → verify → bind → temporary URL expiry → delete/reconcile 的 `e2e_real_api` 闭环，也没有跨用户/跨植物 negative case 的真实回放。
- 没有把旧平台主体解析到 v2 `user_id` 的权威身份映射；因此用户/诊断对象不得迁移。
- OpenViking 只做了 health/tree/glob/read/search/grep；没有写新 v2 稳定事实，也没有执行 archive marker 或 forget；替换和删除需要后续明确批准。
- 静态托管缺失 `garden/agent` 图标的发布完整性未修复；不在本 ticket 内扩展为前端改动。

继续条件：先冻结 v2 asset registry、public catalog whitelist、发布权属/许可证和 delete compensation 合同；再由同一环境重新生成逐对象 manifest 和真实 e2e Expected。任何删除条件、公共发布条件或身份映射缺失时，保持 `QUARANTINE/KEEP_PRIVATE`。

## 8. 2026-09-19 22:47 复核读回（只读）

本节是对前述审计快照的当前环境复核，不是新的迁移或发布授权。目标环境为 `cloud1-2grufevs395a9d5e`（`ap-shanghai`），环境状态 `NORMAL`；本次 CloudBase、MySQL、OpenViking 操作为只读，未执行上传、删除、权限变更、DDL、发布或记忆写入。

- Storage 根清单当前仍为 7345 个对象、350,449,336 bytes；`plants/catalog/` 为 188 个、138,093,026 bytes，`plants/` 为 563 个、266,990,287 bytes，`diagnose/` 为 316 个、60,481,649 bytes，`weather-cache/` 为 6464 个、21,642,091 bytes。主桶 ACL 当前读回为 `PRIVATE`。
- 静态托管当前状态为 `online`，网站配置返回 `statusCode=200` 且 `accessUrlReachable=true`；按 `__auth/`、`adminportal/`、`assets/`、`cloud-admin/`、`smoke/`、`static/` 与根 `index.html` 分页汇总为 129 个、17,055,776 bytes。该站点可达性不等于主 Storage 私有对象可公开访问。
- `manageDataModel list` 当前仍为 23 个模型；`plant_identity_entities` schema 当前仍为 8 个 userFields、16 个 totalFields。`cloud1_dev.plant_identity_entities` 当前为 192 行，192 行 active、192 行 pending、188 条 `cloud://.../plants/catalog/` 引用、4 条根 `plants/*.jpg|jpeg` 引用、0 条空 cover。
- OpenViking 当前 health 为 healthy；项目树 91 个节点，glob 读回 63 个 Markdown 和 1 个 `migration-manifest.json`。排序 URI 哈希仍为 Markdown `f743fabc072854514cac1c56dfa8d4fc70cdd7d725d67479034573675ab9a961`、JSON `5fd5294095c49385bf9eba467f1337525e815c0b883fd9e0b5460712c328ddd4`；迁移 manifest 仍显示 `listed/selected/converted=63`。grep 当前命中 23 处 `openid`（3 个文件），因此旧知识继续按 `ARCHIVE/HISTORICAL` 处理，不能作为 v2 稳定事实。

### 8.1 复核裁决与后续移交

当前可闭合的是：入口/基线核验、源码与调用方静态盘点、对象/托管/权限/CMS/OpenViking 只读可达性、URI 与本地审计制品哈希核对，以及“私有资产不得直接进入公共 release”的边界结论。当前不能闭合的是：逐对象内容 SHA-256/MIME、完整 DB/CMS/代码/测试反向引用、统一 `user_id + user_plant_id` 归属、真实端上上传—绑定—临时 URL 过期—删除补偿回放、CMS 权属/许可证/不可变 release、OpenViking 精确替换或删除。

后续 owner 与继续条件：

1. `identity` / `user-plant` 后续合同与实现：先产出旧平台主体到统一 `user_id` 的权威映射，未经映射不得迁移 `plants/<legacy-owner-*>/**` 或 `diagnose/<legacy-owner-*>/**`。
2. `plant-knowledge` / CMS release：建立 catalog 白名单、权属/许可证、MIME/content hash、审批与不可变 release 记录；修复未认证目录图片端点可把任意 `plants/` fileId 换成临时 URL 的风险，并保留私有前缀 negative e2e。
3. `care` / `diagnosis` / asset registry：建立逐对象登记、`user_plant_id` 归属、保留期限、标记删除—禁止新写—清理—对账—补偿状态机；把 44 条 `plant_images`、31 条过期 `watering_visual_evidences` 和 9027 条缺 `file_id` 的 `visual_raw_image_records` 纳入反向索引设计，不能以当前 0 个 deletion job 判定无待清理对象。
4. P5/P6 验收 owner：在同一测试环境生成逐对象 manifest（含内容哈希与 MIME），执行跨用户/跨植物 negative case 和真实 API 回放；OpenViking 只允许在 v2 合同、代码、schema、测试共同通过后按精确 URI `REPLACE`，删除仍需单独批准。

因此本 ticket 保持 `PARTIAL_AUDIT / P1_GATE_REQUIRED`，交接状态为 `REVIEW_NEEDED`；任何对象删除、公共发布、OpenViking forget 或迁移动作均未获本报告授权。
