# P0 外部能力合同与可靠事件证伪卡

> Ticket：`z8v0kmr9dv`；日期：2026-09-19（Asia/Shanghai）  
> 证据等级：当前只有 S1（计划/合同/官方资料）与既有 S3（`unit_fake`/静态检查）；没有本 ticket 新取得的 S4（真实供应商、支付 sandbox、真实 CloudBase/MySQL）证据。  
> 双轴结论规则：`CONTRACT_GO` 表示独立 Expected、明确输入输出和可执行本地/官方合同已冻结，**不是**真实接通；`INTEGRATION_GO` 才要求该卡最小真实证据。无 S4 时只能是 `INTEGRATION_STOP`，不能反向抹杀可审计的本地合同。

## 独立 Expected 与证伪方法

Expected 不是从现存实现反推，来源为根目录 Master Plan 的 P0/P13/P16.1、`docs/backend-v2/contracts/guest-session-claim.md`、`docs/backend-v2/implementation/{http-function,cms-enrichment-worker,storage-security,reward-events}.md` 与 `docs/backend-v2/testing/{real-api,real-mysql,security-redaction}.md`。本轮先落盘的可执行静态门为 `docs/backend-v2/audits/P0-external-capability-cards-z8v0kmr9dv.verify.mjs`：它只检查 P0 卡片集合和结论字段完整性（`source_contract`），不宣称外部能力已验证。

真实验证的统一记录最小集：脱敏请求指纹、环境/账户归属、状态类别、延迟、超时/重试次数、费用或配额类别、结果哈希和读回时间；不得记录凭证、平台主体标识、私图 URL、Prompt、原始模型响应、支付原文或内部主键。

## 游客盆土视觉

- **卡片 ID**：P0-EXT-01
- **Owner**：`care`。
- **输入 / 输出**：游客上传受限盆土图片与临时会话证明；仅输出 `wet/moist/dry/uncertain` 临时证据、有效期和脱敏原因码，不能创建 `user_plant_id`、事实、计划或积分。
- **认证 / 权限**：guest；匿名主体只能持有临时会话，设备/IP/UA 仅作风险信号，匿名 UID 不得成为 `user_id`。
- **超时 / 有限重试**：连接、首包、总 deadline 均需冻结；模型调用不盲重试，未知结果要求重拍或摸土。
- **幂等**：同一 `Idempotency-Key` 返回同一临时结果；同键异参冲突；过期证据不可再认领。
- **费用**：游客可用范围、次数和单次模型成本未冻结；不得扣用户 AI 额度。
- **隐私 / 日志**：私图永远私有；仅记录脱敏指纹与状态，禁止图片 URL、Prompt、原始模型响应进入日志或 CMS。
- **失败隔离**：视觉失败只返回不确定/要求补充，不创建养护事实，不阻断固定题包或独立基础浇水。
- **证据**：计划 P0、5.7、16.1 与 P13 规定范围；`contracts/guest-session-claim.md` 允许临时证据；尚无真实上传→分析→可见结果→过期读回。
- **证据等级**：S1；没有 S3 的视觉 Schema/有效期负向测试，也没有 S4。
- **本地合同冻结结论**：CONTRACT_STOP — 精确模型、Prompt hash、输入输出 Schema、游客次数与单次成本尚未由 P0 决策冻结。
- **真实集成准入结论**：INTEGRATION_STOP — 没有受控 guest 上传、分析、过期读回和费用记录。
- **STOP 原因**：本地合同的模型/Schema/成本字段缺失；真实链路同时缺失。
- **GO 门**：真实 guest 流程证明归属、MIME/大小、有效期、重复键、私图隔离与费用边界；实际模型及 Prompt/Schema 另见 Qwen 卡。

## 游客会话认领

