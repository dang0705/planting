#!/usr/bin/env node
/** beforeSubmitPrompt：开启 generation；记录 Test First 豁免与精确写入授权。 */
import { loadLedger, readStdinJson, repoRootFromHere, saveLedger } from "./ledger-store.mjs";
import { PRODUCT_APPROVAL_TOKEN, hasWaiverToken, noteGeneration, parseApprovalPaths, recordApprovalsFromPrompt, recordWaiver } from "./test-first.mjs";
try {
  const payload = readStdinJson();
  const conversationId = payload?.conversation_id;
  const generationId = payload?.generation_id;
  if (conversationId && generationId) {
    const repoRoot = repoRootFromHere();
    const ledger = loadLedger(repoRoot);
    // 用户是在“产品写入被拦后”给授权时，generation 会变化；
    // 只在精确产品授权消息中继承上一 generation 已形成的 test-first evidence，避免授权握手把证据清空。
    const carryTestEvidence = parseApprovalPaths(payload.prompt, PRODUCT_APPROVAL_TOKEN).length > 0;
    noteGeneration(ledger, conversationId, generationId, { carryTestEvidence });
    if (hasWaiverToken(payload.prompt)) recordWaiver(ledger, conversationId, generationId);
    recordApprovalsFromPrompt(ledger, conversationId, generationId, payload.prompt);
    saveLedger(repoRoot, ledger);
  }
} catch {}
process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
