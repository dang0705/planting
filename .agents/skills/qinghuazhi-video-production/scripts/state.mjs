import { readFile, writeFile } from 'node:fs/promises';

export async function loadState(path, contentId) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      contentId,
      currentApproval: null,
      currentJob: null,
      currentRender: null,
      renderHistory: [],
      lastPrepare: null
    };
  }
}

export async function saveState(path, state) {
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}
