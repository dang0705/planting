# P0 外部供应商合同本地审计

> 审计日期：2026-09-19（Asia/Shanghai）  
> 审计范围：百度植物识别、和风天气、微信支付（含回调）  
> 审计方式：只读源码、配置键名投影、既有测试与本地合同核对  
> 结论：三项能力均保持 `CONTRACT_STOP + INTEGRATION_STOP`。本报告只证明当前 checkout 的本地实现事实和缺口，不证明供应商可用、账号归属、线上路由或支付沙箱已接通。

## 1. 入口、证据和安全边界

### 1.1 入口核对

已先读取 `docs/backend-v2/README.md` 与 `docs/backend-v2/BASELINE.lock`，并执行：

```text
node docs/backend-v2/verify-entrypoint.mjs
→ PASS：Master Plan 标题匹配，2111 行，SHA-256=e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428
```

随后按入口最小范围读取：

- `docs/backend-v2/decisions/P0-external-capability-cards.md` 与其出口门；
- `docs/backend-v2/audits/P-1-external-sources-z8v0kmr96t.md`；
- 当前三个供应商函数、适配器、配置、SQL 与镜像测试；
- `docs/backend-v2/testing/test-matrix.md`，用于区分 `unit_fake`、`source_contract` 与真实供应商证据。

### 1.2 证据等级和禁止误读

- P0 外部能力卡出口门当前为 `PARTIAL`；百度、和风、支付卡均声明 `CONTRACT_STOP` 与 `INTEGRATION_STOP`。
- 当前本地测试是 `unit_fake`、`source_contract` 或逻辑级 characterization；没有本轮新取得的 S4（供应商真实请求、支付 sandbox、线上 route winner、真实费用/配额读回）。
- `cloudbaserc.json` 与 `.env.local` 均被 `.gitignore` 忽略。配置盘点只保留函数、运行时、超时和键名；本报告、sidecar 和 heartbeat 不保存凭证值。
- 没有调用供应商、支付平台、CloudBase 管理 API 或 MySQL；没有部署、DDL、迁移、路由切换、资源删除、ClickUp 写入或 `module-status.json` 修改。

### 1.3 当前函数配置的键名投影

以下是对被审计函数的键名和运行参数投影，值全部省略。它来自被忽略的本地 `cloudbaserc.json`，不能代替云端读回：

| 函数 | 当前本地 runtime / timeout | 投影到函数配置的外部相关键名 | 观察 |
|---|---|---|---|
| `identify-http` | `Nodejs18.15` / 30 秒 | `WECHAT_PAY_APPID`、`WECHAT_PAY_NOTIFY_URL` | 没有 `BAIDU_AK`、`BAIDU_SK`；支付键错误归属在识别函数 |
| `weather-http` | `Nodejs18.15` / 900 秒 | `QWEATHER_API_KEY`、`WEATHER_HOT_CITY_INGESTION_KEYS` | 未声明 `QWEATHER_API_BASE_URL` |
| `weather-ingestion-scheduler` | `Nodejs18.15` / 900 秒 | `QWEATHER_API_KEY`、`WEATHER_HOT_CITY_INGESTION_KEYS` | 未声明 `QWEATHER_API_BASE_URL` |
| `subscription-http` | `Nodejs18.15` / 30 秒 | 无微信支付键 | 下单/查单代码需要支付配置，但函数级声明不完整 |
| `subscription-notify-http` | `Nodejs18.15` / 30 秒 | `WECHAT_PAY_APPID`、`WECHAT_PAY_NOTIFY_URL` | 回调代码还需要 API v3、平台序列号、公钥；函数级声明不完整 |

这与 P-1 外部来源审计的“配置声明漂移及错误归属”一致：键名存在不等于供应商可用，也不等于密钥已在目标环境正确注入。

## 2. 三项 P0 结论总览

