import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { normalizeHooksConfig } from "../load-config.mjs";
import {
  allowPreTool,
  claudeIdentity,
  claudeShellExitCode,
  extractApplyPatchPaths,
  extractWriteTargets,
  isWriteLikeToolName,
  toolSyntheticId,
} from "./claude-adapter.mjs";

const PATCH = `*** Begin Patch
*** Update File: src-taro/src/a.ts
@@
-a
+b
*** Update File: src-taro/src/a.test.ts
@@
-a
+b
*** Move to: src-taro/src/a-renamed.test.ts
*** Add File: packages/lib/src/new.ts
+export const x = 1
*** End Patch`;

describe("Claude Code adapter · wire format", () => {
  test("session_id / turn_id / tool_use_id 映射稳定", () => {
    assert.deepEqual(claudeIdentity({ session_id: "s1", turn_id: "t1", tool_use_id: "u1" }), {
      sessionId: "s1", turnId: "t1", toolUseId: "u1",
    });
  });

  test("apply_patch 支持多文件与 Move to", () => {
    assert.deepEqual(extractApplyPatchPaths(PATCH), [
      "src-taro/src/a.ts",
      "src-taro/src/a.test.ts",
      "src-taro/src/a-renamed.test.ts",
      "packages/lib/src/new.ts",
    ]);
  });

  test("标准 diff 头也能提取路径并去掉 a/ b/", () => {
    const text = `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@\n-a\n+b`;
    assert.deepEqual(extractApplyPatchPaths(text), ["src/a.ts"]);
  });

  test("apply_patch 目标相对 Claude Code cwd 解析成绝对路径", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-adapter-"));
    const cwd = path.join(root, "subdir");
    fs.mkdirSync(cwd, { recursive: true });
    const targets = extractWriteTargets({
      tool_name: "apply_patch",
      cwd,
      tool_input: { command: `*** Begin Patch\n*** Update File: ../src/a.ts\n*** End Patch` },
    }, root);
    assert.deepEqual(targets, [path.join(root, "src/a.ts")]);
  });

  test("MCP/local write tool 可通过 path-like 参数纳入闸门；read tool 不误判", () => {
    assert.equal(isWriteLikeToolName("mcp__filesystem__write_file"), true);
    assert.equal(isWriteLikeToolName("mcp__filesystem__read_file"), false);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-adapter-"));
    const targets = extractWriteTargets({
      tool_name: "mcp__filesystem__write_file",
      cwd: root,
      tool_input: { path: "src/a.ts", content: "x" },
    }, root);
    assert.deepEqual(targets, [path.join(root, "src/a.ts")]);
    assert.deepEqual(extractWriteTargets({
      tool_name: "mcp__filesystem__read_file", cwd: root, tool_input: { path: "src/a.ts" },
    }, root), []);
  });

  test("同一 tool_use_id 的多目标 synthetic id 不碰撞", () => {
    assert.notEqual(toolSyntheticId("u", "test", 0), toolSyntheticId("u", "test", 1));
    assert.notEqual(toolSyntheticId("u", "test", 0), toolSyntheticId("u", "approval-product", 0));
  });
});

describe("Claude Code adapter · Bash exit code", () => {
  test("对象格式", () => {
    assert.equal(claudeShellExitCode({ exit_code: 1, output: "fail" }), 1);
    assert.equal(claudeShellExitCode({ metadata: { exitCode: 2 } }), 2);
  });

  test("字符串模型输出格式", () => {
    assert.equal(claudeShellExitCode("Process exited with code 3"), 3);
    assert.equal(claudeShellExitCode("command failed with exit code 4"), 4);
  });

  test("无法证明时返回 null，不伪造 RED", () => {
    assert.equal(claudeShellExitCode("tests failed somehow"), null);
  });
});


describe("Claude Code adapter · allow 语义", () => {
  test("正常放行不替代 Claude Code 原生权限审批", () => {
    assert.deepEqual(allowPreTool(), {});
    assert.equal(allowPreTool("ctx").hookSpecificOutput.permissionDecision, undefined);
    assert.equal(allowPreTool("ctx").hookSpecificOutput.additionalContext, "ctx");
  });
});
