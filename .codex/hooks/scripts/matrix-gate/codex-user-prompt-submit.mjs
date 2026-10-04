#!/usr/bin/env node
/** UserPromptSubmit：建立本 turn 台账，并捕获 turn-start baseline。 */
import { loadHooksConfig } from "../load-config.mjs";
import { captureTurnBaseline } from "../turn-baseline.mjs";
import { loadLedger, readStdinJson, repoRootFromHere, saveLedger } from "./ledger-store.mjs";
import {
  PRODUCT_APPROVAL_TOKEN,
  hasWaiverToken,
  noteGeneration,
  parseApprovalPaths,
  recordApprovalsFromPrompt,
  recordWaiver,
} from "./test-first.mjs";

const payload = readStdinJson();
try {
  const sessionId = payload?.session_id;
  const turnId = payload?.turn_id;
  if (sessionId && turnId) {
    const repoRoot = repoRootFromHere();
    const config = loadHooksConfig(repoRoot);
    // 先抓回合起点：Stop 不再依赖最终 git dirty 状态；中途 commit 也不会洗掉本轮变化。
    captureTurnBaseline(repoRoot, sessionId, turnId, config);

    const ledger = loadLedger(repoRoot);
    // 产品授权通常来自“上一个 turn 已完成 Test First，但产品写入因缺授权被 PreToolUse 拦截”后的用户回复。
    const carryTestEvidence = parseApprovalPaths(payload?.prompt, PRODUCT_APPROVAL_TOKEN).length > 0;
    noteGeneration(ledger, sessionId, turnId, { carryTestEvidence });
    if (hasWaiverToken(payload?.prompt)) recordWaiver(ledger, sessionId, turnId);
    recordApprovalsFromPrompt(ledger, sessionId, turnId, payload?.prompt);
    saveLedger(repoRoot, ledger);
  }
} catch {}
process.stdout.write("{}\n");
