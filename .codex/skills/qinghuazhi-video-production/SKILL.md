---
name: qinghuazhi-video-production
description: 当用户要求为青花植/Qinghuazhi 规划、审查、修改、批准、准备、渲染、恢复或检查抖音/Douyin、小红书/Xiaohongshu、微信视频号/WeChat Channels 获客短视频时使用，包括只给一句关于浇水、黄叶、虫害、植物诊断或养护功能的需求。不要用于无关视频剪辑、泛社媒建议，或不涉及制作/审查青花植视频的植物养护问答。
compatibility: 需要本地访问宿主项目、Node.js 24+ 与 shell 执行能力。规划和审查不需要 Provider 凭据；渲染需要工作区已配置的 Azure Speech、Wan、VideoRetalk、FFmpeg 及相关运行依赖。
metadata:
  version: "2.6.0"
  project: "qinghuazhi-video"
  contract-version: "4"
---

# 青花植短视频生产

## 业务边界

当前 Agent 同时承担 Planner 和工作流操作者。

```text
Agent
→ 理解用户需求
→ 读取青花植产品上下文与本 Skill 参考
→ 设计 Scene / Shot
→ 生成或审查 Plan
→ 调用确定性工作流命令

Skill scripts
→ Draft 保存与校验
→ Approval 快照
→ 素材解析
→ Azure TTS
→ Wan Model Router
→ VideoRetalk
→ 字幕 / FFmpeg
→ 状态、Checkpoint、成本与额度门禁
```

不得启动第二个 LLM/Agent 作为 Planner，不得让 Agent 自行重写 Provider 调度、状态机或审批逻辑。

## 知识分层

主 Skill 负责工作流边界、状态推进和工具调用。

平台创作规则由：

- [多平台获客视频策划规范](references/platform-production-guide.md)
- [跨平台共同策略](references/cross-platform.md)
- [抖音](references/douyin.md)
- [小红书](references/xiaohongshu.md)
- [微信视频号](references/wechat-channels.md)
- [内容与 AI 合规](references/compliance.md)

共同定义。

Plan 与执行合同由：

- [工作流与审批门禁](references/workflow.md)
- [Plan 数据合同](references/plan-contract.md)
- [Scene / Shot 设计](references/scene-shot-design.md)
- [情绪、节奏、姿态与表达](references/performance-model.md)
- [素材与真实性规则](references/asset-policy.md)
- [素材库与传递边界](references/assets.md)
- [角色与演员定义](references/roles.md)
- [故障恢复](references/recovery.md)

定义。

## 按任务读取参考

### 新建或修改 Plan

必须读取：

1. `references/workflow.md`
2. `references/plan-contract.md`
3. `references/platform-production-guide.md`
4. `references/scene-shot-design.md`
5. `references/performance-model.md`
6. `references/asset-policy.md`
7. `references/roles.md`
8. `references/assets.md`

再根据目标平台读取相应平台 Reference。

需要核验规则依据时读取 `references/evidence-index.md`。


规划人物 Shot 前，读取：

```text
qinghuazhi-video-workspace/config/roles.json
```

选择已注册 `roleId`。这属于演员/角色配置，不属于 Asset Catalog，因此不违反 Plan 阶段不扫描素材库的边界。

Plan 格式以：

- `assets/plan.template.json`
- `assets/plan.schema.json`

为准。

### 执行或排障

- 状态、审批、Prepare、Render：读取 `references/workflow.md`
- 素材缺失：读取 `references/asset-policy.md`
- Draft 无效、Provider 失败、额度 fallback：读取 `references/recovery.md`

不要无条件加载全部 Reference。

## 执行引擎

```text
scripts/
→ 唯一执行实现

tests/
→ 本地确定性回归
```

脚本直接调用：

```bash
node .agents/skills/qinghuazhi-video-production/scripts/<script>.mjs
```

`tests/` 只做本地确定性检查，不得消耗 Azure、Wan、VideoRetalk 的免费或付费额度。

## 视频工作区

所有视频项目态数据统一放在宿主项目根目录下：

```text
qinghuazhi-video-workspace/
├── config/
├── assets/
├── runtime/
└── workflows/
```

职责：

```text
config/
→ 视频生产配置、Provider 路由配置

assets/
→ person / plant / symptom / app-capture 素材与 catalog

runtime/
→ Wan 路由状态、免费额度 ledger 等运行态

workflows/
→ Draft、Approved、Prepared Job、Render、final.mp4
```

Skill 根目录只保存能力定义、Reference、模板、脚本和测试，不保存视频运行产物。

不得占用宿主小程序自己的 `src/`、`assets/`、`config/` 作为视频工作区。

初始化：

```bash
node .agents/skills/qinghuazhi-video-production/scripts/workspace-init.mjs
```

