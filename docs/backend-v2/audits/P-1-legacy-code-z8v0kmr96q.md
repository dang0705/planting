# P-1 本地遗留函数、路由、测试与原子依赖审计

> ticket：`z8v0kmr96q`  
> 运行时代理：`/root/run_audit_legacy_code_luna`  
> 审计日期：2026-09-19（Asia/Shanghai）  
> 范围：只读本地审计；本次不登录 CloudBase、不读取凭证、不部署、不执行 DDL、不迁移或删除云端数据，不修改业务代码、公共合同、Expected、前端或 `module-status.json`；仅按 ticket 要求维护本地 heartbeat。  
> 本地状态：`STATIC_COMPLETE + BLOCKED_ENV`  
> 整体完成度：约 85%。本地静态盘点、调用图、处置矩阵、测试证据和哈希已完成；主代理已补回 CloudBase 函数/网关注册证据，MySQL、Storage、设备闭环仍待只读补证。

## 0. 结论先行

1. 当前仓库共有 18 个唯一函数/运行器目录（不含共享 `cloudfunctions/layer`）；`cloudbaserc.json` 有 18 个配置名，其中 `auth-user-write-http` 与 `auth-user-http` 共用目录，`plant-user-write-http` 与 `plant-user-http` 共用目录，不能把别名误计为独立实现。`agent-http` 与 `diagnose-route-regression-runner` 是当前配置之外的本地目录，已在本次有效 manifest 中显式纳入。
2. v2 的六个 HTTP owner 为 `identity`、`plant-knowledge`、`user-plant`、`care`、`diagnosis`、`subscription`；小青继续使用 CloudBase Agent，不新增第七个小青 HTTP 函数。
3. 旧资产没有证据支持直接删除。当前建议以 `TRANSFORM`、`SPLIT`、`MERGE` 或 `QUARANTINE` 为主，资源统一先 `KEEP` 或 `ARCHIVE`，删除必须满足第 9 节的前置条件。
4. 已确认的本地配置漂移：`agent-http` 被本地网关、H5 和 Agent 工具调用，但未出现在当前 `cloudbaserc.json` 或其函数配置；本地路径门禁因此失败。主代理已通过只读 CloudBase 回读确认：23 个函数均为 Active，`agent-http` 与 CloudBase Agent 均已注册，网关有 21 条启用路由。因此这是“本地声明与云端事实不一致”的审计问题，不再判定为云端未注册。
5. 已确认的合同冲突：路由测试仍期待旧的本地原生 HTTP 函数集合，实际 `scripts/dev/local-functions-gateway.mjs` 已加入 `agent-http`；该测试不是可忽略的“旧结果”，而是当前配置/测试事实不一致。
6. 本次所有单元测试均属于 `unit_fake`、`unit_logic` 或 `source_contract` 边界；它们不能替代真实 CloudBase HTTP、MySQL、Storage 或微信端证据，也不能单独批准删除。

## 1. 启动、输入与证据分级

### 1.1 启动记录

| 项目 | 结果 |
|---|---|
| ticket | `z8v0kmr96q` |
| HEAD | `f09edecb4fcfa98d1ab6736afa77b66893319e5e` |
| 修改路径 | 本代理仅新增/更新本报告、有效 manifest、`.sha256` 清单和 ticket heartbeat；未修改业务代码、合同、Expected、DDL、前端、`module-status.json` 或云端资源 |
| ClickUp | 官方连接器读取/更新曾受当日 `100/100` MCP 限额阻断；本报告不伪造 tracker 成功 |
| CloudBase | 本代理未登录、未续期、未读取凭证；主代理已回传只读证据：23 个函数 Active、Agent/AI 域已注册、网关 21 条启用路由、总开关开启且平台访问鉴权关闭 |
| 最近心跳 | 2026-09-19 22:51（Asia/Shanghai） |

### 1.2 规则、架构与配置输入 SHA-256

