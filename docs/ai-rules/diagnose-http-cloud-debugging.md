# diagnose-http 云端调试避坑索引

## 1. 定位

本文件是《diagnose-http 云端调试避坑记录 v1》的**轻量索引版**，用于接入 Codex / subagent 工作流。

它不承载完整历史排障细节，只负责：

1. 告诉 main agent 什么时候需要读取完整避坑文档。
2. 告诉 subagent 应优先查哪些问题域。
3. 避免每次云端、replay、CloudBase、H5 管理页问题都从零排查。
4. 避免把 DNS、网关、鉴权、schema、部署、replay、前端代理问题误判为 diagnose 业务逻辑问题。

完整历史文档建议归档为：

```text
docs/ai-rules/archives/diagnose_http_云端调试避坑记录_v1.md
```

本索引建议放置为：

```text
docs/ai-rules/diagnose-http-cloud-debugging.md
```

---

## 2. 何时读取本文件

当任务涉及以下内容之一时，main agent 应在 Dispatch Plan 中指定读取本文件：

1. `diagnose-http` 云端调试。
2. CloudBase 网关 smoke。
3. CloudBase MCP / 控制面。
4. `cloudbase-http-check.mjs`。
5. terminal-e2e / batch / suite 回放脚本。
6. replay / zero-model / DB-backed replay。
7. `diagnosis_sessions`、`diagnosis_follow_ups`、`question_queue`、`visual_*` 相关查表。
8. `cloud1_dev` 与 production schema 分流。
9. H5 管理页：
   - `diagnosis-review`
   - `out-of-pool-review`
10. Vite 本地代理。
11. CloudBase 函数日志、`requestId`、`FUNCTION_EXECUTE_FAIL`、`SYS_ERR`。
12. `skipAuth`、匿名登录、Bearer token、`x-terminal-e2e`。
13. 云函数部署、layer、bundled ZIP、COS deploy。
14. ranking → route、outcome 瘦身、gate、问诊路径、runtime 的 live 验收。
15. 历史 session 暴露的客户端最终展示异常，例如 review/list 可见但真实 bug 在 result/read 或前端消费链路。

---

## 3. 推荐读取者

| Agent | 是否建议读取 | 读取场景 |
|---|---:|---|
| `release_ops` | 高 | 部署、CloudBase 网关、MCP、函数日志、smoke、回滚、环境变量、schema 验证 |
| `code_explorer` | 高 | 定位 `diagnose-http`、terminal-e2e、replay、H5 管理页、schema helper、部署脚本 |
| `implementer_deep` | 中高 | 修改 diagnose-http、replay、CloudBase、schema、H5 代理、部署脚本 |
| `qa_reviewer` | 中高 | 审查 live 验收是否有效、是否拿旧 session / 错 schema / 错 wrapper 当证据 |
| `architect_reviewer` | 中 | 涉及 route、outcome、gate、replay、schema 边界设计 |
| `docs_keeper` | 中 | 整理排障文档、同步规则、归档踩坑记录 |
| `implementer_fast` | 低 | 仅当是小范围脚本修复且 Dispatch Plan 明确指定 |
| `task_planner` | 低 | 只需知道本索引存在，并把读取任务派给对应角色 |

---

## 4. 总排障原则

### 4.1 先分层，不要混判

遇到 `diagnose-http` 云端异常时，必须先区分问题所在层级：

1. 本机 DNS / TLS。
2. CloudBase 网关。
3. CloudBase MCP / 控制面。
4. 云函数部署是否生效。
5. 函数 runtime / layer / 依赖。
6. 函数日志真实错误。
7. SQL schema / 表结构 / collation。
8. replay / batch runner 协议。
9. H5 本地代理。
10. diagnose 业务逻辑。
11. 前端 normalize / 页面消费链路。

不要把外层现象直接判断为 diagnose 业务逻辑错误。
不要把 `review/list`、replay、DB payload 或 routeDecision 中间态直接判断为客户端最终展示正确。

### 4.2 先拿锚点，再做判断

每次云端复测至少记录：

