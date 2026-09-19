# P0 模型合同本地审计

> 审计票据：`p0-model-contract-local-audit`  
> 审计日期：2026-09-19（Asia/Shanghai）  
> 范围：青花植 `planting` 仓库本地后端源、配置、既有合同审计、单元/合同测试  
> 结论：`LOCAL_AUDIT_COMPLETE`；Qwen 诊断、Qwen CMS 百科补全、CloudBase Agent 均保持 `CONTRACT_STOP`，真实集成均保持 `INTEGRATION_STOP`

## 0. 结论先行

本审计没有关闭任何 P0 外部能力合同，也没有把静态配置、HTTP 健康、unit_fake 或既有报告改写成真实能力通过。三项能力的当前事实如下：

| 能力 | 当前本地 owner | 当前可复核事实 | 未闭合的 P0 合同 |
|---|---|---|---|
| Qwen 诊断 | `diagnosis` | `diagnose-http` 有 CloudBase AI、TokenHub、阿里云百炼三个 OpenAI 兼容 provider；本地安全配置选择 `cloudbase`，模型 ID 为 `qwen3.5-flash`；视觉 Prompt/Schema 仍由 JS 代码动态拼装 | 精确 provider/endpoint/model、Prompt SHA-256、输入/输出 Schema hash、费用与额度预占/结算/释放、未知计费对账、红线日志尚未冻结 |
| Qwen CMS 百科补全 | `plant-knowledge`；CMS 仅审核控制面 | 只有 Worker 合同文档，没有当前 `cloudfunctions/**` 中可回放的 queue/model/CMS draft→review→release 实现 | 精确模型/endpoint/Prompt/Schema、预算与告警、租约/重试状态机和真实 CMS release 读回均缺失 |
| CloudBase Agent（小青） | CloudBase Agent；`agent-http` 是 planting 侧 ACP 适配/身份与工具桥 | `cloudbaserc.json` 注册 `codex` Agent，provider=`deepseek`、model=`deepseek-v3`；适配器调用 `/v1/aibot/bots/{agent-id}/acp`，不是 Qwen Agent SDK 实现 | 五分钟工具令牌、CapabilitySnapshot、精确工具/审计合同、Agent 调用额度/成本、deadline/并发和真实跨用户/过期拒绝读回缺失 |

因此主代理可以关闭本地审计任务，但不能据此关闭三项能力的 `CONTRACT_STOP`，也不能授权发布或真实外部接通。

## 1. 入口、证据等级与边界

### 1.1 唯一入口

按入口规则先读取 `docs/backend-v2/README.md` 和 `BASELINE.lock`，再执行：

```text
node docs/backend-v2/verify-entrypoint.mjs
→ 入口校验通过：青花植后端 v2 底层架构重构计划（完整融合闭环终版），2111 行，
  SHA-256 e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428
```

当前入口文件 SHA-256 为 `6368671243d2f687e773e3583e1df17a7d944351f3d5f7f224dd6820b430e670`；它不是 Master Plan 的 SHA，不能替代 `BASELINE.lock` 中的计划基线。

### 1.2 证据等级

- `S1`：P0 能力卡、P0 退出门、P-1 外部来源报告、CMS Worker 合同和当前源/配置。
- `S2`：既有 `P-1-cloudbase-live-readback` 及 P-1 报告中记录的脱敏键名/函数可读性。它不证明凭证值、供应商账户、余额、配额、请求成功或线上路由 winner。
- `S3`：本轮已有 `unit_fake`、`source_contract`、`unit_logic` 测试。它们不替代外部真实请求。
- `S4`：本轮为 0。未发起真实供应商请求、CloudBase Agent 工具调用、CMS 写入/release、支付 sandbox、云端写入或部署。

### 1.3 凭证和仓库边界

本报告只记录环境变量名、模型 ID、endpoint 路径、非秘密文件 hash 和现状策略；不写入任何凭证值、Prompt 原文、模型原文、私图 URL、平台主体或会话/追踪值。`cloudbaserc.json` 与 `.env.local` 可能承载凭证，因此不记录其内容或文件 hash，也不把它们当作发布授权。