| 输入 | SHA-256 |
|---|---|
| `docs/backend-v2/phases/P-1-audit.md` | `eb968b32823d3e76c8c3d9dcab0cc8ef786ab72be660934c084c9ce4e96d0090` |
| `docs/backend-v2/data/legacy-disposition.md` | `19d66dd89854dd1d31b8e0818edc0ac7da2d2a5f7cdbf08aaa4434c0f4b9c86c` |
| `docs/backend-v2/agents/handoff-contract.md` | `33ea0b2cc4d58907d8215b776c46154b53d89d0a46b84d197eae67b197fd74c8` |
| `docs/backend-v2/architecture/infrastructure.md` | `78d9c452c9160ed9f57e2bd4a1d68e34a6c942fa0dfc99a35bd9903aa1625332` |
| `docs/backend-v2/architecture/business-to-technical-map.md` | `e2fb933794fc17da54b0c59f2d43d58f27701a8dee406a26cb2d8065b580cce3` |
| `docs/backend-v2/data/table-ownership.md` | `1f428f6ed24d1067275c62f1cdc667fc9ebd98724d1d6331d05fd6a4ff28d3c7` |
| `docs/backend-v2/phases/P1-contracts-identity-foundation.md` | `cbe75d7d95855e041532a51d05b7ce2956a4ccd4ac30503ff7a66193921ac5c1` |
| `docs/backend-v2/phases/P2-core-domains.md` | `9679d2c2d5ffd28aab3316d3ea0fb583fbb2134e7c26a5eb2c942fa0137e4032` |
| `docs/backend-v2/phases/P4-care-diagnosis-agent.md` | `a0cdfc83de57b7a0faba3d810c92a849afdb96dd7916110f1c4a04e7b1e9984e` |
| `docs/backend-v2/phases/P6-api-freeze-cleanup.md` | `04e9c375a0eebd068ab73d73903fdcb7d8853d6bf87db802a18eae6b15a3bf5f` |
| `cloudbaserc.json` | `8a8ecd1dee5cbaaf7eab9bd7a5662b8e571d1b8850532733c0215d3e049b4e28` |
| `scripts/qa/check-http-function-paths.mjs` | `a723cbe07dca7582e15c64333fcbd99d88584a116afd04a30271b71615229e39` |
| `scripts/dev/local-functions-gateway.mjs` | `98918272dd1a6a1c25ef027f960b07b641ba053b08c2e2ac4ac3c093ea768aa4` |
| `scripts/dev/local-api-env-config.mjs` | `609da160e60ea74c7543d89679d218b3c7a1706e633ae6cf80dc6017da69d934` |

本地源快照摘要：18 个函数/运行器的确定性源清单 SHA-256 为 `ecb1661d6ea0be2aba6a3058a2ca1f89fd5d699d0f9b297f2021cb158c8d7fcb`；计算方式为按函数名排序的 `function-package-audit.mjs` 源指纹、文件数、字节数和 HEAD 的确定性 JSON。`cloudfunctions/layer` 单独源指纹为 `313c2539d223ae3146ede5c8d7557639bb2fe72693339ddbf0792e02d20a84dc`（39 文件，421472 字节）。本次复核把配置名、目录别名、配置外本地目录和上述源指纹重算为有效 manifest：[P-1-legacy-code-z8v0kmr96q.manifest.json](P-1-legacy-code-z8v0kmr96q.manifest.json)，SHA-256=`f5f71df9e3477c97a9206a7fc6b61a35d6572afdd5c4d7c1291930b247d86da7`。

配置路由清单（所有 `cloudbase-functions.json` 加 `cloudbaserc.json` 函数目录）的确定性 SHA-256 为 `440969a84cc99ab27bf1b2d5c0d21da34cec05f1537ee4f620d4f8d10ade9be3`。`src` 中包含旧函数名称或动态 HTTP 入口的静态调用方清单为 38 个文件，SHA-256 为 `a35ab52450c707231e79178e4f15985f260d6ecc6ae08dfcb59abf00b7976e28`。

### 1.3 有效资产 manifest 复核

本次补核确认：`cloudfunctions/agent-http` 是 19 个文件、357080 字节的本地 HTTP 运行器，`function-package-audit.mjs --functions=agent-http` 返回 `PASS` 且无 startup dependency violation；其 package 没有 npm 依赖，入口依赖 CloudBase layer。原报告已在调用图和处置矩阵中提到它，但没有把该目录的源指纹、文件数和配置外目录关系单独落在可读 manifest 中，现已补齐。

有效 manifest 的口径是：18 个唯一函数/运行器目录 + 1 个独立 shared layer；18 个 `cloudbaserc.json` 函数名中包含两组目录别名；`agent-http`、`diagnose-route-regression-runner` 不在 `cloudbaserc.json`，但都必须保留在遗留处置和删除前调用图中。该 manifest 只证明当前本地源快照，不证明云端部署或 Agent 业务闭环。

### 1.4 Expected 来源编号

以下是处置矩阵使用的独立架构/合同来源；当前源码和现有测试只用于确认调用路径或 characterization，不从实现反推 Expected。

| 编号 | Expected 来源 | 用途 |
|---|---|---|
| E1 | `infrastructure.md`、`business-to-technical-map.md`、`table-ownership.md` | 六域 owner、业务到技术映射、表归属和跨域边界 |
| E2 | `P1-contracts-identity-foundation.md` | 统一 `user_id`、平台身份绑定和 identity 合同 |
| E3 | `P2-core-domains.md` | `plant-knowledge`、`user-plant`、`care`、Repository 边界 |
| E4 | `P4-care-diagnosis-agent.md` | 诊断只产建议、care 才能写事实、小青受控工具合同 |
| E5 | `P6-api-freeze-cleanup.md` | API 冻结、前端切换、观察窗口和清理门槛 |
| E6 | `P-1-audit.md`、`legacy-disposition.md`、`handoff-contract.md` | 处置轴、Expected 证据、输入/输出哈希和交接格式 |

## 2. 真实本地调用图

### 2.1 Agent 与身份链

