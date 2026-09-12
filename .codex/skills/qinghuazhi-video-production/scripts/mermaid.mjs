import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { parseArgs, requireContentId } from './args.mjs';
import { workflowPaths } from './paths.mjs';
import { loadState } from './state.mjs';

function fullText(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

function compact(text, max = 64) {
  const value = fullText(text);
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function escapeLabel(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('[', '［')
    .replaceAll(']', '］')
    .replaceAll('{', '｛')
    .replaceAll('}', '｝')
    .replaceAll('|', '｜');
}

function typeLabel(type) {
  return {
    plant: '植物 / 症状',
    person_voiceover: '人物画外音',
    person_dialogue: '人物对话',
    existing_video: '小程序录屏'
  }[type] ?? type;
}

function visualFacts(visual = {}) {
  const facts = [];
  if (visual.category === 'person') {
    if (visual.role) facts.push(visual.role);
    if (visual.gender) facts.push(visual.gender);
  } else if (visual.category === 'plant') {
    if (visual.plant) facts.push(visual.plant);
  } else if (visual.category === 'symptom') {
    if (visual.plant) facts.push(visual.plant);
    if (visual.symptom) facts.push(visual.symptom);
  } else if (visual.category === 'app_capture') {
    if (visual.feature) facts.push(visual.feature);
  }
  return facts.join(' · ');
}

export function planToMermaid(plan) {
  const platforms = Array.isArray(plan?.targetPlatforms)
    ? plan.targetPlatforms
    : [];
  const scenes = Array.isArray(plan?.scenes)
    ? plan.scenes
    : [];
  const platformText = platforms.join(' / ');
  const startLabel = [
    plan.title || plan.contentId || '视频开始',
    platformText
  ].filter(Boolean).join('｜');

  const lines = [
    'flowchart TD',
    `  START(["${escapeLabel(startLabel)}"])`
  ];

  let previousShotNode = 'START';
  let shotIndex = 0;

  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
    const scene = scenes[sceneIndex] ?? {};
    const sceneKey = `SCENE_${sceneIndex + 1}`;

    const sceneTitle = [
      `Scene ${sceneIndex + 1}`,
      scene.role,
      compact(scene.purpose)
    ].filter(Boolean).map(escapeLabel).join('｜');

    lines.push('');
    lines.push(`  subgraph ${sceneKey}["${sceneTitle}"]`);
    lines.push('    direction TD');

    let previousInScene = null;
    const sceneShots = Array.isArray(scene.shots)
      ? scene.shots
      : [];

    for (let localIndex = 0; localIndex < sceneShots.length; localIndex++) {
      const shot = sceneShots[localIndex] ?? {};
      shotIndex += 1;
      const nodeId = `SHOT_${shotIndex}`;
      const facts = visualFacts(shot.visual);
      const description = fullText(shot.visual?.description) || '—';
      const speech = fullText(shot.speech?.text) || '无';

      // Shot 标题、画面描述、台词之间全部使用显式换行；
      // visual.description 完整展示，不做截断。
      const labelLines = [
        `<b>Shot ${shotIndex} · ${escapeLabel(typeLabel(shot.type))}</b>`,
        facts ? `画面要素：${escapeLabel(facts)}` : '画面要素：—',
        `画面描述：${escapeLabel(description)}`,
        `节奏 / 情绪：${escapeLabel(shot.rhythm ?? '自然')} / ${escapeLabel(shot.emotion ?? '平静')}`,
        `姿态 / 表达：${escapeLabel(shot.stance ?? '默认')} / ${escapeLabel(shot.expression ?? '默认')}`,
        `台词：${escapeLabel(speech)}`,
        `转场：${escapeLabel(shot.transitionAfter ?? '硬切')}`,
        `时长：约 ${shot.durationHintSec ?? '?'}s`
      ];

      lines.push(`    ${nodeId}["${labelLines.join('<br/>')}"]`);

      if (previousInScene) {
        lines.push(`    ${previousInScene} --> ${nodeId}`);
      }
      previousInScene = nodeId;
    }

    lines.push('  end');

    const count = sceneShots.length;
    if (count > 0) {
      const firstIndex = shotIndex - count + 1;
      const firstNode = `SHOT_${firstIndex}`;
      if (previousShotNode === 'START') {
        lines.push(`  START --> ${firstNode}`);
      } else {
        lines.push(`  ${previousShotNode} --> ${firstNode}`);
      }
      previousShotNode = `SHOT_${shotIndex}`;
    }
  }

  lines.push('');
  lines.push('  END(["结束"])');
  if (previousShotNode === 'START') {
    lines.push('  START --> END');
  } else {
    lines.push(`  ${previousShotNode} --> END`);
  }

  return `${lines.join('\n')}\n`;
}

export async function writePlanDiagram(plan, { mermaidPath, markdownPath }) {
  const mermaid = planToMermaid(plan);
  await writeFile(mermaidPath, mermaid, 'utf8');

  if (markdownPath) {
    const markdown = [
      `# ${plan.title || plan.contentId || '视频剧本'}`,
      '',
      `- Content ID: \`${plan.contentId ?? ''}\``,
      `- 平台: ${Array.isArray(plan.targetPlatforms) ? plan.targetPlatforms.join(' / ') : '未指定'}`,
      `- 目标时长: ${plan.targetDurationSec ?? '?'} 秒`,
      `- 基调: ${plan.tone ?? ''}`,
      '',
      '```mermaid',
      mermaid.trimEnd(),
      '```',
      ''
    ].join('\n');
    await writeFile(markdownPath, markdown, 'utf8');
  }

  return { mermaidPath, markdownPath };
}

async function main() {
  const args = parseArgs();
  const fileArg = args.get('--file');
  const contentArg = args.get('--content');
  const draftArg = args.get('--draft');
  const approved = args.has('--approved');
  const outputArg = args.get('--output');

  let source;

  if (fileArg) {
    source = resolve(fileArg);
  } else {
    const contentId = requireContentId(contentArg);
    const paths = workflowPaths(contentId);

    if (draftArg) {
      const name = draftArg.endsWith('.json') ? draftArg : `${draftArg}.json`;
      source = resolve(paths.drafts, basename(name));
    } else if (approved) {
      const state = await loadState(paths.state, contentId);
      if (!state.currentApproval) throw new Error('当前没有 Approved Plan');
      source = state.currentApproval.planPath;
    } else {
      throw new Error('需要 --file，或 --content + --draft，或 --content + --approved');
    }
  }

  const plan = JSON.parse(await readFile(source, 'utf8'));
  const base = outputArg
    ? resolve(outputArg)
    : resolve(dirname(source), basename(source, '.json'));

  const result = await writePlanDiagram(plan, {
    mermaidPath: `${base}.mmd`,
    markdownPath: `${base}.md`
  });

  console.log(`Mermaid：${result.mermaidPath}`);
  console.log(`Markdown：${result.markdownPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
