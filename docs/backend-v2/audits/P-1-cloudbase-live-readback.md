# P-1 CloudBase 实时只读证据

## 1. 边界与结论

- 环境：`cloud1-2grufevs395a9d5e`，地域 `ap-shanghai`。
- 认证：只通过用户 Chrome `default/main` 主 profile 预检既有 CloudBase 登录态；未读取、复制或输出 Cookie、令牌、密钥或变量值。
- 云端工具：仅执行函数、网关、MySQL、数据模型和云存储的只读查询；未执行 DDL、发布、部署、删除、权限变更或数据写入。
- 数据性质：当前业务记录均为测试数据，不构成生产迁移或留存阻断；其中植物主数据、题包、症状和养护知识仍是 v2 可审计的语义候选，不能因是测试数据而不经分析直接删除。
- 采集时间：2026-09-19 22:33 至 22:40（Asia/Shanghai）。

## 2. MySQL 与数据模型

CloudBase MySQL 当前共有 75 张表。以下为 `COUNT(*)` 精确计数，不使用 `INFORMATION_SCHEMA.TABLES.TABLE_ROWS` 的估算值：

| 表 | 精确记录数 | P-1 含义 |
|---|---:|---|
| `plant_catalog` | 200 | 旧植物百科/展示数据候选 |
| `plant_identity_entities` | 192 | 植物身份候选，必须经过权威来源审计与隔离门 |
| `plant_identity_aliases` | 400 | 身份别名候选 |
| `plant_identity_match_rules` | 400 | 身份匹配规则候选 |
| `question_library_v5_real` | 137 | 固定/动态题包问题候选 |
| `question_option_mapping_v5_real` | 429 | 题包选项映射候选 |
| `question_strategy_v5_real` | 231 | 问题策略候选 |
| `problems` | 55 | 诊断问题候选 |
| `symptoms` | 111 | 症状候选 |
| `genus_care_profiles` | 152 | 属级养护候选 |

CloudBase 数据模型列表共 23 个；植物身份实体、别名、匹配规则、题库、选项、策略、症状、问题、属级养护等 MySQL 模型均存在。另有 CloudBase Agent 对话历史的 FLEXDB 模型。

### 2.1 植物身份实时质量门

- `plant_identity_entities`：192 条，其中 `species` 183 条、`genus` 9 条。
- 192 条全部为 `review_status=pending` 且 `is_active=1`。
- 192 条全部标记来源为 `plant_catalog.csv`。
- `scientific_name` 缺失 0 条，`genus_name` 缺失 0 条，`family_name_canonical` 缺失 5 条，`species_name` 缺失 9 条；9 条属级记录没有种名属于层级语义，不可直接按缺陷处理。
- `plant_identity_aliases` 有 16 条找不到对应身份实体的孤儿引用。
- `plant_identity_match_rules` 有 16 条找不到对应身份实体的孤儿引用。

裁决：现有身份数据不能作为 v2 活跃发布集直接使用。P-1 必须形成权威证据、父链、稳定来源 ID、审核状态与运行时隔离门；`pending` 数据不得因 `is_active=1` 被运行时当作已批准身份。

### 2.2 题库实时质量门

`question_library_v5_real` 的 137 条记录分布为：

- 61 条：`audited + active`；
- 20 条：`audited + inactive`；
- 1 条：`inactive + inactive`；
- 55 条：`pending + active`。

裁决：题库存在“待审但启用”的发布隔离缺口。v2 发布读取必须同时受审核状态、发布版本和活动状态约束，不能只检查 `is_active`。

### 2.3 字段设计事实

- 四张植物身份相关旧表的大部分 MySQL `COLUMN_COMMENT` 为空；不符合“中文为一等公民、字段有中文解释”的 v2 规则。
- 旧 CMS 模型只暴露部分业务字段，未完整表达科、属、种、权威来源、稳定来源 ID、父链、证据哈希、发布版本和隔离状态。
- 旧表包含 `_openid`、`owner`、`createBy`、`updateBy`、`_mainDep` 等 CMS/历史所有权字段；这些字段不能进入 v2 植物身份领域合同。

## 3. 云存储

根目录只读清单共 7,345 个对象：

| 一级前缀 | 对象数 | 总字节数 | 主要格式 |
|---|---:|---:|---|
| `diagnose/` | 316 | 60,481,649 | JPG/JPEG/PNG |
| `plants/` | 563 | 266,990,287 | 主要为 JPG，另有 1 个无扩展对象 |
| `weather-cache/` | 6,464 | 21,642,091 | 6,443 JSON、21 JSONL |
| `diagnose-smoke/` | 1 | 1,260,158 | JPG |
| `terminal-e2e/` | 1 | 75,151 | JPG |

裁决：对象清单证明云端可读，消除了“无法访问云存储”的环境阻断；但对象归属、引用关系、MIME、内容哈希、许可、私有路径和删除回退仍须与代码、CMS/MySQL 引用联合审计。对象数量本身不构成保留义务。

## 4. 云函数与网关

- 查询到 23 个云函数，均为 `Active`；包括 `agent-http`、CloudBase Agent 函数、身份、识别、诊断、用户植物、天气、订阅、支付、存储及定时任务。
- `agent-http` 与 CloudBase Agent 函数已经注册；“云端未注册”旧判断不成立。
- 网关共有 21 条启用路由，覆盖默认 HTTP 域、AI Agent 域和历史 `*` 域。
- HTTP 网关总开关开启，但平台级访问鉴权关闭；安全性必须由 v2 的身份、对象归属、内部签名、回调签名和防刷合同明确承担，不能把“路由可达”当成已鉴权。
- 云端仍有 Node.js 18.15 与 Node.js 20.19 运行时；v2 目标 Node.js 22 尚未建立构建与运行证据。

## 5. 外部能力配置存在性

以下只证明脱敏后的环境变量名称存在，不证明变量值正确、供应商账户可用、额度充足或真实调用成功：

- `identify-http`：存在百度植物识别相关变量名。
- `weather-http`：存在和风天气相关变量名。
- `diagnose-http`：存在 CloudBase AI、模型名称、身份票据、会话密钥及养护阈值相关变量名。
- `subscription-http`、`subscription-notify-http`：存在微信支付 V3、商户证书/序列号、通知地址与套餐配置相关变量名。
- 旧 `payment`：仍有另一套旧支付变量名，需在 v2 单一回调入口确定后处置。

所有被核查函数均为 `Active/Available` 且公网访问开启。下一层验证必须使用最小真实请求或供应商沙箱证明合同、签名、额度、超时和失败恢复；不得用变量存在或 HTTP 200 代替。

## 6. 对 P-1 阻断的影响

已经解除：

1. CloudBase 未认证；
2. MySQL/CMS 无法只读；
3. 云存储无法只读；
4. `agent-http` 或 Agent 云端未注册；
5. 网关路由归属完全未知。

仍需继续完成，但不允许笼统停止：

1. 植物身份权威来源、父链、稳定 ID、证据哈希和待审隔离；
2. 题包待审隔离及不可变发布版本；
3. 存储对象反向引用、许可、MIME、内容哈希和私有路径；
4. 百度、和风、百炼、微信支付及平台身份的最小真实/沙箱合同验证；
5. 旧函数/路由到 v2 六域的最终处置和删除前置条件；
6. Node.js 22、TypeScript、CloudBase HTTP 函数构建与运行证伪。
