#!/usr/bin/env node
/** beforeShellExecution：Shell 改产品源码或闸门配置一律 deny；产品写入必须走可审计编辑工具。 */
import { gateControlBasenames, loadHooksConfig } from "../load-config.mjs";
import { readStdinJson, repoRootFromHere } from "./ledger-store.mjs";
import { decideShellCommand } from "./test-first.mjs";

function reply(obj) { process.stdout.write(`${JSON.stringify(obj)}\n`); }
const payload = readStdinJson();
if (!payload?.command) { reply({ permission: "allow" }); process.exit(0); }
const repoRoot = repoRootFromHere();
const config = loadHooksConfig(repoRoot);
const result = decideShellCommand({ command: payload.command, config });
if (result.permission === "deny") {
  const gateNames = gateControlBasenames(config).join(" / ");
  reply({
    permission: "deny",
    user_message:
      result.reason === "shell-gate-mutator-exec"
        ? "已拦截：Shell 不能直接执行或导入授权台账 Hook，避免伪造用户授权/测试证据。"
        : result.reason === "shell-gate-control-write"
          ? `已拦截：Shell 会改闸门配置（${gateNames}）。请改用编辑工具并取得精确路径授权。`
          : "已拦截：Shell 会改产品源码。请改用编辑工具，使 Test First 与用户授权均可审计。",
    agent_message: result.agent_message,
  });
  process.exit(0);
}
reply({ permission: "allow" });
