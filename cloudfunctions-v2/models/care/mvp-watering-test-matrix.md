# MVP 浇水 L1 测试矩阵（cases 先于产品）

- 合同：`mvp-watering-policy-contract.md`（用户 2026-10-08 授权的文献标定 MVP）。
- Runner：Vitest（依据 `cloudfunctions-v2/vitest.config.mjs`；未转绿目标放 `*.red.spec.ts`，由 `vitest.red.config.mjs` 显式运行）。
- 层次：三个对象均为 L1 纯函数（`unit_fake`）。策略数值是显式夹具，**不**代表已发布参数；规则本身不替换。
- TDD 就绪：已就绪（仓库已有大量 care 产品面与矩阵测试）。
- 证明范围：经过本表 SUT 及其直接依赖 `deriveMeasuredPot`（真实实现，不替换）；不经过数据库、Provider、HTTP。
- 未覆盖：真实植物精度（无本地标定，用户已接受为后续优化）；照片识别可靠性（上游负责）。

## A. `resolveMvpMoistureGroup`（tier＋trigger → 浇水分组）

| 维 | 用例 | 形态 | Expected 来源 | 状态 |
|---|---|---|---|---|
| U1 空缺 | tier 或 trigger 为 `undefined` → TypeError | Edge | 合同第3节“未知值拒绝，不落入默认分组” | 待写 |
| U2 边界 | 四种 tier × `TIER_DEFAULT` 各自分组；七个显式 trigger 各自分组；表土是否足够随分组 | Happy | 合同第3节触发条件表 | 已写 |
| U3 非法 | 未知 tier、未知 trigger → TypeError | Edge | 同上 | 已写 |
| U4 幂等 | — | — | — | N/A：无状态纯函数，无写入 |
| U5 失败回滚 | — | — | — | N/A：无写入 |
| U6 并发 | — | — | — | N/A：无共享状态 |
| U7 源不覆盖用户态 | — | — | — | N/A：不持有本地态 |

## B. `mapMvpSoilObservation`（四态观察 → 安全门证据＋剩余量）

| 维 | 用例 | 形态 | Expected 来源 | 状态 |
|---|---|---|---|---|
| U1 空缺 | `uncertain` → 证据与剩余量均为 null | Edge | 合同第3节表 | 已写 |
| U1 空缺 | 缺 observation 对象 → TypeError | Edge | 合同“非法输入拒绝” | 待写 |
| U2 边界 | 湿：剩余 = 0.6～1.0 × 5～8 = 3～8；有效期 = 观察 + 24h | Happy | 合同第3节＋手算 | 已写 |
| U2 边界 | 微湿：1～4.8 | Happy | 同上 | 已写 |
| U2 边界 | 表土干＋表土足够 → target_dry，无剩余量 | Happy | 同上 | 已写 |
| U2 边界 | 表土干＋要求干透 → unknown，剩余 0～3.2 | Edge | 同上 | 已写 |
| U2 边界 | 根区干＋干透型 → 目标；喜湿型表土干 → 目标 | Happy | 同上 | 已写 |
| U2 边界 | 观察时刻 = 计算时刻 → 接受 | Edge | 合同“不能晚于计算时刻”的闭区间端 | 待写 |
| U3 非法 | 未来观察、非法状态、有效期 ≤ 0 | Edge | 合同 | 已写 |
| U3 非法 | 剩余比例越界（>1）、基线非法（≤0）→ RangeError | Edge | 合同“比例 0～1 有序” | 待写 |
| U4 幂等 | 同输入两次结果相等，且不修改调用方的策略/观察对象 | Edge | common scene：纯映射无副作用 | 待写 |
| Reverse | 不可靠观察保持 `reliable:false`，映射不提升可靠性 | Reverse | 合同“来源可靠性由上游判定，本映射不提升” | 待写 |
| U5/U6/U7 | — | — | — | N/A：无写入、无共享状态、无本地态 |

## C. `estimateMvpWaterAmount`（盆器＋材料＋分组 → 建议浇入量）

