import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adapterRoot = path.dirname(fileURLToPath(import.meta.url));
const sidecarSource = path.resolve(
  adapterRoot,
  "..",
  "contract",
  "mp-e2e.contract.json"
);

/**
 * This repo's Taro output is `dist/`. The adapter writes the compiled-asset
 * sidecar into that directory so validateArtifact can run without a Planting
 * uni-app layout or a pre-copied sidecar.
 */
export const babolatArtifactProvider = {
  async prepare({ artifactPath }) {
    const root = path.resolve(String(artifactPath || ""));
    const destination = path.join(root, "mp-e2e.contract.json");
    const expected = await readFile(sidecarSource, "utf8");
    await mkdir(root, { recursive: true });
    await writeFile(destination, expected);
    return {
      artifactPath: root,
      async cleanup() {
        return { status: "verified", sidecar: destination };
      },
    };
  },
};