```text
src/pages/agent/agent.vue:35
  -> agent-http/ticket
  -> agent-http/session
  -> agent-http/message (SSE)
  -> agent-http/tool-runner
       -> plant-knowledge layer（目录/养护知识）
       -> watering-planner layer（通用浇水）
       -> plant-user-http/user-plants（用户植物查询）
       -> plant-user-http/user-plants/watering-planner（用户植物规划）
       -> diagnose-http/diagnosis/question/start
       -> diagnose-http/diagnosis/answer
```

`agent-http` 的票据、会话、续接、AskUserQuestion 和脱敏测试均在本地存在。当前仓库配置没有声明它，但主代理的 CloudBase 只读回读已确认 `agent-http` 与 CloudBase Agent 已注册、函数 Active、网关启用；因此剩余问题是本地声明漂移，以及尚未取得 Agent SSE/工具续接的真实业务回放，不再是“云端未注册”。

```text
src/vue-query/auth/queries/user.js
src/vue-query/auth/mutations/user.js
  -> auth-user-http/auth/user

src/utils/cloudbase-auth.js
  -> wx.cloud.callFunction({ name: 'wechat-identity' })
  -> wx.cloud.callFunction({ name: 'wechat-phone' })

src/api/wechat.js
src/api/platform-phone-auth.js
  -> local: platform-phone-bootstrap-http/auth/platform-phone
  -> production: auth/platform-phone
```

身份旧链混合使用微信运行时身份、平台手机号和 HTTP session；v2 只能在 `identity` 内先解析平台主体，再以统一 `user_id` 进入业务域。

### 2.2 植物知识、用户植物、养护与存储

```text
src/vue-query/plants/mutations/identify.js
  -> identify-http/identify/plant
  -> identify-runtime + plant-knowledge

src/vue-query/plants/queries/catalog.js
src/api/plants-http.js
src/vue-query/storage/queries/file-urls.js
  -> plant-catalog-http/catalog/plants|map|image-urls

src/api/plants-http.js
src/vue-query/plants/*
src/pages/index/components/watering-reminder-options.js
  -> plant-user-http/user-plants
  -> plant-user-http/user-plants/air-environment
  -> plant-user-http/user-plants/watering-planner
  -> plant-user-http/user-plants/watering-advisor
  -> plant-user-http/user-plants/watering-reminders
  -> plant-user-http/user-plants/fertilization-reminders

src/http-functions/storage/client.js
  -> storage-http/storage/diagnose-images
  -> storage-http/storage/files
  -> storage-http/storage/plant-images
```

`plant-user-http` 同时承载用户植物聚合和养护规划，必须拆到 `user-plant` 与 `care`；`storage-http` 必须拆分用户植物资产和诊断证据资产。当前 Storage 路径有 `_openid`/OpenID 归属痕迹，不能直接当作 v2 资产归属。

### 2.3 诊断、订阅和天气

```text
src/api/diagnosis-start.js
  -> diagnosis-question-start-http/diagnosis/question/start
  -> diagnose-http/diagnosis/question/start（兼容/回退）

诊断回答客户端
  -> diagnosis-answer-http/diagnosis/answer
  -> diagnose-http/diagnosis/answer（兼容/回退）

src/api/subscription.js
  -> subscription-http/subscription/plans
  -> subscription-http/subscription/orders
subscription callbacks
  -> subscription-http/subscription/notify
  -> subscription-notify-http/subscription/notify

src/vue-query/weather/*、src/api/weather.js、src/api/weather-hot-cities.js
  -> weather-http/weather/current|environment-context|recent|hot-cities|v7/weather/24h|ingestion
weather scheduler
  -> weather-ingestion-scheduler（无 HTTP route）
```

诊断的两个专用 split 函数和主函数存在明确重叠路由；订阅通知也存在双 owner。天气 HTTP 与 scheduler 应在 `care` 内保留适配器/定时器边界，不应重新集中成万能 shared layer。

## 3. 动态路由与路径门禁

执行 `node scripts/qa/check-http-function-paths.mjs` 的当前结果：`FAIL`。

| 文件/行 | 结果 | 处置影响 |
|---|---|---|
| `src/vue-query/plants/mutations/fertilization-reminders.js:13` | `plant-user-http` + `/user-plants/fertilization-reminders` 被工具标为 unresolved | 需要确认运行时拼接后仍落在 care owner，再迁移路径 |
| `src/api/platform-phone-auth.js:64,67` | `dynamic_function_path` | local/prod 函数名不能由静态扫描确认，不能据此删旧入口 |
| `src/api/wechat.js:27,30` | `dynamic_function_path` | 同上，需真实配置矩阵和客户端回放 |
| `src/pages/agent/agent.vue:35` | `function_not_declared: agent-http` | 本地 path gate 仍失败；云端注册已由主代理读回确认，需在合同/配置审计中解释漂移，不得把该静态失败误报为云端未注册 |

