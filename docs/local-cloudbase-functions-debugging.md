# 本地 CloudBase HTTP 云函数免部署调试

本文说明微信小程序优先的本地云函数调试方式。目标是让微信开发者工具里的本地小程序直接请求本机 `tcb-ff` 服务，修改 `cloudfunctions` 代码后不需要先部署到 CloudBase。

## 适用范围

- 主目标：微信小程序开发者工具，编译产物 `dist/dev/mp-weixin`。
- 补充目标：H5 本地开发。
- 不适用：正式版、生产构建、默认云端验证链路。

默认不设置 `VITE_API_BASE_URL` 时，小程序和 H5 仍按现有 CloudBase gateway 逻辑请求云端函数。

## 首次安装

```bash
npm run dev:functions:install
```

该命令会进入各 HTTP 云函数目录安装本地 `@cloudbase/functions-framework` 等依赖。只调试诊断函数时可缩小范围：

```bash
npm run dev:functions:install -- --function=diagnose-http
```

## 本地凭据

本地 `tcb-ff` 进程不具备线上云函数运行时身份。凡是会访问 CloudBase SQL、Auth、Storage 或 AI 的 HTTP 函数，都需要从未提交的本地环境读取 CloudBase 凭据，否则业务接口会在 `models.$runSQL` 等调用处报：

```text
SIGN_PARAM_INVALID / secret id error
```

安全做法：

```bash
cp .env.local.example .env.local
```

然后只在 `.env.local` 或当前 shell 中填写任一组完整变量：

```text
CLOUDBASE_SECRET_ID + CLOUDBASE_SECRET_KEY
TENCENT_SECRET_ID + TENCENT_SECRET_KEY
TENCENTCLOUD_SECRETID + TENCENTCLOUD_SECRETKEY
```

`CLOUDBASE_*`、`TENCENT_*`、`TENCENTCLOUD_*` 三套命名在本地 gateway 和云函数 SDK 初始化时会自动兼容。不要把真实密钥写回 `cloudbaserc.json`、workflow、文档或任何已跟踪文件；已经暴露过的旧密钥必须在控制台轮换。

如果只想验证 gateway 和 health route，可临时跳过启动前凭据检查：

```bash
CLOUDBASE_LOCAL_SKIP_CREDENTIAL_CHECK=true npm run dev:functions
```

但这种情况下 `/user-plants`、天气缓存、存储、诊断读写等业务接口仍会因为没有真实凭据而失败，不能作为小程序本地业务验收。

## 启动本地云函数服务

```bash
npm run dev:functions
```

默认 gateway：

```text
http://127.0.0.1:3010
```

gateway 会把以下路径转发到对应本地函数：

```text
/diagnose-http/*
/plant-catalog-http/*
/plant-user-http/*
/identify-http/*
/diagnosis-history-http/*
/auth-user-http/*
/weather-http/*
/storage-http/*
```

默认端口映射：

```text
diagnose-http=9000
plant-catalog-http=9001
plant-user-http=9002
identify-http=9003
diagnosis-history-http=9004
auth-user-http=9005
weather-http=9006
storage-http=9007
```

如 3010 被占用：

```bash
CLOUDBASE_LOCAL_FUNCTIONS_PORT=3011 npm run dev:functions
```

只启动指定函数时可使用：

```bash
npm run dev:functions -- --function=diagnose-http
npm run dev:functions -- --functions=diagnose-http,plant-user-http
```

## 微信小程序本地调试

默认使用一条命令启动完整本地函数 gateway 和小程序构建：

```bash
npm run dev:mp-weixin:local-functions
```

该脚本会先请求 `VITE_API_BASE_URL/__local_functions__/health`。如果本地函数 gateway 没有运行，会自动启动完整 HTTP 云函数集，并等待 gateway health、各函数 health route 和关键业务探针都返回就绪：

```text
diagnose-http, plant-catalog-http, plant-user-http, identify-http, diagnosis-history-http, auth-user-http, weather-http, storage-http
```

如果端口被其他项目占用，或该端口已经跑着不完整的函数 gateway，小程序构建会直接失败并提示缺少哪些函数；不要忽略这一步，否则微信开发者工具里会看到未启动函数对应接口 404。

