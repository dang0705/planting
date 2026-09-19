import { randomUUID } from "node:crypto";
import { connectWechatAutomator } from "../../../packages/miniprogram-e2e/src/platforms/wechat/index.mjs";
import {
  listenerPids,
  resolveE2eRuntime,
} from "../../../scripts/qa/resolve-e2e-runtime.mjs";
import { createRuntimeHttpClient } from "./runtime-http-client.mjs";
import { verifyBabolatLiveRuntime } from "./babolat-live-verifier.mjs";

const CONNECT_TIMEOUT_MS = 45_000;

async function waitFor(task, timeoutMs, name) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await task();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const error = new Error(`${name} timed out after ${timeoutMs}ms`);
  error.code = "babolat_session_timeout";
  error.cause = lastError;
  throw error;
}

export const babolatApplicationSessionProvider = {
  async start({ artifact, evidenceDir, profileLease }) {
    if (profileLease?.kind !== "wechat-reused-daily-devtools") {
      return {
        status: "blocked",
        code: "babolat_qa_profile_lease_missing",
        reason: "Babolat sessions reuse the daily DevTools automator on 9420",
        evidence: [],
      };
    }
    const runtime = await resolveE2eRuntime();
    const id = `babolat-${Date.now()}-${randomUUID()}`;
    let connected = null;
    try {
      if (listenerPids(runtime.automatorPort).length === 0) {
        const error = new Error(
          `WeChat Automator is not listening on ${runtime.automatorPort}`
        );
        error.code = "babolat_automator_port_unavailable";
        throw error;
      }
      if (!runtime.magentoConfigured) {
        const error = new Error(
          "MAGENTO_URL is not configured for the Babolat runtime probe"
        );
        error.code = "babolat_runtime_magento_url_missing";
        throw error;
      }
      connected = await waitFor(
        async () => {
          try {
            return await Promise.race([
              connectWechatAutomator({ wsEndpoint: runtime.wsEndpoint }),
              new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
            ]);
          } catch {
            return false;
          }
        },
        CONNECT_TIMEOUT_MS,
        "WeChat Automator endpoint"
      );
      const page = await waitFor(
        async () => {
          const current = await Promise.race([
            connected.miniProgram.currentPage().catch(() => null),
            new Promise((resolve) => setTimeout(() => resolve(null), 2_000)),
          ]);
          return current?.path ? current : false;
        },
        CONNECT_TIMEOUT_MS,
        "WeChat compiled artifact page"
      );
      const verification = await verifyBabolatLiveRuntime(
        connected.miniProgram,
        {
          projectPath: artifact.root,
          automatorPort: runtime.automatorPort,
          probeUrl: runtime.probeUrl,
        }
      );
      return {
        status: "ready",
        miniProgram: connected.miniProgram,
        wsEndpoint: runtime.wsEndpoint,
        runtimeProjectPath: artifact.root,
        runtimeSessionId: id,
        projectRoot: runtime.srcTaroRoot,
        runtimeProof: {
          project_identity_verified: verification.sidecar.verified === true,
          observed_project_path: artifact.root,
          automation_listener_pid:
            verification.ownership.automator_listener_pids[0] || null,
          automator_port: runtime.automatorPort,
          control_port: null,
          control_port_verified: false,
        },
        runtimeHttpClient: createRuntimeHttpClient(connected.miniProgram),
        async health() {
          if (listenerPids(runtime.automatorPort).length === 0) {
            return {
              healthy: false,
              reason: "Automator listener is no longer alive",
            };
          }
          try {
            const current = await Promise.race([
              connected.miniProgram.currentPage(),
              new Promise((resolve) => setTimeout(() => resolve(null), 2_000)),
            ]);
            return current?.path
              ? { healthy: true, page: current.path }
              : {
                  healthy: false,
                  reason: "currentPage did not return a route",
                };
          } catch (error) {
            return { healthy: false, reason: String(error?.message || error) };
          }
        },
        evidence: [
          {
            type: "reused_automator",
            value: { wsEndpoint: runtime.wsEndpoint, artifact: artifact.root },
          },
          {
            type: "compiled_artifact_page",
            value: { path: page.path || null },
          },
          { type: "live_runtime_verification", value: verification },
          { type: "artifact", value: artifact.root },
          { type: "session_evidence_dir", value: evidenceDir },
        ],
        async stop() {
          await connected?.stop?.().catch(() => {});
          return {
            status: "disconnected",
            session_id: id,
            artifact: artifact.root,
            dailyDevToolsLeftRunning: true,
          };
        },
      };
    } catch (error) {
      await connected?.stop?.().catch(() => {});
      return {
        status: "blocked",
        code: error?.code || "babolat_native_devtools_start_failed",
        reason: error?.message || "Babolat automator session failed",
        evidence: [
          { type: "native_session_failure", value: error?.details || null },
        ],
      };
    }
  },
};
