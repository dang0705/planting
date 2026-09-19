# P0 外部能力卡片独立出口门

> Ticket：`z8v0kmr9dv`  
> 独立复核代理：`p0_integration_review_luna`  
> 本次复核：2026-09-19（Asia/Shanghai）  
> P0 ticket 合同/证伪出口：`PASS`  
> 真实集成出口：`STOP`（14 张卡均为 `INTEGRATION_STOP`；不代表合同 ticket 失败，也不代表可以发布）

## 1. 双轴结论

第三版已满足本 ticket 的合同/证伪验收：每张卡都有精确的 GO/STOP 解释，设计缺口被卡片级或数值子项级 `CONTRACT_STOP` 明确阻断，真实环境证据则独立落在 `INTEGRATION_STOP`。因此必须把两个出口分开记录：

| 检查轴 | 结论 | 复核结果 |
|---|---|---|
| P0 ticket 合同/证伪 | `PASS` | 14 张卡覆盖范围完整；ID/标题精确唯一；15 个必需字段逐卡非空；双轴结论、证据等级、STOP 原因和 GO 门齐全；全部未决数值子项均显式 `CONTRACT_STOP`。 |
| 真实集成 | `STOP` | 没有本 ticket 新取得的真实供应商、支付 sandbox、目标 CloudBase/Storage/MySQL/Agent 或故障恢复 S4；所有卡保持 `INTEGRATION_STOP`。 |
| 公开发布/能力整体 | `STOP` | `ticket PASS` 只表示合同登记册和证伪门关闭，不是任一外部能力已接通，也不是 P1/发布授权。 |
| verifier 指定门 | `PASS` | 正向 verifier `exit=0`；五类指定 mutation 各自 `exit=1`；self-test `exit=0`。 |

这里的 `PASS` 严格限定为 `z8v0kmr9dv` 的 P0 合同/证伪出口。不能把它写成真实能力 `GO`，也不能因集成 STOP 把已完成的合同设计门重新判成 PARTIAL。

本轮只读核对计划、合同、卡片、静态脚本和官方资料；没有修改原卡、业务代码、云端、CloudBase/MySQL、`docs/backend-v2/tracker/module-status.json` 或 ClickUp 状态。

## 2. 14 张卡范围与字段

### 2.1 精确 ID mapping

独立解析确认卡片数量为 14，标题与 ID 严格按下表一一对应；ID 使用精确相等，不是前缀或包含匹配：

| ID | 标题 | 合同轴 | 集成轴 |
|---|---|---|---|
| `P0-EXT-01` | 游客盆土视觉 | `CONTRACT_STOP` | `INTEGRATION_STOP` |
| `P0-EXT-02` | 游客会话认领 | `CONTRACT_GO` | `INTEGRATION_STOP` |
| `P0-EXT-03` | CloudBase 匿名身份 | `CONTRACT_GO` + TTL 子项 STOP | `INTEGRATION_STOP` |
| `P0-EXT-04` | 百度植物识别 | `CONTRACT_STOP` | `INTEGRATION_STOP` |
| `P0-EXT-05` | 和风天气 | `CONTRACT_STOP` | `INTEGRATION_STOP` |
| `P0-EXT-06` | Qwen 诊断 | `CONTRACT_STOP` | `INTEGRATION_STOP` |
| `P0-EXT-07` | Qwen 百科 | `CONTRACT_STOP` | `INTEGRATION_STOP` |
| `P0-EXT-08` | 支付回调 | `CONTRACT_STOP` | `INTEGRATION_STOP` |
| `P0-EXT-09` | Storage | `CONTRACT_GO` + TTL 子项 STOP | `INTEGRATION_STOP` |
| `P0-EXT-10` | CloudBase Agent | `CONTRACT_STOP` | `INTEGRATION_STOP` |
| `P0-EXT-11` | CMS 队列 | `CONTRACT_GO` + 数值子项 STOP | `INTEGRATION_STOP` |
| `P0-EXT-12` | CloudBase MySQL | `CONTRACT_GO` + 数值子项 STOP | `INTEGRATION_STOP` |
| `P0-EXT-13` | `/api/v2` 网关 | `CONTRACT_GO` + 数值子项 STOP | `INTEGRATION_STOP` |
| `P0-EXT-14` | outbox/inbox | `CONTRACT_GO` + 数值子项 STOP | `INTEGRATION_STOP` |

Ticket 规格要求的游客能力、匿名身份、百度、和风、Qwen、支付、Storage、Agent、CMS 队列、MySQL、网关和可靠事件均有卡；这证明本 ticket 范围闭合，不代替四个 P0 ticket 的总范围矩阵。

### 2.2 必需字段

14 张卡均有非空的以下 15 个字段：