没有读取 `/Users/jay/WebstormProjects/my-agent`。本报告关于小青的事实只来自 `planting` 当前仓库；不能据此推断独立 Agent runtime 的配置、健康或线上路由。

## 2. P0/P-1 外部合同回读

### 2.1 P0 外部能力卡

已读取 `docs/backend-v2/decisions/P0-external-capability-cards.md`：

- `P0-EXT-06 Qwen 诊断`：owner=`diagnosis`；模型凭证与 Prompt 只能在服务端；模型请求不盲重试、不静默换模；精确 endpoint/model/Prompt SHA-256/Schema/价格/额度预占结算释放未冻结。
- `P0-EXT-07 Qwen 百科`：owner=`plant-knowledge`；只允许简介、外观、分布和约 3 个 Q&A；最多 3 次、租约安全接管、Worker 并发 1；模型价格、预算、恢复阈值和告警 owner 未冻结。
- `P0-EXT-10 CloudBase Agent`：owner=`CloudBase Agent`；目标是五分钟工具令牌、allowlist、`user_id`/可选 `user_plant_id` 归属和脱敏审计；Agent 模型/额度/工具并发/降级责任人、deadline 和真实工具回放未冻结。

已执行：

```text
node docs/backend-v2/audits/P0-external-capability-cards-z8v0kmr9dv.verify.mjs
→ PASS，14 张卡结构与双轴结论通过
sha256sum -c docs/backend-v2/decisions/P0-external-capability-cards.sha256
→ docs/backend-v2/decisions/P0-external-capability-cards.md: OK
```

P0 退出门的结论仍是“合同/证伪 ticket `PASS`，14 张卡真实集成 `STOP`”，不是任何外部能力 `GO`。

### 2.2 P-1 外部来源报告

`docs/backend-v2/audits/P-1-external-sources-z8v0kmr96t.md` 将 CloudBase AI、阿里云百炼、TokenHub 和混元列为现有外部适配器，但明确只有 provider registry/S3 和有限 live-readback；没有真实供应商请求、账户/价格/额度或模型回放。该报告还指出：视觉成功追踪打印 Prompt/模型原文、盆土调试响应可回传完整 Prompt/原文/用量、外部请求超时/重试/未知结果合同不完整。

本轮回放其 SHA sidecar 的结果是：P-1 报告自身及大多数输入 `OK`，但 `docs/backend-v2/README.md` 不匹配 sidecar 记录的旧 hash（sidecar 期望 `cfe9aca1ce164495f9248c806faec63ab646f934b635187bbc076a913699a006`，当前为本报告 1.1 节记录的 hash）。因此不能把 P-1 sidecar 当作所有输入仍未变更的证明；不影响本轮入口 verifier 已通过的事实。

## 3. Qwen 诊断（`P0-EXT-06`）

### 3.1 调用 owner、provider、endpoint 和模型

当前 provider registry 在 `cloudfunctions/diagnose-http/configs/provider-registry.js` 中登记：

| provider | endpoint 路径/地址 | 当前默认模型 ID | 凭证变量名 | 当前策略事实 |
|---|---|---|---|---|
| `cloudbase` | `https://<envId>.api.tcloudbasegateway.com/v1/ai/aliyun-bailian-custom/chat/completions` | `qwen3.5-flash` | `CLOUDBASE_AI_API_KEY`、`CLOUDBASE_AI_ACCESS_TOKEN` | 允许匿名登录换短期访问 token；视觉能力和显式缓存由代码声明 |
| `aliyun_bailian` | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`（可由 `LLM_ALIYUN_BAILIAN_BASE_URL` 改写） | `qwen3-vl-plus` | `LLM_ALIYUN_BAILIAN_API_KEY`、`DASHSCOPE_API_KEY` | 不允许匿名登录；OpenAI 兼容消息；显式静态前缀缓存 |
| `tokenhub` | `https://tokenhub.tencentmaas.com/v1/chat/completions` | `qwen3.5-flash` | `TOKENHUB_API_KEY` | 不允许匿名登录；使用 `prompt_cache_key` 静态前缀缓存 |

