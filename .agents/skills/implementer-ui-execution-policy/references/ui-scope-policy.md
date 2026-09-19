# UI Implementation Scope

本 skill 供 implementer 使用，不读取 Figma MCP；输入必须是 implementer 已直接取得的设计事实。main 不生成节点级 Scope，QA 也不消费完整 Scope。

## 最小输出

只覆盖本轮相关节点：

```text
UI Scope Map:
- node_id:
- name:
- type: implement / reuse / visual_only / placeholder_do_not_expand / ignore / blocked
- code_candidates:
- selected_path:
- reason:
- qa_required:
```

## 复用顺序

1. 项目已有组件。
2. 通过 props/slot/wrapper 扩展已有组件。
3. Contract 指定的组件库（本项目通常为 uni-ui）。
4. uni-app / 微信小程序原生能力。
5. 手写新组件。

Figma 节点为 component/instance/component set，或名称显示通用控件时，必须先按名称、变体和语义搜索代码。未搜索前不得手写同类组件。新建时必须记录候选路径与不复用理由。

## 范围限制

出现 placeholder、WIP、later、coming soon、mock、demo、sample、TODO、待补、占位、暂不实现、仅展示或参考层等信号时，默认归为 `placeholder_do_not_expand`、`visual_only` 或 `ignore`。不得由此推导真实 API、store、schema、云函数或业务状态。

## 工程约束

以 Project Constraints 为准：

- Tailwind 项目新增常规 UI 样式必须使用 utility/token。
- `new_scss_policy=forbidden` 时禁止新增 `.scss` 和 `<style lang="scss">`。
- 未授权不得新增依赖或修改 lockfile。
- 约束与设计冲突时返回 deviation/blocker，不自行放宽。

implementer 将 Scope、搜索证据、手写理由和样式合规放入结果；main 只 review receipt 与 diff，QA 使用独立 Figma baseline。