`卡片 ID`、`Owner`、`输入 / 输出`、`认证 / 权限`、`超时 / 有限重试`、`幂等`、`费用`、`隐私 / 日志`、`失败隔离`、`证据`、`证据等级`、`本地合同冻结结论`、`真实集成准入结论`、`STOP 原因`、`GO 门`。

独立解析结果：14 个 ID 唯一、14 个标题唯一、字段缺失 0、STOP 原因缺失 0。字段非空检查与合同语义分开；未决字段不能靠写一段说明伪装成 GO。

## 3. 合同 STOP 和数值子项

### 3.1 卡片级 `CONTRACT_STOP`

以下 7 张卡的供应商/模型/支付/Agent 合同缺口已明确标为合同 STOP，阻断范围精确到对应能力：

`P0-EXT-01` 游客盆土视觉、`P0-EXT-04` 百度、`P0-EXT-05` 和风、`P0-EXT-06` Qwen 诊断、`P0-EXT-07` Qwen 百科、`P0-EXT-08` 支付回调、`P0-EXT-10` CloudBase Agent。

缺口包括精确模型/endpoint/Prompt hash/Schema、套餐/预算/限流、支付平台/商户/唯一 owner/算法、Agent 工具协议/审计字段等。它们没有被错误归因于 S4 缺失。

### 3.2 所有显式数值/TTL 子项均 STOP

独立解析到的 6 个数值子项如下，全部以 `CONTRACT_STOP` 开头：

| 卡 | 子项 | STOP 范围 |
|---|---|---|
| `P0-EXT-03` | guest session/claim context TTL | TTL、续期、失效读回未确认；不得借用 CloudBase 匿名主体长期策略。 |
| `P0-EXT-09` | Storage TTL | 存储模式和私有 URL TTL 未确认；Classic `maxAge`/`expiresIn` 不能填充数值。 |
| `P0-EXT-11` | CMS 队列数值 | lease、积压/告警阈值、预算恢复门未确认；模型预算保持 0。 |
| `P0-EXT-12` | MySQL 数值 | 连接池上限、连接/事务 deadline、实例容量需真实环境读回。 |
| `P0-EXT-13` | 网关数值 | 网关/函数并发、外部预算、告警阈值需容量基线和用户确认。 |
| `P0-EXT-14` | outbox/inbox 数值 | Dispatcher 频率、lease、积压/告警、重放预算未确认。 |

这满足“无数值子项隐式 GO”的合同门。可执行算法和边界可以先冻结；尚未确认的数字继续精确阻断依赖它们的启用或真实集成。

## 4. 匿名主体与 guest_session TTL 分层

当前 `P0-EXT-03` 已明确三层边界：

1. CloudBase 匿名凭证产生平台匿名主体；它不是青花植业务 `user_id`。
2. 青花植用独立 `guest_session_id`/claim context 生成短期 guest Principal，并单独定义 TTL、续期和失效。
3. 登录/认领后由 `identity` 显式映射统一 `user_id`；匿名主体不能直接成为长期用户植物、积分、会员或 Agent 上下文归属键。

CloudBase 官方 FAQ 说明匿名用户是有唯一标识的有效用户、每设备一个且本身不会自动过期；当前卡片没有把平台匿名主体的长期策略当成应用 guest session TTL，而是把应用 TTL 单独置为 `CONTRACT_STOP`，分层正确。

## 5. S1-S4 与 `GO ⇒ S4`

| 等级/规则 | 本轮事实 |
|---|---|
| S1 | 14 张卡均有计划、合同或官方资料 Expected。 |
| S2 | 本卡没有逐卡正向 S2；P-1 live-readback 只证明有限云端只读事实，不替代业务闭环。 |
| S3 | 少数卡引用既有 `unit_fake`/静态检查；不能替代真实外部环境。 |
| S4 | 0 张卡正向拥有 S4；各卡真实集成保持 STOP。 |
| `INTEGRATION_GO ⇒ S4` | verifier 已加入硬规则；将第一张卡 mutation 为 `INTEGRATION_GO` 且保持 S3/S1 证据时，必然失败。实际源文件没有 `INTEGRATION_GO`。 |
| `CONTRACT_GO` 与 S4 | 合同 GO 不要求 S4；它只表示本地/官方可审计合同已冻结。S4 只决定真实集成轴。 |

因此“ticket PASS、integration STOP”不是冲突：前者关闭决策/证伪登记册，后者阻止真实接通和发布。

## 6. verifier 实际运行证据

本轮在未修改原卡的前提下实际运行：