- **卡片 ID**：P0-EXT-02
- **Owner**：`user-plant`，`identity` 提供 Principal。
- **输入 / 输出**：同一匿名会话、已解析 `user_id`、用户明确的新建/已有用户植物选择与 `Idempotency-Key`；输出仅为归属补充结果。
- **认证 / 权限**：guest 转 authenticated；必须校验会话持有者、有效期和目标用户植物归属；跨用户拒绝。
- **超时 / 有限重试**：仅在可安全读回原命令结果后有限重试；超时不得创建半认领状态。
- **幂等**：重复认领回放原结果，同键异参 `409`；认领不转化建议为事实/计划、不追溯积分。
- **费用**：无供应商计费；本地合同只定义幂等与归属，不创建数据库连接或费用动作。
- **隐私 / 日志**：不记录匿名 token、平台主体或内部会话 ID；响应只含 DTO 白名单。
- **失败隔离**：认领失败不删除临时证据、不影响游客识别/固定题包；可在有效期内重试。
- **证据**：`contracts/guest-session-claim.md` 与 Master Plan 16.1 是独立 Expected；没有真实身份、事务、跨用户、过期和读回证据。
- **证据等级**：S1（Master Plan 16.1 与 `guest-session-claim.md`）；S3 仅限本卡 verifier；无 S4。
- **本地合同冻结结论**：CONTRACT_GO — 会话持有者、登录后统一 `user_id`、显式目标植物、过期、幂等及无事实/积分副作用均有独立 Expected。
- **真实集成准入结论**：INTEGRATION_STOP — 没有真实身份、事务、跨用户、过期和写后读回。
- **STOP 原因**：仅真实集成准入被阻断；不得用本地合同替代真实 API/MySQL。
- **GO 门**：真实 API + MySQL 下验证成功、跨用户、过期、重复、同键异参及“无事实/计划/积分副作用”。

## CloudBase 匿名身份

- **卡片 ID**：P0-EXT-03
- **Owner**：`identity`。
- **输入 / 输出**：CloudBase 匿名凭证产生平台匿名主体；青花植再以独立 `guest_session_id`/claim context 生成短期 guest Principal，登录后由 identity 显式映射为统一 `user_id`，不是 OpenID/设备/IP/匿名 UID。
- **认证 / 权限**：匿名登录是显式环境开关，不可假定默认已启用；开启后安全规则以 `auth.loginType=ANONYMOUS` 限定访问。CloudBase 匿名主体可长期存在（官方策略为每设备一个且本身不过期），绝不充当青花植短期 guest 会话 TTL；匿名 Principal 不可拥有用户植物、积分、会员或长期 Agent 上下文。
- **超时 / 有限重试**：身份验证读取可有限重试；上游超时不创建身份绑定或半成品记录。
- **幂等**：同一 CloudBase 匿名主体可稳定解析；guest session/claim context 有独立 TTL 与命令幂等键，不能借重试重复创建统一用户。
- **费用**：认证 MAU/配额及账户归属没有当前读回。
- **隐私 / 日志**：token、平台主体、设备/IP/UA 不能出现在公开响应或普通日志。
- **失败隔离**：匿名认证不可用时只阻断 guest 能力；不降级把设备/IP 伪造为 `user_id`。
- **证据**：Master Plan 10.2、13、16.1；CloudBase Auth v2 匿名登录官方文档规定需在控制台显式开关、每设备一个匿名用户且本身不过期；P-1 审计没有目标环境开关/撤销读回。
- **证据等级**：S1（官方 Auth v2 文档与计划）；无 S4。
- **本地合同冻结结论**：CONTRACT_GO — 匿名身份仅是 guest Principal，须显式启用并由安全规则限制；它绝不等于平台无关 `user_id`。
- **TTL 子项**：CONTRACT_STOP — 青花植 guest session/claim context 的具体 TTL、续期和失效读回尚未经 P0 产品决策确认；不得借用 CloudBase 匿名主体的长期策略。
- **真实集成准入结论**：INTEGRATION_STOP — 未读取目标环境匿名登录开关、规则、创建、清本地数据后的新身份或升级/解绑行为。
- **STOP 原因**：仅真实集成准入被阻断；默认关闭/开启状态不得臆测。
- **GO 门**：目标环境匿名 Auth v2 的脱敏真实读回，包含创建、失效、登录映射、解绑拒绝访问和路由权限验证。

## 百度植物识别

