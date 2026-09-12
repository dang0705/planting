function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function signedPercent(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

function getPerformanceConfig(project) {
  const config = project?.performance;

  if (
    !config?.azure ||
    !config?.rhythms ||
    !config?.emotions ||
    !config?.stances ||
    !config?.expressions ||
    !config?.wanVisual
  ) {
    throw new Error(
      'config/project.json 缺少 performance.azure / rhythms / emotions / stances / expressions / wanVisual'
    );
  }

  return config;
}

function primary(config) {
  return config?.azure?.primary ?? {
    style: null,
    styleDegree: null
  };
}

export function classifyAzureStyleSupport({
  style,
  voice = null,
  supportedStyles = [],
  project
}) {
  if (!style) return 'neutral';

  const config = getPerformanceConfig(project);
  const live = new Set(supportedStyles ?? []);

  if (live.has(style)) return 'official';

  const profile = voice
    ? config.azure.voiceProfiles?.[voice]
    : null;

  if (profile?.officialStyles?.includes(style)) {
    return 'official';
  }

  if (profile?.empiricalStyles?.includes(style)) {
    return 'empirical';
  }

  if (profile?.candidateStyles?.includes(style)) {
    return 'candidate';
  }

  return 'unverified';
}

export function isAzureStyleAllowed({
  style,
  project
}) {
  if (!style) return true;

  const config = getPerformanceConfig(project);

  if (config.azure.globalStylePool?.includes(style)) {
    return true;
  }

  const providerKnownStyles = Object.values(
    config.azure.voiceProfiles ?? {}
  ).flatMap(profile => [
    ...(profile.officialStyles ?? []),
    ...(profile.empiricalStyles ?? []),
    ...(profile.candidateStyles ?? [])
  ]);

  return providerKnownStyles.includes(style);
}

function selectAzureStyle({
  emotion,
  stance,
  expression,
  project
}) {
  const config = getPerformanceConfig(project);
  const emotionConfig = config.emotions[emotion];
  const stanceConfig = config.stances[stance];
  const expressionConfig = config.expressions[expression];

  if (!emotionConfig) {
    throw new Error(`未知 emotion：${emotion}`);
  }
  if (!stanceConfig) {
    throw new Error(`未知 stance：${stance}`);
  }
  if (!expressionConfig) {
    throw new Error(`未知 expression：${expression}`);
  }

  // Azure SSML 每次只有一个 express-as style。
  // 明确表达方式 > 对话姿态 > 基础情绪。
  if (expression !== '默认') {
    return {
      source: 'expression',
      semanticValue: expression,
      config: expressionConfig,
      selected: primary(expressionConfig)
    };
  }

  if (stance !== '默认') {
    return {
      source: 'stance',
      semanticValue: stance,
      config: stanceConfig,
      selected: primary(stanceConfig)
    };
  }

  return {
    source: 'emotion',
    semanticValue: emotion,
    config: emotionConfig,
    selected: primary(emotionConfig)
  };
}

function deriveWanSeed(value, salt = '') {
  const input = `${salt}:${value ?? ''}`;
  let hash = 2166136261;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) & 0x7fffffff;
}

export function resolveWanPerformance({
  shotType,
  rhythm,
  emotion,
  stance = '默认',
  expression = '默认',
  seedKey = '',
  seedOverride = null,
  continuityContext = null,
  audioDrivenDialogue = false,
  project
}) {
  const config = getPerformanceConfig(project);
  const rhythmConfig = config.rhythms[rhythm];
  const emotionConfig = config.emotions[emotion];
  const stanceConfig = config.stances[stance];
  const expressionConfig = config.expressions[expression];
  const visual = config.wanVisual;

  if (!rhythmConfig) throw new Error(`未知 rhythm：${rhythm}`);
  if (!emotionConfig) throw new Error(`未知 emotion：${emotion}`);
  if (!stanceConfig) throw new Error(`未知 stance：${stance}`);
  if (!expressionConfig) throw new Error(`未知 expression：${expression}`);

  const isPersonShot = [
    'person_dialogue',
    'person_voiceover'
  ].includes(shotType);

  const parts = [];

  if (isPersonShot) {
    parts.push(`人物一致性：${visual.identityLock}。`);
  }

  const cameraPrompt =
    visual.cameraByShotType?.[shotType];

  if (cameraPrompt) {
    parts.push(`镜头要求：${cameraPrompt}。`);
  }

  parts.push(`动作节奏：${rhythmConfig.wanPrompt}。`);

  if (isPersonShot) {
    parts.push(`人物情绪：${emotionConfig.wanPrompt}。`);

    if (stance !== '默认' && stanceConfig.wanPrompt) {
      parts.push(`表达姿态：${stanceConfig.wanPrompt}。`);
    }

    if (expression !== '默认' && expressionConfig.wanPrompt) {
      parts.push(`表达方式：${expressionConfig.wanPrompt}。`);
    }

    let mouthPrompt = null;

    if (shotType === 'person_dialogue') {
      mouthPrompt =
        audioDrivenDialogue
          ? visual.mouthByMode?.dialogue_driven
          : visual.mouthByMode?.dialogue_silent;
    } else if (shotType === 'person_voiceover') {
      mouthPrompt =
        visual.mouthByMode?.voiceover;
    }

    if (mouthPrompt) {
      parts.push(`嘴部要求：${mouthPrompt}。`);
    }

    if (
      continuityContext?.sameScene &&
      continuityContext?.sameAsset
    ) {
      parts.push(
        `连续性：${visual.sameSceneSamePersonContinuity}。`
      );
    }
  } else if (shotType === 'plant') {
    parts.push(
      '植物证据保护：保持首帧植物真实叶片、颜色和症状证据；' +
      '不得因情绪、姿态、节奏要求新增、夸大、减轻或改变症状。'
    );
  }

  const seed =
    seedOverride == null
      ? deriveWanSeed(
          seedKey,
          visual.seedSalt ?? ''
        )
      : Number(seedOverride);

  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 2147483647
  ) {
    throw new Error(
      `Wan seed 必须是 0~2147483647 整数：${seed}`
    );
  }

  const negativePrompt =
    isPersonShot
      ? visual.negativePromptPerson
      : (
          shotType === 'plant'
            ? visual.negativePromptPlant
            : ''
        );

  return {
    shotType,
    rhythm,
    emotion,
    stance,
    expression,
    emotionAppliedToVisual: isPersonShot,
    stanceAppliedToVisual:
      isPersonShot && stance !== '默认',
    expressionAppliedToVisual:
      isPersonShot && expression !== '默认',
    cameraPolicy: cameraPrompt ?? null,
    continuityMode:
      continuityContext?.sameScene &&
      continuityContext?.sameAsset
        ? 'same-scene-same-person'
        : 'canonical',
    previousEmotion:
      continuityContext?.previousEmotion ?? null,
    audioDrivenDialogue,
    seed,
    negativePrompt,
    promptSuffix: parts.join(' ')
  };
}

