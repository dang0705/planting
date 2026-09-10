import { fileURLToPath } from 'node:url';
import {
  readFile,
  writeFile,
  rename,
  copyFile,
  open
} from 'node:fs/promises';
import {
  resolve,
  basename
} from 'node:path';
import { stdin } from 'node:process';
import { parseArgs, requireContentId } from './args.mjs';
import { workflowPaths } from './paths.mjs';
import { nextSequence, pad3 } from './sequence.mjs';
import { validatePlanContract } from './plan-contract.mjs';
import { lintPlan } from './plan-validator.mjs';
import { writePlanDiagram } from './mermaid.mjs';
import { parsePlatforms } from './platforms.mjs';
import { hashFile, hashObject, hashText } from './hash.mjs';
import { workspacePath } from './workspace.mjs';

const SKILL_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL_NAME = 'qinghuazhi-video-production';

const args = parseArgs();
const contentId = requireContentId(args.get('--content'));
const inputArg = args.get('--input');
const intent = args.get('--intent', 'plan');
const parentDraftArg = args.get('--parent-draft');
const contextProfile = args.get('--skill-context', 'none');
const producerName = String(
  args.get('--producer', process.env.VIDEO_AGENT_NAME ?? 'unknown-agent')
);
const producerModel = args.get('--producer-model', process.env.VIDEO_AGENT_MODEL ?? null);
const producerSession = args.get('--producer-session', null);
const briefFileArg = args.get('--brief-file', null);

if (!inputArg) {
  throw new Error('缺少 --input；使用 JSON 文件路径或 - 表示 stdin');
}

if (!['plan', 'revision', 'import'].includes(intent)) {
  throw new Error('--intent 只允许 plan / revision / import');
}

if (!['planning', 'revision', 'none'].includes(contextProfile)) {
  throw new Error('--skill-context 只允许 planning / revision / none');
}

if (intent === 'revision' && !parentDraftArg) {
  throw new Error('--intent revision 时必须提供 --parent-draft');
}