1. `requestId`
2. `diagnosisSessionId`
3. `visualBatchId` / `latestVisualCallBatchId`
4. 触发图片路径或样本标识
5. 请求使用的 CloudBase envId
6. 请求落入的 SQL schema
7. 函数 `modTime` / 发布版本
8. 用户可见验收字段，例如 `visibleOutcomes`、`primaryOutcome`、`secondaryOutcomes`、页面最终展示来源

---

## 5. 索引目录

### 5.1 DNS / 网关 / 本机网络

对应原文重点章节：

- 1. 本机 DNS 解析 `api.tcloudbasegateway.com` 可能抖动
- 11. `dns.setServers()` 不会修复 `dns.lookup()` 挂死
- 14. CloudBase 控制面与网关是两套排障面
- 52. H5 本地 dev 代理若对 `cloudbasegateway` 挂起/502，优先怀疑本机 DNS/TLS

关键词：

```text
api.tcloudbasegateway.com
curl --resolve
TERMINAL_E2E_CURL_RESOLVE_IP
dns.lookup
dns.resolve4
tcb.tencentcloudapi.com
scf.tencentcloudapi.com
```

排查原则：

1. 网关问题优先查 `api.tcloudbasegateway.com`。
2. 控制面问题优先查 `tcb.tencentcloudapi.com` / `scf.tencentcloudapi.com`。
3. `dns.setServers()` 只影响 `resolve*`，不一定影响 Node 默认 `lookup`。
4. Node 代理挂起但 `curl --resolve` 正常时，优先怀疑本机 Node DNS/TLS 链路。

---

### 5.2 `skipAuth` / 匿名登录 / 网关鉴权

对应原文重点章节：

- 2. `--skip-auth=true` 不是“网关一定放行”
- 3. `cloudbase-http-check.mjs` 脚本坑
- 4. `skipAuth` + `x-terminal-e2e=true` 的真实语义
- 12. `skipAuth=true` 在部分 health / smoke 路径上仍可能被网关挡成 401
- 17. production fresh smoke 的最稳组合
- 30. development 环境下用匿名 token 直接测 diagnose 主链时，要显式带 `x-terminal-e2e=true`
- 39. 某些 live diagnose 验收必须同时满足“真实匿名 token + skipAuth=true”

关键词：

```text
skipAuth
x-terminal-e2e
Authorization: Bearer
force-anonymous-auth
dev_terminal_*
401 用户不存在
匿名登录
```

排查原则：

1. `skipAuth=true` 只保证函数内部逻辑可能绕过，不保证 CloudBase 网关放行。
2. live smoke 优先真实匿名登录。
3. 某些 diagnose live 验收需要同时满足：
   - 真实匿名 token
   - `skipAuth=true`
   - `x-terminal-e2e=true`
   - 显式 `openid=dev_terminal_*`
4. token 为空时不能发送空 `Authorization: Bearer `。

---

### 5.3 schema / SQL / 表结构 / collation

对应原文重点章节：

- 11. `cloud1_dev` 是 SQL schema，不是 CloudBase envId
- 13. `--app-env=development` 的 live smoke 会写到 `cloud1_dev`
- 18. dev schema 可能缺 formal runtime 表
- 35. development schema 缺正式运行时表会制造假 500
- 37. `manageSqlDatabase.runStatement` 不能执行多语句 SQL
- 41. WeDa 预编译 SQL 不支持 `IS NULL`
- 42. 新增审核表的 collation 必须跟现有诊断表对齐
- 46. diagnose SQL 表不要靠想当然查字段
- 56. review list 若只在 live 报 `Illegal mix of collations`
- 64. `--app-env=development` 的 smoke 若只写 prod schema，再回读 `cloud1_dev` 会读到旧 gate JSON：本次 `diag_1778900911740_co24xnlm` 验证已确认需按读写同 schema 执行
- 58. 以后所有本地测试先统一 schema，再开始调试
- 61. diagnosis-review 合并回访数据时，先补表，再统一 schema helper
- 62. 诊断函数不能因为 `NODE_ENV=production` 就强制锁死 prod schema

关键词：

