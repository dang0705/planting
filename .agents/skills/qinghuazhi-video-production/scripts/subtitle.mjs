import { writeFile } from 'node:fs/promises';
import { assTime, escapeAss } from './utils.mjs';

const POSITIONS = {
  '顶': { alignment: 8, ratio: 0.0365 },
  '偏顶部': { alignment: 8, ratio: 0.0938 },
  '中': { alignment: 5, ratio: 0 },
  '偏底部': { alignment: 2, ratio: 0.1094 },
  '底部': { alignment: 2, ratio: 0.0365 }
};

export async function createSubtitle({
  text,
  speechStart,
  speechEnd,
  positionName,
  output,
  project
}) {
  if (!text) return null;

  const position = POSITIONS[positionName];
  if (!position) throw new Error(`未知字幕位置：${positionName}`);

  const width = project.video.width;
  const height = project.video.height;
  const marginV = Math.round(height * position.ratio);

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${project.subtitle.font},${project.subtitle.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${project.subtitle.outline},0,${position.alignment},65,65,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${assTime(speechStart)},${assTime(speechEnd)},Default,,0,0,0,,${escapeAss(text)}
`;

  await writeFile(output, ass, 'utf8');
  return output;
}