if (parentDraftArg && intent !== 'revision') {
  throw new Error('--parent-draft 只能与 --intent revision 同时使用');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const raw = inputArg === '-'
  ? await readStdin()
  : await readFile(resolve(inputArg), 'utf8');

let plan;
try {
  plan = JSON.parse(raw);
} catch (error) {
  throw new Error(`Plan 不是有效 JSON：${error.message}`);
}

const expectedPlatforms = args.has('--platforms')
  ? parsePlatforms(args.get('--platforms'))
  : null;

const paths = workflowPaths(contentId);

let parentDraft = null;
if (parentDraftArg) {
  const name = basename(
    parentDraftArg.endsWith('.json')
      ? parentDraftArg
      : `${parentDraftArg}.json`
  );
  if (!/^draft-\d+\.json$/.test(name)) {
    throw new Error('--parent-draft 必须是 draft-xxx.json');
  }
  const path = resolve(paths.drafts, name);
  await readFile(path, 'utf8');
  parentDraft = {
    name,
    path,
    sha256: await hashFile(path)
  };
}

async function parseSkillMetadata() {
  const path = resolve(SKILL_ROOT, 'SKILL.md');
  const content = await readFile(path, 'utf8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  const name = frontmatter?.[1].match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? SKILL_NAME;
  const version = frontmatter?.[1].match(/^\s+version:\s*["']?([^"'\n]+)["']?$/m)?.[1]?.trim() ?? null;
  return { path, content, name, version };
}

function platformReference(platform) {
  return {
    douyin: 'references/douyin.md',
    xiaohongshu: 'references/xiaohongshu.md',
    wechat_channels: 'references/wechat-channels.md'
  }[platform];
}

async function buildSkillAudit() {
  if (contextProfile === 'none') {
    return {
      declared: false,
      verification: 'not-declared',
      skillName: SKILL_NAME,
      contextProfile: 'none',
      files: []
    };
  }

  const metadata = await parseSkillMetadata();
  const platforms = Array.isArray(plan.targetPlatforms)
    ? plan.targetPlatforms
    : [];

  const relativePaths = [
    'SKILL.md',
    'references/workflow.md',
    'references/plan-contract.md',
    'references/platform-production-guide.md',
    'references/scene-shot-design.md',
    'references/performance-model.md',
    'references/asset-policy.md',
    'references/roles.md',
    'references/cross-platform.md',
    'references/compliance.md',
    'assets/plan.template.json',
    'assets/plan.schema.json',
    'assets/roles.json',
    ...platforms.map(platformReference).filter(Boolean)
  ];

  const unique = [...new Set(relativePaths)];
  const files = [];

  for (const relativePath of unique) {
    const absolutePath = resolve(SKILL_ROOT, relativePath);
    files.push({
      path: `.agents/skills/${SKILL_NAME}/${relativePath}`,
      sha256: await hashFile(absolutePath)
    });
  }

  return {
    declared: true,
    verification: 'declared-and-hashed-not-runtime-read-proof',
    declarationSource: '--skill-context',
    skillName: metadata.name,
    skillVersion: metadata.version,
    contextProfile,
    contextSha256: hashObject(files),
    files
  };
}

async function loadRoleRegistry() {
  const workspaceRoles =
    workspacePath(
      'config',
      'roles.json'
    );

  try {
    const raw =
      await readFile(
        workspaceRoles,
        'utf8'
      );

    return {
      path:
        workspaceRoles,
      sha256:
        await hashFile(
          workspaceRoles
        ),
      data:
        JSON.parse(raw)
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const fallback =
    resolve(
      SKILL_ROOT,
      'assets/roles.json'
    );

  return {
    path:
      fallback,
    sha256:
      await hashFile(fallback),
    data:
      JSON.parse(
        await readFile(
          fallback,
          'utf8'
        )
      )
  };
}

function validateRoleUsage(
  plan,
  registry
) {
  const errors = [];
  const roles =
    registry?.roles ?? {};

  for (const scene of plan.scenes ?? []) {
    for (const shot of scene.shots ?? []) {
      if (
        ![
          'person_dialogue',
          'person_voiceover'
        ].includes(shot.type)
      ) {
        continue;
      }

      const roleId =
        String(
          shot.visual?.role ?? ''
        ).trim();

      if (!roleId) {
        errors.push(
          `${shot.id}: person Shot 必须指定 visual.role roleId`
        );
        continue;
      }

      const role =
        roles[roleId];

      if (!role) {
        errors.push(
          `${shot.id}: 未注册人物 roleId=${roleId}`
        );
        continue;
      }

      const gender =
        String(
          shot.visual?.gender ?? ''
        ).trim();

      if (
        gender &&
        role.gender &&
        gender !== role.gender
      ) {
        errors.push(
          `${shot.id}: roleId=${roleId} gender=${role.gender}，Plan 却指定 ${gender}`
        );
      }
    }
  }

  return errors;
}

const roleRegistry =
  await loadRoleRegistry();

const skillUsage = await buildSkillAudit();
const validation = await validatePlanContract(
  plan,
  contentId,
  expectedPlatforms
);

const roleErrors =
  validateRoleUsage(
    plan,
    roleRegistry.data
  );

validation.businessErrors.push(
  ...roleErrors
);

validation.errors.push(
  ...roleErrors.map(
    error =>
      `Business: ${error}`
  )
);

const warnings = lintPlan(plan);

let brief = null;
if (briefFileArg) {
  const briefPath = resolve(briefFileArg);
  brief = {
    sourcePath: briefPath,
    text: await readFile(briefPath, 'utf8'),
    sha256: await hashFile(briefPath)
  };
}

async function reserveDraft() {
  let seq = await nextSequence(paths.drafts, 'draft-');
  for (let attempt = 0; attempt < 1000; attempt++, seq++) {
    const draftId = `draft-${pad3(seq)}`;
    const metaPath = resolve(paths.drafts, `${draftId}.meta.json`);
    try {
      const handle = await open(metaPath, 'wx');
      await handle.writeFile('{}', 'utf8');
      await handle.close();
      return { draftId, metaPath };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('无法分配 Draft ID');
}

const reservation = await reserveDraft();
const draftId = reservation.draftId;
const draftPath = resolve(paths.drafts, `${draftId}.json`);
const tmpPath = resolve(paths.drafts, `.${draftId}.${process.pid}.tmp`);
const errorPath = resolve(paths.drafts, `${draftId}.error.txt`);
const warningPath = resolve(paths.drafts, `${draftId}.warnings.txt`);
const diagramBase = draftPath.slice(0, -5);
const briefSnapshotPath = brief
  ? resolve(paths.drafts, `${draftId}.brief.txt`)
  : null;

const createdAt = new Date().toISOString();
const meta = {
  contentId,
  draftId,
  status: validation.errors.length ? 'draft_invalid' : 'draft_valid',
  intent,
  createdAt,
  contractVersion: plan.contractVersion ?? null,
  targetPlatforms: plan.targetPlatforms ?? null,
  sourceInput: {
    kind: inputArg === '-' ? 'stdin' : 'file',
    path: inputArg === '-' ? null : resolve(inputArg),
    rawSha256: hashText(raw)
  },
  casting: {
    registryPath:
      roleRegistry.path,
    registrySha256:
      roleRegistry.sha256,
    registryVersion:
      roleRegistry.data?.version ?? null
  },
  producer: {
    type: 'agent',
    name: producerName,
    model: producerModel,
    sessionId: producerSession
  },
  skillUsage,
  parentDraft,
  brief: brief
    ? {
        sourcePath: brief.sourcePath,
        snapshotPath: briefSnapshotPath,
        sha256: brief.sha256
      }
    : null,
  validation: {
    schemaErrors: validation.schemaErrors,
    businessErrors: validation.businessErrors,
    warnings
  }
};

await writeFile(tmpPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');
await rename(tmpPath, draftPath);

await writePlanDiagram(plan, {
  mermaidPath: `${diagramBase}.mmd`,
  markdownPath: `${diagramBase}.md`
});

if (brief) {
  await copyFile(brief.sourcePath, briefSnapshotPath);
}

if (warnings.length) {
  await writeFile(
    warningPath,
    warnings.map(item => `- ${item}`).join('\n') + '\n',
    'utf8'
  );
}

if (validation.errors.length) {
  await writeFile(errorPath, validation.errors.join('\n') + '\n', 'utf8');
}

meta.draftPath = draftPath;
meta.draftSha256 = await hashFile(draftPath);
meta.diagramPath = `${diagramBase}.md`;
meta.finishedAt = new Date().toISOString();
await writeFile(reservation.metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');

console.log(`Draft：${draftPath}`);
console.log(`Mermaid：${diagramBase}.md`);
console.log(`Meta：${reservation.metaPath}`);
console.log(`Producer：${producerName}${producerModel ? ` / ${producerModel}` : ''}`);
console.log(`Skill context：${skillUsage.contextProfile} / ${skillUsage.verification}`);
console.log('注意：Draft 永远不具备 Render 资格。');

if (warnings.length) {
  console.warn('Plan warnings：');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (validation.errors.length) {
  console.error('Plan 校验失败，但 Draft 与 Mermaid 已保留：');
  for (const error of validation.errors) console.error(`- ${error}`);
  process.exitCode = 2;
}
