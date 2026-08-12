## 微信开发者工具 MCP 诊断自动化硬要求（2026-06-12）

- 场景：使用 wechat-devtools MCP 进行诊断相关自动化测试（含黄叶、问诊、follow-up、结果页等链路）时，必须先读取并遵循 `docs/ai-rules/frontend-automation-id-policy.md` 的“第三点 诊断流 id 映射”。
- 约束：入口与操作必须优先按该文档定义的 `id` 进行定位与断言，不得跳过该映射文件先行执行。
- 触发：如需判定“诊断入口是否命中”或“进入问答页是否成功”，必须以该映射中的 `diagnose-entry-button-{plant.id}` 等稳定 `id` 为判断依据。
- 结论归档：该要求已同步写入仓库级硬规则：
  - `AGENTS.md` 第 13 条（全局硬规则）
