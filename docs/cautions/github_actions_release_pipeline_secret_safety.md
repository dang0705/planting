# GitHub Actions 发布与密钥安全避坑

## 根因

1. `cloudbaserc.json` 曾承载发布配置和本地调试凭据，导致明文密钥容易进入跟踪文件。
2. 旧发布入口只做 `tcb fn code update`，缺少 `fn detail`、smoke 和可审计发布证据。
3. 小程序构建脚本混用 Windows `set VAR=...&&`，不适合直接放到 Linux GitHub runner。
4. `project.config.json` 开启 source map 上传，正式 `miniprogram-ci upload` 存在源码暴露风险。
5. dev/prod 之前主要靠脚本名区分，实际 envId、schema、GitHub Environment 没有形成统一切换契约。
6. `tcb fn detail --json` 不能原样写入 GitHub Actions 日志；函数详情可能包含运行环境配置，应只保留脱敏摘要。
7. 只在 merge 后手动触发的发布 workflow 不能作为 PR 合并闸门；post-merge deploy 失败不会反向阻止已经完成的 PR merge。

## 修复办法

1. `cloudbaserc.json` 只保留非敏感函数元数据，真实凭据改由 `.env.local`、shell 或 GitHub Secrets 注入。
2. 新增 `npm run check:secrets`，扫描已跟踪文件，阻止 `.env`、私钥文件、CloudBase/微信/第三方明文密钥进入仓库。
3. 新增 `.github/workflows/deploy.yml`，用 `workflow_dispatch` + GitHub Environments 控制 `dev` / `prod`。
4. 新增 `scripts/deploy-cloudbase-functions.mjs`，部署后强制执行 `tcb fn detail`。
5. 新增 `scripts/deploy-miniprogram-ci.mjs`，微信 CI 私钥只写入临时目录，结束后删除；正式上传默认关闭 source map。
6. 新增跨平台 `build:mp-weixin:ci`，由 workflow env 注入环境变量，不依赖 Windows shell。
7. `deploy-cloudbase-functions.mjs` 捕获 `fn detail` 输出并只打印白名单字段，避免环境变量进入日志。
8. 在 `.github/workflows/deploy.yml` 增加 PR `release preflight` job，并在 GitHub master 保护规则里把 `Deploy CloudBase and Weixin Mini Program / release preflight` 配成 required check。

## 必须注意

- 删除仓库明文值不等于密钥安全恢复；已经暴露过的密钥必须轮换。
- GitHub Actions 日志、artifact、二维码文件不能包含密钥或私钥路径。
- 生产 Environment 必须配置 required reviewers。
- CloudBase 发布成功不等于验收通过，必须结合 `fn detail`、业务 smoke、必要 DB 证据。
- 生产 CloudBase 部署必须显式配置 `CLOUDBASE_DEPLOY_FUNCTIONS`，禁止漏配后默认全量发布。
- `npm test` 当前依赖本地未跟踪 route 测试文件；发布 workflow 暂用 `test:ci`，待这些测试文件正式入库后再恢复完整测试闸门。
- PR 前置闸门只允许 dry-run 和构建验证，不得读取微信小程序私钥、腾讯云 Secret，也不得执行 CloudBase 真部署或 `miniprogram-ci` preview/upload。
- 如果 `actions/checkout` 在公开仓库中因 `Your account is suspended` 或 token 侧权限问题失败，PR 闸门会在真正验证前被阻断；可改用无 token 的只读 `git fetch` checkout step，避免把 GITHUB_TOKEN 作为拉代码依赖。
