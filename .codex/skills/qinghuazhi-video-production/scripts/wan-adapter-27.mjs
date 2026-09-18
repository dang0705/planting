export function buildWan27Request({
  imageUrl,
  audioUrl = null,
  prompt,
  negativePrompt = '',
  seed = null,
  duration,
  resolution
}) {
  const media = [
    {
      type: 'first_frame',
      url: imageUrl
    }
  ];

  if (audioUrl) {
    media.push({
      type: 'driving_audio',
      url: audioUrl
    });
  }

  const input = {
    prompt,
    media
  };

  if (negativePrompt) {
    input.negative_prompt =
      negativePrompt;
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

  return {
    input,
    parameters,
    usesOssResource:
      Boolean(audioUrl)
  };
}