模型/地址配置变量还包括：`LLM_PROVIDER_NAME`、`LLM_MODEL`、`LLM_MODEL_PROFILE`、`LLM_TOKENHUB_MODEL`、`LLM_CLOUDBASE_AI_BASE_URL`、`LLM_CLOUDBASE_AI_MODEL`、`LLM_ALIYUN_BAILIAN_BASE_URL`、`LLM_ALIYUN_BAILIAN_MODEL`、`LLM_FAST_MODEL`、`LLM_QWEN_VL_FAST_MODEL`、`LLM_QWEN_3_5_PLUS_MODEL`、`LLM_DEEP_THINKING_MODEL`。

本地 `.env.local` 的非敏感选择为 `LLM_PROVIDER_NAME=cloudbase`、`LLM_CLOUDBASE_AI_MODEL=qwen3.5-flash` 和 `LLM_ALIYUN_BAILIAN_MODEL=qwen3.5-flash`。这已经暴露出“active CloudBase 默认/配置模型”和“独立百炼默认模型”可能不同，且同一仓库测试还覆盖 `qwen3.5-plus`，不能直接当成已冻结的唯一 Qwen 合同。

`cloudbase-qwen-vl-visual-adapter.js` 只是 `hunyuan-visual-adapter.js` 的薄包装，设置 `qwen_vl_visual_adapter` 名称；它没有独立 Qwen endpoint、模型、Prompt 或 Schema。调用 owner 仍是 `diagnose-http`/`diagnosis`。

### 3.2 Prompt、Schema 和输入来源

- Prompt builder：`cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js`；视觉 Prompt 版本现状为 `visual_structured_v1`，由 `hunyuan-visual-adapter.js` 传入。
- 动态词典：`symptoms` 查询要求 `data_status='audited'`，视觉/混合类别并满足 `ai_visual_pool='yes'`；词典缓存当前为 5 分钟，静态缓存变量 `DIAGNOSE_STATIC_CACHE_TTL_MS` 默认 60 秒。
- 静态规则：`visual-prompt-static-rules.js`；缓存协议：`visual-prompt-cache-contract.js`。当前只计算静态前缀和动态尾部 SHA-1，不能充当 P0 要求的规范 Prompt SHA-256。
- 输出 Schema：`VISUAL_OUTPUT_SCHEMA_TEXT` 位于 `visual-contract.js`，盆土路径另有 `watering-soil-prompt.js`。Schema 是 JS 常量/运行时字符串，没有独立、版本化 JSON 制品和独立 Schema hash。
- Prompt builder 会把动态 symptom 字典、图像引用和证据规则组合成最终请求；当前没有一个可审计的“固定 Prompt 文件 + SHA-256 + 输入/输出 Schema hash + model ID”冻结清单。

### 3.3 超时、重试、费用和失败隔离

- `LLM_REQUEST_TIMEOUT_SEC` 默认 45 秒；CloudBase 匿名登录 `requestCloudBaseJson` 默认 10 秒；CloudBase AI token 进程缓存由 `LLM_CLOUDBASE_AI_DEVICE_ID`（未设置时使用进程派生默认值）区分。
- CloudBase/阿里云百炼/TokenHub 的 OpenAI 兼容请求没有通用重试；混元旧路径对可重试错误最多 4 次并有退避。非混元 fallback 只有显式设置 `LLM_CONSERVATIVE_SERVICE` 才启用，默认空，不构成已冻结的 fallback 合同。
- 当前看不到模型调用的产品额度预占、成功结算、失败释放或未知结果对账；`usage` 只作为调用结果/追踪字段流转。没有模型成本、日/月预算、熔断或告警 owner 的实时读回。
- 诊断服务将模型建议作为结果解析/持久化路径；本地没有证据证明 Qwen 结果能绕过用户确认直接写成养护事实。固定题包和非生成式路径的失败隔离仍由 P0 卡要求保持。

