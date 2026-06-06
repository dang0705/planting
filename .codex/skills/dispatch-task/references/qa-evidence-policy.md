# QA Evidence Policy

## 定位

本文件定义 QA 证据、自动化范围、失败归因和输出预算。QA 不做 code review，不审代码 diff。

模板引用：

```text
../assets/templates/qa-evidence.md
```

## QA scope

QA scope 由 Test Contract / 验收标准决定，不由“是否有 UI diff”决定。

如果 ticket / prompt / 验收标准 / request changes 明确要求小程序实际交互、页面点选、表单输入、按钮状态、控件状态、端上 UI 行为或用户路径验证，则 QA 必须执行自动化或端上验证。

## WeChat DevTools MCP

必须使用 WeChat DevTools MCP 的场景：

1. 小程序页面点选。
2. 表单输入。
3. 按钮 disabled / enabled 状态。
4. class / marker / selected state。
5. 页面跳转。
6. 弹窗 / 组件显示。
7. Figma 或 UI 对齐。
8. request changes 明确要求用户实际交互。

如果 WeChat DevTools MCP 可连接，QA 不得只做连接能力验证；必须执行 Test Contract 中的真实交互步骤。

如果 MCP 不可用，必须先读取 `.codex/skills/wechat-mcp-transport-recovery/SKILL.md` 并按三层归因恢复；若底层 `miniprogram-automator` 可继续验证，则继续完成 Test Contract 所需端上证据。只有内置 MCP 与底层 automator 都不可用，才标记为 blocker 或未验证项，不得判定通过。

## Figma asset fidelity evidence

如果 Test Contract / QA Visual Baseline Slice / request changes 涉及 Figma icon、image、vector、`imgIcon` / `img*` 或 asset URL，QA evidence 必须包含：

1. `asset_source`：Figma asset URL、source id、或可复核的构建产物引用。
2. `asset_type`：如 `svg` / `png` / `jpg` / `unknown`。
3. `expected_key_props`：SVG 至少记录 `viewBox`、`stroke`、`fill`、`stroke-width`、`preserveAspectRatio` 中可取得的字段。
4. `actual_render_evidence`：小程序端截图、selector、构建产物、或端上可复核证据。
5. `forbidden_substitute_absent`：确认不存在手写近似 SVG、CSS 形状、旧实心图标、emoji、icon font 等禁用替代。

源码字符串检查、构建通过、组件预览或“大体相似”只能作为辅助证据，不能单独判定 Figma asset 对齐通过。

当出现 `QA tool/session blocker`（如 `Transport closed`）时先做会话归因：

1. 若 main 线程在本轮相同 `projectPath`、`pagePath`、测试链路链条下，提供了可复核的端上证据（截图、selector、日志）且包含 Test Contract required item：
   - QA 可基于该证据做 pass/fail 判定，不能将该验收项直接标记为 blocked。
   - 输出证据来源：`evidence_source=main_agent_wechat_mcp`（或等价中文表达）。
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
8. Figma asset fidelity 证据（如适用）。

禁止粘贴完整日志、完整测试输出、完整 DevTools dump、完整截图 OCR、完整运行时对象，禁止分散输出多个重复矩阵。

## 合并输出结构

使用 `../assets/templates/qa-evidence.md` 中的 `QA Result` 模板。


## 禁止旧式展开章节

QA 输出只能使用 `QA Result` 一个合并模板。禁止输出独立大章节：测试执行矩阵、unit-test 结果、smoke-test 结果、e2e-test 结果、前端自动化 / wechat-dev-tools 结果、QA Visual Baseline Slice 展开详情、UI / Figma 对齐测试展开详情、边界条件、Dirty Workspace 干扰判断、回归风险、发布前质量缺口、给主控的最终建议。

这些内容如需表达，必须压缩进 `QA Result` 对应字段。
