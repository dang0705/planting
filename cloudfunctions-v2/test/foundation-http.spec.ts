import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const 服务地址 = "http://127.0.0.1:9000";
/**
 * Expected 来源：`http.json_body_limit_bytes` 已冻结为 1 MiB（1,048,576 字节）。
 * 使用 ASCII 字符，确保字符串长度与 UTF-8 实际字节数一致，避免测试本身误判边界。
 */
const 普通Json请求体上限字节数 = 1_048_576;
const 零字节 = 0;
const 一字节 = 1;
let 服务进程: ChildProcessWithoutNullStreams | undefined;
let 服务输出 = "";

/** 构造总 UTF-8 字节数精确等于目标值的合法 JSON，供请求体边界测试使用。 */
function 构造指定字节数Json请求体(目标字节数: number): string {
  const 固定前缀 = '{"message":"';
  const 固定后缀 = '"}';
  const 填充字节数 = 目标字节数 - Buffer.byteLength(固定前缀) - Buffer.byteLength(固定后缀);
  if (填充字节数 < 零字节) {
    throw new Error("目标请求体字节数小于 JSON 固定结构");
  }
  return `${固定前缀}${"x".repeat(填充字节数)}${固定后缀}`;
}

/** 在有界时间内等待真实 HTTP 端口就绪，不使用模拟服务器。 */
async function 等待服务就绪(): Promise<void> {
  const 截止时间 = Date.now() + 5_000;
  while (Date.now() < 截止时间) {
    if (服务进程?.exitCode !== null) {
      throw new Error(`后端 v2 基线服务提前退出，退出码：${服务进程?.exitCode ?? "未知"}`);
    }
    try {
      const 响应 = await fetch(`${服务地址}/health`);
      if (响应.ok) { return; }
    } catch {
      // 启动窗口内端口未就绪是预期状态，继续有界轮询。
    }
    await wait(50);
  }
  throw new Error("后端 v2 基线服务未在 5 秒内监听 9000 端口");
}

beforeAll(async () => {
  服务进程 = spawn(process.execPath, ["dist/server.cjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TENCENTCLOUD_SECRETKEY: "不得出现在响应中",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  服务进程.stdout.on("data", (分块: Buffer) => {
    服务输出 += 分块.toString("utf8");
  });
  服务进程.stderr.on("data", (分块: Buffer) => {
    服务输出 += 分块.toString("utf8");
  });
  await 等待服务就绪();
});

afterAll(async () => {
  if (!服务进程 || 服务进程.exitCode !== null) { return; }
  服务进程.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => 服务进程?.once("exit", () => resolve())),
    wait(2_000).then(() => undefined),
  ]);
});

