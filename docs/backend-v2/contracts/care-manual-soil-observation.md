# 手工盆土表面原子观察窄合同

- 合同版本：`care-manual-soil-observation/v1`
- 所有者：`care`
- 范围：已登录用户对其用户植物提交一次手工盆土表面观察；仅追加一条环境原子事实。
- 本合同不是盆土视觉识别 API，也不冻结 HTTP 路由、视觉 Provider 或养护算法。

## 1. Expected 来源与裁决边界

本合同 Expected 由以下 v2 事实源交叉限定，不从旧函数、旧页面或当前运行输出反推：

| Expected | 事实来源 |
|---|---|
| 一个观察只表达一个因素；盆土表面取值为 `wet`、`moist`、`dry`、`uncertain`；单位为无量纲 `none` | [养护原子环境事实与派生指标](care-environment-foundation.md)；配置目录 `care.soil_evidence.states` |
| 原子观察要记录来源、范围、规范值、单位、观察时间、可用截止时间、置信度和 SHA-256；只追加，不可改写 | [养护原子环境事实与派生指标](care-environment-foundation.md)；`schema/004_care_diagnosis.sql` 的 `care_environment_observations` 与不可变触发器 |
| 长期用户植物观察归属于用户及用户植物；`care` 写自己的观察，不能改写用户植物档案或跨域表 | [数据表所有权](../data/table-ownership.md)；[用户植物合同](user-plant.md)；`schema/004_care_diagnosis.sql` 的复合归属外键 |
| 所有状态写请求使用共享 `Idempotency-Key`；同键同参重放结果，同键异参冲突 | [HTTP API 公共合同](http-api.md) 第 4 节 |
| 手工盆土观察可作为环境事实来源；视觉短时有效期、新鲜度策略与算法须先有已发布配置，缺少证明时不参与推导 | [P4 阶段合同](../phases/P4-care-diagnosis-agent.md)；配置目录 `care.soil_evidence.ttl_hours`、`care.environment.factor_freshness_policy_release`、`care.environment.derivation_algorithm_release` |
| 视觉或诊断建议不能自动成为浇水、养护事实、计划或提醒 | [统一养护能力输出](care-capability-output.md)；[养护原子环境事实与派生指标](care-environment-foundation.md) |

配置目录中盆土视觉 TTL、新鲜度策略、环境派生算法和四类能力算法均为 `P1_PENDING`；本合同不为它们设置值、默认值或替代策略。状态集合与“事实不可改写”是既有硬规则，不新增配置项。

## 2. 手工观察的写入语义

这是一个“用户报告自己刚刚检查到的表面状态”的原子观察，不代表盆内整体含水量、根区湿度、浇水时机或浇水动作。

| 字段 | 本切片固定语义 |
|---|---|
| `factorType` | 固定为 `soil_surface` |
| `sourceScope` | 固定为 `pot`，不得改成室内、植物周围或室外测量 |
| `sourceKind` | 固定为 `user_context`；不得伪装成视觉、传感器或已确认的浇水事实 |
| `normalizedValue` | 单个状态字符串：`wet`、`moist`、`dry` 或 `uncertain`；不扩展成建议或模型解释 |
| `unitCode` | 固定为 `none` |
| `confidence` | 请求必须显式包含 `low`、`medium` 或 `high`，表示用户对这次手工观察的自评把握；服务端不得猜测或填默认值。状态与把握度是两个独立字段，不做未冻结的自动映射 |
| `observedAt` | 由 care 服务在首次接受该命令时读取一次 UTC 时钟并记录；请求正文不得回填或改写时间 |
| `validUntil` | 固定为 `null`，意为“当前没有已冻结的可参与计算截止时间”，**不**意为永久新鲜或可无限期复用 |
| `sourceRef` | 服务端生成的高熵、不含用户/平台/数据库主键的来源公开引用；不得保存原始 `Idempotency-Key`、图片 URL 或凭证 |
| `evidenceHash` | 服务端按下述固定字段计算小写 64 位 SHA-256；客户端不得提交或覆盖 |

仓库 API 清单已登记 `POST /api/v2/care/soil-assessments`，安全范围为 `guest_or_authenticated`，但它仍指向未细化的 `SoilAssessmentRequest`；OpenAPI 仅有拒绝额外字段的空对象壳。该占位路由不等于已冻结的手工观察或视觉合同。本合同不绑定/改写该路由，也不把游客案例转换成用户植物；接线时必须先单独冻结路由意图、DTO、游客临时持久化和能力边界。

`evidenceHash` 的输入为下列规范 JSON 对象，使用 UTF-8、键名升序、无多余空白的规范 JSON 序列化后计算 SHA-256。数组、浮点数和内部主键不进入该对象：

```json
{
  "confidence": "medium",
  "contractVersion": "care-environment-foundation/v1",
  "factorType": "soil_surface",
  "normalizedValue": "dry",
  "observedAt": "由服务端时钟产生的 RFC 3339 UTC 时间",
  "sourceKind": "user_context",
  "sourceRef": "服务端生成的来源引用",
  "sourceScope": "pot",
  "unitCode": "none",
  "validUntil": null
}
```

示例中的状态、把握度、来源引用和时间只展示字段形状，不构成固定默认值、算法阈值或 API 示例响应。`user_id`、`user_plant_id`、平台主体及数据库内部主键不进入公开字段或哈希输入；归属由已认证主体、user-plant 所有权核验和数据库复合外键共同约束。