```text
cloud1_dev
cloud1-2grufevs395a9d5e
x-app-env
SCHEMA_ENV
schema-resolver.js
table()
diagnosis_sessions
question_queue
visual_raw_image_records
collation
utf8mb4_0900_ai_ci
utf8mb4_unicode_ci
IS NULL
<=> NULL
idx_diagnosis_sessions_created_at
idx_diagnosis_sessions_outcome_created
idx_visual_raw_session_order
TERMINAL_E2E_FUNCTION_BASE_URL
DEPLOY_BUST
SQL_TIMEOUT
```

排查原则：

1. `cloud1_dev` 是 SQL schema，不是 CloudBase envId。
2. 本地 / H5 / terminal e2e 默认优先查 `cloud1_dev`。
3. 线上 / production 网关请求优先查 `cloud1-2grufevs395a9d5e`。
4. 先看真实 schema，再写 SQL。
5. `question_queue` 不要默认是每题一行，优先检查 JSON 字段。
6. `models.$runSQL` 预编译 SQL 不支持 `IS NULL`，改用 `<=> NULL`。
7. 新表 collation 必须与主链表对齐。
8. 显式 request env 优先，不得被 `NODE_ENV=production` 强行覆盖。
9. `TERMINAL_E2E_FUNCTION_BASE_URL` 优先于默认网关地址时，必须配合正确的函数路径前缀（见 5.10）。
10. 同一 smoke 验收要强制“写库 schema 与读库 schema 一致”：`diag_1778900911740_co24xnlm`（0 模型）曾在 `--app-env=development` 下写入 `cloud1`/prod，但读取走 `cloud1_dev` 时仍拿到了旧黄叶 JSON；问题复现后修订为读写同 schema 后通过。
11. `visual_raw_image_records` 禁止对 `session_id` 强制 `COLLATE`；无历史兼容依赖时可改依赖 `idx_visual_raw_session_order(session_id,input_slot_order,created_at)`。
12. `diagnosis_sessions` 相关查询需补齐 `idx_diagnosis_sessions_created_at` 与 `idx_diagnosis_sessions_outcome_created`，用于 list 的排序与筛选。
13. review list 主查询应统一使用 `diagnosis_sessions LEFT JOIN batch` 的 compact 模式，配合 `SQL_TIMEOUT`（建议 5s）与降级返回（partial/degraded），避免 >5s 长挂。

### 5.3.1 e2e 路径与 service base 的兼容说明（补充）

对应原文重点章节：

- 13. 追问后最终输出不能靠空候选或纯先验硬判（本小节为部署脚本路径兼容补充）
- 20. CloudBase MCP 函数服务的参数形态别猜（本小节为执行入口参数与 URL 约束补充）
- 26. `scripts/deploy-function.js` 不是闭环验收路径（本小节为 smoke 运行方式补充）

关键词：

```text
TERMINAL_E2E_FUNCTION_BASE_URL
TERMINAL_E2E_USE_CURL_FALLBACK
TERMINAL_E2E_CURL_RESOLVE_IP
/v1/functions/
/diagnose-http/health
/diagnose-http
webfn=true
```

排查原则：

1. 不再适用：`https://<envId>.service.tcloudbase.com/diagnose` 这类旧写法。服务域名下诊断入口为 `.../diagnose-http/...`。
2. 不再适用：用服务域名时继续拼 `webfn=true`。
3. 诊断函数健康检查与 smoke 在服务域名下应使用 ` /diagnose-http/health`。
4. 若使用 `TERMINAL_E2E_FUNCTION_BASE_URL`，建议明确写 `--app-env=development`、`--skip-auth=true`、`--terminal-e2e=true`。
5. `TERMINAL_E2E_FUNCTION_BASE_URL` 与默认网关入口仅作环境切换，不应混用 URL 形态。

---

### 5.4 部署 / MCP / 控制面 / layer / bundled 包

对应原文重点章节：

- 6. 本地部署脚本可能挂住，不要盲等
- 20. CloudBase MCP 函数服务的参数形态别猜
- 21. 控制面部署/拉日志优先走可编程 MCP
- 22. 云函数更新若报 `ResourceNotFound.Dependency`，优先走 bundled 部署
- 26. `scripts/deploy-function.js` 不是闭环验收路径
- 28. 本地 bundled 部署前必须确认入口依赖真的打进了函数包
- 29. bundled ZIP 超过 1.5MB 时，直接切 COS 模式
- 51. CloudBase 控制面若卡在 `RefreshAccessToken`
- 53. CloudBase MCP 以后优先走 `web` 授权
- 63. 重新发 layer 时，zip 包必须带上 `configs`
- 67. `scripts/deploy-function.js` 不足以作为 diagnose-http 的可信部署链

