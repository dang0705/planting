# 业务策略与第三方 Provider 配置架构

- 架构合同版本：`configuration-provider-architecture/v1`
- 适用阶段：P1 先冻结合同、Schema、DDL 与测试；P2-P5 才按域实现和真实验收。
- 目标：让需要运营调整的关键业务变量和第三方能力接入可版本化、可审计、可回滚，同时防止“万能配置中心”把领域规则、权限和密钥变成黑箱。

## 1. 配置分为三层

### 配置化裁决门

每个功能在 DTO、领域实现或 DDL 之前，先由主代理判断其变量是否值得配置化。只有同时满足以下条件才进入配置目录：

1. 在真实业务场景中存在可说明的变化来源，而不是为假想未来预留开关；
2. 配置化能显著改善运营调整、安全止损、成本控制、外部 Provider 切换、合同兼容或快速回滚；
3. 收益明显高于新增 TypeScript 类型、AJV 校验、发布审批、缓存、审计、回滚、测试和故障处理复杂度；
4. 能明确 owner、Expected、允许范围、失败边界和不可越过的硬规则。

不满足时保留为命名清晰的代码常量或不可配置硬规则。领域子代理只提交证据和建议，最终哪些可配置、属于哪层及其初始状态由主代理写入唯一变量目录；禁止 Agent 自行增加“临时开关”或默认值。

| 层级 | 保存内容 | 事实源与所有者 | 能否热切换 |
|---|---|---|---|
| 部署与密钥配置 | EnvId、数据库连接、`credential_ref`、签名密钥引用、启动端口 | CloudBase 受控环境/凭证系统；平台管理员 | 需要新实例或凭证轮换流程，不能由 CMS 修改 |
| 第三方能力配置 | Provider 代码、能力、适配器、端点档案、模型、超时、有限重试、限流、熔断、成本策略、回退链 | 共享 Provider 注册表；基础设施 owner | 只能发布不可变版本并切换 active 指针 |
| 领域业务策略 | 试用/会员额度、积分、等级、游客期限、保留期、养护阈值、题包 release、AI 产品动作上限 | 对应业务域的类型化策略注册表 | 只能经领域审核发布，按生效时间切换 |

**分层方针（用户 2026-10-10，以此为准）**：日常维护以「环境变量 + 策略发布」为主，业务参数尽量少用代码常量。
- 有业务含义、将来可能调整的值（时长、天数、分页默认与上限、推荐条数、上传限制、算法参数等）一律进入**领域业务策略**（BusinessPolicyRelease：不可变版本、SHA-256、active 指针、可回滚、按版本复算），按业务域合并为少量类型化策略，禁止一参一策略与万能 KV。
- 凭证、连接、Provider 运行时限、批量、租约、重试、日志级别等运维参数由**部署环境变量**提供或在配置目录 `environmentOverrides` 登记的上下限内覆盖代码默认值，越界即启动失败；凭证只登记变量名。
- **代码常量只保留**协议、安全、数据完整性不变量与 Schema 硬边界（事实不可变、令牌熵、HMAC 最小字节、端口、单位换算、状态码、枚举、防攻击请求体上限、公开合同绝对上限），每条须写明为何不能是策略或环境变量；代码硬边界同时是对应策略 AJV Schema 的上下限。
- 读取与校验集中在 `cloudfunctions-v2/src/configuration/environment.ts` 与通用类型化策略读取器 `src/foundation/policy/mysql-typed-policy-reader.ts`；策略版本的发布、激活、回滚统一用策略发布 CLI（`cloudfunctions-v2/scripts/policy-release.mjs`，默认 dry-run，条件切换并写审计）。分层判定规则、迁移清单与实施结果见 `configuration-layers.md`（v2），上线顺序见 `configuration-rollout-2026-10-10.md`。

禁止建立任意字符串键值的“万能配置表”。每类策略都必须有独立 TypeScript 类型、AJV Schema、中文字段说明、语义校验和 owner。

## 2. 关键变量唯一目录

本节不再用少量示例代替实施清单。完整事实源是：

- 机器可校验目录：[`configuration-variable-catalog.json`](configuration-variable-catalog.json)；
- 中文阅读版：[`configuration-variable-catalog.md`](configuration-variable-catalog.md)；
- 生成器：`generate-configuration-variable-catalog.mjs`。

