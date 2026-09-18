import assert from 'node:assert/strict';
import {
  mkdir,
  rm,
  readFile
} from 'node:fs/promises';
import {
  resolve
} from 'node:path';
import {
  hostProjectRoot,
  videoWorkspaceRoot,
  workspacePath
} from '../scripts/workspace.mjs';
import {
  PLAN_SCHEMA_PATH
} from '../scripts/plan-contract.mjs';

const host =
  hostProjectRoot();

assert.equal(
  host,
  process.cwd()
);

const nested =
  resolve(
    host,
    '.tmp-portability',
    'nested'
  );

await mkdir(
  nested,
  { recursive: true }
);

const original =
  process.cwd();

try {
  process.chdir(nested);

  // Workspace path must remain anchored to the host project,
  // not the current shell directory.
  assert.equal(
    videoWorkspaceRoot(),
    resolve(
      host,
      'qinghuazhi-video-workspace'
    )
  );

  assert.equal(
    workspacePath(
      'config',
      'roles.json'
    ),
    resolve(
      host,
      'qinghuazhi-video-workspace',
      'config',
      'roles.json'
    )
  );

  await readFile(
    PLAN_SCHEMA_PATH,
    'utf8'
  );
} finally {
  process.chdir(original);
  await rm(
    resolve(
      host,
      '.tmp-portability'
    ),
    {
      recursive: true,
      force: true
    }
  );
}

console.log(
  'Portability self-test: OK'
);
