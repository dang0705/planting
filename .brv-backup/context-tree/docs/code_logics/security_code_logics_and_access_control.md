---
title: 安全控制与鉴权逻辑
summary: 将身份解析、权限边界、配额开关与存储输入校验按来源分层；未被代码直接支持的内容不进入事实层。
updatedAt: '2026-06-05'
tags:
  - authentication
  - authorization
  - access-control
  - secrets
---

## Facts

- id: security_identity_resolution_chain
  type: fact
  statement: `resolveHttpUserInfo` 的身份来源顺序是：`x-wx-openid`/`x-openid`，`x-cloudbase-context` 解码，CloudBase 运行时 `getUserInfo(context)`，再到 Bearer token 解析（含 openid 或自定义用户 id 回查）。
  source_kind: code
  source:
    file: cloudfunctions/layer/utils/http.js
    lines: 307-391
    symbol: resolveHttpUserInfo
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

- id: security_primary_route_auth
  type: fact
  statement: 诊断主链关键路由在鉴权链中使用 `resolveRequestPrincipal` + `assertAuthenticatedUser`，无 openid 时返回 401。
  source_kind: code
  source:
    file: cloudfunctions/diagnose-http/services/request-guard.js
    lines: 80-93
    symbol: resolveRequestPrincipal, assertAuthenticatedUser
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

- id: security_internal_review_access
  type: fact
  statement: `assertInternalReviewAccess` 使用 `DIAGNOSE_INTERNAL_REVIEW_OPENIDS` 白名单，开发环境可结合 `dev_terminal_`/`anon_dev_` 作为受控放行前缀（需要 `skipAuth` 条件），不满足则通常 403。
  source_kind: code
  source:
    file: cloudfunctions/diagnose-http/services/request-guard.js
    lines: 50-73
    symbol: assertInternalReviewAccess, hasInternalReviewAccess
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

- id: security_storage_auth
  type: fact
  statement: `storage-http/app.js` 在 `/storage/diagnose-images` 与 `/storage/files` 的读写前通过 `resolveHttpUserInfo` 校验 openid，缺失时直接返回 `401`。
  source_kind: code
  source:
    file: cloudfunctions/storage-http/app.js
    lines: 296-298
    symbol: main
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

- id: security_image_input_guard
  type: fact
  statement: 存储上传要求 `dataUrl` 命中 `data:image/...;base64`，并通过白名单后缀约束（`jpg`、`jpeg`、`png`、`webp`、`heic`、`gif`）。
  source_kind: code
  source:
    file: cloudfunctions/storage-http/app.js
    lines: 40-59
    symbol: parseImageDataUrl, resolveImageSuffix
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

- id: security_quota_bypass
  type: fact
  statement: `runWithQuotaGuard` 在满足 `skipAuth + x-terminal-e2e + development + openid 前缀为 anon_dev_/dev_terminal_` 时，`shouldBypassQuota` 返回 true，可跳过配额扣费/校验影响。
  source_kind: code
  source:
    file: cloudfunctions/diagnose-http/services/request-guard.js
    lines: 16-120
    symbol: shouldBypassQuota, runWithQuotaGuard
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

- id: security_secret_scan
  type: fact
  statement: `npm run check:secrets` 会执行 `scripts/security/check-no-secrets.mjs`，检测常见敏感环境变量名、私钥痕迹和 `.env*` 追踪文件。
  source_kind: package
  source:
    file: package.json
    lines: 26-26
    symbol: scripts.check:secrets
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

## Rules

- id: skipauth_scope
  type: rule
  statement: `skipAuth` 不是对外公开鉴权放行，必须搭配运行环境与端侧身份约束理解。
  source:
    file: cloudfunctions/diagnose-http/services/request-guard.js
    symbol: shouldBypassQuota
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: provisional

- id: storage_path_guard
  type: rule
  statement: storage 路径最终通过清洗路径片段拼接固定前缀（`diagnose/`、`plants/`）构建。
  source:
    file: cloudfunctions/storage-http/app.js
    symbol: buildDiagnoseUploadFilepath, buildPlantsUploadFilepath
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

- id: error_response_policy
  type: rule
  statement: 鉴权失败路径建议保持 401/403 明确返回语义，不混淆“授权失败”与“参数错误”。
  source:
    file: cloudfunctions/diagnose-http/services/request-guard.js
    symbol: assertAuthenticatedUser, shouldBypassQuota
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: medium
  status: provisional

## Decisions

- id: security_chain_decision
  type: decision
  statement: 采用“层级鉴权 + 代码端控制”模式：前置头/上下文/Token 决定身份，业务路径再做审查权限与配额策略控制。
  source:
    file: cloudfunctions/diagnose-http/services/request-guard.js
    symbol: resolveRequestPrincipal
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: verified

## Observations

- id: check_secrets_deployment_integration
  type: observation
  statement: 当前仓库中未在此文档作用域内直接读取部署流水线配置文件（`deploy-pipeline`）的可执行步骤，因此“预发布闸门位置”暂作为推断性观察项。
  source:
    file: .github/workflows/deploy.yml
    symbol: jobs.deploy
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: low
  status: observation

- id: anonymous_test_identity
  type: observation
  statement: 匿名开发身份 `anon_dev_*` 当前可用于 E2E 与开发态场景，仍会携带日志可追踪的前缀并参与配额/权限分支，不应作为生产凭证等同替代。
  source:
    file: cloudfunctions/layer/utils/http.js
    symbol: buildAnonymousDevOpenId
  verified: 2026-06-05
  review_after: 90d
  owner: security
  confidence: high
  status: observation
