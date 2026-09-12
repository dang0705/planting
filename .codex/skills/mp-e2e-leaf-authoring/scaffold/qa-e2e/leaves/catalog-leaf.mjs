import { createCatalogLeaf } from "./catalog-leaf-runner.mjs";

/**
 * The suite loader passes only the manifest entry that it already validated.
 * Project-specific execution details remain on the project side; the package
 * never imports a business leaf or discovers one from an artifact sidecar.
 */
export function createLeaf(entry) {
  return createCatalogLeaf(entry);
}
