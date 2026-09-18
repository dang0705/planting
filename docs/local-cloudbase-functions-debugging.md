# 本地 CloudBase HTTP 云函数免部署调试

本文说明微信、抖音和小红书小程序的本地云函数调试方式。目标是让本地小程序直接请求本机 `tcb-ff` 服务，修改 `cloudfunctions` 代码后不需要先部署到 CloudBase。

## 适用范围

- 主目标：微信小程序开发者工具，编译产物 `dist/dev/mp-weixin`。
- 补充目标：抖音/小红书开发者工具和 H5 本地开发。
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

`CLOUDBASE_*`、`TENCENT_*`、`TENCENTCLOUD_*` 三套命名在本地 gateway 和云函数 SDK 初始化时会自动适配。不要把真实密钥写回 `cloudbaserc.json`、workflow、文档或任何已跟踪文件；已经暴露过的既有密钥必须在控制台轮换。

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
/platform-phone-bootstrap-http/*
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
platform-phone-bootstrap-http=9006
weather-http=9007
storage-http=9008
subscription-http=9009
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

该脚本会先请求 `VITE_API_BASE_URL/__local_functions__/health`。如果本地函数 gateway 没有运行，会自动启动完整 HTTP 云函数集，并等待 gateway health 和各函数 health route 返回就绪。业务探针仍会检查，但启动器没有用户会话时，接口返回预期的 `401 请先登录` 会被识别为“尚未登录”并跳过，不再把它误报为 gateway 未就绪：

```text
diagnose-http, plant-catalog-http, plant-user-http, identify-http, diagnosis-history-http, auth-user-http, platform-phone-bootstrap-http, weather-http, storage-http, subscription-http
```

如果端口被其他项目占用，或该端口已经跑着不完整的函数 gateway，小程序构建会直接失败并提示缺少哪些函数；不要忽略这一步，否则微信开发者工具里会看到未启动函数对应接口 404。

如果 `.env.local` 或 shell 没有提供 CloudBase 凭据，脚本会在启动本地业务函数前失败并提示缺少 `SecretId` / `SecretKey`。如果 3010 上已经跑着既有 gateway，但业务探针返回 `5xx`、路由错误或 SQL 配置错误，脚本仍会失败并提示检查本地凭据。不要用空值、既有泄漏值或已提交文件保守；应在未提交的 `.env.local` 中配置已轮换的最小权限密钥。

### 业务探针与登录态

`plant-user-http` 等业务接口现在只接受服务端签发的 Bearer 会话令牌，不能用启动器里的开发 openid 冒充登录。需要在启动前做严格的“已登录业务探针”时，只在当前 shell 临时提供会话令牌：

```bash
CLOUDBASE_LOCAL_SESSION_TOKEN="$LOCAL_SESSION_TOKEN" npm run dev:mp-weixin:local-functions:lan
```

令牌不会传给小程序子进程，也不会被脚本打印；不要把它写入 `.env.local`、脚本或命令历史。抖音和小红书启动器会主动清空这个微信本地令牌，避免用微信会话探测两端业务接口；两端没有令牌时，业务探针只有 `401` 会跳过，其他错误仍然阻断启动。

如果业务探针报：

```text
Database connection failed, please check the corresponding database connection configuration
```

说明密钥已经通过签名，但 SQL 连接配置或权限没有通过。先确认当前 shell 没有用既有的 `CLOUDBASE_*` / `TENCENT_*` 覆盖 `.env.local`，再确认 CloudBase 关系型数据库实例为 `READY` 且密钥账号有目标环境 SQL 权限。如 CloudBase 控制台使用了非默认数据库连接名，可在 `.env.local` 设置 `CLOUDBASE_SQL_DBLINK_NAME`；不确定时保持为空，默认使用内置 MySQL 连接。

该脚本会设置：

```text
VITE_APP_ENV=development
VITE_API_BASE_URL=http://127.0.0.1:3010
VITE_DEV_OPENID=dev_terminal_mp_local
```

抖音和小红书使用相同的启动器与探针规则，分别运行 `dev:mp-toutiao:local-functions(:lan)` 或 `dev:mp-xhs:local-functions(:lan)` 即可。

三端本地脚本使用独立端口和产物目录，允许并行启动：

| 平台   | gateway | 函数 worker 起始端口 | 产物目录              |
| ------ | ------: | -------------------: | --------------------- |
| 微信   |    3010 |                 9000 | `dist/dev/mp-weixin`  |
| 抖音   |    3020 |                 9200 | `dist/dev/mp-toutiao` |
| 小红书 |    3030 |                 9300 | `dist/dev/mp-xhs`     |

脚本显式锁定端口和输出目录，不会读取其他平台残留的 `VITE_API_BASE_URL` 来复用 gateway。

导入开发者工具前要确认产物目录中的 `project.config.json` 使用真实平台 AppID：抖音为 `tt79ef0f52e78e857401`、小红书为 `69b9576cdb45760001d82e15`。如果仍看到 `testAppId`，说明工具打开的是旧产物，需先重新运行对应平台脚本并重新导入目录。

可在导入前执行产物校验，校验失败时不要继续使用开发者工具：

```bash
npm run check:mp-toutiao-output
npm run check:mp-xhs-output
```

正式构建抖音或小红书时，`build:mp-toutiao` / `build:mp-xhs` 会在构建结束后自动校验 `project.config.json`，禁止 `testAppId` 或与 `src/manifest.json` 不一致的产物进入发布流程。

三端手机号引导登录的服务端环境变量必须配置在对应云函数，不得放入小程序产物。手机号哈希、加密、证明签名和 Bearer 会话密钥需要配置在 `platform-phone-bootstrap-http`、`auth-user-http`、`wechat-phone` 以及各个需要校验 Bearer 的业务函数：

```text
PHONE_HASH_SECRET
PHONE_ENCRYPTION_KEY
PHONE_PROOF_SECRET
SESSION_TOKEN_SECRET
WECHAT_MINIPROGRAM_APP_ID=wx85bb3976301f75fb
WECHAT_MINIPROGRAM_APP_SECRET（仅 wechat-phone）
```

抖音手机号新方式的额外变量配置在 `platform-phone-bootstrap-http`：

```text
DOUYIN_APP_SECRET
DOUYIN_CLIENT_TOKEN_URL=https://open.douyin.com/oauth/client_token/
DOUYIN_PHONE_NUMBER_URL=https://open.douyin.com/api/apps/v1/get_phonenumber_info/
DOUYIN_PHONE_PRIVATE_KEY 或 DOUYIN_PHONE_PRIVATE_KEY_BASE64
```

二选一配置即可。为避免 `.env.local` 的逐行解析截断 PEM，当前本地配置统一使用
`DOUYIN_PHONE_PRIVATE_KEY_BASE64`：它是“完整 PEM 文本”的标准 Base64（不是只编码中间
的 DER 二进制），必须保持单行；服务端启动时会解码并恢复 PEM 换行。原始私钥只配置在
`platform-phone-bootstrap-http`，不得写入前端、`cloudbaserc.json` 或构建产物。

抖音“应用公钥”只需在抖音开放平台的应用配置中维护，服务端不读取
`DOUYIN_APP_PUBLIC_KEY`；抖音手机号接口也没有需要填入本函数的“平台公钥”。
`WECHAT_PAY_PLATFORM_PUBLIC_KEY_BASE64` 属于微信支付回调验签，仅配置在支付相关函数，
不要复制到手机号引导登录函数。

三端首次登录的 HTTPS 服务域名为：
`cloud1-2grufevs395a9d5e-1403815561.ap-shanghai.app.tcloudbase.com`。
前端通过 `VITE_PLATFORM_PHONE_BOOTSTRAP_BASE_URL` 指向该域名；本地调试时由脚本自动切回本地 gateway，不与微信端端口互用。

微信端先通过受保护的 `wechat-phone` 获取服务端签名手机号证明，再匿名调用 bootstrap；抖音前端先完成一次 `tt.login`，再由 `getPhoneNumber` 回调把一次性 `e.detail.code` 交给服务端。服务端用 `client_token` 调用官方手机号接口，并用后台当前应用公钥对应的私钥解密；私钥缺失时接口会明确返回配置未完成，不会返回伪造手机号。

如果抖音开发者工具在 `getPhoneNumber` 回调返回 `Cannot read properties of undefined (reading 'safe_code')` 或 `errNo=20000`，这不是 `encryptedData`/`iv` 的读取异常，也不是后端接口返回值。先检查抖音后台已经录入应用公钥；扫码登录只解决开发者工具登录态，不能替代公钥配置。回调能够拿到新方式的 `code` 后，再把对应私钥配置到 `platform-phone-bootstrap-http` 的环境变量。公钥确认无误仍复现时，更新抖音开发者工具，或在开发者工具“详情”中切换到低于 3.51 的基础库验证旧方式；线上必须再用真机验证。项目回调同时兼容新方式的 `e.detail.code` 与旧方式的 `encryptedData`/`iv`，不会在 `safe_code` 错误时请求后端。

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
node scripts/dev/run-local-api-env.mjs \
  --base-url=http://127.0.0.1:3040 \
  --port=3040 \
  --function-port-base=9400 \
  --output-dir=dist/dev/mp-weixin-custom \
  -- uni -p mp-weixin
```

不要只设置 `CLOUDBASE_LOCAL_FUNCTIONS_PORT` 后继续运行平台快捷脚本；快捷脚本中的隔离端口是显式配置，目的是避免微信、抖音和小红书互相复用。

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
- 请求头应包含 `x-app-env=development`、`x-env=development` 和登录后服务端签发的 `Authorization: Bearer ...`。
- 启动器的 health route 不依赖用户登录；未提供会话令牌时，业务探针的 `401 请先登录` 只表示尚未登录，不能替代真实小程序登录后的业务验收。
- 修改本地 `cloudfunctions` 后不部署 CloudBase，保存后重新请求应看到本地代码变化。

## 安全边界

- 不提交 `.env.local`、密钥、个人配置或临时调试输出。
- 本地函数默认使用 `APP_ENV=development`、`SCHEMA_ENV=development`、`SQL_DATABASE=cloud1_dev`。
- 本地业务函数访问 CloudBase SQL/Auth/Storage 时必须从 `.env.local` 或 shell 获得凭据；启动前检查只验证变量存在，不会打印真实值。
- 生产环境设置本地或非 HTTPS `VITE_API_BASE_URL` 会直接失败。
- 本地 `/opt` 适配只通过 `scripts/dev/cloudfunctions-local-opt-alias.cjs` 注入，不修改线上函数源码或生产 layer。
