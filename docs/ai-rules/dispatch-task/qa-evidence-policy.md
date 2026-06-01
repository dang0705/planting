# QA Evidence Policy

QA 不做 code review，不审代码 diff。

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

```text
QA Failure Attribution:
- 本轮验收失败:
- 既有问题:
- 无关脏改动干扰:
- 环境问题:
- 无法判断:
```

QA 必须为 ClickUp checklist 回写提供证据：

```text
Checklist Evidence:
- item_id:
- test_case_id:
- result: passed / failed / blocked / not_verified / not_applicable
- evidence:
- can_writeback: yes / no
```