| P0 卡 | v2 owner | 当前可由本地证据确认的范围 | 当前仍不能冻结的合同 | 集成结论 |
|---|---|---|---|---|
| `P0-EXT-04` 百度植物识别 | `plant-knowledge` | 识别只形成候选；服务端持有 `BAIDU_AK`/`BAIDU_SK`；OAuth→组合识别→canonical match 的本地路径 | 套餐/接口配额、原始响应到三态 Schema 的正式映射、MIME/大小/SSRF、timeout/retry、幂等、单次成本/日预算、原始留存 | `INTEGRATION_STOP`：无批准账户下的成功/拒绝/额度回读 |
| `P0-EXT-05` 和风天气 | `care` | `v7` 当前/网格/预报/24h/历史路径；字段归一化与 `qweather_*` source 标签；本地缓存、D0 采样与失败回退路径 | 套餐/API 版本、freshness/缓存窗口、10 秒是否为批准合同值、调度批量预算、速率限制、时区/地点授权和告警 owner | `INTEGRATION_STOP`：无真实账户、地点授权、时区、限额和 timer 读回 |
| `P0-EXT-08` 微信支付回调 | `subscription`；合同目标为唯一 `subscription-notify-http` owner | V3 JSAPI 下单/查单路径；RSA 请求签名；回调 300 秒时间窗、RSA 验签、AES-256-GCM 解密、金额/币种/商户/付款主体校验、事务幂等 | 支付平台/商户/沙箱、线上唯一 route winner、匿名回调规则、timeout/未知结果 reconcile、费率/退款/对账和最终业务归属键 | `INTEGRATION_STOP`：两个本地 owner，无线上 winner 或 sandbox 回放 |

### 2.1 可由现有证据冻结的“子合同”与不能越过的边界

这里的“可冻结”只表示可作为本地 DTO/适配器草案或 characterization 继续推进，不表示该项已经成为完整 P0 合同或可发布能力。

| 能力 | 现有证据可以冻结/保留的子合同 | 必须用户/产品 owner 确认或真实账户确认的事项 |
|---|---|---|
| 百度 | owner 为 `plant-knowledge`；供应商结果只能形成候选/不确定/失败，不直接发布 taxonomy；客户端不得获得供应商键；当前代码的 OAuth 与组合识别路径可作为待替换适配器边界 | 百度套餐和 API 版本；正式三态响应 Schema、阈值和错误码；图片输入安全边界；请求指纹/幂等键；timeout、重试与降级；单次成本、日预算、速率/额度；批准账户的真实成功、拒绝和配额读回 |
| 和风 | `v7` 路径集合、字段归一化、来源标签、recent/day archive 单一事实方向、D0 主/网格 fallback 方向可以继续写本地合同；现有 10 秒 timeout、4 次总尝试和 10 秒间隔只能标为代码 characterization | provider 套餐/API 版本；freshness、cache/stale 窗口和时区策略；timeout/retry 数值是否正式批准；地点授权、速率/日预算、调度频率和告警 owner；真实当前/历史/预报边界及限额回读 |
| 微信支付 | V3 JSAPI endpoint 形状、RSA-SHA256 请求签名、回调头验签、300 秒时间窗、AES-GCM 解密、订单/金额/币种/付款主体核对、事务更新与重复通知返回相同结果的本地边界已有代码和 unit_fake 支撑 | 具体商户/沙箱归属、AppID/商户号绑定、唯一 callback owner 和网关匿名规则；算法/证书版本；下单 timeout 与未知结果查单；支付平台费率、退款、对账和异常订单处理；`user_id` 与支付主体的最终边界；合法/坏签名/乱序/并发/数据库失败的真实 sandbox 回放 |

因此，现阶段不能把三张 `CONTRACT_STOP` 卡改写为 `CONTRACT_GO`。本地实现里出现的数字或 endpoint 只能在对应 P0 设计值获批准后升级为合同值。

## 3. 百度植物识别（P0-EXT-04）

### 3.1 当前调用合同（源码事实）

- 配置键：`BAIDU_AK`、`BAIDU_SK`，见 `cloudfunctions/identify-http/app.js:24-25`。
- OAuth：`POST aip.baidubce.com/oauth/2.0/token`，`grant_type=client_credentials`，AK/SK 作为 query 参数，见 `app.js:132-160`。
- 组合识别：`POST aip.baidubce.com/api/v1/solution/direct/imagerecognition/combination?access_token=...`，JSON 输入 `{ imgUrl, scenes: ['plant', 'ingredient'] }`，见 `app.js:163-202`。
- 请求入口：`GET/POST /identify/plant`；先解析 HTTP 身份并要求 `userInfo.openid`，再做平台能力检查；图片字段只检查非空，见 `app.js:205-243`。
- 输出映射：`processBaiduResult` 根据 `ingredient`/`plant` 的最高分和“非植物/非果蔬食材”标记选择结果；之后调用 `findCanonicalPlantMatch`，输出 `matchedPlant`、`candidates`、`taxonomyMatchStatus`、`identityResolutionStatus` 等，见 `app.js:68-130`、`249-287`。这支持“候选不等于规范身份”的语义，但并没有批准的供应商三态 Schema。
- 当前公开响应还包含 `sessionId`、`visualCallBatchId` 等内部运行 ID（`app.js:274-287`），与 v2 公开响应不得暴露会话/追踪 ID 的要求冲突；现有 public-response 测试没有锁住这一禁止项。

