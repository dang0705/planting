---
name: planting-automator-qa
description: Run or review formal planting mini-program QA when the task mentions DevTools, 9420, screenshots, wx.request, or Completion Gate evidence.
argument-hint: "[catalog leaf or QA task]"
disable-model-invocation: true
user-invocable: false
allowed-tools: Read, Grep, Glob, Bash
---

# Planting Automator QA

## When to use

Use for `/Users/jay/WebstormProjects/planting` end-side QA requiring `miniprogram-automator`, DevTools/9420, screenshots, page state, or mini-program `wx.request` evidence. Do not use it for a Node-only smoke test or when the task only needs unit/build checks.

## Inputs and context

1. Read the current dispatch handoff and `test/e2e/automator/catalog.json`.
2. Confirm the target project path and the exact catalog leaf/script; do not reuse a nearby leaf by name alone.
3. Check the active LAN/dev command in `package.json`. The validated path has been `npm run dev:mp-weixin:local-functions:lan` with `dist/dev/mp-weixin`, port 9420, LAN gateway 3010, and `tcb-ff -w`.

## Procedure

1. Run the catalog validation and the dry-run `qa-run` required by the current dispatch contract.
2. Prove project identity before testing: target `projectpath`, DevTools main PID/control port, 9420 listener, WebSocket, page data, and same-session evidence must agree.
3. Pass `projectpath` directly to `URLSearchParams`; never pre-encode it, or `%252F` can produce HTTP 200 while opening the wrong project.
4. Use the current runtime lease to reuse the matching `dist/dev/mp-weixin` watcher. Do not blanket-kill DevTools, reclaim 9420, or stop another project.
5. Run the catalog-backed live `qa-run`. Collect the required page state, mini-program-runtime `wx.request`, and exactly the leaf's strategy-defined screenshots.
6. Ensure screenshots run in a bounded worker and verify PNG output. A failed screenshot must not hang the main Automator session.
7. Record the execution id, frozen script hash, project path, port/WS endpoint, evidence paths, and a terminal result. Only then evaluate Completion Gate requirements.

## Efficiency plan

- Reuse a proven local runtime instead of repeatedly launching DevTools.
- Treat HTTP 200, a reachable 9420, CLI `auto`, or a standalone `wx.request` as diagnostics only; stop and repair identity evidence before live QA.
- Limit formal capture to the three required screenshots. Extra screenshots can trip the watchdog.
- On failure, make one target-only recovery only after proving the unique target project, main process, listener, and control port; otherwise terminate as contract, product, or environment failure.

## Pitfalls and fixes

- Wrong project despite HTTP 200: likely double-encoded `projectpath`; pass the raw path to `URLSearchParams` and repeat identity preflight.
- Screenshot RPC hangs: use the independent worker, bounded timeout, and PNG-header check; do not add infinite retries.
- Backend result remains stale: restart the normal LAN flow to reload backend code, then re-query. HTTP 200 alone is not proof of reload.
- A proposed Automator-only 9421 environment is not an established fact; do not assume it exists without a validated contract and runtime evidence.

## Verification checklist

- Catalog leaf, script hash, execution id, and `qa-run` record match.
- Target `dist/dev/mp-weixin`, PID/control-port chain, 9420/WS, and page state are proven.
- Required PNGs are valid and the mini-program `wx.request` evidence is captured.
- Result is an explicit terminal state; no bare script result is presented as formal acceptance.
- If dispatch completion is in scope, all remaining review/docs/BRV/Completion Gate conditions are independently satisfied.
