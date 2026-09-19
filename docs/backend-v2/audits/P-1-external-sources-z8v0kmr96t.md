# P-1 外部供应商、来源和回调边界审计

> ticket：`z8v0kmr96t`  
> 审计日期：2026-09-19（Asia/Shanghai）  
> 审计代理：`p1_external_close_luna`  
> 状态：`STATIC_COMPLETE + READBACK_LIMITED`；不构成供应商上线、支付上线或删除批准

## 0. 结论先行

1. 本次已经按后端 v2 唯一入口和最小上下文完成了百度植物识别、和风天气、CloudBase AI/阿里云百炼/TokenHub/混元、微信支付、微信/抖音/小红书平台身份来源的调用者、配置键、输入输出、失败/超时/重试、数据落点和 v2 owner 盘点。
2. `P-1-cloudbase-live-readback` 只证明 CloudBase 环境中脱敏后的配置**键名**存在以及函数/网关可读；不证明任何变量值正确、供应商账户可用、额度充足、价格可接受、真实请求成功或线上路由最终命中。此次没有发起供应商真实/沙箱请求，也没有登录、部署、写云、DDL、回调重放或删除。
3. 最大的边界阻断是微信支付回调存在两个本地 owner：`subscription-http` 和 `subscription-notify-http` 都声明 `/subscription/notify`。现有活动合同要求只由 `subscription-notify-http` 接收匿名回调，但当前代码与本地函数路由清单尚未证明线上唯一 owner。不得删除任一函数，直到完成路由只读回读、单 owner 固化和支付沙箱回放。
4. 代码中已经存在三类需要纳入 P-1 风险结论的脱敏缺口：
   - 视觉诊断成功追踪会打印 prompt 和原始模型返回（`visual-model-success-trace.js`）；
   - 盆土视觉调试响应在请求头门控下仍可返回完整 prompt、模型返回和用量；
   - 天气路由在 `weather-http/app.js:412` 打印请求体，敏感日志检查因此保留 1 项发现。
   这些事实与 v2 的“公开响应、日志不得包含 Prompt、原始模型响应、平台主体标识或凭证”合同冲突，不能以“开发调试”自动豁免。
5. 当前 `cloudbaserc.json` 为未跟踪文件，存在非空的外部供应商/支付相关配置；其中支付键还出现在 `identify-http` 这一非支付函数。`check-no-secrets` 的通过只表示 tracked 文件扫描没有发现明文凭证，不能清除未跟踪工作区配置风险。本报告只记录键名和存在性，不记录任何值；不执行轮换或删除。
6. 资产处置建议保持保守：识别、天气、AI 和平台身份适配器均为 `TRANSFORM；KEEP`；订阅主函数 `MERGE；KEEP`；重复支付回调 `MERGE；ARCHIVE → DELETE`，但必须满足单 owner、真实签名/解密/幂等/失败恢复和观察窗口条件。现阶段没有任何外部资产可仅凭静态证据标记 `DELETE`。

## 1. 范围、入口与证据分级

### 1.1 唯一入口和授权边界

- 首先读取并核验 `docs/backend-v2/README.md`；`node docs/backend-v2/verify-entrypoint.mjs` 通过，入口 2111 行，SHA-256 为 `e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428`。
- 继续读取 `BASELINE.lock`、阶段索引、`P-1-audit.md`、`P1-contracts-identity-foundation.md`、六域基础设施说明、业务到技术映射、HTTP 函数合同、可观测性、脱敏合同和遗留处置规则；未全量展开历史 docs、旧迁移材料或 OpenViking。
- 只读本地代码、函数路由/配置键名和既有 `P-1-cloudbase-live-readback`。没有调用 ClickUp connector，没有使用浏览器代写，没有读取或输出凭证值，没有云端写入、部署、DDL、迁移、权限变更、支付回调重放或资源删除。
- 当前 CloudBase live-readback 证据采集时间为 2026-09-19 22:33—22:40（Asia/Shanghai），环境和地域均以该制品为准；本审计不重新登录或刷新云端状态。