补充的本地配置交叉证据：`cloudfunctions/agent-http` 没有 `cloudbase-functions.json`，但 `scripts/dev/local-functions-gateway.mjs:19,41,57` 和 `scripts/dev/local-api-env-config.mjs:16-29,31-42` 都把 `agent-http` 纳入本地函数、端口和健康检查；前者的凭据必需集合包含 `agent-http`（:30-42），后者的健康检查凭据集合（:80-90）没有它。该差异不改变“凭据不得写入仓库”的原则，但会使“只选 Agent 的本地健康检查”与“完整 gateway 启动”采用不同的缺凭据判定，必须在 v2 运行时合同中统一，不能以静态 path gate 通过代替。

当前门禁统计为 67 个扫描引用、5 个动态未解析项、1 个未声明函数。动态解析、调用流量和线上路由必须在删除前补齐；对 `agent-http` 还必须补 route manifest/健康检查凭据集合的一致性证据。

## 4. 六域处置矩阵

处置列使用 `内容/代码转化决定；资源清理决定`。资源清理不是内容转化，不能因为某项内容要重建就立即删除原文件或云端资源。

| 旧资产 | 当前入口/路由事实 | v2 owner | 处置 | Expected | 删除/归档前置条件 |
|---|---|---|---|---|---|
| `agent-http` | `/ticket`、`/session`、`/message`；Agent 工具调用知识、用户植物、诊断 | CloudBase Agent；受 `identity`、`plant-knowledge`、`user-plant`、`care`、`diagnosis` 控制 | `TRANSFORM；KEEP` | E2、E4 | 云端注册已由主代理读回确认；仍需 Agent 短票据/SSE/续接/工具结果真实闭环，并解释本地配置漂移、核对访问鉴权和回退路径；未完成前不可删除或宣称完整验收 |
| `auth-user-http` | `/auth/user` GET/POST/PATCH；前端 auth query/mutation | `identity` | `TRANSFORM；KEEP` | E1、E2 | identity API 冻结、所有客户端切换、统一 `user_id` 读回、旧 OpenID 业务引用归零 |
| `auth-user-write-http` | `auth-user-http` 同目录别名；未发现前端静态调用 | `identity` | `TRANSFORM；ARCHIVE → DELETE` | E2、E5 | 外部调用、脚本和网关流量核对为零；别名从配置移除；identity 写路径真实验证完成 |
| `platform-phone-bootstrap-http` | `/auth/platform-phone`，校验手机号并签发平台 session | `identity` | `TRANSFORM；KEEP` | E2 | 多平台身份绑定、phone proof、解绑拒绝访问和 session 读回完成 |
| `wechat-phone`、`wechat-identity` | `wx.cloud.callFunction`；仍有平台运行时身份路径 | `identity` | `TRANSFORM；KEEP`（临时） | E2 | 所有端改走统一 identity；公开响应不再包含 OpenID 等平台主体标识；完成解绑/撤销验证 |
| `diagnose-http` | `/diagnosis/start`、`/diagnosis/history`、review、visual、SSE、兼容入口 | `diagnosis` | `SPLIT；KEEP` | E1、E3、E4 | v2 diagnosis 合同、会话/题包/证据/结果 owner 冻结；客户端、Agent、review 全部切换；真实回放完成 |
| `diagnosis-question-start-http` | `/diagnosis/question/start` 与主函数重叠；由 split 构建脚本生成 | `diagnosis` | `MERGE；KEEP` | E3、E4、E5 | 单一 route owner、split artifact 可重建、客户端切换、题包答案读回和观察窗口完成 |
| `diagnosis-answer-http` | `/diagnosis/answer` 与主函数重叠；由 split 构建脚本生成 | `diagnosis` | `MERGE；KEEP` | E3、E4、E5 | 同上；需验证错误脱敏、幂等、续答和最终结果读回 |
| `diagnosis-history-http` | 仅 `/diagnosis/history/health`；数据路径返回 410 | `diagnosis` | `QUARANTINE；ARCHIVE → DELETE` | E4、E5 | 旧 health probe、light-load、文档和脚本全部迁移；真实 410/404 观察并确认无外部调用 |
| `diagnose-route-regression-runner` | 历史回归运行器，不在 CloudBase 函数清单 | `diagnosis` 测试资产 | `TRANSFORM；ARCHIVE` | E3、E4、E5 | v2 e2e runner 接管同等场景，保留回放制品和失败回退后再删除 |
| `identify-http` | `/identify/plant`，图片识别 + knowledge matching | `plant-knowledge` | `TRANSFORM；KEEP` | E1、E3 | knowledge identity/evidence/release 合同冻结；外部识别 adapter 与 domain 解耦；真实图片/归属读回 |
| `plant-catalog-http` | `/catalog/plants`、`/catalog/map`、`/catalog/image-urls` | `plant-knowledge` | `TRANSFORM；KEEP` | E1、E3 | catalog release、图片 URL 权限、身份别名和公开脱敏读回完成 |
| `plant-user-http` | 用户植物、生命周期、空气环境、浇水/施肥规划和提醒混合 | `user-plant` + `care` | `SPLIT；KEEP` | E1、E3、E4 | user-plant aggregate 与 care command/query 分离；user_plant 归属、事务、版本和幂等真实验证 |
| `plant-user-write-http` | 与 `plant-user-http` 同目录别名，写代理测试仍存在 | `user-plant` + `care` | `SPLIT；ARCHIVE → DELETE` | E3、E5 | 新写路径切换、别名流量为零、写代理测试迁移、MySQL 读回和回退验证完成 |
| `storage-http` | 诊断图片、植物图片、文件三类资产混合 | `user-plant` assets + `diagnosis` evidence | `SPLIT；KEEP` | E1、E3、E4 | 对象清单、owner 迁移、临时 URL/删除权限和回退读回完成；不得按 OpenID 新增路径 |
| `subscription-http` | 计划、订单、支付通知混合 | `subscription` | `MERGE；KEEP` | E1、E5 | 订单/权益/额度/回调 owner 冻结，签名、幂等、事务和回读完成 |
| `subscription-notify-http` | `/subscription/notify` 与主函数重复 | `subscription` | `MERGE；ARCHIVE → DELETE` | E1、E5 | 只保留一个 callback owner；支付平台回调、重放、幂等和失败恢复真实验证 |
| `weather-http` | 当前/近期/环境/24h/热点城市/摄取 HTTP | `care` | `TRANSFORM；KEEP` | E1、E3、E4 | care weather adapter、缓存、外部供应商错误边界和真实窗口读回完成 |
| `weather-ingestion-scheduler` | 定时摄取、D0/recent、season trigger | `care` | `TRANSFORM；KEEP` | E3、E4 | 线上定时触发、重复执行、失败恢复、缓存/对象读回完成 |

