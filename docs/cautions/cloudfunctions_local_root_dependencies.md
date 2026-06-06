# CloudBase 云函数本地依赖集中安装避坑

更新时间：2026-06-05

## 根因

CloudBase 线上部署会按各云函数目录下的 `package.json` 自动安装依赖，因此每个 `cloudfunctions/*/package.json` 的 `dependencies` 仍是线上运行契约。

本地调试不需要在每个 HTTP 云函数目录重复安装 `node_modules`。重复安装会造成依赖版本漂移、磁盘膨胀、lockfile 多处更新，并让本地环境和根目录工具链难以统一。

## 当前策略

1. 本地云函数运行依赖统一安装在项目根目录 `node_modules`。
2. `npm run dev:functions:install` 只在根目录执行 `npm install --legacy-peer-deps`。
3. `scripts/dev/local-functions-gateway.mjs` 从根目录解析 `@cloudbase/functions-framework/bin/tcb-ff.js`。
4. 各 HTTP 云函数的本地 `npm start` 指向 `../../node_modules/@cloudbase/functions-framework/bin/tcb-ff.js`。
5. `cloudfunctions/*/node_modules` 不应提交，也不应作为本地调试前置条件。

## 必须保留

- 各云函数 `package.json` 中的 `dependencies`：用于 CloudBase 线上自动安装。
- 各 HTTP 云函数 `scf_bootstrap` 中的 `node_modules/@cloudbase/functions-framework/...`：用于云端函数目录内运行。
- 根目录 `package.json` / `package-lock.json` 中的本地 devDependencies：用于本地 gateway、测试和脚本解析。

## 禁止误改

- 不要为了“去重”删除云函数 `package.json` 的线上依赖声明。
- 不要把 `scf_bootstrap` 改成 `../../node_modules/...`，云端没有项目根目录依赖。
- 不要重新运行每个 `cloudfunctions/*` 目录内的 `npm install` 来修本地 gateway。
- 不要删除根目录中的 `@cloudbase/functions-framework`，否则本地 `dev:functions` 无法启动。

## 验收口径

本地依赖收敛后至少验证：

1. `npm run dev:functions:install`
2. `find cloudfunctions -mindepth 2 -maxdepth 2 -type d -name node_modules` 无输出
3. 单个本地函数 gateway health 通过
4. `npm run test:ci`
