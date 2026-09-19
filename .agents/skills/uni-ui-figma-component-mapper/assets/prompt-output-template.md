# 输出模板

## Figma → uni-ui 映射表

| Figma 区域/节点 | 视觉与交互线索 | 首选 uni-ui 组件 | 备选 | 关键 props/events/slots | 风险/限制 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 实现说明

- 使用的 uni-ui 组件：
- 未使用 uni-ui 的区域及原因：
- 需要确认的安装/依赖：
- 微信小程序端重点验收：

## 代码骨架

```vue
<template>
  <view class="page">
  </view>
</template>

<script setup lang="ts">
</script>
```

> 默认使用项目 Tailwind utility、设计 token、uni-ui props/slots 和现有组件完成样式；不得默认新增 `<style lang="scss">`。只有 Contract 明确列出 SCSS 例外时，才能添加局部 style，并必须回填 exception_ref。