### 1.2 证据等级

| 等级 | 含义 | 本报告用途 |
|---|---|---|
| S1 | 当前仓库源码、路由、配置键名、测试和 package scripts | 证明调用路径、静态边界和现状；不能证明线上运行 |
| S2 | `P-1-cloudbase-live-readback.md` 脱敏实时只读回读 | 证明函数/网关/配置键名/运行时等云端事实；不证明值、额度或真实供应商成功 |
| S3 | `unit_fake`、`unit_logic`、`source_contract` | 证明本地规范化、签名/解密、响应脱敏或 SQL 形状；不能替代真实供应商/CloudBase/设备 |
| S4 | 真实供应商或沙箱请求、失败恢复、费用/额度、线上路由回放 | 本次未取得；是后续阶段的关闭门槛 |

本次的结论组合为 S1+S2+S3。凡表中标注“未证实”的项，不得写成“已接通”“已验收”或“可删除”。

## 2. 外部来源注册表

配置列只列键名，不列值。请求/响应摘要只记录当前代码事实，不把供应商返回内容当作 v2 规范事实。

| 外部来源 | 当前调用者与入口 | 配置键存在性 | 失败、超时、重试与成本边界 | 来源/数据边界 | v2 owner 与处置 |
|---|---|---|---|---|---|
| 百度植物识别 | `identify-http:/identify/plant`；先取 OAuth token，再调用图像组合识别 | 代码读取 `BAIDU_AK`、`BAIDU_SK`；live-readback 仅报告百度相关键名存在；本地 root 配置未声明这两个键 | 两次原生 `https.request` 未见显式 timeout；未见 retry/backoff；失败只转通用 500；未见供应商配额、单次成本、预算或熔断合同 | `imageUrl` 直接送供应商；只检查非空，未形成 HTTP(S)、大小、MIME、SSRF（服务端请求伪造）边界；结果再经 canonical match，定位为候选而非规范身份；`rawPayload`、图片引用、OpenID 旧字段会写运行记录 | `plant-knowledge`；`TRANSFORM；KEEP`。保留适配器，隔离供应商原始响应、权威身份和发布集；真实图片/归属/保留策略完成前不得迁移或删记录 |
| 和风天气 | `weather-http` 当前/近期/环境/24h/热点城市；`weather-ingestion-scheduler` 定时近期和 D0 采集 | 代码读取 `QWEATHER_API_KEY`、可选 `QWEATHER_API_BASE_URL`；live-readback 报告和风相关键名存在；本地 root 配置在 weather HTTP 与 scheduler 有键名 | axios adapter 默认 10 秒 timeout；adapter 未重试，但上层有缓存、失败回退和 D0/recent 采集策略；未见账户套餐、调用量、费用上限或配额回读；scheduler 说明不调用管理面写 timer | 适配器给当前/网格/预测/历史数据打 `qweather_*` source 标签；诊断/环境窗口优先读取统一 recent/day archive，避免同日两套事实；scheduler 是 care 内部定时器，不是公开回调 | `care`；`TRANSFORM；KEEP`。保留天气 adapter、缓存和 scheduler，补供应商预算、窗口一致性、失败恢复和日志脱敏；`weather-http:412` 请求体日志需先收敛 |
| CloudBase AI HTTP | `diagnose-http` provider registry 的 `cloudbase`；视觉/诊断 HTTP OpenAI 兼容路径 | 代码接受 `CLOUDBASE_AI_API_KEY` 或 `CLOUDBASE_AI_ACCESS_TOKEN`，及 `LLM_CLOUDBASE_AI_BASE_URL/MODEL`；live-readback 仅报告 CloudBase AI、模型、身份票据/会话键名存在；本地 root 配置未声明 LLM 凭证 | 默认请求 timeout 45 秒；OpenAI 兼容 adapter 未见 retry/fallback；CloudBase 匿名 sign-in 有设备标识和 token 缓存；未见供应商费用、模型单价、额度预占/回滚和熔断证据 | 输出只应是 diagnosis 建议；prompt、原始输出和供应商 token 只能留在受控内部审计边界；当前 trace/debug 实现仍有日志/公开 debug 风险 | `diagnosis`（小青仍走 CloudBase Agent，不新增小青 HTTP 函数）；`TRANSFORM；KEEP`。冻结 provider/模型/提示词版本和脱敏合同后再做真实回放 |
| 阿里云百炼（含 CloudBase custom gateway） | `diagnose-http` provider `aliyun_bailian` / alias `aliyun-bailian-custom`；兼容 `/chat/completions` | 接受 `LLM_ALIYUN_BAILIAN_API_KEY` 或 `DASHSCOPE_API_KEY`，及 `LLM_ALIYUN_BAILIAN_BASE_URL/MODEL`；live-readback 只证明 CloudBase AI/模型类键名，未证明百炼值和账号 | 默认 45 秒；未见 OpenAI adapter retry；代码有显式 prompt cache 合同与 token usage 记录；未见百炼账户、缓存计费、配额、成本告警或失败回放 | 图片 URL 由视觉消息构造器限制为 HTTP(S)，但不等于供应商数据许可/保留合同；原始模型返回不能成为公开诊断事实 | `diagnosis`；`TRANSFORM；KEEP`。供应商只作为模型适配器，保留模型版本/请求指纹/耗时等脱敏元数据，不持久化或日志输出原文 |
| TokenHub | `diagnose-http` provider `tokenhub`，固定 OpenAI 兼容端点 | 读取 `TOKENHUB_API_KEY`、`LLM_TOKENHUB_MODEL`；`.env.local` 键名存在性曾被本地盘点但不纳入云端成功证明；live-readback 未证明值 | 默认 45 秒；未见 retry；支持 prompt cache key；未见套餐、配额、费用或跨租户隔离回读 | 与百炼相同，仅允许受控诊断建议；供应商原始响应不得进入公开响应、日志或 v2 Expected | `diagnosis`；`TRANSFORM；KEEP`，待明确是否保留为正式 fallback，不能因代码注册即视作可用 |
| 腾讯混元 SDK | `diagnose-http/utils/llm.js` 的模型/视觉 fallback | 读取 `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY` 等腾讯凭证键名；live-readback 未证明混元账号/值 | 代码存在最多 4 次 retry 的可重试错误分支和约 45 秒流式超时；未见统一供应商预算、成本、重试计费保护和未知结果补偿 | 输出仍是诊断建议；需与 OpenAI 兼容 provider 共享相同提示词、原始响应和日志红线 | `diagnosis`；`TRANSFORM；KEEP`，作为明确批准的 fallback；在 provider 选择和额度合同冻结前不纳入上线承诺 |
| 微信支付 V3 API | `subscription-http:/subscription/orders` 下单和订单查询；内部使用 `payer_openid` 仅作 JSAPI/回调校验 | 代码需要 appId、mchId、商户序列号/私钥、API v3 key、平台序列号/公钥、notify URL 等；live-readback 报告两支付函数存在相应键名；本地 root 只出现部分键名，且支付键被错误放入 `identify-http` 与 notify 函数 | 原生 `https.request` 未见显式 timeout；未见下单/查询重试和未知结果 reconcile 合同；订单 clientRequestId 有幂等；回调签名含 serial、时间窗和 AES-GCM 解密；未见微信费率、额度、退款/对账证据 | 支付属于微信小程序；抖音/小红书不得进入支付链路；统一业务归属应是 `user_id`，`payer_openid` 只能在身份适配/支付边界使用，不得成为 v2 业务外键 | `subscription`；主订单函数 `MERGE；KEEP`。补充 timeout、未知结果查询、sandbox 回放、金额/币种/商户校验和对账 |
| 微信支付回调 | 本地 `subscription-http` 和 `subscription-notify-http` 都声明 `/subscription/notify`；两者代码均可验证签名、解密和事务幂等 | live-readback 只证明两函数的微信支付 V3 键名存在；没有线上路由 winner、匿名访问规则和实际通知回放证据 | 两套实现都有 300 秒时间窗、序列号/签名校验、AES-GCM 解密和事务处理；重复通知可幂等；双 owner 使失败恢复和安全规则不可唯一判定 | 回调必须先验签/解密，再核对商户、金额、币种、订单、付款主体，最后以事务更新；公开响应只返回 `SUCCESS/FAIL`，日志不得打印原始 body/主体标识 | `subscription`；`subscription-notify-http` 是活动合同建议的唯一 owner；当前重复函数 `MERGE；ARCHIVE → DELETE`，单 owner 与沙箱回放前不可删 |
| 微信/抖音/小红书平台身份 | `wechat-phone`、`platform-phone-bootstrap-http`、共享 `platform-phone-verifiers`；是服务端向平台发起授权校验，不是业务 webhook | 代码读取 `WECHAT_MINIPROGRAM_APP_SECRET`、`DOUYIN_APP_SECRET`、抖音私钥、`XHS_APP_SECRET` 等；本地 per-function root 配置未完整声明；live-readback 未证明这些值或平台可用 | 使用全局 `fetch`，未见显式 timeout/retry；抖音 client token 有进程缓存；有平台身份/水印/手机号 proof 校验；未见平台调用额度、服务条款和失败恢复回读 | 平台主体先在 `identity` 解析为 `user_id`；客户端不能提交 openid/平台主体字段；手机号输出脱敏；不能让 platform subject 成为业务主键 | `identity`；`TRANSFORM；KEEP`。补多平台真实授权、解绑拒绝访问、超时/重试/审计及统一 user_id 读回；无 inbound callback 可供支付 owner 混用 |

