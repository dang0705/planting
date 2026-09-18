import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workspacePath } from '../scripts/workspace.mjs';
import {
  resolveAzurePerformance,
  resolveWanPerformance,
  classifyAzureStyleSupport,
  isAzureStyleAllowed
} from '../scripts/performance.mjs';
import { buildAzureSsml } from '../scripts/tts.mjs';
import { validatePlanContract } from '../scripts/plan-contract.mjs';

const project = JSON.parse(
  await readFile(workspacePath('config', 'project.json'), 'utf8')
);
const template = JSON.parse(
  await readFile(resolve('./.agents/skills/qinghuazhi-video-production/assets/plan.template.json'), 'utf8')
);

assert.equal(project.performance.version, 5);
assert.equal(project.performance.azure.globalStylePool.length, 62);
assert.equal(project.performance.azure.temperature, 0.2);
assert.equal(
  project.voices.default,
  'zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural'
);
assert.equal(
  project.voices['男性'],
  'zh-CN-Yunhan:DragonHDFlashLatestNeural'
);
assert.deepEqual((await validatePlanContract(template, template.contentId, template.targetPlatforms)).errors, []);

const femaleVoice = project.voices['女性'];
const femaleProfile = project.performance.azure.voiceProfiles[femaleVoice];

const anxious = resolveAzurePerformance({
  rhythm: '自然',
  emotion: '焦虑',
  stance: '默认',
  expression: '默认',
  supportedStyles: femaleProfile.officialStyles,
  voice: femaleVoice,
  project
});
assert.equal(anxious.style, 'anxious');
assert.equal(anxious.styleDegree, 1);
assert.equal(anxious.temperature, 0.2);
assert.equal(anxious.styleSource, 'emotion');
assert.equal(anxious.supportLevel, 'official');
assert.equal(anxious.ratePct, 0);

const tight = resolveAzurePerformance({
  rhythm: '紧凑',
  emotion: '焦虑',
  stance: '默认',
  expression: '默认',
  supportedStyles: femaleProfile.officialStyles,
  voice: femaleVoice,
  project
});
assert.equal(tight.ratePct, 3);

const soothing = resolveAzurePerformance({
  rhythm: '自然',
  emotion: '焦虑',
  stance: '安抚',
  expression: '默认',
  supportedStyles: femaleProfile.officialStyles,
  voice: femaleVoice,
  project
});
assert.equal(soothing.style, 'reassuring');
assert.equal(soothing.styleSource, 'stance');

const whisper = resolveAzurePerformance({
  rhythm: '自然',
  emotion: '焦虑',
  stance: '安抚',
  expression: '耳语',
  supportedStyles: femaleProfile.officialStyles,
  voice: femaleVoice,
  project
});
assert.equal(whisper.style, 'whispering');
assert.equal(whisper.styleSource, 'expression');

const impatientSupport = classifyAzureStyleSupport({
  style: 'impatient',
  voice: femaleVoice,
  supportedStyles: [],
  project
});
assert.equal(impatientSupport, 'empirical');
assert.equal(isAzureStyleAllowed({ style: 'impatient', project }), true);
assert.equal(isAzureStyleAllowed({ style: 'not-a-real-style', project }), false);

const wan = resolveWanPerformance({
  shotType: 'person_dialogue',
  rhythm: '紧凑',
  emotion: '焦虑',
  stance: '安抚',
  expression: '低声',
  project
});
assert.match(wan.promptSuffix, /2到3个连续的小动作事件/);
assert.match(wan.promptSuffix, /眉间明显收紧/);
assert.match(wan.promptSuffix, /安抚/);
assert.match(wan.promptSuffix, /低刺激/);
assert.equal(wan.emotionAppliedToVisual, true);
assert.equal(wan.stanceAppliedToVisual, true);
assert.equal(wan.expressionAppliedToVisual, true);
assert.match(wan.promptSuffix, /后续由口型同步模型处理/);

const wanDriven = resolveWanPerformance({
  shotType: 'person_dialogue',
  rhythm: '自然',
  emotion: '焦虑',
  stance: '默认',
  expression: '默认',
  audioDrivenDialogue: true,
  project
});
assert.equal(wanDriven.audioDrivenDialogue, true);
assert.match(wanDriven.promptSuffix, /根据驱动音频自然说话/);

const plantWan = resolveWanPerformance({
  shotType: 'plant',
  rhythm: '紧凑',
  emotion: '焦虑',
  stance: '安抚',
  expression: '低声',
  project
});
assert.equal(plantWan.emotionAppliedToVisual, false);
assert.doesNotMatch(plantWan.promptSuffix, /眉间明显收紧/);
assert.match(plantWan.promptSuffix, /不得因情绪、姿态、节奏要求新增、夸大、减轻或改变症状/);

const ssml = buildAzureSsml({
  text: '测试情绪语音',
  voice: femaleVoice,
  performance: anxious
});
assert.match(ssml, /parameters="temperature=0.2"/);
assert.match(ssml, /style="anxious"/);
assert.match(ssml, /styledegree="1"/);
assert.match(ssml, /prosody rate="\+0%" pitch="\+0%"/);

console.log('Performance self-test: OK');
