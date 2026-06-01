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
