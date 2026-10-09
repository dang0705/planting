import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  claudeIdentity,
  claudePromptText,
  claudeTurnId,
  extractWriteTargets,
  isWriteLikeToolName,
} from "./claude-adapter.mjs";

describe("Claude Code 载荷兼容", () => {
  test("回合编号取 prompt_id；无则回退 turn_id", () => {
    assert.equal(claudeTurnId({ prompt_id: "p1" }), "p1");
    assert.equal(claudeTurnId({ turn_id: "t1" }), "t1");
    assert.equal(claudeTurnId({ prompt_id: "p1", turn_id: "t1" }), "p1");
    assert.equal(claudeTurnId({}), "");
    assert.equal(claudeIdentity({ session_id: "s", prompt_id: "p", tool_use_id: "u" }).turnId, "p");
  });

  test("提示词正文兼容 prompt 与 user_input", () => {
    assert.equal(claudePromptText({ prompt: "a" }), "a");
    assert.equal(claudePromptText({ user_input: "b" }), "b");
    assert.equal(claudePromptText({}), "");
  });

  test("Claude Code 的写类工具都被识别", () => {
    for (const n of ["Write", "Edit", "MultiEdit", "NotebookEdit", "mcp__fs__write_file"]) {
      assert.equal(isWriteLikeToolName(n), true, n);
    }
    for (const n of ["Read", "Grep", "Glob", "Bash"]) assert.equal(isWriteLikeToolName(n), false, n);
  });

  test("Edit / MultiEdit / NotebookEdit 的目标路径都能提取", () => {
    const cwd = "/repo";
    const t = (tool_name, tool_input) => extractWriteTargets({ tool_name, tool_input, cwd }, cwd);
    assert.deepEqual(t("Edit", { file_path: "/repo/a.ts" }), ["/repo/a.ts"]);
    assert.deepEqual(t("MultiEdit", { file_path: "/repo/a.ts", edits: [] }), ["/repo/a.ts"]);
    assert.deepEqual(t("NotebookEdit", { notebook_path: "/repo/n.ipynb" }), ["/repo/n.ipynb"]);
  });
});
