import assert from 'node:assert/strict';
import {
  mkdir,
  writeFile,
  readFile,
  rm
} from 'node:fs/promises';
import {
  resolve
} from 'node:path';
import {
  spawnSync
} from 'node:child_process';
import {
  workspacePath
} from '../scripts/workspace.mjs';

const source = resolve('/tmp', `asset-sync-selftest-${process.pid}`);
const feature = `selftest-${process.pid}`;

try {
  await mkdir(resolve(source, 'app-capture', feature), { recursive: true });
  await mkdir(resolve(source, 'plant', '绿萝'), { recursive: true });
  await mkdir(resolve(source, 'symptom', '黄叶', '绿萝'), { recursive: true });

  await writeFile(resolve(source, 'app-capture', feature, 'demo.mp4'), Buffer.from('video'));
  await writeFile(resolve(source, 'plant', '绿萝', 'demo.jpg'), Buffer.from('plant'));
  await writeFile(resolve(source, 'symptom', '黄叶', '绿萝', 'demo.jpg'), Buffer.from('symptom'));

  const result = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/assets-sync.mjs'),
      '--source',
      source
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const catalog = JSON.parse(
    await readFile(workspacePath('assets', 'catalog.json'), 'utf8')
  );

  const ids = new Set(catalog.assets.map(x => x.assetId));
  assert.ok(ids.has(`app-capture.${feature}.demo`));
  assert.ok(ids.has('plant.绿萝.demo'));
  assert.ok(ids.has('symptom.黄叶.绿萝.demo'));

  console.log('Asset portability self-test: OK');
} finally {
  await rm(source, { recursive: true, force: true });
  await rm(workspacePath('assets', 'app-capture', feature), { recursive: true, force: true });
  await rm(workspacePath('assets', 'plant', '绿萝'), { recursive: true, force: true });
  await rm(workspacePath('assets', 'symptom', '黄叶', '绿萝'), { recursive: true, force: true });

  const build = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/build-catalog.mjs')
    ],
    { encoding: 'utf8' }
  );
  assert.equal(build.status, 0, build.stderr || build.stdout);
}
