# UI / 页面 / 组件设计规则路由

## 1. 适用范围

页面生成、组件设计、样式修改、交互改造、视觉效果、Tailwind CSS、小程序 UI、设计文档。

## 2. 读取规则

1. 小范围文案、样式、间距、状态修复：只读本文件即可。
2. 新增页面、重大视觉改版、组件体系调整：按需读取 `rules/ui-design/rule.md`。
3. 涉及 uni-app / 微信小程序端能力时，同时读取 `miniprogram-uniapp-platform.md`。

## 3. UI 修改原则

1. 保持中文产品表达优先。
2. 不要生成通用 AI 模板感 UI。
3. 不要引入当前小程序不可用的 Web 视觉能力。
4. Tailwind class 修改需考虑 uni-app / 小程序构建限制。
5. 涉及 safelist、动态 class、远程样式或 OSS 样式时，应先让 `code_explorer` 定位现有方案。