工作区根可通过：

```text
QINGHUAZHI_VIDEO_WORKSPACE
```

覆盖。

素材分为：

```text
Skill bundled seed assets
→ 稳定、可携带的初始化素材

qinghuazhi-video-workspace/assets
→ 实际完整生产素材库
```

工作流必须能够同步既有 `person / plant / symptom / app-capture` 素材；
不得把当前 Skill 中只携带的 seed 文件误认为青花植完整素材库。

## 用户意图与动作边界

### 只规划 / 看剧本

生成 Draft，展示 Mermaid 或剧本摘要，然后停止。

### 审查 Draft

读取 Draft、Mermaid、warnings 和 meta，指出问题。用户未要求修改时，不创建新 Draft。

### 修改 Draft

基于既有 Draft 创建新的 Plan 和 Draft。不得覆盖既有 Draft 或 Approved 快照。

### 继续已批准的视频

先读取 `video:status`，从当前状态继续。用户未要求改剧本时，不重新规划。

### 生产成片

始终先生成 Draft。只有用户明确批准具体 Draft 后，才能进入：

```text
Approve
→ Prepare
→ Render
```

## 标准工作流

### 1. 生成 Plan

Plan 只描述创作语义。

不得包含：

- Azure Style / Voice / styleDegree / temperature
- Wan 型号 / seed
- VideoRetalk 参数
- FFmpeg 参数

将 Plan JSON 写入临时文件。

将用户需求与已确认约束写入 brief 文件。Brief 只保存事实和约束，不保存内部推理过程。

### 2. 创建 Draft

```bash
npm run video:draft:create --   --content <content-id>   --input <plan-json>   --brief-file <brief-file>   --producer <agent-name>   --skill-context planning
```

修改既有 Draft：

```bash
npm run video:draft:create --   --content <content-id>   --input <plan-json>   --brief-file <brief-file>   --producer <agent-name>   --skill-context revision   --intent revision   --parent-draft <draft-id>.json
```

Draft 创建器负责：

- Schema 校验
- 青花植业务校验
- Mermaid / Markdown
- warnings
- Producer / Skill / Reference 哈希审计

### 3. 用户审查

向用户提供：

- Draft ID 与路径
- Mermaid / Markdown
- Scene / Shot 主线
- warnings 或校验错误

Draft 不得执行。

### 4. Approval

用户明确批准具体 Draft 后：

```bash
npm run video:approve --   --content <content-id>   --draft <draft-id>.json
```

Approved Plan 是不可变快照。

### 5. Prepare

```bash
npm run video:prepare -- --content <content-id>
```

Prepare 只解析和绑定素材。

缺少素材时输出缺失项并停止，不得为了通过 Prepare 擅自修改剧本或绑定语义不符素材。

### 6. Render

只有 Prepared Job 可以 Render：

```bash
npm run video:render -- --content <content-id>
```

最终成片：

```text
qinghuazhi-video-workspace/
└── workflows/<contentId>/
    └── renders/<renderId>/
        └── final.mp4
```

## 不可违反的合同

- Draft 不得 Render；Approved Plan 不得直接 Render；只有 Prepared Job 可执行。
- Plan 阶段不得扫描 Asset Catalog，也不得根据现有素材反向降低剧本质量。
- `speech.text` 同时是 TTS 和字幕事实源。
- `person_dialogue` 一个 Shot 只允许一个说话主体；多人对话拆成多个 Shot。
- `person_dialogue` 最终口型统一由 VideoRetalk 处理。
- Wan 支持 driving audio 时，Azure normalized audio 可作为人物视觉表演指导；VideoRetalk 仍使用同一份 normalized audio 完成最终口型。
- 小程序界面只能使用真实 `app_capture`。
- 植物症状必须来自真实素材；Wan 不得创造、加重、消除或替换诊断证据。
- 不把建议写成确定诊断，不使用无依据的绝对承诺、准确率、排名或功效。
- 跨 Shot 必须保持一致的道具必须存在于源素材，不得仅依赖 Prompt 生成。
- `emotion` 描述当前 Shot 的主要状态；状态变化优先通过 Shot 之间的叙事推进表达。
- 默认硬切；仅在状态放缓、结果收益或时间过渡时使用轻柔转场。
- 未获得具体 Draft 的明确批准，不调用会产生外部成本的 Render。

## 完成标准

规划任务完成：

```text
有效 Draft
+ Mermaid / Markdown
+ 用户可审查
```

生产任务完成：

```text
Approved Plan
→ Prepare ready
→ Render success
→ 返回 final.mp4 路径
```

若被素材、额度、授权或 Provider 错误阻断，返回准确状态和可执行下一步，不伪报成功。
