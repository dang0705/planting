# 诊断上下文摘要内部合同

- 合同版本：`diagnosis-context-summary/v1`
- 状态：用户 2026-10-10 裁定冻结；**只冻结合同，未实现**（内部接口尚未上线）
- 所有者：`user-plant`（生成摘要）；消费者：`diagnosis`（服务端拼入视觉诊断提示词的可变尾部）
- 机器事实源：[diagnosis-context-summary.v1.schema.json](schemas/diagnosis-context-summary.v1.schema.json)
- 设计依据：`docs/backend-v2/architecture/visual-diagnosis-plan-2026-10-10.md` §12

## 接口

`GET /api/v2/internal/user-plants/{userPlantRef}/diagnosis-context`

- 安全：服务签名（`security=service`），唯一 scope `user-plant.diagnosis-context.read`；只允许 diagnosis 服务端调用，客户端无权调用或提交这些字段。
- 归属：调用方必须携带已解析的 `user_id`；`userPlantRef` 不属于该用户时返回 `USER_PLANT_NOT_FOUND`（不区分「不存在」与「无权访问」）。
- 幂等：只读，`not_applicable`。
- 与通用 `GET /internal/user-plants/{userPlantRef}/context` 分开：用途、字段、长度和隐私边界都不同，独立 scope 便于最小授权。
- 临时案例不调用本接口：由 diagnosis 按同一结构自行组装，`caseKind=temporary_case`，只允许 `plant_identity`、`encyclopedia_needs`、`placement`（城市名）、`recent_radiation`、`climate_profile`。

## 结构

| 字段 | 含义 |
|---|---|
| `contractVersion` | 固定为 `diagnosis-context-summary/v1` |
| `caseKind` | `long_term_plant` 或 `temporary_case` |
| `generatedAt` | 摘要生成时间（UTC） |
| `facts[]` | 最多 12 条，按重要性排序 |
| `facts[].key` | 闭集事实键（见下表）；新增键必须发布新合同版本 |
| `facts[].valueZh` | ≤40 字中文事实摘要 |
| `facts[].observedAt` / `ageDays` | 记录时间与距今天数；气候态等没有时间的事实为 null |
| `facts[].reliability` | `user_entered`、`user_confirmed`、`system_derived`、`third_party` |
| `facts[].freshness` | `fresh`、`stale`、`unknown`；各事实类型的有效期属于待配置项 |

| 事实键 | 内容 | 数据来源（2026-10-10 测试环境已部署） |
|---|---|---|
| `plant_identity` | 规范名、科属、是否已确认 | 用户植物身份确认 |
| `encyclopedia_needs` | 养护难度、温度/湿度区间、光照需求 | 已发布百科 |
| `pot_and_drainage` | 盆尺寸、材质、有无排水孔 | 档案 `measuredPot` |
| `substrate` | 基质组成与主要材料 | 档案 |
| `placement` | 城市名、室内/阳台/户外、朝向、通风 | 档案（只给城市名） |
| `recent_light` | 最近一次 Lux 读数与时间 | Lux 存档 |
| `watering_history` | 近 14 天浇水次数、间隔、最近一次 | care 浇水事实 |
| `soil_observation` | 最近一次盆土观察 | care 事实 |
| `watering_advice` | 最近一次浇水建议的状态与干燥判断 | care 浇水建议（策略 v4） |
| `plan_status` | 近 14 天计划完成/过期 | care 计划 |
| `recent_radiation` | 近 7 天城市短波辐射等级 | Open-Meteo（城市中心坐标，坐标本身不外传） |
| `climate_profile` | 城市气候剖面摘要 | weather |

## 不变量

1. **长度**：最多 12 条 × 每条 ≤40 字，加上键名与时效，合计约 600 tokens 以内；超出时由生成方按重要性从后往前删。
2. **隐私**：不含坐标、地址、门牌、用户昵称或用户在档案里填写的自由文本；`valueZh` 禁止出现经纬度格式的数字。
3. **不长期存储的信息不进入本合同**：症状出现时间与发展速度、附近植物情况、空调/暖气使用等只在本次问诊追问中使用。
4. **缺失与时效**：缺失的事实可以省略；服务端拼装提示词时补「未知」。「无记录」不等于「没发生」。`stale` 的事实只能作参考。
5. **只读、只是建议的依据**：本摘要只用于诊断鉴别和排序，不得被写回养护事实；诊断建议仍需用户确认后才由 care 用例写入。
6. **后续扩展**：施肥/换盆/用药事件（`care_events`）、近期温湿度（`recent_weather`）、可食用性上线后，以 `diagnosis-context-summary/v2` 增加。在此之前，可食用性一律视为「未知」，凡是用药步骤都必须带安全间隔期提示。

## 错误

`VALIDATION_FAILED`、`PRINCIPAL_INVALID`、`USER_PLANT_NOT_FOUND`、`SERVICE_UNAVAILABLE`。
