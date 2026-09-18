import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workspacePath } from './workspace.mjs';

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function contains(haystack, needle) {
  if (!needle) return true;
  return norm(haystack).includes(norm(needle)) || norm(needle).includes(norm(haystack));
}

export async function loadCatalog() {
  return JSON.parse(await readFile(workspacePath('assets', 'catalog.json'), 'utf8'));
}

export function resolveVisual(visual, catalog) {
  let candidates = (catalog.assets ?? [])
    .filter(asset => asset.category === visual.category);

  if (visual.category === 'person') {
    if (visual.gender) {
      candidates = candidates.filter(a => a.gender === visual.gender);
    }

    const role = norm(visual.role);
    candidates = candidates.map(asset => {
      let score = 0;
      if (role && norm(asset.role) === role) score += 100;
      for (const tag of asset.tags ?? []) {
        if (role && contains(tag, role)) score += 20;
        if (visual.description && contains(visual.description, tag)) score += 5;
      }
      return { asset, score };
    });
  } else if (visual.category === 'plant') {
    if (visual.plant) {
      candidates = candidates.filter(a => norm(a.plant) === norm(visual.plant));
    }
    candidates = candidates.map(asset => ({ asset, score: 0 }));
  } else if (visual.category === 'symptom') {
    if (visual.plant) {
      candidates = candidates.filter(a => norm(a.plant) === norm(visual.plant));
    }
    if (visual.symptom) {
      candidates = candidates.filter(a => norm(a.symptom) === norm(visual.symptom));
    }
    candidates = candidates.map(asset => ({ asset, score: 0 }));
  } else if (visual.category === 'app_capture') {
    if (visual.feature) {
      const exact = candidates.filter(a => norm(a.feature) === norm(visual.feature));
      candidates = exact.length
        ? exact
        : candidates.filter(a => contains(a.feature, visual.feature));
    }
    candidates = candidates.map(asset => ({ asset, score: 0 }));
  } else {
    candidates = [];
  }

  if (!candidates.length) {
    return {
      status: 'missing',
      asset: null,
      alternatives: []
    };
  }

  candidates.sort((a, b) => {
    if (a.asset.preferred !== b.asset.preferred) {
      return a.asset.preferred ? -1 : 1;
    }
    if (a.score !== b.score) return b.score - a.score;
    if (a.asset.priority !== b.asset.priority) {
      return a.asset.priority - b.asset.priority;
    }
    return a.asset.assetId.localeCompare(b.asset.assetId);
  });

  return {
    status: 'resolved',
    asset: candidates[0].asset,
    alternatives: candidates.slice(1, 5).map(x => x.asset.assetId)
  };
}
