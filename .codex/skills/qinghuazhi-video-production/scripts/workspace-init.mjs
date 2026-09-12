import {
  fileURLToPath
} from 'node:url';
import {
  mkdir,
  copyFile,
  access,
  readdir
} from 'node:fs/promises';
import {
  resolve,
  relative
} from 'node:path';
import {
  spawnSync
} from 'node:child_process';
import {
  videoWorkspaceRoot,
  workspacePath
} from './workspace.mjs';

const skillRoot =
  fileURLToPath(
    new URL('..', import.meta.url)
  );

const templateRoot =
  resolve(
    skillRoot,
    'assets/workspace-template'
  );

const dirs = [
  'config',
  'runtime',
  'workflows',
  'assets/person',
  'assets/plant',
  'assets/symptom',
  'assets/app-capture'
];

for (const dir of dirs) {
  await mkdir(
    workspacePath(dir),
    { recursive: true }
  );
}

async function copyIfMissing(
  source,
  target
) {
  let exists = true;

  try {
    await access(target);
  } catch {
    exists = false;
  }

  if (!exists) {
    await mkdir(
      resolve(target, '..'),
      { recursive: true }
    );
    await copyFile(
      source,
      target
    );
    console.log(
      `已初始化：${target}`
    );
  } else {
    console.log(
      `保留已有：${target}`
    );
  }
}

async function copyTreeMissing(
  sourceDir,
  targetDir
) {
  let entries = [];

  try {
    entries =
      await readdir(
        sourceDir,
        { withFileTypes: true }
      );
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  await mkdir(
    targetDir,
    { recursive: true }
  );

  for (const entry of entries) {
    const source =
      resolve(
        sourceDir,
        entry.name
      );
    const target =
      resolve(
        targetDir,
        entry.name
      );

    if (entry.isDirectory()) {
      await copyTreeMissing(
        source,
        target
      );
    } else {
      await copyIfMissing(
        source,
        target
      );
    }
  }
}

for (const name of [
  'project.json',
  'wan-models.json',
  'roles.json'
]) {
  await copyIfMissing(
    resolve(
      templateRoot,
      'config',
      name
    ),
    workspacePath(
      'config',
      name
    )
  );
}

for (const name of [
  '.gitignore',
  '.env.example'
]) {
  await copyIfMissing(
    resolve(
      templateRoot,
      name
    ),
    workspacePath(name)
  );
}

await copyTreeMissing(
  resolve(
    templateRoot,
    'assets'
  ),
  workspacePath(
    'assets'
  )
);

// Build a usable catalog immediately. No external Provider is called.
const build =
  spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          './build-catalog.mjs',
          import.meta.url
        )
      )
    ],
    {
      stdio: 'inherit',
      env: process.env
    }
  );

if (build.status !== 0) {
  throw new Error(
    '默认素材 Catalog 初始化失败'
  );
}

console.log('');
console.log(
  `视频工作区：${videoWorkspaceRoot()}`
);
console.log(
  '角色、配置和工作流产物均与宿主业务源码隔离。'
);