### 3.2 超时、重试、幂等、费用和隐私

- `getAccessToken` 和 `recognizePlant` 均直接使用原生 `https.request`，未见 `setTimeout`、连接/读取 deadline、retry/backoff 或错误类别分流，见 `app.js:132-202`。
- `identifyId` 由时间戳和随机数生成，当前请求没有 `Idempotency-Key`、请求指纹或重复计费保护；重复请求会再次访问供应商并创建新运行记录，见 `app.js:41-43`、`249-271`。
- 没有代码/函数配置提供百度账户归属、套餐、速率限制、余额/配额、单次成本、日预算、熔断或超额降级。
- 图片 URL 直接送供应商，只做非空检查；未看到 HTTP(S) allowlist、MIME/大小校验、SSRF 防护、供应商保留期或图片访问授权边界。
- `persistIdentifyRuntimeArtifacts` 将 `_openid`、图片引用、供应商 `rawPayload`、识别名称和候选写入多张运行表，见 `cloudfunctions/layer/utils/identify-runtime.js:194-393`。这与 v2 的“原始供应商 payload/图片隔离、平台主体不得成为业务外键、公开响应脱敏”要求冲突。

### 3.3 本地测试证据

| 测试 | 层级 | 结果 | 实际覆盖 | 未覆盖 |
|---|---|---|---|---|
| `test/unit/backend/identify-http/public-response.mjs` | `unit_fake` / `source_contract` | PASS | 不把 `processed.data` 原样放入公开响应 | 百度 HTTP、图片输入安全、内部 ID 禁止、供应商额度 |
| `test/unit/backend/layer/utils/identify-runtime.mjs` | `unit_fake` | PASS | SQL nullable 绑定与六次写入序列的现状保护 | 真实 MySQL、事务、原始 payload/图片留存授权、幂等 |

结论：百度卡可继续冻结候选边界和适配器 owner，但完整本地合同与真实集成均保持 STOP。

## 4. 和风天气（P0-EXT-05）

### 4.1 当前 endpoint、输入和输出

- 配置键：`QWEATHER_API_KEY`、可选 `QWEATHER_API_BASE_URL`；默认 base URL 为 `https://n773jqqeap.re.qweatherapi.com`，见 `cloudfunctions/weather-http/adapters/qweather-adapter.js:6-10`、`135-140` 和 `weather-http/app.js:46-49`。
- 当前适配器路径：
  - `/geo/v2/city/lookup`：经纬度定位到 QWeather location ID；
  - `/v7/weather/now`、`/v7/grid-weather/now`：当前/网格当前；
  - `/v7/weather/15d`、`/v7/weather/10d`：预报；
  - `/v7/weather/24h`：24 小时；
  - `/v7/historical/weather`：按 location ID 和 `YYYYMMDD` 查询历史。
- 输入位置由 `normalizeQWeatherLocation` 归一化；历史查询在缺 location ID 时先做地理反查，见 `qweather-adapter.js:171-197`、`249-257`。
- 输出只保留归一化字段（温度、湿度、降水、风、能见度、云量、观测时间等）并写入 `qweather_*` source 标签，见 `qweather-adapter.js:50-131`。
- `weather-http` 的诊断模式优先读取 recent-10d/day archive，环境模式只预取未来预报；见 `cloudfunctions/weather-http/app.js:291-361`。这支持“同日避免第二套历史事实”的方向，但不构成目标存储和 freshness 的真实读回。

### 4.2 超时、重试、缓存、调度和日志

