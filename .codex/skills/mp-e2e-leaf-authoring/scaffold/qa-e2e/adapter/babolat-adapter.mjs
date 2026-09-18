import { defineProjectAdapter } from "../../../packages/miniprogram-e2e/src/contracts/index.mjs";
import { babolatArtifactProvider } from "./artifact-provider.mjs";
import { babolatApplicationSessionProvider } from "./app-session-provider.mjs";
import { babolatDevToolsProfileProvider } from "./devtools-profile-provider.mjs";
import { babolatFixtures } from "./fixtures.mjs";
import { doctorBabolatAdapter } from "./doctor.mjs";

export default defineProjectAdapter({
  id: "babolat",
  apiVersion: 1,
  portPolicy: {
    mode: "lease",
    ports: { automator: 9420 },
  },
  artifactProvider: babolatArtifactProvider,
  devToolsProfileProvider: babolatDevToolsProfileProvider,
  applicationSessionProvider: babolatApplicationSessionProvider,
  fixtures: babolatFixtures,
  async doctor() {
    return doctorBabolatAdapter();
  },
});
