# Implementation Contract 与 Test Contract

## 定位

本文件定义 Implementation Contract 与 Test Contract 的规则。模板引用：

```text
../assets/templates/contracts.md
```

## Implementation Contract

非简单实现任务必须由 main agent 输出精简 Implementation Contract，再派发 implementer。

必须包含：

1. 实现目标。
2. 文件级改动计划。
3. 数据流 / 调用链。
4. 模块拆分要求。
5. 复用 / 插件 / 手搓裁决。
6. 删除 / 收敛旧逻辑。
7. 关键伪代码。
8. 给 implementer 的硬限制。

## 500 行拆分硬指标

Implementation Contract 必须包含以下字段：

```text
line_count_gate:
- touched_code_file_line_counts_before:
- expected_line_counts_after:
- over_400_line_touched_files:
- over_500_line_touched_files:
- decomposition_required: yes / no
- decomposition_plan:
- approved_exception: yes / no
- exception_reason:
```

规则：

1. main agent 必须在派发 implementer 前对候选 `task_allowed_paths` / 文件级改动计划中的代码文件执行行数检查，可用 `wc -l` 或等价命令。
2. 修改后的单个业务代码、云函数代码、页面组件代码、配置代码或测试代码预计超过 400 行，必须在 Technical Direction Gate 中预警。
3. 修改后的单个上述代码文件预计超过 500 行，`decomposition_required` 必须为 `yes`，并给出拆分模块计划。
4. 如果本轮修改的是既有超过 500 行文件，不能用“历史遗留”跳过；只要本轮 touch，就必须要求拆分，除非存在明确 `approved_exception`。
5. `approved_exception` 只能用于只读分析、纯删除且删除后仍无法合理拆分、或用户明确限定禁止拆分的场景；必须记录风险和后续 blocker。
6. 缺少 `line_count_gate` 或超过 500 行但无拆分计划时，Implementation Contract Completeness Gate 不通过，不得派发 implementer。

禁止输出完整 patch、完整规则长文、完整 Figma Drilldown。

## Test Contract

main agent 必须基于 prompt 验收标准或 ClickUp Acceptance Checklist Matrix / Test Case Base 生成 Test Contract。

QA 负责执行与取证，不负责设计测试契约。

## 端上接口与题包自动化硬门禁

凡是任务触及以下任一项，Test Contract 必须声明 `automation_required=yes`，且必须写明微信小程序运行时验证项：

1. `/diagnosis/question/start`。
2. `/diagnosis/answer`。
3. question package / fixed question package / package answer submit。
4. 诊断小程序请求路径、诊断页面入口、端上 `wx.request` 链路。
5. CloudBase SQL repository / schema / seed。

上述任务的 Test Contract 不得只列 unit tests、Node 直接 HTTP、curl 或 backend smoke。必须包含：

```text
Mini Program Runtime QA:
- automation_required: yes
- endpoint:
- page:
- projectPath: /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
- payload:
- assertions:
- evidence_source: wechat_devtools_mcp / miniprogram_automator_wx_request / real_device_interaction
- local_functions_gateway_required: yes / no
- cloud_deploy_status: deployed / not_deployed / unknown
- blocker_rule: if both MCP and automator fail, mark blocker/not_verified, not complete
```

对 `/diagnosis/question/start`、`/diagnosis/answer` 等端上接口，合格证据必须来自小程序运行时的 `wx.request` 或真实端上交互，通过 WeChat DevTools MCP 或底层 `miniprogram-automator` 获取。Node 直接 HTTP、curl、云函数本地 invoke 只能作为后端 smoke，不得替代端上 QA。

本项目 WeChat DevTools MCP 的 `projectPath` 必须固定为 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`。Test Contract 不得把 `dist/build/mp-weixin` 写成 MCP 自动化 projectPath；如出现，QA 必须退回 `contract_blocker`。

如果本轮代码未部署到云端，Test Contract 必须要求 QA 使用 local functions gateway + 小程序运行时验证。若 WeChat DevTools MCP 与底层 `miniprogram-automator` 都失败，QA 必须输出 blocker / not_verified；不得把该任务标记为 complete。

## SQL schema truth gate

凡是任务触及 CloudBase SQL repository / schema / seed，Test Contract 必须包含 schema truth gate：

```text
Schema Truth Gate:
- touched_sql_area:
- live_schema_check: INFORMATION_SCHEMA / CloudBase MCP / unavailable
- checked_in_schema_spec:
- runtime_endpoint_smoke:
- mini_program_runtime_request:
- unknown_column_guard:
- live_schema_gap:
```

优先使用 live `INFORMATION_SCHEMA` 或 CloudBase MCP 证明真实库结构。若 auth 不可用，至少必须使用 checked-in schema spec + runtime endpoint smoke / 端上请求证明没有 `Unknown column`，并把 live schema 未验证列为缺口。

## Contract 完整性

Implementation Contract 输出后，必须通过 `main-agent-quality-gates.md` 中的 Implementation Contract Completeness Gate，否则不得派发 implementer。