关键词：

```text
deploy-function.js
cloudbase-mcp
manageFunctions.updateFunctionCode
getFunctionDetail
getFunctionDownloadUrl
getCompleteFunctionLogs
modTime
status
ResourceNotFound.Dependency
deployMode: cos
functions-framework
/opt/configs
layer
```

排查原则：

1. `deploy-function.js` 只能是 convenience path，不是可信闭环。
2. 正式验收优先：
   - MCP 更新成功
   - 函数 `modTime/status` 更新
   - 下载云端 zip 对比关键文件
   - 真链路 smoke / 日志核验
   - 热容器刷新生效确认（`DEPLOY_BUST`）
3. MCP 方法参数形态不能猜，要看实现或最小探针。
4. bundled 部署前确认 `node_modules/@cloudbase/functions-framework/bin/tcb-ff.js` 存在。
5. ZIP 超过 1.5MB 直接切 COS。
6. layer zip 必须带：
   - `package.json`
   - `package-lock.json`
   - `utils/`
   - `configs/`
   - `node_modules/`
7. `updateFunctionCode` 成功后仍需用 `DEPLOY_BUST` 强制刷新热容器；未刷新前不可把代码更新当成已生效。
8. 部署验收默认必须区分并逐条确认：
   - updateFunctionCode 成功
   - DB index 落库（如本轮新增索引）
   - 热容器刷新
   - 真实 HTTP smoke 成功且 requestId 可回溯

---

### 5.5 函数日志 / requestId / gateway 错误码

对应原文重点章节：

- 7. 诊断调试推荐顺序
- 15. `FUNCTION_EXECUTE_FAIL / SYS_ERR` 先去看函数日志
- 19. “请求层看起来像 500”之前，先反查函数日志
- 24. 每次云端复测至少同时记录 4 个锚点
- 54. `/diagnosis/review/*` 页面 500 时，先查 `cloudbase-functions.json`

关键词：

```text
requestId
FUNCTION_EXECUTE_FAIL
SYS_ERR
GetFunctionLogs
queryLogs
CLS
RetMsg
LogJson
cloudbase-functions.json
Not Found
```

排查原则：

1. 网关错误码只能说明“没成功”，不能说明具体原因。
2. 必须用 `requestId` 查函数日志。
3. 以函数日志中的 `RetMsg` 和 `LogJson` 作为最终事实。
4. `Not Found` 优先检查 `cloudbase-functions.json` route 清单。
5. 新增 review / audit / admin 路由后，必须同步 `cloudbase-functions.json`。
6. 若 `getFunctionLogDetail` 失败/空值/滞后，改用 CLS `queryLogs` 按 `request_id` + `function_name` fallback 核验。

---

### 5.6 replay / zero-model / batch / suite

对应原文重点章节：

- 25. `cloudbase-http-check.mjs` 作为子进程时，`stdout` 必须是纯 JSON 协议
- 27. suite 入口也必须对 child stdout JSON 协议做硬失败
- 71. 本地零模型 replay 不能裸跑，必须走 CloudBase env 注入入口
- 72. replay 默认重演“下一动作”，不是自动重演“当时那一轮”
- 59. 组合回放脚本本地入口默认走 localhost，不要擅自切到 127.0.0.1
- 60. plant-sample 批量回放必须先做前端等价压缩

关键词：

```text
stdout
pure JSON
safeJsonParse
run-visual-symptom-batch
run-diagnose-outcome-batch
run-visual-symptom-suite
replay-saved-diagnosis-sessions
run-with-cloudbase-env
--replay-round
--replay-stage
localhost:5173
127.0.0.1
sips
```

排查原则：

1. 子进程 stdout 必须只输出最终 JSON。
2. warning、banner、调试日志必须走 stderr。
3. runner 解析失败必须硬失败，不能 success with empty payload。
4. 本地 replay / zero-model 必须走：
   - `npm run replay:diagnosis-sessions`
   - 或 `npm run run:with-cloudbase-env`
