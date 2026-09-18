import { readFile } from "node:fs/promises";
import path from "node:path";
import { listenerPids } from "../../../scripts/qa/resolve-e2e-runtime.mjs";

async function assertRuntimeArtifactSidecar(projectPath) {
  const sidecarPath = path.join(
    String(projectPath || ""),
    "mp-e2e.contract.json"
  );
  let contract;
  try {
    contract = JSON.parse(await readFile(sidecarPath, "utf8"));
  } catch (cause) {
    const error = new Error(
      "compiled artifact does not contain the e2e sidecar"
    );
    error.code = "babolat_runtime_sidecar_missing";
    error.cause = cause;
    throw error;
  }
  if (contract?.contractVersion !== 1 || contract?.adapter?.id !== "babolat") {
    const error = new Error(
      "compiled artifact contains an invalid e2e sidecar"
    );
    error.code = "babolat_runtime_sidecar_invalid";
    error.details = { sidecarPath, adapterId: contract?.adapter?.id || null };
    throw error;
  }
  return {
    verified: true,
    path: sidecarPath,
    sha_contract_version: contract.contractVersion,
  };
}

function assertAutomatorListener(automatorPort) {
  const automatorOwners = listenerPids(automatorPort);
  if (automatorOwners.length === 0) {
    const error = new Error(
      `WeChat Automator is not listening on ${automatorPort}`
    );
    error.code = "babolat_automator_port_unavailable";
    error.details = { automatorPort, automatorOwners };
    throw error;
  }
  return {
    verified: true,
    automator_port: automatorPort,
    automator_listener_pids: automatorOwners,
  };
}

async function verifyMagentoWxRequest(miniProgram, requestUrl) {
  if (!requestUrl) {
    const error = new Error(
      "MAGENTO_URL is required for the Babolat runtime probe"
    );
    error.code = "babolat_runtime_magento_url_missing";
    throw error;
  }
  const slot = `__mpE2eLiveRequest_${Date.now()}_${process.pid}`;
  await miniProgram.evaluate(
    function (resultSlot, url) {
      globalThis[resultSlot] = { state: "pending" };
      const finish = function (value) {
        const next = { state: "done" };
        next.ok = value.ok;
        next.statusCode = value.statusCode;
        next.error = value.error;
        globalThis[resultSlot] = next;
      };
      wx.request({
        url: url,
        method: "GET",
        header: { Accept: "application/json" },
        success(response) {
          finish({
            ok: Number(response.statusCode) === 200,
            statusCode: response.statusCode || null,
            error: null,
          });
        },
        fail(error) {
          finish({
            ok: false,
            statusCode: null,
            error: error.errMsg || String(error),
          });
        },
      });
    },
    slot,
    requestUrl
  );
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await miniProgram.evaluate(function (resultSlot) {
      return globalThis[resultSlot] || null;
    }, slot);
    if (result?.state === "done") {
      if (!result.ok) {
        const error = new Error(
          result.error || "Magento wx.request probe failed"
        );
        error.code = "babolat_runtime_wx_request_failed";
        error.details = {
          probePath: "/rest/default/V1/directory/currency",
          statusCode: result.statusCode,
        };
        throw error;
      }
      return {
        verified: true,
        probe_path: "/rest/default/V1/directory/currency",
        status_code: result.statusCode,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const error = new Error("Magento wx.request probe timed out");
  error.code = "babolat_runtime_wx_request_timeout";
  throw error;
}

export async function verifyBabolatLiveRuntime(
  miniProgram,
  { projectPath, automatorPort = 9420, probeUrl } = {}
) {
  const sidecar = await assertRuntimeArtifactSidecar(projectPath);
  const ownership = assertAutomatorListener(automatorPort);
  const page = await Promise.race([
    miniProgram.currentPage().catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);
  if (!page) {
    const error = new Error("Automator did not expose a current page");
    error.code = "babolat_runtime_page_unavailable";
    throw error;
  }
  const runtimeRequest = await verifyMagentoWxRequest(miniProgram, probeUrl);
  return {
    sidecar,
    ownership,
    runtime_request: runtimeRequest,
    page_path: page.path || null,
  };
}
