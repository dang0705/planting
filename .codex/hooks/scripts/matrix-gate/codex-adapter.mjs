/** Codex lifecycle hook 适配层：只负责 Codex wire format ↔ 平台无关治理核心。 */
import fs from "node:fs";
import path from "node:path";
import { decideWritePermission } from "./product-path.mjs";

export function codexIdentity(payload = {}) {
  return {
    sessionId: String(payload.session_id || ""),
    turnId: String(payload.turn_id || ""),
    toolUseId: String(payload.tool_use_id || ""),
  };
}

export function allowPreTool(additionalContext = "") {
  // “本 Hook 不阻断”不等于替用户批准 Codex 自身的权限请求。
  // 无上下文时返回空对象；有上下文时只追加 developer context，不给 allow 决策。
  if (!additionalContext) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext,
    },
  };
}

export function denyPreTool(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: String(reason || "Blocked by repository policy."),
    },
  };
}

export function emptyPostTool() { return {}; }
export function continueStop() { return {}; }
export function blockStop(reason) {
  return { decision: "block", reason: String(reason || "Repository test gate requested another pass.") };
}

function cleanPatchPath(raw) {
  let p = String(raw || "").trim();
  if (!p || p === "/dev/null") return "";
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) p = p.slice(1, -1);
  // 标准 diff 的 a/ b/ 前缀不是仓库目录。
  p = p.replace(/^(?:a|b)\//, "");
  return p.trim();
}

/**
 * 解析 Codex apply_patch 的目标路径。
 * 同时支持 Codex 的 *** Update/Add/Delete File 格式与标准 unified diff 头。
 */
export function extractApplyPatchPaths(command) {
  const text = String(command || "");
  const out = [];
  const add = (value) => {
    const p = cleanPatchPath(value);
    if (p && !out.includes(p)) out.push(p);
  };

  for (const line of text.split(/\r?\n/)) {
    let m = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s*(.+?)\s*$/i);
    if (m) { add(m[1]); continue; }
    m = line.match(/^\*\*\*\s+Move to:\s*(.+?)\s*$/i);
    if (m) { add(m[1]); continue; }
    m = line.match(/^diff --git\s+a\/(.+?)\s+b\/(.+?)\s*$/i);
    if (m) { add(m[1]); add(m[2]); continue; }
    m = line.match(/^(?:---|\+\+\+)\s+([^\t\r\n ]+).*$/i);
    if (m) add(m[1]);
  }
  return out;
}

function collectPathLikeValues(value, out, depth = 0) {
  if (!value || depth > 3) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPathLikeValues(item, out, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const PATH_KEY = /^(?:path|file_path|filepath|target_file|target_path|destination|dest|new_path|old_path|source_path|source|from|to)$/i;
  for (const [key, val] of Object.entries(value)) {
    if (PATH_KEY.test(key) && typeof val === "string" && val.trim()) out.push(val.trim());
    else if (val && typeof val === "object") collectPathLikeValues(val, out, depth + 1);
  }
}

export function isWriteLikeToolName(toolName) {
  const name = String(toolName || "");
  if (name === "apply_patch") return true;
  return /(?:^|__|_|-)(?:write|edit|replace|patch|create|delete|remove|move|rename|modify|update_file|save)(?:$|__|_|-)/i.test(name)
    || /(?:writefile|editfile|deletefile|movefile|renamefile|replacefile)/i.test(name);
}

/** 获取一个 Codex tool call 可能写到的全部路径。Bash 由独立 shell policy 处理。 */
export function extractWriteTargets(payload, repoRoot) {
  const toolName = String(payload?.tool_name || "");
  if (toolName === "Bash") return [];
  const input = payload?.tool_input || {};
  const raw = [];
  if (toolName === "apply_patch") {
    raw.push(...extractApplyPatchPaths(input.command));
  } else if (isWriteLikeToolName(toolName)) {
    collectPathLikeValues(input, raw);
  }
  const cwd = path.resolve(String(payload?.cwd || repoRoot || "."));
  const out = [];
  for (const item of raw) {
    const abs = path.isAbsolute(item) ? path.resolve(item) : path.resolve(cwd, item);
    if (!out.includes(abs)) out.push(abs);
  }
  return out;
}

export function classifyTargets(payload, repoRoot) {
  return extractWriteTargets(payload, repoRoot).map((absPath) => ({
    absPath,
    decision: decideWritePermission(absPath, repoRoot),
  }));
}

export function toolSyntheticId(toolUseId, kind, index) {
  return `${toolUseId || "missing"}:${kind}:${index}`;
}

export function fileSnapshot(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) return { exists: true, content: `__NON_FILE__:${stat.mode}:${stat.size}` };
    return { exists: true, content: fs.readFileSync(absPath) };
  } catch {
    return { exists: false, content: "" };
  }
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Codex PostToolUse 的 Bash tool_response 在不同客户端可能是对象或模型可见字符串。 */
export function codexShellExitCode(toolResponse) {
  const queue = [toolResponse];
  const seen = new Set();
  const EXIT_KEYS = ["exit_code", "exitCode", "status", "code", "return_code", "returnCode", "returncode"];
  while (queue.length) {
    const value = queue.shift();
    if (value && typeof value === "object") {
      if (seen.has(value)) continue;
      seen.add(value);
      for (const key of EXIT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const n = finiteNumber(value[key]);
          if (n !== null) return n;
        }
      }
      for (const child of Object.values(value)) if (child && typeof child === "object") queue.push(child);
      continue;
    }
    if (typeof value === "string") {
      try { queue.push(JSON.parse(value)); } catch {}
      const patterns = [
        /process exited with code\s+(\d+)/i,
        /exit(?:ed)?(?:\s+with)?\s+code\s*[:=]?\s*(\d+)/i,
        /exit_code\s*[:=]\s*(\d+)/i,
        /command failed with exit code\s+(\d+)/i,
      ];
      for (const re of patterns) {
        const m = value.match(re);
        if (m) return Number(m[1]);
      }
    }
  }
  return null;
}