当前没有资产可以仅凭本地静态证据直接标记 `DELETE`；`REJECT` 只用于禁止把运行流水或旧实现当作 v2 Expected/迁移源。

## 5. 原子依赖处置

引用数量为静态 `rg` 盘点，包含源码、测试和生成产物，不能当作线上调用量。

| 依赖组 | 已盘点依赖/静态证据 | v2 处置 | 删除条件 |
|---|---|---|---|
| 基础设施 | `cloudbase`（119）、`http`（53）、`platform-session`（13）、`http-identity-ticket`（4）、`runtime-env`（3）、`native-mysql`（10）、`quota`（2）、`platform-phone-bootstrap`（1）、`platform-phone-verifiers`（2）、`catalog-image-url`（3） | `KEEP`；按 owner 做边界化 `TRANSFORM` | 所有新 owner 的依赖图、包 staging、启动时序和敏感输出扫描通过；禁止移入领域业务逻辑 |
| 小青 Agent HTTP 适配 | `cloudfunctions/agent-http` 内部 `acp-stream`、`agent-quota`、`ask-user`、`runtime-config`、`server`、`session-service`、`session-store`、`tool-runner`；外部 layer 依赖 `/opt/utils/cloudbase`、`/opt/utils/http-identity-ticket`、`/opt/utils/plant-knowledge`、`/opt/utils/platform-session`、`/opt/utils/quota`、`/opt/utils/watering-planner`；本地 bootstrap 固定 `/var/lang/node18/bin/node` | `TRANSFORM；KEEP`，作为 CloudBase Agent 的受控适配边界；不得把会话、票据、工具结果或模型流搬回万能 HTTP 业务函数 | Agent 身份必须由 `identity` 解析并以 `user_id` 进入业务；短票据、SSE、AskUserQuestion、额度、工具调用和脱敏均须有 v2 合同及真实回放；Node.js 22 构建/运行证据齐备前不能宣称已迁移 |
| 植物知识 | `plant-knowledge`（30）、`identify-runtime`（1） | `TRANSFORM` 到 `plant-knowledge`；Agent/diagnosis/care 只通过受控读取 | knowledge DTO、evidence、release 和权限合同冻结；跨域直接 import 清零 |
| 浇水/蒸腾 | `watering-planner`（14）、`transpiration`（14）、`hydration-load`、`pot-geometry`、`seasonal-watering`、`watering-schedule`、`water-volume-format` | `TRANSFORM` 到 `care` | 事实、盆型、天气、湿土证据和计划幂等有独立 Expected 与真实读回 |
| 施肥/环境/光照 | `fertilization-reminder-planner`（17）、`fertilization-history`（11）、`air-environment-evidence`（19）、`light-exposure-factors`（4）、`light-exposure-normalize`（3）、`light-exposure`（8）、`user-plant-light-environment`（8）、`watering-soil-visual`（3） | `TRANSFORM` 到 `care` 或 `diagnosis` | 诊断证据与 care 事实分界、用户确认写入、并发/幂等和公开脱敏验证 |
| 天气适配 | `weather-day-file-reader`（3）、`weather-object-storage`（7）、weather path/cache/timeout helpers | `TRANSFORM` 到 `care` adapter；保留 `KEEP` | 外部供应商、缓存、定时器和历史窗口真实读回；禁止复制一份万能 weather layer |
| 资产 | `plant-images`（3） | `SPLIT` 到 `user-plant` assets 与 `diagnosis` evidence | 对象 owner、授权 URL、清理和迁移清单完成 |
| 可疑废弃依赖 | `llm-request`（0 个直接产品引用）、`wx-cloud`（0 个源码引用；仅包锁线索） | `ARCHIVE → DELETE` 候选 | 完成动态 require、构建 staging、锁文件和运行时依赖扫描；确认无外部部署引用 |
| 部署保护 | `cloudbase-env-update-guard`（脚本与单测仍引用） | `KEEP` | 只有替代部署审计护栏上线并通过回放后才可重评估 |