- 适配器默认 `timeout=10000`，每次 `axios.get` 将 API key 放入 query 参数；适配器本身没有 retry/backoff，见 `qweather-adapter.js:135-168`。
- D0 观测层在适配器外执行 `retryCount=3`、`retryIntervalMs=10000`，即主路径最多 4 次，失败后网格 fallback 最多 4 次，见 `cloudfunctions/weather-http/services/now-sample-weather-observation.js:3-39`、`81-130`。测试确认该逻辑，但这是当前代码值，不是已批准的供应商成本合同。
- 地理 ID 有进程内 Promise cache；天气 recent/day archive 通过 CloudBase Storage/缓存服务读取和生成。代码可证明缓存路径和缺失降级，不能证明云端对象、缓存命中率、stale 窗口、限流或费用。
- scheduler 本地 `config.json` 声明 8 个 timer：recent-10d 每 6 小时，以及 D0 日间/日落采样和 21:30 finalize；见 `cloudfunctions/weather-ingestion-scheduler/config.json:2-42`。这不是云端 timer 读回。
- `/weather/current` 仍把 query、body、resolvedPayload 打到日志，见 `cloudfunctions/weather-http/app.js:404-423`；`node scripts/qa/check-sensitive-logs.mjs --report-only` 当前返回一项 `request_body` finding（`app.js:412`）。
- 当前 `cloudbaserc.json` 函数 timeout 为 900 秒，但没有 provider 级连接/读取/总 deadline、速率限制、日预算或告警 owner 合同。

### 4.3 本地测试证据

| 测试 | 层级 | 结果 | 实际覆盖 | 未覆盖 |
|---|---|---|---|---|
| `weather-http/services/now-sample-retry-fallback.mjs` | `unit_fake` | PASS | 主/网格 fallback、每条链最多 4 次、10 秒 sleep、missing sample 隔离 | 真实 QWeather timeout、费用、配额、HTTP 错误类别 |
| `weather-http/services/weather-history-cache.mjs` | `unit_fake` | PASS | recent/day archive 路径、缓存缺失/读取超时、sourceKind、fake adapter 映射 | 真实 Storage、账户/地点授权、历史接口和 freshness |
| `weather-http/services/weather-environment-context.mjs` | `unit_fake` | PASS | 历史/预报窗口拼接、source 标签、adapter 字段归一化 | 真实预报/历史边界、时区和 provider 限额 |
| `weather-ingestion-scheduler/services/season-trigger-sync.mjs` | `unit_fake` | BLOCKED_ENV | 未能进入断言 | 当前环境缺少已声明依赖 `suncalc`，没有安装或修改依赖 |

结论：天气字段映射、缓存状态机和本地 fallback 可以继续形成合同草案；provider 套餐、freshness、预算和真实 timer/Storage 仍不能冻结，集成保持 STOP。

## 5. 微信支付（P0-EXT-08）

### 5.1 配置键名和当前函数归属

支付代码识别的键名仅列名如下：

```text
WECHAT_PAY_APPID / WECHAT_PAY_APP_ID
WECHAT_PAY_MCHID / WECHAT_PAY_MERCHANT_ID
WECHAT_PAY_MERCHANT_SERIAL_NO / WECHAT_PAY_SERIAL_NO
WECHAT_PAY_MERCHANT_PRIVATE_KEY_BASE64 / WECHAT_PAY_MERCHANT_PRIVATE_KEY
WECHAT_PAY_API_V3_KEY
WECHAT_PAY_PLATFORM_SERIAL_NO / WECHAT_PAY_PLATFORM_SERIAL
WECHAT_PAY_PLATFORM_PUBLIC_KEY_BASE64 / WECHAT_PAY_PLATFORM_PUBLIC_KEY
WECHAT_PAY_NOTIFY_URL
WECHAT_PAY_API_BASE_URL
WECHAT_PAY_SUBSCRIPTION_PLANS_JSON / SUBSCRIPTION_PLANS_JSON
```

`subscription-http/config.js:162-183` 读取下单/查单与回调所需配置；`subscription-notify-http/app.js:56-68` 只读取回调验签/解密配置。当前 root 配置投影把 `WECHAT_PAY_APPID`、`WECHAT_PAY_NOTIFY_URL` 放在 `identify-http` 与 `subscription-notify-http`，却没有向 `subscription-http` 声明完整支付键，也没有向 notify 函数声明 API v3/平台公钥等完整键。因此本地键名存在不能证明目标函数可启动或商户配置完整。