- **卡片 ID**：P0-EXT-04
- **Owner**：`plant-knowledge`。
- **输入 / 输出**：受限图片证据；只输出三态候选/不确定/失败及标准化候选，绝不写分类事实或绕过审核发布。
- **认证 / 权限**：服务端供应商凭证；客户端不能获得密钥；调用前完成用户/临时会话和资产范围校验。
- **超时 / 有限重试**：连接、读取、总 deadline 与仅限幂等读取的有限重试待冻结；额度/4xx/解析错不能盲重试。
- **幂等**：请求指纹和命令键防止重复计费/重复入队；候选聚合必须唯一。
- **费用**：账户归属、额度、单次成本、日预算、限流与超额降级未有实时证据。
- **隐私 / 日志**：原图、URL、原始 provider payload 和密钥不得落公开响应/日志；仅留最短必要的脱敏元数据。
- **失败隔离**：识别失败不写身份、不阻断已发布内容查询；后续百科生成失败不回滚识别成功。
- **证据**：P-1 外部来源审计仅证实本地调用者/键名与 S3 测试，明示无真实百度请求；Master Plan P13/P16.1 定义候选边界。
- **证据等级**：S1 + 既有 S3；无 S4。
- **本地合同冻结结论**：CONTRACT_STOP — 供应商套餐、三态原始响应映射、超时数值、限流和费用上限未冻结。
- **真实集成准入结论**：INTEGRATION_STOP — 没有批准账户的最小请求/拒绝/额度读回。
- **STOP 原因**：供应商合同字段和真实调用证据均缺失。
- **GO 门**：批准环境中最小真实图片的成功/额度/超时/限流证据，且候选不能越过审核的真实读回。

## 和风天气

- **卡片 ID**：P0-EXT-05
- **Owner**：`care`。
- **输入 / 输出**：经授权地点、时区与查询时刻；输出带新鲜度/来源版本的天气证据或“证据不足”，不把室外风速直接当作室内通风。
- **认证 / 权限**：服务端凭证和用户地点授权；不得把精确地点或密钥写日志。
- **超时 / 有限重试**：仅幂等读取可按冻结连接/读取/总超时有限重试；缓存和 stale 结果须显式标记。
- **幂等**：相同地点时间窗复用缓存，调度采集以时间窗键去重，不能因重试无限调用。
- **费用**：套餐、调用上限、缓存命中、调度批量预算与告警 owner 未取得真实证据。
- **隐私 / 日志**：仅记录区域化地点指纹、状态和延迟；禁止精确坐标、完整请求体和凭证。
- **失败隔离**：返回证据不足/低可信输出，不阻断非天气养护路径。
- **证据**：Master Plan P13、P16.1 及 P-1 外部审计均明确没有真实和风账户、费用或定时器读回；现有 unit 不替代 S4。
- **证据等级**：S1 + 既有 S3；无 S4。
- **本地合同冻结结论**：CONTRACT_STOP — provider 版本、套餐、精确 freshness/缓存窗口、超时数值与日预算尚未冻结。
- **真实集成准入结论**：INTEGRATION_STOP — 没有真实账户、地点授权、时区和限额读回。
- **STOP 原因**：供应商合同参数和真实调用证据均缺失。
- **GO 门**：真实账户的当前/历史/预报边界、时区、新鲜度、缓存、限额、超时重试和脱敏日志读回。

## Qwen 诊断

- **卡片 ID**：P0-EXT-06
- **Owner**：`diagnosis`。
- **输入 / 输出**：已授权的诊断 DTO、证据引用和版本化 Prompt；输出严格版本化诊断建议 Schema，建议不得自动写养护事实。
- **认证 / 权限**：服务端模型凭证、用户与 `user_plant_id` 归属；不得把模型凭证/Prompt 下发客户端。
- **超时 / 有限重试**：冻结连接、首包、总 deadline；模型调用不盲重试，不静默替换模型；未知计费进入对账。
- **幂等**：以 `product_action_id + cost_policy_version` 申请额度；模型请求只在可证明不重复计费时重试。
- **费用**：精确 endpoint、模型 ID、Prompt SHA-256、输入/输出 Schema、价格、额度预占/结算/释放均未冻结或实时核验。
- **隐私 / 日志**：禁止 Prompt、原始模型响应、私图、平台主体、内部 session/trace ID 出现在响应与日志。
- **失败隔离**：阻断 AI 诊断，不静默改模型，不影响固定题包和非生成式路径。
- **证据**：Master Plan P0/P13、P-1 外部审计指出只有 provider registry/S3，未取得模型账户、额度或真实文本/视觉回放，且既有调试日志存在红线风险。
- **证据等级**：S1 + 既有 S3；无 S4。
- **本地合同冻结结论**：CONTRACT_STOP — 精确模型/endpoint、Prompt SHA-256、输入输出 Schema、价格与额度策略未冻结。
- **真实集成准入结论**：INTEGRATION_STOP — 没有批准账户的脱敏成功、拒绝、超时或未知结果对账回放。
- **STOP 原因**：P0 明确要求的模型合同字段和真实调用证据均缺失。
- **GO 门**：精确模型、endpoint、Prompt hash、Schema、成本策略冻结后，在批准账户下完成脱敏真实成功、拒绝、超时与未知结果对账回放。

