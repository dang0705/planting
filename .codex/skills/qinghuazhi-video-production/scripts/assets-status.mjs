import {
  readFile
} from 'node:fs/promises';
import {
  workspacePath
} from './workspace.mjs';

let catalog;
try {
  catalog = JSON.parse(
    await readFile(
      workspacePath('assets', 'catalog.json'),
      'utf8'
    )
  );
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('Asset Catalog 不存在；先运行 video:workspace:init 或 assets:build。');
    process.exit(0);
  }
  throw error;
}

const counts = {
  person: 0,
  plant: 0,
  symptom: 0,
  app_capture: 0
};

const roles = new Set();
const features = new Set();

for (const asset of catalog.assets ?? []) {
  if (Object.hasOwn(counts, asset.category)) {
    counts[asset.category]++;
  }
  if (asset.category === 'person' && asset.role) roles.add(asset.role);
  if (asset.category === 'app_capture' && asset.feature) features.add(asset.feature);
}

console.log(`person: ${counts.person}`);
console.log(`plant: ${counts.plant}`);
console.log(`symptom: ${counts.symptom}`);
console.log(`app_capture: ${counts.app_capture}`);
console.log(`roles: ${[...roles].sort().join(', ') || '-'}`);
console.log(`app features: ${[...features].sort().join(', ') || '-'}`);
