# 失败与恢复

## Draft 无效

`video:draft:create` 会保留 Draft、Mermaid、meta 和错误。读取：

```text
draft-xxx.meta.json
draft-xxx.error.txt
draft-xxx.warnings.txt
```

修正后创建新 Draft；不要覆盖旧 Draft。

## Prepare blocked

读取 `prepare-reports/prepare-xxx.json`。补齐或更新素材后重新 Prepare。不要因为素材缺失修改 Approved Plan，除非用户决定更改剧本。

## Approved 被修改

Approved Plan 有 SHA256 校验。哈希变化时停止；从 Approved 派生新 Draft，而不是继续执行被篡改快照。

## Render 失败

Render 保留 checkpoint。修复 Provider、授权、额度或素材问题后重跑同一 `video:render`，已完成且哈希匹配的阶段会复用。

## Wan 免费额度

免费模型必须在百炼控制台开启“免费额度用完即停”。Router 收到额度耗尽信号后标记 profile，并切换下一个模型。不要手工绕过成本门禁。

## Agent 或 Skill 不可用

Workflow Engine 不依赖某个 Agent。换一个能访问仓库并运行 shell 的 Agent，读取本 Skill 后继续。先执行 `video:status`，不要重新规划已批准内容。
