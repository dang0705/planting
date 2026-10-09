#!/usr/bin/env node
/**
 * Claude Code PreToolUse：
 * - Bash：静态阻断产品/闸门写入、opaque patch、stash 隐藏状态、间接脚本写入与授权台账伪造；
 * - apply_patch / 其它可识别写工具：测试仅挂 pending，产品先过 Test First，再过一次性精确用户授权；
 * - 同一 apply_patch 同时含 test + product 时，test 不会“即时”解锁 product，必须先有既存证据。
 */
import fs from "node:fs";
import path from "node:path";
import { gateControlBasenames, loadHooksConfig } from "../load-config.mjs";
import { listManagedPackages } from "../package-layout.mjs";
import {
  loadLedger,
  loadTestFirstBypassPatterns,
  readStdinJson,
  repoFs,
  repoRootFromHere,
  saveLedger,
} from "./ledger-store.mjs";
import {
  GATE_APPROVAL_TOKEN,
  PRODUCT_APPROVAL_TOKEN,
  decideProductWrite,
  hasAvailableApproval,
  recordPendingTestWrite,
  reserveApproval,
  decideShellCommand,
  scriptContentMayWriteProduct,
} from "./test-first.mjs";
import {
  allowPreTool,
  classifyTargets,
  claudeIdentity,
  denyPreTool,
  fileSnapshot,
  toolSyntheticId,
} from "./claude-adapter.mjs";

function reply(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

const SCRIPT_EXEC_RE = /(?:^|[\s;&|(])(?:python3?|node|bun|deno|tsx|perl|ruby)\s+(?!-)(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;
const SHELL_SCRIPT_RE = /(?:^|[\s;&|(])(?:ba|z)?sh\s+(?!-)(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;

function referencedScripts(command, cwd) {
  const out = [];
  const collect = (re, kind) => {
    for (const m of String(command || "").matchAll(re)) {
      const raw = m[1] || m[2] || m[3] || "";
      if (!raw || raw.includes("$(") || raw.includes("${")) continue;
      const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
      try {
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) out.push({ abs, kind });
      } catch {}
    }
  };
  collect(SCRIPT_EXEC_RE, "interpreter");
  collect(SHELL_SCRIPT_RE, "shell");
  return [...new Map(out.map((x) => [x.abs, x])).values()];
}

function inspectIndirectScripts(command, cwd, config) {
  for (const script of referencedScripts(command, cwd)) {
    let content = "";
    try {
      const stat = fs.statSync(script.abs);
      if (stat.size > 1_500_000) continue;
      content = fs.readFileSync(script.abs, "utf8");
    } catch { continue; }
    if (script.kind === "shell") {
      const nested = decideShellCommand({ command: content, config });
      if (nested.permission === "deny") return { script: script.abs, reason: nested.reason };
    } else if (scriptContentMayWriteProduct(content, config)) {
      return { script: script.abs, reason: "interpreter-script-product-write" };
    }
  }
  return null;
}

const payload = readStdinJson();
if (!payload) {
  reply(denyPreTool("PreToolUse 未收到有效 JSON；为避免绕过产品源码闸门，本次调用已拒绝。"));
  process.exit(0);
}

const repoRoot = repoRootFromHere();
const baseConfig = loadHooksConfig(repoRoot);
const managedPackageRels = listManagedPackages(repoRoot, baseConfig).map((p) => p.rel);
const config = { ...baseConfig, managedPackageRels };
const { sessionId, turnId, toolUseId } = claudeIdentity(payload);

if (payload.tool_name === "Bash") {
  const command = payload?.tool_input?.command || "";
  const result = decideShellCommand({ command, config });
  if (result.permission === "deny") {
    reply(denyPreTool(result.agent_message || "Shell write blocked by repository policy."));
    process.exit(0);
  }
  const cwd = payload?.cwd ? path.resolve(payload.cwd) : repoRoot;
  const indirect = inspectIndirectScripts(command, cwd, config);
  if (indirect) {
    reply(denyPreTool(`检测到间接脚本可能写产品/闸门（${indirect.reason}）：${indirect.script}。请改用可审计编辑工具。`));
    process.exit(0);
  }
  reply(allowPreTool());
  process.exit(0);
}

const targets = classifyTargets(payload, repoRoot);
if (!targets.length) {
  reply(allowPreTool());
  process.exit(0);
}

const ledger = loadLedger(repoRoot);
const fsApi = repoFs(repoRoot);
const protectedTargets = targets.filter((x) => x.decision.kind === "product" || x.decision.kind === "gate-control");

// 先纯检查：任何产品路径没有 Test First，就整体 deny，不留下 pending，也不让同一 patch 里的测试自举解锁产品。
for (const item of protectedTargets) {
  if (item.decision.kind !== "product") continue;
  const bypassPatterns = loadTestFirstBypassPatterns(repoRoot, item.decision.packageRel);
  const order = decideProductWrite({
    ledger,
    conversationId: sessionId,
    generationId: turnId,
    productRel: item.decision.file,
    packageRel: item.decision.packageRel || ".",
    bypassRel: item.decision.localRel,
    bypassPatterns,
    importAliases: config.importAliases,
    tddEnforcement: config.tddEnforcement,
    ...fsApi,
  });
  if (order.permission === "deny") {
    reply(denyPreTool([
      `已拦截产品写入：${item.decision.file}。`,
      order.agent_message || "当前 turn 缺少相关 Test First 证据。",
    ].join("\n")));
    process.exit(0);
  }
}

// 再纯检查授权，避免“前几个 reserve 成功、后一个缺授权”造成半提交 pending。
for (const item of protectedTargets) {
  const kind = item.decision.kind === "gate-control" ? "gate" : "product";
  const rel = item.decision.file;
  if (!sessionId || !turnId || !toolUseId || !hasAvailableApproval(ledger, sessionId, turnId, kind, rel)) {
    const token = kind === "gate" ? GATE_APPROVAL_TOKEN : PRODUCT_APPROVAL_TOKEN;
    reply(denyPreTool([
      `${kind === "gate" ? "闸门" : "产品"}写入需要一次性精确用户授权。`,
      `请用户在下一条消息加入：${token} ${rel}`,
      "授权只在文件真正发生一次成功变化后消费；失败/no-op 不消费。",
    ].join("\n")));
    process.exit(0);
  }
}

try {
  let testIndex = 0;
  let approvalIndex = 0;
  for (const item of targets) {
    const snapshot = fileSnapshot(item.absPath);
    if (item.decision.kind === "test") {
      recordPendingTestWrite(
        ledger,
        sessionId,
        turnId,
        toolSyntheticId(toolUseId, "test", testIndex++),
        item.decision.file,
        snapshot.exists,
        snapshot.content,
      );
    } else if (item.decision.kind === "product" || item.decision.kind === "gate-control") {
      const kind = item.decision.kind === "gate-control" ? "gate" : "product";
      reserveApproval(
        ledger,
        sessionId,
        turnId,
        toolSyntheticId(toolUseId, `approval-${kind}`, approvalIndex++),
        kind,
        item.decision.file,
        snapshot.exists,
        snapshot.content,
      );
    }
  }
  saveLedger(repoRoot, ledger);
  reply(allowPreTool());
} catch (error) {
  reply(denyPreTool(`无法安全写入 Hook 台账：${error?.message || error}`));
}