| 维 | 用例 | 形态 | Expected 来源 | 状态 |
|---|---|---|---|---|
| U1 空缺 | 未选材料 → `substrate_materials` 缺证据 | Edge | 合同第4节 | 已写 |
| U1 空缺 | 尺寸缺失／内盆未确认 → `inner_pot_geometry` | Edge | 合同第4节 | 已写 |
| U1 元素洞 | 材料数组 `[null, 'peat']` 跳过洞、按 peat 计算；全为洞 → `substrate_materials` | Edge | skill U1 元素洞外延＋合同第4节（本轮补入合同） | 待写 |
| U2 边界 | 16/12/14cm、留空 1～2cm、泥炭＋珍珠岩 → 90～490mL | Happy | 手算（截锥＋易利用水×消耗÷(1−排出)） | 已写 |
| U2 边界 | 只选泥炭 → 180～490mL；干透型 → 210～890mL | Happy | 手算 | 已写 |
| U2 边界 | 直筒盆（上下同径 10cm、高 10cm、留空 1cm）退化为圆柱：706.86mL，浇入 70～180mL | Edge | 手算（π·5²·9） | 待写 |
| U3 非法 | 未知材料、策略缺该材料 → TypeError | Edge | 合同 | 已写 |
| U3 非法 | 留空 ≥ 盆高 → RangeError | Edge | 合同 | 已写 |
| U3 非法 | 易利用水上限 > 容器持水量下限的物性自相矛盾 → RangeError | Edge | 物理约束：易利用水是持水量的一部分（本轮补入合同） | 待写 |
| U4 幂等 | `['peat','peat']` 与 `['peat']` 结果相同 | Edge | 合同“所选材料集合”的集合语义（本轮补入合同） | 待写 |
| Reverse | 无排水孔不给水量；排水未知为缺证据 | Reverse | 合同第4节 | 已写 |
| U5/U6/U7 | — | — | — | N/A：无写入、无共享状态、无本地态 |

## 真实性（Break / Expected / Real path / Mutation）

| SUT | 代表性 Break | Mutation（交付前执行反写） |
|---|---|---|
| A | TIER_DEFAULT 漏按 tier 选组 | 把 `drought_tolerant` 映射改成 `dry_wet` → U2 用例应红 |
| B | 表土干对干透型植物被当成目标 | 删去 `group.surfaceSufficient` 条件 → “要求干透”用例应红 |
| C | 浇入量未除以 (1−排出比例) | 去掉除法 → Happy 用例应红 |

## D. `resolveMvpWateringPolicy`（不可变发布正文 → 请求级只读快照）

Expected 来源：`mvp-watering-policy-contract.md` 第1～4节字段＋第6节“无活动发布即 temporarily_unavailable”；既有配置治理（不可变 release、SHA-256、活动指针、无源码默认值，`configuration-and-providers` 硬规则）；同类已验收先例 `mvp-glass-policy` 的生效边界语义（含起点、排除终点）。摘要预期用独立的通用工具 `calculateCanonicalJsonSha256` 对夹具正文计算，不调用 SUT 的摘要函数。

| 维 | 用例 | 形态 | Expected 来源 | 状态 |
|---|---|---|---|---|
| U2 边界 | 合法活动发布 → available，快照字段与正文一致并带配置快照引用 | Happy | 合同＋配置治理 | 待写 |
| U1 空缺 | 发布为 null/undefined → unavailable；缺任一必填字段 → invalid | Edge | 配置治理“无发布不可用、不补默认” | 待写 |
| U2 边界 | 捕获时刻 = 生效时刻 → available；= 失效时刻 → unavailable；早于生效 → not_effective | Edge | 玻璃策略先例的半开区间 | 待写 |
| U3 非法 | 摘要不符、多余字段、捕获时刻非 UTC → invalid | Edge | 配置治理“正文不可原地修改、严格 Schema” | 待写 |
| U3 非法 | 区间反序、比例越界、排出比例 ≥ 1、某材料易利用水上限 > 持水量下限、参考点超出有效域、缺任一材料 → invalid | Edge | 合同第2、4节物理约束 | 待写 |
| Reverse | 非 active 状态（draft/verified/retired）→ unavailable，不返回参数 | Reverse | 合同第6节 | 待写 |
| U4 幂等 | 返回快照冻结，修改原发布对象不影响已返回快照 | Edge | 配置治理“同一请求锁定只读快照” | 待写 |
| U5/U6/U7 | — | — | — | N/A：纯解析，无写入、无共享状态、无本地态 |

Break：漏校验 AW≤CC 或漏比对摘要。Mutation：删除摘要比对 → “摘要不符”用例应红。

## E. `assessMvpWatering`（基线＋环境＋盆土＋盆器 → 公开浇水结果）

层次：L3 `unit_fake`（内部协作链全部真实：策略解析 D、分组 A、映射 B、水量 C、`replayWateringTiming`、`projectWateringReplayResult`；只把光照/VPD 时段作为显式输入，不经过 Provider、数据库、HTTP）。Expected 来源：合同第1～6节＋手算。环境夹具：全程 PPFD=参考 50、VPD=参考 1.4 kPa → 每天需求恰为 1；保水不确定带 0.8～1.25 → 干燥速度 0.8～1.25 单位/天。基线 5～8（绿萝 regular/SURFACE_DRY 真实读回值）。

