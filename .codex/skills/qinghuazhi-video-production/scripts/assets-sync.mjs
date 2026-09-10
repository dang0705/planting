import {
  writeFile,
  mkdir,
  readdir,
  copyFile,
  stat
} from 'node:fs/promises';
import {
  resolve,
  relative,
  extname,
  dirname
} from 'node:path';
import {
  fileURLToPath
} from 'node:url';
import {
  spawnSync
} from 'node:child_process';
import {
  parseArgs
} from './args.mjs';
import {
  workspacePath
} from './workspace.mjs';
import {
  hashFile
} from './hash.mjs';

const args = parseArgs();
const sourceArg = args.get('--source');
const overwrite = args.has('--overwrite');

if (!sourceArg) {
  throw new Error('缺少 --source');
}

let sourceRoot = resolve(sourceArg);

try {
  const nested = resolve(sourceRoot, 'assets');
  if ((await stat(nested)).isDirectory()) {
    sourceRoot = nested;
  }
} catch {}

const allowed = {
  person: new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.json']),
  plant: new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.json']),
  symptom: new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.json']),
  'app-capture': new Set(['.mp4', '.mov', '.json'])
};

async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const report = {
  source: sourceRoot,
  target: workspacePath('assets'),
  overwrite,
  copied: [],
  skipped: [],
  conflicts: [],
  rejected: [],
  generatedAt: new Date().toISOString()
};

for (const [category, extSet] of Object.entries(allowed)) {
  const sourceCategory = resolve(sourceRoot, category);
  const files = await walk(sourceCategory);

  for (const source of files) {
    const rel = relative(sourceCategory, source);
    const ext = extname(source).toLowerCase();

    if (!extSet.has(ext)) {
      report.rejected.push({ category, source, reason: `不支持 ${ext}` });
      continue;
    }

    const target = workspacePath('assets', category, rel);
    await mkdir(dirname(target), { recursive: true });

    let exists = true;
    try {
      await stat(target);
    } catch {
      exists = false;
    }

    if (!exists) {
      await copyFile(source, target);
      report.copied.push({ category, source, target });
      continue;
    }

    const [sourceHash, targetHash] = await Promise.all([
      hashFile(source),
      hashFile(target)
    ]);

    if (sourceHash === targetHash) {
      report.skipped.push({ category, source, target, reason: 'same-content' });
      continue;
    }

    if (!overwrite) {
      report.conflicts.push({ category, source, target, reason: 'different-content' });
      continue;
    }

    await copyFile(source, target);
    report.copied.push({ category, source, target, overwritten: true });
  }
}

const reportPath = workspacePath(
  'runtime',
  `asset-sync-${Date.now()}.json`
);

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  JSON.stringify(report, null, 2) + '\n',
  'utf8'
);

if (report.conflicts.length) {
  console.error(`发现 ${report.conflicts.length} 个素材冲突；未覆盖。`);
  console.error(`报告：${reportPath}`);
  process.exitCode = 2;
} else {
  const build = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('./build-catalog.mjs', import.meta.url)
      )
    ],
    { stdio: 'inherit', env: process.env }
  );

  if (build.status !== 0) {
    throw new Error('素材已同步，但 Catalog 构建失败');
  }

  console.log(
    `素材同步完成：copied=${report.copied.length}, skipped=${report.skipped.length}, rejected=${report.rejected.length}`
  );
  console.log(`报告：${reportPath}`);
}