## 3. 来源、输出和回调边界

### 3.1 允许的来源语义

| 外部返回 | 可以形成的内部事实 | 不可以形成的事实 |
|---|---|---|
| 百度识别名称/置信度 | 植物身份候选、待复核证据、候选匹配提示 | 已批准的 v2 植物 taxonomy、用户植物、养护事实 |
| 和风天气当前/预测/历史 | `care` 天气窗口、带 source 的环境证据、采集失败状态 | 诊断结果本身；绕过 recent/day archive 的第二套天气事实 |
| AI/百炼/TokenHub/混元文本 | `diagnosis` 建议、可审计的脱敏模型调用元数据 | 养护事件、提醒、会员权益、最终植物身份；这些必须由受控领域用例和用户确认产生 |
| 微信支付通知 | 经验签、解密、商户/金额/币种/付款主体核对后的支付事实 | 客户端提交的 userId/openid、未经验签的订单状态、重复通知产生的重复权益 |
| 微信/抖音/小红书授权证明 | 平台身份绑定、手机号 proof、统一 `user_id` 解析 | 将 openid/平台主体直接写成业务主键或跨域外键 |

### 3.2 回调和公网入口矩阵

| 入口/通道 | 类型 | 当前 owner 事实 | 边界结论 |
|---|---|---|---|
| `/subscription/notify` | 微信支付 inbound callback | 两个本地函数配置均声明；两份代码均有处理器；活动合同只指定 `subscription-notify-http` | P-1 高风险；必须只保留一个网关 owner，并为该 owner 建匿名规则，其他路由维持应用鉴权；完成前不得删/改线上资源 |
| `/subscription/orders` | 微信支付 outbound API + 用户订单 | `subscription-http`，需要用户身份/平台能力判断 | 保持登录和 user_id 归属；客户端只提交套餐标识与幂等号；支付凭证不进入公开响应以外的范围 |
| `wechat-phone` | 平台授权 outbound | CloudBase 受保护调用，向微信换 session/token/手机号 | 属于 `identity` proof，不是 callback；必须加 timeout/失败恢复和主体一致性回读 |
| `platform-phone-bootstrap` | 平台授权 HTTP bootstrap | 接收凭据，统一绑定 user/session | 不接受客户端主体字段；统一 `user_id` 后才能进入业务；当前 live/真实平台闭环未证实 |
| `weather-ingestion-scheduler` | timer outbound | 无 HTTP route；触发和风读取、缓存/对象落点 | 属于 `care` 的内部定时器；不应借管理 API 改 timer；必须有重复执行、失败恢复和费用上限 |
| `diagnose-http` AI provider | outbound model/SSE | provider registry 决定目标供应商 | 供应商调用元数据需脱敏；模型原文不能返回或日志化；CloudBase Agent 的 signed internal API 另行受控，不新增小青 HTTP owner |
| `identify-http` 百度 | outbound recognition | `/identify/plant` | 输入图片 URL 必须完成请求类型、大小、MIME、SSRF、存储授权和供应商数据保留边界；识别不等于身份发布 |

