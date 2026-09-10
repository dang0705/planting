import { resolve } from 'node:path';
import { workspacePath } from './workspace.mjs';
import { mkdirSync } from 'node:fs';

export function workflowPaths(contentId) {
  const base = workspacePath('workflows', contentId);
  const paths = {
    base,
    drafts: resolve(base, 'drafts'),
    approved: resolve(base, 'approved'),
    prepared: resolve(base, 'prepared'),
    prepareReports: resolve(base, 'prepare-reports'),
    renders: resolve(base, 'renders'),
    state: resolve(base, 'state.json'),
    lock: resolve(base, 'render.lock')
  };

  for (const key of [
    'base',
    'drafts',
    'approved',
    'prepared',
    'prepareReports',
    'renders'
  ]) {
    mkdirSync(paths[key], { recursive: true });
  }

  return paths;
}
