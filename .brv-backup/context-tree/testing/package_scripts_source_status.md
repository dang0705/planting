# Package Scripts Source Status

Status: active  
Owner: testing  
Verified: 2026-06-06  
Review after: 30d

## Facts

- id: F-PACKAGE-CLOUDFUNCTION-DIAGNOSE-START-001
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: cloudfunctions/diagnose-http/package.json
      lines: 12-14
      symbol: scripts.start
  statement: The current review source includes a `diagnose-http` CloudBase HTTP function package with a local `start` script that runs CloudBase functions-framework on port 9000.

- id: F-PACKAGE-ROOT-TEST-SCRIPTS-003
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      lines: 9-18
      symbol: scripts.test / scripts.test:ci / route tests
  statement: Root `package.json` defines `test` as `npm run test:all`, `test:ci` as `npm run test:pinia && npm run test:tailwind`, and explicit route/diagnosis review test scripts.

- id: F-PACKAGE-ROOT-QUALITY-SCRIPTS-004
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      lines: 5-8
      symbol: lint/fmt scripts
    - file: package.json
      lines: 24-25
      symbol: check:brv-context-lifecycle / check:secrets
  statement: Root scripts define lint/format commands plus BRV context lifecycle and secret checking commands.

- id: F-PACKAGE-DIAGNOSIS-E2E-SCRIPTS-005
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      lines: 26-40
      symbol: terminal-e2e scripts
  statement: Root scripts define terminal E2E and diagnosis smoke/regression commands, including diagnose smoke, visual smoke, business guards, outcome regression, fast convergence regression, full regression, and replay commands.

- id: F-PACKAGE-LOCAL-FUNCTIONS-SCRIPTS-006
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      lines: 41-43
      symbol: dev:functions scripts
    - file: package.json
      lines: 52-60
      symbol: h5/mp-weixin local functions scripts
    - file: package.json
      lines: 72-72
      symbol: build:mp-weixin:local-functions
  statement: Root scripts provide local CloudBase function gateway commands and local-functions variants for H5 and mp-weixin development/build flows.

- id: F-PACKAGE-MP-WEIXIN-SCRIPTS-007
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      lines: 56-60
      symbol: dev:mp-weixin scripts
    - file: package.json
      lines: 68-74
      symbol: build/deploy mp-weixin scripts
  statement: Root scripts include production/development mp-weixin dev/build commands, cloud-dev/local-functions variants, and `deploy:miniprogram:ci`.

- id: F-PACKAGE-WECHAT-TOOLING-DEPS-008
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      lines: 114-114
      symbol: devDependencies.@dcloudio/uni-automator
    - file: package.json
      lines: 124-124
      symbol: devDependencies.miniprogram-ci
  statement: Root devDependencies include `@dcloudio/uni-automator` and `miniprogram-ci`, which are the source-declared WeChat mini-program automation/deployment dependencies in this package.

- id: F-SCRIPTS-BRV-LIFECYCLE-009
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 13-36
      symbol: allowed statuses / owners / fact source kinds
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 79-96
      symbol: manifest-scoped context file selection
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 203-244
      symbol: fact validation
  statement: BRV lifecycle validation defaults to manifest `active_context` files, allows only controlled statuses/owners, and enforces `type: fact` sources to be code/config/package with source files and line ranges.

- id: F-SCRIPTS-SECRET-CHECK-010
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: scripts/security/check-no-secrets.mjs
      lines: 9-30
      symbol: allowed env files / secret keys / assignment pattern
    - file: scripts/security/check-no-secrets.mjs
      lines: 39-52
      symbol: blocked secret-bearing paths
    - file: scripts/security/check-no-secrets.mjs
      lines: 102-128
      symbol: scanContent
    - file: scripts/security/check-no-secrets.mjs
      lines: 130-160
      symbol: main
  statement: Secret checking scans tracked files for blocked secret-bearing paths, private key blocks, Tencent SecretId-like tokens, and non-placeholder assignments to known secret keys.

- id: F-SCRIPTS-LOCAL-GATEWAY-011
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: scripts/dev/local-functions-gateway.mjs
      lines: 12-44
      symbol: default gateway env / HTTP function ports
    - file: scripts/dev/local-functions-gateway.mjs
      lines: 224-235
      symbol: buildRuntimeEnv
    - file: scripts/dev/local-functions-gateway.mjs
      lines: 300-328
      symbol: spawnFunction
    - file: scripts/dev/local-functions-gateway.mjs
      lines: 385-420
      symbol: proxy route dispatch
  statement: Local functions gateway maps diagnose-http through storage-http to ports 9000-9007, sets development runtime/schema SQL env defaults, spawns CloudBase functions-framework workers, and proxies requests by function name.

- id: F-SCRIPTS-RUN-LOCAL-API-ENV-012
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: scripts/dev/run-local-api-env.mjs
      lines: 9-32
      symbol: default gateway port/openid/functions/health paths
    - file: scripts/dev/run-local-api-env.mjs
      lines: 134-148
      symbol: resolveApiBaseUrl
    - file: scripts/dev/run-local-api-env.mjs
      lines: 208-244
      symbol: assertLocalCloudbaseCredentials
    - file: scripts/dev/run-local-api-env.mjs
      lines: 300-330
      symbol: assertLocalFunctionsConditionwayReady
    - file: scripts/dev/run-local-api-env.mjs
      lines: 458-489
      symbol: waitForLocalRuntime
  statement: `run-local-api-env` prepares local API base URLs, requires CloudBase credentials for credential-dependent functions unless explicitly skipped, checks gateway/function health, waits for readiness, and then runs the requested frontend/dev command with the local API environment.

- id: F-SCRIPTS-MINIPROGRAM-CI-013
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: scripts/deploy-miniprogram-ci.mjs
      lines: 65-111
      symbol: buildOptions
    - file: scripts/deploy-miniprogram-ci.mjs
      lines: 114-140
      symbol: validateOptions
    - file: scripts/deploy-miniprogram-ci.mjs
      lines: 176-189
      symbol: runCi
  statement: `deploy-miniprogram-ci` defaults project path to `dist/build/mp-weixin`, validates WeChat appid/private key/project config/source-map constraints, and constructs a `miniprogram-ci` project for preview/upload operations.

## Observations

- id: O-PACKAGE-SOURCE-COMPLETE-001
  type: observation
  status: observation
  confidence: high
  source_kind: archive_inventory
  source:
    - file: planting-brv-review-source.zip
      lines: n/a
      symbol: source package inventory
    - file: scripts.zip
      lines: n/a
      symbol: supplemental scripts archive
  statement: The current review context includes root `package.json` from `planting-brv-review-source.zip` and root `scripts/` from the supplemental `scripts.zip`; previous `needs_source` test-script observations are superseded by package/script source-verified facts in this file.
