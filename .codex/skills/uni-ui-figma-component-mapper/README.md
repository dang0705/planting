# uni-ui Figma 组件映射 Codex Skill

这个技能包用于解决一个具体问题：Codex 从 Figma 拿到的是视觉与布局信息，但它不一定知道这些细节应该落到哪些 `uni-ui` 组件上。本 skill 把 Figma 线索映射到 DCloud 官方 uni-ui 组件，并要求 Codex 在实现前先产出“设计线索 → 组件 → props/events → 风险”的映射表。

## 安装

推荐放到仓库级技能目录：

```bash
mkdir -p .agents/skills
cp -R uni-ui-figma-component-mapper .agents/skills/
```

个人全局可用：

```bash
mkdir -p "$HOME/.agents/skills"
cp -R uni-ui-figma-component-mapper "$HOME/.agents/skills/"
```

如果你的本地 Codex 版本仍扫描 `.codex/skills`，可以把同一目录原样复制过去；但本包按当前官方 `.agents/skills` 结构制作。

## 目录

```text
uni-ui-figma-component-mapper/
  SKILL.md
  references/
    00-官方来源与边界.md
    01-Figma到uni-ui映射规则.md
    02-组件索引.md
    03-实施护栏.md
  assets/
    component-map.json
    prompt-output-template.md
  scripts/
    match_uni_ui_component.py
```

## 使用方式

在 Codex 中说：

```text
使用 $uni-ui-figma-component-mapper，根据这个 Figma 设计实现页面。先输出 Figma 区域到 uni-ui 组件的映射表，再实现代码。
```

也可以不显式点名。只要任务描述中包含 Figma、uni-app、uni-ui、微信小程序页面实现等线索，Codex 应该会自动命中该 skill。

## 设计目标

- 让 Codex 先识别 UI 语义，而不是直接按像素手写。
- 对每个 Figma 区域输出首选组件、备选组件、props/events、平台风险。
- 覆盖官方侧边栏中的 uni-ui 组件说明页。
- 微信小程序优先，兼顾 H5 / App 差异。
