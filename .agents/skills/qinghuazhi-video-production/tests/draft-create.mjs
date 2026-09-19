import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { workspacePath } from '../scripts/workspace.mjs';

const contentId = `skill-selftest-${process.pid}`;
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

  const result = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/draft-create.mjs'),
      '--content', contentId,
      '--input', input,
      '--producer', 'selftest-agent',
      '--producer-model', 'selftest-model',
      '--skill-context', 'planning'
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const meta = JSON.parse(
    await readFile(resolve(workflow, 'drafts/draft-001.meta.json'), 'utf8')
  );
  assert.equal(meta.status, 'draft_valid');
  assert.equal(meta.producer.name, 'selftest-agent');
  assert.equal(meta.producer.model, 'selftest-model');
  assert.equal(meta.skillUsage.contextProfile, 'planning');
  assert.equal(
    meta.skillUsage.verification,
    'declared-and-hashed-not-runtime-read-proof'
  );
  assert.ok(meta.skillUsage.files.length >= 10);
  assert.equal(meta.sourceInput.rawSha256.length, 64);
  assert.equal(meta.draftSha256.length, 64);
  await readFile(resolve(workflow, 'drafts/draft-001.md'), 'utf8');
  await readFile(resolve(workflow, 'drafts/draft-001.mmd'), 'utf8');

  const invalid = structuredClone(template);
  invalid.unexpected = true;
  invalid.targetPlatforms = {};
  invalid.scenes = 'not-an-array';
  const invalidPath = resolve('/tmp', `${contentId}-invalid.json`);
  await writeFile(invalidPath, JSON.stringify(invalid, null, 2), 'utf8');
  const invalidResult = spawnSync(
    process.execPath,
    [
      resolve('./.agents/skills/qinghuazhi-video-production/scripts/draft-create.mjs'),
      '--content', contentId,
      '--input', invalidPath,
      '--producer', 'selftest-agent',
      '--skill-context', 'planning'
    ],
    { encoding: 'utf8' }
  );
  assert.equal(invalidResult.status, 2);
  const invalidMeta = JSON.parse(
    await readFile(resolve(workflow, 'drafts/draft-002.meta.json'), 'utf8')
  );
  assert.equal(invalidMeta.status, 'draft_invalid');
  assert.ok(invalidMeta.validation.schemaErrors.some(x => x.includes('unexpected')));
  await readFile(resolve(workflow, 'drafts/draft-002.error.txt'), 'utf8');
  await rm(invalidPath, { force: true });

  const invalidRole = structuredClone(template);
  invalidRole.scenes[0].shots[0].visual.role =
    'not-registered-role';

  const invalidRolePath =
    resolve(
      '/tmp',
      `${contentId}-invalid-role.json`
    );

  await writeFile(
    invalidRolePath,
    JSON.stringify(
      invalidRole,
      null,
      2
    ),
    'utf8'
  );

  const invalidRoleResult =
    spawnSync(
      process.execPath,
      [
        resolve(
          './.agents/skills/qinghuazhi-video-production/scripts/draft-create.mjs'
        ),
        '--content',
        contentId,
        '--input',
        invalidRolePath,
        '--producer',
        'selftest-agent',
        '--skill-context',
        'planning'
      ],
      {
        encoding: 'utf8'
      }
    );

  assert.equal(
    invalidRoleResult.status,
    2
  );

  const invalidRoleMeta =
    JSON.parse(
      await readFile(
        resolve(
          workflow,
          'drafts/draft-003.meta.json'
        ),
        'utf8'
      )
    );

  assert.ok(
    invalidRoleMeta.validation
      .businessErrors
      .some(
        item =>
          item.includes(
            '未注册人物 roleId'
          )
      )
  );

  await rm(
    invalidRolePath,
    { force: true }
  );

  console.log('Draft create self-test: OK');
} finally {
  await rm(workflow, { recursive: true, force: true });
  await rm(input, { force: true });
}
