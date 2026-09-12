# ClickUp Workflow

仅当输入含有效 ticket id/URL 时读取。

1. 读取标题、描述、验收标准、未完成 checklist、明确非目标和必要关系；默认不展开所有评论、附件和历史活动。
2. 压缩成 Task Receipt，后续只传 receipt/source refs，不广播完整 ticket。
3. checklist 只在有可验证证据时勾选；不得用评论或 emoji 代替真实状态更新。
4. 回写内容保持最小：实现摘要、验证证据、未验证项和 blocker。
5. ClickUp 不影响 Figma 所有权：main 仍只读 Lite，implementer/QA 直接读取各自所需 Figma 数据。
