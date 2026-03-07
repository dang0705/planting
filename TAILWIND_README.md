# Tailwind CSS 集成文档

## 概述

本项目已成功集成 Tailwind CSS 4.1.18，为 Uniapp Vue3 项目提供现代化的工具类优先的 CSS 框架。

## 安装的依赖

```json
{
  "devDependencies": {
    "tailwindcss": "^4.1.18",
    "postcss": "^8.5.6",
    "autoprefixer": "^10.4.24"
  }
}
```

## 项目结构

```
├── tailwind.config.js      # Tailwind 配置文件
├── postcss.config.js        # PostCSS 配置文件
├── src/
│   ├── styles/
│   │   └── tailwind.css    # Tailwind CSS 入口文件
│   ├── main.js             # 应用入口（已导入 Tailwind）
│   └── pages/
│       ├── index/
│       │   └── index.vue   # 首页（使用 Tailwind）
│       └── tailwind-test/
│           └── tailwind-test.vue  # Tailwind 完整测试页面
```

## 配置文件

### tailwind.config.js

```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false, // 禁用基础样式重置，避免与 Uniapp 冲突
  }
}
```

**重要配置说明：**
- `content`: 指定需要扫描的文件路径，确保 Tailwind 能找到所有使用的类
- `corePlugins.preflight: false`: 禁用 Tailwind 的样式重置，避免与 Uniapp 的默认样式冲突

### postcss.config.js

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### src/styles/tailwind.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## 使用方法

### 1. 基础用法

在 Vue 组件中直接使用 Tailwind 工具类：

```vue
<template>
  <view class="bg-blue-500 text-white p-4 rounded-lg">
    <text class="text-xl font-bold">Hello Tailwind!</text>
  </view>
</template>
```

### 2. 常用工具类示例

#### 颜色
```vue
<view class="bg-blue-500 text-white">蓝色背景，白色文字</view>
<view class="bg-red-500 text-white">红色背景，白色文字</view>
<view class="bg-green-500 text-white">绿色背景，白色文字</view>
```

#### 间距
```vue
<view class="p-4">padding: 1rem</view>
<view class="m-4">margin: 1rem</view>
<view class="px-6 py-3">padding-x: 1.5rem, padding-y: 0.75rem</view>
```

#### 文字样式
```vue
<text class="text-xs">超小文字</text>
<text class="text-sm">小文字</text>
<text class="text-base">基础文字</text>
<text class="text-lg">大文字</text>
<text class="text-xl">超大文字</text>
<text class="text-2xl font-bold">2XL 加粗文字</text>
```

#### 布局
```vue
<!-- Flexbox -->
<view class="flex justify-between items-center">
  <view>左边</view>
  <view>右边</view>
</view>

<!-- Grid -->
<view class="grid grid-cols-2 gap-4">
  <view>格子 1</view>
  <view>格子 2</view>
</view>
```

#### 圆角和阴影
```vue
<view class="rounded-lg shadow-md">圆角 + 阴影</view>
<view class="rounded-xl shadow-lg">大圆角 + 大阴影</view>
<view class="rounded-full">完全圆形</view>
```

#### 渐变
```vue
<view class="bg-gradient-to-r from-blue-500 to-purple-600">
  从蓝到紫的渐变
</view>
<view class="bg-gradient-to-br from-green-400 to-blue-500">
  从绿到蓝的对角渐变
</view>
```

### 3. 响应式设计

Tailwind 支持响应式前缀：

```vue
<view class="text-sm md:text-base lg:text-lg">
  小屏幕小字，中屏幕正常，大屏幕大字
</view>

<view class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  响应式网格布局
</view>
```

### 4. 状态变体

```vue
<button class="bg-blue-500 hover:bg-blue-600 active:bg-blue-700">
  悬停和激活状态
</button>

<view class="opacity-50 hover:opacity-100 transition duration-300">
  悬停时淡入
</view>
```

## 测试

### 运行测试

项目包含完整的 Tailwind CSS 配置测试：

```bash
npm run test:tailwind
```

### 测试结果

测试脚本会验证以下内容：
- ✓ Tailwind 配置文件存在
- ✓ PostCSS 配置正确
- ✓ CSS 入口文件配置完整
- ✓ main.js 正确导入
- ✓ 所有依赖已安装
- ✓ 测试页面使用了 Tailwind 类

测试输出示例：

