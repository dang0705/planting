import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import Ajv, { type JSONSchemaType } from "ajv";
import pino from "pino";

/**
 * P0 只建立可部署、可测试的 HTTP 基线，不在此处承载任何业务领域规则。
 * 后续六个业务云函数复用相同的接入顺序，但必须各自拥有独立入口和领域实现。
 */
const 服务端口 = 9000;
/**
 * 普通 JSON 请求体上限，来自已确认配置项 `http.json_body_limit_bytes`。
 * 当前 P1 合同冻结为 1,048,576 字节；变更必须先更新合同与配置目录，再同步此接入层常量。
 */
const 请求体上限字节数 = 1_048_576;

type 探针请求 = {
  /** 仅用于证明 JSON DTO 接收链路生效；必须是 1 至 32 个字符的字符串，不持久化、不记日志且不回显。 */
  message: string;
};

type 公开错误码 =
  | "VALIDATION_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE";

const 探针请求结构: JSONSchemaType<探针请求> = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 32 },
  },
};

const dto校验器 = new Ajv({ allErrors: true }).compile(探针请求结构);

/** 日志只记录固定白名单字段，禁止记录请求头、请求体、凭证和运行环境。 */
const 日志 = pino({
  base: null,
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: ["req.headers", "request.headers", "body", "env"], censor: "[已脱敏]" },
});

function 写入Json(响应: ServerResponse, 状态码: number, 内容: unknown): void {
  const 正文 = JSON.stringify(内容);
  响应.writeHead(状态码, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(正文),
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  响应.end(正文);
}

function 写入公开错误(响应: ServerResponse, 状态码: number, type: 公开错误码, message: string): void {
  // http-api/v1 固定公开错误只有 type/message；不得泄露内部错误码或追踪信息。
  写入Json(响应, 状态码, { error: { type, message } });
}

/** 读取单值请求头；重复请求头只取 Node 已规范化后的首项。 */
function requestHeader(请求: IncomingMessage, 名称: string): string | undefined {
  const 值 = 请求.headers[名称];
  return Array.isArray(值) ? 值[0] : 值;
}

/**
 * 在 JSON 解析前执行字节上限检查。超过上限时继续排空连接中的数据，
 * 但不再缓存正文，从而避免攻击者用大请求占用进程内存。
 */
async function 读取受限请求体(请求: IncomingMessage): Promise<Buffer | null> {
  const 已声明长度 = Number(requestHeader(请求, "content-length") ?? "0");
  if (Number.isFinite(已声明长度) && 已声明长度 > 请求体上限字节数) {
    请求.resume();
    return null;
  }

  const 分块: Buffer[] = [];
  let 总字节数 = 0;
  for await (const 原始分块 of 请求) {
    const 分块缓冲区 = Buffer.isBuffer(原始分块) ? 原始分块 : Buffer.from(原始分块);
    总字节数 += 分块缓冲区.length;
    if (总字节数 > 请求体上限字节数) {
      请求.resume();
      return null;
    }
    分块.push(分块缓冲区);
  }
  return Buffer.concat(分块);
}

function 是Json请求(请求: IncomingMessage): boolean {
  const 类型 = requestHeader(请求, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return 类型 === "application/json";
}

async function 处理探针请求(请求: IncomingMessage, 响应: ServerResponse): Promise<void> {
  if (!是Json请求(请求)) {
    请求.resume();
    写入公开错误(响应, 415, "UNSUPPORTED_MEDIA_TYPE", "仅支持 JSON 请求");
    return;
  }

  const 请求体 = await 读取受限请求体(请求);
  if (请求体 === null) {
    写入公开错误(响应, 413, "PAYLOAD_TOO_LARGE", "请求体超过允许大小");
    return;
  }

  let 待校验数据: unknown;
  try {
    待校验数据 = JSON.parse(请求体.toString("utf8"));
  } catch {
    写入公开错误(响应, 400, "VALIDATION_FAILED", "请求参数不合法");
    return;
  }

  if (!dto校验器(待校验数据)) {
    写入公开错误(响应, 400, "VALIDATION_FAILED", "请求参数不合法");
    return;
  }

  // P0 探针只证明输入经过 DTO 校验，不保存、记录或回显用户输入。
  写入Json(响应, 200, { ok: true, accepted: true });
}

const 服务 = createServer(async (请求, 响应) => {
  const 开始时间 = Date.now();
  const 方法 = 请求.method ?? "UNKNOWN";
  const 路径 = new URL(请求.url ?? "/", "http://127.0.0.1").pathname;
  // 日志只使用有限路由标签，绝不记录可能包含用户输入的原始 URL 或路径。
  const 日志路由 = 路径 === "/health" ? "health" : 路径 === "/probe" ? "probe" : "unmatched";

  try {
    if (方法 === "OPTIONS") {
      响应.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      响应.end();
      return;
    }

    if (路径 === "/health") {
      if (方法 !== "GET") {
        请求.resume();
        写入公开错误(响应, 405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
        return;
      }
      写入Json(响应, 200, { ok: true, service: "qinghuazhi-backend-v2-foundation" });
      return;
    }

    if (路径 === "/probe") {
      if (方法 !== "POST") {
        请求.resume();
        写入公开错误(响应, 405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
        return;
      }
      await 处理探针请求(请求, 响应);
      return;
    }

    请求.resume();
    写入公开错误(响应, 404, "NOT_FOUND", "请求路由不存在");
  } catch {
    // 内部异常只进入脱敏结构化日志；公开响应不包含堆栈、请求或凭证。
    日志.error({ event: "request_failed", method: 方法, route: 日志路由 }, "HTTP 请求处理失败");
    if (!响应.headersSent) {
      写入Json(响应, 500, {
        error: { type: "INTERNAL_ERROR", message: "服务暂时不可用" },
      });
    } else {
      响应.end();
    }
  } finally {
    日志.info(
      {
        event: "request_completed",
        method: 方法,
        route: 日志路由,
        status: 响应.statusCode,
        durationMs: Date.now() - 开始时间,
      },
      "HTTP 请求完成",
    );
  }
});

服务.listen(服务端口, "0.0.0.0", () => {
  日志.info({ event: "server_started", port: 服务端口 }, "后端 v2 HTTP 构建基线已启动");
});

function 平滑停止(信号: NodeJS.Signals): void {
  日志.info({ event: "server_stopping", signal: 信号 }, "后端 v2 HTTP 构建基线正在停止");
  服务.close((错误) => {
    if (错误) {
      日志.error({ event: "server_stop_failed" }, "后端 v2 HTTP 构建基线停止失败");
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => 平滑停止("SIGTERM"));
process.once("SIGINT", () => 平滑停止("SIGINT"));