5. 默认 replay 看“接下来会怎样”；带 `--replay-round/--replay-stage` 才是看“当时为什么那样判”。
6. 大图不能原样 inline，先模拟前端压缩。

### 5.6.1 历史 session 的 0 模型 result/read 与前端可见验收

适用场景：

- 用户给出 `diag_*` session，问题发生在客户端运行时、最终展示、follow-up、diagnose 结果页或 review/list 回放中。
- 任务目标是确认 route / outcome / gate / runtime 的用户可见结果，而不是重新调用模型。

关键词：

```text
0 模型
zero-model
result/read
visibleOutcomes
primaryOutcome
secondaryOutcomes
finalResult
review/list
follow-up.vue
diagnose.vue
normalizeDiagnosisResult
```

验收原则：

1. 历史 session 验收优先使用 0 模型 smoke，不应重新触发视觉模型或文本模型。
2. `review/list` 只能说明问题可观察，不能作为修复位置；客户端运行时问题必须验证 `result/read` 与前端消费链路。
3. 多 outcome 类目标必须断言 API 顶层字段，而不是只看 DB payload 或 `routeDecision`：
   - `visibleOutcomes.length` 满足目标要求。
   - `primaryOutcome` 与 `secondaryOutcomes` 同时存在且语义一致。
   - 不得只取最后一次 `finalResult` 作为最终输出。
4. 前端验收必须覆盖 normalize 与页面消费面：
   - `src/utils/diagnose-flow.js`
   - `src/pages/diagnose/follow-up.vue`
   - `src/pages/diagnose/diagnose.vue`
5. 如果旧 snapshot 单结果、新 payload 多结果并存，验收要确认前端最终展示使用最新多 outcome 契约。
6. 如果 DNS 或网关抖动导致重复 smoke 失败，必须记录最近一次成功的 HTTP 证据、函数部署证据、DB / 日志证据，并把后续失败标为网络层风险，不能反向证明业务验收通过。
7. goal 完成标准必须按目标验收契约逐项全绿；DB、replay、日志、命令成功或 review 回放任一单项通过都不等于完成。

---

### 5.7 H5 管理页 / review / out-of-pool

对应原文重点章节：

- 10. out-of-pool H5 列表不能直接回整张 replay 图
- 12. diagnosis-review 这类 H5 管理页必须隔离小程序样式
- 40. `--use-inline-image=true` 不等于数据库里自动“留图”
- 43. H5 本地 dev 仅靠反向代理不能绕过 CloudBase 网关凭证校验
- 44. 列表页不要返回 inline replay 图
- 50. out-of-pool 历史数据并不一定能补回图片
- 55. diagnosis-review 的 `history=200 但空列表` 不代表后端坏了
- 57. H5 本地代理若偶发 502，先确认 Vite dev server 是否已重启
- 64. 改了 Vite 本地代理后，必须重启 `dev:h5`
- 65. diagnosis-review 的 manual 不能只靠 platform tag

关键词：

```text
diagnosis-review
out-of-pool-review
out_of_pool_replay_image_ref
previewImageRef
has_replay_image
Element Plus
#ifdef H5
vite.config.js
dev:h5
__tcb_functions__
history
review/list
review/detail
review/images
manual
batch
legacy
```

排查原则：

1. 列表接口只返回轻量元数据，不返回 inline 大图。
2. inline replay 图只能通过单图接口 lazy fetch。
3. H5 管理页样式必须 H5 / 小程序隔离。
4. H5 本地代理必须给 CloudBase 网关注入真实匿名 token。
5. 改 `vite.config.js` 后必须重启 `npm run dev:h5`。
6. `history` 是 owner-scoped，不适合内部审核页查全量。
7. 内部审核页走 `diagnosis/review/list/detail/images`。
8. `manual` 不只靠 platform tag，旧真人小程序会话可按 openid 形态推断。
9. review 图片预取应按分页和并发上限限流，不在列表页一次性拉齐所有 replay 图。

---

### 5.8 图片 / inline image / storage upload / out-of-pool 留图

对应原文重点章节：

