const POSITIONS = new Set(['顶', '偏顶部', '中', '偏底部', '底部']);
const TYPES = new Set(['plant', 'person_voiceover', 'person_dialogue', 'existing_video']);
const CATEGORIES = new Set(['person', 'plant', 'symptom', 'app_capture']);
const MODES = new Set(['dialogue', 'voiceover', 'none']);
const RHYTHMS = new Set(['紧凑', '自然', '舒缓']);
const EMOTIONS = new Set([
  '平静', '放松', '安心', '高兴', '兴奋', '自信', '疑惑', '怀疑', '犹豫', '惊讶', '担心', '心烦', '烦躁', '不耐烦', '无奈', '失望', '挫败', '伤心', '焦虑', '紧张', '害怕', '慌张', '愤怒', '暴躁'
]);
const STANCES = new Set(['默认', '安抚', '鼓励', '共情']);
const EXPRESSIONS = new Set(['默认', '低声', '耳语', '喊叫', '玩笑', '秘密感']);
const TRANSITIONS = new Set(['硬切', '轻柔']);

const SCENE_ROLES = new Set([
  '钩子',
  '问题展开',
  '原因解释',
  '产品展示',
  '结果收益',
  '行动引导'
]);

export function validatePlan(plan, expectedContentId = null, expectedPlatforms = null) {
  const errors = [];

  if (plan.contractVersion !== 4) errors.push('contractVersion 必须为 4');
  if (!plan.contentId) errors.push('缺少 contentId');
  if (expectedContentId && plan.contentId !== expectedContentId) {
    errors.push(`contentId 不匹配：期望 ${expectedContentId}，实际 ${plan.contentId}`);
  }
  const allowedPlatforms = new Set([
    'douyin',
    'xiaohongshu',
    'wechat_channels'
  ]);

  if (!Array.isArray(plan.targetPlatforms) || plan.targetPlatforms.length === 0) {
    errors.push('targetPlatforms 不能为空');
  } else {
    for (const platform of plan.targetPlatforms) {
      if (!allowedPlatforms.has(platform)) {
        errors.push(`未知 targetPlatform：${platform}`);
      }
    }

    if (new Set(plan.targetPlatforms).size !== plan.targetPlatforms.length) {
      errors.push('targetPlatforms 不能重复');
    }

    if (expectedPlatforms) {
      const actual = [...new Set(plan.targetPlatforms)].sort();
      const expected = [...new Set(expectedPlatforms)].sort();

      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push(
          `targetPlatforms 不匹配：期望 ${expected.join(',')}，实际 ${actual.join(',')}`
        );
      }
    }
  }

  if (!plan.title?.trim()) errors.push('缺少 title');
  if (!plan.goal?.trim()) errors.push('缺少 goal');
  if (!plan.tone?.trim()) errors.push('缺少 tone');
  if (
    !Number.isInteger(plan.targetDurationSec) ||
    plan.targetDurationSec < 5 ||
    plan.targetDurationSec > 180
  ) {
    errors.push('targetDurationSec 必须为 5~180 秒整数');
  }
  if (!POSITIONS.has(plan.subtitlePosition)) errors.push('subtitlePosition 无效');
  if (!Array.isArray(plan.scenes) || plan.scenes.length === 0) errors.push('scenes 不能为空');

  const sceneIds = new Set();
  const shotIds = new Set();

  for (const scene of plan.scenes ?? []) {
    if (!scene.id || sceneIds.has(scene.id)) errors.push(`Scene ID 无效或重复：${scene.id}`);
    sceneIds.add(scene.id);

    if (!SCENE_ROLES.has(scene.role)) {
      errors.push(`${scene.id} role 无效：${scene.role}`);
    }

    if (!scene.purpose) errors.push(`${scene.id} 缺少 purpose`);

    if (!Array.isArray(scene.shots) || scene.shots.length === 0) {
      errors.push(`${scene.id} shots 不能为空`);
    }

    for (const shot of scene.shots ?? []) {
      if (!shot.id || shotIds.has(shot.id)) errors.push(`Shot ID 无效或重复：${shot.id}`);
      shotIds.add(shot.id);

      if (!TYPES.has(shot.type)) errors.push(`${shot.id} type 无效：${shot.type}`);
      if (!CATEGORIES.has(shot.visual?.category)) errors.push(`${shot.id} visual.category 无效`);
      if (!shot.visual?.description?.trim()) errors.push(`${shot.id} visual.description 不能为空`);
      if (!MODES.has(shot.speech?.mode)) errors.push(`${shot.id} speech.mode 无效`);
      if (typeof shot.prompt !== 'string') errors.push(`${shot.id} prompt 必须是字符串`);

      if (
        !Number.isInteger(shot.durationHintSec) ||
        shot.durationHintSec < 1 ||
        shot.durationHintSec > 30
      ) {
        errors.push(`${shot.id} durationHintSec 必须为 1~30 秒整数`);
      }


      if (!RHYTHMS.has(shot.rhythm)) {
        errors.push(`${shot.id} rhythm 无效：${shot.rhythm}`);
      }

      if (!EMOTIONS.has(shot.emotion)) {
        errors.push(`${shot.id} emotion 无效：${shot.emotion}`);
      }

      if (!STANCES.has(shot.stance)) {
        errors.push(`${shot.id} stance 无效：${shot.stance}`);
      }

      if (!EXPRESSIONS.has(shot.expression)) {
        errors.push(`${shot.id} expression 无效：${shot.expression}`);
      }

      if (!TRANSITIONS.has(shot.transitionAfter)) {
        errors.push(`${shot.id} transitionAfter 无效：${shot.transitionAfter}`);
      }

      if (shot.speech?.mode === 'none') {
        if (shot.speech?.text || shot.speech?.speaker || shot.speech?.voice) {
          errors.push(`${shot.id} speech.mode=none 时 speaker/text/voice 必须为空字符串`);
        }
      } else if (!shot.speech?.text?.trim()) {
        errors.push(`${shot.id} 有语音但 speech.text 为空`);
      }

      if (
        shot.type === 'plant' ||
        shot.type === 'existing_video'
      ) {
        if (!['voiceover', 'none'].includes(shot.speech?.mode)) {
          errors.push(`${shot.id} ${shot.type} 只允许 voiceover 或 none`);
        }
      }

      if (shot.type === 'person_dialogue') {
        if (shot.visual?.category !== 'person') {
          errors.push(`${shot.id} person_dialogue 必须使用 person 画面`);
        }
        if (shot.speech?.mode !== 'dialogue') {
          errors.push(`${shot.id} person_dialogue 必须是 dialogue`);
        }
        if (!shot.speech?.text) {
          errors.push(`${shot.id} 人物对话缺少 text`);
        }
      }

      if (shot.type === 'person_voiceover') {
        if (shot.visual?.category !== 'person') {
          errors.push(`${shot.id} person_voiceover 必须使用 person 画面`);
        }
        if (shot.speech?.mode !== 'voiceover') {
          errors.push(`${shot.id} person_voiceover 必须是 voiceover`);
        }
      }

      if (shot.type === 'plant') {
        if (!['plant', 'symptom'].includes(shot.visual?.category)) {
          errors.push(`${shot.id} plant Shot 只能规划 plant/symptom`);
        }
      }

      if (shot.type === 'existing_video') {
        if (shot.visual?.category !== 'app_capture') {
          errors.push(`${shot.id} existing_video 必须规划 app_capture`);
        }
      }
    }
  }

  return errors;
}

