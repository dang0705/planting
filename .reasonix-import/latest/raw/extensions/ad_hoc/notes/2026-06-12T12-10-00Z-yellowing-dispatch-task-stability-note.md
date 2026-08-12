## 2026-06-12 黄叶诊断自动化稳定性回放（3次）

- 环境：wechat-devtools + miniprogram-automator（端口 9420），未执行重授权/清缓存/重置线程。
- 执行脚本：`.tmp-diagnose-yellowing-fixed.mjs`（已加入“优先点击 diagnose-entry-button，缺失则 ref fallback”）。
- 流程要求：打开首页 → 弹窗黄叶模式 → 开始诊断 → 浇水任意3天，其余不知道。
- 结果：`3/3` 次都失败进入问答页，`answerCount=0`。
- 每次都记录到首页，`open-method=ref-fallback`（首页无 `diagnose-entry-button*` 可点）。
- 每次点击“开始问诊”后 toast 返回：`缺少植物ID，无法开始问诊`（两次记录/次）。
- 证据落盘：
  - `scripts/terminal-e2e/qa-artifacts/2026-06-12T12-07-30-273Z/yellowing-fixed-result.json`
  - `scripts/terminal-e2e/qa-artifacts/2026-06-12T12-07-30-273Z/*-session*-*.png`
  - `docs/ai-runs/2026-06-12-dispatch-task-yellowing-stability.md`

结论：本次失败为前置条件阻断（缺少植物ID/诊断入口）导致，不是点击与选项打分逻辑抖动。
