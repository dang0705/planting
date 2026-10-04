#!/usr/bin/env node
/**
 * preToolUse：
 * - 测试写入只登记 pending；成功且实际改变后由 postToolUse 转成证据。
 * - 产品写入先过 Test First，再要求当前 generation 的精确路径一次性用户授权。
 * - 闸门文件同样要求精确路径一次性用户授权。
 */
import { loadHooksConfig } from "../load-config.mjs";
import {
  appPackageFs, loadLedger, loadTestFirstBypassPatterns, readStdinJson, repoRootFromHere, saveLedger,
} from "./ledger-store.mjs";
import { decideWritePermission, extractToolPath } from "./product-path.mjs";
import {
  GATE_APPROVAL_TOKEN,
  PRODUCT_APPROVAL_TOKEN,
  decideProductWrite,
  recordPendingTestWrite,
  reserveApproval,
} from "./test-first.mjs";

function reply(obj) { process.stdout.write(`${JSON.stringify(obj)}\n`); }
const payload = readStdinJson();
if (!payload) {
  reply({ permission: "deny", user_message: "产品源码闸门未收到有效工具输入，已拦截。", agent_message: "preToolUse stdin 无效；fail closed。" });
  process.exit(0);
}
const repoRoot = repoRootFromHere();
const config = loadHooksConfig(repoRoot);
const conversationId = payload.conversation_id || "";
const generationId = payload.generation_id || "";
const toolUseId = payload.tool_use_id || "";
const filePath = extractToolPath(payload);
const decision = decideWritePermission(filePath, repoRoot);
const ledger = loadLedger(repoRoot);
const fsApi = appPackageFs(repoRoot);

if (decision.kind === "test") {
  if (conversationId && generationId && toolUseId) {
    try {
      recordPendingTestWrite(
        ledger, conversationId, generationId, toolUseId, decision.file,
        fsApi.fileExists(decision.file), fsApi.readFile(decision.file)
      );
      saveLedger(repoRoot, ledger);
    } catch {}
  }
  reply({ permission: "allow" });
  process.exit(0);
}

if (decision.kind === "product") {
  const order = decideProductWrite({
    ledger, conversationId, generationId, productRel: decision.file,
    bypassPatterns: loadTestFirstBypassPatterns(repoRoot),
    importAliases: config.importAliases,
    tddEnforcement: config.tddEnforcement,
    ...fsApi,
  });
  if (order.permission === "deny") {
    reply({ permission: "deny", user_message: `已拦截：${decision.file} 尚无本轮 Test First 证据。`, agent_message: order.agent_message });
    process.exit(0);
  }
  if (!conversationId || !generationId || !toolUseId || !reserveApproval(ledger, conversationId, generationId, toolUseId, "product", decision.file)) {
    reply({
      permission: "deny",
      user_message: `产品写入需要一次性精确授权：${PRODUCT_APPROVAL_TOKEN} ${decision.file}`,
      agent_message: `停。Cursor 当前 preToolUse 的 ask 不可靠执行；请用户在下一条消息加入：${PRODUCT_APPROVAL_TOKEN} ${decision.file}。授权只消费一次成功写入。`,
    });
    process.exit(0);
  }
  saveLedger(repoRoot, ledger);
  reply({ permission: "allow" });
  process.exit(0);
}

if (decision.kind === "gate-control") {
  if (!conversationId || !generationId || !toolUseId || !reserveApproval(ledger, conversationId, generationId, toolUseId, "gate", decision.file)) {
    reply({
      permission: "deny",
      user_message: `闸门文件写入需要一次性精确授权：${GATE_APPROVAL_TOKEN} ${decision.file}`,
      agent_message: `停。请用户在下一条消息加入：${GATE_APPROVAL_TOKEN} ${decision.file}。不得自行修改授权台账。`,
    });
    process.exit(0);
  }
  saveLedger(repoRoot, ledger);
  reply({ permission: "allow" });
  process.exit(0);
}

reply({ permission: "allow" });
