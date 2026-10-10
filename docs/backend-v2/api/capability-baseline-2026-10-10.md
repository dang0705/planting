# 后端能力基线清单（2026-10-10）

> 用途：Figma 设计核对的后端基线。设计稿中的界面逻辑应以「已冻结合同 + 已部署实现」为准；本清单之外的能力在设计中须标为“待后端”。
> 机器版：[capability-baseline-2026-10-10.json](capability-baseline-2026-10-10.json)。路由来源：[route-registry.json](route-registry.json)（61 条，其中内部接口 10 条单列文末）。

## 判定方法

- **合同**：读 `docs/backend-v2/contracts/contract-registry.json` 与合同文件头部状态，以及 `cloudfunctions-v2/models/**` 中声明“已冻结”的 HTTP 合同。`openapi.p1.json` 自述仅冻结路由骨架，字段以合同文件为准。
- **实现**：在 `cloudfunctions-v2/src/**/http/` 中查找路由登记并确认被对应 `server.ts` 的 `createRouteDispatcher` 挂载。
- **已部署**：2026-10-10 对测试环境网关 `https://cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com` 实测。无凭证请求；GET 用 GET（search 类附 ?q=test），写接口发 {} + content-type: application/json；路径参数填 probe-dummy-ref；请求间隔 1.5 秒。未带任何凭证，未创建数据。
  - 200 / 400 / 401 / 业务 404（如“植物不存在或尚未发布”）= 已部署；
  - 404「请求路由不存在」= 请求到了函数，但部署版本里没有这条路由；404 `INVALID_PATH` = 网关没有该前缀，函数未接入；405 = 函数认得路径但没有这个方法（部署版本早于实现）；
  - 503 = 路由在，但无凭证请求在认证前就失败（测试环境缺该写接口的已发布策略快照，按设计“关闭失败”——推断，需带凭证复核）。
- **局限**：无凭证只能证明“路由存在”，不能证明部署版本包含 2026-10-10 的字段增补；“可用”的写接口仍需带测试凭证做一次读回联调。

## 结论速览

| 结论 | 公开路由数 |
|---|---|
| 可用 | 23 |
| 已部署但测试环境不可用 | 2 |
| 已实现未部署 | 6 |
| 仅合同 | 3 |
| 未实现（合同未定义） | 17 |
| 合计 | 51 |

## 一、按用户可见能力归纳

