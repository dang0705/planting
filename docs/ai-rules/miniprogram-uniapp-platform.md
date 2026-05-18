# 小程序与 uni-app 平台规则

## 1. 项目定位

当前项目优先按 uni-app、Vue3、pinia、Vue Query、Tailwind CSS、微信小程序、Tencent CloudBase / Cloud Functions / MySQL / TDSQL-C 工作流处理。

## 2. 适用边界

1. 涉及微信小程序页面、组件、路由、端能力、预览、构建时，优先读取本文件。
2. 不要把 Web 项目规则无条件套到小程序。
3. 不要把 Native App HTTP API 限制无条件套到小程序。
4. 不要把新建 CloudBase 模板项目规则无条件套到当前既有项目。

## 3. uni-app / Vue3 实现注意事项

1. 保持组件边界清晰。
2. 不要把复杂业务判断硬编码在 UI 层。
3. 状态逻辑优先放入既有 store / hook / service 边界。
4. 数据请求逻辑需尊重现有 Vue Query 结构。
5. Tailwind class 修改需考虑小程序构建与 safelist。
6. 小程序端不支持或行为不同的 Web API 必须显式说明。

## 4. 平台风险

1. 滚动、吸顶、IntersectionObserver、骨架屏、远程字体、OSS 静态资源等小程序端能力需按项目既有方案处理。
2. 不要引入依赖浏览器 DOM 的实现。
3. 涉及构建产物和 uni-app vite 逻辑时，优先让 `code_explorer` 定位现有插件并探索npm/github上成熟的第三方插件。

## 5. 前端自动化定位入口

涉及诊断流、小程序页面可见验收、微信开发者工具自动化或稳定选择器时，读取 `docs/ai-rules/frontend-automation-id-policy.md`。

该文档负责维护诊断流关键 `id`、操作映射、禁止暴露字段和 `wechat-dev-tools` MCP 最小验收流程；本文件不重复展开细则。