```text
node docs/backend-v2/audits/P0-external-capability-cards-z8v0kmr9dv.verify.mjs
→ exit 0；14 张卡非空字段、唯一 ID/标题、双轴结论、证据等级和 STOP 原因通过。

node docs/backend-v2/audits/P0-external-capability-cards-z8v0kmr9dv.verify.mjs --self-test
→ exit 0；五类负向变异均被捕获。

--mutation-duplicate-id
→ exit 1；捕获重复 `P0-EXT-02` 和 P0-EXT-01 mapping 错误。

--mutation-fake-id
→ exit 1；捕获 `P0-EXT-99` 不等于预期 ID。

--mutation-integration-go-s3
→ exit 1；捕获 `INTEGRATION_GO` 必须附 S4。

--mutation-go-placeholder
→ exit 1；捕获 `CONTRACT_GO` 的 `费用` 占位值。

--mutation-remove-owner
→ exit 1；捕获 Owner 留空。

sha256sum -c docs/backend-v2/decisions/P0-external-capability-cards.sha256
→ OK。
```

第三版 verifier 已不再使用前一版的 `includes` ID 判断；当前预期 ID使用精确正则和精确相等。它仍是结构/合同最小门，不代替真实业务语义和 S4 回放；但本 ticket 指定的五类 mutation 门已经全部通过。

## 7. 四项 CloudBase 官方事实

以下只核对官方产品事实，不把文档事实当作目标环境已经接通：

| 事实 | 当前卡片是否一致 |
|---|---|
| 匿名登录需显式开启；匿名用户具有唯一平台标识且本身不过期 | 一致；应用 `guest_session` TTL 已独立 STOP。 |
| Classic Storage 返回 `fileID`；Classic `expiresIn`/`maxAge` 不提供可控 TTL，需要可控过期时选 PG 签名 URL | 一致；Storage TTL 子项显式 STOP。 |
| CloudBase MySQL SDK 不支持事务；需要事务必须用原生 MySQL SDK 并管理连接/事务状态 | 一致；MySQL 数值子项和真实库验收仍 STOP。 |
| HTTP Node.js 22.21、`/var/lang/node22/bin/node`、9000 端口和必需 `scf_bootstrap` | 一致；官方运行时支持不等于当前 `/api/v2` 包和真实路由已验收。 |

官方资料：

- [CloudBase 匿名登录](https://docs.cloudbase.net/authentication-v2/method/anonymous) 与 [匿名登录 FAQ](https://docs.cloudbase.net/authentication-v2/auth/faq)
- [CloudBase Classic Storage](https://docs.cloudbase.net/en/api-reference/webv3/storage)
- [CloudBase MySQL FAQ](https://docs.cloudbase.net/en/database/configuration/db/tdsql/faq)
- [CloudBase 运行环境支持](https://docs.cloudbase.net/en/cloud-function/runtime-support) 与 [HTTP 云函数编写](https://docs.cloudbase.net/en/cloud-function/develop/how-to-writing-functions-code)

## 8. 真实集成 STOP 与可继续边界

14 张卡均保持 `INTEGRATION_STOP`。未取得真实百度/和风/Qwen、支付 sandbox、目标 Storage 写入/删除、CloudBase Agent 工具调用、真实 MySQL DDL/事务/故障注入、outbox 重放或 CMS release S4；不能用配置键、mock、`unit_fake`、health 200 或官方文档改写为 GO。

同时，以下不应被集成 STOP 阻断，可继续做本地合同和无外部副作用测试：游客认领状态机、`/api/v2` 路由/DTO/权限矩阵、CMS lease/重试机械状态、outbox/inbox DTO/唯一键、Storage 私有资产状态机、匿名 Principal 与 `user_id` 映射。真实集成 STOP 只阻断对应能力，不扩散到固定题包、已发布内容查询或游客非生成式基础浇水。

## 9. 后续动作与最终判定

### ticket PASS 的边界

`z8v0kmr9dv` 可以记录为 `PASS`，含义是合同/证伪登记册满足验收：范围、字段、双轴、精确 ID、五类 mutation、证据等级、数值子项 STOP 和 SHA 均可回放。它不表示 14 张卡都为 GO，也不表示允许发布。

### integration STOP 的边界

真实供应商、支付、Storage、Agent、MySQL、CMS release、网关和可靠事件仍逐能力 `INTEGRATION_STOP`；待各自取得脱敏 S4（成功/拒绝/超时/重试/费用或配额/读回/故障恢复）后，才可独立转为 `INTEGRATION_GO`。

### 继续条件

保持原卡不变，后续实现必须引用本登记册的具体 STOP 范围；新增真实证据只保存环境/账号归属、状态类别、延迟、重试/超时、费用/配额类别、结果哈希和读回时间，不记录凭证、平台主体、私图 URL、Prompt、原始模型响应、支付原文或内部主键。

最终双轴判定：**P0 ticket 合同/证伪 `PASS`；真实集成 `STOP`；公开能力/发布 `STOP`。**
