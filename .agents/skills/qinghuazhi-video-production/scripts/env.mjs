import {
  resolve
} from 'node:path';
import {
  hostProjectRoot,
  videoWorkspaceRoot
} from './workspace.mjs';

export const loadedEnvFiles = [];

const candidates = [
  resolve(
    videoWorkspaceRoot(),
    '.env.local'
  ),
  resolve(
    videoWorkspaceRoot(),
    '.env'
  ),
  resolve(
    hostProjectRoot(),
    '.env.local'
  ),
  resolve(
    hostProjectRoot(),
    '.env'
  )
];

for (const path of candidates) {
  try {
    // Node 不覆盖 shell 已存在的 process.env；
    // 因此优先级为 shell > workspace > host。
    process.loadEnvFile(path);
    loadedEnvFiles.push(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export function envSourceSummary() {
  return loadedEnvFiles.length
    ? loadedEnvFiles.join(', ')
    : '未发现 workspace / host .env.local / .env';
}