### 3.4 当前红线风险

当前代码与已冻结 P0/P-1 红线冲突：

- `visual-model-success-trace.js` 构造并输出 `prompt_input`、`model_return`；即使经过现有 trace 文本处理，也保留了 Prompt/原始模型返回日志路径。
- `visual-diagnosis-service.js` 持久化 `llm_prompt`、`raw_text_output`、`raw_structured_output` 和 usage 相关字段。
- `watering-soil-visual-service.js` 在 `payload.debugAudit=true` 时组装 provider/model、完整 Prompt、用量和模型返回；`http-router.js` 只用可伪造的 `x-planting-debug-audit: soil_visual_v1` 请求头作为门控，没有不可伪造的环境/身份门。

这些是当前源代码事实，不是本轮修复授权。本审计没有修改日志、响应或持久化行为。

## 4. Qwen CMS 百科补全（`P0-EXT-07`）

### 4.1 合同预期

`docs/backend-v2/implementation/cms-enrichment-worker.md` 规定 Worker 仍属于 `plant-knowledge`，不新建小青专属函数，流程为：

```text
已发布规范身份 → 缺口唯一键 → 聚合需求 → 排序/平台预算
→ Qwen 受限结构化草稿 → AJV/禁区校验 → CMS 草稿
→ 人工审核 → immutable release → 发布读回 → subscription 奖励事件
```

Qwen 只允许生成简介、外观、分布和约 3 个 Q&A；分类、毒性、安全、浇水、施肥、光照、通风、温湿度、病虫害和诊断字段必须拒绝。P0 卡要求最多 3 次尝试、租约过期安全接管、活动任务/审核项幂等和 Worker 并发 1；真实模型预算默认关闭。

### 4.2 当前源/配置/测试缺口

在当前 `planting` 仓库中没有找到对应的 v2 queue、enrichment worker、Qwen 调用适配器、AJV/禁区校验、CMS draft/review/release 读回或真实 worker 测试实现；当前文件是合同文档，不是可执行闭环。因此：

- 当前没有可确认的 CMS 专用 endpoint、Qwen 模型 ID、Prompt 文件/SHA-256 或输出 Schema 文件/hash。
- 当前没有实现最多 3 次、lease/version 并发保护、预算暂停、失败恢复、告警阈值和告警 owner。
- 没有 draft→人工审核→immutable release→发布读回的 S4 证据，也没有真实队列/模型/CMS 写入。
- `P0-product-cost-boundaries.md` 明确 CMS 补全不扣用户 AI 点；但整体产品成本决策仍为 `REVIEW_NEEDED`，CMS 的模型预算、价目、恢复阈值和告警 owner 仍需单独冻结。

不能用 `diagnose-http` 的 Qwen provider registry 代替 CMS 专用合同：两个能力的 owner、输入授权、持久化和审核边界不同。

## 5. CloudBase Agent（小青，`P0-EXT-10`）

### 5.1 CloudBase 注册与 planting 侧桥接

当前 `cloudbaserc.json` 的 AI 配置为：

```json
{
  "agents": {
    "codex": {
      "type": "cloudbase",
      "provider": "deepseek",
      "model": "deepseek-v3"
    }
  },
  "defaultAgent": "{{env.AI_DEFAULT_AGENT}}"
}
```

本地安全配置选择 `AI_DEFAULT_AGENT=codex`。这不是 Qwen 模型合同。`cloudfunctions/agent-http/package.json` 没有 `@cloudbase/agent`、`agent-server` 或 AG-UI 依赖；planting 侧实现是 HTTP/ACP 适配器和受控工具桥，不是独立 Agent SDK runtime。默认 upstream 路径为：

```text
POST /v1/aibot/bots/{agent-id}/acp
RPC method: session/prompt
planting adapter routes: POST /ticket, POST /session, POST /message
```