CloudBase live-readback 还显示平台级 HTTP 网关访问鉴权关闭。因此“公网路由可达”不能当作安全证据，必须以函数层的身份、user_id、user_plant_id、内部签名、支付回调签名和防刷合同承担边界。

## 4. 已发现问题与风险分级

### P1-EXT-01：支付回调双 owner（P1，发布/删除阻断）

- 证据：两个独立 `cloudbase-functions.json` 都声明 `/subscription/notify`；`subscription-http/app.js` 也在同一路径执行回调处理；`subscription-notify-http/app.js` 另有一套处理器。
- 影响：线上路由选择、匿名访问规则、签名失败响应、幂等表和失败恢复没有唯一解释；重复 owner 还会让删除任一函数变成潜在支付丢单或重复入账风险。
- 处置：先只读回读线上 route winner 和访问规则；冻结唯一 owner 为 `subscription-notify-http` 的合同；用脱敏 sandbox 通知完成签名、过期、错误商户、金额/币种、重复通知、未知数据库失败和重试回放；观察窗口结束后再 archive，满足调用方为零、回退制品完整、删除后 404/回调拒绝验证，才允许删除。

### P1-EXT-02：模型 prompt/原始响应和天气请求体的日志/响应红线（P1，发布阻断）

- `visual-model-success-trace.js:157-159,224-232` 将 `prompt_input`、`model_return` 和业务解析数据写日志；这与 `docs/backend-v2/implementation/observability.md`、`testing/security-redaction.md` 的明确禁止项冲突。
- `watering-soil-visual-service.js:300-309,372-374` 在 `debugAudit` 为真时返回完整 prompt、token 用量和模型原文；`app/http-router.js:103-110,243-247` 仅依赖可伪造请求头识别开发调试，不是身份/环境级安全门。
- `weather-http/app.js:412-417` 打印 query/body/resolvedPayload；当前 `check-sensitive-logs --report-only` 返回 1 项 `request_body` 发现。
- 处置：改为只记录 provider/model、脱敏请求指纹、耗时、重试次数、状态、token 数量、缓存命中和内部审计哈希；debug 数据必须在不可伪造的开发身份/环境门内，默认关闭且不能通过公网 header 开启；删除原文日志/公开响应后补负向测试。此审计不直接改代码。

