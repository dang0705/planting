# 云函数响应优化计划（审查修正版·当前执行版）

## 目标与范围

一期只优化两个高频读链路：

- `auth-user-http/auth/user`
- `plant-user-http/user-plants`

其余 HTTP 函数只做基线审计，不在本期迁移或重写。SSE、上传、支付回调、诊断写入、天气、识别和公开目录等链路不因本计划改变入口、权限、数据库结构或响应格式。

### 端上硬指标

本期两个目标接口的唯一性能通过线为：经 CloudBase `Init Report` 确认的冷请求，真实小程序 `wx.request` 端到端 p95 不超过 **1000ms**；同一轮、同一容器的热请求 p95 不超过 **300ms**。两项必须同时满足，且不能以函数初始化耗时、Node/curl、日志或历史相对改善替代。当前计划不把这一指标外推到其余 HTTP 函数；若要纳入，须先单独扩大范围并为每个接口补齐业务回归。

## 实现边界

- 两个函数保留同函数路由：读请求走轻量处理器，其他路由按需加载现有 `app.main`。
- 不通过公网转发读请求，不新增网络跳数、函数身份、权限配置、Runtime Layer、会话缓存、MySQL 双路竞速、预置实例或付费能力。
- 统一用户票据只能由已解析的持久平台会话签发，携带稳定用户 ID、数据归属 OpenID、平台和 5 分钟有效期；仅用于上述两个读入口。
- 票据缺失或过期时按现有持久会话刷新一次并重试一次；写操作、诊断、额度、支付和存储继续校验持久会话。
- 持久平台会话优先于 CloudBase 注入的运行时 OpenID 决定数据归属；不得让旧票据导致植物列表切换账号或为空。
- 业务 HTTP 客户端统一使用公开 HTTPS `uni.request` 路由；不得在通用请求器中改用 `wx.cloud.callHTTPFunction`。后者会把全部 API 折叠为 CloudBase 内部流式地址，既破坏 Network 可读性，也会让手机号登录暴露网关级容器错误。HTTP 云函数的原生服务器入口不要求客户端使用该内部调用通道。
- `user-plants` 列表若收到已确认的 CloudBase `PE-MYS-5000`、`SQLSTATE 08000`、`Connection error` 三项同时成立的瞬态连接错误，仅以原 SQL 和原参数串行重试一次。详情、身份查询、写入及其他 SQL 错误不重试；该规则不引入双路竞速、旁路、缓存或新授权链路。

## 冷启动与轮次口径

### 轮次

每次实验必须生成新的 `dispatch_run_id`、`execution_id` 和独立证据目录。上一轮的请求、截图、日志或结论不得拼接到本轮。

一个冷启动轮次只能从目标接口静默窗口结束后的首次首页加载开始：在该窗口内不得有 `auth/user` 或 `user-plants` 请求。QA 启动、预检或首页自动加载如果已经发出任一目标请求，该启动过程不构成冷启动轮次，必须重新计算静默窗口；不能把随后捕获到的请求倒标为“首个冷请求”。

### 首个请求

在真实小程序 DevTools Network 面板中，本轮按时间顺序出现的第一个 `user` 请求是冷启动候选；后续同一轮请求只能作为热请求候选。Network 面板的请求顺序优先于页面截图中的视觉顺序。

### 冷标记

