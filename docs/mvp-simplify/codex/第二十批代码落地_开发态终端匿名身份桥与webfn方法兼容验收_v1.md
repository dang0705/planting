# 第二十批代码落地：开发态终端匿名身份桥与 webfn 方法兼容验收 v1

## 1. 本批目标

把终端侧的真实业务验收从“只能拿匿名 token，但无法进入业务 openid 链”推进到“在开发环境下可受控地完成 user plant 的 create / list / delete 验收”，同时修掉 CloudBase `webfn` 对非 `GET/POST` 方法不稳定导致的删除失效问题。

本批目标只面向 `development` 环境，不改变正式用户态和生产口径。

---

## 2. 代码落地

### 2.1 开发态匿名终端身份桥

文件：
- `cloudfunctions/layer/utils/http.js`
- `scripts/terminal-e2e/cloudbase-http-check.mjs`

改动：
- 在 `resolveHttpUserInfo()` 中新增开发态匿名身份桥。
- 只有同时满足以下条件时，才允许把匿名 token 映射成开发态 synthetic openid：
  - `appEnv=development`
  - 明确带上 `x-terminal-e2e=true` 或等价开关
  - bearer token 的 `scope` 包含 `anonymous`
- synthetic openid 规则为：`anon_dev_<sub>`

结论：
- 终端已经可以在不依赖小程序运行时的情况下，进入受控的业务 openid 链。
- 该桥仅在开发环境显式开启时生效，不影响正常用户和正式环境。

### 2.2 webfn 非 GET/POST 方法兼容层

文件：
- `cloudfunctions/layer/utils/http.js`
- `src/http-functions/core/httpRequest.js`
- `scripts/terminal-e2e/cloudbase-http-check.mjs`

问题：
- CloudBase `webfn` 直发 `DELETE` 时，网关层会把请求落成 `GET` 语义，导致 `plant-user-http` 删除请求实际执行的是列表逻辑。

处理：
- 客户端和终端脚本统一改为：
  - 逻辑方法保留原值
  - 真实传输方法改成 `POST`
  - 自动附带：
    - query `_method=<LOGICAL_METHOD>`
    - header `x-http-method-override: <LOGICAL_METHOD>`
- 云函数公共请求解析 `getHttpRequestData()` 改为优先识别上述 override，并恢复出真实逻辑方法。

结果：
- `PATCH / DELETE / PUT` 现在都能稳定穿过 `webfn`。
- 不需要分别在每个 HTTP 云函数里写特殊兼容分支。

### 2.3 plant-user create 响应回填修复

文件：
- `cloudfunctions/layer/utils/plant-knowledge.js`

问题：
- `createUserPlantInstance()` 插入成功，但 `SELECT LAST_INSERT_ID()` 在当前 CloudBase SQL 封装链上不稳定，导致 `POST /user-plants` 响应 `data` 为空。

处理：
- 保留 `LAST_INSERT_ID()` 主路径。
- 当拿不到 `insertId` 时，按本次请求的关键字段做一次最近记录回查：
  - `_openid`
  - `plant_identity_id`
  - `legacy_plant_id`
  - `recognized_name`
  - `nickname`
  - `location`

结果：
- `POST /user-plants` 现在会直接返回完整创建结果对象。

---

## 3. 云端变更

### 3.1 cloud1_dev 表结构补齐

环境：
- `cloud1-2grufevs395a9d5e`
- 目标库：`cloud1_dev`

原因：
- 实际验收时发现 `cloud1_dev.user_plant_instances` 仍缺少 identity-first 写链需要的新列，导致 `plant-user-http` 读取报错：
  - `Unknown column 'up.plant_identity_id' in 'field list'`

已补字段：
- `plant_identity_id`
- `legacy_plant_id`
- `identity_resolution_status`
- `visual_call_batch_id`

已补索引：
- `idx_user_plant_identity`
- `idx_user_plant_legacy`
- `idx_user_visual_batch`

SQL 变更请求：
- `82a1ebe5-ee2b-4015-ab4d-9f9d68f11b52`

### 3.2 layer 发布与函数重绑

已发布：
- `layer:42`
  - 描述：`method override compatibility for webfn non-GET/POST + dev terminal bridge`
  - 请求：`0e5c3c63-0cde-48ae-991b-cc53ba7170fc`