### P1-EXT-03：外部请求的超时/重试/未知结果合同不完整（P1，高可用和费用风险）

- 百度两次原生 HTTPS 请求未见 timeout/retry；微信支付原生 HTTPS 下单/查询未见 timeout；微信、抖音、XHS `fetch` 未见 timeout/retry。
- 和风天气有 10 秒 axios timeout，Hunyuan 有有限重试，但这些策略没有统一纳入供应商级费用、幂等、熔断和可观测合同。
- 支付下单出现“请求已到供应商但响应未知”时，盲目重试可能重复下单；必须采用 clientRequestId + 查询 reconcile，而不是通用 retry。
- 处置：每个 adapter 冻结连接/读取 timeout、可重试错误、最大尝试、退避、请求指纹和未知结果路径；支付禁止不安全重试，先查询并由订单幂等状态恢复；真实 sandbox 才能关闭该风险。

### P1-EXT-04：配置声明漂移及错误归属（P1，密钥治理风险）

- 未跟踪 `cloudbaserc.json` 的安全盘点只输出键名和长度：weather HTTP/scheduler 有和风相关键名；`identify-http` 出现微信支付 appId/notify URL；`subscription-notify-http` 也有部分支付键名；必需的完整支付材料并未在该本地 root 配置中形成完整声明。
- `.env.local` 同样是未跟踪文件，存在多类数据库、CloudBase、模型、微信、抖音和手机号授权键名；其值未写入本报告或任何 manifest。tracked-secret 检查通过的含义仅限 tracked 文件。
- 处置：把 secret manager/CloudBase env 的键名、函数 owner、环境、轮换责任和回退规则纳入配置合同；从非支付函数移除支付配置声明；在用户明确授权下另行做密钥轮换，当前审计不删除或改写本地文件。