默认 endpoint 的具体路径由 `cloudfunctions/agent-http/server.js` 常量固定为 `/v1/aibot/bots/agt-planting-5g93nboeb57c3b92/acp`；运行时仍可由 `AGENT_ENDPOINT` 覆盖。凭证变量名为 `AGENT_API_KEY` 或回退的 `CLOUDBASE_AI_API_KEY`，未记录其值。

### 5.2 身份、会话、工具和输出边界

- `agent-http` 先解析持久登录身份，再创建内部 identity ticket 调用正式函数；工具调用会带用户范围，正式路径包括 `/user-plants`、`/user-plants/watering-planner`、`/diagnosis/question/start` 和 `/diagnosis/answer`。
- 当前允许的工具为：`qinghuazhi_plant_lookup`、`qinghuazhi_watering_plan`、`qinghuazhi_user_plant_lookup`、`qinghuazhi_user_plant_watering_plan`、`qinghuazhi_diagnosis`、`qinghuazhi_fertilization_advice`。没有 CMS 百科补全工具。
- 票据 TTL 当前为 60 秒，网页登录 session cookie 当前为 3600 秒；这不是 P0 要求的五分钟工具令牌/CapabilitySnapshot 合同。当前源中没有独立五分钟工具 token、scope/version snapshot 的可回放证据。
- ACP stream sanitizer 只把经过允许的正文发送给端上，过滤工具名、内部状态、session/调用标识和底层错误；正文上限为 65536 bytes，工具续接最多 4 个 upstream round。单测覆盖了分片和内部信息不泄露，但没有真实 Agent replay。

### 5.3 deadline、重试和额度

- `/message` 的 upstream `fetch` 使用 60 秒 `AbortController`；没有独立 per-tool deadline，也没有 upstream retry/backoff。4 round 是工具续接循环，不是安全的供应商重试合同。
- 当前小青额度是后端 `daily_turns`：免费默认每日 20 轮，`AGENT_CHAT_DAILY_LIMIT` 可设置统一正整数上限；UTC 次日重置，剩余 20% 进入提示。额度在 upstream 调用前条件更新 `users.usage_chatToday/usage_chatTotal`，没有 settle/release/未知结果 reconcile；失败可能已经消耗轮次。
- 当前没有 Agent 模型调用费用、单次/日/月预算、并发上限、超额降级和告警 owner 的冻结或真实读回。P0 要求的五分钟令牌、跨用户/过期拒绝、脱敏审计和费用上限仍是 STOP。

## 6. 当前测试与限制

以下命令均在本地运行，未携带真实凭证、未触发供应商/云端写操作；通过只表示现有 unit/source contract：

| 组别 | 命令/覆盖 | 结果 | 层级与限制 |
|---|---|---|---|
| 入口/P0 | `verify-entrypoint.mjs`；P0 external cards verifier；P0 card SHA | PASS | S1/S3 静态合同；不代表 S4 |
| 诊断 provider/合同 | `provider-registry.mjs`、`cloudbase-ai-openai-contract.mjs` | PASS | `unit_fake`/`source_contract`；不证明模型账户、余额、视觉成功或真实 endpoint winner |
| 诊断 Prompt/视觉 | `hunyuan-visual-adapter.mjs`、`visual-prompt-cache-contract.mjs`、`symptom-labeler-prompt-general-mode.mjs`、`watering-soil-prompt.mjs` | PASS | `unit_fake`/`source_contract`；只证明当前动态拼装与缓存断言 |
| 诊断持久化/红线 | `visual-diagnosis-service.mjs`、`visual-model-success-trace.mjs`、`watering-soil-visual-service.mjs` | PASS | `unit_fake`；测试通过不解除原文日志/调试响应风险 |
| Agent 会话/额度 | `runtime-config.mjs`、`session-service.mjs`、`session-store-sql.mjs`、`agent-quota.mjs` | PASS | `unit_fake`/SQL source contract；不证明真实 Agent scope、额度结算或云端读回 |
| Agent stream/tools/server | `acp-stream.mjs`、`tool-runner.mjs`、`server.mjs` | PASS | `unit_fake`；server 测试使用假的 ACP upstream，不是 CloudBase Agent S4 |
| P-1 sidecar | `sha256sum -c docs/backend-v2/audits/P-1-external-sources-z8v0kmr96t.sha256` | FINDING | 仅 README 旧 hash 不匹配；不能把该 sidecar 当作全量当前快照 |

