/**
 * Test-first 顺序闸与用户写入授权台账（纯函数）。
 * 机器只证明可机械验证的事实：成功 test write、已执行 RED、精确用户授权。
 */
import crypto from "node:crypto";
import path from "node:path";
import { DEFAULT_HOOKS_CONFIG, gateControlBasenames } from "../load-config.mjs";
import { classifyAppRel, toPosix } from "./product-path.mjs";

export const WAIVER_TOKEN = "#skip-test-first";
export const PRODUCT_APPROVAL_TOKEN = "#approve-product-write";
export const GATE_APPROVAL_TOKEN = "#approve-gate-write";
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue)$/;

export function createLedger() { return { conversations: {} }; }

function newEntry(generationId) {
  return {
    generationId,
    tests: [],
    redTests: [],
    pendingTests: {},
    waived: false,
    productApprovals: [],
    gateApprovals: [],
    pendingApprovals: {},
  };
}

export function noteGeneration(ledger, conversationId, generationId, options = {}) {
  const current = ledger.conversations[conversationId];
  if (!current || current.generationId !== generationId) {
    const next = newEntry(generationId);
    if (options.carryTestEvidence && current) {
      next.tests = [...(current.tests || [])];
      next.redTests = [...(current.redTests || [])];
    }
    ledger.conversations[conversationId] = next;
  } else {
    // 向后兼容旧台账形状
    current.tests ??= [];
    current.redTests ??= [];
    current.pendingTests ??= {};
    current.productApprovals ??= [];
    current.gateApprovals ??= [];
    current.pendingApprovals ??= {};
    current.waived ??= false;
  }
  return ledger.conversations[conversationId];
}

function hashText(text) {
  return crypto.createHash("sha256").update(String(text ?? "")).digest("hex");
}

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

/** preToolUse：只挂 pending，不算已成功落盘。 */
export function recordPendingTestWrite(
  ledger, conversationId, generationId, toolUseId, testRel, beforeExists, beforeContent
) {
  if (!toolUseId) return false;
  const entry = noteGeneration(ledger, conversationId, generationId);
  entry.pendingTests[toolUseId] = {
    testRel: toPosix(testRel),
    beforeExists: Boolean(beforeExists),
    beforeHash: beforeExists ? hashText(beforeContent) : null,
  };
  return true;
}

/** postToolUse：成功且文件内容实际变化，才成为 Test First evidence。 */
export function finalizeTestWrite(
  ledger, conversationId, generationId, toolUseId, testRel, afterExists, afterContent
) {
  const entry = noteGeneration(ledger, conversationId, generationId);
  const pending = entry.pendingTests?.[toolUseId];
  if (!pending || pending.testRel !== toPosix(testRel)) return false;
  delete entry.pendingTests[toolUseId];
  if (!afterExists) return false;
  const changed = !pending.beforeExists || pending.beforeHash !== hashText(afterContent);
  if (changed) addUnique(entry.tests, pending.testRel);
  return changed;
}

/** 兼容纯函数单测/旧调用；生产入口不再在 preToolUse 直接调用它。 */
export function recordTestWrite(ledger, conversationId, generationId, testRel) {
  addUnique(noteGeneration(ledger, conversationId, generationId).tests, toPosix(testRel));
}

export function recordRedTest(ledger, conversationId, generationId, testRel) {
  addUnique(noteGeneration(ledger, conversationId, generationId).redTests, toPosix(testRel));
}

export function cancelPendingTool(ledger, conversationId, generationId, toolUseId) {
  const entry = noteGeneration(ledger, conversationId, generationId);
  delete entry.pendingTests?.[toolUseId];
  delete entry.pendingApprovals?.[toolUseId];
}

export function recordWaiver(ledger, conversationId, generationId) {
  noteGeneration(ledger, conversationId, generationId).waived = true;
}

export function hasWaiverToken(prompt) {
  return new RegExp(`${WAIVER_TOKEN}(?![\\w-])`, "i").test(String(prompt || ""));
}

function approvalPattern(token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s+(?:\\\`([^\\\`]+)\\\`|"([^"]+)"|'([^']+)'|([^\\s]+))`, "gi");
}