### P1-EXT-05：原始供应商 payload、图片和平台主体的留存边界未闭合（P1，隐私/来源风险）

- `identify-http` 把百度 `rawPayload`、图片 URL、provider 和旧 `_openid` 相关字段写入 `identify_sessions`、`visual_raw_image_records` 等运行表。
- 订阅服务仍在内部表/查询中使用 `_openid`、`payer_openid`；当前公开订单会剥离部分字段，但 v2 合同要求业务关系以 `user_id` 为唯一归属键，平台主体只能停留在 identity/payment adapter 边界。
- 当前未取得供应商原始图像/模型响应的授权、留存期限、访问审计、删除回退和跨境/地域条款证据。
- 处置：按 source/provider/retention 分类；原始响应默认隔离、最短留存、权限最小化和哈希化；v2 DTO/Repository 只暴露 `user_id`、候选和脱敏证据，不能把历史 `_openid` 直接迁为业务关系。

### P1-EXT-06：实时供应商成功、额度、价格和账户关系未证实（P1，验收阻断）

- live-readback 只证明键名/函数/网关等云端只读事实；没有任何供应商 2xx/错误回放、账户归属、余额/配额、模型价格、缓存计费、微信支付 sandbox 交易或平台手机号授权闭环。
- 单测是 `unit_fake`、`unit_logic` 或 `source_contract`，不能用模拟 HTTP 200、假签名或假 SQL 代替真实边界。
- 处置：后续由主代理在明确授权和安全环境中逐供应商执行最小真实/沙箱合同，报告只记录脱敏 status、latency、timeout、retry、quota/cost 元数据及回放哈希；不记录凭证、原始 prompt、模型原文、手机号、OpenID 或支付敏感字段。

### P1-EXT-07：v2 Node.js 22 运行目标没有形成外部依赖闭环（P1，发布阻断）

- live-readback 仍见 Node.js 18/20；v2 默认目标 Node.js 22 尚无构建、启动、路由、adapter 和依赖矩阵证据。
- 当前 root `cloudbaserc.json` 的相关函数仍是 Node.js 18.15。此事实不能由供应商单测或键名存在替代。
- 处置：在不带真实凭证的 staging 中完成 Node.js 22 可重建包、启动/health/readiness、TLS/timeout、HTTP 合同和敏感扫描；切换前保留可回退版本。

## 5. 资产处置矩阵

