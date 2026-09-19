import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep, dirname } from 'node:path';
import { videoWorkspaceRoot, workspacePath } from './workspace.mjs';

const ROOT = workspacePath('assets');
const OUT = workspacePath('assets', 'catalog.json');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.mov']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (!entry.name.endsWith('.json')) files.push(full);
  }

  return files;
}

async function readMeta(file) {
  const dirMeta = resolve(dirname(file), '_meta.json');
  const base = file.slice(0, -extname(file).length);
  const fileMeta = `${base}.meta.json`;
  let result = {};

  for (const path of [dirMeta, fileMeta]) {
    try {
      result = {
        ...result,
        ...JSON.parse(await readFile(path, 'utf8'))
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return result;
}

function stripExt(name) {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

async function toAsset(file) {
  const rel = relative(ROOT, file);
  const parts = rel.split(sep);
  const ext = extname(file).toLowerCase();
  const base = stripExt(parts.at(-1));
  const meta = await readMeta(file);
  const common = {
    path: relative(videoWorkspaceRoot(), file),
    preferred: Boolean(meta.preferred),
    priority: Number.isFinite(meta.priority) ? meta.priority : 100,
    tags: Array.isArray(meta.tags) ? meta.tags : []
  };

  if (parts[0] === 'person' && parts.length >= 3 && IMAGE_EXT.has(ext)) {
    const role = parts[1];
    return {
      assetId: `person.${role}.${base}`,
      kind: 'image',
      category: 'person',
      role,
      gender: meta.gender ?? '',
      ...common
    };
  }

  if (parts[0] === 'plant' && parts.length >= 3 && IMAGE_EXT.has(ext)) {
    const plant = parts[1];
    return {
      assetId: `plant.${plant}.${base}`,
      kind: 'image',
      category: 'plant',
      plant,
      ...common
    };
  }

  if (parts[0] === 'symptom' && parts.length >= 4 && IMAGE_EXT.has(ext)) {
    const symptom = parts[1];
    const plant = parts[2];
    return {
      assetId: `symptom.${symptom}.${plant}.${base}`,
      kind: 'image',
      category: 'symptom',
      symptom,
      plant,
      ...common
    };
  }

  if (parts[0] === 'app-capture' && parts.length >= 3 && VIDEO_EXT.has(ext)) {
    const feature = parts[1];
    return {
      assetId: `app-capture.${feature}.${base}`,
      kind: 'video',
      category: 'app_capture',
      feature,
      ...common
    };
  }

  return null;
}

const files = await walk(ROOT);
const assets = [];

for (const file of files) {
  const asset = await toAsset(file);
  if (asset) assets.push(asset);
}

assets.sort((a, b) => a.assetId.localeCompare(b.assetId));

const seen = new Set();
for (const asset of assets) {
  if (seen.has(asset.assetId)) throw new Error(`重复 assetId：${asset.assetId}`);
  seen.add(asset.assetId);
}

await writeFile(OUT, JSON.stringify({ version: 1, assets }, null, 2), 'utf8');
console.log(`Asset Catalog 已生成：${assets.length} 项`);