## 3. 归属、幂等与不可变更

1. 仅接受已认证的 `UserPrincipal` 和其有权访问的既有用户植物。主体从认证上下文取得；植物归属通过 user-plant 的用户范围读取/授权边界核验，care 不自行解析平台身份，也不接受客户端传入 `user_id` 或内部主键。
2. care 仅向 `care_environment_observations` 追加记录。复合归属外键必须绑定同一用户的用户植物；公开引用不得泄露内部主键。
3. 该命令必须经过共享幂等层。在共享幂等记录有效保留范围内，同键同参重放同一公开结果且不新增观察；同键异参按 `http-api/v1` 返回 `IDEMPOTENCY_CONFLICT`。不得为本用例另设或延长幂等保留期。幂等记录与观察写入须满足共享 HTTP 合同的事务/未知提交恢复要求；该事务闭环仍需真实 MySQL 验收。
4. 不论本次状态是否与上一条相同，新的检查命令都是新观察，只能追加；不得更新、覆盖或删除旧观察。修正内容须作为新的观察写入。
5. 因 `validUntil` 为 `null` 且新鲜度策略未冻结，此记录仅可作为审计/历史观察读回；不得进入“当前盆土”输入、环境推导、浇水安全门或任何四类养护能力的 `ready` 结论。依赖当前盆土证据的能力必须按既有合同返回 `insufficient_evidence`，直到存在可证明新鲜度的受支持证据。

## 4. 失败边界与禁止副作用

| 条件 | 必须行为 |
|---|---|
| 未认证、主体无效或植物不存在/不属于当前主体 | 按身份与用户植物既有合同拒绝；不得插入观察。跨用户对象不得暴露存在性 |
| 状态、把握度或合同值缺失/非法，或请求试图提交服务器字段 | 按严格 DTO 校验拒绝；不得插入观察或静默丢弃非法字段 |
| 缺少幂等键、同键异参或并发重放 | 按 [HTTP API 公共合同](http-api.md) 拒绝/重放；不得产生重复观察 |
| 哈希校验/序列化、归属校验、唯一约束或事务失败 | 失败关闭并回滚本次观察；不得留下半写记录或补写到其他领域 |
| 观察被读取用于派生，但没有有效截止时间或当前新鲜度证明 | 排除该观察，不得把“未知”解释为 `wet`、`moist`、`dry`，也不得以旧观察冒充当前测量 |

本用例**不**写 `care_facts`（尤其不记录浇水）、`care_context`、用户植物档案/资产/时间线、计划、提醒、诊断会话/答案/证据/结果、盆土视觉证据表或环境快照/派生表；不调用视觉模型、第三方 Provider、天气或养护算法；不产生建议、奖励事件或四类能力输出。手工检查不是图片证据，也不得复用 `watering_visual_evidence` 的视觉状态或 TTL 语义。

## 5. 可执行 Expected 与测试边界

Expected 固定来自本合同第 1 节所列架构、合同、配置硬规则和 DDL；实现文件、旧路由或旧算法不得作为验收预期。父级实现时应先落独立测试，再写产品代码：

| 层次 | 本窄切片可验证内容 | 替代边界与明确未覆盖 |
|---|---|---|
| `unit_fake` | 规范化映射固定为 `soil_surface/pot/user_context/none`；四种状态和三种显式把握度接受；非法/缺省值拒绝；哈希输入不含内部主键；无过期策略时观察不具备当前证据资格；失败分支不触发写端口 | 使用 fake 时只能证明领域映射/门控，不证明所有权、事务、幂等持久化、DDL 触发器或真实 API |
| 静态制品检查（不计入运行层验收） | 读取合同、配置目录、数据字典和 `004_care_diagnosis.sql`；核对字段、枚举、复合归属外键、唯一来源键、SHA 格式约束与不可变触发器；验证注册表 SHA-256 | 只能证明仓库制品相互一致，不等于 SQL 被真实 MySQL 执行或持久化读回 |
| `unit_real_data` | 在隔离的真实 MySQL v2 DDL 中，分别以已归属用户植物、跨用户植物和重复来源夹具写入；读回来源、状态、哈希和时间；验证跨用户拒绝、重复拒绝、UPDATE 被触发器拒绝及失败后无半写记录 | 直连 Repository/数据库只能证明持久化边界；不证明真实 HTTP 身份解析、共享幂等层、公开响应或 CloudBase 环境 |
| `e2e_real_api` | 后续以真实 HTTP 入口、身份解析、user-plant 归属读取、共享幂等存储、真实测试 MySQL 一次性验证创建、同键重放、同键异参、跨用户拒绝、写入后读回及响应/日志脱敏 | 不在本合同文档变更中运行；本地 fake、直连 Repository、HTTP 200 或当前旧服务均不能替代此验收 |

这一切片的可实施停点是“手工观察只追加并可读回，但不能冒充当前新鲜证据”。如何将此命令接入现有 `/api/v2/care/soil-assessments` 占位路由，路由是否继续接受游客，以及公开 DTO、归档/删除中用户植物是否仍可追加新观察、基于后续新鲜度策略的 `validUntil` 赋值，均须另行冻结；未冻结前不得扩大为视觉或四类养护闭环。