| 资产 | v2 owner | 处置 | 当前 Expected 来源 | archive/delete 前置条件 |
|---|---|---|---|---|
| `identify-http` + Baidu adapter | `plant-knowledge` | `TRANSFORM；KEEP` | 六域基础设施、业务到技术映射、P-1 外部来源合同 | 图片输入边界、供应商适配器合同、权威 identity release、真实图片/归属读回、原始留存策略 |
| `weather-http` | `care` | `TRANSFORM；KEEP` | 六域基础设施、P4 care/diagnosis、天气代码 characterization | recent/day archive 单一事实、供应商预算、失败/重试/缓存回放、请求日志脱敏、真实窗口读回 |
| `weather-ingestion-scheduler` | `care` | `TRANSFORM；KEEP` | P2/P4、定时器代码和 live-readback | 线上 timer 读回、重复执行、失败恢复、对象/缓存读回、调用量/成本门 |
| `diagnose-http` provider registry（CloudBase AI、百炼、TokenHub、混元） | `diagnosis`；小青为 CloudBase Agent | `TRANSFORM；KEEP` | P4、业务到技术映射、AI provider source contract | provider/model/提示词冻结、公开/日志脱敏、quota/cost、真实视觉/文本回放、Agent signed API 不跨域 |
| `subscription-http` | `subscription` | `MERGE；KEEP` | 活动支付合同、六域基础设施、P6 清理门 | 订单/权益/AI quota owner 冻结、user_id 归属、支付查询 reconcile、sandbox 交易和观察窗口 |
| `subscription-notify-http` | `subscription` | `MERGE；KEEP`（目标唯一回调 owner） | 活动支付合同、回调代码和安全合同 | 线上 route winner、匿名访问规则、签名/解密/幂等/失败回放、仅一个 owner |
| `subscription-http` 内重复 `/subscription/notify` handler | `subscription` | `MERGE；ARCHIVE → DELETE` | P-1 遗留处置、活动支付合同 | 单 owner 已读回、客户端/供应商无调用、回退和通知重放制品、观察窗口 |
| `wechat-phone`、平台 phone verifiers、bootstrap | `identity` | `TRANSFORM；KEEP` | identity foundation、活动平台登录合同 | 三平台授权/冲突/解绑拒绝访问、user_id 读回、timeout/retry、脱敏和 session 撤销 |
| 旧 payment 配置/函数和未映射外部键 | `subscription` 或隔离区 | `QUARANTINE；ARCHIVE → DELETE` 候选 | legacy disposition、P6 cleanup | 动态调用/网关流量为零，替代 owner 真实闭环，secret manager 迁移和删除后验证；当前禁止直接删 |
| 原始供应商 payload/图像/模型调试制品 | `plant-knowledge` / `diagnosis` / `care` 各自边界 | `QUARANTINE；KEEP`（按最短留存复核） | 脱敏、可观测性、数据/来源审计 | 授权、访问控制、保留期限、内容哈希、反向引用、可回退删除清单；不作为 v2 Expected |

## 6. 最小关闭合同（后续阶段）

### 6.1 外部 adapter 统一元数据

每次供应商调用只允许产生下列脱敏元数据：`provider`、`operation`、`endpoint_host`、`model_or_api_version`、`request_fingerprint`、`status_class`、`provider_error_code`（允许列表）、`latency_ms`、`timeout_ms`、`retry_attempt`、`quota_or_cost_class`、`cache_hit`、`redaction_version`。禁止保存 URL query 中的 key/token、完整请求体、图片 URL（未授权时）、prompt、原始响应和平台主体标识。

### 6.2 失败与重试

- 识别/天气/平台 auth：明确连接、读取、DNS、4xx、5xx、解析失败和 quota 错误；每类有 timeout、有限 retry 或安全 fallback；上游错误公开为中性业务错误。
- AI：单次模型调用必须有总 deadline；重试只允许在可证明幂等且不重复计费的错误上；provider fallback 要有原因、模型版本和 quota 记录，不得静默改变业务语义。
- 支付下单：clientRequestId 幂等；未知响应先查单，不能直接重复创建；回调先验签/解密再入事务；重复通知和并发权益入账必须读回相同结果。
- 平台手机号：授权 code 一次性、登录主体与手机号 proof 一致；超时/上游失败不创建半成品身份；解绑后旧 session 和平台主体访问应拒绝。

### 6.3 成本和额度

供应商键名存在不等于成本可接受。关闭前每一项至少要有账户/环境归属、模型或 API 套餐、单次/日/月预算、并发与速率限制、余额/配额观测、超额降级和告警 owner。支付还要有对账、退款/异常订单处理；AI 还要有产品 quota 预占/成功确认/失败回滚；天气要有定时批量上限和重复采集预算。

