# P0 TypeScript / Node 22 / CloudBase 构建核验

- Ticket：`z8v0kmr96w`
- 当前结论：**REVIEW_NEEDED**
- 范围：只读复核 `cloudfunctions-v2/` 的锁文件、构建产物、部署清单与命令结果；未改源码、测试、构建脚本或 ClickUp，未部署、未改云端。
- 目录边界：仓库根 `cloudfunctions-v2/` 是影子重建根目录；旧 `cloudfunctions/**` 不在本票据实现范围。

## 平台事实

CloudBase 官方运行时页 [runtime-support](https://docs.cloudbase.net/cloud-function/runtime-support) 明确：HTTP 云函数支持 Node.js `22.21`，`scf_bootstrap` 应使用 `/var/lang/node22/bin/node`。HTTP 云函数监听 `9000`，可采用 CommonJS 与原生 `node:http`。因此 Node 22 是本 P0 的受支持运行时，并非 CloudRun 容器替代品。

最小可回放证据在 `P0-typescript-node22-cloudbase-z8v0kmr96w.runtime-evidence.json`：URL、访问时间、响应 SHA-256、官方断言及本地官方 skill 哈希均已保存，且不含认证材料或云端配置。

## 独立 Expected 与验证边界

独立 Expected：在 CloudBase Node.js 22.21 HTTP 云函数运行时中，严格 TypeScript 的 CommonJS 服务应构建为 `dist/server.cjs`，通过 Node 22 `scf_bootstrap` 监听 9000，部署包只含构建产物与生产依赖，并有可重放的内容清单。

P0 静态门禁 `P0-typescript-node22-cloudbase-z8v0kmr96w.verify.mjs` 先于实现落盘；它只读配置、锁文件、产物、部署清单与官方运行时映射，不调用云端、不读取业务数据。此前的 RED 覆盖了缺少独立 TypeScript、Node 22 类型、构建器、AJV/Pino 生产依赖、严格 tsconfig、产物、bootstrap 及部署清单的情形；当前实现已补齐这些可观察条件。

| 测试真实性项 | 当前可审计事实 |
|---|---|
| Expected 来源 | P0 验收条件、CloudBase 官方运行时页、冻结的后端技术基线。 |
| 真实路径 | `dist/server.cjs` 进程经真实 `127.0.0.1:9000` 接收 HTTP 请求；不使用内存 HTTP mock。 |
| 直接复核 | 本地 shell 为 Node `24.21.0`；`npm run verify=PASS`（含 typecheck、oxlint、构建、11 个测试文件/44 项测试及静态门禁），但 npm 也正确警告该 shell 不满足包声明的 Node `22.x`。此结果不能替代 Node 22 验收。 |
| Node 22 命令记录 | 本轮通过 `node@22.21.1` 重放严格 TypeScript 与完整 Vitest：11 个测试文件、44 项测试全部通过；其中 8 项为本地真实端口 HTTP 基线。 |
| 脱敏 RED→GREEN | 日志敏感路径测试先记录 RED；当前服务仅记录 `health`、`probe`、`unmatched` 固定路由标签，测试确认路径、查询、请求头、请求体和环境哨兵均不进入日志。 |

## 已复核的构建与部署包事实

| 项目 | 复核结果 |
|---|---|
| 运行时与模块 | `engines.node` 为 `22.x`；严格 tsconfig 使用 Node16/CommonJS 兼容配置；服务使用原生 `node:http`。 |
| 精确依赖 | production：`ajv@8.20.0`、`pino@10.3.1`；dev：`typescript@5.9.3`、`@types/node@22.20.3`、`esbuild@0.28.2`、`vitest@4.1.11`、`oxlint@1.50.0`、`oxfmt@0.35.0`。质量工具只存在于开发依赖，不进入部署包。`@cloudbase/node-sdk@3.18.3` 仅在实际访问 CloudBase 时再作为生产依赖加入；`mysql2@3.24.4` 是否加入由数据访问证伪卡决定，不作预判。 |
| 构建产物 | `dist/server.cjs` 存在；清单将其 SHA-256 固定为 `2c19d7aa6f22e5e78e8e5916cf85da27d98eedcbb66ecb905ef809e70bb64e28`。 |
| 启动 | 根及 `deployment/` 中的 `scf_bootstrap` 均可执行，内容为 `/var/lang/node22/bin/node --enable-source-maps dist/server.cjs`。 |
| HTTP 测试 | 8 条真实端口测试覆盖健康检查、非法方法、未知路由、合法与非法 DTO、MIME、请求大小及日志脱敏。 |
| 部署清单 | `package-manifest.json` 列出 955 个文件，包含自身；不存在顶层 `src/`、`test/`，也不含 `typescript`、`vitest`、`esbuild`、`@types/node` 等 dev 依赖。 |
| 依赖审计 | `npm audit --package-lock-only --json` 与 `npm audit --omit=dev --package-lock-only --json` 均为 0 项漏洞。此结果只代表本独立最小函数包，不能用根仓审计替代。 |

## 当前复核状态

用户已批准依赖替换；独立 lock 与已安装依赖解析为固定版本。全依赖和 production 审计都为 0，`npm run verify` 以及 Node `22.21.1` 下完整 44 项测试均已有 PASS 记录。本票据保留为 `REVIEW_NEEDED`，等待独立实现复核，不将其标记为 CloudBase 真实运行 PASS。

## 明确未验证项

未部署到 CloudBase，未获得 CloudBase 真实运行实例、HTTP 入口、日志或读回证据；因此本报告只证明本地构建基线及官方运行时可行性，不代表云端已验收。
