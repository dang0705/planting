import {
  readFile,
  rename,
  mkdir,
  access
} from 'node:fs/promises';
import {
  resolve,
  basename
} from 'node:path';
import {
  videoWorkspaceRoot,
  workspacePath
} from './workspace.mjs';

const cwd =
  process.cwd();

const pkg =
  JSON.parse(
    await readFile(
      resolve(cwd, 'package.json'),
      'utf8'
    )
  );

if (
  pkg.name !==
  'qinghuazhi-video-v1'
) {
  throw new Error(
    [
      '拒绝自动迁移：当前不是旧版独立 qinghuazhi-video-v1 仓库。',
      '如果你已经把 Skill 放进青花植小程序项目，请使用 video:workspace:init，',
      '不要移动小程序根目录自己的 assets/config。'
    ].join('\n')
  );
}

await mkdir(
  videoWorkspaceRoot(),
  { recursive: true }
);

for (const name of [
  'config',
  'assets',
  'runtime',
  'workflows'
]) {
  const source =
    resolve(cwd, name);

  const target =
    workspacePath(name);

  let sourceExists = true;

  try {
    await access(source);
  } catch {
    sourceExists = false;
  }

  if (!sourceExists) {
    continue;
  }

  let targetExists = true;

  try {
    await access(target);
  } catch {
    targetExists = false;
  }

  if (targetExists) {
    throw new Error(
      `迁移目标已存在，拒绝覆盖：${target}`
    );
  }

  await rename(
    source,
    target
  );

  console.log(
    `已迁移 ${name}/ → ${basename(videoWorkspaceRoot())}/${name}/`
  );
}

console.log('');
console.log(
  `V5.2 → V5.3 工作区迁移完成：${videoWorkspaceRoot()}`
);
