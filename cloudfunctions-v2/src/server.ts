import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import Ajv, { type JSONSchemaType } from "ajv";
import pino from "pino";

import { readLogLevel } from "./configuration/environment.js";
import { RUNTIME_PARAMETERS } from "./configuration/runtime-parameters.js";

/**
 * P0 只建立可部署、可测试的 HTTP 基线，不在此处承载任何业务领域规则。
 * 后续六个业务云函数复用相同的接入顺序，但必须各自拥有独立入口和领域实现。
 */
const servicePort = 9000;
/**
 * 普通 JSON 请求体上限，来自已确认配置项 `http.json_body_limit_bytes`（取值只在代码层注册表定义）。
 * 变更必须先更新合同与配置目录，再同步注册表。
 */
const requestBodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value;

type ProbeRequest = {
  /** 仅用于证明 JSON DTO 接收链路生效；必须是 1 至 32 个字符的字符串，不持久化、不记日志且不回显。 */
  message: string;
};

type PublicErrorCode =
  | "VALIDATION_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE";

const probeRequestShape: JSONSchemaType<ProbeRequest> = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 32 },
  },
};

const dtoValidator = new Ajv({ allErrors: true }).compile(probeRequestShape);

/** 日志只记录固定白名单字段，禁止记录请求头、请求体、凭证和运行环境。 */
const logger = pino({
  base: null,
  level: readLogLevel(process.env),
  redact: { paths: ["req.headers", "request.headers", "body", "env"], censor: "[已脱敏]" },
});

function writeJson(response: ServerResponse, statusCode: number, content: unknown): void {
  const body = JSON.stringify(content);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(body);
}

function writePublicError(response: ServerResponse, statusCode: number, type: PublicErrorCode, message: string): void {
  // http-api/v1 固定公开错误只有 type/message；不得泄露内部错误码或追踪信息。
  writeJson(response, statusCode, { error: { type, message } });
}

/** 读取单值请求头；重复请求头只取 Node 已规范化后的首项。 */
function requestHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 在 JSON 解析前执行字节上限检查。超过上限时继续排空连接中的数据，
 * 但不再缓存正文，从而避免攻击者用大请求占用进程内存。
 */
async function readRestrictedRequestBody(request: IncomingMessage): Promise<Buffer | null> {
  const declaredLength = Number(requestHeader(request, "content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > requestBodyLimitBytes) {
    request.resume();
    return null;
  }

  const chunk: Buffer[] = [];
  let totalBytes = 0;
  for await (const rawChunk of request) {
    const chunkBuffer = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    totalBytes += chunkBuffer.length;
    if (totalBytes > requestBodyLimitBytes) {
      request.resume();
      return null;
    }
    chunk.push(chunkBuffer);
  }
  return Buffer.concat(chunk);
}

function isJsonRequest(request: IncomingMessage): boolean {
  const type = requestHeader(request, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/json";
}

async function handleProbeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isJsonRequest(request)) {
    request.resume();
    writePublicError(response, 415, "UNSUPPORTED_MEDIA_TYPE", "仅支持 JSON 请求");
    return;
  }

  const requestBody = await readRestrictedRequestBody(request);
  if (requestBody === null) {
    writePublicError(response, 413, "PAYLOAD_TOO_LARGE", "请求体超过允许大小");
    return;
  }

  let pendingValidateData: unknown;
  try {
    pendingValidateData = JSON.parse(requestBody.toString("utf8"));
  } catch {
    writePublicError(response, 400, "VALIDATION_FAILED", "请求参数不合法");
    return;
  }

  if (!dtoValidator(pendingValidateData)) {
    writePublicError(response, 400, "VALIDATION_FAILED", "请求参数不合法");
    return;
  }

  // P0 探针只证明输入经过 DTO 校验，不保存、记录或回显用户输入。
  writeJson(response, 200, { ok: true, accepted: true });
}

const service = createServer(async (request, response) => {
  const beginTime = Date.now();
  const method = request.method ?? "UNKNOWN";
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  // 日志只使用有限路由标签，绝不记录可能包含用户输入的原始 URL 或路径。
  const logRoute = path === "/health" ? "health" : path === "/probe" ? "probe" : "unmatched";

  try {
    if (method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      response.end();
      return;
    }

    if (path === "/health") {
      if (method !== "GET") {
        request.resume();
        writePublicError(response, 405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
        return;
      }
      writeJson(response, 200, { ok: true, service: "qinghuazhi-backend-v2-foundation" });
      return;
    }

    if (path === "/probe") {
      if (method !== "POST") {
        request.resume();
        writePublicError(response, 405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
        return;
      }
      await handleProbeRequest(request, response);
      return;
    }

    request.resume();
    writePublicError(response, 404, "NOT_FOUND", "请求路由不存在");
  } catch {
    // 内部异常只进入脱敏结构化日志；公开响应不包含堆栈、请求或凭证。
    logger.error({ event: "request_failed", method: method, route: logRoute }, "HTTP 请求处理失败");
    if (!response.headersSent) {
      writeJson(response, 500, {
        error: { type: "INTERNAL_ERROR", message: "服务暂时不可用" },
      });
    } else {
      response.end();
    }
  } finally {
    logger.info(
      {
        event: "request_completed",
        method: method,
        route: logRoute,
        status: response.statusCode,
        durationMs: Date.now() - beginTime,
      },
      "HTTP 请求完成",
    );
  }
});

service.listen(servicePort, "0.0.0.0", () => {
  logger.info({ event: "server_started", port: servicePort }, "后端 v2 HTTP 构建基线已启动");
});

function gracefulShutdown(signal: NodeJS.Signals): void {
  logger.info({ event: "server_stopping", signal: signal }, "后端 v2 HTTP 构建基线正在停止");
  service.close((error) => {
    if (error) {
      logger.error({ event: "server_stop_failed" }, "后端 v2 HTTP 构建基线停止失败");
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));