export function parseApprovalPaths(prompt, token) {
  const out = [];
  for (const m of String(prompt || "").matchAll(approvalPattern(token))) {
    const raw = m[1] || m[2] || m[3] || m[4] || "";
    const rel = toPosix(raw.trim());
    if (rel) out.push(rel);
  }
  return out;
}

export function recordApprovalsFromPrompt(ledger, conversationId, generationId, prompt) {
  const entry = noteGeneration(ledger, conversationId, generationId);
  entry.productApprovals.push(...parseApprovalPaths(prompt, PRODUCT_APPROVAL_TOKEN));
  entry.gateApprovals.push(...parseApprovalPaths(prompt, GATE_APPROVAL_TOKEN));
}

function approvalList(entry, kind) {
  return kind === "gate" ? entry.gateApprovals : entry.productApprovals;
}

export function hasAvailableApproval(ledger, conversationId, generationId, kind, rel) {
  const entry = currentEntry(ledger, conversationId, generationId);
  if (!entry) return false;
  const target = toPosix(rel);
  const total = approvalList(entry, kind).filter((x) => toPosix(x) === target).length;
  const reserved = Object.values(entry.pendingApprovals || {}).filter(
    (x) => x.kind === kind && toPosix(x.rel) === target
  ).length;
  return total > reserved;
}

export function reserveApproval(
  ledger, conversationId, generationId, toolUseId, kind, rel, beforeExists, beforeContent
) {
  if (!toolUseId || !hasAvailableApproval(ledger, conversationId, generationId, kind, rel)) return false;
  const pending = {
    kind,
    rel: toPosix(rel),
  };
  if (typeof beforeExists === "boolean") {
    pending.beforeTracked = true;
    pending.beforeExists = beforeExists;
    pending.beforeHash = beforeExists ? hashText(beforeContent) : null;
  }
  noteGeneration(ledger, conversationId, generationId).pendingApprovals[toolUseId] = pending;
  return true;
}

function removeOneApproval(entry, pending) {
  const list = approvalList(entry, pending.kind);
  const idx = list.findIndex((x) => toPosix(x) === toPosix(pending.rel));
  if (idx >= 0) list.splice(idx, 1);
  return idx >= 0;
}

/**
 * 成功写入后消费一次授权。
 * - 旧调用未记录 before 快照：保持兼容，直接消费；
 * - Codex 版记录 before 快照：只有文件系统状态/内容真的变化才消费；失败或 no-op 只释放 pending。
 */
export function finalizeApprovalWrite(
  ledger, conversationId, generationId, toolUseId, afterExists, afterContent
) {
  const entry = noteGeneration(ledger, conversationId, generationId);
  const pending = entry.pendingApprovals?.[toolUseId];
  if (!pending) return false;
  delete entry.pendingApprovals[toolUseId];
  if (pending.beforeTracked) {
    const changed = pending.beforeExists !== Boolean(afterExists)
      || (Boolean(afterExists) && pending.beforeHash !== hashText(afterContent));
    if (!changed) return false;
  }
  return removeOneApproval(entry, pending);
}

/** 兼容纯函数旧测试：调用方已能确定工具成功时直接消费。 */
export function consumeApproval(ledger, conversationId, generationId, toolUseId) {
  const entry = noteGeneration(ledger, conversationId, generationId);
  const pending = entry.pendingApprovals?.[toolUseId];
  if (!pending) return false;
  delete entry.pendingApprovals[toolUseId];
  return removeOneApproval(entry, pending);
}

