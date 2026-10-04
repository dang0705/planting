import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // 显式定位，确保从项目根目录和后端目录启动时选择同一批后端用例。
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    name: "backend-v2",
    environment: "node",
    include: ["test/**/*.spec.ts"],
    exclude: ["test/**/*.red.spec.ts", "test/e2e/**/*.mysql.spec.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
  },
});