## 6. 测试、读回和旧测试处置

### 6.1 当前执行证据

| 命令 | 结果 | 层级/限制 |
|---|---|---|
| `node test/unit/run-all.mjs --filter=backend` | `153/153 passed` | `unit_fake`、`unit_logic`、`source_contract`；有模拟 SQL/Storage 错误日志但均为预期故障分支 |
| `node test/unit/backend/diagnose-http/route-exposure.mjs` | `6/6 passed` | 当前重叠路由和退役 history 配置 characterization，不是 v2 删除批准 |
| split artifact contract | `PASS` | 生成产物可从当前主函数构建，尚未证明线上单 owner |
| `node scripts/qa/function-package-audit.mjs --json --functions=...` | `PASS`，18 个唯一目录无 startup violation；另对 `agent-http` 单独 `PASS`（19 文件、357080 字节） | 本地包源快照；不代表云端已部署 |
| `node scripts/qa/check-http-function-paths.mjs` | `FAIL`：67 refs、5 dynamic unresolved、1 undeclared agent | 需补动态调用图并解释本地声明与已回读云端 Agent 注册的差异；不是云端未注册证据 |
| `node test/e2e/batch/cross-contract/local-gateway-plant-user-write-route.mjs` | `FAIL`：测试仍期待旧 native set | 测试与当前 Agent 本地网关配置不一致；不能吞掉失败 |
| `node scripts/check-cloudfunction-quality.mjs` | `FAIL` 于 HTTP path gate | split artifact/route exposure 已先通过，整体仍未绿 |

### 6.2 旧测试、脚本和历史制品

| 资产 | 当前事实 | 处置 |
|---|---|---|
| `test/unit/backend/auth-user-http/write-proxy.mjs` | 共享目录写代理合同通过，但没有生产静态调用方 | 迁移 identity 写合同后 `ARCHIVE`；删除前确认外部/脚本调用为零 |
| `test/unit/backend/plant-user-http/write-proxy.mjs`、`write-proxy-origin.mjs` | 共享目录写代理合同通过 | 迁移 user-plant/care command 后 `ARCHIVE` |
| `test/unit/backend/diagnose-http/route-exposure.mjs` | 明确保护主函数与 split 重叠路由 | 作为当前事实保护；v2 route freeze 后改为单 owner Expected |
| `test/e2e/batch/backend-light-load-contract.mjs` | 仍检查退役 history 数据路径 404 | 迁移为 v2 统一 history/退役路由 e2e 后才可移除 |
| `test/e2e/automator/catalog.json` | 含大量旧函数名、旧路径和历史场景 | `QUARANTINE/ARCHIVE`；不是 Expected，不得直接删而不迁移场景 |
| `test/e2e/batch/diagnosis/_history/qa-artifacts` | 历史报告含旧 LAN/旧函数 URL | `ARCHIVE`；只作历史证据，不能当线上当前状态 |
| `test/unit/backend/agent-http/*.mjs` | 8 个文件、43 个测试，当前均通过；边界为 `unit_fake`/`source_contract`，使用 fake fetch、fake SQL 或隔离 HTTP handler，不覆盖真实 Agent SSE、工具续接和 CloudBase Agent 配置 | `KEEP → TRANSFORM`；随 Agent 适配合同迁移，保留票据一次性兑换、身份隔离、额度原子预留、AskUserQuestion 脱敏和工具结果边界；真实回放前不能作为端到端证据 |
| `scripts/dev/local-api-env-config.mjs`、`scripts/dev/local-functions-gateway.mjs`、`test/e2e/batch/workflow/dispatch-gate-contract/local-api-env-launcher-decomposition.mjs` | 多处把 `agent-http` 作为本地必需函数/health path，但 path gate 只读 `cloudbase-functions.json`，并且两套凭据集合不完全一致 | `KEEP；合同化`；先统一本地运行器、健康检查和 route manifest，再谈旧路径归档 |

## 7. 删除前置条件与主代理精确补证清单

### 7.1 所有旧函数/路由/测试/依赖的共同门槛