如果 `.env.local` 或 shell 没有提供 CloudBase 凭据，脚本会在启动本地业务函数前失败并提示缺少 `SecretId` / `SecretKey`。如果 3010 上已经跑着旧 gateway，但业务探针仍返回 `secret id error`，脚本也会失败并提示检查本地凭据。不要用空值、旧泄漏值或已提交文件兜底；应在未提交的 `.env.local` 中配置已轮换的最小权限密钥。

该脚本会设置：

```text
VITE_APP_ENV=development
VITE_API_BASE_URL=http://127.0.0.1:3010
VITE_DEV_OPENID=dev_terminal_mp_local
```

用微信开发者工具打开：

```text
dist/dev/mp-weixin
```

开发者工具中如出现合法域名或 TLS 拦截，需要在本地调试时关闭“校验合法域名、web-view 域名、TLS 版本以及 HTTPS 证书”。项目的 `src/manifest.json` 已在 `mp-weixin.setting.urlCheck=false` 方向保持开发态友好配置，但最终以微信开发者工具当前项目设置为准。

如果模拟器不能访问 `127.0.0.1`，使用局域网模式：

```bash
npm run dev:mp-weixin:local-functions:lan
```

必要时显式指定本机 IP：

```bash
CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP=192.168.1.10 npm run dev:mp-weixin:local-functions:lan
```

如果函数 gateway 使用了非默认端口，前端也必须使用同一个端口：

```bash
CLOUDBASE_LOCAL_FUNCTIONS_PORT=3011 npm run dev:mp-weixin:local-functions
```

仍然可以使用双终端高级模式手动管理函数 gateway：

```bash
npm run dev:functions
CLOUDBASE_LOCAL_AUTO_START_FUNCTIONS=false npm run dev:mp-weixin:local-functions
```

如果只是做单函数专项验证，可同时关闭自动启动并缩小检查范围：

```bash
CLOUDBASE_LOCAL_AUTO_START_FUNCTIONS=false \
CLOUDBASE_LOCAL_REQUIRED_FUNCTIONS=diagnose-http \
npm run dev:mp-weixin:local-functions
```

如果只需要看编译产物、暂时不验证业务接口，可临时跳过业务探针：

```bash
CLOUDBASE_LOCAL_SKIP_BUSINESS_CHECK=true npm run dev:mp-weixin:local-functions
```

跳过后不能作为首页业务接口验收结论。

真机调试需要手机和电脑在同一局域网，并确认 macOS 防火墙允许 Node.js 入站连接。正式版/体验版不应使用本地 HTTP 私网地址。

## H5 本地调试

```bash
npm run dev:functions
npm run dev:h5:local-functions
```

未设置 `VITE_API_BASE_URL` 时，H5 dev 仍使用既有 `/__tcb_functions__` 云端代理。

## 回到云端开发环境

小程序云端开发环境：

```bash
npm run dev:mp-weixin:cloud-dev
```

这条命令不会设置 `VITE_API_BASE_URL`，请求会回到 CloudBase gateway。

## 验证命令

本地函数 gateway：

```bash
curl http://127.0.0.1:3010/__local_functions__/health
curl http://127.0.0.1:3010/diagnose-http/health
```

小程序验证重点：

- Network 请求 URL 应为 `http://127.0.0.1:3010/<functionName>/...` 或 `http://<LAN_IP>:3010/<functionName>/...`。
- 请求头应包含 `x-app-env=development`、`x-env=development` 和开发 openid。
- 本地模式不应依赖 CloudBase gateway token。
- 修改本地 `cloudfunctions` 后不部署 CloudBase，保存后重新请求应看到本地代码变化。

## 安全边界

- 不提交 `.env.local`、密钥、个人配置或临时调试输出。
- 本地函数默认使用 `APP_ENV=development`、`SCHEMA_ENV=development`、`SQL_DATABASE=cloud1_dev`。
- 本地业务函数访问 CloudBase SQL/Auth/Storage 时必须从 `.env.local` 或 shell 获得凭据；启动前检查只验证变量存在，不会打印真实值。
- 生产环境设置本地或非 HTTPS `VITE_API_BASE_URL` 会直接失败。
- 本地 `/opt` 兼容只通过 `scripts/dev/cloudfunctions-local-opt-alias.cjs` 注入，不修改线上函数源码或生产 layer。
