/** 执行治理工具：仅决定进度差异，不访问文档、源码、网络或业务数据库。 */
export type ExecutionStep = "E00" | "E01" | "E02" | "E03" | "E04" | "E05" | "E06" | "E07" | "E08";
/** ClickUp 已存在的状态；不允许同步器自行创造或解释完成状态。 */
export type TaskStatus = "backlog" | "ready for codex" | "codex running" | "blocked" | "human required" | "review needed" | "done";
/** 主代理记录的票据进度；version 是该票自身的增量版本。 */
export interface ProgressTask {
  /** 已创建且读回确认的 ClickUp 票据 ID。 */
  id: string;
  /** 当前交付所属 E00 至 E08 的执行步骤。 */
  step: ExecutionStep;
  /** 本票据单调递增的进度版本，与全局 revision 区分。 */
  version: number;
  /** 主代理已裁决的业务优先级，同步器无权修改。 */
  priority: "urgent" | "high" | "normal" | "low";
  /** 主代理明确确认的远端目标状态。 */
  status: TaskStatus;
  /** 当前合同、实现、验证或验收环节的中文说明。 */
  stage: string;
  /** 主代理是否已经验收，自动化不得自行设为 true。 */
  accepted: boolean;
  /** 验收证据引用；不包含源码、日志或凭证正文。 */
  evidence: string[];
  /** 最多五行的进度说明，逐项只允许一行。 */
  summary: string[];
}
/** 每个票据最近一次读回确认的结果，不保存凭证或全量任务详情。 */
export interface SyncedTask {
  /** 状态与说明均已读回成功的票据版本。 */
  version: number;
  /** 最后读回成功的远端状态，用于冲突比较。 */
  status: TaskStatus;
  /** 本同步器管理的简短进度说明，不包含他人评论。 */
  note: string;
}
/** 只读取状态和本同步器管理的简短说明；其他字段不得覆盖。 */
export interface RemoteProgress {
  /** 刚从已知票据读回的实际状态。 */
  status: TaskStatus;
  /** 刚读回的同步器进度说明，缺失时为空字符串。 */
  note: string;
}
/** 单次动作可审计；read/write 的真实执行由受控 ClickUp 通道完成。 */
export type SyncDecision =
  | { kind: "noop" }
  | { kind: "read"; taskId: string }
  | { kind: "conflict"; taskId: string; reason: string }
  | { kind: "verified"; taskId: string; version: number }
  | { kind: "write"; taskId: string; status: TaskStatus; note: string; version: number };

/** 校验票据记录，避免未验收完成、无票实施、非法版本和长进度说明。 */
function validateTask(task: ProgressTask): void {
  if (!task.id.trim()) throw new Error("票据 ID 缺失");
  if (!Number.isSafeInteger(task.version) || task.version < 1) throw new Error("进度版本非法");
  if (!/^E0[0-8]$/.test(task.step)) throw new Error("执行步骤非法");
  if (!["backlog", "ready for codex", "codex running", "blocked", "human required", "review needed", "done"].includes(task.status)) throw new Error("任务状态非法");
  if (task.summary.length > 5 || task.summary.some((line) => /[\r\n]/.test(line))) throw new Error("进度说明最多五行");
  if (task.status === "done" && !task.accepted) throw new Error("任务尚未验收，不得完成");
  if (task.status === "done" && !task.evidence.some((item) => item.trim())) throw new Error("完成任务缺少验收证据");
}

/** 校验当前主线必须对应已开票记录；不会凭旧架构或源码重建缺失记录。 */
export function validateProgress(progress: { revision: number; currentStep: ExecutionStep; currentTicketId: string; tasks: ProgressTask[] }): void {
  if (!Number.isSafeInteger(progress.revision) || progress.revision < 1) throw new Error("执行记录版本非法");
  const ids = new Set<string>();
  for (const task of progress.tasks) {
    validateTask(task);
    if (ids.has(task.id)) throw new Error("重复票据 ID");
    ids.add(task.id);
  }
  const current = progress.tasks.find((task) => task.id === progress.currentTicketId);
  if (!current || current.step !== progress.currentStep) throw new Error("当前票据与执行步骤不匹配");
}

/**
 * 本地无增量则零远端请求；有增量先读回。基线冲突不覆盖，
 * 响应丢失后目标结果已存在则只确认，不再次写入或重复评论。
 */
export function prepareSync(task: ProgressTask, previous?: SyncedTask, remote?: RemoteProgress): SyncDecision {
  validateTask(task);
  const note = task.summary.join("\n");
  if (previous && previous.version > task.version) return { kind: "conflict", taskId: task.id, reason: "本地版本落后于已同步版本" };
  if (previous?.version === task.version) return { kind: "noop" };
  if (!remote) return { kind: "read", taskId: task.id };
  if (remote.status === task.status && remote.note === note) return { kind: "verified", taskId: task.id, version: task.version };
  if (!previous) return { kind: "conflict", taskId: task.id, reason: "缺少确认后的远端基线" };
  if (remote.status !== previous.status || remote.note !== previous.note) return { kind: "conflict", taskId: task.id, reason: "远端内容已改变，需主代理裁决" };
  return { kind: "write", taskId: task.id, status: task.status, note, version: task.version };
}

/** 状态与说明均读回成功才返回新同步版本；失败不改变输入记录。 */
export function acknowledgeSync(task: ProgressTask, remote: RemoteProgress): SyncedTask {
  validateTask(task);
  const note = task.summary.join("\n");
  if (remote.status !== task.status || remote.note !== note) throw new Error("远端读回不匹配，保留待同步版本");
  return { version: task.version, status: task.status, note };
}