| 能力 | 状态 | 说明 | 依据（实测/代码） |
|---|---|---|---|
| 登录与游客 | 部分可用 | 微信/抖音/小红书登录换会话、抖音/小红书游客令牌：可用。多平台绑定/解绑、`GET /me`（个人信息）：合同未定义、未实现、未部署。 | identity/sessions、guest-sessions 实测 400 业务校验；bindings、/me 实测 404「请求路由不存在」 |
| 植物搜索与百科 | 可用（识别除外） | 目录搜索（27 万级，主搜索框）、已发布身份搜索与读取、百科详情（含封面图与署名）均可用。拍照识别 `identifications`：合同未定义、未实现。 | catalog/search 实测 200 有数据；search 200；encyclopedia 400 参数校验；identifications 404 |
| 城市气候推荐 | 可用 | 城市列表、单城剖面、城市×植物适配度、按城市推荐植物均可用（仅户外城市气候，非室内实测）。 | profiles 实测 200 有数据；fit/recommendations 无参 400 |
| 添加植物（临时案例/认领/创建） | 部分可用 | 创建临时案例、游客认领、新建空白植物：可用。登录用户把临时案例并入花园（ephemeral-cases bindings）：已部署但测试环境返回 503（缺已发布写策略快照，推断）。 | temporary-cases/claims/user-plants POST 均 401；ephemeral bindings 503 |
| 我的花园（列表/详情/归档/删除） | 部分可用 | 详情、归档、恢复：可用。**列表 `GET /user-plants` 与删除 `DELETE`：代码已实现，测试环境未部署**（实测 405，部署版本早于该实现）。身份确认 identity-confirmations：已实现未部署。 | GET /user-plants 405；DELETE 405；identity-confirmations 404「请求路由不存在」 |
| 植物档案（盆型、基质、位置、光照、通风） | 合同冻结+已实现，测试环境不可用 | `PATCH /user-plants/{ref}` 合同 profile-patch/v2 已冻结、代码已实现；但测试环境实测 503（认证前即失败，缺已发布写策略快照），且本地 user-plant 构建产物不含 v2 新分组，**部署版本大概率仍是 v1（仅昵称+实测盆器）**。界面可按 v2 字段设计，但当前无法联调。 | PATCH 503；dist/functions/user-plant 不含 profile-patch/v2 |
| 浇水建议（临时/长期） | 可用（需带凭证复核增补字段） | `POST /care/watering-advice` 已部署：输出 status、details.action、details.checkWindow（检查盆土窗口）、details.amountMl（建议浇入区间）、details.missingEvidence。缺失码 `plant_light`、`outdoor_radiation` 为 2026-10-10 增补，本地 care 构建产物已包含，但无凭证无法实测返回体。**`plant_location` 在合同与代码中都不存在**；长期植物目前仍由请求体传经纬度，档案 `location.cityRef → 城市中心坐标` 属 care 合同待修订项（environment-profile §6）。 | watering-advice 401；grep 无 plant_location |
| 长期养护（建议确认、检查计划、完成、过期） | 可用 | 确认/忽略建议、计划列表（含 expired）、完成/跳过计划、记录浇水事实、养护摘要：全部已部署。计划过期由每小时定时任务写入，过期后完成返回 409 CARE_PLAN_EXPIRED。 | 5 条 care/user-plants/* 均 401 |
| 近期浇水 / 浇水历史 / 日历 | 部分可用 | 见下方专节。摘要只给“上次一次浇水”；**没有“浇水事实列表/历史”读取接口**；时间线接口合同已冻结但未实现。日历只提供“加入手机日历”所需字段（calendar），服务端不推送提醒。 | summary/plans 401；timeline 404 |
| 时间线 | 仅合同 | `GET /user-plants/{ref}/timeline` 合同已冻结（浇水、完成检查、归档、恢复四类），未实现、未部署；前置项：care 可靠事件迁移与派发形态尚待确认。 | timeline 404「请求路由不存在」 |
| 封面图 | 仅合同 | `POST /user-plants/{ref}/assets` 合同已冻结（每株一张，600 秒临时链接；列表只给 hasCover），未实现：缺云存储服务端 SDK 依赖与凭证授权。百科/推荐里的 Tropicals 封面 `coverImage{url,source}` 已可用。 | assets 404 |
| 诊断/问诊 | 已实现未部署 | 创建问诊、提交答案、读取结果已在 diagnosis 函数实现，但**网关未接入 `/api/v2/diagnosis` 前缀**（实测 CloudBase INVALID_PATH）。结果 Schema 与诊断知识仍是 P1_PENDING，知识未发布。植物诊断历史 `user-plants/{ref}/diagnoses`：合同未定义、未实现。 | diagnosis/* 404 INVALID_PATH |
| 订阅与积分 | 未实现 | 订阅、试用、权益、订单、积分概览/流水/兑换、AI 额度：只有业务数值合同（care-points-and-ai-quota、reward-events），无字段级 HTTP 合同、无实现、网关无前缀。首株完整档案会写积分事件（user-plant 侧），但无人消费、无读取接口。 | subscription/* 全部 404 INVALID_PATH |
| 小青 Agent | 未实现 | 按宪章使用 CloudBase Agent，不建 HTTP 函数；其依赖的内部 `agent-context` 受控上下文接口合同未定义、未实现。 | internal agent-context 404 INVALID_PATH；src 无 Agent 实现 |

## 二、专题：「近期浇水」界面需要什么、后端给什么

界面通常要展示：①上次浇水时间与水量；②现在该不该浇 / 下一次什么时候看盆土；③待办的检查计划（可加入手机日历）；④最近几次浇水记录；⑤一键“我浇过水了”。

| 界面数据 | 后端接口 | 状态 | 说明 |
|---|---|---|---|
| 上次浇水（时间、水量） | `GET /care/user-plants/{ref}/summary` → `lastWatering{occurredAt, amountMl}` | 可用 | 只给**最近一次**，不是列表 |
| 当前建议（该不该浇、检查窗口） | summary → `latestWateringAdvice{generatedAt, status, action, checkWindow, proposal{proposalRef,status,validUntil}}` | 可用 | 只读上次算好的结果，不重新计算；要刷新需调 watering-advice |
| 重新计算建议（含浇水量） | `POST /care/watering-advice`（target.kind=user_plant） | 可用 | 需前端提交 location/window/lightReading/soil 等；返回 checkWindow、amountMl、missingEvidence 和可确认的 proposalRef |
| 下一个待办检查 | summary → `nextPlan{planRef, scheduledAt, status, calendar}` | 可用 | 只取 planned；已过期计划不出现 |
| 检查计划列表 / 已过期提示 | `GET /care/user-plants/{ref}/plans?status=planned\|completed\|cancelled\|expired` | 可用 | 带 calendar{title,startAt,endAt,notes}，前端调平台“添加到日历” |
| 档案是否够算浇水量 | summary → `profileReadiness{hasMeasuredPot, hasCatalogBinding}` | 可用 | 可用于“补全盆器/品种”引导 |
| 我浇过水了 | `POST /care/user-plants/{ref}/facts`（factType=watering，可补录 7 天） | 可用 | 必带 Idempotency-Key |
| 确认建议 → 生成检查计划 | `POST …/proposals/{proposalRef}/confirmations` | 可用 | decision：安排检查 / 直接记浇水 / 忽略 |
| 完成/跳过检查 | `POST …/plans/{planRef}/completions` | 可用 | 过期计划 409 CARE_PLAN_EXPIRED |
| **最近 N 次浇水记录 / 浇水历史** | 无 `GET facts` 接口；替代方案 `GET /user-plants/{ref}/timeline`（itemType=care_watering） | **仅合同** | 时间线合同已冻结但未实现未部署；在它上线前，界面只能显示“上次浇水” |
| 浇水日历视图（按月看哪天浇过） | 无专用接口 | 未定义 | 只能由时间线分页拼装；服务端不推送提醒 |
| 跨植物“今日待浇”汇总（首页） | 无专用接口 | 未定义 | 需前端对花园列表逐株调 summary；而花园列表 `GET /user-plants` 当前未部署 |

**结论**：「近期浇水」的单株核心数据（上次浇水、当前建议、下一次检查、计划列表、记录浇水）后端已可用；“浇水历史列表/日历/首页跨植物汇总”目前没有可用接口，设计稿应标注为待后端，或只用“上次浇水 + 下一次检查”两个信息位。

### 浇水建议输出与缺失提示码（设计核对要点）

- `result.status`：`ready`（可给结论）/ `insufficient_evidence`（缺证据）/ `temporarily_unavailable`（无活动策略，200 非错误）。`confidence` 当前恒为 `low`。
- `details.checkWindow`：检查盆土的时间窗口与当地日期；`details.amountMl`：建议浇入区间（缺盆器时为缺证据）；`details.action`：行动类别（可确认的有 water_allowed / check_later / check_now / priority_check）。
- `details.missingEvidence` 新增码（2026-10-10，仅 insufficient_evidence 时追加）：`outdoor_radiation`→提示“暂时取不到天气数据，请稍后再试”；`plant_light`→提示“请在白天明亮时段、于植物位置重新测一次光照”。长期植物无品种绑定时缺 `plant_baseline`。
- **`plant_location` 不存在**：合同（`cloudfunctions-v2/models/care/watering-advice-http-contract.md`）和代码都没有这个码。长期植物目前位置仍由请求体 `location{latitude,longitude}` 提供；“从档案城市取坐标、档案无位置时如何提示”是 care 合同待修订项，设计稿不应依赖 `plant_location`。

## 三、逐条路由（公开接口）

### 身份（identity）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `POST /api/v2/identity/sessions` | docs/backend-v2/contracts/identity-session-issuance.md（已冻结） | `cloudfunctions-v2/src/identity/http/routes.ts:8 + identity/http/server.ts:201` | 400 已部署：业务层响应（VALIDATION_FAILED） | 登录：用平台一次性登录码（微信 wx.login code 等）换取青花植会话令牌；可携带游客令牌以便后续认领。入：platform(wechat/douyin/xiaohongshu), code, guestToken?；出：accessToken, expiresAt | **可用** |
| `POST /api/v2/identity/guest-sessions` | cloudfunctions-v2/models/identity/guest-token-contract.md（guest-token/v1）（已冻结） | `cloudfunctions-v2/src/identity/http/routes.ts:27 + identity/http/guest-session-route.ts` | 400 已部署：业务层响应（VALIDATION_FAILED） | 游客会话：抖音/小红书未登录时签发游客令牌（微信不走游客，直接静默登录）。入：platform(douyin/xiaohongshu), anonymousCode；出：guestToken, guestSessionRef, expiresAt | **可用** |
| `POST /api/v2/identity/bindings` | docs/backend-v2/contracts/principal-and-capability.md（仅原则，无字段级 HTTP 合同）（未定义） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 绑定另一平台身份到当前用户。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `DELETE /api/v2/identity/bindings/{platform}` | docs/backend-v2/contracts/principal-and-capability.md（仅原则）（未定义） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 解绑某平台身份。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/me` | 无（未定义） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 读取当前用户信息（昵称、绑定平台、会员等）。入：—；出：未定义 | **未实现（合同未定义）** |

### 植物知识（plant-knowledge）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `GET /api/v2/plant-knowledge/search` | docs/backend-v2/contracts/plant-knowledge-public-search.md（已冻结） | `cloudfunctions-v2/src/plant-knowledge/http/routes.ts:21` | 200 已部署：200 正常返回数据 | 搜索青花植已发布的规范植物身份（数量少，可用于“确认身份”）。入：q（1–64 字）；出：items[{plantIdentityRef, displayNameZh, acceptedScientificName, taxonRank}], truncated | **可用** |
| `GET /api/v2/plant-knowledge/catalog/search` | docs/backend-v2/contracts/plant-catalog-search.md（registry 标 P3_TARGET）（已冻结） | `cloudfunctions-v2/src/plant-knowledge/http/routes.ts:13` | 200 已部署：200 正常返回数据 | 搜索 27 万级植物目录（添加植物/选品种的主搜索框）。入：q（1–64 字）, limit(1–20, 默认10)；出：items[{catalogTaxonRef, displayName, scientificName, selectable, hasEncyclopedia, hasImage, plantIdentityRef?}], truncated | **可用** |
| `GET /api/v2/plant-knowledge/plants/{plantIdentityRef}` | docs/backend-v2/contracts/plant-knowledge-public-read.md（已冻结） | `cloudfunctions-v2/src/plant-knowledge/http/routes.ts:29` | 404 已部署：业务 404（植物不存在或尚未发布），说明路由已部署 | 读取一个已发布规范植物身份。入：plantIdentityRef(pid_…)；出：plantIdentityRef, displayNameZh, identityKind, acceptedScientificName, taxonRank | **可用** |
| `POST /api/v2/plant-knowledge/identifications` | 无（未定义） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 拍照识别植物。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/plant-knowledge/encyclopedia/{scientificNameSlug}` | docs/backend-v2/contracts/plant-encyclopedia-read.md（v2, P2_FROZEN）（已冻结） | `cloudfunctions-v2/src/plant-knowledge/http/routes.ts:5` | 400 已部署：业务层响应（VALIDATION_FAILED） | 植物百科详情（展示用，含封面图与署名）。入：scientificNameSlug；出：catalogTaxonRef, displayName, scientificName, additionalNames, taxonomy, description, sections{7 段}, careDisplay{difficulty, temperatureRange, humidityRange, lightRequirement}, coverImage{url, source}|null, attribution | **可用** |

### 天气与城市气候（weather）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `GET /api/v2/weather/city-climate/profiles` | docs/backend-v2/contracts/weather-city-climate-fit.md（v2）（已冻结） | `cloudfunctions-v2/src/weather/http/routes.ts:5` | 200 已部署：200 正常返回数据 | 城市气候剖面列表（城市选择器数据源，约 20 个热门城市）。入：—；出：items[{cityCode, displayName, lat, lon, timezone, monthly, dailyStats}] | **可用** |
| `GET /api/v2/weather/city-climate/profiles/{cityCode}` | docs/backend-v2/contracts/weather-city-climate-fit.md（已冻结） | `cloudfunctions-v2/src/weather/http/routes.ts:13` | 404 已部署：业务 404（城市气候剖面不存在），说明路由已部署 | 单城气候剖面。入：cityCode；出：CityClimateProfile | **可用** |
| `GET /api/v2/weather/city-climate/fit` | docs/backend-v2/contracts/weather-city-climate-fit.md（已冻结） | `cloudfunctions-v2/src/weather/http/routes.ts:21` | 400 已部署：业务层响应（VALIDATION_FAILED） | 某城市×某植物的户外气候适配度。入：cityCode, plantId(=catalogTaxonRef)；出：fit{overall, temperatureMatch, humidityMatch, lightMatch, primaryBottleneck, riskFlags}, profile | **可用** |
| `GET /api/v2/weather/city-climate/recommendations` | docs/backend-v2/contracts/weather-city-climate-fit.md（已冻结） | `cloudfunctions-v2/src/weather/http/routes.ts:29` | 400 已部署：业务层响应（VALIDATION_FAILED） | 按城市推荐适合的植物（户外气候）。入：cityCode, top(1–50,默认10)；出：recommendations[{plantId, name, scientificName, coverImage, careDifficulty, overall, …}], count, profile | **可用** |

### 用户植物（user-plant）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `GET /api/v2/user-plants` | docs/backend-v2/contracts/user-plant.md「列表公开接口」（已冻结） | `cloudfunctions-v2/src/user-plant/http/list-user-plants-route.ts:22` | 405 未部署：已部署函数认识该路径但不支持此方法（部署版本早于该路由实现） | 我的花园列表（游标分页，可筛 active/archived）。入：lifecycle?, limit(1–50,默认20), cursor?；出：items[{user_plant_id, lifecycle, identityStatus, confirmedIdentityRef, profile, version, createdAt, updatedAt, hasCover(封面上线后)}], nextCursor | **已实现未部署** |
| `POST /api/v2/user-plants` | docs/backend-v2/contracts/user-plant.md（已冻结） | `cloudfunctions-v2/src/user-plant/http/create-user-plant-route.ts:29` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 新建一株空白用户植物（加入花园）；正文为空对象，必带 Idempotency-Key。入：{}（空体）+ Idempotency-Key；出：user_plant_id, lifecycle, identityStatus, version, createdAt | **可用** |
| `GET /api/v2/user-plants/{userPlantRef}` | docs/backend-v2/contracts/user-plant.md + user-plant-environment-profile.md §4（已冻结） | `cloudfunctions-v2/src/user-plant/http/get-user-plant-route.ts:27` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 单株植物详情（含档案各分组）。入：userPlantRef；出：user_plant_id, lifecycle, identityStatus, confirmedIdentityRef, profile{nickname, measuredPot, potShape, substrate, location, lighting, ventilation}, version | **可用** |
| `PATCH /api/v2/user-plants/{userPlantRef}` | docs/backend-v2/contracts/user-plant-environment-profile.md（profile-patch/v2）（已冻结） | `cloudfunctions-v2/src/user-plant/http/update-profile-route.ts:37` | 503 已部署·503：路由已部署，但无凭证请求在认证前即返回 503：测试环境缺少该写接口的已发布策略快照（请求体上限等），按设计关闭失败（推断） | 编辑植物档案：昵称、实测盆器、盆型、基质、位置（城市+摆放）、光照、通风；首株完整档案发积分事件。入：version, nickname?, measuredPot?, potShape?, substrate?, location{cityRef, placement}?, lighting{windowFacing, glassLayers, distanceBand, obstruction}?, ventilation{airExchange, localAirflow, directBlowing}?；出：UserPlant 公开投影（同详情） | **已部署但测试环境不可用** |
| `DELETE /api/v2/user-plants/{userPlantRef}` | docs/backend-v2/contracts/user-plant.md「删除公开接口」（已冻结） | `cloudfunctions-v2/src/user-plant/http/delete-user-plant-route.ts:15` | 405 未部署：已部署函数认识该路径但不支持此方法（部署版本早于该路由实现） | 删除植物（标记为删除中，此后对外不可见）。入：expectedVersion；出：user_plant_id, lifecycle=deleting, version, updatedAt | **已实现未部署** |
| `POST /api/v2/user-plants/{userPlantRef}/archive` | docs/backend-v2/contracts/user-plant.md（已冻结） | `cloudfunctions-v2/src/user-plant/http/transition-user-plant-route.ts:39` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 归档植物（变只读，可恢复）。入：expectedVersion；出：UserPlant 投影 | **可用** |
| `POST /api/v2/user-plants/{userPlantRef}/restore` | docs/backend-v2/contracts/user-plant.md（已冻结） | `cloudfunctions-v2/src/user-plant/http/transition-user-plant-route.ts:47` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 从归档恢复。入：expectedVersion；出：UserPlant 投影 | **可用** |
| `POST /api/v2/user-plants/{userPlantRef}/identity-confirmations` | docs/backend-v2/contracts/user-plant-identity-confirmation.md（已冻结） | `cloudfunctions-v2/src/user-plant/http/confirm-user-plant-identity-route.ts:17` | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 确认“这株就是某已发布身份”（来源仅用户搜索），归档植物不可确认。入：expectedVersion, plantIdentityRef(pid_…), source{type:user_search}；出：UserPlant 投影（identityStatus=confirmed） | **已实现未部署** |
| `POST /api/v2/user-plants/{userPlantRef}/assets` | docs/backend-v2/contracts/user-plant-cover-asset.md（合同冻结；§4 云存储 SDK/凭证前置条件未满足）（已冻结） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 登记封面图（前端先直传云存储，再登记校验）；每株最多一张有效封面。入：purpose=profile, fileId, contentSha256；出：assetRef, url(600秒), urlExpiresAt, createdAt | **仅合同** |
| `GET /api/v2/user-plants/{userPlantRef}/timeline` | docs/backend-v2/contracts/user-plant-timeline.md（合同冻结；care 事件迁移与派发形态待确认）（已冻结） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 植物时间线：浇水、完成检查、归档、恢复。入：limit(1–50), cursor；出：items[{timelineItemRef, itemType(care_watering/care_plan_completed/plant_archived/plant_restored), occurredAt, summary{amountMl|outcome}}], nextCursor | **仅合同** |
| `POST /api/v2/user-plants/ephemeral-cases/{ephemeralCaseRef}/bindings` | cloudfunctions-v2/models/user-plant/authenticated-ephemeral-binding-http-contract.md（已冻结） | `cloudfunctions-v2/src/user-plant/http/authenticated-ephemeral-binding-route.ts:19` | 503 已部署·503：路由已部署，但无凭证请求在认证前即返回 503：测试环境缺少该写接口的已发布策略快照（请求体上限等），按设计关闭失败（推断） | 登录用户把临时案例（epc_…）并入已有植物或新建一株。入：target{type:existing_user_plant, user_plant_id}|{type:new_user_plant}；出：user_plant_id | **已部署但测试环境不可用** |
| `POST /api/v2/user-plants/temporary-cases` | cloudfunctions-v2/models/user-plant/temporary-case-contract.md（temporary-case/v1）（已冻结） | `cloudfunctions-v2/src/user-plant/http/create-temporary-case-route.ts:18` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 创建临时植物案例（游客 gpc_ / 登录 epc_），浇水/诊断/识别共用 caseRef。入：{}；出：caseRef, ownerKind(guest/authenticated), expiresAt | **可用** |
| `POST /api/v2/user-plants/claims` | docs/backend-v2/contracts/guest-session-claim.md + cloudfunctions-v2/models/identity/guest-token-contract.md（已冻结） | `cloudfunctions-v2/src/user-plant/http/claim-guest-plant-case-route.ts:18` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 登录后认领游客期间的临时案例到花园。入：guestSessionRef, guestPlantCaseRef, guestToken, target{new|existing}；出：claimRef, userPlantId, claimedObjectKinds[], replayed | **可用** |
| `PUT /api/v2/user-plants/{userPlantRef}/catalog-binding` | cloudfunctions-v2/models/care/long-term-care-contract.md §1（已冻结） | `cloudfunctions-v2/src/user-plant/http/put-catalog-binding-route.ts:17` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 给植物绑定目录品种（只供养护算法取参数，与“身份确认”互不联动）。入：catalogTaxonRef；出：catalogTaxonRef, boundAt | **可用** |

### 养护（care）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `POST /api/v2/care/watering-advice` | cloudfunctions-v2/models/care/watering-advice-http-contract.md + care/long-term-care-contract.md §2（算法倍率见 watering-decision-model：结构冻结、参数待定）（已冻结） | `cloudfunctions-v2/src/care/http/watering-advice-route.ts:28` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 浇水建议（临时案例或长期植物）：判断现在该不该浇、什么时候看盆土、浇多少。入：target{temporary_case,caseRef|user_plant,userPlantRef}, catalogTaxonRef(临时必填), location{lat,lon}, window{orientation, azimuthDeg?, glassLayers}, lightReading?, soil?, lastWatering?(仅临时), pot?(仅临时), substrateMaterials, primarySubstrateMaterial?, indoorClimate?；出：resultRef, proposalRef(长期且可确认时), result{status(ready/insufficient_evidence/temporarily_unavailable), confidence, recommendedActions, details{action, checkWindow, amountMl, missingEvidence[含 plant_light/outdoor_radiation]}} | **可用** |
| `POST /api/v2/care/soil-assessments` | docs/backend-v2/contracts/care-manual-soil-observation.md（明确声明不冻结 HTTP 路由）（草案/未冻结路由） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 盆土评估/手工盆土观察。入：未定义（窄切片仅领域层）；出：未定义 | **仅合同** |
| `GET /api/v2/care/user-plants/{userPlantRef}/summary` | cloudfunctions-v2/models/care/long-term-care-contract.md §4（已冻结） | `cloudfunctions-v2/src/care/http/long-term-care-routes.ts:29 (getUserPlantCareSummaryRoute)` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 养护摘要：上次浇水、最近一次建议、下一个待办检查、档案就绪度（只读，不计算）。入：userPlantRef；出：lastWatering{occurredAt, amountMl}, latestWateringAdvice{generatedAt, status, action, checkWindow, proposal{proposalRef, status, validUntil}}, nextPlan{planRef, scheduledAt, status, calendar}, profileReadiness{hasMeasuredPot, hasCatalogBinding} | **可用** |
| `POST /api/v2/care/user-plants/{userPlantRef}/facts` | cloudfunctions-v2/models/care/long-term-care-contract.md §3（已冻结） | `cloudfunctions-v2/src/care/http/long-term-care-routes.ts:26 (createCareFactRoute)` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 记录“我浇过水”（可补录 7 天内）。入：factType=watering, occurredAt, amountMl?(0–10000)；出：factRef, factType, occurredAt, amountMl | **可用** |
| `GET /api/v2/care/user-plants/{userPlantRef}/plans` | cloudfunctions-v2/models/care/long-term-care-contract.md §5/§12（已冻结） | `cloudfunctions-v2/src/care/http/long-term-care-routes.ts:29 (listCarePlansRoute)` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 检查计划列表（待办/已完成/已取消/已过期）。入：status(默认 planned), limit(≤50), cursor；出：items[{planRef, planType=check_soil, scheduledAt, status, sourceProposalRef, completedFactRef, calendar{title,startAt,endAt,notes}}], nextCursor | **可用** |
| `POST /api/v2/care/user-plants/{userPlantRef}/proposals/{proposalRef}/confirmations` | cloudfunctions-v2/models/care/long-term-care-contract.md §6（已冻结） | `cloudfunctions-v2/src/care/http/long-term-care-routes.ts:27 (confirmCareProposalRoute)` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 确认/忽略一条浇水建议：确认为“检查计划”或直接记为浇水。入：decision(schedule_check+scheduledAt | record_watering+occurredAt,amountMl | dismiss)；出：proposalRef, proposalStatus, plan{…calendar}|null, factRef|null | **可用** |
| `POST /api/v2/care/user-plants/{userPlantRef}/plans/{planRef}/completions` | cloudfunctions-v2/models/care/long-term-care-contract.md §7/§12（已冻结） | `cloudfunctions-v2/src/care/http/long-term-care-routes.ts:28 (completeCarePlanRoute)` | 401 已部署：业务层响应（PRINCIPAL_INVALID） | 完成/跳过检查计划，可顺带记录盆土与浇水；过期计划 409 CARE_PLAN_EXPIRED。入：version, outcome(done/skipped), soil{state,scope}?, watering{occurredAt, amountMl}?；出：planRef, status(completed/cancelled), version, factRef, calendar | **可用** |

### 诊断（diagnosis）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `POST /api/v2/diagnosis/sessions` | cloudfunctions-v2/models/diagnosis/create-session-http-contract.md + pest-create-http-contract.md（结果 Schema diagnosis-result/v1 在 registry 为 P1_PENDING）（已冻结） | `cloudfunctions-v2/src/diagnosis/http/create-session-route.ts:35` | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 开始问诊（黄叶/萎蔫/虫害视觉），返回问题包；首版仅长期植物。入：userPlantRef, mode(yellow_leaf/wilting_droop/specific_pest_visual), assetRef(虫害)；出：diagnosisSessionRef, mode, questionPackage{questions[{questionKey, text, inputKind, helpText, whyThisQuestion, options}]} | **已实现未部署** |
| `POST /api/v2/diagnosis/sessions/{diagnosisSessionRef}/answers` | cloudfunctions-v2/models/diagnosis/answer-http-contract.md（已冻结） | `cloudfunctions-v2/src/diagnosis/http/answer-route.ts:33` | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 提交问诊答案。入：userPlantRef, requestMode=answer_submit, answers[{questionKey, optionKey}], careBehaviorTimeline?, airEnvironment…?；出：diagnosisSessionRef, answersRecorded | **已实现未部署** |
| `GET /api/v2/diagnosis/sessions/{diagnosisSessionRef}/result` | cloudfunctions-v2/models/diagnosis/result-http-contract.md（结果 Schema P1_PENDING，诊断知识未发布）（已冻结） | `cloudfunctions-v2/src/diagnosis/http/result-route.ts:25` | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 读取诊断结果（仅建议，不自动写养护）。入：diagnosisSessionRef；出：titleZh, summaryZh, certaintyLevel, severityLevel, urgencyLevel, isolationDecision, evidenceFindings, recommendedActions, followUp, publicSources | **已实现未部署** |
| `GET /api/v2/user-plants/{userPlantRef}/diagnoses` | 无（未定义） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 某株植物的诊断历史。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `POST /api/v2/user-plants/{userPlantRef}/diagnoses` | 无（未定义） | 无 | 404 未部署：网关已到达函数，但已部署版本没有该路由 | 从植物详情发起诊断（备用入口）。入：未定义；出：未定义 | **未实现（合同未定义）** |

### 订阅与积分（subscription）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `GET /api/v2/subscription/plans` | docs/backend-v2/contracts/care-points-and-ai-quota.md（产品数值冻结，无 HTTP 字段合同）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 会员套餐列表。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `POST /api/v2/subscription/trials` | docs/backend-v2/contracts/care-points-and-ai-quota.md（同上）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 开通试用。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/subscription/entitlements` | docs/backend-v2/contracts/principal-and-capability.md（同上）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 当前权益/能力。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `POST /api/v2/subscription/orders` | 无（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 下单（P5 支付）。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/subscription/orders/{orderRef}` | 无（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 订单状态。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/subscription/rewards/summary` | docs/backend-v2/contracts/care-points-and-ai-quota.md + reward-events.md（无 HTTP 字段合同）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 积分/等级概览。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/subscription/rewards/ledger` | docs/backend-v2/contracts/care-points-and-ai-quota.md（同上）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 积分流水。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/subscription/rewards/catalog` | docs/backend-v2/contracts/care-points-and-ai-quota.md（同上）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 积分兑换目录。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `POST /api/v2/subscription/rewards/redemptions` | docs/backend-v2/contracts/care-points-and-ai-quota.md（同上）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 积分兑换。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `GET /api/v2/subscription/ai-quota` | docs/backend-v2/contracts/care-points-and-ai-quota.md（同上）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | AI 额度余量。入：未定义；出：未定义 | **未实现（合同未定义）** |
| `POST /api/v2/subscription/callbacks/{provider}` | 无（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 支付回调（服务间）。入：—；出：— | **未实现（合同未定义）** |

## 四、内部接口（服务间调用，不经公网网关，不进入设计稿）

| 路由 | 合同（状态） | 实现位置 | 实测（状态码 · 判断） | 能力摘要（关键入/出字段） | 结论 |
|---|---|---|---|---|---|
| `POST /api/v2/internal/identity/resolve` | docs/backend-v2/contracts/principal-and-capability.md（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 服务间解析主体。入：—；出：— | **未实现（合同未定义）** |
| `GET /api/v2/internal/identity/users/{userRef}/trial-anchor` | docs/backend-v2/contracts/identity-trial-anchor.md（已冻结） | `cloudfunctions-v2/src/identity/http/routes.ts:16` | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | subscription 读取试用起算锚点。入：—；出：— | **已实现（内部接口，不经公网网关）** |
| `GET /api/v2/internal/user-plants/{userPlantRef}/context` | 无（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 服务间读植物上下文。入：—；出：— | **未实现（合同未定义）** |
| `GET /api/v2/internal/user-plants/{userPlantRef}/agent-context` | docs/backend-v2/contracts/principal-and-capability.md（仅权限原则）（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 小青 Agent 受控植物上下文。入：—；出：— | **未实现（合同未定义）** |
| `POST /api/v2/internal/subscription/ai-quota/reservations` | docs/backend-v2/contracts/care-points-and-ai-quota.md（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | AI 额度预占。入：—；出：— | **未实现（合同未定义）** |
| `POST /api/v2/internal/subscription/ai-quota/reservations/{reservationRef}/settlements` | docs/backend-v2/contracts/care-points-and-ai-quota.md（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | AI 额度结算。入：—；出：— | **未实现（合同未定义）** |
| `POST /api/v2/internal/subscription/ai-quota/reservations/{reservationRef}/releases` | docs/backend-v2/contracts/care-points-and-ai-quota.md（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | AI 额度释放。入：—；出：— | **未实现（合同未定义）** |
| `POST /api/v2/internal/subscription/reward-events` | docs/backend-v2/contracts/reward-events.md（已冻结） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 消费奖励事件（积分记账）。入：—；出：— | **仅合同** |
| `POST /api/v2/internal/plant-knowledge/enrichment-jobs/leases` | 无（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 百科补缺任务租约。入：—；出：— | **未实现（合同未定义）** |
| `POST /api/v2/internal/plant-knowledge/enrichment-jobs/{jobRef}/results` | 无（未定义） | 无 | 404 未部署：网关无此路径前缀（CloudBase INVALID_PATH），对应函数未接入网关 | 百科补缺结果回写。入：—；出：— | **未实现（合同未定义）** |

内部接口经公网网关一律返回 `INVALID_PATH`，这是预期（不对外暴露），不能据此判断其是否部署；仅 `trial-anchor` 在 identity 函数中有实现。

## 五、给设计核对的使用规则

1. 只有“可用”的能力可以作为设计稿交互基线；“已部署但测试环境不可用 / 已实现未部署”可以按冻结合同设计字段，但须标注“待部署联调”。
2. “仅合同”可按合同字段设计，须标注“后端未实现”；“未实现（合同未定义）”不得在设计稿中固定字段或状态，只能画占位。
3. 植物“身份确认”（pid_…）与“品种绑定”（catalogTaxonRef，供浇水算法）是两件事，界面上不应合并为一个动作。
4. 诊断只产出建议；任何“加入养护计划”都必须走用户确认（care confirmations）。
