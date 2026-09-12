import { defineFixture } from "../../../packages/miniprogram-e2e/src/contracts/index.mjs";

export const babolatFixtures = {
  diagnostic_runtime: defineFixture({
    id: "diagnostic_runtime",
    async prepare(context) {
      return {
        status: "prepared",
        dataMode: context.dataMode,
        runtimeProjectPath: context.session?.runtimeProjectPath || null,
      };
    },
    async verify({ prepare }) {
      return { verified: prepare?.status === "prepared" };
    },
    async cleanup({ prepare }) {
      return {
        status: "restored",
        readback: { verified: true, source: "diagnostic_runtime_lifecycle" },
        prepared: prepare?.status || null,
      };
    },
  }),
};