function stripCodeExt(rel) { return rel.replace(CODE_EXT, ""); }
function escapeRegExp(text) { return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function moduleIds(rel) {
  const noExt = stripCodeExt(toPosix(rel));
  const ids = [noExt];
  if (path.posix.basename(noExt) === "index") ids.push(path.posix.dirname(noExt));
  return ids;
}

function resolveImportTargets(testRel, content, aliases) {
  const specs = new Set();
  const pattern = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;
  for (const match of String(content || "").matchAll(pattern)) specs.add(match[1]);
  const testDir = path.posix.dirname(toPosix(testRel));
  const targets = [];
  for (const spec of specs) {
    let resolved = null;
    for (const [alias, targetRoot] of Object.entries(aliases)) {
      if (spec.startsWith(alias)) {
        resolved = stripCodeExt(`${targetRoot}${spec.slice(alias.length)}`);
        break;
      }
    }
    if (resolved) targets.push(resolved);
    else if (spec.startsWith(".")) {
      targets.push(stripCodeExt(path.posix.normalize(path.posix.join(testDir, spec))));
    }
  }
  return targets;
}

export function parsePatternList(jsonText, key = "bypass") {
  try {
    const list = JSON.parse(String(jsonText || ""))?.[key];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch { return []; }
}
/** @deprecated runner exclude 不再作为 Test First 旁路；仅保留旧测试兼容。 */
export function parseSkipList(jsonText) { return parsePatternList(jsonText, "exclude"); }

const GLOB_CHARS = /[*?[\]{}]/;
export function isBypassListed(productRel, patterns) {
  const rel = toPosix(productRel);
  return (patterns ?? []).some((raw) => {
    const pattern = toPosix(raw).replace(/\/+$/, "");
    if (GLOB_CHARS.test(pattern)) {
      return typeof path.posix.matchesGlob === "function" && path.posix.matchesGlob(rel, pattern);
    }
    return rel === pattern || rel.startsWith(`${pattern}/`);
  });
}
export const isSkipListed = isBypassListed;

function packageLocal(rel, packageRel) {
  const p = toPosix(rel);
  const pkg = toPosix(packageRel || ".").replace(/\/+$/, "") || ".";
  if (pkg === ".") return p;
  if (p === pkg) return "";
  return p.startsWith(`${pkg}/`) ? p.slice(pkg.length + 1) : null;
}

export function isRelatedTest(testRel, productRel, testContent, aliases, packageRel = ".") {
  const aliasMap = aliases || DEFAULT_HOOKS_CONFIG.importAliases;
  const test = packageLocal(testRel, packageRel);
  const product = packageLocal(productRel, packageRel);
  if (test == null || product == null) return false;
  const testDir = path.posix.dirname(test);
  const productDir = path.posix.dirname(product);
  if (testDir === productDir) return true;
  if (path.posix.basename(testDir) === "__tests__" && path.posix.dirname(testDir) === productDir) return true;
  const productIds = moduleIds(product);
  return resolveImportTargets(test, testContent, aliasMap).some((target) => productIds.includes(target));
}

function currentEntry(ledger, conversationId, generationId) {
  const entry = ledger.conversations[conversationId];
  return entry && entry.generationId === generationId ? entry : null;
}

const DENY_AGENT_MESSAGE = (target) => [
  `停。当前 generation 还没有与 ${target} 相关的 Test First 证据。`,
  "先成功写入/修改代表性测试；若已有测试已经准确表达 Expected，可先显式运行该测试并取得 RED。",
  "普通下一 generation 不继承；只有用户对精确产品路径做授权握手时继承既有 Test First evidence。不得用 Shell 绕过。",
  `若仓库/任务明确不启用 TDD，只能由用户使用 ${WAIVER_TOKEN} 做本轮例外，或由仓库所有者关闭 config.tddEnforcement。`,
].join("\n");

export function decideProductWrite({
  ledger,
  conversationId,
  generationId,
  productRel,
  packageRel = ".",
  bypassRel = null,
  bypassPatterns = [],
  skipPatterns,
  fileExists,
  readFile,
  importAliases,
  tddEnforcement = true,
}) {
  const patterns = bypassPatterns.length ? bypassPatterns : (skipPatterns ?? []);
  if (!tddEnforcement) return { permission: "allow", reason: "tdd-enforcement-disabled" };
  if (isBypassListed(bypassRel ?? packageLocal(productRel, packageRel) ?? productRel, patterns)) return { permission: "allow", reason: "test-first-bypass" };
  if (!conversationId || !generationId) {
    return { permission: "deny", reason: "missing-generation", agent_message: DENY_AGENT_MESSAGE(productRel) };
  }
  const entry = currentEntry(ledger, conversationId, generationId);
  if (entry?.waived) return { permission: "allow", reason: "waived" };
  const aliases = importAliases || DEFAULT_HOOKS_CONFIG.importAliases;
  for (const testRel of [...(entry?.tests ?? []), ...(entry?.redTests ?? [])]) {
    if (!fileExists(testRel)) continue;
    if (isRelatedTest(testRel, productRel, readFile(testRel), aliases, packageRel)) {
      return {
        permission: "allow",
        reason: entry?.redTests?.includes(testRel) ? "existing-test-red" : "related-test-write",
        relatedTest: testRel,
      };
    }
  }
  return { permission: "deny", reason: "no-related-test-evidence", agent_message: DENY_AGENT_MESSAGE(productRel) };
}

export function isTestRunnerCommand(command) {
  return /\b(vitest|jest|mocha|ava|playwright\s+test|yarn\s+(?:test|vitest|jest)|npm\s+(?:test|run\s+test)|pnpm\s+(?:test|vitest|jest))\b/i.test(String(command || ""));
}

export function explicitTestPaths(command) {
  const re = /(?:^|[\s'"=])([^\s'"|;&]+(?:\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs|vue)|(?:^|\/)test_[^\s'"/]+\.py|_test\.py))/gi;
  const out = [];
  for (const m of String(command || "").matchAll(re)) addUnique(out, toPosix(m[1]));
  return out;
}

export function shellToolExitCode(toolOutput) {
  try {
    const value = typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
    const candidates = [value?.exitCode, value?.exit_code, value?.status, value?.code];
    for (const x of candidates) if (Number.isFinite(Number(x))) return Number(x);
  } catch {}
  return null;
}

const DIRECT_WRITE_PATTERN = /(?:^|[\s;&|('"])(?:sed\s+-i|perl\s+-\w*i|tee|cp|mv|rm|rmdir|truncate|git\s+(?:checkout|restore|mv|rm|reset))(?=\s|$)|>{1,2}/;
const OPAQUE_PATCH_PATTERN = /(?:^|[\s;&|(])(?:patch|git\s+apply)(?=\s|$)/;
const AUDIT_STASH_PATTERN = /(?:^|[\s;&|(])git\s+stash(?:\s+([\w-]+))?(?=\s|$)/;
const INTERPRETER_PATTERN = /(?:^|[\s;&|('"])(?:python3?|node\s+(?:-e|--eval)|perl)(?=\s|$)/;
const INTERPRETER_WRITE_API_PATTERN = /write_text|write_bytes|writeFile|appendFile|\.write\(|open\([^)]*,\s*['"][wax]\+?b?['"]|unlink|rmSync|rmdirSync|renameSync|\brename\(|os\.remove|os\.replace|shutil\.|copyFile|\.touch\(/;
const SHELL_WRAPPER_PATTERN = /(?:^|[\s;&|(])(?:(?:ba|z)?sh\s+-c|eval|xargs)(?=\s|$)/;
const GATE_MUTATOR_BASENAME_RE = /\b(?:codex-user-prompt-submit|codex-pre-tool-use|codex-post-tool-use|ledger-store)\.mjs\b/;
const JS_EXECUTOR_RE = /(?:^|[\s;&|(])(?:[^\s;&|]*\/)?(?:node|bun|deno|tsx)(?=\s|$)/;


function managedPackageRels(config) {
  const explicit = Array.isArray(config.managedPackageRels) ? config.managedPackageRels : [];
  const fallback = [config.appPackage || "."];
  return [...new Set((explicit.length ? explicit : fallback).map((x) => toPosix(x).replace(/\/+$/, "") || "."))];
}
function buildProductPathPattern(config) {
  const roots = config.productRoots
    .map((r) => escapeRegExp(toPosix(r).replace(/^\/+|\/+$/g, "")))
    .join("|");
  const prefixes = managedPackageRels(config).filter((x) => x !== ".").map(escapeRegExp);
  // 同时接受 repo-relative package/src/... 与 package cwd 下的 src/...，也覆盖产品根目录本身。
  const prefix = prefixes.length ? `(?:(?:${prefixes.join("|")})/)?` : "";
  return new RegExp(
    String.raw`(?:^|[\s'"=:(/])(?:\./)?${prefix}((?:${roots})(?:/[\w@.\-/\[\]]*)?)(?=$|[\s'";&|),])`,
    "g"
  );
}
function buildGateControlShellPattern(config) {
  const names = gateControlBasenames(config)
    .map((name) => escapeRegExp(path.posix.basename(name)))
    .join("|");
  // hooks 目录/manifest 本身也是闸门；basename 清单覆盖应用包内可影响闸门的配置。
  return new RegExp(
    `(?:\\.codex\\/hooks(?:\\.json|\\/[^\\s'";|&]+)|(?:^|[\\s/'"])(?:${names})\\b)`
  );
}
function stripQuotedContent(text) { return text.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""'); }
function stripNonWriteArrows(command) {
  return command.replace(/\d*>&\d+/g, " ").replace(/\d*>{1,2}\s*\/dev\/null/g, " ").replace(/=>|>=|->/g, " ");
}
function foldHeredocs(text) {
  return text.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g,
    (_m, _q, term, rest, body) => `<<${term}${rest} ${body.replace(/\n/g, " ")} ${term}`);
}
export function splitShellSegments(command) {
  const text = foldHeredocs(String(command || ""));
  const segments = [];
  let buf = ""; let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      buf += c;
      if (c === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; buf += c; continue; }
    const two = text.slice(i, i + 2);
    if (c === "\n" || c === ";" || c === "|" || two === "&&" || two === "||") {
      if (buf.trim()) segments.push(buf.trim());
      buf = "";
      if (two === "&&" || two === "||") i++;
      continue;
    }
    buf += c;
  }
  if (buf.trim()) segments.push(buf.trim());
  return segments;
}

function isOpaquePatchMutation(segment) {
  const raw = String(segment || "");
  if (!OPAQUE_PATCH_PATTERN.test(raw)) return false;
  if (/\bgit\s+apply\b/.test(raw) && /(?:^|\s)--check(?:\s|$)/.test(raw)) return false;
  if (/(?:^|[\s;&|(])patch(?=\s|$)/.test(raw) && /(?:^|\s)--dry-run(?:\s|$)/.test(raw)) return false;
  return true;
}
function commandHidesAuditState(segment) {
  const m = String(segment || "").match(AUDIT_STASH_PATTERN);
  if (!m) return false;
  const sub = (m[1] || "push").toLowerCase();
  return !["list", "show"].includes(sub);
}

function commandWritesFiles(segment) {
  const raw = stripNonWriteArrows(segment);
  const wrapper = SHELL_WRAPPER_PATTERN.test(raw);
  const executable = wrapper ? raw : stripQuotedContent(raw);
  if (DIRECT_WRITE_PATTERN.test(executable)) return true;
  return INTERPRETER_PATTERN.test(executable) && INTERPRETER_WRITE_API_PATTERN.test(raw);
}
function commandExecutesGateMutator(segment) {
  const raw = stripNonWriteArrows(segment);
  if (!GATE_MUTATOR_BASENAME_RE.test(raw)) return false;
  GATE_MUTATOR_BASENAME_RE.lastIndex = 0;
  // node/bun/deno/tsx 直接执行或 -e 动态 import。
  if (JS_EXECUTOR_RE.test(raw)) return true;
  // shebang 入口被直接执行：./codex-user-prompt-submit.mjs 或绝对路径。
  const direct = /^(?:env\s+)?(?:\.\.?\/|\/)[^\s]*\b(?:codex-user-prompt-submit|codex-pre-tool-use|codex-post-tool-use)\.mjs\b/;
  if (direct.test(raw.trim())) return true;
  // shell wrapper 内直接执行脚本路径；bash -c "cat ..." 不命中。
  if (SHELL_WRAPPER_PATTERN.test(raw) && /["'](?:\.\.?\/|\/)[^"']*\b(?:codex-user-prompt-submit|codex-pre-tool-use|codex-post-tool-use)\.mjs\b/.test(raw)) return true;
  return false;
}
function isProductishPath(rel, config) {
  const p = toPosix(rel);
  const kind = classifyAppRel(p, config);
  if (kind === "product") return true;
  if (kind === "test") return false;
  // Shell 可直接移动/删除目录；目录没有源码扩展名，仍属于产品写入面。
  // 对明确测试目录/文件继续放行，其他 productRoots 下路径按敏感产品路径处理。
  if (/\.(?:test|spec)\./.test(p) || /(^|\/)(?:__tests__|__mocks__|test)(\/|$)/.test(p)) return false;
  return config.productRoots.some((root) => {
    const clean = root.replace(/\/+$/, "");
    return p === clean || p.startsWith(`${clean}/`);
  });
}
function productishPathsIn(text, config) {
  const paths = [];
  for (const match of text.matchAll(buildProductPathPattern(config))) {
    if (isProductishPath(match[1], config)) paths.push(match[1]);
  }
  return paths;
}
export function classifyShellCommand(command, config = DEFAULT_HOOKS_CONFIG) {
  let writesProduct = false; let writesGateControl = false; let executesGateMutator = false;
  let opaquePatch = false; let hidesAuditState = false; const paths = [];
  const gatePattern = buildGateControlShellPattern(config);
  for (const segment of splitShellSegments(command)) {
    if (commandExecutesGateMutator(segment)) executesGateMutator = true;
    if (isOpaquePatchMutation(segment)) opaquePatch = true;
    if (commandHidesAuditState(segment)) hidesAuditState = true;
    if (!commandWritesFiles(segment)) continue;
    const segmentPaths = productishPathsIn(segment, config);
    if (segmentPaths.length) { writesProduct = true; paths.push(...segmentPaths); }
    gatePattern.lastIndex = 0;
    if (gatePattern.test(segment)) writesGateControl = true;
  }
  return { writesProduct, writesGateControl, executesGateMutator, opaquePatch, hidesAuditState, paths };
}
export function scriptContentMayWriteProduct(content, config = DEFAULT_HOOKS_CONFIG) {
  const raw = String(content || "");
  if (!INTERPRETER_WRITE_API_PATTERN.test(raw)) return false;
  return productishPathsIn(raw, config).length > 0 || buildGateControlShellPattern(config).test(raw);
}

export function decideShellCommand({ command, config = DEFAULT_HOOKS_CONFIG }) {
  const { writesProduct, writesGateControl, executesGateMutator, opaquePatch, hidesAuditState, paths } = classifyShellCommand(command, config);
  if (executesGateMutator) {
    return {
      permission: "deny", reason: "shell-gate-mutator-exec",
      agent_message: "停。Shell 正在直接执行/导入授权台账 Hook。此路径可伪造用户授权或 Test First evidence，必须拦截。",
    };
  }
  if (opaquePatch) {
    return {
      permission: "deny", reason: "shell-opaque-patch",
      agent_message: "停。patch / git apply 可在命令文本外决定真实写入路径，无法可靠证明不会绕过产品写入闸；请改用可审计编辑工具。",
    };
  }
  if (hidesAuditState) {
    return {
      permission: "deny", reason: "shell-audit-state-hide",
      agent_message: "停。git stash 会隐藏本回合文件状态并破坏 Stop 的可追溯性；本回合内不得 stash。",
    };
  }
  if (writesGateControl) {
    return {
      permission: "deny", reason: "shell-gate-control-write",
      agent_message: `停。Shell 会改闸门配置（${gateControlBasenames(config).join(" / ")}）。闸门文件只能走编辑工具并取得精确用户授权。`,
    };
  }
  if (!writesProduct) return { permission: "allow", reason: "not-product-write" };
  return {
    permission: "deny", reason: "shell-product-write",
    agent_message: [
      `停。Shell 会改产品源码（${paths.join(", ")}）。`,
      "产品改动必须走编辑工具，使 Test First 与一次性用户授权都可被机械审计。",
      `${WAIVER_TOKEN} 只跳过 Test First，不授权 Shell 产品写入。`,
    ].join("\n"),
  };
}
