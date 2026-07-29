---
title: Source Verified Backend Facts
summary: Centralized backend architecture, factual project constraints, and source-verified rules.
tags: []
related: [architecture/diagnosis/source_verified_diagnosis_facts.md, architecture/diagnosis/yellowing_diagnosis_lifecycle/yellowing_diagnosis_lifecycle.md, architecture/weather/diagnosis_logic/weather_diagnosis_logic.md]
keywords: []
createdAt: '2026-06-07T03:02:40.447Z'
updatedAt: '2026-06-15T00:58:55.999Z'
---
## Reason
Curate from RLM context: captured backend architecture and project rules.

## Raw Concept
**Task:**
Consolidate backend system facts and architecture rules

**Changes:**
- Extracted backend architecture and project constraints from RLM context

**Timestamp:** 2026-06-15

## Narrative
### Structure
Consolidated backend facts organized by subject.

### Highlights
Capture of core system architecture, rules, and constraints.

## Facts
- **端上验收流程**: 在 planting 仓库，若代码未部署到云端，端上验收必须先成功跑通 npm run dev:mp-weixin:local-functions:lan 的完整 LAN 本地函数 flow。
- **验收证据标准**: 9420/miniprogram-automator/wx.request 证据是端上验收通过的唯一标准。
- **验收证据标准**: Scoped gateway、backend curl、Node HTTP 或 health route 仅能作为排障证据，不能作为验收通过依据。
- **QA 案例分析**: 2026-06-15 weather-cache QA 案例表明，gateway health 成功不代表完整 LAN flow 通过，需警惕 worker 缺失导致的 502 错误。
- **前端技术栈**: 项目前端技术栈为 UniApp 3.0、Vue 3 和 Tailwind CSS 3。
- **后端技术栈**: 项目后端技术栈为 Tencent CloudBase、Cloud Functions 和 MySQL/TDSQL-C。
- **自动化路径**: 端上自动化项目路径必须为 /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin。
- **自动化通信**: 端上自动化默认使用 9420 端口进行 miniprogram-automator 通信。
- **LAN flow**: LAN flow 验收必须先修复并重新跑通 `npm run dev:mp-weixin:local-functions:lan`。
- **诊断流自动化**: 诊断流自动化必须优先使用稳定 id（如 `diagnose-entry-button-{plant.id}`），不得将中文文案、截图坐标或页面层级作为首选定位方式。
- **失败归因**: QA 失败归因必须显式区分：devtools_automator_blocker, devtools_auth_blocker, devtools_configuration_blocker, product_blocker, recovered, not_verified。
- **QA scope**: QA scope 由 Test Contract 或验收标准决定，而非 UI diff。
- **QA Contract**: 涉及诊断相关接口（如 `/diagnosis/question/start`）的 QA 必须要求 Test Contract 中存在端上验证项，缺失时直接退回 contract_blocker。
- **QA 证据**: 端上接口的合格证据必须来自小程序运行时的 `wx.request` 或真实端上交互，Node 直接 HTTP/curl 不得替代端上 QA。
- **projectPath**: 本项目端上 automator 的 Test Contract `projectPath` 必须固定为 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`。
- **登录态保护**: 禁止为了建立“干净 CDP 基线”默认执行会重启 DevTools 的路径，除非用户明确授权。
- **SQL schema**: CloudBase SQL 改动必须有 schema truth gate 证据，优先使用 live INFORMATION_SCHEMA 或 CloudBase MCP 验证。
- **输出规范**: QA 输出必须合并为一个简洁结果，禁止拆分为大量重复章节，标准输出建议不超过 600 tokens。
- **Completion Gate**: 任务完成需满足所有 required acceptance items 已映射并测试通过，且 QA 已按 Test Contract 完成端上自动化验证。
- **Git**: Git commit must be completed or have a documented blocker before task completion.
- **Verification**: Unverified items must be explicitly categorized and written back.
- **Documentation**: If docs_keeper_required is set to yes, documentation must be synced or a valid reason for skipping must be provided.
- **Code Quality**: Touched code files must pass the 500-line split hard limit check.
- **Testing**: Task completion is blocked if only backend tests pass without frontend or mini-program acceptance.
- **Testing**: Task completion is blocked if only API verification is performed without UI component acceptance.
- **Process**: Task completion is blocked if checklist or acceptance criteria are not mapped.
- **QA**: QA automation is mandatory for tasks involving end-user interactions.
- **Diagnosis Module**: Diagnosis-related paths (e.g., /diagnosis/question/start) require a Test Contract including concrete endpoints, payloads, and assertions.
- **Testing**: End-user interfaces cannot be verified solely by Node, curl, backend smoke, or unit tests.
- **Deployment**: Code must be deployed to the cloud or verified via the local LAN flow (npm run dev:mp-weixin:local-functions:lan) or mini-program runtime.
- **CloudBase**: CloudBase SQL repository changes require a schema truth gate or live auth evidence.
- **Reporting**: The Completion Gate template defines the mandatory fields for reporting task completion status.
- **Data Processing**: Do not summarize table data with every row.
- **Code Preservation**: Preserve exact code examples, API signatures, and interface definitions.
- **Documentation**: Preserve step-by-step procedures and numbered instructions in narrative.rules.