- 5. storage 上传链不是 diagnose 主链，坏了就绕开
- 38. 直调 `/diagnosis/start` 做样本验证时，本地图片路径不会自动变成 inline image
- 40. `--use-inline-image=true` 不等于数据库里自动“留图”
- 44. 列表页不要返回 inline replay 图
- 50. out-of-pool 历史数据并不一定能补回图片
- 60. plant-sample 批量回放必须先做前端等价压缩

关键词：

```text
--use-inline-image=true
image-path
data:image
image_ref=[inline_data_url]
storage-http
out_of_pool_replay_image_ref
visual_raw_image_records
visual_normalized_image_results
plant-sample
```

排查原则：

1. diagnose smoke 优先 inline image，绕开 storage 上传链。
2. 手工直调 `/diagnosis/start` 时，本地路径不会自动变 data URL。
3. `image_ref=[inline_data_url]` 不等于数据库里完整留图。
4. out-of-pool 是否留图要看 `raw_structured_output.out_of_pool_replay_image_ref`。
5. plant-sample 大图先压缩，再 inline。

---

### 5.9 诊断逻辑 / route / outcome / guard / question governance

对应原文重点章节：

- 13. 追问后最终输出不能靠空候选或纯先验硬判
- 14. 宽景/全株图里的结构性虫害候选不得直接 final
- 32. 上下文依赖型问题不能被泛化视觉证据直接授权输出
- 33. outcome regression manifest 也可能固化旧 bug
- 34. 首轮显式 observedEvidenceSet 不能再触发同 symptom 的视觉重复确认
- 36. explicit observed fact 的阻断不能只做在 selector 前半段
- 47. output eligibility 和 low-confidence 不能各算各的
- 48. `yellow_speckling` 宽泛虫害入口，不能再回同维度 symptom confirmation
- 49. `healthy_direction` 命中后，不能被“无视觉症状直接 uncertain”截断
- 68. visual candidate 的 forced static confirm 不能直接回传原始 question row
- 69. 单张全株图里的结构性虫咬候选不能直接入正式证据
- 70. 黄叶类问题不能只凭视觉黄叶直出具体养护结论

关键词：

```text
output_eligibility
uncertain-gate
low-confidence
observedEvidenceSet
legacy_observed_symptom
visual_presence
question_queue
question governance
candidate_retained
observed_evidence_set
fast path
warm path
early return
yellowing_required_groups_incomplete
root_rot
spider_mites
yellow_speckling
healthy_direction
current_no_obvious_problem
ranking
route
outcome
```

排查原则：

1. 有 follow-up 后不能为了避免 uncertain 而硬塞问题性结论。
2. context-dependent 问题必须有上下文 corroboration。
3. 泛化视觉症状不能直接授权具体养护原因。
4. 宽景结构性虫害候选只能 candidate retained，不能直接入正式证据。
5. explicit observed fact 必须在 selector 与 final merge 两层阻断同 symptom visual confirmation。
6. output eligibility 与 uncertain gate 必须使用同一套 guard。
7. regression manifest 可能固化旧 bug，规则修复后必须重新审计。
8. forced static confirm 必须走 payload builder，不能直接返回 raw question row。
9. `diagnose-http` 的 route / high-specificity / fast path 只能加速路径规划，不得绕过主链 follow-up / final 输出守卫；黄叶首个浇水频率题命中 `often_wet` 或 `often_dry` 后仍必须等待光照、施肥、整体状态等必答分组，不能直接 final。
10. 修改快捷路径时必须同时补两类证据：负向 smoke（应继续追问而非 final）和正向 smoke（必答分组完成后仍能 final）；只跑完整 happy path 不足以证明未复发。
11. 性能优化不得把 `diagnosis_sessions.runtime_snapshot_json`、当前 round 的 `diagnosis_follow_ups`、当前答案 mark / answer row、final snapshot 改成无协议的后台异步写；这些是 answer 下一轮恢复状态的同步边界。
12. 允许后台补写的仅限 review / audit / 可兜底状态，例如 `question_queue`、`stop_state`、`observed_evidence_set`、`diagnosis_symptom_observations`、`visual_supervision`；补写失败必须打日志，不能影响主响应。
13. `question/start` 在显式传 `plantCatalogId` 且无 `userPlantId` 时，不应再把 catalog id 当 user plant id 做兼容探测；否则会引入无意义 SQL 查询并拖慢首题。
14. route 静态缓存必须按 SQL schema 隔离；不得让 `cloud1_dev` 与 production 共享题库、route、gate 或 outcome 缓存。
15. 未证明等价前，禁止组合缓存 `outcome_routes`、`outcome_route_gates`、`diagnosis_outcomes` 或 route planner 输出；历史 v6 曾因此导致黄叶完整路径缺 `fertilizer_repot_stress` 并混入 `root_stress`。仅 answer effect 行可以做单题缓存精确拼接，且必须跑负样本和完整路径正样本。
16. active follow-up 响应可瘦身，但必须保留下一题展示所需字段：`diagnosisSessionId`、`roundId`、`stage`、`status`、`stopReason`、`followUpRequired`、`questions[*].questionId/questionKey/options[*].optionId/optionKey/text`。不得在 follow-up 响应里返回误导前端的 `finalResult` / `visibleOutcomes`。
17. active runtime snapshot 可裁剪 review-only 重字段，但 `routeDecision` 只能降为 compact 权威结构，不能删除；`metrics.routeDecision` 不再作为权威出口。
18. 每次压 `question/start` / `diagnosis/answer` 延迟后，至少记录：负样本 `often_wet`、负样本 `often_dry`、完整正样本 `often_wet -> stronger_direct_light -> recent_heavy_fertilizer_or_repot -> with_wilting_or_drop`、warm benchmark 的 avg / min / max / p50 / p95 / p99、函数 alias 与预置并发状态。