describe("CloudBase Node.js 22 HTTP 函数构建基线", () => {
  // Expected 来源：Master Plan 3.2/3.3 与 CloudBase HTTP 函数 9000 端口合同。
  test("健康检查经真实 9000 端口返回固定白名单响应", async () => {
    const 响应 = await fetch(`${服务地址}/health`, {
      // HTTP 请求头只允许 ByteString；用 ASCII 哨兵验证 CloudBase 上下文不会回显。
      headers: { "x-cloudbase-context": "sensitive-context-must-not-leak" },
    });
    const 响应文本 = await 响应.text();

    expect(响应.status).toBe(200);
    expect(JSON.parse(响应文本)).toEqual({
      ok: true,
      service: "qinghuazhi-backend-v2-foundation",
    });
    expect(响应文本).not.toContain("sensitive-context-must-not-leak");
    expect(响应文本).not.toContain("不得出现在响应中");
  });

  // Common scene U3：路由存在但方法非法时必须明确拒绝。
  test("已知路由的非法方法返回 405", async () => {
    const 响应 = await fetch(`${服务地址}/health`, { method: "POST" });
    expect(响应.status).toBe(405);
    await expect(响应.json()).resolves.toEqual({
      error: { type: "METHOD_NOT_ALLOWED", message: "请求方法不受支持" },
    });
  });

  // Common scene U3：未知路由不得落入万能处理器。
  test("未知路由返回 404", async () => {
    const 响应 = await fetch(`${服务地址}/unknown`);
    expect(响应.status).toBe(404);
    await expect(响应.json()).resolves.toEqual({
      error: { type: "NOT_FOUND", message: "请求路由不存在" },
    });
  });

  // Expected 来源：Master Plan 的请求大小/MIME/AJV DTO 固定处理顺序。
  test("合法 JSON DTO 通过 AJV 校验且不回显请求体", async () => {
    const 响应 = await fetch(`${服务地址}/probe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "构建基线" }),
    });
    expect(响应.status).toBe(200);
    await expect(响应.json()).resolves.toEqual({ ok: true, accepted: true });
  });

  // Common scene U1/U3：空 DTO 与非法 DTO 都必须在边界层被拒绝。
  test("空 JSON DTO 返回稳定 400 错误", async () => {
    const 响应 = await fetch(`${服务地址}/probe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(响应.status).toBe(400);
    await expect(响应.json()).resolves.toEqual({
      error: { type: "VALIDATION_FAILED", message: "请求参数不合法" },
    });
  });

  // Common scene U3：非 JSON MIME 不得进入 DTO 处理。
  test("非 JSON MIME 返回 415", async () => {
    const 响应 = await fetch(`${服务地址}/probe`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(响应.status).toBe(415);
  });

  // Expected 来源：已确认的 http.json_body_limit_bytes；U2 边界的恰好上限不能被误拒绝。
  test("恰好 1 MiB 的 JSON 越过大小限制并进入 DTO 校验", async () => {
    const 请求体 = 构造指定字节数Json请求体(普通Json请求体上限字节数);
    expect(Buffer.byteLength(请求体)).toBe(普通Json请求体上限字节数);

    const 响应 = await fetch(`${服务地址}/probe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: 请求体,
    });

    expect(响应.status).toBe(400);
    await expect(响应.json()).resolves.toEqual({
      error: { type: "VALIDATION_FAILED", message: "请求参数不合法" },
    });
  });

  // Expected 来源：已确认的 http.json_body_limit_bytes；U2 边界的超 1 字节必须在解析前拒绝。
  test("超过 1 MiB 的 JSON 在解析前返回 413", async () => {
    const 请求体 = 构造指定字节数Json请求体(普通Json请求体上限字节数 + 一字节);
    expect(Buffer.byteLength(请求体)).toBe(普通Json请求体上限字节数 + 一字节);

    const 响应 = await fetch(`${服务地址}/probe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: 请求体,
    });
    expect(响应.status).toBe(413);
    await expect(响应.json()).resolves.toEqual({
      error: { type: "PAYLOAD_TOO_LARGE", message: "请求体超过允许大小" },
    });
  });

  // Expected 来源：HTTP 固定处理顺序；MIME 拒绝必须先于请求体读取与 JSON 解析。
  test("超限非 JSON 请求仍优先返回 415", async () => {
    const 响应 = await fetch(`${服务地址}/probe`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x".repeat(普通Json请求体上限字节数 + 一字节),
    });

    expect(响应.status).toBe(415);
    await expect(响应.json()).resolves.toEqual({
      error: { type: "UNSUPPORTED_MEDIA_TYPE", message: "仅支持 JSON 请求" },
    });
  });

  // Common scene U7：路径、查询、请求头、请求体和环境变量均不得进入结构化日志。
  test("结构化日志不记录来自请求或运行环境的敏感原文", async () => {
    const 敏感标记 = "secret-user-content-9f3a";
    await fetch(`${服务地址}/${敏感标记}?token=${敏感标记}`, {
      headers: { authorization: `Bearer ${敏感标记}` },
    });
    await wait(20);

    expect(服务输出).not.toContain(敏感标记);
    expect(服务输出).not.toContain("不得出现在响应中");
  });
});