## Qwen 百科

- **卡片 ID**：P0-EXT-07
- **Owner**：`plant-knowledge`；CMS 只作审核控制面。
- **输入 / 输出**：仅已发布规范身份的缺口任务；输出简介、外观、分布和约 3 个问答的受限草稿，经过 Schema/禁区校验后才进入人工审核。
- **认证 / 权限**：仅 service Worker；身份未发布、私图、未授权内容不得进入任务或 CMS release。
- **超时 / 有限重试**：最多 3 次、租约过期可安全接管；模型调用总 deadline，预算暂停不盲重试。
- **幂等**：同一内容缺口一个活动任务、同一候选一个活动审核项；状态转换与 lease token 防并发接管。
- **费用**：Worker 并发固定 1、真实模型预算默认关闭；模型价目、预算、恢复阈值和告警尚未冻结。
- **隐私 / 日志**：禁止 Prompt、原始输出、私图、分类/安全/养护/诊断禁区字段及内部审核信息对外泄露。
- **失败隔离**：预算暂停继续聚合需求；生成失败不回滚识别成功，也不阻断已发布内容。
- **证据**：Master Plan 5.5/5.6，`implementation/cms-enrichment-worker.md` 与 P-1 外部审计；没有真实队列、模型、CMS 审核或 release 读回。
- **证据等级**：S1 + 既有 S3；无 S4。
- **本地合同冻结结论**：CONTRACT_STOP — 精确模型/Prompt hash/Schema 及真实模型预算阈值尚未冻结；逻辑禁区和队列状态机已冻结。
- **真实集成准入结论**：INTEGRATION_STOP — 没有真实 draft→审核→release、模型预算或 CMS 读回。
- **STOP 原因**：生成模型合同和真实 CMS 集成均未完成。
- **GO 门**：精确模型/Prompt hash/Schema/禁区、预算与队列行为均冻结，并取得真实 draft→审核→immutable release 的脱敏读回。

## 支付回调

- **卡片 ID**：P0-EXT-08
- **Owner**：`subscription`；目标唯一匿名 callback owner 为 `subscription-notify-http` 的替代 v2 路由，不能双 owner。
- **输入 / 输出**：保留原始请求体用于验签/解密；验证平台、商户、金额、币种、订单后，输出脱敏确认或中性拒绝，不公开支付敏感信息。
- **认证 / 权限**：路由为严格匿名 callback，先验签/解密再入事务；客户端订单接口必须 authenticated，服务端密钥隔离。
- **超时 / 有限重试**：支付下单和回调均禁止盲重试；未知下单先查单 reconcile，数据库失败后通过安全回放恢复。
- **幂等**：`clientRequestId`、支付交易唯一键、订单状态机与权益入账事务；重复/并发/乱序通知读回同一结果。
- **费用**：支付平台范围、商户/沙箱归属、费率、退款/对账策略未冻结。
- **隐私 / 日志**：不得记录签名原文、密文、token、payer OpenID、完整请求体或内部订单键；留脱敏回放 hash。
- **失败隔离**：阻断订阅/权益变更，不影响免费闭环；验签或金额不符不得写权益。
- **证据**：P-1 外部审计发现两个本地 `/subscription/notify` owner，且未有线上 route winner、真实签名/解密或 sandbox 回放；Master Plan P13/P16.1 给出最小回放集。
- **证据等级**：S1 + 既有 S3；无 S4。
- **本地合同冻结结论**：CONTRACT_STOP — 支付平台范围、单一 callback owner、商户/沙箱、验签/解密算法版本、金额/币种和退款/对账规则尚未冻结。
- **真实集成准入结论**：INTEGRATION_STOP — 没有线上唯一 route winner 或 sandbox 回放。
- **STOP 原因**：双 owner 风险和支付合同/真实 sandbox 均未关闭。
- **GO 门**：单路由 owner 的云端只读证明及微信支付 sandbox 合法、坏签名、旧 timestamp、金额/币种不符、重复/并发/乱序、数据库失败重放与查单对账。

