# Tailwind CSS 基础用法 Skill

## 核心原则

### 1. 优先使用 Tailwind 预设值

优先级：

```text
Tailwind 内置预设
→ theme.extend 已有 Token
→ 新增 theme Token
→ 任意值 Arbitrary Value
```

推荐：

```html
<div class="p-4 mt-6 w-64 rounded-lg text-sm bg-slate-100">
</div>
```

避免：

```html
<div class="p-[16px] mt-[24px] w-[256px] rounded-[8px] text-[14px]">
</div>
```

---

### 2. 仅在没有预设值时使用任意值

允许：

```html
<div class="top-[117px]">
</div>
```

允许：

```html
<div class="max-w-[calc(100vw-2rem)]">
</div>
```

不允许把任意值作为默认写法。

---

### 3. 同一个任意值出现 3 次以上必须配置化

反例：

```html
<header class="h-[72px]"></header>
<aside class="top-[72px]"></aside>
<main class="pt-[72px]"></main>
```

配置：

```js
module.exports = {
  theme: {
    extend: {
      spacing: {
        'app-header': '72px',
      },
    },
  },
}
```

替换：

```html
<header class="h-app-header"></header>
<aside class="top-app-header"></aside>
<main class="pt-app-header"></main>
```

## 响应式

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
</div>
```

| 前缀 | 宽度 |
|------|------|
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | 1536px |

## 状态修饰符

```html
<button
  class="bg-blue-600 hover:bg-blue-700 focus:ring-2 disabled:opacity-50"
>
  保存
</button>
```

常用：

- hover:
- focus:
- active:
- disabled:
- dark:

## Theme Token 规范

推荐：

```js
spacing: {
  'app-header': '72px',
  'panel': '360px',
}
```

不推荐：

```js
spacing: {
  '72px': '72px',
  '360px': '360px',
}
```

## Content 配置

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,vue}',
  ],
}
```

## 审查清单

- 是否优先使用 Tailwind 预设值
- 是否滥用任意值
- 是否存在重复任意值
- 是否已沉淀到 theme.extend
- 是否正确使用响应式前缀
- 是否补充 hover/focus 状态
- 是否避免 Magic Number

## 默认决策

```text
能用预设值，不用任意值。
能用已有 Token，不新增 Token。
同一任意值出现 3 次以上，必须进入 tailwind.config.js。
重复 UI 抽组件。
重复设计值抽 Theme Token。
```
