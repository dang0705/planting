# Implementation Contract 与 Test Contract

## 定位

本文件定义 Implementation Contract 与 Test Contract 的规则。模板引用：

外置模板/规范片段：`../assets/templates/contracts.md`（template_id: `implementation-test-contract-01`）。

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

当分配 `implementer_deep` 时，Implementation Contract 必须升级为 Contract-Locked Implementation Contract，且必须包含以下字段：

外置模板/规范片段：`../assets/templates/contracts.md`（template_id: `implementation-test-contract-02`）。

硬规则：

- `architecture_decisions_locked` 必须写成 implementer 可执行的固定选择，不得写成“自行判断”。
- `implementation_strategy_locked` 必须指定具体函数、组件、store、repository、cloud function 或 adapter 的落点。
- `dependency_policy_locked` 必须写明第三方插件是否允许；未显式允许时默认禁止新增依赖和修改 lockfile。
- `pseudocode_by_anchor` 必须覆盖关键分支；如果无需伪代码，必须写 `not_required` 与理由。
- `stop_conditions` 必须允许 implementer 在 Contract 不可执行时停止，而不是猜测实现。

## 500 行拆分硬指标

Implementation Contract 必须包含以下字段：

外置模板/规范片段：`../assets/templates/contracts.md`（template_id: `implementation-test-contract-03`）。

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

外置模板/规范片段：`../assets/templates/contracts.md`（template_id: `implementation-test-contract-04`）。

对 `/diagnosis/question/start`、`/diagnosis/answer` 等端上接口，合格证据必须来自小程序运行时的 `wx.request` 或真实端上交互，通过 `miniprogram-automator` / `9420` 获取。Node 直接 HTTP、curl、云函数本地 invoke 只能作为后端 smoke，不得替代端上 QA。

本项目端上 automator 的 `projectPath` 必须固定为 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`。Test Contract 不得把 `dist/build/mp-weixin` 写成端上自动化 projectPath；如出现，QA 必须退回 `contract_blocker`。

Test Contract 若要求端上 automator 验收，必须写明正确前置验证链：

外置模板/规范片段：`../assets/templates/contracts.md`（template_id: `implementation-test-contract-05`）。

`status`、`9222` CDP 或 `/json/version` 不得写成端上通过证据。`pkill`、完整重启、CLI auto 拉起、`cache_clean(clean_type="all")` 不得写成默认恢复步骤；只能作为用户明确同意，或已证明无可复用 IDE / `9420` 会话且任务必须拉起时的受控例外，并要求 QA 记录副作用。

诊断流 Test Contract 必须要求 QA 先按 `docs/ai-rules/frontend-automation-id-policy.md` 第三点“诊断流 id 映射”定位，例如 `diagnose-entry-button-{plant.id}`；不得以中文文案、坐标或页面层级作为首选定位方式。

如果本轮代码未部署到云端，Test Contract 必须要求 QA 使用 local functions gateway + 小程序运行时验证。若 `9420` / `miniprogram-automator` 无法覆盖 required item，QA 必须输出 blocker / not_verified；不得把该任务标记为 complete。

## SQL schema truth gate

凡是任务触及 CloudBase SQL repository / schema / seed，Test Contract 必须包含 schema truth gate：

外置模板/规范片段：`../assets/templates/contracts.md`（template_id: `implementation-test-contract-06`）。

优先使用 live `INFORMATION_SCHEMA` 或 CloudBase MCP 证明真实库结构。若 auth 不可用，至少必须使用 checked-in schema spec + runtime endpoint smoke / 端上请求证明没有 `Unknown column`，并把 live schema 未验证列为缺口。

## Contract 完整性

Implementation Contract 输出后，必须通过 `main-agent-quality-gates.md` 中的 Implementation Contract Completeness Gate，否则不得派发 implementer。