export function lintPlan(plan) {
  const warnings = [];
  const scenes = Array.isArray(plan?.scenes)
    ? plan.scenes
    : [];
  const shots = scenes.flatMap(scene =>
    Array.isArray(scene?.shots)
      ? scene.shots
      : []
  );
  const totalHint = shots.reduce(
    (sum, shot) => sum + (Number(shot.durationHintSec) || 0),
    0
  );

  if (
    shots.length >= 4 &&
    scenes.length === shots.length &&
    scenes.every(scene => (scene.shots?.length ?? 0) === 1)
  ) {
    warnings.push(
      'Scene 粒度过细：当前每个 Scene 都只有 1 个 Shot，Codex 很可能把 Scene 当成了 Shot。应按叙事阶段合并。'
    );
  }

  if (
    plan.targetDurationSec >= 20 &&
    plan.targetDurationSec <= 35 &&
    scenes.length > 4
  ) {
    warnings.push(
      `20~35 秒视频当前规划了 ${scenes.length} 个 Scene，通常过碎；建议 2~4 个。`
    );
  }

  if (
    plan.targetDurationSec >= 20 &&
    plan.targetDurationSec <= 35 &&
    shots.length < 5
  ) {
    warnings.push(
      `20~35 秒视频当前只有 ${shots.length} 个 Shot，画面变化可能不足；通常建议 5~8 个。`
    );
  }

  if (
    plan.targetDurationSec &&
    Math.abs(totalHint - plan.targetDurationSec) >
      Math.max(3, plan.targetDurationSec * 0.2)
  ) {
    warnings.push(
      `Shot 预计时长合计 ${totalHint}s，与目标 ${plan.targetDurationSec}s 差距较大。`
    );
  }

  if (
    shots.length >= 5 &&
    new Set(shots.map(shot => shot.emotion)).size === 1
  ) {
    warnings.push(
      `全片 ${shots.length} 个 Shot 都使用相同情绪“${shots[0]?.emotion}”，检查是否缺少合理情绪演进。`
    );
  }

  for (const scene of scenes) {
    if (
      scene.role === '产品展示' &&
      !(scene.shots ?? []).some(shot => shot.type === 'existing_video')
    ) {
      warnings.push(
        `${scene.id} 标记为“产品展示”，但没有 app_capture / existing_video Shot。`
      );
    }
  }

  return warnings;
}
