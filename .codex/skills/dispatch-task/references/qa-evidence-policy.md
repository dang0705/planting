# QA Evidence Policy

## 定位

本文件定义 QA 证据输出预算与失败归因格式。QA 不做 code review，不审代码 diff。

模板引用：

```text
../assets/templates/qa-evidence.md
```

## QA 输出预算

QA 只记录：

1. 命令。
2. 退出码。
3. 关键失败。
4. 失败用例名。
5. 关键断言。
6. 证据路径。
7. 截图引用。
8. 日志引用。
9. 失败归因。

禁止粘贴完整日志、完整测试输出、完整 DevTools dump、完整截图 OCR、完整运行时对象。

## 本地 HTTP smoke 与 LAN 直连证据规则

当 ticket / prompt / 验收出现“本地 HTTP smoke”或“LAN direct HTTP”路径时，QA 需特别校验请求头与认证参数是否齐备，避免把测试构造问题误判为产品问题：

1. 若使用 `payload.skipAuth = true`，则必须在请求中携带：
   - `x-terminal-e2e: true`
   - `x-app-env: development`（或等价的 development 环境标识）
2. 或者改用真实登录态/真实认证请求（不使用 skipAuth）。
3. 如未满足上面条件，本地 LAN direct HTTP 的 `question/start -> diagnosis/answer` 证据视为无效证据链，`question/start` 未落 session（典型 `skipPersistence=true`）导致的 `diagnosis/answer 404` 仅能归类为“测试构造错误 / 无效证据”，不得作为产品 blocker。
4. 结论写入建议明确标注：“本地 smoke 缺少环境/终端头导致会话未持久化，不代表后端能力退化。”

## checklist 证据

QA 必须为 ClickUp checklist 回写提供证据。对应模板见 `../assets/templates/qa-evidence.md`。


## 小程序实际交互自动化

如果 ticket / prompt / 验收标准 / request changes 明确要求小程序实际交互、页面点选、表单输入、按钮状态、控件状态、端上 UI 行为或用户路径验证，则 QA 必须执行自动化或端上验证。

判断依据不是“是否有 UI diff”，而是“验收标准是否要求端上交互或用户可见行为”。

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

如果 MCP 不可用，必须标记为 blocker 或未验证项，不得判定通过。