目录逐项登记配置 ID、中文名称、领域 owner、类型、单位、已冻结值或 `P1_PENDING`、配置层级、Expected 来源、消费方、变更规则、失败边界、阶段和 ClickUp ticket。实现 Agent 只允许使用 `confirmed` 项；`pending` 项只能继续补合同和证据，其 `blockingScope` 对应能力不得实现；`hard_rule` 必须由代码、约束和测试保证，不能进入运营配置。

当前业务架构的覆盖摘要如下；具体数值和状态以目录为准：

| 领域 | 必须纳管的变量组 | 不允许的做法 |
|---|---|---|
| identity | 游客会话有效期、登录会话轮换窗口、绑定风险阈值 | 用客户端时间或设备 ID 决定统一用户 |
| subscription | 免费用户植物上限、24 小时试用 200 点、会员周期 2,000 点、积分/等级、奖励有效期、月预算 400/450/500 元闸门 | 客户端提交点数、价格、grant 或策略版本 |
| plant-knowledge | 分类权威源优先级、内容结构版本、补全任务租约/预算/背压、展示内容禁区 | 配置绕过身份准入、人工审核或 release |
| user-plant | 可编辑字段、资产数量和生命周期操作窗口 | 配置改变归属或允许跨用户访问 |
| care | 天气新鲜度、盆土证据有效期、算法版本和阈值、提醒窗口 | 配置改变稳定公开输出外壳或把建议写成事实 |
| diagnosis | 题包 release、视觉输入上限、结果 Schema、锁定 Prompt/模型组合 | 运行时自由拼接 Prompt 或读取未发布题包 |
| shared storage | MIME/大小、未绑定/隔离/业务证据保留期 | 任意 URL 抓取、公开用户私图或绕过归属 |

已确认的具体数值仍由对应不可变策略版本承载；“可配置”不表示可以无审核随意变化。任何代码评审中出现目录外的关键业务常量，都必须先回到目录完成分类、来源和变更边界，再允许实现。

## 3. 统一 Provider 注册合同

所有第三方能力都通过“领域 Port（端口接口）→ Adapter（适配器）→ Provider（提供方）”调用。业务域只认识能力和标准化结果，不认识供应商 SDK、环境变量名或原始响应。

```ts
export type ProviderConfig = {
  /** 高熵不可变配置发布引用。 */
  providerConfigRef: string
  /** 稳定供应商代码，例如 baidu_plant、qweather、bailian_qwen、wechat_pay。 */
  providerCode: string
  /** 标准化能力代码；同一供应商可提供多个能力。 */
  capabilityCode: string
  /** 代码内已经审计的适配器种类，不能由配置加载任意模块。 */
  adapterKind: string
  /** 指向代码内端点白名单的档案名，禁止保存任意 URL。 */
  endpointProfile: string
  /** 只保存凭证引用，绝不保存密钥、Cookie 或 token。 */
  credential_ref: string
  timeoutMs: number
  maxAttempts: number
  rateLimitPolicyRef: string
  circuitBreakerPolicyRef: string
  costPolicyRef?: string
  outputContractVersion: string
  fallbackProviderCodes: string[]
  effectiveAt: string
  expiresAt?: string
  releaseVersion: string
  releaseSha256: string
  status: 'draft' | 'published' | 'retired'
}
```

首批统一纳管：百度植物识别、分类权威来源、云百炼/Qwen 问诊与百科补全、和风天气、微信支付、平台通知、CloudBase Auth、Storage、CMS、Agent 工具入口和 MySQL。

Tropicals 实时 API 不再属于百科详情的首批运行时 Provider。目录详情主读是 CloudBase SQL，不依赖该 API。只有以后把它用作可选同步或补源时，才登记 Provider 档案：endpoint profile、`credential_ref`、连接/读取/总超时、有限重试与退避、限流、熔断、成本/预算、回退链、输出合同、审计保留、release 版本、SHA-256、生效/失效时间和失败阻断范围；没有事实的字段统一为 `P1_PENDING`，不得由 Adapter 自行补默认值。

