# 2026-06-12 Dispatch-Task 自动化稳定性回放：黄叶问诊路径

## 任务
用 wechat-devtools 自动化在小程序首页执行黄叶模式流程（3 次）：
1) 打开首页；
2) 进入诊断弹窗；
3) 选“黄叶模式”；
4) 点击开始问诊；
5) 在问诊页按“浇水=3天，其余=不知道”。

要求不触发重授权、重置线程、清空缓存。

## 执行参数
- 工具：`miniprogram-automator`（wechat-devtools MCP 接入）
- 命令：`node .tmp-diagnose-yellowing-fixed.mjs`
- 端口：`9420`
- 重复次数：`3`
- 报告路径：
  - `test/e2e/terminal-e2e/qa-artifacts/2026-06-12T12-07-30-273Z/yellowing-fixed-result.json`
- 截图：
  - `2026-06-12T12-07-30-280Z-session1-*.png`
  - `2026-06-12T12-07-53-132Z-session2-*.png`
  - `2026-06-12T12-08-16-011Z-session3-*.png`

## 最终结果
- 总体：`3/3` 次脚本执行完成（无脚本异常退出）。
- 实际链路：每次都 `open-method = ref-fallback`，即首页未命中 `diagnose-entry-button`，使用 `diagnosePopupRef.open()` 兜底打开弹窗。
- 是否进入问答页：`0/3`（均在首页停留）。
- 每次问答题目数：`answerCount = 0`。
- 关键 toast 记录（每次）：
  - `缺少植物ID，无法开始问诊`

## 结论
- 该路径目前不是稳定性抖动问题，而是环境前置条件不足导致的功能阻断。
- 在当前页面状态下无法从首页自然触发“诊断按钮入口”，且弹窗内点击开始问诊会直接被后端前置校验拦截（缺少植物ID）。

## 修复建议（保持 dispatch-task 稳定性）
1. 自动化层先加前置校验：首页必须存在可识别的“诊断入口按钮”；否则将该 run 标记为环境阻断，并触发环境恢复或数据预置流程。
2. 给 `缺少植物ID` 场景加明确分类（例如 `blocked_precondition`），以免误判为流程执行成功。
3. 为稳定性回放环境补充植物上下文（或可复现的植物卡片），确保开始问诊时 `currentPlantId` 可用。

