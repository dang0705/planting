# 青花植 - 智能植物养护助手

一个基于 UniApp 的微信小程序,通过 AI 图像识别帮助用户诊断植物问题,提供专业的养护建议。

## 🎯 产品定位

**目标用户**: 阳台种菜人士、办公室绿植爱好者

**核心痛点**: 绿植生病无法马上得到可靠的解决方案

**解决方案**: 拍照 + 混元 Vision AI 诊断,提供专业养护建议

**变现模式**: 订阅制会员

## 🚀 技术栈

- **框架**: UniApp 3.0 + Vue 3
- **状态管理**: Pinia
- **样式框架**: Tailwind CSS
- **构建工具**: Vite
- **云服务**: 腾讯云 CloudBase
- **AI 能力**: 混元 Vision 模型


# Codex AI Team Configuration / Codex AI 团队配置包

This package contains a complete repository-ready Codex configuration:

- `AGENTS.md`: concise repository-level entrypoint.
- `.codex/config.toml`: subagent runtime limits.
- `.codex/agents/*.toml`: task planner, code explorer, architecture reviewer, implementer, QA reviewer, docs keeper, release ops.
- `docs/ai-rules/*.md`: split rule files for project hard rules, language policy, CloudBase deployment, replay, subagent workflow, and the full original CloudBase guide.
- `docs/ai-tasks/`: place task notes here.
- `docs/ai-runs/`: place subagent handoff records here.

## Installation / 使用方式

Copy all files into your repository root.

```bash
git add AGENTS.md .codex docs/ai-rules docs/ai-tasks docs/ai-runs docs/adr
git commit -m "chore: add codex ai team rules and subagents"
```

The original uploaded `AGENTS.md` is preserved as:

```text
docs/ai-rules/AGENTS.original.md
```