- `layer:43`
  - 描述：`plant-user create response fallback for CloudBase LAST_INSERT_ID instability`
  - 请求：`0d0245f5-c790-4cb5-8366-f3dfe68b182f`

已切到 `layer:42` 的函数：
- `auth-user-http` `ae439c1f-a747-4222-b52a-498ec1a8595b`
- `diagnose-http` `9b9e4c8f-7951-4b80-9143-556712bb1607`
- `diagnosis-history-http` `a54b9673-5413-4200-bc83-4ebe0d530905`
- `identify-http` `e8993ba4-524c-42f5-a52d-facce4410dc8`
- `plant-catalog-http` `70f1a735-cc26-43eb-b0ed-c7fe3ca65f11`
- `plant-user-http` `44df6e59-f8e0-41d4-ba3c-61534081c608`
- `storage-http` `b8b94f7c-80db-4cf1-87c5-759d41b2a10d`
- `weather-http` `86dea6cd-04e2-4ecc-9c56-981b9e6b2214`

后续仅 `plant-user-http` 继续升级到 `layer:43`：
- `f560509e-e39a-4f21-bac6-d75e49d7c330`

当前确认：
- `plant-user-http` 详情显示已绑定 `layer:43`
- 函数状态：`Active`

---

## 4. 验收结果

### 4.1 diagnose 历史口开发态匿名验收

终端脚本：
- `scripts/terminal-e2e/cloudbase-http-check.mjs`

结果：
- `GET diagnose-http/diagnosis/history`
- 条件：
  - 匿名登录
  - `appEnv=development`
  - `x-terminal-e2e=true`
- 返回：
  - HTTP `200`
  - 空列表

这说明匿名终端身份桥已经能穿过诊断业务的登录校验。

### 4.2 plant-user 列表与删除闭环

设备：
- `codex-dev-e2e-user-1`

删除前列表：
- `GET plant-user-http/user-plants`
- 返回 `200`
- 能看到 `id=2` 的测试植物

删除：
- 逻辑请求：`DELETE plant-user-http/user-plants`
- 实际传输：`POST + _method=DELETE + x-http-method-override`
- 返回：
  - HTTP `200`
  - `message = 删除成功`
  - `data.id = 2`

删除后复核：
- 再次列表返回 `list=[]`
- 只读 SQL 复核为空

结论：
- `webfn` 删除链已经恢复正常

### 4.3 plant-user create / delete 完整闭环

创建：
- `POST plant-user-http/user-plants`
- payload 锚点：
  - `plantIdentityId = plant_identity_bfae80168f4b7a73`
  - `legacyPlantId = 1`
  - `recognizedName = 绿萝`
  - `nickname = 终端闭环绿萝-43`

返回：
- HTTP `200`
- `message = 保存成功`
- `data.id = 4`
- 同时返回完整的：
  - `plantIdentityId`
  - `canonicalName`
  - `watering / fertilization / sunning / ventilation`
  - `temperature / humidity / varianceLevel`

删除：
- `DELETE plant-user-http/user-plants`
- `id = 4`
- 返回 `200 删除成功`

删除后 SQL 复核：
- `id=4` 与 `nickname=终端闭环绿萝-43` 均已不存在

结论：
- 当前 `plant-user-http` 在开发环境下已经完成：
  - create 成功
  - create 响应完整对象成功
  - delete 成功
  - 删除后数据清理成功

---

## 5. 本批结论

本批之后，终端侧已经不再卡在“拿不到可用业务身份”或“DELETE 被网关吞掉”这两个底层问题上。

当前可以确认：
- 开发态匿名终端身份桥可用
- `webfn` 非 `GET/POST` 兼容层可用
- `plant-user-http` 的 create / list / delete 闭环可用
- `POST /user-plants` 响应对象已补平
- `cloud1_dev.user_plant_instances` identity-first 字段已和当前代码对齐

这意味着下一步可以把注意力从“终端如何验收”转回业务主链本身，例如：
- 继续做 `diagnose-http` 的真实业务闭环验收
- 清理剩余旧 `plant_id` 心智
- 开始补更系统的 dev 验收脚本矩阵

