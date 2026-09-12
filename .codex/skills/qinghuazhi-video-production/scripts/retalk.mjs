import './env.mjs';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { duration, videoInfo, fpsOf } from './utils.mjs';

function upload(path) {
  const result = execFileSync(
    'dashscope',
    ['oss.upload', '--model', 'videoretalk', '--file', path],
    { encoding: 'utf8' }
  );

  const match = result.match(/Uploaded oss url:\s*(oss:\/\/\S+)/);
  if (!match) throw new Error(`VideoRetalk 临时上传失败：\n${result}`);
  return match[1];
}

function gate(videoPath, audioPath) {
  const vd = duration(videoPath);
  const ad = duration(audioPath);
  const info = videoInfo(videoPath);
  const fps = fpsOf(info.r_frame_rate);

  if (vd <= 2 || vd >= 120) throw new Error(`VideoRetalk 视频时长不合法：${vd}s`);
  if (ad <= 2 || ad >= 120) throw new Error(`VideoRetalk 音频时长不合法：${ad}s`);
  if (vd + 0.001 < ad) throw new Error('VideoRetalk 视频短于音频；禁止自动 video_extension');
  if (Math.min(info.width, info.height) < 640 || Math.max(info.width, info.height) > 2048) {
    throw new Error(`VideoRetalk 视频尺寸不合法：${info.width}x${info.height}`);
  }
  if (fps < 15 || fps > 60) throw new Error(`VideoRetalk 帧率不合法：${fps}`);
  if (!['h264', 'hevc'].includes(info.codec_name)) {
    throw new Error(`VideoRetalk 编码不合法：${info.codec_name}`);
  }
}

export async function runVideoRetalk({ videoPath, audioPath, output }) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('缺少 DASHSCOPE_API_KEY');

  gate(videoPath, audioPath);

  const videoUrl = upload(videoPath);
  const audioUrl = upload(audioPath);

  const create = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable'
      },
      body: JSON.stringify({
        model: 'videoretalk',
        input: {
          video_url: videoUrl,
          audio_url: audioUrl
        },
        parameters: {
          video_extension: false
        }
      })
    }
  );

  const created = await create.json();
  if (!create.ok) throw new Error(`VideoRetalk 创建失败：${create.status}\n${JSON.stringify(created, null, 2)}`);

  const taskId = created.output?.task_id;
  if (!taskId) throw new Error('VideoRetalk 未返回 task_id');

  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 10000));

    const response = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const result = await response.json();

    if (!response.ok) throw new Error(`VideoRetalk 查询失败：${response.status}`);
    if (result.output?.task_status === 'FAILED') {
      throw new Error(`VideoRetalk 失败：${JSON.stringify(result.output, null, 2)}`);
    }

    if (result.output?.task_status === 'SUCCEEDED') {
      const url = result.output?.video_url;
      const download = await fetch(url);
      if (!download.ok) throw new Error(`VideoRetalk 下载失败：${download.status}`);
      await writeFile(output, Buffer.from(await download.arrayBuffer()));
      return { taskId };
    }
  }

  throw new Error('VideoRetalk 等待超时');
}