## Storage

- **卡片 ID**：P0-EXT-09
- **Owner**：`user-plant`（用户植物资产）、`care`（盆土证据）、`diagnosis`（诊断资产）；公共 CMS 图片独立权利审计。
- **输入 / 输出**：短时、限用户、限路径、限 MIME/大小的直传凭证；业务持久化只存 fileID/对象引用，先验证资产再绑定。若需可控下载 TTL，必须选择 PG 模式 `createSignedUrl(expiresIn)`；传统 JS Storage 的 `getTempFileURL.maxAge`/`createSignedUrl.expiresIn` 仅为兼容参数，不可作为 TTL 承诺。
- **认证 / 权限**：guest 或 authenticated 按路径/归属细分；跨用户、跨植物、过期和隔离资产拒绝；用户私图永不进入 CMS release。
- **超时 / 有限重试**：上传使用明确 deadline；失败不伪造 URL；删除采用标记删除→禁止新写→清理→对账→完成，失败进入补偿。
- **幂等**：上传/绑定命令键和内容哈希；删除补偿可重放，不能误删其他用户资产。
- **费用**：本地合同选择私有对象与 fileID 引用；桶/上传方式、对象保留期、流量、恶意文件扫描和清理的数值预算由 P0 产品决策卡确认前保持禁用。
- **隐私 / 日志**：不记录私有 fileID、临时 URL、图片内容或凭证；公开响应仅给按权限签发的可用 URL/引用。
- **失败隔离**：上传失败阻断该资产绑定，保留业务草稿；删除失败不假装删除完成。
- **证据**：`implementation/storage-security.md` 是独立合同；CloudBase 官方 Storage SDK 文档规定传统 JS 模式的 `maxAge`/`expiresIn` 不控制 TTL，需要可控 TTL 时使用 PG `createSignedUrl`；没有目标环境真实上传、归属、删除补偿和端侧读回。
- **证据等级**：S1（官方 Storage 文档与本地合同）；无 S4。
- **本地合同冻结结论**：CONTRACT_GO — fileID/私有对象、先验证后绑定、传统模式不承诺 TTL、需要可控 TTL 必须采用 PG 签名 URL的边界已冻结。
- **TTL 子项**：CONTRACT_STOP — 目标存储模式与青花植私有访问 URL 的具体 TTL 尚未确认；传统 `maxAge`/`expiresIn` 不能填充该数值。
- **真实集成准入结论**：INTEGRATION_STOP — 未选择/读回目标存储模式、bucket/RLS 或规则、端侧上传/删除补偿与实际 URL 过期。
- **STOP 原因**：仅真实集成准入被阻断；不可把传统 `maxAge` 伪写为 TTL。
- **GO 门**：真实 bucket/策略下的 MIME/大小/归属/过期/跨用户拒绝、上传后读回、私图发布拒绝、删除失败补偿和费用/保留期证据。

## CloudBase Agent

