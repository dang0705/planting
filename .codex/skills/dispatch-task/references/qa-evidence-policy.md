# QA Evidence Policy

## 定位

本文件定义 QA 证据、自动化范围、失败归因和输出预算。QA 不做 code review，不审代码 diff。

模板引用：

外置模板/规范片段：`../assets/templates/qa-evidence.md`（template_id: `qa-evidence-policy-01`）。

## QA scope

QA scope 由 Test Contract / 验收标准决定，不由“是否有 UI diff”决定。

如果 ticket / prompt / 验收标准 / request changes 明确要求小程序实际交互、页面点选、表单输入、按钮状态、控件状态、端上 UI 行为或用户路径验证，则 QA 必须执行自动化或端上验证。

凡是任务触及以下任一项，QA 必须要求 Test Contract 中存在端上验证项；缺失时直接退回 `contract_blocker`，不得自行降级为 unit tests 或 backend smoke：

1. `/diagnosis/question/start`。
2. `/diagnosis/answer`。
3. question package / fixed question package / package answer submit。
4. 诊断小程序请求路径、诊断页面入口、端上 `wx.request` 链路。
5. CloudBase SQL repository / schema / seed。

这类 QA Contract 必须包含 concrete `endpoint`、`page`、`projectPath`、`payload`、`assertions`、`evidence_source`。只写 unit tests、Node HTTP、curl、backend smoke 或“按现有测试执行”均不合格。

对 `/diagnosis/question/start`、`/diagnosis/answer` 等端上接口，合格证据必须来自小程序运行时的 `wx.request` 或真实端上交互，通过 `miniprogram-automator` / `9420` 获取。Node 直接 HTTP / curl 只能作为后端 smoke，不得替代端上 QA。

如果本轮代码未部署到云端，QA 必须先成功跑通 `npm run dev:mp-weixin:local-functions:lan` 的完整 LAN 本地函数 flow，再使用小程序运行时验证。若 `dev:mp-weixin:local-functions:lan`、`9420` 或 `miniprogram-automator` 无法覆盖 required item，QA Result 必须标记 blocker / not_verified；不得标记 complete。

完整 LAN flow 的成功标准必须包括：

1. `npm run dev:mp-weixin:local-functions:lan` 输出本地 CloudBase 函数 gateway 已就绪。
2. 所有 required functions 的 health route 已就绪。
3. 脚本内关键业务探针通过。
4. `dist/dev/mp-weixin` 构建进入 watch / ready 状态。

只启动 scoped gateway（例如只跑 `LOCAL_FUNCTIONS=weather-http`）、只看 `__local_functions__/health`、只做 curl/Node HTTP 或只做单函数 gateway smoke，均只能作为排障证据，不能算端上验收完成。

## Mini Program Automator

必须使用端上 `miniprogram-automator` / `9420` 的场景：

1. 小程序页面点选。
2. 表单输入。
3. 按钮 disabled / enabled 状态。
4. class / marker / selected state。
5. 页面跳转。
6. 弹窗 / 组件显示。
7. Figma 或 UI 对齐。
8. request changes 明确要求用户实际交互。
9. 本地环境依赖的云函数数据格式有较大改动。

如果 `miniprogram-automator` 可连接，QA 不得只做连接能力验证；必须执行 Test Contract 中的真实交互步骤。

本项目端上 automator 的 Test Contract `projectPath` 只能是：

外置模板/规范片段：`../assets/templates/qa-evidence.md`（template_id: `qa-evidence-policy-02`）。

`dist/build/mp-weixin` 只允许用于 build / CI / upload 类检查，不得作为端上自动化路径。若 Test Contract 写成 `dist/build/mp-weixin` 或其他 projectPath，QA 必须退回 `contract_blocker`，不得沿该路径继续验收。

### 登录态 / 授权态保护补充

QA 默认必须保护微信开发者工具登录态、项目授权态和扫码状态。除非用户明确授权，禁止为了建立“干净 CDP 基线”默认执行会重启 DevTools 的路径。

部分工具 open 路径会先杀掉已有 DevTools 进程，再重新拉起 IDE；该动作可能触发重新扫码登录、项目授权或自动化授权。

因此涉及小程序端上 QA 时，优先顺序必须是：

外置模板/规范片段：`../assets/templates/qa-evidence.md`（template_id: `qa-evidence-policy-03`）。