### 6.4 回调与重放

支付 sandbox 至少回放：合法通知、旧 timestamp、错误 serial、错误签名、错误密文、错误商户、金额/币种不符、未知订单、重复通知、并发重复通知、数据库失败后重试。每次回放只保存脱敏 fixture 哈希和结果，不保存支付原文或凭证。

## 7. 测试与命令证据

本次只运行已有本地测试，没有新增 Expected，也没有修改实现。

| 证据 | 结果 | 限制 |
|---|---|---|
| `node docs/backend-v2/verify-entrypoint.mjs` | PASS | 只证明唯一入口和 Master Plan 哈希 |
| identify：`public-response.mjs`、`identify-runtime.mjs` | PASS | `unit_fake`/source contract；不证明百度真实调用或 raw 留存授权 |
| diagnose：provider registry、CloudBase AI OpenAI contract、Hunyuan adapter、visual success trace | PASS | `unit_fake`/source contract；不证明模型账户、额度或日志运行时安全 |
| weather：history cache、D0/daylight、now retry/fallback、hot-city recent cache、location key、environment context、diagnosis care location | PASS | `unit_fake`/unit logic；不证明和风账户、费用、timer 线上读回 |
| payment：subscription config、WeChat Pay、subscription service、notify app | PASS | `unit_fake`；不证明微信 sandbox、线上唯一 route 或真实通知 |
| platform auth：Douyin official contract、platform session、bootstrap app | PASS | source contract/unit fake；不证明三平台真实授权、撤销和 timeout |
| `node scripts/security/check-no-secrets.mjs` | PASS | 只扫 tracked 文件；不能覆盖未跟踪 `cloudbaserc.json`/`.env.local` |
| `node scripts/qa/check-sensitive-logs.mjs --report-only` | FINDINGS，1 项 | `cloudfunctions/weather-http/app.js:412` `request_body`；模型 prompt/raw response 风险由源码合同审计另列 |

所有单测属于 S3，不替代 S4。真实供应商和支付 sandbox 证据缺失是明确的后续关闭条件，不是已验收。

## 8. 哈希、读回与可复现性

- 本报告和 sidecar manifest 只对本地源/合同/脱敏 live-readback 制品做 SHA-256；manifest 不包含 `.env.local` 内容，也不输出任何 credential value。
- `P-1-cloudbase-live-readback.md` 的既有 sidecar 哈希为 `2ea16c7ea9e209d02221820fb8968893c92a62ffc1ed1b9daac24987f56891bf`；本报告将该制品和 sidecar 一并列入 manifest，防止把当前 live-readback 改写成后续结论。
- `cloudbaserc.json` 仅列入 hash，不列入值；它是未跟踪配置，hash 只能证明快照，不代表允许提交或可安全发布。
- 交付前必须从仓库根目录执行：

```text
sha256sum -c docs/backend-v2/audits/P-1-external-sources-z8v0kmr96t.sha256
```

成功后才更新 heartbeat 的最终进度；若任何输入在并行任务中变更，manifest 必须重新生成并再次验证。

## 9. 交接结论

本 ticket 的静态外部来源注册表、处置矩阵、失败/超时/成本/回调边界已完成；live-readback 的证据边界已显式标注。向主代理交接时应保留以下三项不可误读事实：

1. “配置键名存在”不等于“供应商可用”；本次没有真实供应商调用、支付 sandbox、费用/额度或线上 route winner 证据。
2. 支付回调必须先解决双 owner；`subscription-notify-http` 目标上是唯一匿名 callback owner，重复 handler/函数在观察窗口前不得删除。
3. Prompt、模型原文、请求体、平台主体和凭证红线仍有现状代码冲突；敏感日志检查 PASS 不能替代发现处理，tracked-secret PASS 也不能覆盖未跟踪配置。