- 重启隔离 DevTools/Automator 只重建本地测试运行时，不会保证远端 CloudBase 函数容器重启。
- 当前受控方法是对目标函数使用至少 6 分钟的请求间隔（5 分钟生命周期参考值加 60 秒缓冲），再发起下一轮首个真实 `wx.request`。该间隔只产生冷候选，不保证容器已回收；是否为冷启动只由随后关联的 `Init Report` 决定。
- Automator 叶子支持通过 `QA_REMOTE_READ_COLD_INTERVAL_MS=360000` 在前 N 个冷候选轮次前强制执行该间隔；热样本阶段不等待。未设置该变量时只做候选采集，不能据此宣称冷样本达标。
- 冷候选必须用 CloudBase `Init Report` 按真实请求 ID、容器 ID 和时间关联确认；无法关联时只能记为 `BLOCKED_ENV/未验收`。
- 人工 CloudBase MCP 关联使用 180 秒窗口（`QA_COLD_START_EVIDENCE_TIMEOUT_MS=180000`）；该等待只服务于证据收集，不计入 `wx.request` 耗时，也不改变冷/热判定。
- 每轮开始前必须同时指定候选请求文件与 CloudBase 关联文件，并预先创建可更新的关联文件。候选文件形成后，由 CloudBase MCP 按 `probe_id` 查询应用日志、同请求 ID 的系统日志，并在 180 秒窗口内更新关联文件；没有这项交接时，即便事后查到 `Init Report`，原始 Automator 报告也只能保持 `BLOCKED_ENV`。传给子进程的两个文件路径必须是绝对路径（运行器也会把仓库相对路径归一化为绝对路径），避免证据写在工作目录之外而误报阻断。QA 叶子执行超时必须至少覆盖“全部冷候选静默间隔 + 证据等待窗口 + 60 秒收尾”；1 个 6 分钟冷候选和 180 秒证据窗口对应不少于 `--execution-timeout-ms=600000`，禁止沿用 120 秒默认值。
- CloudBase MCP 的 `searchLogs` 时间参数使用云端日志显示的 `Asia/Shanghai` 本地时间；必须按返回记录的时间范围查询，不能把本机 UTC 时间直接填入而误判“无日志”。
- 轻量读处理器必须在合法 QA probe 请求中写出 `qa-performance-probe` 与 `qa-performance-timing` 两类非敏感日志；前者用于端上请求、函数和容器的精确关联，后者只用于耗时拆解。缺任一类时，该版本不得进入冷/热验收。
- `Init Report` 的 `Coldstart` 只表示云函数初始化耗时；端上性能唯一使用真实 `wx.request` 从发起到 `success/fail` 的 `elapsed_ms`。两者必须同时记录，不能互相替代。

## 验证门槛

1. 先恢复业务闭环：手机号登录、`auth/user` 统一用户、票据用户标识和 `user-plants` 归属必须一致；已有植物的测试账号不得返回空列表。
2. 单元测试覆盖票据签发/验签、旧票据拒绝、过期刷新、错误签名、平台账号隔离和本地路由回退。
3. 真实 API 回归使用 `cloud1_dev`、真实隔离会话和 HTTPS，覆盖 `auth/user`、`user-plants`、`diagnosis/question/start` 的认证边界及已存在植物读回；不得注入假响应。
   - `user-plants` 额外覆盖已确认瞬态 SQL 错误的一次串行恢复、非瞬态错误直出、详情不重试，以及“详情仅接受持久会话、短票据拒绝”。
4. 探索采样：每个目标接口至少 5 个经云端 `Init Report` 确认的冷请求和 10 个热请求，只用于定位主要耗时和确认优化信号，不作通过判定。
5. 正式验收：每个目标接口至少 20 个确认冷请求和 30 个热请求；保持相同环境、账号、数据、参数和小程序运行时。冷 p95 必须不超过 1000ms，热 p95 必须不超过 300ms，并且业务字段、顺序、数量、跨页读回完全一致，才可保留优化。若后续取得业务等价的历史版本，可额外记录相对改善；它不是本期硬指标判定的前置条件，也不能覆盖绝对门槛。
6. Automator 正式证据必须使用隔离 9421/9422、catalog live 叶子、真实 `wx.request`、页面数据和本轮有效 PNG；Node、curl、函数内部耗时和旧截图只能作诊断证据。
7. 后续发布必须按单函数、可回滚原则进行；每次发布前记录当前代码指纹，发布后先做真实接口回归，再进入下一次端上轮次。任一身份、数据或耗时回退按已记录代码 SHA 单函数回滚。

## 已验证事实（当前执行轮次）