只有在用户明确同意可重启 DevTools，或当前没有可复用 IDE / automator 会话且任务确需重新拉起时，才允许调用 open / CLI auto；输出必须把重新扫码/授权归因到 DevTools / automation session side effect，而不是产品接口失败。

禁止连接失败后默认执行 `pkill`、默认完整重启、默认 CLI auto 拉起或默认 `cache_clean(clean_type="all")`。这些动作只能作为受控例外，并必须记录触发条件和副作用。

诊断流自动化必须先读取并使用 `docs/ai-rules/frontend-automation-id-policy.md` 第三点“诊断流 id 映射”，例如 `diagnose-entry-button-{plant.id}`。不得把中文文案、坐标或页面层级作为首选定位方式。

当出现 `QA tool/session blocker` 时先做会话归因：

1. 若 main 线程在本轮相同 `projectPath`、`pagePath`、测试链路链条下，提供了可复核的端上证据（截图、selector、日志）且包含 Test Contract required item：
   - QA 可基于该证据做 pass/fail 判定，不能将该验收项直接标记为 blocked。
   - 输出证据来源：`evidence_source=main_agent_automator`（或等价中文表达）。
   - 可在 `failures.attribution` 记录“QA 工具会话失败”；`completion` 不应因该条记录阻塞已充分覆盖的验收项。
2. 若 main 线程未拿到上述证据，或 evidence 仅覆盖非关键链路：
   - 该验收项保持 blocked。
   - 若无法覆盖 required item，归因仍为 `QA tool/session blocker`，避免误报为产品功能 blocker。
3. 若同一问题同时出现主线程与 QA 线程会话问题，必须在 `failures.attribution` 与 `completion` 字段中明确区分：
   - `tool/session`（链路层）
   - `product`（功能或行为缺陷）

输出时请固定补齐：

- `projectPath`
- `pagePath`
- `operation chain`
- `screenshot/selector/log` 引用
- blocker 分类（`QA tool/session blocker` 或 `product blocker`）

当证据来自底层 `miniprogram-automator` 时，还必须补齐：

- `automation_tool=miniprogram-automator`
- automation port 或 `wsEndpoint`
- 是否通过 WeChat DevTools CLI 启动 automation
- 若验证接口，说明请求是在小程序运行时通过 `wx.request` 发起，而不是 Node 直接 HTTP
- 若本轮代码未部署云端，说明 `npm run dev:mp-weixin:local-functions:lan` 已跑通，且小程序请求命中该 LAN base URL
- HTTP status、业务 code、关键响应字段和断言结果

## SQL schema truth gate

CloudBase SQL repository / schema / seed 改动必须有 schema truth gate 证据：

1. 优先使用 live `INFORMATION_SCHEMA` 或 CloudBase MCP 验证真实 schema。
2. 若 auth 不可用，至少使用 checked-in schema spec + runtime endpoint smoke / 端上 `wx.request` 证明没有 `Unknown column`。
3. live schema 未验证必须列为 gap，不得写成 schema 已完整验证。
4. 只运行 repository unit tests 不能证明 live schema truth。

## 输出预算

QA 输出必须合并为一个简洁结果，不拆成大量重复章节。

标准输出建议不超过 600 tokens；高风险任务不超过 1000 tokens。

只记录：

1. 覆盖情况。
2. 执行矩阵摘要。
3. 关键命令 / 操作。
4. 关键断言。
5. 证据路径。
6. 失败归因。
7. completion 影响。

禁止粘贴完整日志、完整测试输出、完整 DevTools dump、完整截图 OCR、完整运行时对象，禁止分散输出多个重复矩阵。

## 合并输出结构

使用 `../assets/templates/qa-evidence.md` 中的 `QA Result` 模板。

## 禁止旧式展开章节

QA 输出只能使用 `QA Result` 一个合并模板。禁止输出独立大章节：测试执行矩阵、unit-test 结果、smoke-test 结果、e2e-test 结果、前端自动化 / wechat-dev-tools 结果、QA Visual Baseline Slice 展开详情、UI / Figma 对齐测试展开详情、边界条件、Dirty Workspace 干扰判断、回归风险、发布前质量缺口、给主控的最终建议。

这些内容如需表达，必须压缩进 `QA Result` 对应字段。