---

### 5.10 本轮修复验收锚点（本地化记录）

- Deploy code：
  - `f97d717c-4032-43e8-bcd4-5ff71ff27d2c`
  - `1f3e3839-0cb4-4d73-aa9d-feff1bbee731`
- 热容器刷新配置：
  - `ae13d562-dfe6-4b79-a159-ff93aef017ce`（`DEPLOY_BUST`）
- review/list：`requestId= b8527293-ee50-4acd-a5d8-743fc2cd114d`，function Duration `1096ms`，rowCount `20`，`complete` `1030ms`，client `1370ms`
- review/detail：`requestId=0099690b-96cd-497e-91ee-899ea438c44f`，function Duration `488ms`，`partial false`，`degradedSections []`
- answer：`requestId=6d9ff19e-62a5-480b-aa19-d6459c2aeaa0`，function Duration `808ms`，`complete 806ms`
- 约定复核：`updateFunctionCode` 成功 ≠ 热容器已刷新；仍需用 requestId + 真实 smoke + 日志证据闭环。

---

## 6. Dispatch Plan 推荐写法

当任务命中本索引时，main agent 推荐在 Dispatch Plan 中写：

```text
Dispatch Plan:
- 任务类型: diagnose-http 云端调试 / replay / CloudBase smoke / H5 管理页 / route-outcome 验收
- 选择的 subagent:
  - code_explorer: 定位相关文件、脚本、调用链
  - architect_reviewer: 审查诊断流、route/outcome、schema 或规则边界
  - implementer_deep: 如需高风险实现
  - qa_reviewer: 审查 replay/live 验收是否有效
  - release_ops: 涉及部署、网关、MCP、函数日志、schema、smoke
- 需要读取的规则文件:
  - docs/ai-rules/diagnose-http-cloud-debugging.md
  - docs/ai-rules/diagnosis-replay.md（如涉及 replay）
  - docs/ai-rules/cloudbase-deployment.md（如涉及部署）
  - docs/ai-rules/cloudbase-auth-database.md（如涉及 schema / SQL / 鉴权）
- 是否需要读取 AGENTS.md: 否
- 预期输出: 分层排障结论、证据锚点、是否需要改代码、是否需要 live 验收
- 写入权限: 默认只读，确认后再进入 implementer_deep
```

---

## 7. 不要默认全量读取完整避坑文档

完整避坑文档很长，不能作为所有 subagent 默认必读。

正确策略：

1. main agent 先读本索引。
2. 根据任务命中类型，指定相关章节或归档文档路径。
3. subagent 只读 Dispatch Plan 指定范围。
4. 如果仍不足，再请求读取完整归档文档。
