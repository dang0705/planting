# Solution Discovery Gate

## 定位

Solution Discovery Gate 是 main agent 在技术方向裁决前必须完成的前置门禁。它证明 main agent 已以可控 token 成本评估过需求复杂度、现有代码复用、成熟方案、uni-app 生态、微信小程序原生能力和手搓必要性。

## Lite / Expanded

默认使用 Lite。Expanded 只在复杂功能、明确需要插件搜索、Lite 发现阻塞 gap、或 main agent 无法判断是否手搓时启用。

## 触发条件

以下情况必须至少做 Lite 判断：

1. 手搓复杂度高。
2. 涉及 UI 复杂组件、图表、日历、上传、拖拽、富文本、地图、手势、动画、虚拟列表。
3. 涉及通用能力，而非项目强业务逻辑。
4. 预计新增代码较多。
5. 需要兼容微信小程序 / uni-app 多端。
6. 现有代码中没有明确可复用模块。
7. 用户、prompt 或 ClickUp 硬约束要求“优先考虑 uni-app 生态插件 / 现成方案 / 复用”。

## 评估优先级

1. 项目已有实现。
2. 已安装依赖。
3. uni-app 生态插件。
4. 微信小程序原生能力。
5. 稳定 npm / GitHub / 官方方案。
6. 手搓新实现。

如果最终允许手搓，必须说明为什么不能复用、不能 wrapper/adapter、不能插件或原生能力。

## 输出预算

1. 默认使用 Lite。
2. Expanded 总输出不超过 800 tokens。
3. 候选成熟方案最多 3 个。
4. 每个候选最多 5 行。
5. 代码搜索 query 最多 5 个。
6. 可复用候选最多 5 个。
7. 禁止粘贴完整 README、插件文档、GitHub issue、搜索结果或长日志。
