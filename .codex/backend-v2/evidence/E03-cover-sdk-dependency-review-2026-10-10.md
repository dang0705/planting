# E03 封面资产：`@cloudbase/node-sdk` 依赖审查报告（只审查，不安装）

- 日期：2026-10-10；票据：E03 / `z8v0kmr9mj`；对应合同：`docs/backend-v2/contracts/user-plant-cover-asset.md` §4。
- 方法：`npm view`、npmjs 下载量 API、在会话临时目录隔离安装（`--ignore-scripts`，不执行包内代码）后 `npm ls` / `du` / `npm audit`；
  只读阅读包内 `dist/` 源码（credentials、storage 模块）；CloudBase 官方知识库（HTTP 函数凭证指南、云存储 HTTP API OpenAPI）。
  **仓库 `package.json` / 锁文件均未改动。**

## 1. 结论（先说结果）

**推荐：不引入 `@cloudbase/node-sdk`；用“CloudBase 云存储 HTTP API + 服务端 API Key（受控 credential_ref）”自写一个约 150 行的存储适配器。**
理由：SDK 3.x/4.x 都带 axios 0.27.2 的高危漏洞且依赖树 78～86 个包、33～55 MB；我们只需要“换临时链接 + 读文件”两件事，
HTTP API 已覆盖，且原生 `fetch`（Node 22）即可实现，无需任何新依赖。唯一短板是 HTTP API 不支持指定链接有效期（见 §5），需要用户确认取舍。

## 2. 版本现状

| 项 | 结果 |
|---|---|
| dist-tags | `latest=3.18.3`、`release-v3=3.18.7`（2026-10-05）、`next=4.1.0`（2026-09-07）、`beta=3.17.2` |
| 说明 | 主代理提到的 3.18.3 是 `latest` 标签，但 v3 线已有更新的 3.18.7；4.x 处于 `next` 预发布线 |
| 发布频率 | 共 117 个版本；最近 12 个月 23 次发布（约每 2～3 周一次），仍在活跃维护 |
| 周下载量 | 23,630（2026-10-02～10-08，npmjs API）；对比 axios 1.15 亿，属小众包 |
| 许可证 / 仓库 | MIT；`github.com/TencentCloudBase/node-sdk` |

## 3. Node 22 / CommonJS 兼容性

- `engines.node: ">=12"`，`main: dist/index.js`，CommonJS 产物（`exports.xxx =`），无 `type: module` → 可被本仓库 esbuild 打包进 CJS 产物。
- 部分功能依赖全局 `fetch`（例如 `getFileInfo` 用 `fetch(..., { method: 'HEAD' })` 取大小与类型）→ Node 18+ 才有，Node 22 HTTP 函数与 Node 20 事件函数均满足。
- 本仓库未实测打包/运行（按要求不安装）；若采用 SDK，须补一次 esbuild 打包与冷启动体积验证。

## 4. 依赖树、体积与已知漏洞（隔离目录实测）

| 版本 | 依赖包数（npm ls --all） | node_modules 体积 | npm audit |
|---|---:|---:|---|
| 3.18.3（latest） | 86 | 34 MB | 5 个：high 4（axios、lodash.set、@cloudbase/database、node-sdk 自身传递）、moderate 1（lodash.unset） |
| 3.18.7（release-v3） | 86 | 33 MB | 同上 5 个 |
| 4.1.0（next） | 78 | 55 MB | 2 个 high（axios 0.27.2、node-sdk 传递） |

- 关键问题：所有版本都**精确锁定 `axios@0.27.2`**，命中 axios 的 CSRF、SSRF/凭证泄露（绝对 URL）、NO_PROXY 绕过等高危公告；v3 还经 `@cloudbase/database` 带 `lodash.set`/`lodash.unset` 原型污染。
  这些是传递依赖，我们无法在不 fork 的前提下升级。
- 直接依赖还包括 `jsonwebtoken`、`xml2js`、`form-data`、`agentkeepalive`、`http(s)-proxy-agent`、`@cloudbase/ai`、`@cloudbase/wx-cloud-client-sdk` 等与封面无关的模块，
  会显著增大函数包（当前生产依赖只有 ajv/mysql2/pino/suncalc 四个）。
- 违反宪章 §6.5 精神：为两个 HTTP 调用引入一个“全家桶” SDK。

## 5. 凭证：能否用函数运行时身份而不额外存密钥？