1. v2 DTO、公开响应、权限边界、错误合同和 owner 已冻结，并有独立 Expected。
2. 所有静态、动态、脚本、健康检查、Agent 工具和外部回调调用方均已核对。
3. 新 route 单一 owner 已部署，旧 route 切换完成，真实 HTTP 读回和观察窗口通过。
4. 真实 MySQL 验证 user/user_plant 归属、事务、幂等、并发版本和失败恢复；不能用 mock、内存仓库或 HTTP 200 代替。
5. Storage 对象按精确 prefix/object 清单完成 owner 迁移、授权 URL、删除和回退读回。
6. 旧单测/e2e/自动化清单已迁移，历史制品归档，不再作为 Expected。
7. 保留可回退版本、删除后健康检查和审计事件；未经这些证据不执行 DELETE。

### 7.2 需要主代理协调的只读 CloudBase/端上证据

本代理不执行以下查询；主代理可在统一登录会话下按最小权限读取并回传结果：

| 证据 | 精确查询范围 | 通过条件 |
|---|---|---|
| 函数注册 | Env `cloud1-2grufevs395a9d5e` 的函数 list/detail：23 个函数均 Active，含 `agent-http` 与 CloudBase Agent 域 | 已由主代理回读确认；仍需把 23 个云端函数与本地 18 个源资产、两个别名逐项映射，确认版本/入口/更新时间和别名流量 |
| 网关路由 | 网关共 21 条启用路由，含 Agent/AI 域；总开关开启，平台访问鉴权关闭 | 注册和启用事实已确认；仍需逐条核对重复诊断/订阅路径的 owner、Agent health/SSE 回放，以及鉴权关闭是否符合批准的环境边界 |
| MySQL 只读读回 | identity users/platform identities/sessions；user_plants；care facts/plans/reminders；diagnosis sessions/answers/results；subscription orders/entitlements/quota | owner、user_id/user_plant_id 归属、幂等键、状态和数量核对通过；不得回填或修改 |
| Storage 只读清单 | 诊断图片、植物图片、通用文件 prefix；对象 metadata、owner 字段、生成 URL 权限 | 所有对象可映射到 v2 owner；无孤立对象；迁移/回退清单可复现 |
| 线上观测 | 旧别名、旧 history、旧 split、旧 callback 的请求/错误/调用日志 | 观察窗口内无旧调用，或有明确外部调用方清单与切换方案 |
| 端上 e2e | 匹配项目/构建/身份的微信 DevTools 或真机；真实 `wx.request`、有效 PNG、Agent SSE/续接 | 诊断开始→回答→结果、用户植物读写、Storage 上传、订阅回调和 Agent 工具闭环均有可回放制品 |

## 8. 未覆盖、风险与恢复条件

- `BLOCKED_ENV` 仅针对尚未完成的实时业务闭环，不阻断本地审计；缺失证据不是“已通过”。
- `agent-http` 的云端注册与网关启用已由主代理回读确认；当前最高优先级风险改为本地声明漂移、网关平台访问鉴权关闭，以及尚未完成 Agent health/SSE/工具续接回放。恢复条件是主代理补齐这些只读/端上证据，并把结果与本报告源哈希绑定。
- 现有 `wechat-identity`/诊断 history 的 OpenID 依赖与 v2 统一 `user_id` 规则冲突，必须在 identity/diagnosis 迁移中处理，不能仅通过重命名路由掩盖。
- `agent-http/tool-runner.js` 的 `requireIdentity` 当前同时要求 `identity.openid` 与 `identity.userId`，`session-store.js` 也会回读 `openid`；这只能作为 identity 适配层内部的短期平台证明，不能继续成为用户植物、养护、诊断或 Agent 长期上下文的业务归属键。迁移验收必须证明跨域关系只使用 `user_id`，并且公开响应、日志和工具结果不泄露 OpenID。
- `storage-http` 使用 `_openid`/OpenID 路径的证据只来自本地源码；真实对象 owner 和数量仍未读回。
- `src/api/subscription.js` 的计划请求存在 `auth:false`，而后端计划接口需要用户身份；本地静态冲突已记录，需真实端上回放后再决定是否修复。
- `cloudfunctions/agent-http/scf_bootstrap` 固定 Node.js 18，和 v2 新 HTTP 函数 Node.js 22 基线不一致；这是遗留运行时事实，不是本次静态审计可以自行修复的业务代码。
- `agent-http` 的本地 Agent 上游地址、CloudBase Agent 生产配置和凭证均未由本代理读取；主代理只回传了注册/路由状态，仍不得用本地单测或“Active”状态单独声称 Agent 业务闭环可用。
- 没有任何旧函数、路由、测试或依赖在本报告中被删除；删除前置条件全部保留。

## 9. 交接摘要

