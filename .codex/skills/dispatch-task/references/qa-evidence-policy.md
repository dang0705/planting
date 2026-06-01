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
