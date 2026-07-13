#!/usr/bin/env node
import{createRequire as __cr}from'module';const require=__cr(import.meta.url);

// src/entries/daemon-start-policy.ts
function shouldEnsureDaemonForBrvCommand(command) {
  return command === "query" || command === "search" || command === "record";
}
export {
  shouldEnsureDaemonForBrvCommand
};