- `interval-auth-user-20260909`：6 分钟间隔下两次 `auth-user-http` 云端冷启动已由 `Init Report` 确认，分别为 111ms、113ms；端上 `wx.request` 分别为 979ms、1001ms。结论：毫秒级函数初始化正常，但不等于端上首请求毫秒级。
- `round-cold-user-devtools-20260909-1900`：真实小程序请求均为 HTTP 200；`auth/user` 为 394ms、229ms，`user-plants` 为 436ms、388ms，植物总数 39，字段/ID 合同通过。该轮 `auth/user` 未取得按请求关联的 `Init Report`，因此不计入冷启动样本。
- `round-cold-user-devtools-20260909-1912`：隔离 9421/9422 运行时的 catalog 预检已改为只调用 `plant-catalog-http/catalog/health`。本轮第一个 `auth/user` 与第一个 `user-plants` 请求分别由同一请求 ID 的 CloudBase `Init Report` 确认冷启动，初始化耗时 100ms、112ms；对应真实 `wx.request` 端到端耗时 1052ms、1122ms。第二个请求分别复用同一容器、未出现 Init Report，作为热候选，端到端耗时 223ms、498ms。植物列表仍为 39 条且业务断言、截图通过。运行时未预挂接外部日志文件，Automator 原报告保持 `BLOCKED_ENV`；独立关联证据保存在本轮目录，不能把后置查询改写成原报告的运行时 PASS。
- `round-cold-user-devtools-20260909-1921`：预检仍只命中健康路由；四条目标请求均为 HTTP/业务 200，`user-plants` 返回 39 条。CloudBase 日志显示 `auth-user-http` 和 `plant-user-http` 各自的两个请求复用同一容器，均未出现 `Init Report`，因此本轮冷样本数为 0；独立关联证据已保存，Automator 报告按“冷样本不足”保持 `BLOCKED_ENV`。该结果进一步确认本地 DevTools 重启不能替代远端函数生命周期间隔。
- `round-cold-user-devtools-20260909-1925`：距离上一轮目标请求超过 6 分钟后，首个 `auth/user` 与首个 `user-plants` 均命中新的 CloudBase `Init Report`，原始日志中的 `Coldstart` 分别为 97ms、111ms；对应真实 `wx.request` 端到端耗时 816ms、1112ms。后续请求复用同一容器，端到端耗时 300ms、348ms。四条请求均 HTTP/业务 200，植物列表 39 条。独立日志关联证据已保存；因 30 秒外部证据窗口不足，Automator 原报告仍为 `BLOCKED_ENV`，不将后置关联改写为运行时 PASS。
- `round-cold-user-devtools-20260909-1933`：再次满足 6 分钟远端间隔，Automator 在 90 秒证据窗口内读到 CloudBase MCP 关联文件；首个 `auth/user` 和首个 `user-plants` 被标记为冷，后续请求同容器标记为热。真实 `wx.request` 端到端耗时分别为冷 997ms/1034ms、热 355ms/530ms；四条请求均 HTTP/业务 200，植物列表 39 条，截图与样本温度断言通过。报告自身因仍未达到探索采样量且缺少优化前基线而保持 `BLOCKED_ENV`，不作为性能 PASS。
- `round-cold-user-devtools-20260910-0945`：新的隔离 QA 轮次在完整 6 分钟间隔后，首个 `auth/user` 与首个 `user-plants` 分别由同请求 ID 的 CloudBase `Init Report` 确认冷启动，初始化耗时 99ms、118ms；端上 `wx.request` 为 842ms、1808ms。后续同函数请求复用同一容器、无 `Init Report`，作为热样本，端上耗时 237ms、661ms。四条请求均 HTTP/业务 200，列表为 39 条且截图通过。该轮未在启动前配置外部关联文件，故原始 Automator 报告按规则保持 `BLOCKED_ENV`；后置 MCP 关联仅证明方法有效，不把原报告改写为 PASS。
- `round-cold-user-devtools-20260910-0956`：新的隔离 QA 轮次同样以完整 6 分钟间隔生成首对冷候选；CloudBase MCP 按 `probe_id`、请求 ID 和容器 ID 确认 `auth/user` 初始化 109ms、`user-plants` 初始化 111ms，后续同容器请求无 `Init Report`，因此为热样本。端上冷/热耗时分别为 997ms/254ms 与 1063ms/594ms；四条请求均 HTTP/业务 200，列表为 39 条且截图通过。首次人工关联文件落点晚于 90 秒窗口且 JSON 无效，原始报告保持 `BLOCKED_ENV`；该事实只用于收紧下一轮交接，不构成性能 PASS。
- `round-cold-user-devtools-20260910-1006`：隔离 QA 在完整 6 分钟间隔后，预先配置候选与可更新关联文件，并在 180 秒窗口内完成交接。首个 `auth/user` 与 `user-plants` 均由同请求 ID 的 CloudBase `Init Report` 确认冷启动，初始化耗时 101ms、97ms；对应真实 `wx.request` 为 1116ms、918ms。紧接请求复用同一容器、无 `Init Report`，确认热请求，端上耗时 240ms、441ms。四条请求均 HTTP/业务 200，列表为 39 条且截图通过；Automator 本身成功读取本轮关联文件并断言每接口各 1 个冷、热样本。报告保持 `BLOCKED_ENV` 的唯一原因是探索轮缺少可回放的优化前基线，不能据此标记性能 PASS。
- `exploration-current-20260910`：以 5 个独立隔离 QA 轮次完成当前版本探索采样；每轮先静默 6 分钟，再采集每接口 1 冷 + 2 热。全部 30 个真实 `wx.request` 均 HTTP/业务 200，植物列表 39 条、字段合同与本轮截图均通过；CloudBase `Init Report` 按 `probe_id`、请求 ID、容器 ID 确认每接口共 5 冷、10 热。端上统计为：`auth/user` 冷 min/p50/p95/max 994/1149/1192/1192ms，热 212/265/368/368ms；`user-plants` 冷 1021/1129/1613/1613ms，热 369/426/1350/1350ms。该数据只确认冷/热差异与当前版本波动，不是优化前后 p95 对比，不能作为性能 PASS。
- 当前真实 API 回归：`diagnosis-question-start-http/diagnosis/question/start` 返回 200/200，旧 `diagnose-http/diagnosis/question/start` 返回 200/200，未认证请求返回 401；诊断入口不属于本期两个读链路性能改造，仍需单独按端上真实链路评估。
- `response-read-recovery-20260910`：一次真实 `plant-user-http/user-plants` 冷请求在函数初始化后收到 CloudBase `PE-MYS-5000`，详情为 `SQLSTATE 08000` 的连接错误；相同会话的后续列表读取成功。该现象不属于身份失败，已在列表轻量入口增加严格匹配的一次串行恢复。恢复规则的单元逻辑覆盖已通过。
- `response-read-recovery-20260910` 部署：仅 `plant-user-http` 已更新到云端；函数仍为 `Nodejs18.15`、256MB、30 秒、既有 Layer 与既有并发配置，未修改 VPC、环境变量、Layer、内存或并发。部署后以真实隔离 QA 平台会话执行 `unit_real_data`：`auth/user` 与列表的持久会话/短票据读取均为 200，植物总数为 39 且 ID、顺序、字段一致；持久会话详情为 200，短票据详情、无效会话、未认证和错误签名均为 401；两条 `diagnosis/question/start` 入口均为 200，未认证为 401。CloudBase 聚合日志中本轮 `plant-user-http` 回归请求均正常结束，未出现新的 500。
- `auth-controlled-cold-fixed-20260910`：完整 6 分钟静默窗口后的首个 `auth/user` 与 `user-plants` 均由同请求 ID 的 `Init Report` 确认冷启动，初始化耗时分别为 104ms、102ms；真实 `wx.request` 端到端为 827ms、1214ms。随后的同容器热请求为 317ms、471ms。四条请求均 HTTP/业务 200，真实列表为 39 条，页面截图和业务断言通过。该轮原报告只因外部证据文件使用相对路径而保持 `BLOCKED_ENV`；运行器现已在交接前归一化为绝对路径。该轮仅有每接口 1 冷、1 热，不能作为 p95 或性能 PASS。
- `catalog-match-equivalence-20260910`：对开发库全部 53 条 `user_plant_instances` 做只读的新旧目录关联比对，目录身份结果 0 条不一致。`user-plants` 候选仅对 ASCII 目录标识走两条索引查询分支；缺失或非 ASCII 标识继续使用原 `utf8mb4_unicode_ci` 匹配和原排序，不改表、不建索引、不裁剪响应字段。
- 当前发布状态（2026-09-10 13:01 Asia/Shanghai）：一次错误的部署命令曾更新 8 个函数的代码；配置复核显示内存、超时、VPC、Layer 与并发均未修改。随后 `plant-user-http` 已通过单函数清单重新发布为正确的候选包，处于 Active。后续部署必须显式指定单函数清单，禁止使用会默认选择全部函数的命令。
- 发布后接口核验：初次核验中，4 次 `auth/user` 与 1 次 `diagnosis/question/start` 为 HTTP/业务 200；3 次 `user-plants` 虽返回 HTTP 200，但业务码为 500。根因是 CloudBase 预处理 SQL 禁止 `IS NULL`。候选 SQL 已改为等价的 `<=> NULL` 并重新单函数发布。之后隔离端上正式运行 `post-list-fix-question-start-20260910-r2`（`automator_live_real_api`）通过：列表预检、诊断页交互和 `diagnosis/question/start` 的真实 `wx.request` 均 HTTP/业务 200，且保存两张有效截图。该结果证明列表业务恢复及历史 `start` 401 不再出现；它不是读接口性能 PASS。

