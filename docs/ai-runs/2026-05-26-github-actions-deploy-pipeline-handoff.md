# 2026-05-26 GitHub Actions 发布 Pipeline Handoff

## 目标

为 CloudBase 云函数和微信小程序补齐手动 GitHub Actions 发布 pipeline，支持环境快速切换、CloudBase 函数代码更新、`fn detail` 脱敏证据、小程序 `miniprogram-ci` preview/upload，以及仓库密钥扫描。

## 主要改动

- 新增 `.github/workflows/deploy.yml`
  - `workflow_dispatch` 输入：`target_env`、`miniprogram_action`、`deploy_cloudbase`
  - GitHub Environment：`cloudbase-dev` / `cloudbase-prod`
  - 最小权限：`contents: read`
  - 生产 preview-only 必须设置 `deploy_cloudbase=false`
  - 生产 CloudBase 部署必须显式配置 `CLOUDBASE_DEPLOY_FUNCTIONS`
- 新增 `scripts/deploy-cloudbase-functions.mjs`
  - 支持 `--dry-run`、`--env-id`、`--functions`
  - CI 中执行 `tcb login`
  - 使用 `tcb fn code update`，不覆盖 runtime / timeout / envVariables
  - `fn detail` 捕获后只打印白名单摘要
- 新增 `scripts/deploy-miniprogram-ci.mjs`
  - 微信 CI 私钥来自 env，临时落盘后清理
  - 支持 preview/upload
  - upload 默认关闭构建产物 source map
- 新增 `scripts/security/check-no-secrets.mjs`
  - 扫描已纳入索引的文件，阻止 `.env`、私钥文件和常见云服务密钥入库
- 移除跟踪配置里的明文凭据默认值
  - `cloudbaserc.json`
  - `scripts/lib/ai-visual-pool-coverage-config.mjs`
- 文档：
  - `docs/deploy-pipeline.md`
  - `docs/cautions/github_actions_release_pipeline_secret_safety.md`

## 本地验证

- `npm ci --legacy-peer-deps`：通过
- `node --check`：发布/密钥相关脚本通过
- `ruby -ryaml -e 'YAML.load_file(".github/workflows/deploy.yml")'`：通过
- `npm run check:secrets`：通过
- `npm run lint`：通过，仍有既有 warnings
- `npm run test:ci`：通过
- `VITE_APP_ENV=development VITE_CLOUDBASE_ENV_ID=<env-id> npm run build:mp-weixin:ci`：通过
- `npm run deploy:functions:ci -- --dry-run --env-id=<env-id>`：通过
- `TARGET_ENV=production npm run deploy:functions:ci -- --dry-run --functions=diagnose-http --env-id=<env-id>`：通过
- `TARGET_ENV=production npm run deploy:functions:ci -- --dry-run --env-id=<env-id>`：按预期失败，生产禁止默认全量部署
- `npm run deploy:miniprogram:ci -- --dry-run --action=preview --appid=<placeholder>`：通过
- `TARGET_ENV=prod MINIPROGRAM_CI_UPLOAD_SOURCE_MAP=true node scripts/deploy-miniprogram-ci.mjs --dry-run --action=upload --appid=<placeholder>`：按预期失败
- `git diff --check`：通过

## 未完成 / 生产前置

- 必须轮换已经暴露过的 CloudBase、第三方服务、微信 CI 相关凭据。
- 必须在 GitHub UI 配置 `cloudbase-prod` required reviewers。
- 必须在 GitHub 上实跑一次 `cloudbase-dev + preview`，保留 workflow URL、commit SHA、脱敏 `fn detail`、diagnose smoke、preview artifact。
- `actionlint` 本地 npm 入口不可用，本轮只完成 YAML 基础解析。
- `npm audit --omit=dev --audit-level=critical` 仍报告既有依赖漏洞；多数修复涉及 uni-app / 构建链 breaking change，未在本任务中处理。

## 风险

- 当前提交实现的是发布 pipeline，不等于生产发布已经放行。
- `diagnose-http` 若涉及业务行为发布，仍需补 DB 证据，不应只看 smoke。
- `npm test` 当前依赖本地未跟踪 route 测试文件，workflow 暂使用 `test:ci`。
