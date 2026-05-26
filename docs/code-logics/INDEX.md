# docs/code-logics 索引

## 1. 定位

本文件是 `docs/code-logics/` 的轻量索引，用于让 main agent / subagent 精准定位代码逻辑文档，避免全量读取整个目录。

`docs/code-logics/` 是代码逻辑知识库，不是默认上下文。任何 agent 都不得因为任务中出现“诊断、运行时、问题、结果、视觉”等宽泛词，就全量读取本目录。

## 2. 读取原则

1. 默认只读本索引。
2. 不得全量读取 `docs/code-logics/`。
3. 每次任务默认最多读取 1～2 个最相关逻辑文档。
4. 如果需要读取超过 2 个逻辑文档，main agent 必须在 Dispatch Plan 中说明原因，并优先提供规则摘要。
5. 下游 agent 优先读取上游 agent 摘要和 handoff，不重复读取源文档。
6. 若索引无法定位具体文档，subagent 应请求 main agent 补充摘要或指定路径，不得自行扫描整个目录。

## 3. 快速路由

| 任务域 | 优先读取 | 备选读取 | 常见触发词 |
|---|---|---|---|
| 总览 / 不确定读哪个 | `00_文档总索引_与阅读顺序.md` | `10_实施规则映射_开发约束_审计清单.md` | 文档索引、阅读顺序、从哪里开始 |
| 云函数 / 服务边界 | `01_后端云函数总览_与服务边界.md` | `02_诊断HTTP接口_请求响应与路由.md` | 云函数、service、边界、diagnose-http |
| HTTP 接口 / 路由 | `02_诊断HTTP接口_请求响应与路由.md` | `07_结果格式化_公开响应_前端接入契约.md` | API、路由、请求、响应、endpoint |
| 诊断 runtime 主链 | `03_诊断运行时主链路_逐步执行逻辑.md` | `06_问题排序_证据计分_输出守卫.md` | runtime、outcome、gate、route、执行逻辑 |
| 视觉证据接入 | `04_视觉证据接入_正式证据_诊断方向.md` | `09_植物识别_图片存储_天气_用户植物模块.md` | visual、视觉证据、正式证据、诊断方向 |
| 问诊系统 | `05_问诊系统_问题生成_过滤_停止策略.md` | `06_问题排序_证据计分_输出守卫.md` | 问诊、追问、question、过滤、停止策略 |
| 候选 outcome / 回答影响值 / 输出守卫 | `06_问题排序_证据计分_输出守卫.md` | `03_诊断运行时主链路_逐步执行逻辑.md` | candidate outcome、effectValue、guard、输出资格 |
| 结果格式 / 前端契约 | `07_结果格式化_公开响应_前端接入契约.md` | `02_诊断HTTP接口_请求响应与路由.md` | result、format、response、前端展示、contract |
| 会话持久化 / 历史 | `08_会话持久化_历史_运行时快照.md` | `03_诊断运行时主链路_逐步执行逻辑.md` | session、history、snapshot、运行时快照 |
| 植物识别 / 图片 / 天气 / 用户植物 | `09_植物识别_图片存储_天气_用户植物模块.md` | `04_视觉证据接入_正式证据_诊断方向.md` | plant、identity、image、storage、weather、user plant |
| 实施规则 / 审计 | `10_实施规则映射_开发约束_审计清单.md` | `00_文档总索引_与阅读顺序.md` | 审计、开发约束、实现清单、落地规则 |
| 文档缺口 / 路线图 | `11_后续补文档路线图_缺口与优先级.md` | `00_文档总索引_与阅读顺序.md` | 文档缺口、补文档、优先级、路线图 |

## 4. 文档索引表

