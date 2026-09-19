import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifests = process.argv.slice(2);

if (manifests.length === 0) {
  process.stderr.write('用法：node verify-sha256-with-git-head.mjs <manifest.sha256> [...]\n');
  process.exit(2);
}

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

function readFromHead(relativePath) {
  const result = spawnSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024
  });
  return result.status === 0 ? result.stdout : null;
}

let failed = false;

for (const manifestArgument of manifests) {
  const manifestPath = path.resolve(repositoryRoot, manifestArgument);
  const lines = readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    if (!match) {
      process.stderr.write(`${manifestArgument}: 无效 SHA-256 行：${line}\n`);
      failed = true;
      continue;
    }

    const [, expected, relativePath] = match;
    const absolutePath = path.resolve(repositoryRoot, relativePath);
    let content;
    let source;

    if (existsSync(absolutePath)) {
      content = readFileSync(absolutePath);
      source = 'worktree';
    } else {
      content = readFromHead(relativePath);
      source = 'git HEAD（工作区缺失）';
    }

    if (!content) {
      process.stderr.write(`${relativePath}: MISSING（工作区与 git HEAD 均不可读）\n`);
      failed = true;
      continue;
    }

    if (hash(content) !== expected) {
      process.stderr.write(`${relativePath}: FAILED（${source}）\n`);
      failed = true;
      continue;
    }

    process.stdout.write(`${relativePath}: OK（${source}）\n`);
  }
}

if (failed) process.exit(1);
