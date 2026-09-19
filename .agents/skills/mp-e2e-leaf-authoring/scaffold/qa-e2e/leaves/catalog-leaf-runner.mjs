import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineLeaf } from "../../../packages/miniprogram-e2e/src/contracts/index.mjs";

const MAX_LOG_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 180_000;

/** @param {{id:string, config?:object}} entry */
export function createCatalogLeaf(entry) {
  const config = entry.config || {};
  const id = String(entry.id || "");
  const legacyScript = String(config.legacyScript || "");
  const dataMode =
    config.dataMode === "fixture_diagnostic"
      ? "fixture_diagnostic"
      : "live_real";
  const environment = normalizedEnvironment(config.environment);
  if (!legacyScript) {
    const error = new Error(
      `catalog leaf ${id} is missing config.legacyScript`
    );
    error.code = "mp_e2e_contract_invalid";
    throw error;
  }
  return defineLeaf(
    { id, dataMode, title: String(config.title || id) },
    (context) =>
      runCatalogLeaf({
        id,
        legacyScript,
        sourceDataMode: config.sourceDataMode,
        context,
        timeoutMs: config.timeoutMs,
        environment,
      })
  );
}

async function runCatalogLeaf({
  id,
  legacyScript,
  sourceDataMode,
  context,
  timeoutMs,
  environment,
}) {
  const projectRoot = path.resolve(String(context.session?.projectRoot || ""));
  const script = path.resolve(projectRoot, legacyScript);
  if (!projectRoot || !script.startsWith(`${projectRoot}${path.sep}`)) {
    const error = new Error(
      `catalog leaf ${id} has an invalid project script path`
    );
    error.code = "mp_e2e_contract_invalid";
    throw error;
  }
  await mkdir(context.evidenceDir, { recursive: true });
  const result = await spawnLeaf(script, {
    cwd: projectRoot,
    timeoutMs: positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS),
    env: {
      ...process.env,
      ...environment,
      MINIPROGRAM_AUTOMATOR_WS: String(context.session?.wsEndpoint || ""),
      MP_PROJECT_PATH: String(context.session?.runtimeProjectPath || ""),
      MP_AUTOMATOR_PORT: String(
        context.session?.runtimeProof?.automator_port || ""
      ),
      QA_RUNTIME_PROJECT_SNAPSHOT: "1",
      QA_RUNTIME_SESSION_ID: String(context.session?.runtimeSessionId || ""),
      QA_CATALOG_DATA_MODE: String(
        sourceDataMode ||
          (context.dataMode === "fixture_diagnostic"
            ? "fixture_diagnostic"
            : "automator_live_real_api")
      ),
      QA_AUTOMATOR_LIVE_LEAF: id,
      QA_AUTOMATOR_RUNTIME_PROOF: JSON.stringify(
        context.session?.runtimeProof || {}
      ),
      E2E_ARTIFACT_DIR: context.evidenceDir,
    },
  });
  const execution = {
    id,
    script: legacyScript,
    sourceDataMode: sourceDataMode || null,
    dataMode: context.dataMode,
    code: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  const legacyReport = parseJson(result.stdout);
  if (legacyReport) {
    execution.legacyReport = summarizeLegacyReport(legacyReport);
  }
  const executionPath = path.join(
    context.evidenceDir,
    "catalog-leaf-execution.json"
  );
  await writeFile(executionPath, `${JSON.stringify(execution, null, 2)}\n`);
  if (result.error || result.timedOut || result.code !== 0) {
    const legacyFailure =
      legacyReport?.status === "failed"
        ? legacyReport.failures?.[0]?.detail ||
          legacyReport.assertions?.find((item) => item?.passed === false)
            ?.detail
        : null;
    const error = new Error(
      result.error?.message ||
        legacyFailure ||
        `catalog leaf ${id} failed with exit ${result.code ?? "unknown"}`
    );
    error.code = result.timedOut
      ? "mp_e2e_script_leaf_timeout"
      : legacyReport?.status === "failed"
        ? "mp_e2e_product_leaf_failed"
        : "mp_e2e_script_leaf_failed";
    error.details = {
      executionPath,
      code: result.code,
      signal: result.signal,
      legacyReport: execution.legacyReport || null,
    };
    throw error;
  }
  return {
    status: "passed",
    assertions: [
      {
        name: "catalog_leaf_exit",
        passed: true,
        evidence: { executionPath, code: result.code },
      },
    ],
  };
}

function parseJson(value) {
  try {
    return JSON.parse(String(value || "").trim());
  } catch {
    return null;
  }
}

function summarizeLegacyReport(report) {
  return {
    status: report.status || null,
    channel: report.channel || null,
    assertions: Array.isArray(report.assertions)
      ? report.assertions.map((item) => ({
          name: item.name,
          passed: item.passed === true,
        }))
      : [],
    failures: Array.isArray(report.failures) ? report.failures.slice(0, 3) : [],
    evidencePaths: Array.isArray(report.evidence_paths)
      ? report.evidence_paths
      : [],
  };
}

function normalizedEnvironment(value) {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("catalog leaf environment must be a string map");
    error.code = "mp_e2e_contract_invalid";
    throw error;
  }
  const entries = Object.entries(value);
  for (const [key, entry] of entries) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || typeof entry !== "string") {
      const error = new Error(
        "catalog leaf environment must contain uppercase string values"
      );
      error.code = "mp_e2e_contract_invalid";
      throw error;
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function spawnLeaf(script, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const append = (value, chunk) => {
      if (value.length >= MAX_LOG_BYTES) {
        return value;
      }
      return `${value}${String(chunk)}`.slice(0, MAX_LOG_BYTES);
    };
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr });
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) =>
      finish({ code: null, signal: null, error, timedOut: false })
    );
    child.on("close", (code, signal) =>
      finish({ code, signal, error: null, timedOut: false })
    );
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ code: null, signal: "SIGTERM", error: null, timedOut: true });
    }, timeoutMs);
  });
}
