import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validatePlanContract } from '../scripts/plan-contract.mjs';

const root = resolve('./.agents/skills/qinghuazhi-video-production');
const skill = await readFile(resolve(root, 'SKILL.md'), 'utf8');
const front = skill.match(/^---\n([\s\S]*?)\n---/);
assert.ok(front, 'SKILL.md 缺少 YAML frontmatter');
const name = front[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
const description = front[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
assert.equal(name, 'qinghuazhi-video-production');
assert.ok(description && description.length <= 1024);
assert.match(description, /青花植/);
assert.match(description, /抖音/);
assert.ok(skill.split('\n').length <= 500, 'SKILL.md 超过 500 行');

for (const path of [
  'references/workflow.md',
  'references/plan-contract.md',
  'references/platform-production-guide.md',
  'references/scene-shot-design.md',
  'references/performance-model.md',
  'references/asset-policy.md',
  'references/roles.md',
  'references/assets.md',
  'references/recovery.md',
  'references/cross-platform.md',
  'references/compliance.md',
  'references/douyin.md',
  'references/xiaohongshu.md',
  'references/wechat-channels.md',
  'assets/plan.template.json',
  'assets/plan.schema.json',
  'assets/roles.json',
  'assets/asset-contract.json',
  'assets/workspace-template/config/roles.json',
  'assets/workspace-template/assets/person/female-a/portrait.jpg',
  'assets/workspace-template/assets/person/female-a/_meta.json',
  'assets/workspace-template/assets/person/male-a/portrait.jpg',
  'assets/workspace-template/assets/person/male-a/_meta.json',
  'assets/workspace-template/.gitignore',
  'assets/workspace-template/.env.example',
  'evals/trigger-queries.json',
  'scripts/draft-create.mjs',
  'scripts/approve.mjs',
  'scripts/prepare.mjs',
  'scripts/render-auto.mjs',
  'scripts/render.mjs',
  'scripts/status.mjs',
  'scripts/workspace.mjs',
  'scripts/workspace-init.mjs',
  'scripts/assets-sync.mjs',
  'scripts/assets-status.mjs',
  'tests/skill-contract.mjs',
  'tests/draft-create.mjs',
  'tests/approve.mjs',
  'tests/performance.mjs',
  'tests/assets-portability.mjs'
]) {
  await access(resolve(root, path));
}


const platformGuide = await readFile(
  resolve(root, 'references/platform-production-guide.md'),
  'utf8'
);
assert.match(platformGuide, /## 责任边界/);
assert.match(platformGuide, /前 3 秒/);
assert.match(platformGuide, /跨平台共同母版/);

const template = JSON.parse(
  await readFile(resolve(root, 'assets/plan.template.json'), 'utf8')
);
const validation = await validatePlanContract(
  template,
  template.contentId,
  template.targetPlatforms
);
assert.deepEqual(validation.errors, []);

const evals = JSON.parse(
  await readFile(resolve(root, 'evals/trigger-queries.json'), 'utf8')
);
assert.equal(evals.length, 20);
assert.equal(evals.filter(item => item.should_trigger).length, 10);
assert.equal(evals.filter(item => !item.should_trigger).length, 10);

console.log('Skill contract self-test: OK');
