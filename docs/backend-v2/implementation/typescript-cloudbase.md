# TypeScript 与 CloudBase 实施规范

```text
TypeScript
→ tsc strict
→ esbuild CommonJS
→ dist/server.cjs
→ scf_bootstrap
→ CloudBase Node.js 22
```

HTTP 函数监听 `9000`。新业务代码不得使用 JavaScript；部署包不得包含 TypeScript 源码、测试、开发依赖或在线安装命令。

必须开启严格类型检查、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`useUnknownInCatchVariables`、`noImplicitReturns` 和 `noFallthroughCasesInSwitch`。

所有外部输入先作为 `unknown`，通过 AJV 或类型守卫后才能进入领域。所有关键类型、属性、Repository 方法、Adapter 方法和状态转换必须有中文注释。

