# Trae external implementer completion boundary

在 planting 项目中，Trae 返回 `completed` 只表示实现阶段结束，不表示整单完成。任务仍处于 `dispatch-task` 流，必须由 main 继续完成独立 worktree 回收、diff-first review、必要的 LAN/小程序运行时验收、docs/ByteRover 影响处理和 Completion Gate；只有这些阶段都通过后才能向用户报告任务完成。
