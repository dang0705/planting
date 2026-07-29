# Mini Program Runtime Automator Usage Facts

Status: active  
Owner: tooling  
Verified: 2026-06-22  
Review after: 30d

## Facts

- id: F-WECHAT-PACKAGE-TOOLING-001
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      symbol: devDependencies.@dcloudio/uni-automator / miniprogram-automator / miniprogram-ci
  statement: The root package declares `@dcloudio/uni-automator`, `miniprogram-automator`, and `miniprogram-ci` for WeChat mini-program automation and deployment.

- id: F-WECHAT-MP-WEIXIN-SCRIPTS-002
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: package.json
      symbol: dev:mp-weixin / build:mp-weixin / deploy:miniprogram:ci scripts
  statement: The root package defines mp-weixin dev/build scripts for production, development, cloud-dev, local-functions, and `deploy:miniprogram:ci`.

- id: F-WECHAT-PROJECT-CONFIG-003
  type: fact
  status: verified
  confidence: high
  source_kind: config
  source:
    - file: project.config.json
      symbol: compileType / appid / cloudfunctionRoot
  statement: Root `project.config.json` configures the repository as a WeChat mini-program project with CloudBase function roots.

- id: F-WECHAT-CODEX-CONFIG-MCP-004
  type: fact
  status: verified
  confidence: high
  source_kind: config
  source:
    - file: .codex/config.toml
      symbol: mcp_servers
  statement: The committed `.codex/config.toml` does not make WeChat DevTools MCP the default QA route; normal runtime QA should use direct `miniprogram-automator` / `9420` unless the task explicitly asks to debug MCP itself.

## Routing rule

- id: R-WECHAT-AUTOMATOR-DEFAULT-001
  type: rule
  status: active
  confidence: high
  source_kind: workflow
  source:
    - file: package.json
      symbol: mp-weixin scripts and automation dependencies
    - file: .codex/skills/dispatch-task/references/wechat-devtools-automation-policy.md
      symbol: 小程序端上 automator 自动化职责
  statement: For ordinary mini-program runtime QA, route to `dist/dev/mp-weixin -> 9420 -> miniprogram-automator / @dcloudio/uni-automator`; do not recall old WeChat MCP recovery memory unless the task explicitly asks for MCP debugging.

## Dedup note

Detailed ownership, evidence, QA blocker, and role-context rules belong to `.codex/skills/dispatch-task/references/wechat-devtools-automation-policy.md`. BRV should return this file as a `doc_ref`, not duplicate its full rule text.