- **卡片 ID**：P0-EXT-10
- **Owner**：CloudBase Agent；`identity`/各业务域仅提供签名内部 Query/工具合同，不新建小青专属 HTTP 函数。
- **输入 / 输出**：绑定用户范围、五分钟有效工具令牌、allowlist 与版本；输出受控公共知识或该用户授权范围内的工具结果。
- **认证 / 权限**：先 Principal、再 CapabilitySnapshot、再业务域；每个工具必须校验 `user_id`、可选 `user_plant_id`、scope、过期与 allowlist，禁止跨用户访问。
- **超时 / 有限重试**：Agent/工具总 deadline 和单工具 deadline 待冻结；写工具不盲重试，失败返回中性状态。
- **幂等**：写工具要求 action ID/命令键；查询可按安全读取策略有限重试。
- **费用**：Agent 模型/调用额度、工具并发、超额降级与责任人未冻结。
- **隐私 / 日志**：不得把 thought、工具参数原文、session、平台主体、Prompt 或原始模型输出提供给客户端或普通日志。
- **失败隔离**：无法证明用户范围时仅开放公共知识；不以 Agent 失败阻断核心诊断/养护。
- **证据**：基础设施说明明确“小青继续使用 CloudBase Agent，不新增第七函数”；P13 明确要求用户范围、allowlist、审计；尚无真实 Agent 工具范围/跨用户拒绝/审计读回。
- **证据等级**：S1；无 S3 的 agent scope 测试和无 S4。
- **本地合同冻结结论**：CONTRACT_STOP — Agent 精确模型、调用额度、工具协议、auditing 字段、超时与并发数值未冻结。
- **真实集成准入结论**：INTEGRATION_STOP — 没有真实 Agent tool allowlist、跨用户拒绝或审计读回。
- **STOP 原因**：工具合同参数和真实 Agent 范围证明均缺失。
- **GO 门**：目标 CloudBase Agent 的受控工具调用，证明 allowlist、5 分钟令牌、跨用户/过期拒绝、脱敏审计和费用上限。

## CMS 队列

- **卡片 ID**：P0-EXT-11
- **Owner**：`plant-knowledge`；内部 Job API 只做签名、租约与调度机械能力。
- **输入 / 输出**：已发布身份的内容缺口、聚合需求和预算状态；输出有状态的 enrichment job、受限草稿、审核项或暂停/失败状态。
- **认证 / 权限**：service-only，内部任务用 `key_id + timestamp + nonce + body_sha256 + HMAC-SHA256`；CMS 不是请求级运行时数据源。
- **超时 / 有限重试**：并发固定 1、任务最多 3 次、租约过期可接管；预算暂停不调用模型，继续聚合。
- **幂等**：一个内容缺口一个活动 job、一个候选一个活动审核项；lease 与状态版本防双 worker。
- **费用**：真实模型预算固定为默认关闭（预算为 0）；启用前必须由独立 P0 决策登记册冻结上限、预警、恢复门和积压阈值。
- **隐私 / 日志**：不记录 Prompt、原始输出、私图或审核内部键；只留状态、脱敏指纹、耗时和预算类别。
- **失败隔离**：预算暂停/生成失败不丢候选、不回滚识别成功、不阻断已发布 release；CMS 发布失败不发奖励。
- **证据**：Master Plan 5.5、P0、16.1；`implementation/cms-enrichment-worker.md` 规定机械边界；没有真实 lease 接管、预算暂停恢复、背压和 CMS release 读回。
- **证据等级**：S1（Master Plan 5.5/5.6 与 worker 合同）；无 S4。
- **本地合同冻结结论**：CONTRACT_GO — 单并发、最多 3 次、租约接管、预算为 0 时暂停生成继续聚合、私图/禁区隔离及失败不回滚识别均已冻结。
- **数值子项**：CONTRACT_STOP — 租约时长、积压阈值、告警阈值与预算恢复门尚未确认；真实模型预算保持 0。
- **真实集成准入结论**：INTEGRATION_STOP — 未有真实 lease 接管、预算恢复、背压或 CMS release 读回。
- **STOP 原因**：仅真实集成准入被阻断；预算为 0 不等于启用真实模型。
- **GO 门**：真实 worker 证明单并发、三次上限、租约接管、预算暂停/恢复、背压、失败隔离和 release 后事件顺序。

## CloudBase MySQL