### 5.2 下单、查单和客户端输出

- 下单 endpoint：`POST https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi`；查单 endpoint：`GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid=...`，见 `cloudfunctions/subscription-http/wechat-pay.js:6-8`、`65-159`。
- 请求使用 `WECHATPAY2-SHA256-RSA2048` 商户私钥签名，JSAPI body 含 `appid`、`mchid`、描述、商户订单号、回调地址、分、币种和 payer openid，见 `wechat-pay.js:18-22`、`65-106`。
- `/subscription/orders` 要求登录和平台能力；POST body 接受 `planId` 与 `clientRequestId`，由服务端读取套餐并解析微信 payer openid，见 `subscription-http/app.js:265-325`。
- 成功响应含公开订单和小程序支付参数 `appId`、`timeStamp`、`nonceStr`、`package`、`signType`、`paySign`；`publicOrder` 会剥离 `openid`，见 `subscription-http/app.js:62-84`、`354-363`。
- GET 查单只对 `prepay_created` 订单执行 reconcile；未知的统一下单响应没有在同一请求中先查单再恢复，代码将异常标记为 `prepay_failed`，见 `subscription-http/app.js:143-180`、`327-345`。因此“未知下单结果先查单、禁止盲重试”尚未形成完整实现合同。

### 5.3 回调验签、解密、金额核对和幂等

- 两个函数都声明 `/subscription/notify`：
  - `cloudfunctions/subscription-http/cloudbase-functions.json:9-24`；
  - `cloudfunctions/subscription-notify-http/cloudbase-functions.json:9-14`。
- `subscription-http/app.js:216-263` 和 `subscription-notify-http/app.js:329-366` 都接受 POST，先读取原始 body、验 `Wechatpay-Serial/Signature/Timestamp/Nonce`，时间窗口均为 300 秒，再做 AES-256-GCM 解密并进入订单事务。
- `subscription-http/wechat-pay.js:188-247` 明确使用 RSA-SHA256 验签和 AES-256-GCM；notify 版本有等价本地实现，见 `subscription-notify-http/app.js:101-143`。
- 成功回调在事务内按 `out_trade_no` 加锁，核对 `appid`、`mchid`、金额、币种、payer openid 与交易号，再更新订单和用户权益；重复已支付订单返回同一结果，见 `subscription-http/subscription-service.js:274-365` 与 `subscription-notify-http/app.js:159-251`。
- DDL 为 `out_trade_no` 唯一、`(_openid, client_request_id)` 唯一，并保存回调原文摘要 `notify_body_sha256`，见 `scripts/sql/ensure-subscription-orders-table-20260830.sql:4-31`。但 v2 规定业务关系以 `user_id` 为唯一用户归属键；当前 DDL 仍把 `_openid` 作为幂等唯一键组成部分，且业务代码兼容 `_openid` 回退，不能视为 v2 身份合同已闭合。
- 回调公开响应只返回 `SUCCESS/FAIL` 或中性错误；代码没有证据证明真实网关匿名规则、支付平台通知重放、数据库失败后的重放和线上路由选择。

### 5.4 超时、重试、费用和本地测试

- `requestHttpsJson` 使用原生 `https.request`，未设置连接/读取/总 timeout；下单、查单均无 retry/backoff，见 `wechat-pay.js:24-63`、`95-159`。
- 没有微信费率、沙箱/生产归属、退款、对账、异常订单告警或额度证据。默认套餐和金额只属于当前代码配置，不是用户确认的商业合同。
- 本地测试结果：

| 测试 | 层级 | 结果 | 实际覆盖 | 未覆盖 |
|---|---|---|---|---|
| `subscription-http/config.mjs` | `unit_fake` | PASS | 套餐和键名解析、PEM/API v3/notify URL 格式门、DDL 形状 | 目标环境配置、商户绑定、真实金额/费率 |
| `subscription-http/wechat-pay.mjs` | `unit_fake` | PASS | 假请求、RSA 签名参数、查单映射、回调验签和 AES 解密 | 微信真实 API、证书、沙箱 |
| `subscription-http/subscription-service.mjs` | `unit_fake` | PASS | 假 SQL 事务、clientRequestId、订单/权益重复回调幂等 | 真实 MySQL 事务、并发/乱序/故障恢复 |
| `subscription-http/app.mjs` | `unit_fake` | PASS | health/plans/orders 路由和免费方案/幂等号校验 | 真实身份、支付路由、回调、查单 |
| `subscription-notify-http/app.mjs` | `source_contract` | PASS | 源码含 user_id/payer 校验且不直接按 `_openid` 查用户的静态门 | 可执行真实回调、单 owner、sandbox |

