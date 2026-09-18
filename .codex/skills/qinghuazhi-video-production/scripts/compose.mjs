import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ffmpegFull, duration } from './utils.mjs';

export function composeShot({
  video,
  audio,
  subtitle,
  duration: shotDuration,
  output,
  project
}) {
  const ffmpeg = ffmpegFull();
  const args = ['-y', '-i', video];

  if (audio) {
    args.push('-i', audio);
  } else {
    args.push(
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
    );
  }

  args.push('-map', '0:v:0', '-map', '1:a:0');

  const filters = [
    `scale=${project.video.width}:${project.video.height}:force_original_aspect_ratio=increase`,
    `crop=${project.video.width}:${project.video.height}`,
    'setsar=1',
    `fps=${project.video.fps}`
  ];

  if (subtitle) {
    filters.push(`ass=${subtitle}`);
  }

  args.push(
    '-vf', filters.join(','),
    '-t', String(shotDuration),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    output
  );

  execFileSync(ffmpeg, args, { stdio: 'ignore' });
}

export async function concatShots({
  shots,
  output,
  workDir,
  project
}) {
  const ffmpeg = ffmpegFull();

  if (!shots.length) {
    throw new Error('没有 Shot 可合成');
  }

  if (shots.length === 1) {
    execFileSync(ffmpeg, [
      '-y',
      '-i', shots[0].path,
      '-c', 'copy',
      output
    ], { stdio: 'ignore' });
    return;
  }

  const hasLight =
    shots.slice(0, -1).some(
      shot => shot.transitionAfter === '轻柔'
    );

  // 全部硬切时继续使用最稳定、最快的 concat demuxer。
  if (!hasLight) {
    const concatPath =
      resolve(workDir, 'concat.txt');

    await writeFile(
      concatPath,
      shots
        .map(shot => `file '${resolve(shot.path)}'`)
        .join('\n'),
      'utf8'
    );

    execFileSync(ffmpeg, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatPath,
      '-c', 'copy',
      output
    ], { stdio: 'ignore' });

    return;
  }

  const fade =
    project.transitions?.lightDurationSec ??
    0.18;

  const args = ['-y'];

  for (const shot of shots) {
    args.push('-i', shot.path);
  }

  const filters = [];

  for (let i = 0; i < shots.length; i++) {
    filters.push(
      `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[v${i}]`
    );
    filters.push(
      `[${i}:a]asetpts=PTS-STARTPTS[a${i}]`
    );
  }

  let currentV = 'v0';
  let currentA = 'a0';
  let currentDuration = duration(shots[0].path);

  for (let i = 1; i < shots.length; i++) {
    const previousTransition =
      shots[i - 1].transitionAfter;

    const nextV = `mixv${i}`;
    const nextA = `mixa${i}`;
    const nextDuration = duration(shots[i].path);

    if (previousTransition === '轻柔') {
      const d = Math.min(
        fade,
        Math.max(0.05, currentDuration / 3),
        Math.max(0.05, nextDuration / 3)
      );

      const offset =
        Math.max(0, currentDuration - d);

      filters.push(
        `[${currentV}][v${i}]xfade=transition=fade:duration=${d}:offset=${offset}[${nextV}]`
      );

      filters.push(
        `[${currentA}][a${i}]acrossfade=d=${d}:c1=tri:c2=tri[${nextA}]`
      );

      currentDuration =
        currentDuration + nextDuration - d;
    } else {
      filters.push(
        `[${currentV}][${currentA}][v${i}][a${i}]concat=n=2:v=1:a=1[${nextV}][${nextA}]`
      );

      currentDuration += nextDuration;
    }

    currentV = nextV;
    currentA = nextA;
  }

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map', `[${currentV}]`,
    '-map', `[${currentA}]`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    output
  );

  execFileSync(ffmpeg, args, { stdio: 'ignore' });
}
