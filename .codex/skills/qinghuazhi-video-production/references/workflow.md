# 工作流与审批门禁

## 状态机

```text
Agent 生成 Plan JSON
→ Draft（可无限创建，不要求素材存在）
→ 用户明确批准具体 Draft
→ Approved Plan（不可变快照）
→ Prepare（扫描并绑定素材）
→ Prepared Job（唯一 Render 输入）
→ Render
→ final.mp4
```

## 仓库根目录

所有命令都从含有 `package.json` 的 `qinghuazhi-video` 根目录执行。

## 创建 Draft

文件输入：

```bash
npm run video:draft:create -- \
  --content watering-newbie \
  --input /tmp/plan.json \
  --brief-file /tmp/brief.txt \
  --producer codex \
  --skill-context planning
```

标准输入：

```bash
cat /tmp/plan.json | npm run video:draft:create -- \
  --content watering-newbie \
  --input - \
  --producer cursor \
  --skill-context planning
```

可选参数：

```text
--producer-model <model-id>
--producer-session <session-id>
--intent plan | revision | import
--parent-draft draft-003.json
--platforms douyin,xiaohongshu,wechat_channels
--brief-file /tmp/brief.txt
```

创建器即使发现业务校验错误，也保留 Draft、Mermaid、meta 和 error，退出码为 2，便于 Agent 修复后创建新 Draft。非 JSON 输入不会创建 Draft。

## 审计语义

`draft-xxx.meta.json` 记录：

- Producer 名称、模型和可选会话 ID；
- Skill 名称、版本和本次声明上下文哈希；
- `--skill-context` 声明对应的参考文件及 SHA256；
- Schema 错误、业务错误和 warnings；
- 父 Draft 与输入哈希。

这些信息支持追溯，但无法直接证明模型内部真正阅读了哪些文本。Meta 使用 `declared-and-hashed` 表述，不写成 verified-read。

## 审查与状态

```bash
npm run video:status -- --content watering-newbie
```

查看 Draft：

```text
qinghuazhi-video-workspace/workflows/<content-id>/drafts/draft-xxx.json
qinghuazhi-video-workspace/workflows/<content-id>/drafts/draft-xxx.md
qinghuazhi-video-workspace/workflows/<content-id>/drafts/draft-xxx.mmd
qinghuazhi-video-workspace/workflows/<content-id>/drafts/draft-xxx.meta.json
```

## 批准

只有用户明确指定或明确确认当前展示的具体 Draft 后执行：

```bash
npm run video:approve -- \
  --content watering-newbie \
  --draft draft-003.json
```

批准生成不可变快照；后续修改必须新建 Draft。

`video:approve` 只接受 canonical `draft-xxx.json + draft-xxx.meta.json`，并要求 meta 状态为 `draft_valid`、`contentId/draftId` 匹配、`draftSha256` 与当前文件一致。手工放入 drafts 目录或原地修改的 JSON 不能批准。

## Prepare

```bash
npm run video:prepare -- --content watering-newbie
```

Prepare 会构建 Asset Catalog、绑定素材并输出缺失报告。Blocked 不代表 Plan 错误，也不允许擅自降低素材语义要求。

## Render

```bash
npm run video:render -- --content watering-newbie
```

Render 只读取当前 Prepared Job，并执行成本门禁、Azure、Wan Router、VideoRetalk、字幕和 FFmpeg。免费 Wan 模型耗尽时按注册表自动 fallback；不得绕过 cost gate。

## 修改

未批准 Draft：读取原 Draft，生成完整新 Plan，再调用：

```bash
npm run video:draft:create -- \
  --content watering-newbie \
  --input /tmp/revised-plan.json \
  --brief-file /tmp/revised-brief.txt \
  --producer <agent-name> \
  --skill-context revision \
  --intent revision \
  --parent-draft draft-003.json
```

已批准 Plan：读取 `approved/<approval-id>/plan.json` 作为事实依据，生成完整的新 Plan，再通过同一个 `video:draft:create` 创建新 Draft。不要编辑 `approved/` 内文件，也不要使用第二套 Draft 创建路径。