结论：支付本地验签、解密、金额/订单核对与事务幂等子合同可继续作为草案；但双 owner、商户/沙箱、费用/退款/对账、未知结果处理和 v2 `user_id` 归属未闭合，不能升级 `CONTRACT_GO` 或 `INTEGRATION_GO`。

## 6. 静态检查和总体未验证项

本轮实际执行：

```text
node docs/backend-v2/verify-entrypoint.mjs                         PASS
node docs/backend-v2/audits/P0-external-capability-cards-z8v0kmr9dv.verify.mjs  PASS（结构门）
node scripts/security/check-no-secrets.mjs                         PASS（仅 tracked 文件）
node scripts/qa/check-sensitive-logs.mjs --report-only              FINDINGS：weather-http/app.js:412 request_body
```

下列内容仍明确未验证：

1. 百度真实图片成功/拒绝、账户套餐、额度、费用、超时和候选审核隔离。
2. 和风真实当前/历史/预报边界、location/timezone、缓存 freshness、账户限额、费用和 scheduler 云端 timer。
3. 微信支付 sandbox 合法/坏签名/旧 timestamp/错误 serial/错误密文/错误商户/金额币种不符/未知订单/重复并发通知/数据库失败重放。
4. `/subscription/notify` 线上唯一 route winner、匿名访问规则和非 owner 函数的拒绝行为。
5. 三项能力的供应商原始 payload、图片、平台主体、日志和留存授权；当前百度 raw/image/OpenID 与天气 request body 仍是已发现风险。
6. 目标环境 Node.js 22、v2 `/api/v2` 路由和真实 CloudBase/MySQL 事务；当前函数配置仍是 Node.js 18.15。

## 7. 后续关闭条件（不在本轮执行）

### 用户/产品 owner 必须确认

- 百度：API 产品/套餐、正式输入输出 Schema、候选阈值、图片安全边界、重试/幂等、费用上限与告警 owner。
- 和风：API 版本/套餐、freshness 与缓存窗口、timeout/retry 数值、地点及时区授权、批量/日预算、限流和告警 owner。
- 微信支付：平台与商户/沙箱、唯一 callback owner、验签/解密算法与证书版本、金额/币种/退款/对账规则、未知下单 reconcile 和 v2 `user_id` 归属。

### 真实账户/沙箱必须提供

- 百度：脱敏成功、拒绝、额度/错误码和结果哈希。
- 和风：真实地点下当前/历史/预报与时区新鲜度、缓存命中/失效、限额和延迟回读。
- 微信支付：合法及负向通知、重复/并发/乱序、数据库失败后重放、下单未知结果查单，以及线上唯一 route winner 的只读证明。

每次真实回放只保留 provider、operation、endpoint_host、API/model 版本、脱敏请求指纹、状态类别、provider 错误码、latency、timeout、retry、quota/cost class、cache_hit、结果哈希和读回时间；不得保存凭证、完整 URL query、私图 URL、Prompt、原始模型/支付响应或平台主体。

## 8. 交付产物和可复现性

- 报告：`docs/backend-v2/audits/P0-provider-contract-local-audit.md`。
- SHA-256 sidecar：`docs/backend-v2/audits/P0-provider-contract-local-audit.sha256`。
- heartbeat：`docs/backend-v2/tracker/heartbeats/p0-provider-contract-local-audit.json`。
- sidecar 只列报告和不含凭证值的源/配置/测试快照；不列 `.env.local` 内容或值。
- 复验命令：

```bash
sha256sum -c docs/backend-v2/audits/P0-provider-contract-local-audit.sha256
```

最终判定：已有证据足以冻结三项能力的部分适配器边界和失败隔离方向，但不足以关闭任一张 P0 provider contract card；真实集成仍必须等待用户/产品参数确认和受控账户/沙箱证据。