| 文档路径 | 主主题 | 适用场景 | 关键词 | 推荐读取范围 | 风险等级 |
|---|---|---|---|---|---|
| `docs/code-logics/00_文档总索引_与阅读顺序.md` | 总索引 | 不确定该读哪个逻辑文档、建立阅读顺序 | index, 阅读顺序, 总览 | 只读索引和阅读顺序 | 低 |
| `docs/code-logics/01_后端云函数总览_与服务边界.md` | 后端云函数与服务边界 | CloudBase 函数职责、服务边界、后端入口 | cloudfunctions, service boundary, diagnose-http | 先读服务边界小节 | 中 |
| `docs/code-logics/02_诊断HTTP接口_请求响应与路由.md` | HTTP 接口与路由 | 调试 diagnose-http 接口、请求响应、路由分发 | API, route, request, response, endpoint | 读请求/响应/路由小节 | 中 |
| `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md` | 诊断运行时主链 | route 路径规划、outcome、gate、runtime、主流程改造 | runtime, outcome, gate, route, decision flow | 只读相关小节；优先由 architect 摘要 | 高 |
| `docs/code-logics/04_视觉证据接入_正式证据_诊断方向.md` | 视觉证据接入 | AI 视觉证据如何进入诊断方向、正式证据边界 | visual evidence, formal evidence, symptom | 读证据边界与诊断方向小节 | 高 |
| `docs/code-logics/05_问诊系统_问题生成_过滤_停止策略.md` | 问诊系统 | 追问生成、过滤、停止条件、问诊路径 | question, follow-up, stop strategy, filter | 读问题生成/停止策略小节 | 高 |
| `docs/code-logics/06_问题排序_证据计分_输出守卫.md` | 候选 outcome、回答影响值、输出守卫 | candidate outcome、effectValue、guard、output eligibility、低置信输出 | candidate outcome, effectValue, guard, output eligibility | 读候选与守卫小节；与 `03` 联动 | 高 |
| `docs/code-logics/07_结果格式化_公开响应_前端接入契约.md` | 结果格式与前端契约 | 前端可见 outcome、响应字段、展示层 contract | response, frontend, output format, contract | 读公开响应和字段契约小节 | 中 |
| `docs/code-logics/08_会话持久化_历史_运行时快照.md` | 会话持久化 | session、history、snapshot、replay 证据来源 | session, history, snapshot, persistence | 读快照/历史小节 | 中 |
| `docs/code-logics/09_植物识别_图片存储_天气_用户植物模块.md` | 植物识别与图片链路 | plant identity、图片存储、天气、用户植物 | plant identity, image, storage, weather | 读目标模块小节 | 中 |
| `docs/code-logics/10_实施规则映射_开发约束_审计清单.md` | 实施规则与审计 | 实现前检查、开发约束、审计清单 | audit, implementation, constraints | 读审计清单 | 中 |
| `docs/code-logics/11_后续补文档路线图_缺口与优先级.md` | 文档缺口路线图 | 判断哪些逻辑文档需要补、文档维护计划 | gaps, roadmap, priority | 读缺口与优先级 | 低 |

## 5. 与 subagent 的配合

### `code_explorer`

1. 先读本索引。
2. 只读命中的逻辑文档。
3. 输出“代码现状 + 文档要求 + 差异”。
4. 如果文档与代码不一致，不直接改文档，交给 `docs_keeper`。

### `architect_reviewer`

1. 只读 `code_explorer` 摘要。
2. 只有涉及规则边界、诊断主链、outcome、gate、route 时，再读命中文档。
3. 输出实现边界，避免 implementer 反复读源文档。

### `qa_reviewer`

1. 默认读 diff + 上游摘要。
2. 只有要核对逻辑一致性时，读本索引和 1 个命中文档。
3. 不得自行全量读取 `docs/code-logics/`。

### `docs_keeper`

1. 当代码逻辑与文档不一致时，读取对应文档全文。
2. 更新后必须保持完整文档，不得只输出补丁片段。
3. 更新索引时同步本文件。

## 6. Dispatch Plan 示例

```text
需要读取的规则文件:
- docs/code-logics/INDEX.md
- docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md：只读 route/outcome/gate 相关小节
规则摘要:
- 运行时主链文档是诊断主流程事实源。
- 下游 agent 不重复读取全文，优先使用 code_explorer 摘要。
```