- ticket：`z8v0kmr96q`
- 负责人：`/root/run_audit_legacy_code_luna`
- 当前阶段：P-1 本地旧代码/路由/测试/原子依赖审计
- 完成度：静态范围 100%；结合主代理函数/网关注册读回的 P-1 约 85%
- 状态：`STATIC_COMPLETE + BLOCKED_ENV`
- 修改路径：本报告、有效 manifest、旁边的 SHA-256 清单和 ticket heartbeat；无业务代码修改，未改 `module-status.json`
- 下一步：主代理继续补 MySQL/Storage/端上及 Agent 业务回放证据，解释本地声明漂移和网关鉴权边界；然后在 v2 合同冻结后逐项切换和清理

## 10. 2026-09-19 复核收口与后续验收分流

### 10.1 复核范围与结论

本次复核只读取 `docs/backend-v2/README.md`、`BASELINE.lock`、P-1 入口、既有本地遗留审计、`P-1-cloudbase-live-readback.md`、相关源码/配置/测试与 SHA-256 清单；入口校验通过，Master Plan 仍为 2111 行、SHA-256=`e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428`。未登录 CloudBase、未读取凭证、未执行 DDL/DML、未部署、未删除、未修改业务代码或 `module-status.json`，也未重试 ClickUp。

本 ticket 的静态资产范围已收口：18 个唯一函数/运行器目录、1 个 shared layer、18 个配置名及两组目录别名、配置外的 `agent-http`/`diagnose-route-regression-runner`，以及旧函数路由、动态路径、Agent 专属依赖和测试资产均已纳入有效 manifest。此前未单独固化的 `agent-http` 源指纹、8 个 Agent 单元测试、内部依赖和本地凭据集合差异已补入本报告；manifest SHA-256=`f5f71df9e3477c97a9206a7fc6b61a35d6572afdd5c4d7c1291930b247d86da7`。

现有执行证据仍为：后端 unit 153/153 通过；诊断 route exposure 6/6 通过；18 个唯一目录及 `agent-http` 单独包审计均 PASS；HTTP path gate 67 refs、5 dynamic unresolved、1 undeclared Agent 仍 FAIL；local gateway route contract 仍因旧 native set 预期而 FAIL；quality gate 随 path gate FAIL。以上是当前可回放的本地事实，不把单测或 HTTP 200 当作真实 CloudBase/Agent/端上闭环。

### 10.2 可以在本 ticket 闭合的静态结论

| 审计结论 | 证据 | 闭合边界 |
|---|---|---|
| 本地函数/运行器与目录别名关系可复核 | 有效 manifest、`cloudbaserc.json`、各 `cloudbase-functions.json`、`function-package-audit.mjs` 输出 | 闭合本地源快照与别名计数；不证明 23 个云端函数的逐项版本/入口映射 |
| `agent-http` 不能再被当作未盘点目录 | `cloudfunctions/agent-http` 19 文件/357080 字节/源指纹、网关与 H5 调用、8 个测试文件 | 闭合静态纳入和处置边界；SSE、工具续接、上游配置仍未真实回放 |
| 重叠路由、动态函数名和 path gate 失败均有处置决定 | path gate 原始结果、route exposure 6/6、local gateway contract 失败输出 | 闭合“失败不能吞掉”的审计判断；不授权改测试或删除旧路由 |
| Agent 原子依赖和测试边界可追溯 | Agent 内部模块、`/opt/utils` 依赖、unit_fake/source_contract 43 tests、Node.js 18 bootstrap | 闭合依赖处置；不证明 v2 Node.js 22 构建、真实身份、额度、MySQL 或 Agent 配置正确 |
| 没有旧函数、路由、测试或依赖满足静态 DELETE | 六域处置矩阵、删除门槛、live readback 的实时缺口 | 闭合“不得静态删除”；删除仍需 v2 合同、真实读回、观察窗口和回退制品 |

### 10.3 转为后续 Phase / 主代理验收的缺口

- `agent-http` 本地 route manifest、健康检查凭据集合与 CloudBase 实际路由/函数版本仍需逐项只读对齐；本地目录无 `cloudbase-functions.json`，不能把 path gate 的失败误报为云端未注册，也不能据此擅自补配置。
- 需要同一 EnvId 的 MySQL、Storage、网关访问鉴权、Agent health/SSE/工具续接和端上真实回放；已有实时摘要只能证明可读性/注册性，不能证明归属、幂等、权限或公开响应合同。
- Agent 身份链必须从现有 OpenID 适配过渡到统一 `user_id`；v2 Node.js 22/TypeScript 构建和 CloudBase HTTP 运行证据尚未建立。
- ClickUp 连接器配额阻断状态同步；本地 heartbeat 保留 `CLICKUP_BLOCKED`，不伪造已同步状态。

### 10.4 交接状态

- 状态：`review_needed`（本地静态审计收口，等待主代理验收）；综合 P-1 进度仍为约 85%，不因补齐静态制品而冒充实时业务闭环完成。
- 继续条件：主代理确认有效 manifest/报告哈希并补齐其余只读或端上证据；未满足前不进入旧函数/路由/测试/依赖删除。
- 回退方式：本次仅新增/更新审计文档、manifest、hash 和 heartbeat；无业务、云端或数据库变更，删除这些审计制品不改变业务状态。