没有运行部署、登录、真实模型请求、CMS 写入/release、Agent 工具请求、数据库 DDL 或外部删除。

## 7. SHA-256 证据清单

以下 hash 只用于证明本轮阅读的非秘密本地快照；可能承载凭证的 `.env.local` 与 `cloudbaserc.json` 明确排除，避免用摘要辅助验证对秘密文件内容的猜测。

```text
docs/backend-v2/README.md  6368671243d2f687e773e3583e1df17a7d944351f3d5f7f224dd6820b430e670
docs/backend-v2/BASELINE.lock  daa8f5c131c37a64b12562679579732b1757b38ebefe682c11368fa7ab5c34d1
docs/backend-v2/decisions/P0-external-capability-cards.md  978aab7dbcd2bc05dc1a2bb56b8c65986553758c797561b929d0a47224ef7025
docs/backend-v2/decisions/P0-external-capability-cards-exit-gate.md  80d163c2558677441651abbe090cbd240405a6fd3181eba652f540b7143cf278
docs/backend-v2/audits/P-1-external-sources-z8v0kmr96t.md  9c8f9115fc94080b38bedeade1053e3e18db9abd554e6b320973780ba972ccc6
docs/backend-v2/implementation/cms-enrichment-worker.md  96e016a0b9f9f46a7924caa781e39086665096cf1b0a3d95ead6bc813ef134ac
docs/backend-v2/decisions/P0-product-cost-boundaries.md  e301b0970c9d7f54972e74f5acd20c431e9682f48031edc81c8b90419efda252
cloudfunctions/diagnose-http/configs/provider-registry.js  c486513af64073f4a4017795884ef8dd687c965da2522e50d7596334550c1d3f
cloudfunctions/diagnose-http/configs/index.js  cc62315f80c5ba9718dbf9b4e89ea10401b12e5b2dd78ef538c8ce79364025ea
cloudfunctions/diagnose-http/utils/llm.js  2e71e0c5d2e7d00676dfe58c279776e1b2693177cd4a16979be72259ee5c4e91
cloudfunctions/diagnose-http/utils/cloudbase-ai-openai-contract.js  b89629a5ef000019ffbd96c724aba5f1bb56ae0099826dd053058350d8be4874
cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js  77a196bd6c588102654b00471cd509de3415a0c27fedcd6d2b81cb541da899f2
cloudfunctions/diagnose-http/services/visual-adapters/cloudbase-qwen-vl-visual-adapter.js  5d6564de652bfcbe91b41f49375fa690cc4054e9d1375fee594eb4317cf89496
cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js  3160feb6d8ededf0e593bb93f6b7b1201983c54c9ac1fd43472833dd4eaa0cfa
cloudfunctions/diagnose-http/utils/visual-prompt-static-rules.js  071e57ec95739d5977e072f6d62598df1f647f0f29cc006e073821e9dd1c9bed
cloudfunctions/diagnose-http/utils/visual-prompt-cache-contract.js  260009cfaddfa372d5e4c492742a6e98fd21d9bad84a2e9c5f2c881bd9f97388
cloudfunctions/diagnose-http/utils/visual-contract.js  6237f41a365d4b14904958ebf356d25885d99c463aa7915ded1585f9c2dd6022
cloudfunctions/diagnose-http/utils/watering-soil-prompt.js  0aa737b91b69f1f768d05100ac982cbf96aefff638919fb2d21577c33b057ba5
cloudfunctions/diagnose-http/repositories/symptom-repository.js  ec3ab7e6bf5627cc37bad7a0866c20fc8a14277a61944af1e27599f23268f599
cloudfunctions/diagnose-http/db/schema-resolver.js  da974901dbad5653288fddd082acdeb950093e1cfd74fb523d942a90b9bd1863
cloudfunctions/diagnose-http/services/visual-diagnosis-service.js  7b7a77f3284c749e7d7619168603161d0d72bbe05eb7aaebe5c6271c0d9991f0
cloudfunctions/diagnose-http/utils/visual-model-success-trace.js  bd2c0cb6cc5b6ac1ead6a590426744df68ec9b952830aa474c8c03f1216f8dff
cloudfunctions/diagnose-http/services/watering-soil-visual-service.js  c3eba52746811c55a007232b8a270aaa9fe19eb2ce5663e2a6e7c7fba35fcb6b
cloudfunctions/diagnose-http/app/http-router.js  a49ea4fc1da95f726080e79ae349e3f2d5311ea4ea22045ae0bbe11792efbd9e
cloudfunctions/agent-http/app.js  4f157c33177921189bf1e376607677a1e911fd1f0136113c8d380c073ddfaa28
cloudfunctions/agent-http/server.js  e670dd54af3fac6db0a2f0108fa3da53db00ce488bcb27f76d0c389b8e0eff8b
cloudfunctions/agent-http/session-service.js  140a628d50b1a769dae802ce7e25cdc52b0a037fc84abdcb4a3515c54383daf8
cloudfunctions/agent-http/session-store.js  4f5ac34a95660f3b3ac29066f51bc1ee1085628f94ffdbfdf7a02f403b9bcd45
cloudfunctions/agent-http/agent-quota.js  dacfc47f14b06f2e2f51465f4eadcbdb27fc172564a9dfdb71fc3ac95a919422
cloudfunctions/agent-http/tool-runner.js  26afac0751111bb13e8186baac115725a35004debfc0244b55816c933cf772bd
cloudfunctions/agent-http/acp-stream.js  2efb62f92d09e92306cadfb448be88b94bad98f46890752447ffc0f52997d748
cloudfunctions/agent-http/package.json  c96986493a351270fd55ca59018b0640302797be03fb4ab2f737721955c363e8
```

