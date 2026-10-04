import { describe, expect, test } from "vitest";

import { acknowledgeSync, prepareSync, validateProgress, type ProgressTask, type SyncedTask } from "../../scripts/backend-v2/execution-progress.js";

/**
 * Expected：用户批准的统一计划第七节。L1 / unit_fake；只证明同步决策，
 * 不替代真实 ClickUp 写入与读回。普通任务数据属于该治理合同的构造场景。
 */
const task: ProgressTask = {
  id: "ticket-01", step: "E01", version: 2, priority: "high",
  status: "codex running", stage: "实现", accepted: false,
  evidence: ["test-report"], summary: ["目录合同已核验", "下一步：独立 Expected"],
};
const previous: SyncedTask = { version: 1, status: "backlog", note: "待承接" };

describe("执行进度同步：批准计划第七节 / unit_fake", () => {
  test("无本地增量时不请求远端、不写入", () => {
    expect(prepareSync(task, { ...previous, version: 2 })).toEqual({ kind: "noop" });
  });
  test("只有发生变化的票据需要远端核对", () => {
    expect(prepareSync(task, previous)).toEqual({ kind: "read", taskId: "ticket-01" });
  });
  test("远端基线一致才提出状态和五行内进度写入", () => {
    expect(prepareSync(task, previous, { status: "backlog", note: "待承接" })).toEqual({
      kind: "write", taskId: "ticket-01", status: "codex running", note: "目录合同已核验\n下一步：独立 Expected", version: 2,
    });
  });
  test("用户改变远端状态时不得覆盖", () => {
    expect(prepareSync(task, previous, { status: "human required", note: "待承接" }).kind).toBe("conflict");
  });
  test("用户改变进度说明时不得覆盖", () => {
    expect(prepareSync(task, previous, { status: "backlog", note: "用户新增说明" }).kind).toBe("conflict");
  });
  test("首响应丢失后，远端已是目标结果则读回确认，不重复写", () => {
    expect(prepareSync(task, previous, { status: "codex running", note: "目录合同已核验\n下一步：独立 Expected" }).kind).toBe("verified");
  });
  test("缺少已确认远端基线不能猜测并写入", () => {
    expect(prepareSync(task, undefined, { status: "backlog", note: "" }).kind).toBe("conflict");
  });
  test("未验收或没有证据的 done 不得同步", () => {
    expect(() => prepareSync({ ...task, status: "done" }, previous)).toThrow("验收");
    expect(() => prepareSync({ ...task, status: "done", accepted: true, evidence: [] }, previous)).toThrow("证据");
  });
  test("失败或读回不匹配不推进同步版本", () => {
    expect(() => acknowledgeSync(task, { status: "backlog", note: "待承接" })).toThrow("读回");
    expect(previous.version).toBe(1);
  });
  test("读回同时匹配状态和说明才推进版本", () => {
    expect(acknowledgeSync(task, { status: "codex running", note: "目录合同已核验\n下一步：独立 Expected" })).toEqual({
      version: 2, status: "codex running", note: "目录合同已核验\n下一步：独立 Expected",
    });
  });
  test("进度超过五行、非法版本、缺票据或重复票据均拒绝", () => {
    expect(() => prepareSync({ ...task, summary: ["1", "2", "3", "4", "5", "6"] }, previous)).toThrow("五行");
    expect(() => prepareSync({ ...task, version: 0 }, previous)).toThrow("版本");
    expect(() => validateProgress({ revision: 1, currentStep: "E01", currentTicketId: "missing", tasks: [task] })).toThrow("当前票据");
    expect(() => validateProgress({ revision: 1, currentStep: "E01", currentTicketId: task.id, tasks: [task, task] })).toThrow("重复");
  });
  test("旧本地版本不能覆盖已确认的新版本", () => {
    expect(prepareSync(task, { ...previous, version: 3 }).kind).toBe("conflict");
  });
});
