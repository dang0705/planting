import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const 当前目录 = dirname(fileURLToPath(import.meta.url));
const 项目目录 = resolve(当前目录, "..");
const 构建目录 = join(项目目录, "dist");
const 部署目录 = join(项目目录, "deployment");
const 产物路径 = join(构建目录, "server.cjs");

/** 只删除 v2 固定生成目录，禁止接收环境变量、命令行参数或通配符作为删除目标。 */
async function 重建生成目录() {
  await rm(构建目录, { recursive: true, force: true });
  await rm(部署目录, { recursive: true, force: true });
  await mkdir(构建目录, { recursive: true });
  await mkdir(join(部署目录, "dist"), { recursive: true });
}

async function 递归列出文件(目录, 根目录 = 目录) {
  const 文件 = [];
  for (const 条目 of await readdir(目录, { withFileTypes: true })) {
    const 绝对路径 = join(目录, 条目.name);
    if (条目.isDirectory()) 文件.push(...(await 递归列出文件(绝对路径, 根目录)));
    else if (条目.isFile()) 文件.push(relative(根目录, 绝对路径).split("\\").join("/"));
  }
  return 文件.sort();
}

async function 文件摘要(文件路径) {
  return createHash("sha256").update(await readFile(文件路径)).digest("hex");
}

await 重建生成目录();

await build({
  entryPoints: [join(项目目录, "src/server.ts")],
  outfile: 产物路径,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  packages: "external",
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});

await cp(产物路径, join(部署目录, "dist/server.cjs"));
await cp(join(项目目录, "scf_bootstrap"), join(部署目录, "scf_bootstrap"));
await cp(join(项目目录, "package.json"), join(部署目录, "package.json"));
await cp(join(项目目录, "package-lock.json"), join(部署目录, "package-lock.json"));
await chmod(join(部署目录, "scf_bootstrap"), 0o755);

// 部署目录仅按锁文件安装生产依赖，确保 TypeScript、Vitest、esbuild 和 Node 类型不会入包。
execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: 部署目录,
  stdio: "inherit",
});

const 初始文件 = await 递归列出文件(部署目录);
const files = [...初始文件, "package-manifest.json"].sort();
const 禁止路径 = files.filter(
  (文件) =>
    文件.startsWith("src/") ||
    文件.startsWith("test/") ||
    文件.startsWith("node_modules/typescript/") ||
    文件.startsWith("node_modules/vitest/") ||
    文件.startsWith("node_modules/esbuild/") ||
    文件.startsWith("node_modules/@types/"),
);
if (禁止路径.length > 0) {
  throw new Error(`部署包混入源码或开发依赖：${禁止路径.join(", ")}`);
}

const 清单 = {
  schemaVersion: 1,
  runtime: "Nodejs22.21",
  entrypoint: "dist/server.cjs",
  bootstrap: "scf_bootstrap",
  productionDependencies: { ajv: "8.20.0", pino: "10.3.1" },
  artifacts: { "dist/server.cjs": await 文件摘要(产物路径) },
  files,
};
const 清单正文 = `${JSON.stringify(清单, null, 2)}\n`;
await writeFile(join(项目目录, "package-manifest.json"), 清单正文, "utf8");
await writeFile(join(部署目录, "package-manifest.json"), 清单正文, "utf8");
