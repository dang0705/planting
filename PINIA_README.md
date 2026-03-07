# Pinia 状态管理集成文档

## 概述

本项目已成功集成 Pinia 2.1.7 作为 Vue3 状态管理解决方案，完全兼容 Uniapp 框架。

## 安装的依赖

```json
{
  "pinia": "^2.1.7"
}
```

## 项目结构

```
src/
├── store/
│   ├── index.js        # Pinia 实例配置
│   └── counter.js      # 示例 Counter Store
├── main.js             # 应用入口（已集成 Pinia）
└── pages/
    └── index/
        └── index.vue   # 示例页面（使用 Pinia）
```

## 使用方法

### 1. Store 定义

在 `src/store/counter.js` 中定义了一个示例 store：

```javascript
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Pinia Test'
  }),
  
  getters: {
    doubleCount: (state) => state.count * 2,
    displayText: (state) => `${state.name}: ${state.count}`
  },
  
  actions: {
    increment() {
      this.count++
    },
    decrement() {
      this.count--
    },
    reset() {
      this.count = 0
    }
  }
})
```

### 2. 在组件中使用

在 Vue 3 组件中使用 Composition API：

```vue
<script setup>
import { useCounterStore } from '@/store/counter.js'

const counterStore = useCounterStore()

// 访问 state
console.log(counterStore.count)

// 访问 getter
console.log(counterStore.doubleCount)

// 调用 action
counterStore.increment()
</script>

<template>
  <view>
    <text>Count: {{ counterStore.count }}</text>
    <button @click="counterStore.increment">增加</button>
  </view>
</template>
```

### 3. 主应用集成

在 `src/main.js` 中已完成 Pinia 集成：

```javascript
import { createSSRApp } from "vue"
import App from "./App.vue"
import pinia from "./store/index.js"

export function createApp() {
  const app = createSSRApp(App)
  app.use(pinia)
  return { app }
}
```

## 测试

### 运行测试

项目包含一个完整的 Pinia 功能测试脚本：

```bash
npm run test:pinia
```

### 测试结果

测试脚本验证了以下功能：
- ✓ Store 创建
- ✓ State 访问
- ✓ Getter 计算
- ✓ Action 调用
- ✓ State 直接修改

测试输出示例：

```
=== Pinia 测试开始 ===

✓ Store 创建成功
  Store ID: test
  初始状态: { count: 0, name: 'Test Store' }

✓ 测试 Getter
  doubleCount: 0

✓ 测试 Action
  执行 increment() 后: { count: 1, doubleCount: 2 }
  再次执行 increment() 后: { count: 2, doubleCount: 4 }

✓ 测试直接修改 State
  设置 count = 10 后: { count: 10, doubleCount: 20 }
  设置 name 后: { name: 'Modified Store' }

==================================================
✓ 所有测试通过！Pinia 在 Vue3 + Uniapp 项目中工作正常
==================================================
```

## 示例页面

访问 `src/pages/index/index.vue` 查看完整的 Pinia 使用示例，包括：
- 状态显示
- Getter 使用
- Action 调用
- 交互式按钮

## 创建新的 Store

1. 在 `src/store/` 目录下创建新文件，例如 `user.js`：

```javascript
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    username: '',
    isLoggedIn: false
  }),
  
  getters: {
    displayName: (state) => state.username || 'Guest'
  },
  
  actions: {
    login(username) {
      this.username = username
      this.isLoggedIn = true
    },
    logout() {
      this.username = ''
      this.isLoggedIn = false
    }
  }
})
```

2. 在组件中导入使用：

```javascript
import { useUserStore } from '@/store/user.js'
```

## 注意事项

1. **版本兼容性**：本项目使用 Pinia 2.1.7，与 Vue 3.4.21 完全兼容
2. **SSR 支持**：Pinia 配置支持 Uniapp 的 SSR 模式
3. **路径别名**：使用 `@/store/` 访问 store 文件
4. **Composition API**：推荐使用 `<script setup>` 语法

## 相关资源

- [Pinia 官方文档](https://pinia.vuejs.org/)
- [Uniapp 官方文档](https://uniapp.dcloud.net.cn/)
- [Vue 3 官方文档](https://vuejs.org/)

## 更新日志

- 2026-02-11: 初始集成 Pinia 2.1.7
  - 添加 Pinia 依赖
  - 创建示例 Counter Store
  - 集成到主应用
  - 创建测试脚本
  - 更新示例页面
