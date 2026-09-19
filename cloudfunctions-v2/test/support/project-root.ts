import fs from "node:fs";
import path from "node:path";

/**
 * 从 Vitest 当前工作目录向上寻找仓库根目录。
 *
 * 测试不能假设调用者一定先 `cd cloudfunctions-v2`；同时也不能依赖构建为
 * CommonJS 时不可用的 `import.meta.url`。双标记可避免误把普通父目录识别成项目根。
 */
export function findProjectRoot(startDirectory = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    const hasProjectRules = fs.existsSync(path.join(currentDirectory, "AGENTS.md"));
    const hasBackendPackage = fs.existsSync(
      path.join(currentDirectory, "cloudfunctions-v2/package.json"),
    );
    if (hasProjectRules && hasBackendPackage) { return currentDirectory; }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error(`无法从 ${startDirectory} 定位青花植仓库根目录`);
    }
    currentDirectory = parentDirectory;
  }
}
