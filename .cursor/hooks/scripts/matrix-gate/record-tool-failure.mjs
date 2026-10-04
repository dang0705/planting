#!/usr/bin/env node
/** postToolUseFailure：释放 pending，不消费授权，也不产生 Test First evidence。 */
import { cancelPendingTool } from "./test-first.mjs";
import { loadLedger, readStdinJson, repoRootFromHere, saveLedger } from "./ledger-store.mjs";
const payload = readStdinJson();
try {
  if (payload?.conversation_id && payload?.generation_id && payload?.tool_use_id) {
    const root = repoRootFromHere();
    const ledger = loadLedger(root);
    cancelPendingTool(ledger, payload.conversation_id, payload.generation_id, payload.tool_use_id);
    saveLedger(root, ledger);
  }
} catch {}
process.stdout.write("{}\n");
