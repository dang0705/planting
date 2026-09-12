import { access } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  listenerPids,
  resolveE2eRuntime,
} from "../../../scripts/qa/resolve-e2e-runtime.mjs";
import { babolatArtifactProvider } from "./artifact-provider.mjs";

const require = createRequire(import.meta.url);

function check(name, ok, detail) {
  return { name, ok, detail };
}

export async function doctorBabolatAdapter() {
  const runtime = await resolveE2eRuntime();
  const checks = [];
  const cli = path.join(
    runtime.srcTaroRoot,
    "packages",
    "miniprogram-e2e",
    "src",
    "cli",
    "mp-e2e.mjs"
  );
  const appJson = path.join(runtime.artifactPath, "app.json");
  const projectConfig = path.join(runtime.artifactPath, "project.config.json");

  checks.push(check("cli_package", await exists(cli), cli));
  checks.push(
    check(
      "artifact_dir",
      await exists(runtime.artifactPath),
      runtime.artifactPath
    )
  );
  checks.push(check("artifact_app_json", await exists(appJson), appJson));
  checks.push(
    check("artifact_project_config", await exists(projectConfig), projectConfig)
  );
  checks.push(
    check(
      "magento_url",
      runtime.magentoConfigured,
      runtime.magentoConfigured ? "configured" : "MAGENTO_URL missing"
    )
  );
  checks.push(
    check(
      "automator_port",
      listenerPids(runtime.automatorPort).length > 0,
      `127.0.0.1:${runtime.automatorPort}`
    )
  );
  checks.push(
    check(
      "automator_peer",
      canResolveAutomator(runtime.srcTaroRoot),
      "miniprogram-automator"
    )
  );

  try {
    await babolatArtifactProvider.prepare({
      artifactPath: runtime.artifactPath,
    });
    checks.push(
      check(
        "sidecar_prepare",
        true,
        path.join(runtime.artifactPath, "mp-e2e.contract.json")
      )
    );
  } catch (error) {
    checks.push(
      check("sidecar_prepare", false, String(error?.message || error))
    );
  }

  const contractChecks = checks.filter(
    (item) => item.name !== "automator_port"
  );
  const failed = contractChecks.filter((item) => !item.ok);
  const automatorReady =
    checks.find((item) => item.name === "automator_port")?.ok === true;
  return {
    status: failed.length ? "blocked" : "passed",
    code: failed.length ? failed[0].name : "babolat_adapter_ready",
    liveReady: failed.length === 0 && automatorReady,
    portPolicy: "lease 9420; reuse daily DevTools; do not quit the host",
    artifactPath: runtime.artifactPath,
    checks,
  };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function canResolveAutomator(cwd) {
  try {
    require.resolve("miniprogram-automator", { paths: [cwd] });
    return true;
  } catch {
    return false;
  }
}