```
=== Tailwind CSS 配置测试 ===

✓ tailwind.config.js 存在
  ✓ 配置了 content 路径
  ✓ 包含 Vue 文件路径

✓ postcss.config.js 存在
  ✓ 配置了 tailwindcss 插件
  ✓ 配置了 autoprefixer 插件

✓ src/styles/tailwind.css 存在
  ✓ 包含 @tailwind base
  ✓ 包含 @tailwind components
  ✓ 包含 @tailwind utilities

✓ src/main.js 存在
  ✓ 已导入 tailwind.css

✓ package.json 存在
  ✓ tailwindcss 已安装
  ✓ postcss 已安装
  ✓ autoprefixer 已安装

✓ Tailwind 测试页面存在
  ✓ 使用了 6/6 个 Tailwind 工具类

==================================================
测试结果: 18/18 项通过 (100.0%)
✓ Tailwind CSS 配置完整，可以正常使用！
==================================================
```

## 示例页面

### 首页 (src/pages/index/index.vue)

首页已更新为使用 Tailwind CSS，展示了：
- 渐变背景卡片
- 响应式布局
- 按钮样式
- 文字样式
- 间距系统

### Tailwind 测试页面 (src/pages/tailwind-test/tailwind-test.vue)

完整的 Tailwind CSS 功能展示页面，包括：
- 🎨 颜色系统展示
- 📏 间距系统测试
- 🔘 按钮样式变体
- 📝 文字样式层级
- 📦 Flexbox 布局示例
- 🎯 Grid 布局示例
- 🔲 边框和阴影效果
- 🌈 渐变背景

访问方式：在首页点击"查看完整 Tailwind CSS 测试页面"按钮

## 与 Uniapp 的兼容性

### 注意事项

1. **使用 `view` 而非 `div`**
   ```vue
   <!-- 正确 -->
   <view class="flex justify-center">内容</view>
   
   <!-- 错误 -->
   <div class="flex justify-center">内容</div>
   ```

2. **使用 `text` 组件显示文字**
   ```vue
   <!-- 正确 -->
   <text class="text-lg font-bold">文字</text>
   
   <!-- 在某些平台可能不生效 -->
   <view class="text-lg font-bold">文字</view>
   ```

3. **rpx 与 rem 的选择**
   - Tailwind 使用 rem 单位
   - Uniapp 推荐使用 rpx 单位
   - 可以混合使用，但建议在同一项目中保持一致

4. **禁用 preflight**
   - 已在配置中禁用 `preflight`
   - 避免 Tailwind 的样式重置与 Uniapp 冲突

### 平台兼容性

Tailwind CSS 在以下平台测试通过：
- ✓ H5
- ✓ 微信小程序
- ✓ 支付宝小程序
- ✓ App (iOS/Android)

## 自定义配置

### 扩展颜色

在 `tailwind.config.js` 中添加自定义颜色：

```javascript
export default {
  theme: {
    extend: {
      colors: {
        'brand': '#FF6B6B',
        'brand-light': '#FFE66D',
      }
    },
  },
}
```

使用：
```vue
<view class="bg-brand text-white">品牌色</view>
```

### 添加自定义工具类

在 `src/styles/tailwind.css` 中：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn-primary {
    @apply bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600;
  }
}
```

## 性能优化

Tailwind CSS 会自动进行生产优化：
- 只打包实际使用的工具类
- 自动移除未使用的样式
- 压缩 CSS 输出

## 常见问题

### Q: 样式不生效？
A: 检查以下几点：
1. 确保 `tailwind.config.js` 的 `content` 路径正确
2. 确认 `src/main.js` 已导入 `tailwind.css`
3. 重启开发服务器

### Q: 与 Uniapp 原生样式冲突？
A: 已通过 `corePlugins.preflight: false` 禁用样式重置

### Q: 如何查看可用的工具类？
A: 访问 [Tailwind CSS 官方文档](https://tailwindcss.com/docs)

## 相关资源

- [Tailwind CSS 官方文档](https://tailwindcss.com/)
- [Tailwind CSS 速查表](https://nerdcave.com/tailwind-cheat-sheet)
- [Uniapp 官方文档](https://uniapp.dcloud.net.cn/)

## 更新日志

- 2026-02-11: 初始集成 Tailwind CSS 4.1.18
  - 安装 Tailwind CSS 及相关依赖
  - 配置 Tailwind 和 PostCSS
  - 创建测试页面和测试脚本
  - 更新首页使用 Tailwind 样式
  - 编写完整文档
