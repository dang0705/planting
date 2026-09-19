export function buildLegacyWanRequest({
  profile,
  imageUrl,
  audioUrl = null,
  prompt,
  negativePrompt = '',
  seed = null,
  duration,
  resolution
}) {
  const input = {
    prompt,
    img_url: imageUrl
  };

  if (negativePrompt) {
    input.negative_prompt =
      negativePrompt;
  }

  if (audioUrl) {
    input.audio_url =
      audioUrl;
  }

  const parameters = {
    resolution,
    duration,
    prompt_extend: false,
    watermark: false
  };

  if (seed != null) {
    parameters.seed =
      Number(seed);
  }

  // Wan2.6 Flash 的 silent 付费 fallback 必须明确 audio=false，
  // 否则可能进入带声音计费路径。
  if (
    profile.model ===
      'wan2.6-i2v-flash' &&
    !audioUrl
  ) {
    parameters.audio = false;
  }

  return {
    input,
    parameters,
    usesOssResource:
      Boolean(audioUrl)
  };
}
