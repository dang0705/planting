import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { workspacePath } from '../scripts/workspace.mjs';

const contentId = `approve-selftest-${process.pid}`;
const workflow = workspacePath('workflows', contentId);
const input = resolve('/tmp', `${contentId}.json`);

try {
  const template = JSON.parse(
    await readFile(
      resolve('./.agents/skills/qinghuazhi-video-production/assets/plan.template.json'),
      'utf8'
    )
  );
  template.contentId = contentId;
  await writeFile(input, JSON.stringify(template, null, 2), 'utf8');

  const draft = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/draft-create.mjs'),
      '--content', contentId,
      '--input', input,
      '--producer', 'approve-selftest-agent',
      '--skill-context', 'planning'
    ],
    { encoding: 'utf8' }
  );
  assert.equal(draft.status, 0, draft.stderr || draft.stdout);

  const approved = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/approve.mjs'),
      '--content', contentId,
      '--draft', 'draft-001.json'
    ],
    { encoding: 'utf8' }
  );
  assert.equal(approved.status, 0, approved.stderr || approved.stdout);

  const approvalDir = resolve(workflow, 'approved/approval-001');
  const meta = JSON.parse(
    await readFile(resolve(approvalDir, 'meta.json'), 'utf8')
  );
  const sourceMeta = JSON.parse(
    await readFile(resolve(approvalDir, 'source-draft-meta.json'), 'utf8')
  );
  assert.equal(meta.producer.name, 'approve-selftest-agent');
  assert.equal(sourceMeta.skillUsage.contextProfile, 'planning');
  assert.equal(sourceMeta.status, 'draft_valid');
  assert.equal(sourceMeta.draftSha256.length, 64);
  assert.ok(meta.sourceDraftMetaHash);
  await readFile(resolve(approvalDir, 'plan.json'), 'utf8');
  await readFile(resolve(approvalDir, 'plan.md'), 'utf8');

  // A structurally valid Plan that failed its declared platform contract
  // must not become approvable merely because approve revalidates without
  // the original --platforms expectation.
  const invalidDraft = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/draft-create.mjs'),
      '--content', contentId,
      '--input', input,
      '--producer', 'approve-selftest-agent',
      '--skill-context', 'planning',
      '--platforms', 'douyin'
    ],
    { encoding: 'utf8' }
  );
  assert.equal(invalidDraft.status, 2);

  const rejected = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/approve.mjs'),
      '--content', contentId,
      '--draft', 'draft-002.json'
    ],
    { encoding: 'utf8' }
  );
  assert.notEqual(rejected.status, 0);
  assert.match(
    `${rejected.stdout}\n${rejected.stderr}`,
    /不是 draft_valid/
  );

  console.log('Approve self-test: OK');
} finally {
  await rm(workflow, { recursive: true, force: true });
  await rm(input, { force: true });
}
