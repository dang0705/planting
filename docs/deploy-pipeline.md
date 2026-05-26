# GitHub Actions 发布 Pipeline

本文记录 CloudBase 云函数与微信小程序发布流水线的当前实现。目标是让同一套代码通过 GitHub Environments 快速切换环境，同时避免任何密钥进入仓库、日志或 artifact。

## 入口

- Workflow：`.github/workflows/deploy.yml`
- 手动触发：GitHub Actions -> `Deploy CloudBase and Weixin Mini Program` -> `Run workflow`
- 运行参数：
  - `target_env`：`dev` / `prod`
  - `miniprogram_action`：`preview` / `upload`
  - `deploy_cloudbase`：是否部署 CloudBase 函数

`prod` 应绑定 GitHub Environment 审批。正式小程序上传前必须先跑 `prod + preview + deploy_cloudbase=false`，只验证小程序预览包，不改生产后端；确认二维码、日志和配置后，再执行需要后端变更的发布。

## GitHub Environment 配置

建议创建两个 Environment：

- `cloudbase-dev`
- `cloudbase-prod`

每个 Environment 配置同名变量，避免在 workflow 中写死环境：

| 类型 | 名称 | 说明 |
|---|---|---|
| Variables | `CLOUDBASE_ENV_ID` | 当前 Environment 对应的 CloudBase 环境 ID |
| Variables | `WECHAT_MINIPROGRAM_APPID` | 小程序 appid |
| Variables | `CLOUDBASE_DEPLOY_FUNCTIONS` | 可选，逗号分隔函数列表；为空时部署 `cloudbaserc.json` 中存在本地目录的函数 |
| Variables | `MINIPROGRAM_CI_ROBOT` | 可选，微信 CI 机器人编号，默认 `1` |
| Secrets | `TENCENT_SECRET_ID` | CloudBase 发布专用子账号 SecretId |
| Secrets | `TENCENT_SECRET_KEY` | CloudBase 发布专用子账号 SecretKey |
| Secrets | `WECHAT_MINIPROGRAM_PRIVATE_KEY` | 微信小程序 CI 私钥内容 |

生产环境必须使用最小权限子账号，不复用个人长期主账号密钥。

## 流程

1. `npm ci --legacy-peer-deps`
   - 当前依赖树存在历史 peer 冲突，CI 安装显式使用 legacy peer 解析。
2. `npm run check:secrets`
   - 扫描当前已跟踪文件，阻止 `.env`、私钥文件、CloudBase/微信/第三方明文密钥进入仓库。
3. `npm run lint`
4. `npm run test:ci`
   - 当前 CI 只运行已跟踪的 `test:pinia` 和 `test:tailwind`。
   - 现有 `npm test` 依赖若干本地未跟踪 route 测试文件，不能直接作为干净 runner 的发布闸门。
5. `npm run build:mp-weixin:ci`
   - 通过 workflow env 注入 `VITE_APP_ENV` 和 `VITE_CLOUDBASE_ENV_ID`，不复用 Windows `set VAR=...&&` 脚本。
6. `npm run deploy:functions:ci`
   - 仅当 `deploy_cloudbase=true` 时执行。
   - 生产环境必须显式配置 `CLOUDBASE_DEPLOY_FUNCTIONS`，禁止默认全量发布。
   - 调用 `scripts/deploy-cloudbase-functions.mjs`。
   - 只执行 `tcb fn code update`，避免覆盖 runtime、timeout、envVariables。
   - 每个函数部署后执行 `tcb fn detail`，但日志只输出函数名、状态、runtime、内存、超时、代码体积、更新时间等白名单摘要。
7. 若部署范围包含 `diagnose-http`，运行诊断 smoke。
8. `npm run deploy:miniprogram:ci`
   - 调用 `scripts/deploy-miniprogram-ci.mjs`。
   - 私钥来自 GitHub Secret，运行时写入 runner 临时目录，结束后删除。
   - `preview` 会上传二维码 artifact，保留 7 天。
   - `upload` 默认在构建产物中关闭 source map。

## 本地命令

```bash
npm run check:secrets
npm run build:mp-weixin:ci
node scripts/deploy-cloudbase-functions.mjs --dry-run --functions=diagnose-http --env-id=<env-id>
node scripts/deploy-miniprogram-ci.mjs --dry-run --action=preview --appid=<appid>
```

本地真实部署前，把凭据放入未提交的 `.env.local` 或 shell 环境；不要写入 `cloudbaserc.json`。

## 环境快速切换

- GitHub：通过 `target_env` 选择 `cloudbase-dev` / `cloudbase-prod`，同名 Variables/Secrets 自动切换。
- 小程序构建：workflow 注入 `VITE_APP_ENV`、`VITE_CLOUDBASE_ENV_ID`，Linux/macOS/Windows runner 都不依赖平台专属 `set` 语法。
- CloudBase 脚本：环境变量优先于 `cloudbaserc.json`，支持 `--env-id` 覆盖。
- 本地：`.env.local` 覆盖 `cloudbaserc.json`，适合开发者在不改仓库配置的情况下切换环境。

## 发布验收

发布不能只看命令返回成功。至少保留：

- workflow run URL 和 commit SHA
- 每个函数的 `fn detail` 结果
- `diagnose-http` smoke 结果
- 小程序 preview 二维码或 upload 版本号
- GitHub Actions 日志中无密钥、无私钥文件路径泄漏

## 故障排查

| 失败位置 | 先检查 | 处理顺序 |
|---|---|---|
| `npm ci --legacy-peer-deps` | lockfile 是否与 `package.json` 同步 | 本地重跑 `npm ci --legacy-peer-deps`，确认没有手工改 `node_modules` 后再提交 lockfile |
| `npm run check:secrets` | 报错文件是否为已跟踪文件或新增待提交文件 | 移除明文值，改成环境变量或占位符；若已暴露，先轮换再继续 |
| `npm run lint` | 是否为本次 diff 引入的新 error | 先修 error；warning 不作为当前发布阻断，但不要新增无意义 warning |
| `build:mp-weixin:ci` | `VITE_APP_ENV`、`VITE_CLOUDBASE_ENV_ID` 是否来自目标 Environment | 不要回退到 Windows `set VAR=...&&` 脚本；在 workflow env 中修正 |
| `deploy:functions:ci` | CloudBase envId、函数列表、专用子账号权限 | 先用 `--dry-run` 确认函数列表，再查脱敏 `tcb fn detail` 摘要；生产 preview-only 必须设置 `deploy_cloudbase=false` |
| 诊断 smoke | 目标 env、`diagnose-http` 是否已部署、匿名/测试登录是否可用 | 不要用部署成功代替 smoke；失败时保留请求 ID 和函数日志 |
| `deploy:miniprogram:ci` | appid、私钥、IP 白名单、构建目录 | 先跑 `preview`，确认二维码 artifact；`upload` 失败时不要把私钥或完整环境变量写入日志 |

失败重跑时只重跑同一 commit 的 workflow。若需要改代码或改配置，重新提交后用新 commit 发布，避免本地工作区状态和 GitHub runner 状态不一致。

## 仍需人工处理

仓库曾出现明文凭据字段。当前代码已移除跟踪文件中的明文值并加入扫描闸门，但已经暴露过的 CloudBase、第三方服务、微信 CI 相关凭据必须在控制台轮换；轮换完成前，不应把生产发布 pipeline 视作安全可用。
