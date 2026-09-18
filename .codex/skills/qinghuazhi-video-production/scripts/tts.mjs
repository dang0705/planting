import './env.mjs';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { duration, detectSilence, escapeXml } from './utils.mjs';

let voiceCatalogPromise = null;

function azureCredentials() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    const missing = [
      !key ? 'AZURE_SPEECH_KEY' : null,
      !region ? 'AZURE_SPEECH_REGION' : null
    ].filter(Boolean);

    throw new Error(
      `缺少 Azure Speech 环境变量：${missing.join(', ')}。` +
      '请在项目根目录 .env.local 中配置，或在当前 shell export。'
    );
  }

  return { key, region };
}

export async function getAzureVoiceCatalog() {
  if (voiceCatalogPromise) return voiceCatalogPromise;

  voiceCatalogPromise = (async () => {
    const { key, region } = azureCredentials();
    const response = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Azure Voice Catalog 失败：${response.status} ${await response.text()}`
      );
    }

    const voices = await response.json();
    return new Map(
      voices.map(voice => [voice.ShortName, voice])
    );
  })();

  try {
    return await voiceCatalogPromise;
  } catch (error) {
    voiceCatalogPromise = null;
    throw error;
  }
}

export async function getAzureVoiceProfile(voiceName) {
  const catalog = await getAzureVoiceCatalog();
  const profile = catalog.get(voiceName);

  if (!profile) {
    throw new Error(`Azure Voice Catalog 中找不到：${voiceName}`);
  }

  return profile;
}

function buildVoiceParameters(performance) {
  if (performance?.temperature == null) {
    return '';
  }

  const temperature = Number(performance.temperature);

  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 1
  ) {
    throw new Error(
      `Azure HD temperature 必须在 0~1：${performance.temperature}`
    );
  }

  return ` parameters="temperature=${temperature}"`;
}

export function buildAzureSsml({ text, voice, performance = null }) {
  const escapedText = escapeXml(text);
  const prosody = performance
    ? `<prosody rate="${performance.rateSsml}" pitch="${performance.pitchSsml}">${escapedText}</prosody>`
    : escapedText;

  const expressive = performance?.style
    ? `<mstts:express-as style="${performance.style}" styledegree="${performance.styleDegree}">${prosody}</mstts:express-as>`
    : prosody;

  const voiceParameters =
    buildVoiceParameters(performance);

  return [
    '<speak version="1.0"',
    ' xmlns="http://www.w3.org/2001/10/synthesis"',
    ' xmlns:mstts="https://www.w3.org/2001/mstts"',
    ' xml:lang="zh-CN">',
    `<voice name="${escapeXml(voice)}"${voiceParameters}>${expressive}</voice>`,
    '</speak>'
  ].join('');
}

export async function generateAzureTts({
  text,
  voice,
  output,
  performance = null
}) {
  const { key, region } = azureCredentials();
  const ssml = buildAzureSsml({
    text,
    voice,
    performance
  });

  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'qinghuazhi-video-v1'
      },
      body: ssml
    }
  );

  if (!response.ok) {
    throw new Error(
      `Azure TTS 失败：${response.status} ${await response.text()}`
    );
  }

  await writeFile(
    output,
    Buffer.from(await response.arrayBuffer())
  );

  return {
    ssml,
    style: performance?.style ?? null,
    styleDegree: performance?.styleDegree ?? null,
    temperature: performance?.temperature ?? null,
    ratePct: performance?.ratePct ?? 0,
    pitchPct: performance?.pitchPct ?? 0
  };
}

export function normalizeTts({
  input,
  output,
  keepLeading,
  keepTrailing,
  minimumDuration = 0
}) {
  const originalDuration = duration(input);
  const events = detectSilence(input);
  let leadingEnd = 0;
  let trailingStart = originalDuration;

  if (
    events[0]?.type === 'start' &&
    Math.abs(events[0].time) < 0.01 &&
    events[1]?.type === 'end'
  ) {
    leadingEnd = events[1].time;
  }

  for (let i = events.length - 1; i >= 1; i--) {
    if (
      events[i].type === 'end' &&
      Math.abs(events[i].time - originalDuration) < 0.05 &&
      events[i - 1]?.type === 'start'
    ) {
      trailingStart = events[i - 1].time;
      break;
    }
  }

  const trimStart = Math.max(0, leadingEnd - keepLeading);
  const trimEnd = Math.min(
    originalDuration,
    trailingStart + keepTrailing
  );
  const trimmedDuration = trimEnd - trimStart;
  const finalDuration = Math.max(
    trimmedDuration,
    minimumDuration
  );

  const filters = [
    `atrim=start=${trimStart}:end=${trimEnd}`,
    'asetpts=PTS-STARTPTS'
  ];

  if (finalDuration > trimmedDuration + 0.001) {
    filters.push(`apad=whole_dur=${finalDuration}`);
  }

  execFileSync('ffmpeg', [
    '-y',
    '-i', input,
    '-af', filters.join(','),
    '-t', String(finalDuration),
    '-c:a', 'pcm_s16le',
    output
  ], { stdio: 'ignore' });

  return {
    duration: duration(output),
    speechStart: keepLeading,
    speechEnd: Math.max(
      keepLeading,
      trimmedDuration - keepTrailing
    )
  };
}