## 8. 关闭条件与交接

### 8.1 Qwen 诊断

继续保持 STOP，直到冻结唯一 provider/model/endpoint、Prompt SHA-256、输入/输出 Schema hash、连接/首包/总 deadline、有限重试与 fallback、产品额度预占/结算/释放/未知对账和成本 owner，并在批准账户完成脱敏的成功、拒绝、超时、未知结果回放。随后必须删除 Prompt/原文日志和可伪造 debug 响应路径，补负向测试。

### 8.2 Qwen CMS

继续保持 STOP，直到存在可回放的 `plant-knowledge` worker、任务/审核项唯一键、lease/version 状态机、最多 3 次策略、预算暂停、Schema/禁区校验、CMS draft→人工审核→immutable release→发布读回，以及精确模型/endpoint/Prompt/Schema hash 和预算/告警 owner。用户 CMS 补全不扣用户点数的边界应保持独立，不得借诊断额度覆盖。

### 8.3 CloudBase Agent

继续保持 STOP，直到目标 Agent 的精确 model/endpoint/bot 版本、五分钟工具令牌、CapabilitySnapshot、工具 allowlist 和 `user_id`/`user_plant_id` 归属、工具/Agent deadline、写操作幂等、调用额度/费用/并发/降级/告警和脱敏审计字段冻结，并通过真实过期、跨用户拒绝、工具续接及失败回放。当前 `agent-http` 单测只证明桥接层行为。

本审计只新增本报告、其 SHA sidecar 和 heartbeat；没有修改业务代码、外部能力卡、`module-status.json`、云端、MySQL、CMS、Storage 或 `/Users/jay/WebstormProjects/my-agent`。
