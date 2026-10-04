#!/usr/bin/env node
/** postToolUse：只在工具成功后把 pending test write / 用户授权提交为事实。 */
import path from "node:path";
import { loadHooksConfig } from "../load-config.mjs";
import { appPackageFs, loadLedger, readStdinJson, repoRootFromHere, saveLedger } from "./ledger-store.mjs";
import { decideWritePermission, extractToolPath, toAppRel } from "./product-path.mjs";
import {
  consumeApproval, explicitTestPaths, finalizeTestWrite, isTestRunnerCommand,
  recordRedTest, shellToolExitCode,
} from "./test-first.mjs";

const payload = readStdinJson();
try {
  if (payload?.conversation_id && payload?.generation_id) {
    const repoRoot = repoRootFromHere();
    const config = loadHooksConfig(repoRoot);
    const ledger = loadLedger(repoRoot);
    const cid = payload.conversation_id;
    const gen = payload.generation_id;
    const tid = payload.tool_use_id || "";
    const filePath = extractToolPath(payload);
    const decision = decideWritePermission(filePath, repoRoot);
    const fsApi = appPackageFs(repoRoot);

    if (decision.kind === "test" && tid) {
      finalizeTestWrite(
        ledger, cid, gen, tid, decision.file,
        fsApi.fileExists(decision.file), fsApi.readFile(decision.file)
      );
    }
    if ((decision.kind === "product" || decision.kind === "gate-control") && tid) {
      consumeApproval(ledger, cid, gen, tid);
    }

    if (payload.tool_name === "Shell") {
      const command = payload?.tool_input?.command || "";
      const exit = shellToolExitCode(payload.tool_output);
      if (exit !== null && exit !== 0 && isTestRunnerCommand(command)) {
        const explicit = explicitTestPaths(command);
        if (explicit.length === 1) {
          const shellCwd = payload?.tool_input?.working_directory || payload?.cwd || repoRoot;
          const rel = toAppRel(path.resolve(shellCwd, explicit[0]), repoRoot, config);
          if (fsApi.fileExists(rel)) recordRedTest(ledger, cid, gen, rel);
        }
      }
    }
    saveLedger(repoRoot, ledger);
  }
} catch {}
process.stdout.write("{}\n");