## 当前状态

目录关联 SQL 候选已被端上验证证伪，已终止本期进一步性能优化。候选前的确认读数为：`auth/user` 冷/热 827ms / 317ms，`user-plants` 冷/热 1214ms / 471ms。候选 `response-optimization-candidate-r2-20260910` 在同一隔离端上、同一真实账号、同一 39 条植物数据下，由 CloudBase `Init Report` 确认冷/热后得到：`auth/user` 839ms / 269ms，`user-plants` 1228ms / 511ms。候选没有改善列表冷请求，且列表热请求回退超过 5%；不满足只保留正向增益的条件。因此不进入 20 冷/30 热正式采样，不迁移其他 HTTP 函数，也不引入缓存、MySQL 旁路、预置实例或其他扩展方案。

- 候选探索轮 `response-optimization-candidate-r1-20260910`：在 6 分钟静默后，以隔离端上真实 `wx.request` 依次发出候选与热请求。四条请求均 HTTP/业务 200，真实列表 39 条、响应字段合同与截图有效；端上耗时依次为 `auth/user` 899ms、`user-plants` 465ms、`auth/user` 325ms、`user-plants` 371ms。CLS 日志延迟超过运行器原有的 45 秒关联窗口，但后续已按 `request_id` 取回同轮记录：首个 `auth/user` 有 `Init Report`，确认真冷启动（初始化 109ms）；同轮两个 `user-plants` 均无 `Init Report`，确认是热请求；第二个 `auth/user` 也是热请求。故该轮只形成 `auth/user` 的 1 个确认冷样本和两个接口的热态信号，不足以计算 p95，也不能把 `user-plants` 的 465ms当作冷启动结果。