若启用该可选 Provider，还须冻结官方 endpoint profile、30 天评估试用与商业服务权限、缓存与配额、文本署名和图片逐项许可。当前客户端 `VITE_TROPICALS_API_KEY` 直连是待退役的代码现状，不是百科详情的目标路径，也不表示后端受控凭证已实现。身份 crosswalk 与百科 SQL 主读分开，见 [植物目录与百科 SQL 主读](tropicals-api-mvp.md)。

## 4. 请求级配置快照

```text
请求进入
→ 完成主体、归属和能力校验
→ ConfigResolver 读取当前已发布策略与 Provider release
→ 校验版本、SHA、生效时间和能力匹配
→ 形成只读的请求级配置快照 ConfigSnapshot
→ 用例、Adapter 和审计全程使用同一快照
→ 业务结果保存相关 snapshotRef / policyVersion / providerConfigRef
```

- 进行中的请求不受中途切换影响；新版本只影响切换后的新请求。
- 缓存只保存已经验证的不可变 release；缓存不是事实源。
- 配置解析失败时只能使用最近一个已验证版本（last-known-good，最近一个已验证版本），且必须仍在允许有效期内；不得回退到默认空值或源码里的另一套隐式配置。
- 支付、身份、权限、AI 成本和写操作没有安全的最近版本时必须失败关闭；天气、通知等允许降级的能力必须返回明确的新鲜度/未送达状态，不能伪造成功。

## 5. 发布、回滚和审计

每次 Provider 或业务策略发布必须经过：

```text
草稿
→ TypeScript/AJV 结构校验
→ 语义校验与引用存在性检查
→ 领域样例和失败用例测试
→ 审批人/原因/生效时间登记
→ 生成规范化 JSON 与 SHA-256
→ 原子切换 active 指针
→ 读回并生成 ConfigSnapshot
```

- release 内容不可修改。回滚是把 active 指针切回一个仍有效的旧 release，并生成新的审计事件，不覆盖历史。
- 每条审计至少记录 releaseRef、前后版本、SHA-256、操作者、原因、生效时间、回滚引用和受影响能力；不得记录密钥原文。
- 紧急关闭开关必须类型化，包含 owner、原因、创建/到期时间和解除条件；禁止永久无 owner 的布尔开关。

## 6. Provider 回退约束

- 回退只能发生在同一 `capabilityCode`、同一标准化输出合同、已通过数据合规和成本审核的 Provider 之间。
- 支付和统一身份默认不自动跨 Provider 回退；未知结果进入查单/对账，禁止重下单或换供应商重试。
- AI 回退必须继续使用同一个产品动作、额度 reservation、Prompt/Schema release 和成本对账；不能因换 Provider 重复扣点。
- 植物识别、天气和分类来源的标准化结果必须记录实际 Provider、配置版本、时间和原始响应哈希，不能把回退来源伪装成主来源。

## 7. 不可配置硬规则

以下边界写入代码、合同、数据库约束和测试，任何配置都不得绕过：

- 用户植物是一等公民，长期数据必须归属 `user_id + user_plant_id`。
- 固定 HTTP 处理顺序、对象归属校验和公开响应脱敏。
- 游客不能拥有正式用户、用户植物、会员、积分或个人 Agent 上下文。
- 诊断只产生建议；用户确认后才可写事实、计划或提醒。
- 植物身份必须通过准入 release；百度/Qwen 只能形成候选。
- 客户端不能提交积分、AI 点数、价格、成本策略或数据库内部主键。
- 用户私图不得进入公共 CMS；密钥不得进入数据库、CMS、日志、测试或响应。
- Repository 单一 SQL 入口、表写入所有权、事务和唯一约束。

## 8. 测试与验收

- `unit_fake`：Schema、语义校验、active 解析、有效期、Provider 选择、回退和失败关闭。
- `unit_real_data`：真实 release JSON、SHA、active 指针、请求级快照与两版本切换；空库 DDL 和回滚读回。
- `e2e_real_api`：真实 CloudBase 环境中验证配置读回、Provider 调用、超时/限流/熔断、成本与审计；不能用 HTTP 200 或 mock 替代。
- 必须执行负向用例：任意 URL、未知 adapter、缺失 credential_ref、过期 release、SHA 漂移、同版本内容变化、越权策略、回退合同不一致和配置缓存污染。