| 维 | 用例 | 形态 | Expected（手算） | 状态 |
|---|---|---|---|---|
| I1 Happy | 根区微湿：剩余 1.25～4.8 → 检查窗口 现在+1天～+6天，当地日期 10-09～10-14，无水量，低置信 | Happy | 1.25/1.25=1、4.8/0.8=6 | 待写 |
| I1 Happy | 根区干＋有孔内盆 16/12/14＋泥炭珍珠岩 → 可以浇水，建议 40～300mL | Happy | 截锥 11～13cm 装土 1598.3～1972.3mL；N=1598.3×0.25×0.08～1972.3×0.35×0.35；÷0.9、÷0.8 | 待写 |
| I1 Happy | 无观察、2 天前确认浇过水 → 窗口 现在+2天～+8天 | Happy | 进度 1.6～2.5；(5−2.5)/1.25=2、(8−1.6)/0.8=8 | 待写 |
| I2 缺字段 | 无发布 → temporarily_unavailable，无行动建议 | Edge | 合同第6节 | 待写 |
| I2 缺字段 | 无基线 → insufficient_evidence | Edge | 合同第1节 | 待写 |
| I2 缺字段 | 无观察且无浇水记录 → insufficient_evidence，不以今天补起点 | Edge | 合同第5节 | 待写 |
| I2 缺字段 | 无室内 VPD → 用兜底区间 0.7～2.2，窗口变宽：最早 <1天、最晚 >6天 | Edge | 合同第2节＋手算（速度 0.533～1.538） | 待写 |
| I2 覆盖 | 环境只覆盖 3 天 → 最早端存在，最晚端为空（开放结束） | Edge | 合同第5节“不外推” | 待写 |
| 方向 | 光照翻倍（PPFD 100）→ 最早端早于参考情形 | Edge | Demand=0.8×L(100)/L(50)+0.2=1.343 | 待写 |
| Reverse | 根区湿 → 暂停浇水，无水量 | Reverse | 合同第3节 | 待写 |
| Reverse | 根区干但无排水孔 → 检查排水，无水量 | Reverse | 合同第4节 | 待写 |
| I3 脱敏 | 结果不含策略摘要、来源路径或内部引用 | Reverse | 宪章第4节公开响应脱敏 | 待写 |
| I4/I5 | — | — | — | N/A：纯计算，无鉴权与写入（存储与 HTTP 在后续切片验证） |

**待用户裁决（不在本切片改动）：** 现有安全门 `evaluateWateringDecision` 只认根区“已干”为目标（`evaluate-watering-decision.ts:67`）。合同第3节“表土干对表土干即浇型植物即达目标”与之冲突；本切片“可以浇水”用例只用根区观察，B 节对应用例的目标判定保留，但组合后表土干的最终行动取决于该裁决。

Break：保水倍率被乘而不是除 → 窗口方向错。Mutation：把需求公式中的 (1−w) 蒸发项去掉 → 参考情形每日需求变为 0.8，窗口用例应红。

## F. `fetchOpenMeteoRadiation`（Open-Meteo 太阳辐射预报适配器）

层次：L3 `unit_fake`，只替换 `fetch` 边界（Test Double）；Happy 响应体使用已入库的真实公开制品 `test/care/fixtures/open-meteo-hourly-radiation.json`，并交给真实 `normalizeOpenMeteoRadiation` 消费。Expected 来源：Open-Meteo 官方文档（`/v1/forecast` 参数 `latitude`、`longitude`、`hourly`、`timeformat=unixtime`、`timezone=auto`、`past_days` 0～92、`forecast_days` 0～16）＋配置目录 `open_meteo` 档案（总时限 8000ms、只调用 1 次、免费无凭证）。未覆盖：真实网络调用与配额（另做 e2e_real_api）。

| 维 | 用例 | 形态 | Expected 来源 | 状态 |
|---|---|---|---|---|
| I1 Happy | 正确拼装 URL 查询参数；返回原始响应与捕获时刻；真实制品可被标准化器消费 | Happy | 官方文档＋真实制品 | 待写 |
| I2 缺字段 | 响应不是 JSON 对象 → unavailable(invalid_body) | Edge | 适配器合同：坏载荷不进入标准化 | 待写 |
| I3 错误语义 | HTTP 非 2xx → unavailable(http_error)，只调用 1 次 | Edge | 档案 maxAttempts=1 | 待写 |
| I3 错误语义 | 网络错误 → unavailable(network)，不抛出、不泄漏错误文本 | Edge | 档案 fallback：缺段不外推 | 待写 |
| I3 超时 | 超过总时限 → unavailable(timeout)，并通过 AbortSignal 取消请求 | Edge | 档案 totalDeadlineMs | 待写 |
| U3 非法 | 纬度/经度越界、天数越界或非整数 → TypeError，且不发起请求 | Reverse | 官方参数范围 | 待写 |
| I4 | — | — | — | N/A：公开接口无鉴权 |
| I5 | — | — | — | N/A：只读请求，无写入 |

Break：查询漏掉 `timeformat=unixtime` → 标准化器按时间格式拒绝。Mutation：删除该参数 → Happy 用例应红。
