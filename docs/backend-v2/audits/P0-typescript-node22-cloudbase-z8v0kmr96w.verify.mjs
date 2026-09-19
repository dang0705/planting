#!/usr/bin/env node
/**
 * P0 构建门禁：独立 Expected 来自 ticket 验收与 CloudBase 官方运行时页面。
 * 仅检查本地可审计证据；不读取业务源码、不安装依赖、不调用云端。
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../..");
const readJsonIfPresent = (relativePath) => {
  const absolutePath = resolve(projectRoot, relativePath);
  return existsSync(absolutePath)
    ? JSON.parse(readFileSync(absolutePath, "utf8"))
    : {};
};
const officialReference = readFileSync(
  resolve(projectRoot, ".codex/skills/cloudbase/references/cloud-functions/references/http-functions.md"),
  "utf8",
);
// v2 仅允许在影子根目录实施，不能扫描或复用旧 cloudfunctions/**。
const v2FunctionRoot = resolve(projectRoot, "cloudfunctions-v2");
const packageJson = readJsonIfPresent("cloudfunctions-v2/package.json");
const packageLock = readJsonIfPresent("cloudfunctions-v2/package-lock.json");
const tsconfig = readJsonIfPresent("cloudfunctions-v2/tsconfig.json");
const deploymentManifest = readJsonIfPresent("cloudfunctions-v2/package-manifest.json");
const directDev = packageJson.devDependencies ?? {};
const directProd = packageJson.dependencies ?? {};
const v2BootstrapPath = resolve(v2FunctionRoot, "scf_bootstrap");

const exactVersion = (dependencies, name, expected) => dependencies[name] === expected;

const checks = {
  cloudbaseNode22Runtime: /`Nodejs22\.21`/u.test(officialReference),
  cloudbaseNode22Bootstrap: /\/var\/lang\/node22\/bin\/node/u.test(officialReference),
  isolatedPackageLock: packageLock.lockfileVersion === 3,
  explicitTypescript: exactVersion(directDev, "typescript", "5.9.3"),
  explicitNode22Types: exactVersion(directDev, "@types/node", "22.20.3"),
  explicitEsbuild: exactVersion(directDev, "esbuild", "0.28.2"),
  explicitVitest: exactVersion(directDev, "vitest", "4.1.11"),
  explicitOxlint: exactVersion(directDev, "oxlint", "1.50.0"),
  explicitOxfmt: exactVersion(directDev, "oxfmt", "0.35.0"),
  explicitPino: exactVersion(directProd, "pino", "10.3.1"),
  explicitAjvProduction: exactVersion(directProd, "ajv", "8.20.0"),
  strictBackendTsconfig: tsconfig.compilerOptions?.strict === true,
  node16BackendTsconfig:
    tsconfig.compilerOptions?.module === "Node16" &&
    tsconfig.compilerOptions?.moduleResolution === "Node16",
  v2FunctionRoot: existsSync(v2FunctionRoot),
  serverCjsArtifact: existsSync(resolve(v2FunctionRoot, "dist/server.cjs")),
  node22ScfBootstrap:
    existsSync(v2BootstrapPath) &&
    readFileSync(v2BootstrapPath, "utf8").includes("/var/lang/node22/bin/node"),
  deploymentManifest:
    deploymentManifest.runtime === "Nodejs22.21" &&
    deploymentManifest.entrypoint === "dist/server.cjs" &&
    deploymentManifest.bootstrap === "scf_bootstrap" &&
    Array.isArray(deploymentManifest.files) &&
    deploymentManifest.files.includes("dist/server.cjs") &&
    deploymentManifest.files.includes("scf_bootstrap") &&
    deploymentManifest.files.includes("package-manifest.json") &&
    deploymentManifest.files.every((file) => !file.startsWith("src/") && !file.startsWith("test/")),
};
const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
console.log(JSON.stringify({ expected: "P0 Node 22 HTTP 函数构建闭环", checks, failed, pass: failed.length === 0 }, null, 2));
if (failed.length > 0) process.exitCode = 1;
