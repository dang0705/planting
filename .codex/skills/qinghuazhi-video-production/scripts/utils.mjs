import { execFileSync, execSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  unlinkSync,
  openSync,
  closeSync,
  writeFileSync
} from 'node:fs';

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function duration(path) {
  return Number(
    execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      path
    ], { encoding: 'utf8' }).trim()
  );
}

export function videoInfo(path) {
  return JSON.parse(
    execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,codec_name',
      '-of', 'json',
      path
    ], { encoding: 'utf8' })
  ).streams[0];
}

export function fpsOf(rate) {
  const [a, b] = rate.split('/').map(Number);
  return b ? a / b : a;
}

export function commandExists(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function ffmpegFull() {
  try {
    const prefix = execSync('brew --prefix ffmpeg-full', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return `${prefix}/bin/ffmpeg`;
  } catch {
    throw new Error('缺少 Homebrew ffmpeg-full（ASS 中文字幕需要 libass）');
  }
}

export function detectSilence(path, noise = '-50dB', minDuration = 0.12) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-i', path,
    '-af', `silencedetect=noise=${noise}:d=${minDuration}`,
    '-f', 'null',
    '-'
  ], { encoding: 'utf8' });

  const stderr = result.stderr ?? '';
  return [...stderr.matchAll(/silence_(start|end):\s*([\d.]+)/g)]
    .map(m => ({ type: m[1], time: Number(m[2]) }));
}

export function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function escapeAss(text) {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\N')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
}

export function acquireLock(path) {
  if (existsSync(path)) {
    try {
      const old = JSON.parse(readFileSync(path, 'utf8'));
      if (old.pid) {
        try {
          process.kill(old.pid, 0);
          throw new Error(`已有 Render 正在运行：PID ${old.pid}`);
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
      unlinkSync(path);
    } catch (error) {
      if (error.message?.startsWith('已有 Render')) throw error;
      try { unlinkSync(path); } catch {}
    }
  }

  const fd = openSync(path, 'wx');
  writeFileSync(fd, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString()
  }));
  closeSync(fd);

  return () => {
    try { unlinkSync(path); } catch {}
  };
}


export function sanitizeWanVideo({
  input,
  output,
  trimStartSec = 0
}) {
  const ffmpeg = ffmpegFull();
  const trim = Math.max(0, Number(trimStartSec) || 0);

  const filters = [
    trim > 0
      ? `trim=start=${trim}`
      : 'trim=start=0',
    'setpts=PTS-STARTPTS'
  ];

  execFileSync(ffmpeg, [
    '-y',
    '-i', input,
    '-map', '0:v:0',
    '-an',
    '-vf', filters.join(','),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-movflags', '+faststart',
    output
  ], { stdio: 'ignore' });

  return {
    trimStartSec: trim,
    duration: duration(output)
  };
}

export function prependAudioSilence({
  input,
  output,
  seconds
}) {
  const delayMs =
    Math.max(
      0,
      Math.round((Number(seconds) || 0) * 1000)
    );

  execFileSync('ffmpeg', [
    '-y',
    '-i', input,
    '-af', `adelay=${delayMs}:all=1`,
    '-c:a', 'pcm_s16le',
    output
  ], { stdio: 'ignore' });

  return {
    leadingSilenceSec: delayMs / 1000,
    duration: duration(output)
  };
}
