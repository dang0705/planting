import { defineConfig } from "vitest/config";

// RED 套件只承载尚未实现的 TDD 目标，必须显式运行，不能伪装成默认回归通过证据。
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.red.spec.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
  },
});