export function resolveAzurePerformance({
  rhythm,
  emotion,
  stance = '默认',
  expression = '默认',
  supportedStyles = [],
  voice = null,
  project
}) {
  const config = getPerformanceConfig(project);
  const rhythmConfig = config.rhythms[rhythm];

  if (!rhythmConfig) {
    throw new Error(`未知 rhythm：${rhythm}`);
  }

  const resolved = selectAzureStyle({
    emotion,
    stance,
    expression,
    project
  });

  const style = resolved.selected.style ?? null;

  if (
    style &&
    !isAzureStyleAllowed({ style, project })
  ) {
    throw new Error(`Azure style 不在项目允许池：${style}`);
  }

  const supportLevel = classifyAzureStyleSupport({
    style,
    voice,
    supportedStyles,
    project
  });

  if (
    style &&
    config.azure.strictStyle &&
    supportLevel !== 'official'
  ) {
    throw new Error(
      `当前 strictStyle=true，禁止非 official style：${style}`
    );
  }

  if (
    style &&
    supportLevel === 'empirical' &&
    !config.azure.allowEmpiricalStyles
  ) {
    throw new Error(`当前配置禁止 empirical style：${style}`);
  }

  if (
    style &&
    supportLevel === 'candidate' &&
    !config.azure.allowCandidateStyles
  ) {
    throw new Error(`当前配置禁止 candidate style：${style}`);
  }

  if (
    style &&
    supportLevel === 'unverified' &&
    !config.azure.allowUnverifiedStyles
  ) {
    throw new Error(`当前配置禁止 unverified style：${style}`);
  }

  // Dragon HD Style 本身会改变韵律；rhythm 只做小幅二次修正。
  const ratePct = clamp(
    Number(rhythmConfig.ttsRatePct || 0),
    -8,
    8
  );

  const pitchPct = 0;

  return {
    rhythm,
    emotion,
    stance,
    expression,
    voice,
    styleSource: resolved.source,
    styleSemanticValue: resolved.semanticValue,
    style,
    styleDegree: style
      ? clamp(
          Number(resolved.selected.styleDegree ?? 1),
          0.01,
          2
        )
      : null,
    temperature: Number(
      resolved.selected.temperature ??
      config.azure.temperature ??
      0.2
    ),
    supportLevel,
    variance: resolved.config?.azure?.variance ?? null,
    ratePct,
    pitchPct,
    rateSsml: signedPercent(ratePct),
    pitchSsml: signedPercent(pitchPct),
    keepLeadingSilence: Number(rhythmConfig.keepLeadingSilence),
    keepTrailingSilence: Number(rhythmConfig.keepTrailingSilence)
  };
}

export function buildPerformanceAudit({
  shot,
  voice,
  azure,
  wan
}) {
  return {
    shotId: shot.shotId,
    rhythm: shot.rhythm,
    emotion: shot.emotion,
    stance: shot.stance ?? '默认',
    expression: shot.expression ?? '默认',
    azure: azure
      ? {
          voice,
          styleSource: azure.styleSource,
          styleSemanticValue: azure.styleSemanticValue,
          style: azure.style,
          styleDegree: azure.styleDegree,
          temperature: azure.temperature,
          supportLevel: azure.supportLevel,
          variance: azure.variance,
          ratePct: azure.ratePct,
          pitchPct: azure.pitchPct,
          keepLeadingSilence: azure.keepLeadingSilence,
          keepTrailingSilence: azure.keepTrailingSilence
        }
      : null,
    wan: wan
      ? {
          emotionAppliedToVisual: wan.emotionAppliedToVisual,
          stanceAppliedToVisual: wan.stanceAppliedToVisual,
          expressionAppliedToVisual: wan.expressionAppliedToVisual,
          cameraPolicy: wan.cameraPolicy,
          continuityMode: wan.continuityMode,
          previousEmotion: wan.previousEmotion,
          audioDrivenDialogue: wan.audioDrivenDialogue,
          seed: wan.seed,
          negativePrompt: wan.negativePrompt,
          promptSuffix: wan.promptSuffix
        }
      : null
  };
}