- **卡片 ID**：P0-EXT-12
- **Owner**：各域 Repository；事务/唯一约束由本域 schema 承担，`subscription` 独占 reward inbox/账本。
- **输入 / 输出**：受 DTO/归属校验的命令；输出脱敏业务 DTO 和可读回持久化状态，内部主键不得外露。
- **认证 / 权限**：HTTP 云函数使用服务端受控凭证；应用业务表只关联统一 `user_id`，不把平台主体当业务外键。CloudBase MySQL SDK/SQL API不支持事务，不等于 MySQL 不支持事务；需要事务时必须使用经批准的原生 MySQL 驱动，并自行管理连接和事务状态。
- **超时 / 有限重试**：本地合同只冻结“提交结果不明时必须读回/对账、写事务不能盲重试”；连接池与事务 deadline 在真实集成前不创建、不取值。
- **幂等**：唯一约束、业务键、版本号/`If-Match` 和事务共同防重复/覆盖；重复命令返回同一已提交结果或受控冲突。
- **费用**：实例规格、连接池、慢 SQL、事务容量和告警成本没有当前环境证据。
- **隐私 / 日志**：SQL、主键、平台主体、凭证、原始异常不公开；只记录结构化、字段级脱敏审计。
- **失败隔离**：事务回滚不产生半事实；数据库不可用返回中性错误，不降级内存假成功。
- **证据**：`testing/real-mysql.md` 明确要求真实库验证事务、唯一、并发与读回且缺库为 `BLOCKED_ENV`；本次无 MySQL 登录/查询/DDL。
- **证据等级**：S1（CloudBase MySQL 官方 FAQ/SQL 限制与真实 MySQL 验收合同）；无 S4。
- **本地合同冻结结论**：CONTRACT_GO — 事务需求必须走支持事务的原生 MySQL 驱动；CloudBase SDK/SQL API 不得被误用为事务实现，唯一约束/业务键/版本控制仍是必需保护。
- **数值子项**：CONTRACT_STOP — 连接池上限、连接/事务 deadline 与实例容量需真实环境读回后确定；本地合同不将其伪装为既定数值。
- **真实集成准入结论**：INTEGRATION_STOP — 原生驱动依赖、显式凭证、隔离测试库、DDL、事务回滚、并发及读回尚未取得授权和证据。
- **STOP 原因**：仅真实集成准入被阻断；不能将 SDK 限制错误归因于 MySQL 引擎。
- **GO 门**：隔离真实测试库完成空库可重放 DDL、唯一/外键、事务回滚、并发命令、写后读回和 SHA-256 核对；不触碰生产。

## /api/v2 网关

- **卡片 ID**：P0-EXT-13
- **Owner**：foundation 网关；域函数为 `identity`、`plant-knowledge`、`user-plant`、`care`、`diagnosis`、`subscription`。
- **输入 / 输出**：HTTP 请求进入显式 `/api/v2` 路由清单；输出 DTO 白名单响应与统一错误，不能回显 headers、环境变量、`x-cloudbase-context` 或内部 ID。
- **认证 / 权限**：逐路由明确 `public/guest/authenticated/service`，固定顺序为大小/MIME→认证/Principal→`user_id`→`user_plant_id` 归属→AJV→领域→事务→脱敏响应。
- **超时 / 有限重试**：网关、函数、外部依赖均需连接/首包/总 deadline；只有幂等读可有限重试。
- **幂等**：所有写路由有 `Idempotency-Key` 作用域、有效期、重放和同键异参冲突；覆盖写用版本或 `If-Match` 返回 `409`。
- **费用**：本地网关合同不执行调用；函数、日志与外部适配器预算/并发数值属于独立数值子项。
- **隐私 / 日志**：1 MiB JSON 上限、DTO 白名单、字段级脱敏；禁止 token、Prompt、原始模型响应、平台主体和 SQL 错误。
- **失败隔离**：未匹配路由 `404`、已知方法不符 `405`；单域失败不暴露跨域内部状态。
- **证据**：Master Plan 10.2、`implementation/http-function.md` 及 CloudBase 官方运行时资料：HTTP 云函数支持 Node.js `22.21`、`/var/lang/node22/bin/node` 与端口 9000；没有 `/api/v2` 实路由、网关 route winner 或真实 API 测试。
- **证据等级**：S1（计划、本地 HTTP 合同、CloudBase 官方运行时资料）；无 S4。
- **本地合同冻结结论**：CONTRACT_GO — 路由权限矩阵、请求处理次序、大小/幂等/DTO/响应脱敏规则，以及 Nodejs22.21 bootstrap 路径已冻结；这不代表当前 checkout 有 v2 构建包。
- **数值子项**：CONTRACT_STOP — 网关/函数并发、外部预算和告警阈值尚未经真实容量基线与用户确认；本地合同只冻结控制流。
- **真实集成准入结论**：INTEGRATION_STOP — 当前没有 Node22 v2 包、`/api/v2` route、目标环境安全规则或真实 API 读回。
- **STOP 原因**：仅真实集成准入被阻断；Node22 平台支持不能冒充本地构建或部署成功。
- **GO 门**：Node 22 运行时出口另行成立后，以真实 HTTP 云函数验收 public/guest/authenticated/service、大小/MIME、归属、DTO、错误、幂等和脱敏；health 200 不足。