- 遥测门槛：下一轮前必须把 ColdBase Init Report 的日志可见延迟纳入运行器等待期，使用 `request_id:"..."` 精确查询并在叶子退出前写入关联证据。时间间隔只能制造冷候选，只有同请求的 `Init Report` 才能确认冷启动；不再因 45 秒内没有日志而重复空等或误判日志不可用。

- `response-optimization-candidate-r2-20260910`：四条真实 `wx.request` 均 HTTP/业务 200，列表为 39 条、字段合同与截图通过。首个 `auth/user` 与 `user-plants` 均由同请求 ID 的 `Init Report` 确认为冷，初始化分别为 98ms、100ms；同函数第二个请求复用相同容器、无 `Init Report`，确认为热。端上冷/热耗时分别为 839ms/269ms 与 1228ms/511ms。该探索轮成功完成冷/热关联，但由于候选无正向收益而不进入正式性能验收。

- 回退与终止（2026-09-10）：仅撤销已证伪的 ASCII 双索引目录关联 SQL，恢复稳定的 `utf8mb4_unicode_ci` 目录匹配、原排序和原响应字段；不回退用户已有的轻量读入口、详情限制、票据语义或其他写入代码。单函数 `plant-user-http` 已发布回退包，源指纹 `ea8a51465cd258dea55dcedf7bd7a96ef126a333b84a166a1d2c6f32f48a5444`，云端为 Active、Nodejs18.15、256MB、30 秒，VPC、Layer、并发与环境变量均未改变。回退后隔离端上 `automator_live_real_api` 冒烟通过列表预检、诊断交互和 `diagnosis/question/start` 的 HTTP/业务 200。本期结论为“候选无收益，已回退并终止”，不是性能达标。