- SDK 源码（`utils/tcbapirequester.js`、`utils/tcbcontext.js`）：未显式传密钥时读取 `TENCENTCLOUD_SECRETID/SECRETKEY/SESSIONTOKEN`（事件函数运行时注入的临时密钥），
  或读取 `CLOUDBASE_APIKEY` / `accessKey`。
- CloudBase 官方指南（`cloud-functions/references/http-function-credentials.md`）明确：**HTTP 云函数不得依赖运行时临时密钥路径**（凭证轮换会导致间歇性鉴权失败），
  必须使用显式凭证——首选“CloudBase 服务端 API Key”（`manageAppAuth createApiKey`，注入 `CLOUDBASE_APIKEY`），或腾讯云 SecretId/SecretKey。
- 本仓库宪章 §2 同样要求“HTTP 云函数调用 CloudBase 服务端 SDK 时必须使用受控的显式凭证”。
- **结论：user-plant 是 HTTP 函数，不论用不用 SDK，都需要一个专用的服务端 API Key**（按 `credential_ref` 管理、指定轮换负责人、不进日志/响应）。
  这需要用户授权创建与注入，代理不得自行配置。

## 6. 封面所需 API 对照

| 需求（合同 §2/§3） | SDK | CloudBase 云存储 HTTP API（官方 OpenAPI `storage.v1`） |
|---|---|---|
| 签发 600 秒临时读取链接 | `getTempFileURL({ fileList: [{ fileID, maxAge: 600 }] })`（内部 `storage.batchGetDownloadUrl`，支持 `max_age`） | `POST /v1/storages/get-objects-download-info`，请求只有 `cloudObjectId`，**无有效期参数**（有效期由平台默认决定） |
| 读文件大小 / 类型 | `getFileInfo`：先换链接再 `HEAD`，取 `content-length` / `content-type`（类型是上传方声明值，不是文件魔数） | 同样：换链接后 `HEAD` |
| 校验内容 SHA-256 与真实类型（魔数） | 无直接 API；需 `downloadFile` 下载后自己算 | 换链接后 `GET` 下载（≤5 MiB）自己算哈希、看魔数 |
| 校验文件属于该用户目录 | 只能按 `fileID` 前缀自行校验 | 同左 |
| 权限 | 受云存储基础权限/安全规则约束 | 同左（`STORAGE_EXCEED_AUTHORITY`） |

两条路径的业务校验工作量相同（下载 ≤5 MiB → 算 SHA-256 → 魔数判 MIME → 大小比对），差别只在“谁来发 HTTP 请求”。

## 7. 替代方案对比

| 方案 | 工作量 | 风险 | 备注 |
|---|---|---|---|
| A. 引入 `@cloudbase/node-sdk` | 低（≈80 行适配 + 依赖审查/打包验证） | **高**：axios 0.27.2 高危漏洞无法自行修复；86 个传递包、34 MB；小众包更新节奏依赖厂商 | 唯一优点：可指定 `maxAge=600` |
| B. 自写 CloudBase 存储 HTTP API 适配（推荐） | 中（≈150 行：API Key 鉴权头、换链接、下载+哈希+魔数、错误码映射；+ 本机假服务器单测） | 低：零新依赖、原生 `fetch`；接口有官方 OpenAPI | 短板：无法指定链接有效期，需确认平台默认时长是否可接受，或把“600 秒”改为“不超过平台默认、响应如实返回到期时间” |
| C. 自写腾讯云 COS 签名（TC3/HMAC） | 高（≈300 行：COS 鉴权签名、桶/地域解析、预签名 URL 可自定 600 秒） | 中：签名算法自实现易错；需腾讯云 SecretId/SecretKey（权限面比 CloudBase API Key 大）；绕过 CloudBase 安全规则层 | 仅在必须精确 600 秒且不接受 A 时考虑 |

## 8. 需要用户拍板

1. 是否接受方案 B？若接受，“读取链接 600 秒”（配置 `storage.read_url.ttl_seconds`，已 confirmed）需改语义：
   推荐改为“签发链接的有效期以平台为准，响应 `urlExpiresAt` 如实给出；服务端在 600 秒后不再复用旧链接”，或另行确认平台默认有效期后再定。
2. 授权创建专用服务端 API Key（建议名 `http-function-user-plant-storage`），以 `credential_ref` 注入 user-plant 函数，并指定轮换负责人。
3. 前端直传目录与平台无关 `user_id` 的绑定方式及云存储安全规则（合同 §4 前置条件，仍待定）。