## outbox/inbox

- **卡片 ID**：P0-EXT-14
- **Owner**：生产域各自独占本域 outbox；`subscription` 独占 `reward_event_inbox`、积分、等级和 AI grant。
- **输入 / 输出**：已完成的可奖励业务事务写本域事件；Dispatcher 以租约领取、签名调用 subscription；输出订阅域幂等消费结果和源域 delivered 标记。
- **认证 / 权限**：service-only，带签名、生产域、用户引用、可选用户植物引用、聚合引用、发生时间、版本、payload hash；不建设共享万能 outbox。
- **超时 / 有限重试**：消费者宕机/网络失败可至少一次重放；投递结果不明时读 inbox/源 outbox 状态，不能丢事件或盲目确认 delivered。
- **幂等**：inbox 唯一键和业务唯一键；重复、乱序、并发都不得重复奖励，未承诺 exactly-once。
- **费用**：本地合同不启动 Dispatcher；频率、租约、积压、告警和重放成本属于独立数值子项。
- **隐私 / 日志**：事件不携带平台主体、积分点数、Prompt、私图或内部主键；日志保存脱敏 event fingerprint/status，不公开 event ID/grant ID。
- **失败隔离**：奖励投递失败不回滚已完成业务事实；积压/失败可观测、可重放，不能阻断无奖励业务。
- **证据**：Master Plan 11.2/P0/16.1、`contracts/reward-events.md`、`implementation/reward-events.md` 指定至少一次+inbox 幂等；没有真实 MySQL 的丢失、宕机、重放、乱序、并发读回。
- **证据等级**：S1（Master Plan 11.2、奖励事件合同与实施合同）；无 S4。
- **本地合同冻结结论**：CONTRACT_GO — 每域独占 outbox、至少一次投递、dispatcher lease、subscription inbox/业务唯一键幂等、非 exactly-once 与失败不回滚业务事实均已冻结。
- **数值子项**：CONTRACT_STOP — Dispatcher 频率、租约时长、积压上限、告警阈值和重放预算尚未确认；本地合同只冻结投递算法和唯一键。
- **真实集成准入结论**：INTEGRATION_STOP — 没有真实库同事务、宕机、重放、乱序、并发及积压读回。
- **STOP 原因**：仅真实集成准入被阻断；本地合同不能替代真实故障注入。
- **GO 门**：真实库故障注入证明“业务事务与 outbox 同提交”、lease 接管、重复/乱序/并发仅一次入账、宕机后重放、写后读回与积压观测。

## 汇总结论与下一步

本地合同层已有 7 个 `CONTRACT_GO`：游客认领、匿名身份、Storage、CMS 队列、MySQL、网关、outbox/inbox；其余 7 个因供应商/模型/支付/Agent 的精确字段未冻结而为 `CONTRACT_STOP`。14 张卡的真实集成层均为 `INTEGRATION_STOP`：P-1 静态供应商审计、配置键存在、mock/`unit_fake` 与 health HTTP 仍不得替代真实/沙箱/真实测试库证据。下一步必须按卡取得受控脱敏 S4 回放；任何 `CONTRACT_STOP` 不得进入对应实现，任何 `INTEGRATION_STOP` 不得发布。

### 本轮可执行静态检查

```bash
node docs/backend-v2/audits/P0-external-capability-cards-z8v0kmr9dv.verify.mjs
sha256sum -c docs/backend-v2/decisions/P0-external-capability-cards.sha256
```

静态检查只能证明卡片完整，不证明真实能力；外部验证应按 `e2e_real_api` 或 `unit_real_data` 标记，并写清真实路径和替换边界。
