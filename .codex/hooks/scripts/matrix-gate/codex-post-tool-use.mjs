#!/usr/bin/env node
/** Codex PostToolUse：以真实文件变化提交 Test First 证据/消费授权，并记录明确单测失败 RED。 */
import path from "node:path";
import {
  loadLedger,
  readStdinJson,
  repoFs,
  repoRootFromHere,
  saveLedger,
} from "./ledger-store.mjs";
import { resolveManagedFile } from "./product-path.mjs";
import {
  explicitTestPaths,
  finalizeApprovalWrite,
  finalizeTestWrite,
  isTestRunnerCommand,
  recordRedTest,
} from "./test-first.mjs";
import {
  classifyTargets,
  codexIdentity,
  codexShellExitCode,
  emptyPostTool,
  fileSnapshot,
  toolSyntheticId,
} from "./codex-adapter.mjs";

function reply(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
const payload = readStdinJson();
if (!payload) { reply(emptyPostTool()); process.exit(0); }

try {
  const repoRoot = repoRootFromHere();
  const { sessionId, turnId, toolUseId } = codexIdentity(payload);
  if (!sessionId || !turnId) { reply(emptyPostTool()); process.exit(0); }
  const ledger = loadLedger(repoRoot);
  const fsApi = repoFs(repoRoot);

  if (payload.tool_name === "Bash") {
    const command = payload?.tool_input?.command || "";
    const exit = codexShellExitCode(payload?.tool_response);
    if (exit !== null && exit !== 0 && isTestRunnerCommand(command)) {
      const explicit = explicitTestPaths(command);
      if (explicit.length === 1) {
        const shellCwd = payload?.cwd || repoRoot;
        const resolved = resolveManagedFile(path.resolve(shellCwd, explicit[0]), repoRoot);
        if (resolved.kind === "test" && fsApi.fileExists(resolved.repoRel)) {
          recordRedTest(ledger, sessionId, turnId, resolved.repoRel);
        }
      }
    }
    saveLedger(repoRoot, ledger);
    reply(emptyPostTool());
    process.exit(0);
  }

  const targets = classifyTargets(payload, repoRoot);
  let testIndex = 0;
  let approvalIndex = 0;
  for (const item of targets) {
    const snapshot = fileSnapshot(item.absPath);
    if (item.decision.kind === "test") {
      finalizeTestWrite(
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
      finalizeApprovalWrite(
        ledger,
        sessionId,
        turnId,
        toolSyntheticId(toolUseId, `approval-${kind}`, approvalIndex++),
        snapshot.exists,
        snapshot.content,
      );
    }
  }
  saveLedger(repoRoot, ledger);
} catch {}
reply(emptyPostTool());
